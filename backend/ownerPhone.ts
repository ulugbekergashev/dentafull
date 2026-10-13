// Rahbar raqami — klinika egasining Telegram'dagi shaxsi. Klinika botiga shu
// raqam bilan ulangan odam "rahbar" bo'ladi: moliya hisobotlarini oladi va
// yordam botida egasi nomidan amal so'ray oladi. Shuning uchun raqamni faqat
// klinika rahbarining o'zi (yoki super admin) o'zgartira oladi.
//
// Ilgari "Standart" ruxsatli resepshn Sozlamalarda raqamni o'z raqamiga
// almashtirib, shu zahoti rahbar sifatida ulanib qolishi mumkin edi.

import { revokeSupportLinks } from './support/identity';

/** Raqamning oxirgi 9 xonasi: "+998 90 123-45-67" va "901234567" bir xil */
export const phoneKey = (p?: string | null): string => String(p || '').replace(/\D/g, '').slice(-9);

export const OWNER_PHONE_FORBIDDEN = "Rahbar raqamini faqat klinika rahbari o'zgartira oladi";

export class OwnerPhoneForbidden extends Error {
    constructor() {
        super(OWNER_PHONE_FORBIDDEN);
        this.name = 'OwnerPhoneForbidden';
    }
}

const MAY_CHANGE = new Set(['CLINIC_ADMIN', 'SUPER_ADMIN']);

/**
 * Klinikani yangilashda `data` ga qo'shiladigan maydonlar.
 *
 * Raqam o'zgarsa eski rahbarning Telegram ulanishi uziladi (hisobotlar endi
 * unga bormasin). Yangi raqam egasi shu klinika botiga shifokor yoki resepshn
 * sifatida allaqachon ulangan bo'lsa — darhol rahbar sifatida ham ulanadi,
 * aks holda botga /start bosib telefon raqamini yuborishi kerak.
 *
 * @throws OwnerPhoneForbidden — rahbar bo'lmagan odam raqamni o'zgartirmoqchi bo'lsa
 */
export async function ownerPhoneData(
    db: any,
    clinicId: string,
    ownerPhone: any,
    role: string | undefined
): Promise<{ ownerPhone?: string | null; telegramChatId?: string | null }> {
    if (ownerPhone === undefined) return {};
    const next = String(ownerPhone || '').trim() || null;
    const current = await db.clinic.findUnique({ where: { id: clinicId }, select: { ownerPhone: true } });
    const unchanged = phoneKey(current?.ownerPhone) === phoneKey(next);
    const mayChange = MAY_CHANGE.has(String(role));

    // Sozlamalar formasi hamma maydonni birga yuboradi — o'zgarmagan raqam xato emas
    if (unchanged) return mayChange ? { ownerPhone: next } : {};
    if (!mayChange) throw new OwnerPhoneForbidden();

    // Rahbar raqami o'zgardi: eski raqam bo'yicha (telefon orqali) yordam botiga ulangan "rahbar"
    // endi rahbar emas. Ilova orqali ulangan rahbarga tegilmaydi — u o'zi o'zgartirgan bo'lishi mumkin.
    await revokeSupportLinks(db, { clinicId, role: 'CLINIC_ADMIN', via: 'phone' })
        .catch((e: any) => console.warn("[support] ulanishni bekor qilib bo'lmadi:", e?.message));

    let telegramChatId: string | null = null;
    const key = phoneKey(next);
    if (key.length === 9) {
        const candidates = await Promise.all([
            db.doctor.findMany({ where: { clinicId, telegramChatId: { not: null } }, select: { phone: true, telegramChatId: true } }),
            db.receptionist.findMany({ where: { clinicId, telegramChatId: { not: null } }, select: { phone: true, telegramChatId: true } }),
        ]);
        telegramChatId = candidates.flat().find((x: any) => phoneKey(x.phone) === key)?.telegramChatId || null;
    }
    return { ownerPhone: next, telegramChatId };
}
