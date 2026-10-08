/**
 * DentaCRM sotuv voronkasiga (DemoRequest -> SuperAdmin > Lidlar) lid saqlash.
 *
 * Bitta odam arizani ikkinchi marta qoldirsa YANGI karta ochilmaydi — eski
 * kartaga "qayta ariza qoldirdi" qatori yoziladi. Odamlar qo'ng'iroqni kutib
 * 1-2 soatdan keyin yana qoldiradi yoki raqamimizni yo'qotib qo'yib qayta
 * yozadi; har safar yangi karta ochilsa, sotuvchi bitta odamga ikki marta
 * qo'ng'iroq qiladi va lidlar soni sun'iy ko'payadi.
 *
 * Belgi notes ustunida turadi — jadvalga yangi ustun kerak emas. Kartadagi
 * "Qayta qoldirdi" belgisi shu qatorlarni sanaydi (pages/SuperAdminDashboard.tsx).
 */

/** Qayta ariza qatorining boshi. SuperAdminDashboard.tsx dagi nusxasi bilan bir xil bo'lishi shart. */
export const DEMO_REPEAT_MARK = '🔁 Qayta ariza qoldirdi';

const DOUBLE_SUBMIT_MS = 15 * 60 * 1000;

// Bu ustunlarga hech kim qaramaydi. Qayta ariza qoldirgan odam qo'ng'iroq
// kutyapti — karta "Yangi lidlar" ga qaytmasa, u jimgina yo'qoladi.
const REVIVE_STATUSES = ['Cancelled', 'NoAnswer'];

// Raqamsiz ("N/A") lidlarni bir-biri bilan birlashtirib bo'lmaydi.
const REAL_PHONE = /^\+\d{7,15}$/;

export interface DemoRequestInput {
    name: string;
    /** Yagona formatga keltirilgan raqam: +998XXXXXXXXX */
    phone: string;
    clinicName?: string | null;
    city?: string | null;
    doctorsCount?: number | null;
    source: string;
    notes?: string | null;
}

/** Manba nomi kartadagi yozuvlar bilan bir xil: LIFETIME / OYLIK. */
const sourceLabel = (source: string): string => {
    if (source.startsWith('ad-lifetime')) return 'reklama, LIFETIME';
    if (source.startsWith('ad-monthly')) return 'reklama, OYLIK';
    if (source === 'landing') return 'sayt';
    // Manba ochiq formadan keladi: qator uzilishi qolsa, soxta "qayta ariza" qatori yozib bo'lardi
    return source.replace(/\s+/g, ' ').trim();
};

// Tugmani ikki marta bosish yoki tashqi servisning qayta yuborishi — bu qayta ariza emas.
const isRecent = (at: Date | string, now: Date): boolean =>
    now.getTime() - new Date(at).getTime() < DOUBLE_SUBMIT_MS;

const tashkentStamp = (at: Date): string =>
    at.toLocaleString('ru-RU', {
        timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).replace(',', '');

/**
 * Lidni saqlaydi. Shu raqam oldin ariza qoldirgan bo'lsa, o'sha kartani
 * yangilaydi va repeat=true qaytaradi.
 *
 * db — Prisma mijozi; parametr sifatida olinadi, shunda bazasiz tekshirish mumkin.
 */
export async function saveDemoRequest(
    db: any,
    input: DemoRequestInput,
    now: Date = new Date()
): Promise<{ id: string; repeat: boolean }> {
    const existing = REAL_PHONE.test(input.phone)
        ? await db.demoRequest.findFirst({ where: { phone: input.phone }, orderBy: { createdAt: 'desc' } })
        : null;

    if (!existing) {
        const created = await db.demoRequest.create({
            data: {
                name: input.name,
                phone: input.phone,
                clinicName: input.clinicName || null,
                city: input.city || null,
                doctorsCount: input.doctorsCount ?? null,
                source: input.source,
                notes: input.notes || null,
                // Yangi lid avval superadminning "Taqsimlanmagan" ustuniga tushadi
                status: 'Inbox',
            },
        });
        return { id: created.id, repeat: false };
    }

    // Faqat o'zgargan maydonlar yoziladi — sotuvchi shu payt kartani tahrirlayotgan
    // bo'lsa, uning o'zgarishi eski qiymat bilan bosilib ketmasin.
    const data: Record<string, unknown> = {};
    if (REVIVE_STATUSES.includes(existing.status)) data.status = 'New';

    const lastLine = String(existing.notes || '').split('\n').pop() || '';
    const justMarked = lastLine.startsWith(DEMO_REPEAT_MARK) && isRecent(existing.updatedAt, now);

    if (!isRecent(existing.createdAt, now) && !justMarked) {
        const line = `${DEMO_REPEAT_MARK}: ${tashkentStamp(now)} (${sourceLabel(input.source)})`;
        // Ikkinchi arizada yangi ma'lumot kelishi mumkin (masalan, Facebook formasining javoblari)
        const extra = input.notes && !String(existing.notes || '').includes(input.notes) ? input.notes : null;
        // Belgi doim oxirgi qator bo'lib turadi — yuqoridagi "hozirgina belgilandi" tekshiruvi shunga tayanadi
        data.notes = [existing.notes, extra, line].filter(Boolean).join('\n');

        if (!existing.clinicName && input.clinicName) data.clinicName = input.clinicName;
        if (!existing.city && input.city) data.city = input.city;
        if (existing.doctorsCount == null && input.doctorsCount != null) data.doctorsCount = input.doctorsCount;
    }

    if (Object.keys(data).length > 0) {
        await db.demoRequest.update({ where: { id: existing.id }, data });
    }
    return { id: existing.id, repeat: true };
}
