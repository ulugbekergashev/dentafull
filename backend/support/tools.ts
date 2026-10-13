// ─── Tekshiruv asboblari ─────────────────────────────────────────────────────
// Mijoz "SMS ketmayapti" desa, operator nima qilardi? Klinikaning sozlamasini,
// xabarlar jurnalini, bot holatini ochib ko'rardi. Bu fayl aynan shuni qiladi —
// faqat O'QIYDI, hech narsani o'zgartirmaydi.
//
// Xavfsizlik qoidalari:
//   • clinicId HECH QACHON modeldan kelmaydi — bog'langan foydalanuvchidan olinadi.
//   • Har bir so'rovda maydonlar aniq sanab o'tiladi (select): klinika qatorida
//     parollar, bot tokeni va kalitlar bor, ular bu yerdan chiqmasligi kerak.
//   • Bemor ismi va telefon raqami modelga berilmaydi. Jurnal kabi shaxsiy
//     ma'lumotli ro'yxatlar `attachments` orqali to'g'ridan-to'g'ri foydalanuvchiga
//     ko'rsatiladi, model faqat sonini biladi.

import type { Diag } from '../diag';
import { makePermChecker, modulesForRole, toPermRole, matchingLevel, resolveRolePerms, PERM_LEVELS } from '../permissions';
import type { SupportUserRow } from './identity';
import type { SupportLang } from './productMap';
import type { SupportSettings } from './settings';
import { ddmmyyyy, todayTashkent } from './text';

export interface ToolContext {
    user: SupportUserRow;
    lang: SupportLang;
    settings: SupportSettings;
    /** Kod tomonidan javobga qo'shiladigan bloklar (modeldan o'tmaydi) */
    attachments: string[];
}

export interface ToolDeps {
    db: any;
    diag: Diag;
    /** Eskiz balansini jonli so'raydi (smsService.getBalance) */
    smsBalance?: (clinicId: string) => Promise<{ balance: number | null; error?: string }>;
    /** Avtomatika triggerlari: id, nom, yuborish soatlari (triggers.ts) */
    triggers?: { id: string; label: string; sendWindow?: { fromHour: number; toHour: number } }[];
    /** Server haqida: versiya va qachon ishga tushgani */
    health?: () => { build?: string; bootedAt?: string };
}

type Role = 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'LAB_TECHNICIAN';
const STAFF: Role[] = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN'];
const DESK: Role[] = ['CLINIC_ADMIN', 'RECEPTIONIST'];

const fn = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
});

interface ToolSpec {
    def: any;
    roles: Role[];
    /** true — faqat ilova orqali ulangan (kim ekani aniq) foydalanuvchiga */
    sessionOnly?: boolean;
    run: (args: any, ctx: ToolContext, clinicId: string) => Promise<any>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Toshkent vaqti bo'yicha sana: UTC bo'yicha 00:00–05:00 orasida "kechagi" kun ko'rinib qolmasin */
const tzDate = (d: any): string => ddmmyyyy(new Date(new Date(d).getTime() + 5 * 60 * 60 * 1000).toISOString());
const daysBetween = (fromIso: string, toIso: string) =>
    Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);

const ROLE_LABEL: Record<string, string> = {
    CLINIC_ADMIN: 'rahbar', DOCTOR: 'shifokor', RECEPTIONIST: 'resepshn', LAB_TECHNICIAN: 'laborant',
};

export const createTools = (deps: ToolDeps) => {
    const { db, diag } = deps;

    const specs: ToolSpec[] = [
        {
            roles: STAFF,
            def: fn('check_subscription',
                "Klinikaning obunasi: tarif, qachongacha, necha kun qoldi, bloklanganmi, shifokorlar chegarasi va to'lov qanday qilinishi. Obuna, to'lov, narx, blok, \"ilova ochilmayapti\" haqidagi har qanday savolda chaqir."),
            async run(_a, ctx, clinicId) {
                const c = await db.clinic.findUnique({
                    where: { id: clinicId },
                    select: { name: true, status: true, expiryDate: true, subscriptionType: true, planId: true, customPrice: true },
                });
                if (!c) return { xato: 'Klinika topilmadi' };
                const plan = await db.subscriptionPlan.findUnique({ where: { id: c.planId } }).catch(() => null);
                const doctors = await db.doctor.count({ where: { clinicId, status: 'Active' } });
                const today = todayTashkent();
                const left = c.expiryDate ? daysBetween(today, c.expiryDate) : null;
                const isOwner = ctx.user.role === 'CLINIC_ADMIN';
                const payInfo = ctx.lang === 'ru' ? ctx.settings.payInfoRu : ctx.settings.payInfoUz;
                return {
                    holat: c.status !== 'Active' ? 'bloklangan' : left !== null && left < 0 ? 'muddati tugagan' : 'faol',
                    tarif: plan?.name || c.planId,
                    sinov_muddati: c.subscriptionType === 'Trial',
                    muddat_tugaydi: ddmmyyyy(c.expiryDate),
                    qolgan_kun: left,
                    shifokorlar: `${doctors} / ${plan?.maxDoctors ?? '?'}`,
                    // Narxni faqat rahbar ko'radi
                    oylik_narx: isOwner ? (c.customPrice ?? plan?.price ?? null) : undefined,
                    tolov_qilish: payInfo
                        ? `${payInfo}\nTo'lagach, pastdagi «💳 To'lov qildim» tugmasini bosib chek rasmini yuboring.`
                        : "To'lagach, pastdagi «💳 To'lov qildim» tugmasini bosib chek rasmini yuboring. To'lov rekvizitlarini operator yuboradi.",
                };
            },
        },
        {
            roles: DESK,
            def: fn('check_messaging',
                "SMS (Eskiz) va klinikaning Telegram boti holati: ulanganmi, balans, shablonlar tasdiqlanganmi, oxirgi 7 kunda nechta xabar ketmadi va NEGA. \"SMS ketmayapti\", \"eslatma bormadi\", \"bot ishlamayapti\", \"hisobot kelmayapti\" kabi savollarda chaqir."),
            async run(_a, _ctx, clinicId) {
                const c = await db.clinic.findUnique({
                    where: { id: clinicId },
                    select: {
                        notificationMode: true, eskizEmail: true, eskizToken: true, eskizTokenExpiry: true, eskizNick: true,
                        botToken: true, telegramChatId: true, dailyReportEnabled: true, dailyReportTime: true,
                    },
                });
                if (!c) return { xato: 'Klinika topilmadi' };
                const since = new Date(Date.now() - 7 * DAY_MS);
                const logs: any[] = await db.telegramLog.findMany({
                    where: { clinicId, sentAt: { gte: since } },
                    select: { status: true, channel: true, error: true },
                    take: 5000,
                });
                const failed = logs.filter(l => l.status === 'Failed');
                const reasons = new Map<string, number>();
                for (const l of failed) {
                    const key = `${l.channel === 'sms' ? 'SMS' : 'Telegram'}: ${l.error || "sabab yozilmagan"}`;
                    reasons.set(key, (reasons.get(key) || 0) + 1);
                }
                const templates: any[] = await db.messageTemplate.findMany({
                    where: { clinicId }, select: { name: true, eskizStatus: true },
                });
                const approved = (s?: string | null) => /^(service|reklama)$|\b(confirm|approv|activ|tasdiq)/i.test((s || '').trim());
                const smsConnected = !!c.eskizToken;
                const balance = smsConnected && deps.smsBalance ? await deps.smsBalance(clinicId).catch(() => null) : null;
                const botEvent = c.botToken ? await diag.latest(clinicId, ['bot_up', 'bot_down']) : null;
                const [doctorsLinked, receptionLinked, patientsLinked] = await Promise.all([
                    db.doctor.count({ where: { clinicId, telegramChatId: { not: null } } }),
                    db.receptionist.count({ where: { clinicId, telegramChatId: { not: null } } }),
                    db.patient.count({ where: { clinicId, telegramChatId: { not: null } } }),
                ]);
                return {
                    xabar_yuborish_usuli: c.notificationMode,
                    sms: {
                        eskiz_ulangan: smsConnected,
                        eskiz_login_kiritilgan: !!c.eskizEmail,
                        balans: balance?.balance ?? null,
                        balans_xatosi: balance?.error,
                        shablonlar: templates.map(t => ({
                            nomi: t.name,
                            holati: !t.eskizStatus ? 'Eskizga yuborilmagan' : approved(t.eskizStatus) ? 'tasdiqlangan' : `tasdiqlanmagan (${t.eskizStatus})`,
                        })),
                    },
                    telegram_bot: {
                        token_kiritilgan: !!c.botToken,
                        holati: !c.botToken ? 'sozlanmagan'
                            : !botEvent ? "ma'lumot yo'q"
                                : botEvent.kind === 'bot_up' ? 'ishlayapti' : `ishlamayapti: ${botEvent.message}`,
                        rahbar_ulangan: !!c.telegramChatId,
                        ulangan_shifokorlar: doctorsLinked,
                        ulangan_resepshnlar: receptionLinked,
                        ulangan_bemorlar: patientsLinked,
                        kunlik_hisobot: c.dailyReportEnabled ? `yoqilgan, soat ${c.dailyReportTime}` : "o'chirilgan",
                    },
                    oxirgi_7_kun: {
                        yuborilgan: logs.length - failed.length,
                        ketmagan: failed.length,
                        ketmaganlik_sabablari: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
                            .map(([sabab, soni]) => ({ sabab, soni })),
                    },
                    eslatma: "\"yuborilgan\" — Eskiz yoki Telegram qabul qildi degani; bemorning telefoniga yetib borgani alohida kuzatilmaydi.",
                };
            },
        },
        {
            roles: DESK,
            def: fn('check_automation',
                "Avtomatik xabar qoidalari (Xabarlar → Avtomatik): qaysilari yoqilgan, oxirgi marta qachon xabar ketgan, qoida xato beryaptimi. \"Avtomatik eslatma/tabrik ketmayapti\" savolida chaqir."),
            async run(_a, _ctx, clinicId) {
                const rules: any[] = await db.automationRule.findMany({
                    where: { clinicId },
                    select: { id: true, name: true, trigger: true, channel: true, active: true, hoursBefore: true },
                });
                if (!rules.length) return { qoidalar: [], izoh: "Bu klinikada avtomatik xabar qoidasi yaratilmagan." };
                const skips = await diag.list({ clinicId, kinds: ['automation_skip'], days: 7, take: 50 });
                const out = [];
                for (const r of rules) {
                    const last = await db.telegramLog.findFirst({
                        where: { ruleId: r.id }, orderBy: { sentAt: 'desc' }, select: { sentAt: true, status: true, error: true },
                    });
                    const trig = deps.triggers?.find(t => t.id === r.trigger);
                    const skip = skips.find((s: any) => s.subject === r.id);
                    out.push({
                        nomi: r.name,
                        turi: trig?.label || r.trigger,
                        kanal: r.channel,
                        yoqilgan: r.active,
                        yuborish_soatlari: trig?.sendWindow ? `${trig.sendWindow.fromHour}:00–${trig.sendWindow.toHour}:00` : 'cheklanmagan',
                        oxirgi_xabar: last ? `${tzDate(last.sentAt)} — ${last.status === 'Failed' ? `ketmadi: ${last.error}` : 'yuborilgan'}` : 'hali yuborilmagan',
                        qoida_xatosi: skip ? `${skip.message} (${skip.count} marta)` : null,
                    });
                }
                return {
                    qoidalar: out,
                    eslatma: "Qabulga 1 soatdan kam qolganda yozilgan bemorga SMS ketmaydi (u klinikada turibdi yoki hozirgina gaplashilgan). Bir bemorga bir hodisa bo'yicha xabar faqat bir marta ketadi.",
                };
            },
        },
        {
            roles: STAFF,
            def: fn('explain_permission',
                "Xodim ilovada nimani ko'ra oladi va nimani ko'ra olmaydi (Xodimlar → Ruxsatlar). \"Menda tugma yo'q\", \"bo'lim ko'rinmayapti\", \"xodim X ni qila olmayapti\" savolida chaqir.",
                { rol: { type: 'string', enum: ['doctor', 'receptionist'], description: "Qaysi rol haqida. Xodimning o'zi so'rasa — bo'sh qoldir." } }),
            async run(args, ctx, clinicId) {
                const own = toPermRole(ctx.user.role);
                const role = own || (args?.rol === 'doctor' || args?.rol === 'receptionist' ? args.rol : null);
                if (!role) {
                    return { izoh: "Rahbar va laborant ruxsatlar bilan cheklanmaydi. Xodim haqida so'ralayotgan bo'lsa — shifokormi yoki resepshnmi, aniqlashtir." };
                }
                const c = await db.clinic.findUnique({ where: { id: clinicId }, select: { accessControl: true } });
                const userRole = role === 'doctor' ? 'DOCTOR' : 'RECEPTIONIST';
                const checker = makePermChecker(userRole, c?.accessControl ?? null);
                const perms = resolveRolePerms(role, c?.accessControl ?? null);
                const level = matchingLevel(role, perms);
                const closed: string[] = [];
                const open: string[] = [];
                for (const m of modulesForRole(role)) {
                    if (m.menu && !checker.menu(m.id)) { closed.push(`${m.name} bo'limi (to'liq yopiq)`); continue; }
                    if (m.menu) open.push(m.name);
                    for (const s of m.sections) {
                        const missing = s.acts.filter(a => !checker.can(m.id, s.id, a));
                        if (missing.length) closed.push(`${m.name} → ${s.name}: ${missing.map(a => ACTION_LABEL[a] || a).join(', ')} yopiq`);
                    }
                    for (const sp of m.specials) {
                        if (!checker.flag(m.id, sp.id)) closed.push(`${m.name}: «${sp.name}» yopiq`);
                    }
                }
                return {
                    rol: role === 'doctor' ? 'shifokor' : 'resepshn',
                    daraja: level ? PERM_LEVELS.find(l => l.id === level)?.label : "qo'lda sozlangan",
                    ochiq_bolimlar: open,
                    yopiq: closed.slice(0, 40),
                    kim_ozgartiradi: "Faqat klinika rahbari: Xodimlar → Ruxsatlar. O'zgarish 30 soniya ichida kuchga kiradi, xodim sahifani yangilashi kerak.",
                };
            },
        },
        {
            roles: STAFF,
            def: fn('check_login',
                "Kimdir tizimga kira olmayotgan bo'lsa: akkaunt bormi, o'chirilganmi, oxirgi marta qachon kirgan va oxirgi urinishlar nega o'tmagan. Rahbar xodimi haqida so'rasa — xodimning login yoki ismini ber.",
                { login: { type: 'string', description: 'Xodimning logini yoki ismi (rahbar so\'raganda)' } }),
            async run(args, ctx, clinicId) {
                // Xodimlar ro'yxati va ularning kira olmagan urinishlari faqat ilova orqali ulangan rahbarga.
                // Telefon orqali ulangan rahbar raqami faqat oxirgi 9 xona bo'yicha mos kelgan bo'lishi mumkin.
                const isOwnerAccount = ctx.user.role === 'CLINIC_ADMIN';
                const isOwner = isOwnerAccount && ctx.user.verifiedVia === 'session';
                const needle = String(args?.login || '').trim().toLowerCase();
                const staff: any[] = [];
                const tables: [string, string][] = [['doctor', 'shifokor'], ['receptionist', 'resepshn'], ['labTechnician', 'laborant']];
                for (const [model, label] of tables) {
                    const rows: any[] = await db[model].findMany({
                        where: { clinicId },
                        select: { id: true, firstName: true, lastName: true, username: true, status: true },
                    });
                    for (const r of rows) staff.push({ ...r, label });
                }
                let targets = staff;
                if (!isOwner) targets = staff.filter(s => s.id === ctx.user.staffId);
                else if (needle) {
                    targets = staff.filter(s =>
                        `${s.username || ''} ${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(needle));
                }
                const clinic = isOwnerAccount
                    ? await db.clinic.findUnique({ where: { id: clinicId }, select: { username: true, status: true } })
                    : null;
                const fails = await diag.list({ clinicId, kinds: ['login_failed'], days: 7, take: 100 });
                const failsFor = (username?: string | null) => fails
                    .filter((f: any) => username && f.subject === username)
                    .slice(0, 3)
                    .map((f: any) => `${tzDate(f.lastAt)}: ${f.message} (${f.count} marta)`);
                const lastLogin = async (actorId: string | null) => {
                    const row = await db.auditLog.findFirst({
                        where: { clinicId, action: 'login', actorId },
                        orderBy: { createdAt: 'desc' },
                        select: { createdAt: true },
                    });
                    return row ? tzDate(row.createdAt) : 'qayd yo\'q';
                };
                const out = [];
                for (const s of targets.slice(0, 8)) {
                    out.push({
                        kim: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
                        lavozim: s.label,
                        login: s.username || 'login berilmagan',
                        akkaunt: s.status === 'Active' ? 'yoqilgan' : "o'chirib qo'yilgan",
                        oxirgi_kirgan: await lastLogin(s.id),
                        otmagan_urinishlar: failsFor(s.username),
                    });
                }
                return {
                    rahbar_akkaunti: clinic ? {
                        login: clinic.username,
                        klinika_holati: clinic.status,
                        oxirgi_kirgan: await lastLogin(null),
                        otmagan_urinishlar: failsFor(clinic.username),
                    } : undefined,
                    xodimlar: out,
                    topilmadi: isOwner && needle && !out.length ? `"${args.login}" bo'yicha xodim topilmadi` : undefined,
                    parolni_tiklash: isOwner
                        ? "Xodim parolini rahbar almashtiradi: Xodimlar → Ro'yxat → xodimni tahrirlash. Rahbarning o'z paroli uchun request_password_reset chaqir."
                        : "Yangi parol uchun request_password_reset chaqir — so'rov klinika rahbariga boradi.",
                };
            },
        },
        {
            roles: ['CLINIC_ADMIN'],
            sessionOnly: true,
            def: fn('recent_changes',
                "Jurnal: kim, qachon, nimani qo'shdi, o'zgartirdi yoki o'chirdi. \"Qabulni kim o'chirdi\", \"to'lov qayoqqa ketdi\", \"narxni kim o'zgartirdi\" savolida chaqir.",
                {
                    tur: { type: 'string', enum: ['Patient', 'Appointment', 'Transaction', 'Expense', 'Service', 'Doctor', 'InventoryItem', 'CashRegisterDay', 'CashMovement'], description: 'Qaysi yozuv turi' },
                    amal: { type: 'string', enum: ['create', 'update', 'delete'], description: 'Qaysi amal' },
                    kun: { type: 'number', description: 'Necha kun orqaga (1–30), odatda 3' },
                }),
            async run(args, ctx, clinicId) {
                const days = Math.min(30, Math.max(1, Math.round(Number(args?.kun) || 3)));
                const rows: any[] = await db.auditLog.findMany({
                    where: {
                        clinicId,
                        createdAt: { gte: new Date(Date.now() - days * DAY_MS) },
                        ...(args?.tur ? { entity: String(args.tur) } : {}),
                        ...(args?.amal === 'delete' ? { action: { in: ['delete', 'bulk_delete'] } }
                            : args?.amal ? { action: String(args.amal) } : { action: { not: 'login' } }),
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 15,
                    select: { actorName: true, actorRole: true, action: true, entity: true, summary: true, createdAt: true },
                });
                if (!rows.length) return { topildi: 0, izoh: `Oxirgi ${days} kunda bunday o'zgarish jurnalda yo'q.` };
                // Ro'yxatda bemor ismlari bor — u modelga emas, to'g'ridan-to'g'ri foydalanuvchiga boradi
                const verb: Record<string, string> = { create: "qo'shdi", update: "o'zgartirdi", delete: "o'chirdi", bulk_delete: "o'chirdi" };
                ctx.attachments.push(rows.map(r => {
                    const at = new Date(new Date(r.createdAt).getTime() + 5 * 60 * 60 * 1000).toISOString();
                    return `• ${at.slice(8, 10)}.${at.slice(5, 7)} ${at.slice(11, 16)} — ${r.actorName} ${verb[r.action] || r.action}: ${r.summary || r.entity}`;
                }).join('\n'));
                return {
                    topildi: rows.length,
                    izoh: "Ro'yxat foydalanuvchiga alohida ko'rsatiladi — uni qayta yozma, ismlarni keltirma. Faqat bir gap bilan nima topilganini ayt va to'liq jurnal Sozlamalar → Jurnal da ekanini eslat.",
                    kimlar: [...new Set(rows.map(r => r.actorName))].length,
                };
            },
        },
        {
            roles: DESK,
            def: fn('setup_progress',
                "Klinikani sozlash qayergacha bajarilgan: xizmatlar, shifokorlar, bemorlar, qabullar, SMS. Yangi klinika \"nimadan boshlay\" deb so'raganda chaqir."),
            async run(_a, _ctx, clinicId) {
                const [services, doctors, patients, appointments, templates, c] = await Promise.all([
                    db.service.count({ where: { clinicId } }),
                    db.doctor.count({ where: { clinicId } }),
                    db.patient.count({ where: { clinicId } }),
                    db.appointment.count({ where: { clinicId } }),
                    db.messageTemplate.count({ where: { clinicId } }),
                    db.clinic.findUnique({ where: { id: clinicId }, select: { eskizToken: true, botToken: true } }),
                ]);
                const step = (done: boolean, name: string, where: string) => ({ qadam: name, bajarilgan: done, qayerda: where });
                return {
                    qadamlar: [
                        step(services > 0, `Xizmatlar va narxlar (${services} ta)`, 'Sozlamalar → Xizmatlar va narxlar'),
                        step(doctors > 0, `Shifokorlar (${doctors} ta)`, "Xodimlar → Ro'yxat"),
                        step(patients > 0, `Bemorlar (${patients} ta)`, 'Bemorlar'),
                        step(appointments > 0, `Qabullar (${appointments} ta)`, 'Kalendar'),
                        step(!!c?.eskizToken || !!c?.botToken, 'SMS yoki Telegram bot ulash', 'Sozlamalar → Integratsiyalar → Telegram va SMS'),
                        step(templates > 0, `Xabar shablonlari (${templates} ta)`, 'Xabarlar → Shablonlar'),
                    ],
                };
            },
        },
        {
            roles: STAFF,
            def: fn('system_status',
                "Ilova tomonida xato bo'lganmi: oxirgi soatlarda shu klinikada server yoki sahifa xatolari. \"Saqlanmayapti\", \"oq ekran\", \"xato chiqdi\", \"qotib qoldi\" degan shikoyatda chaqir."),
            async run(_a, _ctx, clinicId) {
                const events = await diag.list({ clinicId, kinds: ['server_error', 'client_error'], days: 1, take: 20 });
                const h = deps.health?.() || {};
                return {
                    oxirgi_24_soat_xatolar: events.map((e: any) => ({
                        turi: e.kind === 'server_error' ? 'server' : 'sahifa',
                        qayerda: e.subject,
                        nima: e.message,
                        soni: e.count,
                    })),
                    xato_topilmadi: events.length === 0,
                    server_versiyasi: h.build,
                    izoh: events.length
                        ? "Xato qayd etilgan — bu dastur tomonidagi muammo. Foydalanuvchiga buni ochiq ayt va escalate chaqir (dasturchiga yetkazish uchun)."
                        : "Shu klinikada xato qayd etilmagan. Foydalanuvchidan qaysi sahifada nima bosganda bo'lganini so'ra; sahifani yangilash (Ctrl+F5) va internetni tekshirishni tavsiya qil.",
                };
            },
        },
    ];

    const allowed = (s: ToolSpec, user: SupportUserRow): boolean =>
        !!user.clinicId && !!user.role && s.roles.includes(user.role as Role)
        && (!s.sessionOnly || user.verifiedVia === 'session');

    return {
        /** Shu foydalanuvchiga ko'rinadigan asboblar ta'riflari */
        defsFor(user: SupportUserRow): any[] {
            return specs.filter(s => allowed(s, user)).map(s => s.def);
        },
        has(name: string): boolean {
            return specs.some(s => s.def.function.name === name);
        },
        /** Asbobni bajaradi. Ruxsat bu yerda QAYTA tekshiriladi — ro'yxatda bo'lmagan asbobni model chaqira olmaydi. */
        async run(name: string, args: any, ctx: ToolContext): Promise<any> {
            const spec = specs.find(s => s.def.function.name === name);
            if (!spec) return { xato: "Bunday tekshiruv yo'q" };
            if (!allowed(spec, ctx.user)) {
                return { xato: `Bu ma'lumot ${ROLE_LABEL[ctx.user.role || ''] || 'bu foydalanuvchi'} uchun yopiq` };
            }
            try {
                return await spec.run(args || {}, ctx, ctx.user.clinicId as string);
            } catch (e: any) {
                console.error(`[support:tool] ${name}:`, e?.message);
                return { xato: 'Tekshirib bo\'lmadi' };
            }
        },
    };
};

const ACTION_LABEL: Record<string, string> = {
    view: "ko'rish", create: "qo'shish", edit: 'tahrirlash', delete: "o'chirish", export: 'yuklab olish',
};

export type Tools = ReturnType<typeof createTools>;
