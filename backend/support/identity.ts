// ─── Yordam botida kim kimligi ───────────────────────────────────────────────
// Bot klinika ma'lumotini ko'rsatadi va amal bajaradi (parol tiklash, obuna),
// shuning uchun "bu odam kim" degan savol eng muhimi. Ikki yo'l bor:
//
//   session — ilovadagi "Yordam" tugmasi bir martalik kod beradi. Kod tizimga
//             kirgan foydalanuvchi uchun yaratiladi, ya'ni kim ekani aniq.
//   phone   — Telegram'da o'z kontaktini yuborgan. Raqam CRM dagi raqam bilan
//             solishtiriladi. Tizimga kira olmayotgan odam uchun yagona yo'l.
//
// Telefon orqali ulangan RAHBAR egasi nomidan amal qila olmaydi (canActAsOwner):
// raqam CRMda noto'g'ri yozilgan yoki SIM boshqa odamga o'tgan bo'lishi mumkin.
// Bunday so'rov operator tasdig'iga boradi.

import { randomBytes } from 'crypto';
import { phoneKey } from './text';

export interface SupportUserRow {
    chatId: string;
    tgName?: string | null;
    tgUsername?: string | null;
    phone?: string | null;
    lang: 'uz' | 'ru';
    script: 'latin' | 'cyrillic';
    clinicId?: string | null;
    role?: string | null;
    staffId?: string | null;
    staffName?: string | null;
    verifiedVia?: 'session' | 'phone' | null;
    blocked?: boolean;
}

/** Ilovadagi sessiya (JWT ichidagi ma'lumot) */
export interface AuthUser {
    role: string;
    name?: string;
    clinicId?: string;
    doctorId?: string;
    receptionistId?: string;
    technicianId?: string;
    salesAgentId?: string;
}

export const LINK_TTL_MS = 10 * 60 * 1000;
const LINK_PREFIX = 'l_';

/** Rahbar nomidan amal: faqat ilova orqali ulangan rahbar yoki super admin */
export const canActAsOwner = (u: SupportUserRow | null | undefined): boolean =>
    !!u && !u.blocked && u.verifiedVia === 'session' && (u.role === 'CLINIC_ADMIN' || u.role === 'SUPER_ADMIN');

export const isLinked = (u: SupportUserRow | null | undefined): boolean => !!u && !!u.role && !u.blocked;
export const isSuperAdmin = (u: SupportUserRow | null | undefined): boolean =>
    !!u && !u.blocked && u.role === 'SUPER_ADMIN' && u.verifiedVia === 'session';

const staffIdOf = (a: AuthUser): string | null =>
    a.doctorId || a.receptionistId || a.technicianId || a.salesAgentId || null;

const fullName = (r: any) => [r?.firstName, r?.lastName].filter(Boolean).join(' ');

/** Ulanish shuncha vaqtdan keyin o'zi eskiradi: ilovadagi "Yordam" tugmasi bilan qayta ulanadi */
export const LINK_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

const STAFF_MODEL: Record<string, string> = {
    DOCTOR: 'doctor', RECEPTIONIST: 'receptionist', LAB_TECHNICIAN: 'labTechnician',
};

const UNLINKED = { clinicId: null, role: null, staffId: null, staffName: null, verifiedVia: null, linkedAt: null };

/**
 * Hisobga bog'langan barcha Telegram ulanishlarini uzadi.
 *
 * Ulanish ilgari parol o'zgargandan keyin ham abadiy qolardi: klinika loginini bir marta
 * bilgan (ishdan ketgan xodim, o'g'irlangan sessiya) odam ilovadagi "Yordam" orqali botga
 * rahbar sifatida ulanib, parol almashgandan keyin ham undan foydalanib turardi.
 *
 * @param scope.exceptChatId — shu chat saqlanadi (parolni olayotgan odamning o'zi)
 */
export const revokeSupportLinks = async (
    db: any,
    scope: { clinicId?: string | null; role: string; staffId?: string | null; exceptChatId?: string; via?: 'session' | 'phone' }
): Promise<void> => {
    // Xodim identifikatori noyob (UUID): klinika ma'lum bo'lmasa ham faqat u bo'yicha bekor qilinadi
    if (!scope.clinicId && !scope.staffId) return;
    await db.supportUser.updateMany({
        where: {
            ...(scope.clinicId ? { clinicId: scope.clinicId } : {}),
            role: scope.role,
            ...(scope.staffId ? { staffId: scope.staffId } : {}),
            ...(scope.exceptChatId ? { chatId: { not: scope.exceptChatId } } : {}),
            ...(scope.via ? { verifiedVia: scope.via } : {}),
        },
        data: UNLINKED,
    });
};

/**
 * Telegram kontaktidagi raqamning oxirgi 9 xonasi — faqat O'ZBEKISTON raqami (998 + 9 xona) bo'lsa.
 * Faqat oxirgi 9 xonani solishtirish chet el raqamini (+7 9XX...) o'zbek raqami deb olardi.
 */
export const uzContactKey = (phone?: string | null): string | null => {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length === 12 && digits.startsWith('998') ? digits.slice(-9) : null;
};

export const createIdentity = (db: any) => {
    /** Ulangan odam hali ham o'sha hisob egasimi: hisob o'chmagan, xodim faol, ulanish eskirmagan */
    const stillValid = async (u: any): Promise<boolean> => {
        if (!u.role) return true;
        if (u.linkedAt && Date.now() - new Date(u.linkedAt).getTime() > LINK_MAX_AGE_MS) return false;
        if (u.role === 'SUPER_ADMIN' || !u.clinicId) return true;

        const clinic = await db.clinic.findUnique({ where: { id: u.clinicId }, select: { status: true } });
        if (!clinic || clinic.status === 'Deleted') return false;
        if (u.role === 'CLINIC_ADMIN') return true;

        const model = STAFF_MODEL[u.role];
        if (!model || !u.staffId) return false;
        const staff = await db[model].findFirst({ where: { id: u.staffId, clinicId: u.clinicId }, select: { status: true } });
        return !!staff && staff.status === 'Active';
    };

    /** Yaroqsiz ulanish uziladi va ulanmagan holat qaytariladi */
    const settle = async (row: any): Promise<any> => {
        if (!row || !row.role) return row;
        if (await stillValid(row)) return row;
        await db.supportUser.update({ where: { chatId: row.chatId }, data: UNLINKED });
        return { ...row, ...UNLINKED };
    };

    return {
    async getUser(chatId: string): Promise<SupportUserRow | null> {
        return settle(await db.supportUser.findUnique({ where: { chatId } }));
    },

    /** Botga yozgan har bir odamni eslab qoladi (ism va til yangilanadi) */
    async touch(chatId: string, tg: { name?: string; username?: string }, lang?: { lang: 'uz' | 'ru'; script: 'latin' | 'cyrillic' }): Promise<SupportUserRow> {
        const data = {
            tgName: tg.name ? String(tg.name).slice(0, 120) : null,
            tgUsername: tg.username ? String(tg.username).slice(0, 60) : null,
            ...(lang ? { lang: lang.lang, script: lang.script } : {}),
            // Yozdi — demak botni blokdan chiqargan
            blocked: false,
        };
        return settle(await db.supportUser.upsert({
            where: { chatId },
            create: { chatId, lang: 'uz', script: 'latin', ...data },
            update: data,
        }));
    },

    /** Ilovadagi foydalanuvchi uchun bir martalik kod. Telegram havolasi: t.me/<bot>?start=<kod> */
    async createLinkCode(auth: AuthUser): Promise<string> {
        const code = randomBytes(18).toString('base64url');
        await db.supportLink.create({
            data: {
                code,
                clinicId: auth.clinicId || null,
                role: auth.role,
                staffId: staffIdOf(auth),
                staffName: auth.name ? String(auth.name).slice(0, 120) : null,
                expiresAt: new Date(Date.now() + LINK_TTL_MS),
            },
        });
        return LINK_PREFIX + code;
    },

    isLinkPayload: (payload: string): boolean => typeof payload === 'string' && payload.startsWith(LINK_PREFIX),

    /**
     * Kodni ishlatadi. Bitta UPDATE bilan: kod ikki chatda bir vaqtda ochilsa
     * ham faqat bittasi ulanadi.
     */
    async linkByCode(chatId: string, payload: string): Promise<{ ok: true; user: SupportUserRow } | { ok: false; reason: 'invalid' }> {
        const code = String(payload || '').slice(LINK_PREFIX.length);
        if (!code) return { ok: false, reason: 'invalid' };
        const now = new Date();
        const claimed = await db.supportLink.updateMany({
            where: { code, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now, usedBy: chatId },
        });
        if (claimed.count !== 1) return { ok: false, reason: 'invalid' };

        const link = await db.supportLink.findUnique({ where: { code } });
        const data = {
            clinicId: link.clinicId || null,
            role: link.role,
            staffId: link.staffId || null,
            staffName: link.staffName || null,
            verifiedVia: 'session',
            linkedAt: now,
        };
        const user = await db.supportUser.upsert({
            where: { chatId },
            create: { chatId, lang: 'uz', script: 'latin', blocked: false, ...data },
            update: data,
        });
        return { ok: true, user };
    },

    /**
     * Telefon raqami bo'yicha ulash. Chaqiruvchi kontakt yuboruvchining O'ZINIKI
     * ekanini tekshirgan bo'lishi shart (contact.user_id === from.id).
     *
     * Bir raqam bir nechta joyda uchrasa: rahbar > resepshn > shifokor > laborant.
     * Ilova orqali ulangan odamning ulanishi telefon bilan almashtirilmaydi.
     */
    async linkByContact(chatId: string, phone: string): Promise<{ ok: true; user: SupportUserRow; clinicName: string } | { ok: false; reason: 'not_found' | 'keep_session' }> {
        // Faqat O'zbekiston raqami: chet el raqamining oxirgi 9 xonasi tasodifan mos kelmasin
        const key = uzContactKey(phone);
        if (!key) return { ok: false, reason: 'not_found' };

        const existing = await db.supportUser.findUnique({ where: { chatId } });
        if (existing?.verifiedVia === 'session' && existing.role) return { ok: false, reason: 'keep_session' };

        const live = { status: { not: 'Deleted' } };
        const clinics: any[] = await db.clinic.findMany({
            where: live,
            select: { id: true, name: true, adminName: true, ownerPhone: true, status: true },
        });
        const clinicById = new Map<string, any>(clinics.map(c => [c.id, c]));
        const inLiveClinic = (r: any) => clinicById.has(r.clinicId) && phoneKey(r.phone) === key && r.status === 'Active';

        const owner = clinics.find(c => phoneKey(c.ownerPhone) === key);
        let match: { clinicId: string; role: string; staffId: string | null; staffName: string } | null =
            owner ? { clinicId: owner.id, role: 'CLINIC_ADMIN', staffId: null, staffName: owner.adminName } : null;

        const staffTables: [string, string][] = [
            ['receptionist', 'RECEPTIONIST'], ['doctor', 'DOCTOR'], ['labTechnician', 'LAB_TECHNICIAN'],
        ];
        for (const [model, role] of staffTables) {
            if (match) break;
            const rows: any[] = await db[model].findMany({
                select: { id: true, clinicId: true, phone: true, status: true, firstName: true, lastName: true },
            });
            const hit = rows.find(inLiveClinic);
            if (hit) match = { clinicId: hit.clinicId, role, staffId: hit.id, staffName: fullName(hit) };
        }
        if (!match) {
            await db.supportUser.upsert({
                where: { chatId },
                create: { chatId, lang: 'uz', script: 'latin', blocked: false, phone },
                update: { phone },
            });
            return { ok: false, reason: 'not_found' };
        }

        const data = { ...match, phone, verifiedVia: 'phone', linkedAt: new Date() };
        const user = await db.supportUser.upsert({
            where: { chatId },
            create: { chatId, lang: 'uz', script: 'latin', blocked: false, ...data },
            update: data,
        });
        return { ok: true, user, clinicName: clinicById.get(match.clinicId)?.name || '' };
    },

    async unlink(chatId: string): Promise<void> {
        await db.supportUser.updateMany({
            where: { chatId },
            data: { clinicId: null, role: null, staffId: null, staffName: null, verifiedVia: null, linkedAt: null },
        });
    },

    /** Shu klinikaning botga ulangan rahbar(lar)i — xodim so'rovini tasdiqlash va ogohlantirishlar uchun */
    async ownersOf(clinicId: string): Promise<SupportUserRow[]> {
        const rows: any[] = await db.supportUser.findMany({ where: { clinicId, role: 'CLINIC_ADMIN', blocked: false } });
        const fresh = await Promise.all(rows.map(settle));
        return fresh.filter((u: any) => u && u.role === 'CLINIC_ADMIN');
    },

    /** Foydalanuvchi botni bloklagan — endi unga yozib bo'lmaydi */
    async markBlocked(chatId: string): Promise<void> {
        await db.supportUser.updateMany({ where: { chatId }, data: { blocked: true } });
    },

    /** Eskirgan kodlarni tozalaydi (kunlik) */
    async pruneLinks(): Promise<void> {
        await db.supportLink.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }).catch(() => { });
    },
    };
};

export type Identity = ReturnType<typeof createIdentity>;
