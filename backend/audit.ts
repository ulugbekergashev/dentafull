/**
 * O'zgarishlar jurnali (Sozlamalar → Jurnal): kim, qachon, nimani qo'shdi,
 * o'zgartirdi yoki o'chirdi.
 *
 * Nega Prisma middleware: yozuvlar o'nlab endpointdan, AI yordamchidan va
 * yordamchi funksiyalardan o'zgaradi. Har biriga qo'lda log qo'shish bitta
 * joyni unutishga olib keladi. Middleware har bir create/update/delete ni
 * bitta joyda ushlaydi.
 *
 * Kim qildi — AsyncLocalStorage orqali: authenticateToken so'rovni
 * runWithActor ichida davom ettiradi, shu so'rov ichidagi barcha bazaga yozish
 * o'sha xodim nomidan yoziladi. Cron, Telegram bot va avtomatika (kontekstsiz)
 * yozilmaydi — ular xodim harakati emas.
 *
 * Asosiy amal hech qachon jurnal tufayli to'xtamaydi: jurnal yozuvi
 * kutilmaydi va xatosi yutiladi.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { prisma } from './db';

export interface AuditActor {
    id: string | null;
    name: string;
    role: string;
    clinicId: string | null;
}

const store = new AsyncLocalStorage<{ actor: AuditActor }>();

export function actorFromUser(user: any): AuditActor {
    return {
        id: user?.doctorId || user?.receptionistId || user?.technicianId || user?.salesAgentId || null,
        name: user?.role === 'SUPER_ADMIN' ? 'DentaCRM (super admin)' : (user?.name || "Noma'lum"),
        role: user?.role || 'UNKNOWN',
        clinicId: user?.clinicId || null,
    };
}

/** So'rovni shu xodim nomidan davom ettiradi (authenticateToken ichida) */
export const runWithActor = <T>(user: any, fn: () => T): T => store.run({ actor: actorFromUser(user) }, fn);

/** Fon ishlari (avtomatika va h.k.) xodim nomidan yozilmasin */
export const runWithoutActor = <T>(fn: () => T): T => store.exit(fn);

// ─── Qaysi jadvallar kuzatiladi ──────────────────────────────────────────────

const ddmm = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const money = (n: any) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} so'm`;
const person = (r: any) => [r?.lastName, r?.firstName].filter(Boolean).join(' ');

interface Tracked {
    /** Yozuvni bir qatorda tanitadi: "Karimov Ali · 02.10 10:00" */
    name: (r: any) => string;
    /** Farq ko'rsatilmaydigan maydonlar — tizim o'zi yangilaydi */
    ignore?: string[];
}

const TRACKED: Record<string, Tracked> = {
    Patient: { name: person, ignore: ['balance', 'lastVisit', 'telegramChatId'] },
    Appointment: { name: r => `${r.patientName || ''} · ${ddmm(r.date)} ${r.time || ''}`.trim(), ignore: ['reminderSent', 'bookedAt'] },
    Transaction: { name: r => `${r.patientName || ''} · ${money(r.amount)}` },
    Expense: { name: r => `${r.title || r.category || ''} · ${money(r.amount)}` },
    Service: { name: r => r.name },
    ServiceCategory: { name: r => r.name },
    Doctor: { name: r => `Dr. ${person(r)}`, ignore: ['telegramChatId'] },
    Receptionist: { name: person, ignore: ['telegramChatId'] },
    LabTechnician: { name: person },
    InventoryItem: { name: r => r.name },
    LabOrder: { name: r => `${r.patientName || ''} · ${r.orderType || ''}` },
    Lead: { name: r => [r.name, r.phone].filter(Boolean).join(' · ') },
    Branch: { name: r => r.name },
    Clinic: {
        name: r => r.name,
        ignore: ['telegramChatId', 'smsBalance', 'smsUsedThisMonth', 'eskizToken', 'eskizTokenExpiry', 'dmedToken', 'dmedTokenExpiry', 'aiKeyCheckedAt', 'monthlyRevenue'],
    },
    MessageTemplate: { name: r => r.name, ignore: ['eskizStatus', 'eskizSubmittedAt', 'eskizTemplateId'] },
    AutomationRule: { name: r => r.name },
    InstallmentPlan: { name: r => `${r.service || ''} · ${money(r.totalAmount)}`, ignore: ['totalPaid'] },
    CashRegisterDay: { name: r => `${ddmm(r.date)}${r.shift > 1 ? ` · ${r.shift}-smena` : ''}` },
    CashMovement: { name: r => `${r.type || ''} · ${money(r.amount)}` },
    Recall: { name: r => `${ddmm(r.dueDate)}${r.reason ? ` · ${r.reason}` : ''}` },
    Visit: { name: r => ddmm(r.date) },
    TreatmentProcedure: { name: r => `${r.procedureName || ''}${r.toothNumber ? ` · ${r.toothNumber}-tish` : ''}` },
    PatientDiagnosis: { name: r => `${r.code || ''} · ${ddmm(r.date)}` },
    PatientPhoto: { name: r => r.description || r.category || 'Rasm' },
    ToothData: { name: r => `${r.number}-tish` },
};

/** Hamma jadvallarda farq sifatida ko'rsatilmaydi */
const ALWAYS_IGNORE = new Set(['id', 'clinicId', 'createdAt', 'updatedAt']);
/** Qiymati jurnalga yozilmaydi — faqat "o'zgartirildi" belgisi */
const SECRET = new Set([
    'password', 'eskizPassword', 'botToken', 'aiApiKey', 'dmedApiKey', 'dmedApiSecret', 'leadApiKey',
    'facebookPageAccessToken', 'facebookUserAccessToken',
]);
const HIDDEN = '••••••';

// ─── Farqni hisoblash ────────────────────────────────────────────────────────

const MAX_VALUE = 300;
const MAX_FIELDS = 40;

function norm(v: any): any {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
        try { v = JSON.stringify(v); } catch { return '[obyekt]'; }
    }
    if (typeof v === 'string' && v.length > MAX_VALUE) return `${v.slice(0, MAX_VALUE)}…`;
    return v;
}

const isScalar = (v: any) => v === null || ['string', 'number', 'boolean'].includes(typeof v) || v instanceof Date;

/** Ichki bog'lanish ID'lari (patientId, visitId...) o'qib bo'lmaydi — ko'rsatilmaydi.
 *  doctorId va branchId bundan mustasno: ular ekranda nomga aylantiriladi. */
const isLinkId = (key: string) => /Id$/.test(key) && key !== 'doctorId' && key !== 'branchId';

function skipField(model: string, key: string): boolean {
    return ALWAYS_IGNORE.has(key) || isLinkId(key) || !!TRACKED[model]?.ignore?.includes(key);
}

/** create / delete uchun — yozuvning o'zi (bo'sh maydonlarsiz) */
function snapshot(model: string, rec: any): Record<string, [any, any]> | null {
    if (!rec || typeof rec !== 'object') return null;
    const out: Record<string, [any, any]> = {};
    let n = 0;
    for (const [k, v] of Object.entries(rec)) {
        // Bo'sh, nol va "yo'q" qiymatlar yangi yozuvda shovqin — ko'rsatilmaydi
        if (skipField(model, k) || v === null || v === '' || v === 0 || v === false || !isScalar(v)) continue;
        out[k] = [null, SECRET.has(k) ? HIDDEN : norm(v)];
        if (++n >= MAX_FIELDS) break;
    }
    return n ? out : null;
}

/** update uchun — faqat o'zgargan maydonlar [eski, yangi] */
function diff(model: string, before: any, after: any, data: any): Record<string, [any, any]> {
    const out: Record<string, [any, any]> = {};
    const keys = new Set<string>([
        ...Object.keys(after || {}),
        ...Object.keys(data || {}).filter(k => isScalar(data[k])),
    ]);
    for (const k of keys) {
        if (skipField(model, k)) continue;
        const newRaw = after && k in after ? after[k] : data?.[k];
        if (newRaw === undefined || !isScalar(newRaw)) continue;
        const oldV = norm(before?.[k] ?? null);
        const newV = norm(newRaw);
        if (oldV === newV) continue;
        // Sana satri va Date bir xil kun bo'lsa ham farq ko'rinmasin
        if (oldV != null && newV != null && String(oldV) === String(newV)) continue;
        out[k] = SECRET.has(k) ? [HIDDEN, HIDDEN] : [oldV, newV];
        if (Object.keys(out).length >= MAX_FIELDS) break;
    }
    return out;
}

// ─── Yozish ──────────────────────────────────────────────────────────────────

interface Entry {
    clinicId: string;
    action: 'create' | 'update' | 'delete' | 'bulk_delete' | 'login';
    entity: string;
    entityId?: string | null;
    summary: string;
    changes?: Record<string, [any, any]> | null;
}

function write(actor: AuditActor, e: Entry) {
    // Kutilmaydi: jurnal hech qachon asosiy amalni sekinlashtirmaydi yoki to'xtatmaydi
    prisma.auditLog.create({
        data: {
            clinicId: e.clinicId,
            actorId: actor.id,
            actorName: actor.name.slice(0, 120),
            actorRole: actor.role,
            action: e.action,
            entity: e.entity,
            entityId: e.entityId ? String(e.entityId) : null,
            summary: (e.summary || '').slice(0, 300),
            changes: e.changes && Object.keys(e.changes).length ? JSON.stringify(e.changes) : null,
        },
    }).catch((err: any) => console.error('[audit] yozilmadi:', err?.message || err));
}

/** Tizimga kirish — login endpointidan (u yerda hali kontekst yo'q) */
export function auditLogin(user: any) {
    if (!user?.clinicId) return;
    write(actorFromUser(user), { clinicId: user.clinicId, action: 'login', entity: 'Session', summary: '' });
}

const clinicOf = (model: string, rec: any, actor: AuditActor): string | null =>
    (model === 'Clinic' ? rec?.id : rec?.clinicId) || actor.clinicId || null;

/** Yozuvni tanituvchi matn. Bemor ismi yozuvda bo'lmasa (nazorat, bo'lib to'lash...) — topib qo'shiladi */
async function nameOf(model: string, rec: any): Promise<string> {
    let base = '';
    try { base = (TRACKED[model].name(rec) || '').trim(); } catch { /* nomsiz qoladi */ }
    if (rec?.patientId && !rec?.patientName) {
        const p = await prisma.patient.findUnique({ where: { id: rec.patientId }, select: { firstName: true, lastName: true } }).catch(() => null);
        if (p) base = [person(p), base].filter(Boolean).join(' · ');
    }
    return base;
}

const delegate = (model: string): any => (prisma as any)[model.charAt(0).toLowerCase() + model.slice(1)];

/** Middleware'ni ulaydi. server.ts ishga tushganda bir marta chaqiriladi. */
export function installAuditMiddleware() {
    prisma.$use(async (params: any, next: (p: any) => Promise<any>) => {
        const model: string | undefined = params.model;
        const ctx = store.getStore();
        if (!ctx || !model || !TRACKED[model]) return next(params);
        const { action, args } = params;
        if (!['create', 'update', 'upsert', 'delete', 'deleteMany'].includes(action)) return next(params);

        const actor = ctx.actor;
        let before: any = null;
        if ((action === 'update' || action === 'upsert' || action === 'delete') && args?.where) {
            before = await delegate(model).findUnique({ where: args.where }).catch(() => null);
        }

        const result = await next(params);
        // Jurnal yozuvi so'rovni kutdirmaydi — javob darhol qaytadi, yozuv fonda tayyorlanadi
        void record(actor, model, action, args, before, result);
        return result;
    });
}

async function record(actor: AuditActor, model: string, action: string, args: any, before: any, result: any) {
    try {
        if (action === 'deleteMany') {
            const count = result?.count || 0;
            const clinicId = args?.where?.clinicId || actor.clinicId;
            if (count > 0 && typeof clinicId === 'string') {
                write(actor, { clinicId, action: 'bulk_delete', entity: model, summary: String(count) });
            }
            return;
        }

        const isCreate = action === 'create' || (action === 'upsert' && !before);
        const isDelete = action === 'delete';
        const rec = isDelete ? before : result;
        const clinicId = clinicOf(model, rec || before, actor);
        if (!clinicId) return;

        if (isCreate) {
            write(actor, { clinicId, action: 'create', entity: model, entityId: rec?.id, summary: await nameOf(model, rec), changes: snapshot(model, rec) });
        } else if (isDelete) {
            if (before) write(actor, { clinicId, action: 'delete', entity: model, entityId: before.id, summary: await nameOf(model, before), changes: snapshot(model, before) });
        } else {
            const data = action === 'upsert' ? args?.update : args?.data;
            const changes = diff(model, before, result, data);
            if (Object.keys(changes).length) {
                write(actor, { clinicId, action: 'update', entity: model, entityId: result?.id || before?.id, summary: await nameOf(model, { ...before, ...result }), changes });
            }
        }
    } catch (err: any) {
        console.error('[audit] hisoblanmadi:', err?.message || err);
    }
}

/** Bir yildan eski yozuvlarni tozalash (kunlik cron) */
export async function pruneAuditLog() {
    const cutoff = new Date(Date.now() - 365 * 86400000);
    await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => { });
}
