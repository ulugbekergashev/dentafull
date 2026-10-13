// Foydalanuvchi O'Z parolini almashtiradi (ilovaning yuqori qismidagi
// "Parolni almashtirish"). Ilgari bunday imkoniyat yo'q edi: klinika rahbari
// parolini faqat super admin, xodimnikini faqat rahbar o'zgartira olardi —
// har bir "parolni almashtirib bering" so'rovi qo'lda bajarilardi.

import { revokeSupportLinks } from './support/identity';

const bcrypt = require('bcryptjs');

export const PASSWORD_MIN = 6;
// bcrypt 72 baytdan keyingisini e'tiborga olmaydi
export const PASSWORD_MAX = 72;

export class PasswordChangeError extends Error { }

/** JWT ichidagi foydalanuvchi qaysi jadvalning qaysi qatori */
const accountOf = (user: any): { model: string; id: string } | null => {
    switch (user?.role) {
        case 'CLINIC_ADMIN': return user.clinicId ? { model: 'clinic', id: user.clinicId } : null;
        case 'DOCTOR': return user.doctorId ? { model: 'doctor', id: user.doctorId } : null;
        case 'RECEPTIONIST': return user.receptionistId ? { model: 'receptionist', id: user.receptionistId } : null;
        case 'LAB_TECHNICIAN': return user.technicianId ? { model: 'labTechnician', id: user.technicianId } : null;
        case 'SALES_AGENT': return user.salesAgentId ? { model: 'salesAgent', id: user.salesAgentId } : null;
        default: return null;
    }
};

const isHash = (stored: string) => stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');

/** Saqlangan parol bilan solishtiradi (eski, hali hash qilinmagan parollar ham bor — login bilan bir xil qoida) */
const matches = async (plain: string, stored: string | null | undefined): Promise<boolean> => {
    if (!stored) return false;
    return isHash(stored) ? bcrypt.compare(plain, stored) : stored === plain;
};

/**
 * @throws PasswordChangeError — foydalanuvchiga ko'rsatsa bo'ladigan matn bilan
 */
export async function changeOwnPassword(db: any, user: any, currentPassword: any, newPassword: any): Promise<void> {
    const account = accountOf(user);
    if (!account) throw new PasswordChangeError("Bu akkaunt parolini bu yerdan almashtirib bo'lmaydi");

    // Login kiritilgan parolni trim qiladi — bu yerda ham shunday, aks holda
    // boshida yoki oxirida bo'sh joy bor parol bilan hech qachon kirib bo'lmasdi.
    const current = String(currentPassword ?? '').trim();
    const next = String(newPassword ?? '').trim();
    if (!current) throw new PasswordChangeError('Joriy parolni kiriting');
    if (next.length < PASSWORD_MIN) throw new PasswordChangeError(`Yangi parol kamida ${PASSWORD_MIN} ta belgidan iborat bo'lishi kerak`);
    if (Buffer.byteLength(next, 'utf8') > PASSWORD_MAX) throw new PasswordChangeError('Yangi parol juda uzun');
    if (next === current) throw new PasswordChangeError('Yangi parol joriy paroldan farq qilishi kerak');

    const row = await db[account.model].findUnique({ where: { id: account.id }, select: { id: true, password: true } });
    if (!row || !(await matches(current, row.password))) throw new PasswordChangeError("Joriy parol noto'g'ri");

    await db[account.model].update({ where: { id: account.id }, data: { password: await bcrypt.hash(next, 10) } });

    // Parol almashdi: eski parolni bilgan odamning yordam botidagi ulanishi ham bekor bo'ladi
    // (aks holda u parol almashgandan keyin ham rahbar sifatida botdan foydalanardi).
    // Foydalanuvchining o'zi "Yordam" tugmasi bilan bir bosishda qayta ulanadi.
    const clinicId = account.model === 'clinic' ? account.id : user.clinicId;
    if (clinicId && user.role !== 'SALES_AGENT') {
        const staffId = account.model === 'clinic' ? null : account.id;
        await revokeSupportLinks(db, { clinicId, role: user.role, staffId })
            .catch((e: any) => console.warn('[support] ulanishni bekor qilib bo\'lmadi:', e?.message));
    }
}
