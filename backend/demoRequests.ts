/**
 * DentaCRM sotuv voronkasiga (DemoRequest -> SuperAdmin > Lidlar) lid saqlash.
 *
 * Bitta odam arizani ikkinchi marta qoldirsa ham YANGI karta ochiladi: u boshqa
 * lidlar kabi "Taqsimlanmagan" ustuniga tushadi, kartada esa kichik "Dublikat"
 * belgisi turadi (oldingi kartalar o'z joyida qoladi). Takror ariza eski kartaga
 * yozilganda sotuvchi uni band kartalar orasida payqamay qolardi.
 *
 * Belgi bazada saqlanmaydi — bir xil raqamli kartalar sanab chiqiladi
 * (earlierApplications). Jadvalga yangi ustun kerak emas.
 *
 * Faqat tugmani ikki marta bosish yoki tashqi servisning qayta yuborishi
 * (DOUBLE_SUBMIT_MS ichida) yangi karta ochmaydi.
 */

/**
 * Eski belgi: 2026-10-08/09 kunlari takror ariza eski kartaning izohiga shu qator bilan
 * yozilgan. Yangi qator yozilmaydi; kartadagi "Dublikat" belgisi eski qatorlarni ham
 * hisobga oladi (pages/SuperAdminDashboard.tsx dagi nusxasi bilan bir xil bo'lishi shart).
 */
export const DEMO_REPEAT_MARK = '🔁 Qayta ariza qoldirdi';

const DOUBLE_SUBMIT_MS = 15 * 60 * 1000;

// Raqamsiz ("N/A") lidlarni bir-biri bilan solishtirib bo'lmaydi.
const REAL_PHONE = /^\+\d{7,15}$/;

// Ariza qabul qilingach beriladigan savol: "Klinikangizda nechta shifokor ishlaydi?".
// Savol ataylab forma ICHIDA emas — 2026-10-09 da u forma boshida turganida bir
// yarim kun ichida birorta ham ariza tushmagan. Avval lid olinadi, keyin so'raladi.
const DOCTORS_ANSWERS = new Map([['1-2', '1–2'], ['3-5', '3–5'], ['6+', '6 va undan ko\'p']]);
const DOCTORS_NO_CLINIC = 'none';
const DOCTORS_NOTE_PREFIX = 'Shifokorlar soni:';
/** Kartadagi "Klinikasi yo'q" belgisi shu qatorga qaraydi (pages/SuperAdminDashboard.tsx). */
export const NO_CLINIC_NOTE = 'Klinikasi yo\'q (o\'zi belgiladi)';
// Javob faqat ariza qoldirilgan zahoti qabul qilinadi
const ANSWER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Javobni lid izohining boshiga yozadi. Bir lid uchun bir marta; noto'g'ri yoki
 * kechikkan so'rov jimgina e'tiborsiz qoldiriladi (ochiq manzil bo'lgani uchun).
 */
export async function saveDoctorsAnswer(db: any, leadId: unknown, answer: unknown, now: Date = new Date()): Promise<boolean> {
    if (typeof leadId !== 'string' || !/^[0-9a-f-]{36}$/i.test(leadId) || typeof answer !== 'string') return false;

    const answerLabel = DOCTORS_ANSWERS.get(answer);
    const line = answer === DOCTORS_NO_CLINIC ? NO_CLINIC_NOTE : answerLabel ? `${DOCTORS_NOTE_PREFIX} ${answerLabel}` : null;
    if (!line) return false;

    const lead = await db.demoRequest.findUnique({ where: { id: leadId }, select: { id: true, notes: true, createdAt: true } });
    if (!lead) return false;

    const notes = String(lead.notes || '');
    const isLate = now.getTime() - new Date(lead.createdAt).getTime() > ANSWER_WINDOW_MS;
    if (isLate || notes.includes(DOCTORS_NOTE_PREFIX) || notes.includes(NO_CLINIC_NOTE)) return false;

    await db.demoRequest.update({ where: { id: lead.id }, data: { notes: [line, lead.notes].filter(Boolean).join('\n') } });
    return true;
}

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

// Tugmani ikki marta bosish yoki tashqi servisning qayta yuborishi — bu qayta ariza emas.
const isRecent = (at: Date | string, now: Date): boolean =>
    now.getTime() - new Date(at).getTime() < DOUBLE_SUBMIT_MS;

/**
 * Lidni saqlaydi — har bir ariza alohida karta.
 *
 * repeat=true — bu raqam oldin ham ariza qoldirgan (Meta'ga "yangi lid" deb xabar
 * berilmaydi). created=false — karta ochilmadi: xuddi shu ariza bir necha daqiqa
 * ichida ikkinchi marta keldi (tugma ikki marta bosildi).
 *
 * db — Prisma mijozi; parametr sifatida olinadi, shunda bazasiz tekshirish mumkin.
 */
export async function saveDemoRequest(
    db: any,
    input: DemoRequestInput,
    now: Date = new Date()
): Promise<{ id: string; repeat: boolean; created: boolean }> {
    const existing = REAL_PHONE.test(input.phone)
        ? await db.demoRequest.findFirst({ where: { phone: input.phone }, orderBy: { createdAt: 'desc' } })
        : null;

    if (existing && isRecent(existing.createdAt, now)) {
        return { id: existing.id, repeat: true, created: false };
    }

    const created = await db.demoRequest.create({
        data: {
            name: input.name,
            phone: input.phone,
            clinicName: input.clinicName || null,
            city: input.city || null,
            doctorsCount: input.doctorsCount ?? null,
            source: input.source,
            notes: input.notes || null,
            // Yangi lid (dublikat ham) avval superadminning "Taqsimlanmagan" ustuniga tushadi
            status: 'Inbox',
        },
    });
    return { id: created.id, repeat: !!existing, created: true };
}

/**
 * Dublikatlar: har bir karta uchun shu raqamdan undan OLDIN nechta karta ochilgani.
 * Birinchi (asl) karta ro'yxatga kirmaydi — belgi faqat keyingilarida turadi.
 * Butun ro'yxat bo'yicha sanaladi, shuning uchun sotuvchi o'ziga ko'rinmaydigan
 * (boshqaga biriktirilgan yoki yashirilgan) oldingi karta borligini ham biladi.
 */
export function earlierApplications(
    rows: Array<{ id: string; phone?: string | null; createdAt: Date | string }>
): Record<string, number> {
    const byPhone = new Map<string, Array<{ id: string; at: number }>>();
    for (const r of rows) {
        const phone = r.phone || '';
        if (!REAL_PHONE.test(phone)) continue;
        const list = byPhone.get(phone) || [];
        list.push({ id: r.id, at: new Date(r.createdAt).getTime() });
        byPhone.set(phone, list);
    }
    const out: Record<string, number> = {};
    for (const list of byPhone.values()) {
        if (list.length < 2) continue;
        list.sort((a, b) => a.at - b.at);
        list.forEach((x, i) => { if (i > 0) out[x.id] = i; });
    }
    return out;
}
