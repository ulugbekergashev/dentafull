// ─── Klinika konteksti ────────────────────────────────────────────────────────
//
// Ilgari system prompt barcha klinikalar uchun bir xil edi. Natijada AI o'zi
// xizmat qilayotgan klinikaning nomini ham, shifokorlarini ham, narxlarini ham
// bilmasdi. "Implant qancha turadi?" degan savolga u umumiy javob berardi —
// go'yo internetdagi chatbot, ilova ichidagi yordamchi emas.
//
// Bu fayl har bir klinika uchun ~300 tokenlik qisqa "profil" quradi va uni
// system promptga qo'shadi. Uch narsani beradi:
//
//   1. AI shifokorlarni ISM bilan biladi — "Rahimovga nechta bemor yozilgan?"
//      degan savolda endi tool argumentini to'g'ri to'ldiradi.
//   2. Narxlar ma'lum — narx savoliga tool chaqirmasdan javob bera oladi.
//   3. Ish vaqti ma'lum — "ertaga bo'sh joy bormi?" savolida chegara to'g'ri.
//
// Profil KESHLANADI. Aks holda har bir savol oldidan to'rtta qo'shimcha DB
// so'rovi ketardi va 1-punktdagi tezlik yutug'i yo'qqa chiqardi.

const { prisma } = require('../db');
import { searchVariants } from './translit';
import { fuzzyFind, confidentPick } from './fuzzy';

/** Profil qancha vaqt keshda turadi. Shifokor/narx kuniga bir marta o'zgaradi. */
const TTL_MS = Number(process.env.AI_CONTEXT_TTL_MS || 30 * 60 * 1000);

/** Profil qurish shundan cho'zilsa — profilsiz davom etamiz. */
const PROFILE_TIMEOUT_MS = Number(process.env.AI_CONTEXT_TIMEOUT_MS || 3000);

interface CachedProfile {
    text: string;
    doctors: { id: string; name: string }[];
    expiresAt: number;
}

const cache = new Map<string, CachedProfile>();

/** Keshni majburan tozalash — shifokor yoki narx o'zgarganda chaqiriladi. */
export const invalidateClinicContext = (clinicId: string): void => {
    cache.delete(clinicId);
};

const som = (n: number): string => Math.round(n).toLocaleString('ru-RU');

/**
 * Klinika profilini quradi.
 *
 * Hamma so'rov parallel ketadi — ketma-ket bo'lsa profil qurish 4 ta DB
 * borishiga teng kechikish qo'shardi.
 */
const buildProfile = async (clinicId: string): Promise<CachedProfile> => {
    const [clinic, doctors, services, patientCount] = await Promise.all([
        prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { name: true, startHour: true, endHour: true, address: true },
        }),
        prisma.doctor.findMany({
            where: { clinicId, status: 'Active' },
            select: { id: true, firstName: true, lastName: true, specialty: true },
            take: 40,
        }),
        prisma.service.findMany({
            where: { clinicId },
            select: { name: true, price: true },
            orderBy: { price: 'desc' },
            take: 12,
        }),
        prisma.patient.count({ where: { clinicId, status: 'Active' } }),
    ]);

    const lines: string[] = [];

    if (clinic?.name) lines.push(`Klinika: ${clinic.name}.`);
    if (clinic?.startHour !== undefined && clinic?.endHour !== undefined) {
        lines.push(`Ish vaqti: ${clinic.startHour}:00 — ${clinic.endHour}:00.`);
    }
    lines.push(`Faol bemorlar: ${patientCount} ta.`);

    if (doctors.length) {
        const list = doctors
            .map((d: any) => `${d.lastName} ${d.firstName}${d.specialty ? ` (${d.specialty})` : ''}`)
            .join('; ');
        lines.push(`Shifokorlar (${doctors.length} ta): ${list}.`);
    }

    if (services.length) {
        const list = services.map((s: any) => `${s.name} — ${som(s.price)}`).join('; ');
        lines.push(`Xizmat narxlari (so'mda): ${list}.`);
    }

    return {
        text: lines.join('\n'),
        doctors: doctors.map((d: any) => ({ id: d.id, name: `${d.lastName} ${d.firstName}` })),
        expiresAt: Date.now() + TTL_MS,
    };
};

/**
 * Klinika profilini qaytaradi (keshdan yoki yangidan quradi).
 *
 * Xatolik yuz bersa bo'sh matn qaytadi — profil qulaylik, majburiyat emas.
 * Uning yo'qligi AI ni to'xtatmasligi kerak.
 */
export const clinicContext = async (clinicId: string | null | undefined): Promise<string> => {
    if (!clinicId) return '';
    const hit = cache.get(clinicId);
    if (hit && hit.expiresAt > Date.now()) return hit.text;

    try {
        // Vaqt chegarasi MAJBURIY. Bu funksiya har bir AI so'rovidan OLDIN
        // chaqiriladi va to'rtta DB so'rovi qiladi. Ilgari chegara yo'q edi:
        // baza sekinlashsa, so'rov modelga umuman yetib bormasdan qotib
        // qolardi — va AI qatlamidagi muddat chegarasi ham ishga tushmasdi,
        // chunki u faqat model chaqiruvini o'raydi.
        //
        // Profil — QULAYLIK. Usiz javob biroz umumiyroq bo'ladi, xolos.
        // Uning uchun foydalanuvchini kuttirish mumkin emas.
        const profile = await Promise.race([
            buildProfile(clinicId),
            new Promise<null>(resolve => setTimeout(() => resolve(null), PROFILE_TIMEOUT_MS)),
        ]);

        if (!profile) {
            console.warn(`[AI:context] profil ${PROFILE_TIMEOUT_MS}ms ichida qurilmadi — profilsiz davom etamiz.`);
            return '';
        }

        cache.set(clinicId, profile);
        return profile.text;
    } catch (e: any) {
        console.warn('[AI:context] profil qurilmadi:', e?.message);
        return '';
    }
};

/** Shifokor ismini id ga aylantiradi — yozuvchi tool'lar uchun kerak. */
export const resolveDoctor = async (
    clinicId: string,
    name: string
): Promise<{ id: string; name: string } | null> => {
    if (!name) return null;
    const hit = cache.get(clinicId);
    const list = hit && hit.expiresAt > Date.now()
        ? hit.doctors
        : (await buildProfile(clinicId).then(p => { cache.set(clinicId, p); return p.doctors; }).catch(() => []));

    // Shifokor ismi ham ikkala alifboda kelishi mumkin ("Рахимов" /
    // "Rahimov") — ayniqsa ovoz orqali. Batafsil: ai/translit.ts
    const variants = searchVariants(name.trim());
    if (!variants.length) return null;

    const match = (d: { name: string }, fn: (n: string, v: string) => boolean) =>
        variants.some(v => fn(d.name.toLowerCase(), v));

    const exact = list.find(d => match(d, (n, v) => n === v));
    if (exact) return exact;

    const partial = list.filter(d => match(d, (n, v) => n.includes(v)));
    if (partial.length === 1) return partial[0];
    // Bir nechta shifokorga mos kelsa — noaniq, tanlab bermaymiz.
    if (partial.length > 1) return null;

    // Aniq moslik yo'q — xatolarga chidamli qidiruv. "Рахимов" o'rniga
    // "Raximov" yozilgan yoki ovoz bir harfni buzgan bo'lishi mumkin.
    // Batafsil: ai/fuzzy.ts
    const hits = fuzzyFind(
        name,
        list.map(d => {
            const parts = d.name.split(' ');
            return { id: d.id, lastName: parts[0] || d.name, firstName: parts.slice(1).join(' ') };
        })
    );
    const pick = confidentPick(hits);
    return pick ? list.find(d => d.id === pick.id) || null : null;
};
