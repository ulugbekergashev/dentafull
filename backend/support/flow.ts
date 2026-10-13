// ─── Suhbat oqimi (foydalanuvchi tomoni) ─────────────────────────────────────
// Kelgan xabar → javob. Telegram'ni bilmaydi: xabar yuborish `Messenger`
// orqali, shuning uchun testlarda soxta messenger bilan to'liq tekshiriladi.
//
// Bitta savolning yo'li:
//   1. Xabar bazaga `pending` bo'lib yoziladi (enqueue) — deployda yo'qolmaydi.
//   2. Bir necha soniya kutiladi: odamlar bitta savolni 3-4 ta qisqa xabar
//      qilib yozadi, ular bitta savol sifatida o'qiladi.
//   3. brain javob tayyorlaydi → rejimga qarab:
//        auto     — foydalanuvchiga yuboriladi;
//        draft    — operatorga qoralama bo'lib boradi, u bir tugma bilan yuboradi;
//        escalate — operatorga uzatiladi, foydalanuvchiga shu aytiladi.

import type { CallMeta } from '../aiService';
import type { Actions, PreparedReset } from './actions';
import type { Billing } from './billing';
import type { Brain, BrainResult, Proposal } from './brain';
import type { Identity, SupportUserRow } from './identity';
import { canActAsOwner, isLinked } from './identity';
import type { SupportLang } from './productMap';
import type { SettingsStore, SupportSettings } from './settings';
import { BTN, T, roleLabel } from './texts';
import { cut, ddmmyyyy, detectLang, safeJson, tashkentHour } from './text';
import type { Tickets } from './tickets';

export interface InlineButton { text: string; data?: string; url?: string }
export interface SendOpts {
    buttons?: InlineButton[][];
    /** Pastdagi doimiy menyu: ulangan foydalanuvchiga 'menu', ulanmaganga 'contact' */
    keyboard?: 'menu' | 'contact';
    html?: boolean;
    replyTo?: number;
    lang?: SupportLang;
}
export interface Messenger {
    /** Xabar yuboradi; yuborilgan xabar raqamini qaytaradi (yetkazib bo'lmasa — null) */
    send(chatId: string, text: string, opts?: SendOpts): Promise<number | null>;
    sendFile(chatId: string, kind: 'photo' | 'document', fileId: string, caption?: string, opts?: SendOpts): Promise<number | null>;
    editButtons(chatId: string, messageId: number, buttons: InlineButton[][] | null): Promise<void>;
    typing(chatId: string): Promise<void>;
}

/** Operator tomoni (operator.ts) — flow undan faqat shularni chaqiradi */
export interface OperatorPort {
    /** true — karta operator chatiga yetib bordi (chat ulanmagan yoki yetkazib bo'lmasa false) */
    draftCard(ticket: any, user: SupportUserRow, question: string, draft: any, result: BrainResult): Promise<boolean>;
    escalationCard(ticket: any, user: SupportUserRow, question: string, why: string, summary: string, files: { kind: 'photo' | 'document'; fileId: string }[]): Promise<boolean>;
    relay(ticket: any, user: SupportUserRow, text: string, files: { kind: 'photo' | 'document'; fileId: string }[]): Promise<boolean>;
    ownerResetCard(action: any, user: SupportUserRow, clinicName: string): Promise<boolean>;
    receiptCard(action: any, user: SupportUserRow, kind: 'photo' | 'document', fileId: string): Promise<boolean>;
}

export interface FlowDeps {
    db: any;
    identity: Identity;
    tickets: Tickets;
    brain: Brain;
    actions: Actions;
    billing: Billing;
    settings: SettingsStore;
    messenger: Messenger;
    operator: () => OperatorPort;
    logAi?: (entry: any) => Promise<any>;
    /** Qisqa xabarlarni bitta savolga yig'ish uchun kutish (ms) */
    debounceMs?: number;
    /** Operator chatiga xabar yetmadi (chat ulanmagan, guruh o'zgargan yoki bot chiqarib yuborilgan) */
    onOperatorUnreachable?: (what: string) => void;
}

/** Operatorga ham, foydalanuvchiga ham kerak bo'ladigan javob to'plami (qoralamada saqlanadi) */
export interface AnswerPayload {
    reply: string;
    attachments: string[];
    buttons: { text: string; url: string }[];
    proposals: Proposal[];
    category: string;
    articleIds: string[];
}

const payloadOf = (r: BrainResult): AnswerPayload => ({
    // Qoralama meta'si 4000 belgi bilan cheklanadi: uzun ro'yxat JSON'ni buzmasin
    reply: r.reply, attachments: r.attachments.slice(0, 2).map(a => cut(a, 1200)), buttons: r.buttons,
    proposals: r.proposals, category: r.category, articleIds: r.articleIds,
});

/** Bir chatdan soatiga qabul qilinadigan xabarlar va tayyorlanadigan javoblar */
export const MESSAGES_PER_HOUR = { linked: 120, stranger: 30 };
export const ANSWERS_PER_HOUR = { linked: 40, stranger: 8 };
/** Menyu tugmalari, kontakt, chek va boshqa amallar (soatiga) */
export const ACTIONS_PER_HOUR = { linked: 40, stranger: 12 };

export const createFlow = (deps: FlowDeps) => {
    const { db, identity, tickets, brain, actions, billing, settings, messenger } = deps;
    const debounceMs = deps.debounceMs ?? 5000;
    const timers = new Map<string, NodeJS.Timeout>();
    const chains = new Map<string, Promise<void>>();

    // Bitta chatdan keladigan bosim chegarasi (soatiga). Botga Telegram'dagi
    // istalgan odam yoza oladi: chegarasiz qolsa bitta odam AI limitini yeb
    // qo'yishi va operator chatini kartalar bilan to'ldirishi mumkin.
    // Xotirada — deployda nolga tushadi, bu yetarli.
    const HOUR_MS = 60 * 60 * 1000;
    const buckets = new Map<string, { count: number; resetAt: number }>();
    const allow = (key: string, limit: number): boolean => {
        const now = Date.now();
        const b = buckets.get(key);
        if (!b || now > b.resetAt) {
            if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
            buckets.set(key, { count: 1, resetAt: now + HOUR_MS });
            return true;
        }
        return ++b.count <= limit;
    };

    const clinicName = async (clinicId?: string | null): Promise<string> => {
        if (!clinicId) return '';
        const c = await db.clinic.findUnique({ where: { id: clinicId }, select: { name: true } }).catch(() => null);
        return c?.name || '';
    };

    const keyboardFor = (u: SupportUserRow | null): 'menu' | 'contact' => (isLinked(u) ? 'menu' : 'contact');

    const say = (u: SupportUserRow, text: string, opts: SendOpts = {}) =>
        messenger.send(u.chatId, text, { lang: u.lang, keyboard: keyboardFor(u), ...opts });

    const withinWorkHours = (s: SupportSettings) => {
        const h = tashkentHour();
        return h >= s.quietFrom && h < s.quietTo;
    };

    const api = {
        // ── Kirish nuqtalari ────────────────────────────────────────────────

        async onStart(chatId: string, tg: { name?: string; username?: string }, payload: string): Promise<void> {
            if (!allow(`start:${chatId}`, 30)) return;
            let user = await identity.touch(chatId, tg);
            if (payload && identity.isLinkPayload(payload)) {
                const linked = await identity.linkByCode(chatId, payload);
                if (!linked.ok) {
                    await say(user, T(user.lang).linkInvalid);
                    return;
                }
                user = linked.user;
                if (user.role === 'SUPER_ADMIN') {
                    await say(user, T(user.lang).linkedTeam);
                    return;
                }
                await say(user, T(user.lang).linkedOk(await clinicName(user.clinicId), roleLabel(user.role, user.lang)));
                return;
            }
            await say(user, isLinked(user) ? T(user.lang).welcomeLinked(user.staffName || '') : T(user.lang).welcomeUnlinked);
        },

        async onContact(chatId: string, tg: { name?: string; username?: string }, phone: string, isOwn: boolean): Promise<void> {
            const user = await identity.touch(chatId, tg);
            // Kontakt tekshiruvi butun bazani aylanadi — bir chatdan cheklangan
            if (!allow(`contact:${chatId}`, 10)) { await say(user, T(user.lang).tooMany); return; }
            if (!isOwn) {
                await say(user, T(user.lang).contactNotOwn);
                return;
            }
            const res = await identity.linkByContact(chatId, phone);
            if (res.ok) {
                await say(res.user, T(user.lang).linkedOk(res.clinicName, roleLabel(res.user.role, user.lang)));
            } else {
                await say(user, res.reason === 'keep_session' ? T(user.lang).keepSession : T(user.lang).contactNotFound);
            }
        },

        /** Matn, ovozdan olingan matn yoki fayl — hammasi shu yerdan navbatga tushadi */
        async enqueue(chatId: string, tg: { name?: string; username?: string }, msg: {
            kind: 'text' | 'voice' | 'photo' | 'document'; text?: string; fileId?: string; tgMessageId?: number;
        }): Promise<void> {
            const prev = await identity.getUser(chatId);
            // Chegaradan oshgan xabar bazaga ham yozilmaydi. Foydalanuvchi sababini bilsin:
            // soatiga bir marta qisqa eslatma (har xabarga javob berilsa chegara ma'nosini yo'qotadi)
            if (!allow(`in:${chatId}`, isLinked(prev) ? MESSAGES_PER_HOUR.linked : MESSAGES_PER_HOUR.stranger)) {
                if (allow(`limitnote:${chatId}`, 1)) await messenger.send(chatId, T(prev?.lang).tooMany, { lang: prev?.lang });
                return;
            }
            const lang = msg.text ? detectLang(msg.text, prev ? { lang: prev.lang, script: prev.script } : undefined) : undefined;
            await identity.touch(chatId, tg, lang);
            await tickets.addMessage({
                chatId, direction: 'in', author: 'user', kind: msg.kind,
                text: msg.text || null, fileId: msg.fileId || null, state: 'pending', tgMessageId: msg.tgMessageId ?? null,
            });
            api.schedule(chatId);
        },

        schedule(chatId: string, delay = debounceMs): void {
            const old = timers.get(chatId);
            if (old) clearTimeout(old);
            const timer = setTimeout(() => {
                timers.delete(chatId);
                void api.run(chatId);
            }, delay);
            timer.unref?.();
            timers.set(chatId, timer);
        },

        /** Bir chat uchun ishlov ketma-ket boradi: ikki javob bir-birining ustiga chiqmaydi */
        run(chatId: string): Promise<void> {
            const next = (chains.get(chatId) || Promise.resolve())
                .then(() => api.processChat(chatId))
                .catch((e: any) => console.error('[support] processChat:', e?.message || e));
            chains.set(chatId, next);
            void next.finally(() => { if (chains.get(chatId) === next) chains.delete(chatId); });
            return next;
        },

        // ── Asosiy ishlov ───────────────────────────────────────────────────

        async processChat(chatId: string): Promise<void> {
            const inbound = await tickets.claimInbound(chatId);
            if (!inbound.length) return;
            try {
                await api.handle(chatId, inbound);
                // "done" faqat javob/qoralama/uzatish yozilgandan KEYIN: ishlov o'rtada o'chib qolsa
                // xabar "processing" da turadi va keyingi ishga tushishda qayta olinadi.
                await tickets.finishInbound(inbound.map((m: any) => m.id), null, 'done');
            } catch (e: any) {
                // Xabar "ishlanmoqda" holatida qolib ketmasin (u faqat keyingi deployda
                // qayta ko'rilardi) va foydalanuvchi javobsiz qolmasin.
                console.error("[support] savolni ishlab bo'lmadi:", e?.message || e);
                await tickets.finishInbound(inbound.map((m: any) => m.id), null, 'failed').catch(() => { });
                const user = await identity.getUser(chatId).catch(() => null);
                if (user) await say(user, T(user.lang).retry).catch(() => { });
            }
        },

        async handle(chatId: string, inbound: any[]): Promise<void> {
            const ids = inbound.map((m: any) => m.id);
            const user = await identity.getUser(chatId);
            if (!user) return;

            const text = inbound.map((m: any) => m.text).filter(Boolean).join('\n').trim();
            const files = inbound.filter((m: any) => m.fileId && (m.kind === 'photo' || m.kind === 'document'))
                .map((m: any) => ({ kind: m.kind as 'photo' | 'document', fileId: m.fileId as string }));
            const s = await settings.get();
            const t = T(user.lang);

            // Rasm bor-u matn yo'q: model rasmni ko'rmaydi — nima muammoligini so'raymiz
            let ticket = await tickets.current(chatId);
            if (!text && files.length && ticket?.status !== 'human') {
                ticket = ticket || await tickets.ensure(chatId, user.clinicId || null, '[rasm]');
                await tickets.attachInbound(ids, ticket.id);
                await say(user, t.photoNoText, { buttons: [[{ text: BTN[user.lang].isReceipt, data: `rc:${inbound[inbound.length - 1].id}` }]] });
                return;
            }

            ticket = ticket || await tickets.ensure(chatId, user.clinicId || null, text);
            // Tarix joriy xabarlar murojaatga biriktirilishidan OLDIN o'qiladi:
            // joriy savol modelga alohida beriladi, tarixda takrorlanmasin.
            let history = await tickets.history(ticket.id, 12);
            // "Yangi savol" yoki 12 soat jimlikdan keyingi birinchi xabar: oldingi gap butunlay
            // unutilmasin ("hozir ulanmagan deyapdiku" kabi havolalar tushunilsin)
            if (!history.length) history = await tickets.previousContext(chatId, ticket.id);
            await tickets.attachInbound(ids, ticket.id);

            // Yangi xabar kelgach, javobi hali yuborilmagan eski qoralamalar kuchini yo'qotadi:
            // aks holda operator eskisini ham yuborib, mijoz ikki xil (va eskirgan) javob olardi.
            // 'superseded' natija hisobiga kirmaydi — bu botning xatosi emas.
            await db.supportMessage.updateMany({
                where: { ticketId: ticket.id, kind: 'draft', state: 'pending' },
                data: { state: 'superseded' },
            });

            // Operator allaqachon shug'ullanyapti yoki bot o'chirilgan — faqat yetkazamiz
            if (ticket.status === 'human' || s.mode === 'off') {
                const fresh = ticket.status === 'open';
                if (fresh) await tickets.update(ticket.id, { status: 'waiting_operator' });
                // Bir murojaat uchun kartalar soni cheklangan: mijoz ketma-ket yozsa operator chati to'lib ketmasin
                const posted = allow(`relay:${ticket.id}`, 12) ? await deps.operator().relay(ticket, user, text, files) : true;
                if (!posted) deps.onOperatorUnreachable?.('relay');
                await say(user, !posted ? t.unreachable : fresh ? (withinWorkHours(s) ? t.escalated : t.escalatedNight) : t.alreadyWithOperator);
                return;
            }

            // Javob tayyorlash (AI) soatiga cheklangan. Mijoz chegaradan oshsa savoli
            // operatorga boradi; notanish odamga esa birozdan keyin yozish aytiladi.
            if (!allow(`ai:${chatId}`, isLinked(user) ? ANSWERS_PER_HOUR.linked : ANSWERS_PER_HOUR.stranger)) {
                // Chegaradan keyin ham har xabarga karta ketmasin: soatiga ikki marta
                if (isLinked(user) && allow(`overlimit:${chatId}`, 2)) {
                    await api.escalate(ticket, user, text, "Bir soatda juda ko'p savol — bot javob bermadi", cut(text, 600), files);
                } else {
                    await say(user, t.tooMany);
                }
                return;
            }

            void messenger.typing(chatId);
            const startedAt = Date.now();
            let result: BrainResult;
            try {
                result = await brain.answer({
                    user, clinicName: await clinicName(user.clinicId), text, history,
                    settings: s, attachment: files[0]?.kind || null,
                });
                void api.log(user, text, result.reply, result.toolCalls, result.meta, Date.now() - startedAt, null);
            } catch (e: any) {
                console.error('[support] brain:', e?.message);
                void api.log(user, text, '', [], null, Date.now() - startedAt, e?.message || String(e));
                await api.escalate(ticket, user, text, 'Bot javob tayyorlay olmadi (AI xizmati)', cut(text, 600), files, t.error);
                return;
            }

            await tickets.update(ticket.id, { category: result.category });
            ticket = { ...ticket, category: result.category };

            if (result.escalate) {
                await api.escalate(ticket, user, text, result.escalate.reason, result.escalate.summary, files, result.reply);
                return;
            }

            const operatorChat = await settings.operatorChat();
            // Shubhali javob (ilovada yo'q bo'lim, asossiz) operator ulanmagan bo'lsa ham o'zi ketmaydi
            const mode = result.flags.length ? 'draft'
                : !operatorChat ? 'auto'
                    : await tickets.modeFor(result.category, s);

            if (mode === 'auto') {
                if (!(await api.deliver(user, ticket, payloadOf(result), 'bot'))) {
                    // Foydalanuvchi botni to'xtatgan: javob yetmadi, murojaat yopiladi
                    await tickets.update(ticket.id, { status: 'closed', resolvedBy: 'unreachable', closedAt: new Date() });
                }
                return;
            }

            const draft = await tickets.addMessage({
                ticketId: ticket.id, chatId, direction: 'out', author: 'bot', kind: 'draft',
                text: result.reply, state: 'pending', meta: { ...payloadOf(result), flags: result.flags },
            });
            const first = ticket.status === 'open' && !ticket.firstReplyAt;
            await tickets.update(ticket.id, { status: 'waiting_operator' });
            const posted = await deps.operator().draftCard(ticket, user, text, draft, result);
            if (!posted) {
                deps.onOperatorUnreachable?.('draft');
                // Har xabarga: mijoz javobsiz qolmasin va "yozamiz" deb aldanmasin.
                // Murojaat "kutmoqda" holatida qoladi — panelda javobsiz sifatida ko'rinadi.
                await say(user, t.unreachable);
                return;
            }
            if (first) await say(user, t.received);
        },

        /** Operatorga uzatish: foydalanuvchiga nima deyilishi `userText` da */
        async escalate(ticket: any, user: SupportUserRow, question: string, why: string, summary: string,
            files: { kind: 'photo' | 'document'; fileId: string }[], userText?: string): Promise<void> {
            const s = await settings.get();
            const t = T(user.lang);
            // Operator allaqachon yozishmada bo'lsa, holat qaytib "kutmoqda" bo'lib qolmasin:
            // aks holda bot operator suhbati o'rtasida yana javob bera boshlardi.
            await tickets.update(ticket.id, { status: ticket.status === 'human' ? 'human' : 'waiting_operator', summary: cut(summary, 1500) });
            const posted = await deps.operator().escalationCard(ticket, user, question, why, summary, files);
            if (!posted) deps.onOperatorUnreachable?.('escalation');
            const fallback = withinWorkHours(s) ? t.escalated : t.escalatedNight;
            // Operator chatiga yetmagan bo'lsa "mutaxassisga uzatdim" yoki "yozamiz" deb aldanmaydi:
            // mijozga haqiqatni aytamiz (u qayta yozishi yoki boshqa yo'l bilan bog'lanishi mumkin)
            const text = !posted ? t.unreachable : userText && userText.trim() ? userText : fallback;
            const sent = await say(user, text);
            await tickets.addMessage({
                ticketId: ticket.id, chatId: user.chatId, direction: 'out', author: 'bot', text, tgMessageId: sent,
                meta: { escalated: true, why },
            });
        },

        /**
         * Javobni foydalanuvchiga yetkazadi: matn, tugmalar, "Hal bo'ldimi?" va
         * model taklif qilgan amallar (parol, to'lov). Bot o'zi yuborganda ham,
         * operator qoralamani tasdiqlaganda ham shu ishlaydi.
         */
        async deliver(user: SupportUserRow, ticket: any, p: AnswerPayload, author: 'bot' | 'operator'): Promise<boolean> {
            const b = BTN[user.lang];
            const body = [p.reply, ...p.attachments].filter(Boolean).join('\n\n');
            const buttons: InlineButton[][] = [
                ...p.buttons.map(x => [{ text: x.text, url: x.url }]),
                [{ text: b.solved, data: `ok:${ticket.id}` }, { text: b.needHuman, data: `hm:${ticket.id}` }],
            ];
            const sent = await say(user, body, { buttons });
            // Yetib bormagan javob "yuborildi" deb hisoblanmaydi (foydalanuvchi botni to'xtatgan)
            if (!sent) return false;
            await tickets.addMessage({
                ticketId: ticket.id, chatId: user.chatId, direction: 'out', author, text: body, tgMessageId: sent,
                meta: { category: p.category, articleIds: p.articleIds },
            });
            await tickets.update(ticket.id, {
                status: 'open',
                ...(ticket.firstReplyAt ? {} : { firstReplyAt: new Date() }),
            });
            for (const proposal of p.proposals) {
                if (proposal === 'password_reset') await api.startPasswordReset(user, ticket.id);
                if (proposal === 'payment') await api.startPayment(user, ticket.id);
            }
            return true;
        },

        // ── Menyu tugmalari ─────────────────────────────────────────────────

        async onMenu(chatId: string, tg: { name?: string; username?: string }, action: 'pay' | 'reset' | 'operator' | 'newQuestion'): Promise<void> {
            const user = await identity.touch(chatId, tg);
            const t = T(user.lang);
            if (!allow(`menu:${chatId}`, isLinked(user) ? ACTIONS_PER_HOUR.linked : ACTIONS_PER_HOUR.stranger)) {
                await say(user, t.tooMany);
                return;
            }
            if (action === 'newQuestion') {
                const cur = await tickets.current(chatId);
                if (cur) await tickets.close(cur.id, 'bot');
                await say(user, t.newQuestion);
                return;
            }
            if (action === 'operator') {
                // Murojaat allaqachon operatorda — qayta bosilsa yangi karta ochilmaydi
                const cur = await tickets.current(chatId);
                if (cur && (cur.status === 'waiting_operator' || cur.status === 'human')) {
                    await say(user, t.alreadyWithOperator);
                    return;
                }
                const ticket = cur || await tickets.ensure(chatId, user.clinicId || null, "Operator so'raldi");
                await api.escalate(ticket, user, "Foydalanuvchi operatorni so'radi", "Foydalanuvchi operatorni so'radi",
                    ticket.subject || '', []);
                return;
            }
            if (!isLinked(user) || !user.clinicId) {
                await say(user, t.needLink);
                return;
            }
            if (action === 'pay') await api.startPayment(user, null);
            if (action === 'reset') await api.startPasswordReset(user, null);
        },

        // ── To'lov ──────────────────────────────────────────────────────────

        async startPayment(user: SupportUserRow, ticketId: string | null): Promise<void> {
            const t = T(user.lang);
            if (!user.clinicId) { await say(user, t.needLink); return; }
            const s = await settings.get();
            if (!(await actions.awaitingReceipt(user.chatId))) {
                await actions.create({
                    ticketId, chatId: user.chatId, clinicId: user.clinicId, kind: 'subscription_extend',
                    approver: 'operator', status: 'awaiting_receipt',
                });
            }
            await say(user, t.payStart(user.lang === 'ru' ? s.payInfoRu : s.payInfoUz));
        },

        /** Chek kutilayotgan bo'lsa — faylni to'lov cheki sifatida qabul qiladi. true — qabul qilindi */
        async tryReceipt(chatId: string, kind: 'photo' | 'document', fileId: string, force = false): Promise<boolean> {
            const user = await identity.getUser(chatId);
            if (!user || !user.clinicId) return false;
            if (!allow(`receipt:${chatId}`, 10)) return false;
            let action = await actions.awaitingReceipt(chatId);
            // Eski so'rov boshqa klinika uchun ochilgan bo'lsa (odam qayta ulangan) — u yaroqsiz:
            // aks holda operator kartada ko'rsatilgan klinikadan BOSHQA klinikani uzaytirib qo'yardi
            if (action && action.clinicId !== user.clinicId) {
                await actions.reject(action.id, 'clinic-changed');
                action = null;
            }
            if (!action && force) {
                action = await actions.create({
                    chatId, clinicId: user.clinicId, kind: 'subscription_extend', approver: 'operator', status: 'awaiting_receipt',
                });
                action = await actions.get(action.id);
            }
            if (!action) return false;

            const t = T(user.lang);
            const s = await settings.get();
            // Operator ulanmagan bo'lsa chek hech kimga yetmaydi: "qabul qilindi" deb aldamaymiz
            const operatorChat = await settings.operatorChat();
            if (!operatorChat) {
                deps.onOperatorUnreachable?.('receipt');
                await say(user, t.payUnavailable);
                return true;
            }
            const args = { ...action.args, fileId, fileKind: kind };
            await actions.setArgs(action.id, args, 'pending');
            await actions.restamp(action.id);
            const posted = await deps.operator().receiptCard({ ...action, args }, user, kind, fileId);
            if (!posted) {
                // Karta yetmadi: so'rov chek kutish holatiga qaytadi, mijoz qayta yuboradi
                deps.onOperatorUnreachable?.('receipt');
                await actions.setArgs(action.id, args, 'awaiting_receipt');
                await say(user, t.payUnavailable);
                return true;
            }
            // Vaqtincha ochish faqat karta operatorga yetgandan KEYIN (kimdir ko'rishi shart)
            const trust = await billing.grantTrust(user.clinicId, s.trustDays, fileId)
                .catch((e: any) => { console.error('[support] trust:', e?.message); return { granted: false as const }; });
            if (trust.granted) {
                await messenger.send(operatorChat, `ℹ️ Chek uchun klinika ${ddmmyyyy(trust.toExpiry)} gacha vaqtincha ochildi. Tekshirib, tasdiqlang yoki rad eting.`);
            }
            await say(user, t.payReceived + (trust.granted ? '\n\n' + t.payTrust(ddmmyyyy(trust.toExpiry)) : ''));
            return true;
        },

        // ── Parolni tiklash ─────────────────────────────────────────────────

        async startPasswordReset(user: SupportUserRow, ticketId: string | null): Promise<void> {
            const t = T(user.lang);
            const b = BTN[user.lang];
            if (!isLinked(user) || !user.clinicId) { await say(user, t.needLink); return; }

            if (user.role === 'CLINIC_ADMIN') {
                if (!(await actions.resetAllowed(user.clinicId, 'owner'))) { await say(user, t.resetLimit); return; }
                const self = canActAsOwner(user);
                // Ochiq so'rov bor bo'lsa yangisi yaratilmaydi (tugma qayta bosilsa kvota yonmasin)
                const open = await actions.openPending(user.chatId, 'owner_password_reset');
                const reuse = open && open.approver === (self ? 'self' : 'operator') && open.clinicId === user.clinicId;
                if (reuse && !self) { await say(user, t.resetSentToOperator); return; }
                const action = reuse ? open : await actions.create({
                    ticketId, chatId: user.chatId, clinicId: user.clinicId, kind: 'owner_password_reset',
                    approver: self ? 'self' : 'operator', args: { target: 'owner' },
                });
                if (self) {
                    await say(user, t.resetConfirm, {
                        buttons: [[{ text: b.yesReset, data: `pr:${action.id}` }], [{ text: b.cancel, data: `pc:${action.id}` }]],
                    });
                    return;
                }
                // Telefon orqali ulangan: raqam mos kelishi yetarli emas — operator tasdiqlaydi
                const posted = await deps.operator().ownerResetCard(action, user, await clinicName(user.clinicId));
                if (!posted) {
                    deps.onOperatorUnreachable?.('owner_reset');
                    await say(user, t.resetUnavailable);
                    return;
                }
                await say(user, t.resetSentToOperator);
                return;
            }

            if (user.role === 'DOCTOR' || user.role === 'RECEPTIONIST' || user.role === 'LAB_TECHNICIAN') {
                const staff = user.staffId ? await actions.findStaff(user.clinicId, user.role, user.staffId) : null;
                if (!staff?.username) { await say(user, t.resetNoLogin); return; }
                if (!(await actions.resetAllowed(user.clinicId, staff.id))) { await say(user, t.resetLimit); return; }
                const owners = await identity.ownersOf(user.clinicId);
                if (!owners.length) { await say(user, t.resetNoOwner); return; }
                const action = await actions.create({
                    ticketId, chatId: user.chatId, clinicId: user.clinicId, kind: 'staff_password_reset', approver: 'owner',
                    args: { target: staff.id, role: user.role, staffName: staff.name, approvers: owners.map(o => o.chatId) },
                });
                for (const owner of owners) {
                    const ob = BTN[owner.lang];
                    await messenger.send(owner.chatId, T(owner.lang).ownerAsk(staff.name, roleLabel(user.role, owner.lang)), {
                        lang: owner.lang,
                        buttons: [[{ text: ob.approve, data: `po:${action.id}` }, { text: ob.reject, data: `pz:${action.id}` }]],
                    });
                }
                await say(user, t.resetSentToOwner);
                return;
            }
            await say(user, t.resetNotSupported);
        },

        // ── Foydalanuvchi bosgan tugmalar ───────────────────────────────────

        /** @returns tugma ostida chiqadigan qisqa bildirish (bo'sh — indamaydi) */
        async onUserCallback(chatId: string, data: string, messageId: number): Promise<string> {
            const user = await identity.getUser(chatId);
            if (!user) return '';
            if (!allow(`cb:${chatId}`, 60)) return '';
            const t = T(user.lang);
            const [kind, id] = data.split(':');
            const clear = () => messenger.editButtons(chatId, messageId, null).catch(() => { });

            if (kind === 'ok' || kind === 'hm') {
                const ticket = await tickets.get(id);
                if (!ticket || ticket.chatId !== chatId) return '';
                await clear();
                if (kind === 'ok') {
                    await tickets.close(ticket.id, 'user', 1);
                    await say(user, t.thanks);
                    return '';
                }
                await tickets.update(ticket.id, { rating: -1 });
                // Murojaat allaqachon operatorda bo'lsa yana karta ochilmaydi
                if (ticket.status === 'waiting_operator' || ticket.status === 'human') {
                    await say(user, t.alreadyWithOperator);
                    return '';
                }
                await api.escalate(ticket, user, ticket.subject || '', 'Bot javobi yordam bermadi',
                    await api.transcript(ticket.id), []);
                return '';
            }

            if (kind === 'rc') {
                const msg = await db.supportMessage.findUnique({ where: { id } });
                if (!msg || msg.chatId !== chatId || !msg.fileId) return '';
                await clear();
                if (!user.clinicId) { await say(user, t.needLink); return ''; }
                await api.tryReceipt(chatId, msg.kind === 'document' ? 'document' : 'photo', msg.fileId, true);
                return '';
            }

            if (kind === 'pc') {
                const action = await actions.get(id);
                if (!action || action.chatId !== chatId) return '';
                await actions.reject(id, chatId);
                await clear();
                await say(user, t.resetCancelled);
                return '';
            }

            if (kind === 'pr') {
                const action = await actions.get(id);
                // Faqat so'ragan odamning o'zi va faqat hali ham rahbar sifatida ulangan bo'lsa
                if (!action || action.chatId !== chatId || action.kind !== 'owner_password_reset'
                    || action.approver !== 'self' || !canActAsOwner(user) || user.clinicId !== action.clinicId) return t.resetExpired;
                const claimed = await actions.claim(id, chatId);
                await clear();
                if (!claimed) { await say(user, t.resetExpired); return ''; }
                await api.finishReset(claimed, user, () => actions.prepareOwnerReset(claimed.clinicId, user.staffName || user.tgName || chatId, chatId));
                return '';
            }

            if (kind === 'po' || kind === 'pz') {
                const action = await actions.get(id);
                const approvers: string[] = action?.args?.approvers || [];
                if (!action || action.kind !== 'staff_password_reset' || !approvers.includes(chatId)
                    || user.role !== 'CLINIC_ADMIN' || user.clinicId !== action.clinicId) return t.resetExpired;
                const requester = await identity.getUser(action.chatId);
                // So'ragan odam hali ham shu klinikaning shu xodimi bo'lishi shart (ulanish o'zgargan bo'lishi mumkin)
                const sameStaff = !!requester && requester.clinicId === action.clinicId
                    && requester.role === action.args?.role && requester.staffId === action.args?.target;
                if (kind === 'po' && !sameStaff) return t.resetExpired;
                if (kind === 'pz') {
                    const ok = await actions.reject(id, chatId);
                    await clear();
                    await say(user, ok ? t.ownerRejected : t.resetExpired);
                    if (ok && requester) await say(requester, T(requester.lang).resetRejected);
                    return '';
                }
                const claimed = await actions.claim(id, chatId);
                await clear();
                if (!claimed || !requester) { await say(user, t.resetExpired); return ''; }
                const done = await api.finishReset(claimed, requester, () =>
                    actions.prepareStaffReset(claimed.clinicId, claimed.args.role, claimed.args.target, user.staffName || user.tgName || chatId, requester.chatId));
                if (done) await say(user, t.ownerApproved(claimed.args.staffName || ''));
                return '';
            }
            return '';
        },

        /**
         * Yangi parolni FAQAT akkaunt egasiga yuboradi va yuborilgandan KEYIN saqlaydi.
         * Ilgari parol avval o'zgarardi: yuborib bo'lmasa (foydalanuvchi botni to'xtatgan)
         * egasi na yangi, na eski paroldan foydalana olardi.
         */
        async finishReset(action: any, recipient: SupportUserRow, prepare: () => Promise<PreparedReset>): Promise<boolean> {
            let sentPassword = false;
            try {
                const prepared = await prepare();
                // Parol jurnalga (SupportMessage) yozilmaydi — faqat Telegram xabarida
                const sent = await say(recipient, T(recipient.lang).resetDone(prepared.login, prepared.password));
                if (!sent) {
                    await actions.finish(action.id, false, 'Telegramga yuborib bo\'lmadi — parol o\'zgartirilmadi');
                    return false;
                }
                sentPassword = true;
                await prepared.commit();
                await actions.finish(action.id, true);
                return true;
            } catch (e: any) {
                console.error('[support] parol tiklash:', e?.message);
                await actions.finish(action.id, false, e?.message).catch(() => { });
                await say(recipient, sentPassword ? T(recipient.lang).resetFailed : T(recipient.lang).error);
                return false;
            }
        },

        /** Operator uchun suhbatning qisqa nusxasi */
        async transcript(ticketId: string): Promise<string> {
            const h = await tickets.history(ticketId, 8);
            return h.map(m => `${m.role === 'user' ? 'Mijoz' : 'Bot'}: ${cut(m.content, 300)}`).join('\n');
        },

        async log(user: SupportUserRow, question: string, reply: string, toolCalls: any[], meta: CallMeta | null, latencyMs: number, error: string | null): Promise<void> {
            await deps.logAi?.({
                clinicId: user.clinicId || null, userId: user.chatId, userName: user.staffName || user.tgName,
                role: user.role || null, endpoint: 'support', lang: user.lang, question, reply, toolCalls,
                provider: meta?.provider, model: meta?.model, tokensIn: meta?.tokensIn, tokensOut: meta?.tokensOut,
                rounds: meta?.rounds, latencyMs, error,
            });
        },

        /** Navbatdagi hamma ish tugashini kutadi (testlar va serverni to'xtatish uchun) */
        async idle(): Promise<void> {
            while (timers.size || chains.size) {
                await Promise.all([...chains.values()]);
                await new Promise(r => setTimeout(r, 5));
            }
        },

        /** Server ishga tushganda: javobsiz qolgan savollarni davom ettiradi */
        async resume(): Promise<number> {
            const chats = await tickets.chatsWithPending();
            for (const chatId of chats) api.schedule(chatId, 1000);
            // Deploy paytida eski nusxa hali ishlab turgan bo'lishi mumkin: uning "processing"
            // xabarlari 5 daqiqadan keyingina eskirgan hisoblanadi — shundan keyin yana bir marta ko'riladi
            if (chats.length) {
                const again = setTimeout(() => { for (const chatId of chats) api.schedule(chatId, 0); }, 6 * 60 * 1000);
                again.unref?.();
            }
            return chats.length;
        },

        payloadFromDraft: (draft: any): AnswerPayload => {
            const m = safeJson<any>(draft.meta, {});
            return {
                reply: draft.text || '', attachments: m.attachments || [], buttons: m.buttons || [],
                proposals: m.proposals || [], category: m.category || 'other', articleIds: m.articleIds || [],
            };
        },
    };
    return api;
};

export type Flow = ReturnType<typeof createFlow>;
