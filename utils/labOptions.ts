/**
 * Laboratoriya buyurtmasidagi "Buyurtma turi" va "Material" ro'yxatlari.
 * Klinika ularni Sozlamalar → Xizmatlar va narxlar'da o'zi tuzadi; tegmagan bo'lsa —
 * shu standart ro'yxat. Standart nomlar ekranda tarjima qilinadi (tLabel), klinika
 * yozgan nomlar qanday yozilgan bo'lsa shunday ko'rinadi.
 */
export const DEFAULT_ORDER_TYPES = ['Koronka', 'Ko\'chma protez', 'Qo\'zg\'almas protez', 'Veneer', 'Implant ustama', 'Breket', 'Kappaterapiya', 'Reteyner', 'Boshqa'];
export const DEFAULT_MATERIALS = ['Metallkeramika', 'Zirkoniya', 'E-max (Litiy disilkat)', 'Akrilik', 'Metal', 'Kompozit', 'Boshqa'];

/** Server bilan bir xil cheklovlar (backend/server.ts → cleanLabList) */
export const LAB_LIST_MAX_ITEMS = 50;
export const LAB_ITEM_MAX_LEN = 60;

export interface LabOptions {
    /** null — klinika ro'yxatni o'zgartirmagan, standart ishlatiladi */
    orderTypes: string[] | null;
    materials: string[] | null;
}

/** Bo'shliqlarni tozalaydi; bo'sh va takroriy (katta-kichik harfdan qat'i nazar) nomlarni tashlaydi */
export const cleanLabList = (items: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
        const name = item.replace(/\s+/g, ' ').trim().slice(0, LAB_ITEM_MAX_LEN);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
        if (out.length >= LAB_LIST_MAX_ITEMS) break;
    }
    return out;
};

/**
 * Oynada ko'rsatiladigan variantlar. Tahrirlanayotgan buyurtmaning qiymati ro'yxatdan
 * olib tashlangan bo'lsa ham — u yo'qolib qolmasin, oxirida qo'shiladi.
 */
export const labChoices = (list: string[], current?: string): string[] =>
    current && !list.some(x => x.toLowerCase() === current.toLowerCase()) ? [...list, current] : list;
