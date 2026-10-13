// ─── Tasdiq kutadigan amallar ────────────────────────────────────────────────
// Bot biror narsani O'ZGARTIRADIGAN har bir amal avval SupportAction qatori
// bo'lib yoziladi va kimningdir tasdig'ini kutadi:
//
//   owner_password_reset — rahbar parolini tiklash
//        ilova orqali ulangan rahbar → o'zi tasdiqlaydi
//        telefon orqali ulangan      → operator tasdiqlaydi
//   staff_password_reset — xodim parolini tiklash → klinika rahbari tasdiqlaydi
//   subscription_extend  — obunani uzaytirish     → operator tasdiqlaydi
//
// Holat bitta UPDATE bilan almashadi (pending → running): tugma ikki marta
// bosilsa yoki ikki operator bir vaqtda bossa ham amal bir marta bajariladi.
// Telegram tugmasiga faqat qisqa id sig'adi (64 bayt) — tafsilot bazada.

import { randomInt } from 'crypto';
import { revokeSupportLinks } from './identity';
import { safeJson } from './text';

const bcrypt = require('bcryptjs');

export type ActionKind = 'owner_password_reset' | 'staff_password_reset' | 'subscription_extend';
export type Approver = 'self' | 'owner' | 'operator';

export const RESETS_PER_DAY = 3;
/** Tasdiqlanmagan so'rov shuncha vaqtdan keyin kuchini yo'qotadi */
export const ACTION_TTL_MS = 48 * 60 * 60 * 1000;

// O'xshash belgilarsiz (0/O, 1/l/I) — parolni telefondan ko'chirib yozish oson bo'lsin
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const generatePassword = (length = 10): string =>
    Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');

const STAFF_MODEL: Record<string, string> = {
    DOCTOR: 'doctor', RECEPTIONIST: 'receptionist', LAB_TECHNICIAN: 'labTechnician',
};

export interface ActionsDeps {
    db: any;
    withActor: <T>(actor: { name: string; role: string; clinicId: string | null }, fn: () => Promise<T>) => Promise<T>;
}

/** Tayyorlangan, hali saqlanmagan parol */
export interface PreparedReset {
    login: string;
    password: string;
    commit: () => Promise<void>;
}

export const createActions = ({ db, withActor }: ActionsDeps) => {
    const api = {
        async create(a: { ticketId?: string | null; chatId: string; clinicId?: string | null; kind: ActionKind; args?: any; approver: Approver; status?: string }): Promise<any> {
            return db.supportAction.create({
                data: {
                    ticketId: a.ticketId || null,
                    chatId: a.chatId,
                    clinicId: a.clinicId || null,
                    kind: a.kind,
                    args: JSON.stringify(a.args || {}),
                    status: a.status || 'pending',
                    approver: a.approver,
                },
            });
        },

        async get(id: string): Promise<any | null> {
            const row = await db.supportAction.findUnique({ where: { id } });
            return row ? { ...row, args: safeJson(row.args, {}) } : null;
        },

        async setArgs(id: string, args: any, status?: string): Promise<void> {
            await db.supportAction.update({ where: { id }, data: { args: JSON.stringify(args), ...(status ? { status } : {}) } });
        },

        /** Shu chatning chek kutayotgan to'lov so'rovi (bo'lsa) */
        async awaitingReceipt(chatId: string): Promise<any | null> {
            const row = await db.supportAction.findFirst({
                where: {
                    chatId, kind: 'subscription_extend', status: 'awaiting_receipt',
                    createdAt: { gte: new Date(Date.now() - ACTION_TTL_MS) },
                },
                orderBy: { createdAt: 'desc' },
            });
            return row ? { ...row, args: safeJson(row.args, {}) } : null;
        },

        /**
         * Amalni bajarishga oladi. `null` — kech qoldi: boshqa bosish allaqachon
         * olgan, rad etilgan yoki muddati o'tgan.
         */
        async claim(id: string, decidedBy: string): Promise<any | null> {
            const claimed = await db.supportAction.updateMany({
                where: { id, status: 'pending', createdAt: { gte: new Date(Date.now() - ACTION_TTL_MS) } },
                data: { status: 'running', decidedBy, decidedAt: new Date() },
            });
            return claimed.count === 1 ? api.get(id) : null;
        },

        async reject(id: string, decidedBy: string): Promise<boolean> {
            const r = await db.supportAction.updateMany({
                where: { id, status: { in: ['pending', 'awaiting_receipt'] } },
                data: { status: 'rejected', decidedBy, decidedAt: new Date() },
            });
            return r.count === 1;
        },

        async finish(id: string, ok: boolean, result?: string): Promise<void> {
            await db.supportAction.update({
                where: { id },
                data: { status: ok ? 'done' : 'failed', result: result ? String(result).slice(0, 500) : null },
            });
        },

        /**
         * Bajarib bo'lmadi, lekin so'rov hali yaroqli: operator qayta bosa olsin.
         * Ilgari bunday so'rov `failed` bo'lib, yangi chek yuborilguncha o'lik qolardi.
         */
        async release(id: string, why?: string): Promise<void> {
            await db.supportAction.update({
                where: { id },
                data: { status: 'pending', result: why ? String(why).slice(0, 500) : null },
            });
        },

        /**
         * Chek kelganda amal "yangi" hisoblanadi: tasdiqlash muddati so'rov ochilgan paytdan
         * emas, chek kelgan paytdan boshlanadi (aks holda 47 soatdan keyin kelgan chekni
         * operator tasdiqlay olmasdi).
         */
        async restamp(id: string): Promise<void> {
            await db.supportAction.update({ where: { id }, data: { createdAt: new Date() } });
        },

        /** Shu chatning ochiq (tasdiqlanmagan) so'rovi — takror yaratilmasin */
        async openPending(chatId: string, kind: ActionKind): Promise<any | null> {
            const row = await db.supportAction.findFirst({
                where: { chatId, kind, status: 'pending', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
                orderBy: { createdAt: 'desc' },
            });
            return row ? { ...row, args: safeJson(row.args, {}) } : null;
        },

        /** Bir akkaunt parolini kuniga RESETS_PER_DAY martadan ko'p tiklab bo'lmaydi */
        async resetAllowed(clinicId: string, target: string): Promise<boolean> {
            // Faqat bajarilgani sanaladi: tasdiqlanmagan so'rovlar (va modelning takliflari)
            // kvotani yeb qo'ymasin
            const rows: any[] = await db.supportAction.findMany({
                where: {
                    clinicId,
                    kind: { in: ['owner_password_reset', 'staff_password_reset'] },
                    status: { in: ['running', 'done'] },
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
                select: { args: true },
            });
            return rows.filter(r => safeJson<any>(r.args, {}).target === target).length < RESETS_PER_DAY;
        },

        /**
         * Rahbar uchun yangi parol TAYYORLAYDI, lekin hali saqlamaydi.
         *
         * Ilgari parol avval o'zgarardi, keyin yuborilardi: yuborish muvaffaqiyatsiz bo'lsa
         * (foydalanuvchi botni to'xtatgan) rahbar yangi paroldan ham, eskisidan ham mahrum
         * qolardi. Endi parol avval Telegram'ga yuboriladi, `commit()` esa faqat shundan keyin.
         *
         * commit() — parolni saqlaydi va shu hisobning BOSHQA Telegram ulanishlarini uzadi.
         */
        async prepareOwnerReset(clinicId: string, requestedBy: string, keepChatId?: string): Promise<PreparedReset> {
            const clinic = await db.clinic.findUnique({ where: { id: clinicId }, select: { id: true, username: true, status: true } });
            if (!clinic || clinic.status === 'Deleted') throw new Error('Klinika topilmadi');
            const password = generatePassword();
            const hash = await bcrypt.hash(password, 10);
            return {
                login: clinic.username,
                password,
                async commit() {
                    await withActor({ name: `Yordam boti (so'radi: ${requestedBy})`, role: 'SUPPORT_BOT', clinicId }, async () => {
                        await db.clinic.update({ where: { id: clinicId }, data: { password: hash } });
                    });
                    await revokeSupportLinks(db, { clinicId, role: 'CLINIC_ADMIN', exceptChatId: keepChatId });
                },
            };
        },

        /** Rahbarga yangi parol beradi (tayyorlash + darhol saqlash) */
        async resetOwnerPassword(clinicId: string, requestedBy: string, keepChatId?: string): Promise<{ login: string; password: string }> {
            const prepared = await api.prepareOwnerReset(clinicId, requestedBy, keepChatId);
            await prepared.commit();
            return { login: prepared.login, password: prepared.password };
        },

        /** Xodimni topadi (rol + id bo'yicha, faqat shu klinika ichida) */
        async findStaff(clinicId: string, role: string, staffId: string): Promise<any | null> {
            const model = STAFF_MODEL[role];
            if (!model || !staffId) return null;
            const row = await db[model].findFirst({
                where: { id: staffId, clinicId },
                select: { id: true, firstName: true, lastName: true, username: true, status: true },
            });
            return row ? { ...row, model, name: [row.firstName, row.lastName].filter(Boolean).join(' ') } : null;
        },

        async prepareStaffReset(clinicId: string, role: string, staffId: string, approvedBy: string, keepChatId?: string): Promise<PreparedReset & { name: string }> {
            const staff = await api.findStaff(clinicId, role, staffId);
            if (!staff) throw new Error('Xodim topilmadi');
            if (!staff.username) throw new Error('Xodimga login berilmagan');
            if (staff.status !== 'Active') throw new Error('Xodim akkaunti o\'chirib qo\'yilgan');
            const password = generatePassword();
            const hash = await bcrypt.hash(password, 10);
            return {
                login: staff.username,
                password,
                name: staff.name,
                async commit() {
                    await withActor({ name: `Yordam boti (tasdiqladi: ${approvedBy})`, role: 'SUPPORT_BOT', clinicId }, async () => {
                        await db[staff.model].update({ where: { id: staff.id }, data: { password: hash } });
                    });
                    await revokeSupportLinks(db, { clinicId, role, staffId: staff.id, exceptChatId: keepChatId });
                },
            };
        },

        async resetStaffPassword(clinicId: string, role: string, staffId: string, approvedBy: string, keepChatId?: string): Promise<{ login: string; password: string; name: string }> {
            const prepared = await api.prepareStaffReset(clinicId, role, staffId, approvedBy, keepChatId);
            await prepared.commit();
            return { login: prepared.login, password: prepared.password, name: prepared.name };
        },
    };
    return api;
};

export type Actions = ReturnType<typeof createActions>;
