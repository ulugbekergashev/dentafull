/**
 * Qo'llanmani havola orqali ochish: yordam boti `https://dentacrm.uz/?guide=task-payment`
 * kabi havola yuboradi.
 *
 * Havola bosilganda xodim tizimga kirmagan bo'lishi mumkin, shuning uchun qo'llanma nomi
 * shu oynaning xotirasida (sessionStorage) kutib turadi: kirgandan va ma'lumot yuklangandan
 * keyin App uni oladi va O'quv markazini ochadi.
 */
const PARAM = 'guide';
const PENDING_KEY = 'denta_guide_pending_v1';
/** Kirish cho'zilib ketsa, eskirgan havola kutilmaganda ochilib qolmasin */
const PENDING_TTL_MS = 30 * 60 * 1000;
const GUIDE_ID = /^[a-z0-9-]{1,40}$/i;

/**
 * Manzildagi `?guide=` qiymati. null — parametr yo'q.
 * Bo'sh yoki noto'g'ri qiymat '' bo'lib qaytadi: O'quv markazining o'zi ochiladi.
 */
export function readGuideParam(search: string): string | null {
    const params = new URLSearchParams(search);
    if (!params.has(PARAM)) return null;
    const value = (params.get(PARAM) || '').trim();
    return GUIDE_ID.test(value) ? value : '';
}

/** Manzilning `?guide=`siz qolgan qismi ("" yoki "?tab=services") */
export function stripGuideParam(search: string): string {
    const params = new URLSearchParams(search);
    params.delete(PARAM);
    const rest = params.toString();
    return rest ? `?${rest}` : '';
}

export function stashPendingGuide(id: string): void {
    try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id, at: Date.now() }));
    } catch { /* xotira yopiq — qo'llanma ochilmaydi, ilova odatdagidek ishlaydi */ }
}

/** Kutib turgan qo'llanmani oladi va o'chiradi. null — kutayotgani yo'q ('' — markazning o'zi) */
export function takePendingGuide(): string | null {
    try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(PENDING_KEY);
        const parsed = JSON.parse(raw);
        if (typeof parsed?.id !== 'string' || typeof parsed?.at !== 'number') return null;
        if (Date.now() - parsed.at > PENDING_TTL_MS) return null;
        return GUIDE_ID.test(parsed.id) ? parsed.id : '';
    } catch {
        return null;
    }
}
