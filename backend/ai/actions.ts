// ─── Yozuvchi tool'lar (harakat qatlami) ──────────────────────────────────────
//
// ai/tools.ts faqat O'QIYDI. Bu fayl — AI ning ish bajaradigan qismi.
//
// Farqi bitta, lekin tubdan: bu yerdagi tool'lar bazani o'zgartiradi va
// tashqariga xabar yuboradi. Shuning uchun model ularni O'ZI BAJARA OLMAYDI.
//
// Protokol:
//
//   1. Model `send_reminder` ni chaqiradi.
//   2. runAction BAJARMAYDI — `{ pending: true, preview: {...} }` qaytaradi.
//   3. Server preview'ni saqlaydi va foydalanuvchiga ko'rsatadi.
//   4. Foydalanuvchi "Yuborish" ni bosadi -> POST /api/ai/act.
//   5. Faqat SHUNDA `executeAction` ishlaydi.
//
// Nega saqlaymiz va id bo'yicha bajaramiz: agar mijoz /api/ai/act ga o'zi
// xohlagan argumentni yuborsa, tasdiqlash oynasi bezakka aylanardi —
// ko'rsatilgan narsa bilan bajariladigan narsa boshqa bo'lishi mumkin edi.
// Endi bajariladigani AYNAN ko'rsatilgani: server o'zi saqlagan nusxani
// ishlatadi, mijozdan faqat id oladi.

const { prisma } = require('../db');
import { ToolContext, searchPatients } from './tools';
import { invalidateToolCache } from './router';
import { resolveDoctor, invalidateClinicContext } from './context';

// ─── Ta'riflar ───────────────────────────────────────────────────────────────

export interface ActionDef {
    name: string;
    description: string;
    parameters: Record<string, any>;
    roles: string[];
}

const ADMIN = ['SUPER_ADMIN', 'CLINIC_ADMIN'];
const FRONT_DESK = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'];

export const ACTION_DEFS: ActionDef[] = [
    {
        name: 'send_reminder',
        description:
            'Bemorlar guruhiga eslatma xabari yuboradi (Telegram yoki SMS). ' +
            'Guruh: qarzdorlar, kelmagan bemorlar yoki ertangi qabulga yozilganlar. ' +
            '"Qarzdorlarga eslatma yubor" kabi buyruqlar uchun. ' +
            'DIQQAT: bu harakat foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                target: {
                    type: 'string',
                    enum: ['debtors', 'noshow', 'tomorrow'],
                    description: 'debtors — qarzdorlar; noshow — oxirgi 30 kunda kelmaganlar; tomorrow — ertangi qabulga yozilganlar',
                },
                message: {
                    type: 'string',
                    description: 'Xabar matni. Berilmasa standart matn ishlatiladi.',
                },
                limit: { type: 'integer', description: 'Nechta bemorga yuborilsin (standart 20, maksimum 50)' },
            },
            required: ['target'],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'book_appointment',
        description:
            'Bemorni qabulga yozadi. Bemor va shifokor nomi aniq bo\'lishi shart. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                patientQuery: { type: 'string', description: 'Bemor ismi yoki telefoni' },
                doctorName: { type: 'string', description: 'Shifokor familiyasi' },
                date: { type: 'string', description: 'Sana, YYYY-MM-DD' },
                time: { type: 'string', description: 'Vaqt, HH:MM' },
                type: { type: 'string', description: 'Qabul turi (masalan "Konsultatsiya")' },
                duration: { type: 'integer', description: 'Davomiyligi, daqiqa (standart 30)' },
            },
            required: ['patientQuery', 'doctorName', 'date', 'time'],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'update_lead_status',
        description:
            'Lid holatini o\'zgartiradi (bog\'lanildi, o\'ylayapti, yozildi, bekor). ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                leadQuery: { type: 'string', description: 'Lid ismi yoki telefoni' },
                status: {
                    type: 'string',
                    enum: ['New', 'Contacted', 'Thinking', 'Booked', 'Cancelled'],
                },
                note: { type: 'string', description: 'Qo\'shimcha izoh' },
            },
            required: ['leadQuery', 'status'],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'add_charge',
        description:
            'Bemorga to\'lanmagan hisob (qarz) yozadi. "Falonchiga 500 ming qarz ' +
            'yozib qo\'y", "Aliyevga koronka uchun 1 million yozib qo\'y" kabi ' +
            'buyruqlar uchun. Bu XARAJAT EMAS — xarajat klinikaning o\'z puli, ' +
            'bu esa bemorning klinikaga qarzi. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                patientQuery: { type: 'string', description: 'Bemor ismi yoki telefoni' },
                amount: { type: 'number', description: 'Summa, so\'mda' },
                service: { type: 'string', description: 'Nima uchun (masalan "Koronka"). Berilmasa "Xizmat".' },
                date: { type: 'string', description: 'Sana, YYYY-MM-DD. Berilmasa bugungi.' },
            },
            required: ['patientQuery', 'amount'],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'create_expense',
        description:
            'Klinikaning xarajatini yozadi (ijara, kommunal, material, laboratoriya). ' +
            '"Bugun 200 ming ijara to\'ladik" kabi buyruqlar uchun. ' +
            'Shifokorga yoki xodimga to\'lov uchun BUNI ISHLATMA — pay_doctor bor. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                amount: { type: 'number', description: 'Summa, so\'mda' },
                category: {
                    type: 'string',
                    // Qiymatlar ilovaning O'Z ro'yxatidan (types.ts,
                    // EXPENSE_CATEGORY_LABELS). Ilgari bu yerda erkin matn
                    // edi ("Ijara") va u bazaga o'sha holicha tushardi —
                    // ilova esa 'Rent' kutadi, natijada toifa hech qayerda
                    // to'g'ri ko'rinmasdi.
                    enum: ['Rent', 'Utilities', 'Inventory', 'Lab', 'Other'],
                    description: 'Rent — ijara; Utilities — kommunal; Inventory — ombor/material; Lab — laboratoriya; Other — boshqa',
                },
                title: { type: 'string', description: 'Qisqacha nomi' },
                date: { type: 'string', description: 'Sana, YYYY-MM-DD. Berilmasa bugungi.' },
            },
            required: ['amount', 'category'],
        },
        roles: ADMIN,
    },
    {
        name: 'send_message',
        description:
            'BITTA bemorga xabar yuboradi (Telegram yoki SMS). "Aliyevga xabar ' +
            'yubor", "Karimovga eslatib qo\'y" kabi buyruqlar uchun. ' +
            'Bir nechta bemorga birdan yuborish uchun send_reminder ishlatiladi. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                patientQuery: { type: 'string', description: 'Bemor ismi yoki telefoni' },
                message: { type: 'string', description: 'Xabar matni' },
            },
            required: ['patientQuery', 'message'],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'record_payment',
        description:
            'Bemordan to\'lov qabul qilinganini yozadi. "Aliyev 500 ming to\'ladi", ' +
            '"Karimov qarzini yopdi" kabi buyruqlar uchun. Bemorda to\'lanmagan ' +
            'hisob bo\'lsa, u avtomatik yopiladi. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                patientQuery: { type: 'string', description: 'Bemor ismi yoki telefoni' },
                amount: { type: 'number', description: 'To\'langan summa, so\'mda' },
                method: {
                    type: 'string',
                    enum: ['Cash', 'Card', 'Click', 'Transfer'],
                    description: 'To\'lov usuli. Berilmasa Cash (naqd).',
                },
                date: { type: 'string', description: 'Sana, YYYY-MM-DD. Berilmasa bugungi.' },
            },
            required: ['patientQuery', 'amount'],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'pay_doctor',
        description:
            'Shifokorga to\'lov (oylik yoki ulush) yozadi. "Rahimovga 3 million ' +
            'berdim", "Karimovaga oyligini to\'ladim" kabi buyruqlar uchun. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                doctorName: { type: 'string', description: 'Shifokor familiyasi yoki ismi' },
                amount: { type: 'number', description: 'Summa, so\'mda' },
                date: { type: 'string', description: 'Sana, YYYY-MM-DD. Berilmasa bugungi.' },
                note: { type: 'string', description: 'Izoh' },
            },
            required: ['doctorName', 'amount'],
        },
        roles: ADMIN,
    },
    {
        name: 'update_doctor_pay',
        description:
            'Shifokorning ish haqi shartlarini o\'zgartiradi: foizi yoki belgilangan ' +
            'oyligi. "Rahimovning foizini 40 ga tushir", "Karimovaga fiks 5 million ' +
            'qil" kabi buyruqlar uchun. ' +
            'DIQQAT: foydalanuvchi tasdiqlagandan keyin bajariladi.',
        parameters: {
            type: 'object',
            properties: {
                doctorName: { type: 'string', description: 'Shifokor familiyasi yoki ismi' },
                percentage: { type: 'number', description: 'Shifokor ulushi foizda (0-100)' },
                fixedSalary: { type: 'number', description: 'Belgilangan oylik, so\'mda' },
            },
            required: ['doctorName'],
        },
        roles: ADMIN,
    },
];

/** OpenAI formatidagi ta'riflar — faqat ruxsat etilgan rollar uchun. */
export const actionsForRole = (role: string) =>
    ACTION_DEFS
        .filter(a => a.roles.includes(role))
        .map(a => ({
            type: 'function' as const,
            function: { name: a.name, description: a.description, parameters: a.parameters },
        }));

export const isAction = (name: string): boolean => ACTION_DEFS.some(a => a.name === name);

/**
 * Tasdiq kutayotgan harakat uchun modelga beriladigan ko'rsatma.
 *
 * Shu yerda turibdi, endpoint ichida emas — chunki uni sinovda ham AYNAN
 * shu ko'rinishda ishlatish shart. Nusxa ko'chirilganda test productionda
 * o'zgargan matnni emas, o'zining eski nusxasini tekshirib "hammasi joyida"
 * deb ko'rsataverardi (ai/prompts.ts dagi bilan bir xil sabab).
 *
 * Ohang qat'iy belgilangan: sinovda model "Qarz yozib QO'YILDI" deb o'tgan
 * zamonda javob berdi — hech narsa yozilmagan holda. Foydalanuvchi buni
 * o'qib, ish bajarilgan deb o'ylaydi va tasdiqlash tugmasini bosmaydi.
 * Ya'ni butun tasdiqlash mexanizmi bitta jumla tufayli teskari natija
 * berardi.
 */
export const PENDING_INSTRUCTION =
    'DIQQAT: harakat HALI BAJARILMADI va sen uni bajara olmaysan. '
    + 'Tasdiqlash tugmasi foydalanuvchi ekranida turibdi.\n'
    + 'Javobing ANIQ shu qolipda bo\'lsin: "<nima bo\'lishi> — tasdiqlashingizni kutmoqda."\n'
    + 'Masalan: "12 ta qarzdorga eslatma yuborish — tasdiqlashingizni kutmoqda."\n'
    + 'Quyidagi so\'zlarni ISHLATMA: yuborildi, yozildi, qo\'shildi, qo\'yildi, '
    + 'bajarildi, o\'zgartirildi, tayyor bo\'ldi. Ular ish bajarilgan degan '
    + 'ma\'noni beradi — bu noto\'g\'ri.\n'
    + '"Tasdiqlaysizmi?" deb ham so\'rama — tugma allaqachon ekranda.';

// ─── Ko'rib chiqish (preview) ────────────────────────────────────────────────

export interface ActionPreview {
    /** Tasdiqlash kartasining sarlavhasi. */
    title: string;
    /** Bir qatorli tavsif — nima bo'lishini aniq aytadi. */
    summary: string;
    /** Ta'sir qiladigan yozuvlar (bemorlar, xarajat va h.k.). */
    items: { label: string; detail?: string }[];
    /** Ogohlantirish — masalan "3 tasida telefon raqami yo'q". */
    warning?: string;
    /** Yuboriladigan xabar matni, agar bo'lsa. */
    message?: string;
    /** Bajarish tugmasi matni. */
    confirmLabel: string;
}

const maskPhone = (phone?: string | null): string => {
    const p = (phone || '').replace(/\D/g, '');
    return p.length >= 4 ? `***${p.slice(-4)}` : '***';
};

const maskName = (first?: string | null, last?: string | null): string => {
    const f = (first || '').trim();
    const l = (last || '').trim();
    if (!f && !l) return 'Noma\'lum';
    return l ? `${l} ${f.charAt(0).toUpperCase()}.` : f;
};

const som = (n: number): string => Math.round(n).toLocaleString('ru-RU');

/**
 * Xarajat toifalari — ilovaning O'Z ro'yxati (types.ts,
 * EXPENSE_CATEGORY_LABELS). Bu yerda takrorlangan, chunki backend
 * frontend'dagi fayldan import qila olmaydi (tsconfig chegarasi) —
 * ai/tools.ts dagi to'lov usullari bilan bir xil sabab.
 *
 * DoctorShare va Salary ataylab YO'Q: ular shifokorga to'lov uchun va
 * pay_doctor orqali, shifokorning ish haqi turiga qarab tanlanadi.
 */
const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Inventory', 'Lab', 'Other'];

const EXPENSE_LABELS: Record<string, string> = {
    Rent: 'Ijara',
    Utilities: 'Kommunal',
    Inventory: 'Ombor',
    Lab: 'Laboratoriya',
    Other: 'Boshqa',
    Salary: 'Oylik',
    DoctorShare: 'Shifokor ulushi',
};

const clampLimit = (n: any, def: number, max: number): number => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return def;
    return Math.min(Math.floor(v), max);
};

const DEFAULT_MESSAGES: Record<string, string> = {
    debtors: 'Hurmatli bemor! Klinikamizda to\'lanmagan qarzingiz mavjud. '
        + 'Iltimos, qulay vaqtda murojaat qiling. Rahmat!',
    noshow: 'Hurmatli bemor! Siz belgilangan qabulga kela olmadingiz. '
        + 'Yangi vaqt belgilash uchun biz bilan bog\'laning.',
    tomorrow: 'Eslatma: ertaga klinikamizda qabulingiz bor. Kutamiz!',
};

/** Eslatma yuboriladigan bemorlarni topadi — preview va bajarish uchun bir xil. */
const reminderRecipients = async (
    target: string,
    limit: number,
    ctx: ToolContext,
    today: string
): Promise<any[]> => {
    if (target === 'debtors') {
        return prisma.patient.findMany({
            where: { clinicId: ctx.clinicId, balance: { lt: 0 }, status: 'Active' },
            orderBy: { balance: 'asc' },
            take: limit,
            select: { id: true, firstName: true, lastName: true, phone: true, balance: true, telegramChatId: true },
        });
    }

    if (target === 'tomorrow') {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        const tomorrow = d.toISOString().slice(0, 10);
        const appts = await prisma.appointment.findMany({
            where: { clinicId: ctx.clinicId, date: tomorrow, status: { in: ['Confirmed', 'Pending'] } },
            take: limit,
            select: { patientId: true, time: true },
        });
        if (!appts.length) return [];
        const patients = await prisma.patient.findMany({
            where: { id: { in: appts.map((a: any) => a.patientId) } },
            select: { id: true, firstName: true, lastName: true, phone: true, balance: true, telegramChatId: true },
        });
        const timeById = new Map(appts.map((a: any) => [a.patientId, a.time]));
        return patients.map((p: any) => ({ ...p, _time: timeById.get(p.id) }));
    }

    // noshow — oxirgi 30 kunda kelmaganlar.
    const from = new Date(`${today}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 30);
    const appts = await prisma.appointment.findMany({
        where: {
            clinicId: ctx.clinicId,
            status: 'No-Show',
            date: { gte: from.toISOString().slice(0, 10), lte: today },
        },
        take: limit,
        select: { patientId: true, date: true },
    });
    if (!appts.length) return [];
    const patients = await prisma.patient.findMany({
        where: { id: { in: appts.map((a: any) => a.patientId) } },
        select: { id: true, firstName: true, lastName: true, phone: true, balance: true, telegramChatId: true },
    });
    const dateById = new Map(appts.map((a: any) => [a.patientId, a.date]));
    return patients.map((p: any) => ({ ...p, _date: dateById.get(p.id) }));
};

/**
 * Bitta bemorni aniq topadi.
 *
 * Bir nechta mos kelsa ATAYLAB tanlab bermaydi: noto'g'ri bemorga qarz
 * yozib qo'yish yoki noto'g'ri odamga qabul ochish — jimgina yuz beradigan
 * va keyin topish qiyin bo'lgan xato. Model aniqlashtirishni so'raydi.
 */
const findOnePatient = async (
    query: string,
    ctx: ToolContext
): Promise<{ patient?: any; xato?: string }> => {
    const q = String(query || '').trim();
    if (q.length < 2) return { xato: 'Bemor ismi juda qisqa.' };

    // Qidiruv ai/tools.ts dagi bilan AYNAN bir xil bo'lishi shart.
    // Ilgari bu yerda o'z nusxasi bor edi va u ham ko'p so'zli ismni
    // topa olmasdi. Ikkita nusxa bo'lganda bittasini tuzatib, ikkinchisini
    // unutish oson — shuning uchun endi bitta manba.
    const rows = await searchPatients(q, ctx, 5);

    if (!rows.length) return { xato: `"${q}" bo'yicha bemor topilmadi.` };
    if (rows.length > 1) {
        return {
            xato: `"${q}" bo'yicha ${rows.length} ta bemor topildi: `
                + rows.map((p: any) => maskName(p.firstName, p.lastName)).join(', ')
                + '. Qaysi biri ekanini aniqlashtiring.',
        };
    }
    return { patient: rows[0] };
};

/**
 * Harakatni BAJARMASDAN, nima bo'lishini tayyorlaydi.
 * Xatolik bo'lsa `{ xato }` qaytaradi — model buni ko'rib, foydalanuvchidan
 * aniqlashtirish so'raydi.
 */
export const previewAction = async (
    name: string,
    args: any,
    ctx: ToolContext,
    today: string
): Promise<{ preview?: ActionPreview; args?: any; xato?: string }> => {

    if (name === 'send_reminder') {
        const target = String(args.target || '');
        if (!['debtors', 'noshow', 'tomorrow'].includes(target)) {
            return { xato: 'Noma\'lum guruh. debtors, noshow yoki tomorrow bo\'lishi kerak.' };
        }
        const limit = clampLimit(args.limit, 20, 50);
        const message = String(args.message || DEFAULT_MESSAGES[target]).slice(0, 600);
        const people = await reminderRecipients(target, limit, ctx, today);

        if (!people.length) {
            return { xato: 'Bu guruhda bemor topilmadi — yuboriladigan hech kim yo\'q.' };
        }

        const unreachable = people.filter((p: any) => !p.phone && !p.telegramChatId).length;
        const titleByTarget: Record<string, string> = {
            debtors: 'Qarzdorlarga eslatma',
            noshow: 'Kelmagan bemorlarga eslatma',
            tomorrow: 'Ertangi qabul eslatmasi',
        };

        return {
            args: { target, message, limit, patientIds: people.map((p: any) => p.id) },
            preview: {
                title: titleByTarget[target],
                summary: `${people.length} ta bemorga xabar yuboriladi`,
                items: people.map((p: any) => ({
                    label: maskName(p.firstName, p.lastName),
                    detail: target === 'debtors' && p.balance < 0
                        ? `${som(Math.abs(p.balance))} so'm qarz · ${maskPhone(p.phone)}`
                        : maskPhone(p.phone),
                })),
                message,
                warning: unreachable > 0
                    ? `${unreachable} ta bemorda telefon ham, Telegram ham yo'q — ularga yetib bormaydi.`
                    : undefined,
                confirmLabel: 'Yuborish',
            },
        };
    }

    if (name === 'book_appointment') {
        const found = await findOnePatient(args.patientQuery, ctx);
        if (found.xato) return { xato: found.xato };
        const patient = found.patient;

        const doctor = await resolveDoctor(ctx.clinicId, String(args.doctorName || ''));
        if (!doctor) return { xato: `"${args.doctorName}" shifokori aniqlanmadi.` };

        const date = String(args.date || '');
        const time = String(args.time || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { xato: 'Sana YYYY-MM-DD ko\'rinishida bo\'lishi kerak.' };
        if (!/^\d{1,2}:\d{2}$/.test(time)) return { xato: 'Vaqt HH:MM ko\'rinishida bo\'lishi kerak.' };
        if (date < today) return { xato: 'O\'tgan sanaga qabul yozib bo\'lmaydi.' };

        // Band vaqt tekshiruvi — tasdiqlashdan OLDIN, chunki foydalanuvchi
        // "yoz" deb bosgandan keyin xato ko'rish yomon tajriba.
        const clash = await prisma.appointment.findFirst({
            where: { clinicId: ctx.clinicId, doctorId: doctor.id, date, time, status: { notIn: ['Cancelled'] } },
            select: { id: true },
        });
        if (clash) return { xato: `${doctor.name} da ${date} kuni ${time} vaqti band.` };

        const already = await prisma.appointment.findFirst({
            where: { clinicId: ctx.clinicId, patientId: patient.id, date },
            select: { id: true, time: true },
        });
        if (already) {
            return { xato: `Bu bemor ${date} kuniga allaqachon yozilgan (${already.time}).` };
        }

        const duration = clampLimit(args.duration, 30, 240);
        const type = String(args.type || 'Konsultatsiya').slice(0, 80);

        return {
            args: { patientId: patient.id, doctorId: doctor.id, date, time, duration, type },
            preview: {
                title: 'Yangi qabul',
                summary: `${maskName(patient.firstName, patient.lastName)} — ${date} ${time}`,
                items: [
                    { label: 'Bemor', detail: `${maskName(patient.firstName, patient.lastName)} · ${maskPhone(patient.phone)}` },
                    { label: 'Shifokor', detail: doctor.name },
                    { label: 'Sana va vaqt', detail: `${date} ${time}` },
                    { label: 'Turi', detail: `${type} · ${duration} daqiqa` },
                ],
                confirmLabel: 'Qabulga yozish',
            },
        };
    }

    if (name === 'update_lead_status') {
        const q = String(args.leadQuery || '').trim();
        if (q.length < 2) return { xato: 'Lid ismi juda qisqa.' };
        const status = String(args.status || '');
        if (!['New', 'Contacted', 'Thinking', 'Booked', 'Cancelled'].includes(status)) {
            return { xato: 'Noma\'lum holat.' };
        }

        const leads = await prisma.lead.findMany({
            where: {
                clinicId: ctx.clinicId,
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q } },
                ],
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, name: true, phone: true, status: true, source: true },
        });
        if (!leads.length) return { xato: `"${q}" bo'yicha lid topilmadi.` };
        if (leads.length > 1) {
            return {
                xato: `"${q}" bo'yicha ${leads.length} ta lid topildi. Telefon raqamini to'liqroq ayting.`,
            };
        }
        const lead = leads[0];
        if (lead.status === status) {
            return { xato: `Lid allaqachon "${status}" holatida — o'zgartirish shart emas.` };
        }

        return {
            args: { leadId: lead.id, status, note: String(args.note || '').slice(0, 500) },
            preview: {
                title: 'Lid holatini o\'zgartirish',
                summary: `${lead.name}: ${lead.status} -> ${status}`,
                items: [
                    { label: 'Lid', detail: `${lead.name} · ${maskPhone(lead.phone)}` },
                    { label: 'Manba', detail: lead.source || '—' },
                    { label: 'Yangi holat', detail: status },
                ],
                confirmLabel: 'O\'zgartirish',
            },
        };
    }

    if (name === 'add_charge') {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) return { xato: 'Summa noto\'g\'ri.' };
        if (amount > 1_000_000_000) return { xato: 'Summa juda katta — tekshirib qayta ayting.' };

        const found = await findOnePatient(args.patientQuery, ctx);
        if (found.xato) return { xato: found.xato };
        const patient = found.patient;

        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? String(args.date) : today;
        const service = String(args.service || 'Xizmat').slice(0, 120);

        // Mavjud qarzni ham ko'rsatamiz: foydalanuvchi tasdiqlashdan oldin
        // "bu bemorda allaqachon 2 mln qarz bor ekan" degan kontekstni
        // ko'rgani yaxshi — bu ko'pincha xatoni shu yerda to'xtatadi.
        const oldingi = await prisma.transaction.findMany({
            where: { clinicId: ctx.clinicId, patientId: patient.id, status: 'Pending' },
            select: { amount: true },
        });
        const mavjudQarz = oldingi.reduce((s: number, t: any) => s + (t.amount || 0), 0);

        return {
            args: {
                patientId: patient.id,
                patientName: `${patient.firstName} ${patient.lastName || ''}`.trim(),
                amount, service, date,
            },
            preview: {
                title: 'Qarz yozish',
                summary: `${maskName(patient.firstName, patient.lastName)} — ${som(amount)} so'm`,
                items: [
                    { label: 'Bemor', detail: `${maskName(patient.firstName, patient.lastName)} · ${maskPhone(patient.phone)}` },
                    { label: 'Summa', detail: `${som(amount)} so'm` },
                    { label: 'Nima uchun', detail: service },
                    { label: 'Sana', detail: date },
                    ...(mavjudQarz > 0
                        ? [{ label: 'Mavjud qarzi', detail: `${som(mavjudQarz)} so'm` }]
                        : []),
                ],
                warning: mavjudQarz > 0
                    ? `Bu bemorda allaqachon ${som(mavjudQarz)} so'm to'lanmagan hisob bor. `
                      + `Yangisi qo'shilgach jami ${som(mavjudQarz + amount)} so'm bo'ladi.`
                    : undefined,
                confirmLabel: 'Qarzni yozish',
            },
        };
    }

    if (name === 'send_message') {
        const text = String(args.message || '').trim();
        if (text.length < 3) return { xato: 'Xabar matni juda qisqa.' };

        const found = await findOnePatient(args.patientQuery, ctx);
        if (found.xato) return { xato: found.xato };
        const p = found.patient;

        if (!p.phone && !p.telegramChatId) {
            return { xato: `${maskName(p.firstName, p.lastName)} da na telefon, na Telegram bor — xabar yetib bormaydi.` };
        }

        return {
            args: { patientId: p.id, message: text.slice(0, 600) },
            preview: {
                title: 'Xabar yuborish',
                summary: `${maskName(p.firstName, p.lastName)} ga`,
                items: [{ label: 'Bemor', detail: `${maskName(p.firstName, p.lastName)} · ${maskPhone(p.phone)}` }],
                message: text,
                confirmLabel: 'Yuborish',
            },
        };
    }

    if (name === 'record_payment') {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) return { xato: 'Summa noto\'g\'ri.' };

        const found = await findOnePatient(args.patientQuery, ctx);
        if (found.xato) return { xato: found.xato };
        const p = found.patient;

        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? String(args.date) : today;
        const method = ['Cash', 'Card', 'Click', 'Transfer'].includes(String(args.method))
            ? String(args.method) : 'Cash';

        // Eng eski qarzdan boshlab yopiladi — ilovaning o'zi ham shunday
        // qiladi (pages/Dashboard.tsx, qarz to'lash oynasi).
        const pending = await prisma.transaction.findMany({
            where: { clinicId: ctx.clinicId, patientId: p.id, status: 'Pending' },
            orderBy: { date: 'asc' },
            select: { id: true, amount: true, service: true, date: true },
        });
        const qarz = pending.reduce((s: number, t: any) => s + (t.amount || 0), 0);

        if (qarz > 0 && amount > qarz) {
            return {
                xato: `${maskName(p.firstName, p.lastName)} ning qarzi ${som(qarz)} so'm, `
                    + `siz ${som(amount)} so'm dedingiz. Summani aniqlashtiring.`,
            };
        }

        return {
            args: { patientId: p.id, patientName: `${p.firstName} ${p.lastName || ''}`.trim(), amount, method, date },
            preview: {
                title: qarz > 0 ? 'To\'lov — qarz yopiladi' : 'To\'lov qabul qilish',
                summary: `${maskName(p.firstName, p.lastName)} — ${som(amount)} so'm`,
                items: [
                    { label: 'Bemor', detail: maskName(p.firstName, p.lastName) },
                    { label: 'Summa', detail: `${som(amount)} so'm` },
                    { label: 'Usul', detail: method },
                    { label: 'Sana', detail: date },
                    ...(qarz > 0 ? [{ label: 'Mavjud qarzi', detail: `${som(qarz)} so'm` }] : []),
                ],
                warning: qarz > 0 && amount < qarz
                    ? `Qisman to'lov: ${som(qarz - amount)} so'm qarz qoladi.`
                    : undefined,
                confirmLabel: 'To\'lovni yozish',
            },
        };
    }

    if (name === 'pay_doctor') {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) return { xato: 'Summa noto\'g\'ri.' };

        const doctor = await resolveDoctor(ctx.clinicId, String(args.doctorName || ''));
        if (!doctor) return { xato: `"${args.doctorName}" shifokori aniqlanmadi.` };

        const row = await prisma.doctor.findFirst({
            where: { id: doctor.id, clinicId: ctx.clinicId },
            select: { salaryType: true, percentage: true, fixedSalary: true },
        });

        // Toifa shifokorning ish haqi turiga BOG'LIQ va buni o'ylab topib
        // bo'lmaydi (pages/Finance.tsx):
        //   kpi   -> 'DoctorShare' (Shifokor Hisobidan yechiladi)
        //   fixed -> 'Salary'      (sof foydani kamaytiradi)
        // Sof KPI shifokorga "Oylik" deb yozilsa, summa ikki marta
        // ayiriladi va foyda noto'g'ri chiqadi.
        const type = String(row?.salaryType || 'none');

        if (type === 'fixed_kpi') {
            return {
                xato: `${doctor.name} da ish haqi aralash (fiks + foiz). Bunda summani `
                    + 'ikkiga bo\'lish kerak va uni Moliya bo\'limidan qo\'lda kiritgan '
                    + 'to\'g\'ri bo\'ladi — u yerda taqsimot avtomatik hisoblanadi.',
            };
        }

        const category = type === 'kpi' ? 'DoctorShare' : 'Salary';
        const title = category === 'DoctorShare'
            ? `Shifokor ulushi — ${doctor.name}`
            : `Oylik — ${doctor.name}`;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? String(args.date) : today;

        return {
            args: { doctorId: doctor.id, amount, category, title, date, note: String(args.note || '').slice(0, 300) },
            preview: {
                title: category === 'DoctorShare' ? 'Shifokor ulushi' : 'Shifokorga oylik',
                summary: `${doctor.name} — ${som(amount)} so'm`,
                items: [
                    { label: 'Shifokor', detail: doctor.name },
                    { label: 'Summa', detail: `${som(amount)} so'm` },
                    { label: 'Toifa', detail: category === 'DoctorShare' ? 'Shifokor ulushi' : 'Oylik' },
                    { label: 'Sana', detail: date },
                ],
                warning: type === 'none'
                    ? 'Bu shifokorda ish haqi turi belgilanmagan — yozuv "Oylik" sifatida saqlanadi.'
                    : undefined,
                confirmLabel: 'To\'lovni yozish',
            },
        };
    }

    if (name === 'update_doctor_pay') {
        const doctor = await resolveDoctor(ctx.clinicId, String(args.doctorName || ''));
        if (!doctor) return { xato: `"${args.doctorName}" shifokori aniqlanmadi.` };

        const row = await prisma.doctor.findFirst({
            where: { id: doctor.id, clinicId: ctx.clinicId },
            select: { percentage: true, fixedSalary: true, salaryType: true },
        });
        if (!row) return { xato: 'Shifokor topilmadi.' };

        const data: any = {};
        const items: { label: string; detail?: string }[] = [{ label: 'Shifokor', detail: doctor.name }];

        if (args.percentage !== undefined && args.percentage !== null) {
            const pct = Number(args.percentage);
            if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                return { xato: 'Foiz 0 dan 100 gacha bo\'lishi kerak.' };
            }
            data.percentage = pct;
            items.push({ label: 'Foiz', detail: `${row.percentage || 0}%  ->  ${pct}%` });
        }

        if (args.fixedSalary !== undefined && args.fixedSalary !== null) {
            const fx = Number(args.fixedSalary);
            if (!Number.isFinite(fx) || fx < 0) return { xato: 'Oylik summasi noto\'g\'ri.' };
            data.fixedSalary = fx;
            items.push({ label: 'Belgilangan oylik', detail: `${som(row.fixedSalary || 0)}  ->  ${som(fx)} so'm` });
        }

        if (!Object.keys(data).length) {
            return { xato: 'Nimani o\'zgartirish kerakligi aytilmadi (foiz yoki oylik).' };
        }

        return {
            args: { doctorId: doctor.id, data },
            preview: {
                title: 'Ish haqi shartlarini o\'zgartirish',
                summary: doctor.name,
                items,
                // Bu o'zgarish KELAJAKDAGI hisob-kitobga ta'sir qiladi.
                // Foydalanuvchi buni tasdiqlashdan oldin bilishi kerak.
                warning: 'O\'zgarish keyingi hisob-kitoblarga ta\'sir qiladi. '
                    + 'Oldin yozilgan to\'lovlar o\'zgarmaydi.',
                confirmLabel: 'O\'zgartirish',
            },
        };
    }

    if (name === 'create_expense') {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) return { xato: 'Summa noto\'g\'ri.' };
        if (amount > 1_000_000_000) return { xato: 'Summa juda katta — tekshirib qayta ayting.' };

        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? String(args.date) : today;
        // Toifa ilovaning ro'yxatidan bo'lishi SHART. Noma'lum qiymat
        // 'Other' ga tushadi — bazaga tanib bo'lmaydigan matn yozilgandan
        // ko'ra "Boshqa" ga tushgani yaxshi.
        const category = EXPENSE_CATEGORIES.includes(String(args.category))
            ? String(args.category) : 'Other';
        const title = String(args.title || '').slice(0, 120) || EXPENSE_LABELS[category];

        return {
            args: { amount, category, title, date },
            preview: {
                title: 'Yangi xarajat',
                summary: `${som(amount)} so'm — ${title}`,
                items: [
                    { label: 'Summa', detail: `${som(amount)} so'm` },
                    { label: 'Toifa', detail: category },
                    { label: 'Nomi', detail: title },
                    { label: 'Sana', detail: date },
                ],
                confirmLabel: 'Xarajatni yozish',
            },
        };
    }

    return { xato: `Noma'lum harakat: ${name}` };
};

// ─── Bajarish ────────────────────────────────────────────────────────────────

export interface ActionDeps {
    /** Bemorga xabar yuboradi. server.ts dagi sendUnified ustiga o'raladi. */
    sendToPatient: (patientId: string, message: string) => Promise<{ success: boolean; error?: string }>;
}

export interface ActionResult {
    ok: boolean;
    /** Foydalanuvchiga ko'rsatiladigan natija matni. */
    message: string;
    details?: any;
}

/**
 * Tasdiqlangan harakatni bajaradi.
 *
 * `args` — preview bosqichida SERVER tayyorlagan argumentlar. Mijozdan
 * kelgan qiymatlar bu yerga umuman tushmaydi.
 */
export const executeAction = async (
    name: string,
    args: any,
    ctx: ToolContext,
    deps: ActionDeps
): Promise<ActionResult> => {

    const def = ACTION_DEFS.find(a => a.name === name);
    if (!def) return { ok: false, message: `Noma'lum harakat: ${name}` };
    // Rol tekshiruvi bajarish paytida QAYTA — ro'yxatdagi filtrga tayanmaymiz.
    if (!def.roles.includes(ctx.role)) {
        return { ok: false, message: 'Bu harakatni bajarishga sizning rolingizda ruxsat yo\'q.' };
    }
    if (!ctx.clinicId) return { ok: false, message: 'Klinika aniqlanmadi.' };

    try {
        if (name === 'send_reminder') {
            const ids: string[] = Array.isArray(args.patientIds) ? args.patientIds : [];
            const message: string = String(args.message || '');
            let sent = 0;
            const failed: string[] = [];

            for (const id of ids) {
                const r = await deps.sendToPatient(id, message);
                if (r.success) sent++;
                else failed.push(r.error || 'xato');
            }

            return {
                ok: sent > 0,
                message: sent === ids.length
                    ? `${sent} ta bemorga xabar yuborildi.`
                    : `${sent} ta yuborildi, ${ids.length - sent} tasi yetib bormadi.`,
                details: { sent, total: ids.length, failed: failed.slice(0, 5) },
            };
        }

        if (name === 'book_appointment') {
            const patient = await prisma.patient.findFirst({
                where: { id: args.patientId, clinicId: ctx.clinicId },
                select: { id: true, firstName: true, lastName: true },
            });
            if (!patient) return { ok: false, message: 'Bemor topilmadi.' };

            const doctor = await prisma.doctor.findFirst({
                where: { id: args.doctorId, clinicId: ctx.clinicId },
                select: { id: true, firstName: true, lastName: true },
            });
            if (!doctor) return { ok: false, message: 'Shifokor topilmadi.' };

            // Vaqt oralig'ida band bo'lib qolgan bo'lishi mumkin — preview va
            // tasdiqlash orasida boshqa xodim yozib qo'ygan bo'lsa.
            const clash = await prisma.appointment.findFirst({
                where: {
                    clinicId: ctx.clinicId, doctorId: doctor.id,
                    date: args.date, time: args.time, status: { notIn: ['Cancelled'] },
                },
                select: { id: true },
            });
            if (clash) return { ok: false, message: 'Bu vaqt endigina band bo\'ldi. Boshqa vaqt tanlang.' };

            const created = await prisma.appointment.create({
                data: {
                    patientId: patient.id,
                    patientName: `${patient.firstName} ${patient.lastName || ''}`.trim(),
                    doctorId: doctor.id,
                    doctorName: `${doctor.lastName} ${doctor.firstName}`.trim(),
                    type: args.type,
                    date: args.date,
                    time: args.time,
                    duration: args.duration,
                    status: 'Pending',
                    clinicId: ctx.clinicId,
                },
                select: { id: true },
            });

            invalidateToolCache(ctx.clinicId);
            return {
                ok: true,
                message: `Qabul yozildi: ${args.date} ${args.time}.`,
                details: { appointmentId: created.id },
            };
        }

        if (name === 'update_lead_status') {
            const lead = await prisma.lead.findFirst({
                where: { id: args.leadId, clinicId: ctx.clinicId },
                select: { id: true, name: true, notes: true },
            });
            if (!lead) return { ok: false, message: 'Lid topilmadi.' };

            const notes = args.note
                ? `${lead.notes ? lead.notes + '\n' : ''}${args.note}`.slice(0, 2000)
                : lead.notes;

            await prisma.lead.update({
                where: { id: lead.id },
                data: { status: args.status, notes },
            });

            invalidateToolCache(ctx.clinicId);
            return { ok: true, message: `${lead.name} holati "${args.status}" ga o'zgartirildi.` };
        }

        if (name === 'add_charge') {
            const patient = await prisma.patient.findFirst({
                where: { id: args.patientId, clinicId: ctx.clinicId },
                select: { id: true },
            });
            if (!patient) return { ok: false, message: 'Bemor topilmadi.' };

            // status 'Pending' — ilovaning to'lanmagan hisob uchun ishlatadigan
            // qiymati (types.ts: 'Paid' | 'Pending' | 'Overdue'). Aynan shu
            // qiymat Moliya sahifasidagi qarzdorlar ro'yxatiga tushadi.
            //
            // `Patient.balance` ga TEGILMAYDI: u avans qoldig'i va uni
            // recalculate-balances to'lovlardan qayta hisoblaydi, ya'ni
            // qo'lda yozilgan qarz birinchi qayta hisoblashda yo'qolardi.
            const created = await prisma.transaction.create({
                data: {
                    clinicId: ctx.clinicId,
                    patientId: args.patientId,
                    patientName: args.patientName,
                    date: args.date,
                    amount: args.amount,
                    type: 'Cash',
                    service: args.service,
                    status: 'Pending',
                },
                select: { id: true },
            });

            invalidateToolCache(ctx.clinicId);
            return {
                ok: true,
                message: `Qarz yozildi: ${args.patientName} — ${som(args.amount)} so'm (${args.service}).`,
                details: { transactionId: created.id },
            };
        }

        if (name === 'send_message') {
            const r = await deps.sendToPatient(args.patientId, args.message);
            return r.success
                ? { ok: true, message: 'Xabar yuborildi.' }
                : { ok: false, message: `Xabar yetib bormadi: ${r.error || 'noma\'lum sabab'}.` };
        }

        if (name === 'record_payment') {
            const patient = await prisma.patient.findFirst({
                where: { id: args.patientId, clinicId: ctx.clinicId },
                select: { id: true },
            });
            if (!patient) return { ok: false, message: 'Bemor topilmadi.' };

            // Qarzlar QAYTA o'qiladi: ko'rib chiqish bilan tasdiqlash orasida
            // boshqa xodim to'lovni yozib qo'ygan bo'lishi mumkin.
            const pending = await prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, patientId: args.patientId, status: 'Pending' },
                orderBy: { date: 'asc' },
                select: { id: true, amount: true, service: true, doctorId: true, doctorName: true },
            });

            let qoldiq = args.amount;
            let yopilgan = 0;

            // Mantiq ilovaning o'zidan (pages/Dashboard.tsx): to'liq yopilsa
            // yozuvning holati Paid ga o'tadi, qisman bo'lsa — yangi Paid
            // yozuv yaratiladi va eski qarz shuncha kamayadi.
            for (const t of pending) {
                if (qoldiq <= 0) break;
                if (qoldiq >= t.amount) {
                    await prisma.transaction.update({
                        where: { id: t.id },
                        data: { status: 'Paid', type: args.method, date: args.date },
                    });
                    qoldiq -= t.amount;
                    yopilgan++;
                } else {
                    await prisma.transaction.create({
                        data: {
                            clinicId: ctx.clinicId,
                            patientId: args.patientId,
                            patientName: args.patientName,
                            doctorId: t.doctorId || undefined,
                            doctorName: t.doctorName || undefined,
                            amount: qoldiq,
                            status: 'Paid',
                            type: args.method,
                            service: `${t.service} (Qarzdorlik yopildi)`,
                            date: args.date,
                        },
                    });
                    await prisma.transaction.update({
                        where: { id: t.id },
                        data: { amount: t.amount - qoldiq },
                    });
                    qoldiq = 0;
                }
            }

            // Qarzi bo'lmagan bemorning oddiy to'lovi.
            if (qoldiq > 0) {
                await prisma.transaction.create({
                    data: {
                        clinicId: ctx.clinicId,
                        patientId: args.patientId,
                        patientName: args.patientName,
                        amount: qoldiq,
                        status: 'Paid',
                        type: args.method,
                        service: 'To\'lov',
                        date: args.date,
                    },
                });
            }

            invalidateToolCache(ctx.clinicId);
            return {
                ok: true,
                message: yopilgan > 0
                    ? `${som(args.amount)} so'm qabul qilindi, ${yopilgan} ta qarz yopildi.`
                    : `${som(args.amount)} so'm to'lov yozildi.`,
            };
        }

        if (name === 'pay_doctor') {
            const doctor = await prisma.doctor.findFirst({
                where: { id: args.doctorId, clinicId: ctx.clinicId },
                select: { id: true },
            });
            if (!doctor) return { ok: false, message: 'Shifokor topilmadi.' };

            const created = await prisma.expense.create({
                data: {
                    clinicId: ctx.clinicId,
                    doctorId: args.doctorId,
                    date: args.date,
                    amount: args.amount,
                    category: args.category,
                    title: args.title,
                    note: args.note || 'AI yordamchisi orqali qo\'shildi',
                },
                select: { id: true },
            });

            invalidateToolCache(ctx.clinicId);
            return {
                ok: true,
                message: `${args.title}: ${som(args.amount)} so'm yozildi.`,
                details: { expenseId: created.id },
            };
        }

        if (name === 'update_doctor_pay') {
            const res = await prisma.doctor.updateMany({
                where: { id: args.doctorId, clinicId: ctx.clinicId },
                data: args.data,
            });
            if (!res.count) return { ok: false, message: 'Shifokor topilmadi.' };

            // Klinika profili keshida shifokorlar ro'yxati bor.
            invalidateClinicContext(ctx.clinicId);
            invalidateToolCache(ctx.clinicId);
            return { ok: true, message: 'Ish haqi shartlari o\'zgartirildi.' };
        }

        if (name === 'create_expense') {
            const created = await prisma.expense.create({
                data: {
                    clinicId: ctx.clinicId,
                    date: args.date,
                    amount: args.amount,
                    category: args.category,
                    title: args.title,
                    note: 'AI yordamchisi orqali qo\'shildi',
                },
                select: { id: true },
            });

            invalidateToolCache(ctx.clinicId);
            return {
                ok: true,
                message: `Xarajat yozildi: ${som(args.amount)} so'm — ${args.title}.`,
                details: { expenseId: created.id },
            };
        }

        return { ok: false, message: `Noma'lum harakat: ${name}` };
    } catch (e: any) {
        console.error(`[AI:action] ${name} xatolik:`, e?.message);
        return { ok: false, message: 'Harakatni bajarishda xatolik yuz berdi.' };
    }
};

// ─── Kutilayotgan harakatlar ─────────────────────────────────────────────────
//
// Preview va tasdiqlash orasida saqlanadi. Xotirada — bu qisqa muddatli
// holat va server qayta ishga tushganda yo'qolgani ma'qul: eski, unutilgan
// tasdiqlash keyinroq bosilib, kutilmagan xabar yuborilishidan yaxshiroq.

interface Pending {
    name: string;
    args: any;
    preview: ActionPreview;
    clinicId: string;
    userId: string;
    role: string;
    expiresAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const pending = new Map<string, Pending>();

let counter = 0;
const newId = (): string => `act_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const storePending = (
    name: string,
    args: any,
    preview: ActionPreview,
    ctx: { clinicId: string; userId: string; role: string }
): string => {
    const id = newId();
    pending.set(id, {
        name, args, preview,
        clinicId: ctx.clinicId, userId: ctx.userId, role: ctx.role,
        expiresAt: Date.now() + PENDING_TTL_MS,
    });
    return id;
};

/**
 * Tasdiqlangan harakatni oladi va ro'yxatdan O'CHIRADI.
 *
 * O'chirish muhim: bir marta tasdiqlangan harakat ikki marta bajarilmasligi
 * kerak. Tugmani ikki marta bosish yoki so'rovni takrorlash 40 ta bemorga
 * ikkita bir xil SMS yuborardi.
 */
export const takePending = (
    id: string,
    ctx: { clinicId: string; userId: string }
): { pending?: Pending; xato?: string } => {
    const p = pending.get(id);
    if (!p) return { xato: 'Bu tasdiqlash topilmadi yoki muddati o\'tgan. Iltimos, qaytadan so\'rang.' };
    if (p.expiresAt < Date.now()) {
        pending.delete(id);
        return { xato: 'Tasdiqlash muddati tugagan (10 daqiqa). Iltimos, qaytadan so\'rang.' };
    }
    // Boshqa foydalanuvchi tasdiqlay olmaydi. Bu asosiy tekshiruv: yozuvni
    // server o'zi yaratgan va aynan shu foydalanuvchiga bog'lagan.
    if (p.userId !== ctx.userId) {
        return { xato: 'Bu tasdiqlash sizga tegishli emas.' };
    }

    // Klinika tekshiruvi — qo'shimcha himoya, lekin faqat chaqiruvda klinika
    // aniq bo'lganda. SUPER_ADMIN da clinicId so'rov tanasidan keladi va
    // tasdiqlashda u yuborilmasligi mumkin; bunday holatda harakat baribir
    // saqlangan yozuvdagi klinikada bajariladi, ya'ni chegara buzilmaydi.
    if (ctx.clinicId && p.clinicId !== ctx.clinicId) {
        return { xato: 'Bu tasdiqlash boshqa klinikaga tegishli.' };
    }
    pending.delete(id);
    return { pending: p };
};

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of Array.from(pending.entries())) {
        if (now > v.expiresAt) pending.delete(k);
    }
}, 5 * 60 * 1000).unref?.();
