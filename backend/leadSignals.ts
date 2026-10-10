/**
 * DentaCRM sotuv lidlari bo'yicha Meta'ga server tomondan signal yuborish
 * (Conversions API). Maqsad — reklama puli keraksiz odamga ketmasligi:
 *
 *   CrmContact    — bu odam bizda allaqachon bor (ariza qoldirgan yoki mijoz).
 *                   Ads Manager'da shu hodisa bo'yicha BITTA auditoriya tuziladi
 *                   va reklamadan chiqarib tashlanadi; keyin u o'zi to'lib boradi.
 *   Lead          — SOTUVCHI TASDIQLAGAN lid. Reklama shu hodisaga optimizatsiya qilinadi, auditoriya
 *                   qo'yilmagan (Advantage+) kampaniyada esa Meta kimni qidirishini aynan shu
 *                   hodisa belgilaydi. Odamning o'zi bosadigan hech narsa (ism-raqam yozish,
 *                   formadagi istalgan savolga javob) lid EMAS — uni istagan odam o'ylamay
 *                   bosib yuboradi va Meta aynan shundaylarni ko'paytiradi. Lead ketadi:
 *                     · sotuvchi lidni "Bog'lashildi", "O'ylamoqda" yoki "Oldi"ga o'tkazganda;
 *                     · yoki saytdagi to'liq forma (klinika nomi, shahar, shifokorlar soni) to'ldirilganda.
 *                   "Bekor"ga o'tgan lid uchun hech qachon ketmaydi. Meta'da "yomon lid" degan
 *                   signal yo'q — bekor qilish unga hech narsa demaydi; faqat yaxshisini aytish mumkin.
 *   QualifiedLead — sotuvchi lidni "O'ylamoqda" yoki "Oldi" ustuniga o'tkazdi.
 *   ClinicWon     — lid "Oldi" ustuniga o'tdi.
 *
 * Token ulanmagan bo'lsa hech narsa yuborilmaydi va hech narsa buzilmaydi.
 * Bu yerdagi funksiyalar hech qachon xato otmaydi: Meta ishlamay qolgani uchun
 * ariza saqlanmay qolishi mumkin emas.
 *
 * Lidga tegishli reklama belgilari (fbc/fbp) va "qaysi hodisa yuborilgan"
 * ro'yxati PlatformSetting'da `demo_meta:<lidId>` kaliti ostida turadi —
 * DemoRequest jadvaliga yangi ustun kerak emas.
 */

import crypto from 'crypto';
import net from 'net';

const GRAPH_URL = 'https://graph.facebook.com/v25.0';
export const META_PIXEL_ID = process.env.META_PIXEL_ID || '2295495467915150';

const TOKEN_KEY = 'meta_capi_token';
const LAST_RESULT_KEY = 'meta_capi_last';
const leadMetaKey = (leadId: string) => `demo_meta:${leadId}`;

const SITE_URL = 'https://dentacrm.uz/';
const OUR_HOSTS = /(^|\.)dentacrm\.uz$|^localhost$/;
const MAX_EVENTS_PER_REQUEST = 500;
const MAX_URL_LENGTH = 200;

// Ochiq formani kimdir skript bilan to'ldirsa ham Meta'ga ketadigan signal cheklangan.
// Haqiqiy oqim kuniga o'nlab ariza — soatiga 60 tadan oshishi suiiste'mol belgisi.
// Chegaradan oshganda ariza baribir saqlanadi, faqat Meta'ga xabar ketmaydi.
const FORM_SIGNALS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

/** Sotuvchi gaplashib, bekor qilmagan lid — Meta uchun "Lead". */
const LEAD_STATUSES = ['Contacted', 'Thinking', 'Booked'];
// Meta hodisa vaqtini ko'pi bilan 7 kun orqaga qabul qiladi
const MAX_EVENT_AGE_MS = 6.5 * 24 * 60 * 60 * 1000;

/** Shu ustunlarga o'tgan lid — haqiqiy klinika, sotuvchi u bilan gaplashgan. */
export const QUALIFIED_STATUSES = ['Thinking', 'Booked'];
const WON_STATUS = 'Booked';

type ActionSource = 'website' | 'phone_call' | 'system_generated' | 'other';

export interface LeadTrack {
    eventId: string | null;
    fbp: string | null;
    fbc: string | null;
    url: string;
}

interface EventInput {
    name: string;
    id: string;
    source: ActionSource;
    phone?: string | null;
    fbc?: string | null;
    fbp?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    url?: string;
    /** Hodisa aslida qachon bo'lgan (standart — hozir). */
    at?: Date;
}

interface Deps {
    db: any;
    getSetting: (key: string) => Promise<string | null>;
    setSetting: (key: string, value: string | null) => Promise<void>;
    /** axios bilan mos: post(url, body, config) */
    http: { post: (url: string, body: any, config?: any) => Promise<any> };
    now?: () => Date;
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Meta raqamni faqat xeshlangan holda qabul qiladi: davlat kodi bilan, faqat raqamlar. */
export const hashPhone = (phone: unknown): string | null => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 9) return null;
    // Bazada ba'zi klinikalar raqami kodsiz yozilgan: 90 123 45 67
    return sha256(digits.length === 9 ? `998${digits}` : digits);
};

const pick = (value: unknown, pattern: RegExp): string | null =>
    typeof value === 'string' && pattern.test(value) ? value : null;

const cleanUrl = (value: unknown): string => {
    try {
        const url = new URL(String(value));
        const isOurs = /^https?:$/.test(url.protocol) && OUR_HOSTS.test(url.hostname);
        // So'rov parametrlari tashlab yuboriladi — ular Meta'ga kerak emas
        const clean = `${url.origin}${url.pathname}`;
        return isOurs && clean.length <= MAX_URL_LENGTH ? clean : SITE_URL;
    } catch {
        return SITE_URL;
    }
};

/** Ochiq formadan kelgan kuzatuv ma'lumotini tozalaydi: mos kelmagani tashlanadi. */
export const cleanTrack = (raw: any): LeadTrack => ({
    eventId: pick(raw?.eventId, /^[A-Za-z0-9_-]{8,64}$/),
    fbp: pick(raw?.fbp, /^fb\.\d\.\d{6,20}\.\d{1,30}$/),
    fbc: pick(raw?.fbc, /^fb\.\d\.\d{6,20}\.[A-Za-z0-9_-]{1,500}$/),
    url: cleanUrl(raw?.url),
});

const buildEvent = (input: EventInput, at: Date): any | null => {
    const user: Record<string, unknown> = {};
    const phoneHash = hashPhone(input.phone);
    if (phoneHash) user.ph = [phoneHash];
    if (input.fbc) user.fbc = input.fbc;
    if (input.fbp) user.fbp = input.fbp;
    // IP so'rov sarlavhasidan olinadi — yaroqsiz qiymat butun hodisani Meta'da rad ettirardi
    if (input.ip && net.isIP(input.ip)) user.client_ip_address = input.ip;
    if (input.userAgent) user.client_user_agent = input.userAgent;
    // Odamni tanib bo'lmaydigan hodisa Meta'ga foydasiz
    if (!user.ph && !user.fbc && !user.fbp) return null;

    // Meta sayt hodisasi uchun brauzer nomini talab qiladi
    const source: ActionSource = input.source === 'website' && !input.userAgent ? 'other' : input.source;
    return {
        event_name: input.name,
        event_time: Math.floor(at.getTime() / 1000),
        event_id: input.id,
        action_source: source,
        ...(source === 'website' ? { event_source_url: input.url || SITE_URL } : {}),
        user_data: user,
    };
};

const parseJson = (raw: string | null): any => {
    try {
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export function createLeadSignals(deps: Deps) {
    const now = () => (deps.now ? deps.now() : new Date());
    const getToken = async (): Promise<string | null> =>
        process.env.META_CAPI_TOKEN || (await deps.getSetting(TOKEN_KEY)) || null;

    /** Meta'ga yuboradi. Xato bo'lsa matnini qaytaradi; token jurnalga hech qachon tushmaydi. */
    const post = async (token: string, events: any[]): Promise<string | null> => {
        try {
            for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
                await deps.http.post(
                    `${GRAPH_URL}/${META_PIXEL_ID}/events`,
                    { data: events.slice(i, i + MAX_EVENTS_PER_REQUEST), access_token: token },
                    { timeout: 15000 }
                );
            }
            return null;
        } catch (err: any) {
            return String(err?.response?.data?.error?.message || err?.message || 'Noma\'lum xato').slice(0, 300);
        }
    };

    const send = async (inputs: EventInput[]): Promise<boolean> => {
        try {
            const at = now();
            const events = inputs.map(e => buildEvent(e, e.at || at)).filter(Boolean);
            const token = await getToken();
            if (!token || events.length === 0) return false;

            const error = await post(token, events);
            if (error) console.error('[leadSignals] Meta qabul qilmadi:', error);
            await deps.setSetting(LAST_RESULT_KEY, JSON.stringify({
                at: at.toISOString(), ok: !error, error, events: events.map((e: any) => e.event_name),
            }));
            return !error;
        } catch (err: any) {
            console.error('[leadSignals] yuborilmadi:', err?.message || err);
            return false;
        }
    };

    const loadContactEvents = async (): Promise<EventInput[]> => {
        const leads: any[] = await deps.db.demoRequest.findMany({ select: { phone: true } });
        const clinics: any[] = await deps.db.clinic.findMany({ select: { phone: true, ownerPhone: true } });
        const hashes = new Map<string, string>();
        for (const phone of [...leads.map(l => l.phone), ...clinics.flatMap(c => [c.phone, c.ownerPhone])]) {
            const hash = hashPhone(phone);
            if (hash) hashes.set(hash, phone);
        }
        // Oy qo'shilgani uchun har oyda qayta yuborilganda Meta uni yangi hodisa deb oladi —
        // auditoriya 180 kundan keyin bo'shab qolmaydi.
        const month = now().toISOString().slice(0, 7);
        return [...hashes.entries()].map(([hash, phone]) => ({
            name: 'CrmContact', id: `contact-${hash.slice(0, 16)}-${month}`, source: 'system_generated' as ActionSource, phone,
        }));
    };

    let formSignalTimes: number[] = [];
    const allowFormSignal = (): boolean => {
        const at = now().getTime();
        formSignalTimes = formSignalTimes.filter(t => at - t < HOUR_MS);
        if (formSignalTimes.length >= FORM_SIGNALS_PER_HOUR) return false;
        formSignalTimes.push(at);
        return true;
    };

    /** Lid bo'yicha qaysi hodisalar ketganini eslab qoladi — har biri bir marta ketsin. */
    const markSent = async (leadId: string, names: string[]): Promise<void> => {
        const meta = parseJson(await deps.getSetting(leadMetaKey(leadId)));
        const sent: string[] = Array.isArray(meta.sent) ? meta.sent : [];
        await deps.setSetting(leadMetaKey(leadId), JSON.stringify({ ...meta, sent: [...new Set([...sent, ...names])] }));
    };

    return {
        /**
         * Ishonchli manbadan (Facebook lid formasi, tashqi manba kaliti) yangi lid keldi.
         * U ham darhol "bizda bor" deb bildiriladi — oylik yangilanishni kutmaydi.
         */
        async contactAdded(phone: string): Promise<void> {
            try {
                const hash = hashPhone(phone);
                if (hash) await send([{ name: 'CrmContact', id: `contact-${hash.slice(0, 16)}-${now().getTime()}`, source: 'system_generated', phone }]);
            } catch (err: any) {
                console.error('[leadSignals] contactAdded:', err?.message || err);
            }
        },

        /** Ochiq forma yuborildi (reklama sahifasi yoki sayt). */
        async formSubmitted(input: {
            leadId: string; isNew: boolean; phone: string;
            /** Forma o'zi klinikani tasdiqlaydi (saytdagi to'liq forma). Reklama formasida — false. */
            confirmed?: boolean;
            track: LeadTrack; ip?: string | null; userAgent?: string | null;
        }): Promise<void> {
            try {
                const { track } = input;
                const eventId = track.eventId || crypto.randomUUID();
                const base = { source: 'website' as ActionSource, phone: input.phone, fbc: track.fbc, fbp: track.fbp, ip: input.ip, userAgent: input.userAgent, url: track.url };

                // Reklama belgilari token hali ulanmagan bo'lsa ham saqlanadi: sotuvchi lidni
                // keyin tasdiqlaganda Meta uni qaysi reklamadan va qaysi sahifadan kelganini bilishi kerak.
                if (input.isNew) {
                    await deps.setSetting(leadMetaKey(input.leadId), JSON.stringify({
                        fbc: track.fbc, fbp: track.fbp, ua: input.userAgent || null, url: track.url,
                    }));
                }

                if (!allowFormSignal()) return;

                const events: EventInput[] = [{ ...base, name: 'CrmContact', id: `${eventId}-c` }];
                // Reklama formasidan (faqat ism va telefon) kelgan ariza bu yerda hali lid emas
                const isLead = input.isNew && !!input.confirmed;
                if (isLead) events.push({ ...base, name: 'Lead', id: `${input.leadId}-Lead` });
                const ok = await send(events);
                if (ok && isLead) await markSent(input.leadId, ['Lead']);
            } catch (err: any) {
                console.error('[leadSignals] formSubmitted:', err?.message || err);
            }
        },

        /** Kanbanda lid boshqa ustunga o'tdi. Har bir hodisa bitta lid uchun bir marta ketadi. */
        async stageChanged(leadId: string, status: string): Promise<void> {
            try {
                if (!LEAD_STATUSES.includes(status) || !(await getToken())) return;

                const lead = await deps.db.demoRequest.findUnique({ where: { id: leadId }, select: { id: true, phone: true, createdAt: true } });
                if (!lead) return;

                const meta = parseJson(await deps.getSetting(leadMetaKey(leadId)));
                const sent: string[] = Array.isArray(meta.sent) ? meta.sent : [];
                const wanted = [
                    'Lead',
                    ...(QUALIFIED_STATUSES.includes(status) ? ['QualifiedLead'] : []),
                    ...(status === WON_STATUS ? ['ClinicWon'] : []),
                ];
                const names = wanted.filter(name => !sent.includes(name));
                if (names.length === 0) return;

                // Lead — saytdagi arizaning o'zi, faqat sotuvchi tekshirgandan keyin xabar qilinadi:
                // shuning uchun sayt hodisasi sifatida, ariza qoldirilgan vaqt bilan ketadi
                // (reklama kampaniyasi "saytdan lid"ni sanaydi). Qolganlari — qo'ng'iroq natijasi.
                const submittedAt = new Date(lead.createdAt);
                const isFresh = now().getTime() - submittedAt.getTime() < MAX_EVENT_AGE_MS;
                const ok = await send(names.map(name => name === 'Lead'
                    ? {
                        name, id: `${leadId}-Lead`, source: 'website' as ActionSource,
                        phone: lead.phone, fbc: meta.fbc, fbp: meta.fbp,
                        userAgent: meta.ua, url: meta.url, at: isFresh ? submittedAt : undefined,
                    }
                    : {
                        name, id: `${leadId}-${name}`, source: 'phone_call' as ActionSource,
                        phone: lead.phone, fbc: meta.fbc, fbp: meta.fbp,
                    }));
                if (ok) await deps.setSetting(leadMetaKey(leadId), JSON.stringify({ ...meta, sent: [...sent, ...names] }));
            } catch (err: any) {
                console.error('[leadSignals] stageChanged:', err?.message || err);
            }
        },

        async leadDeleted(leadId: string): Promise<void> {
            try {
                await deps.setSetting(leadMetaKey(leadId), null);
            } catch (err: any) {
                console.error('[leadSignals] leadDeleted:', err?.message || err);
            }
        },

        /** Bazadagi barcha lidlar va klinikalarni "bizda bor" deb Meta'ga bildiradi. */
        async syncContacts(): Promise<number> {
            try {
                const events = await loadContactEvents();
                return (await send(events)) ? events.length : 0;
            } catch (err: any) {
                console.error('[leadSignals] syncContacts:', err?.message || err);
                return 0;
            }
        },

        async status(): Promise<{ connected: boolean; pixelId: string; last: any }> {
            const last = parseJson(await deps.getSetting(LAST_RESULT_KEY));
            return { connected: !!(await getToken()), pixelId: META_PIXEL_ID, last: last.at ? last : null };
        },

        /**
         * Tokenni tekshirib saqlaydi. Tekshiruv — haqiqiy ish: mavjud lidlar va
         * klinikalar Meta'ga yuboriladi. Meta rad etsa, token saqlanmaydi.
         */
        async saveToken(raw: unknown): Promise<{ ok: boolean; error?: string; synced?: number }> {
            const token = typeof raw === 'string' ? raw.trim() : '';
            if (!/^[A-Za-z0-9_|-]{20,600}$/.test(token)) {
                return { ok: false, error: 'Token noto\'g\'ri ko\'rinishda. Events Manager\'dan to\'liq nusxa oling.' };
            }
            try {
                const at = now();
                const events = (await loadContactEvents()).map(e => buildEvent(e, at)).filter(Boolean);
                const error = events.length ? await post(token, events) : null;
                if (error) return { ok: false, error: `Meta tokenni qabul qilmadi: ${error}` };

                await deps.setSetting(TOKEN_KEY, token);
                await deps.setSetting(LAST_RESULT_KEY, JSON.stringify({ at: at.toISOString(), ok: true, error: null, events: ['CrmContact'] }));
                return { ok: true, synced: events.length };
            } catch (err: any) {
                console.error('[leadSignals] saveToken:', err?.message || err);
                return { ok: false, error: 'Tokenni saqlab bo\'lmadi.' };
            }
        },

        async clearToken(): Promise<void> {
            await deps.setSetting(TOKEN_KEY, null);
            await deps.setSetting(LAST_RESULT_KEY, null);
        },
    };
}
