import { Appointment, CallLog, CallLogChange, CallLogEntry, InstallmentPlan, LabOrder, Lead, Patient, Recall } from '../types';
import { isOpenAppointment, minutesOf } from './queue';

/**
 * Resepshn ish stoli (bosh sahifa) uchun tanlovlar — sof funksiyalar.
 * Hammasi ilovada allaqachon yuklangan ma'lumotdan (va qo'ng'iroqlar uchun
 * bugungi jurnaldan) hisoblanadi, bazaga yangi ustun kerak emas.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** "YYYY-MM-DD" ga n kun qo'shish (mahalliy sana, oy/yil chegarasi to'g'ri o'tadi) */
export function addDaysISO(iso: string, n: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// ── Laboratoriya ─────────────────────────────────────────────────────────────

export interface LabSummary {
    /** Texnik tayyorlab bo'ldi — bemorni o'rnatishga chaqirish kerak */
    ready: LabOrder[];
    /** Muddati o'tdi, hali tayyor emas */
    overdue: LabOrder[];
    /** Muddati bugun */
    dueToday: LabOrder[];
    /** Muddati hali kelmagan, texnikda ishlanmoqda */
    inProgress: number;
}

const ACTIVE_LAB = new Set(['Pending', 'In-Progress']);
const byUrgency = (a: LabOrder, b: LabOrder) =>
    (a.priority === 'Urgent' ? 0 : 1) - (b.priority === 'Urgent' ? 0 : 1)
    || String(a.deadline || '').localeCompare(String(b.deadline || ''));

export function labSummary(orders: LabOrder[], today: string): LabSummary {
    const active = orders.filter(o => ACTIVE_LAB.has(o.status));
    return {
        ready: orders.filter(o => o.status === 'Ready').sort(byUrgency),
        overdue: active.filter(o => !!o.deadline && o.deadline < today).sort(byUrgency),
        dueToday: active.filter(o => o.deadline === today).sort(byUrgency),
        inProgress: active.filter(o => !o.deadline || o.deadline > today).length,
    };
}

// ── Bo'lib to'lash ───────────────────────────────────────────────────────────

export interface InstallmentDue {
    key: string;
    planId: string;
    patientId: string;
    patientName: string;
    phone?: string;
    service: string;
    amount: number;
    expectedDate: string;
    overdue: boolean;
}

/**
 * Faol rejalardagi to'lanmagan bo'laklar: muddati o'tgan yoki yaqin kunlarda keladiganlar.
 * Reja ichida bemor ma'lumoti kelmasa (masalan, demo) — bemorlar ro'yxatidan olinadi.
 */
export function installmentDues(plans: InstallmentPlan[], today: string, horizonDays = 3, patients: Patient[] = []): InstallmentDue[] {
    const horizon = addDaysISO(today, horizonDays);
    const byId = new Map(patients.map(p => [p.id, p] as [string, Patient]));
    const out: InstallmentDue[] = [];
    for (const plan of plans || []) {
        if (!plan || plan.status !== 'Active') continue;
        const patient = plan.patient || byId.get(plan.patientId);
        for (const item of plan.items || []) {
            if (item.status !== 'Pending') continue;
            const date = String(item.expectedDate || '').slice(0, 10);
            if (!date || date > horizon) continue;
            out.push({
                key: item.id,
                planId: plan.id,
                patientId: plan.patientId,
                patientName: patient ? `${patient.lastName} ${patient.firstName}` : '',
                phone: patient?.phone,
                service: plan.service || '',
                amount: Number(item.amount) || 0,
                expectedDate: date,
                overdue: date < today,
            });
        }
    }
    return out.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

// ── Qo'ng'iroqlar ro'yxati ───────────────────────────────────────────────────

/**
 * Resepshn bugun qo'ng'iroq qilishi kerak bo'lganlar — bitta ro'yxatda, muhimlik
 * tartibida: kelmaganlar (qayta yozish), yangi lidlar (tez javob muhim),
 * tasdiqlanmagan qabullar (bugungi va keyingi ish kuni), nazoratga chaqirish,
 * tug'ilgan kunlar. Bugun ko'tarmaganlar ro'yxat oxiriga — qayta urinishga tushadi.
 *
 * Qatorning natijasi o'z yozuviga yoziladi (qabul, lid, nazorat holati); boshqa
 * joyi yo'q natijalar va "ko'tarmadi" urinishlari — bugungi jurnalda (CallLog).
 */
export type CallKind = 'noshow' | 'lead' | 'confirm' | 'recall' | 'birthday';

export interface CallItem {
    key: string;
    kind: CallKind;
    name: string;
    phone?: string;
    /** Bemor kartasidagi ikkinchi raqam */
    secondaryPhone?: string;
    patientId?: string;
    appointmentId?: string;
    leadId?: string;
    recallId?: string;
    /** Qabul kuni va vaqti (kelmagan / tasdiqlash) */
    apptDate?: string;
    time?: string;
    doctorName?: string;
    /** Nazorat muddati */
    date?: string;
    overdue?: boolean;
    /** Lid qiziqqan xizmat yoki manba; nazorat sababi */
    note?: string;
    /** Tug'ilgan kunda to'ladigan yosh */
    age?: number;
    /** Tasdiqlash: klinikaga birinchi marta keladi — bunday bemor ko'proq kelmay qoladi */
    firstVisit?: boolean;
    /** Tasdiqlash: oldin qabulga kelmay qolgan */
    missedBefore?: boolean;
    /** Bugun necha marta ko'tarmadi; oxirgisi qachon va kim qo'ng'iroq qilgan */
    attempts: number;
    lastAttemptAt?: string;
    lastAttemptBy?: string | null;
}

interface CallInput {
    appointments: Appointment[];
    patients: Patient[];
    recalls: Recall[];
    leads: Lead[];
    today: string;
    /** Hozirgi vaqt (kun boshidan daqiqa): bugungi qabulning vaqti o'tgan bo'lsa tasdiqlash kech */
    nowMin: number;
    includeLeads: boolean;
    log?: CallLog;
}

const byTime = (a: Appointment, b: Appointment) => minutesOf(a.time) - minutesOf(b.time);

/** Jurnalga bitta o'zgarish. Backenddagi (/api/desk/calls) qoida bilan bir xil. */
export function applyCallChange(log: CallLog, key: string, change: CallLogChange, at: string, by: string | null = null): CallLog {
    const prev = log[key];
    const entry: CallLogEntry = { ...(prev || {}), at, by };
    if (change.noAnswer !== undefined) entry.n = Math.max(0, Math.min(99, (prev?.n || 0) + change.noAnswer));
    if (change.result !== undefined) {
        if (change.result === null) delete entry.r;
        else entry.r = change.result;
    }
    if (!entry.n) delete entry.n;
    const next = { ...log };
    if (!entry.n && !entry.r) delete next[key];
    else next[key] = entry;
    return next;
}

/**
 * Qaysi kunning qabullari tasdiqlanadi: ertangi. Ertaga birorta qabul bo'lmasa
 * (masalan yakshanba — dam olish kuni), qabuli bor eng yaqin kun (3 kungacha).
 */
export function confirmDay(appointments: Appointment[], today: string, maxAhead = 3): string {
    for (let i = 1; i <= maxAhead; i++) {
        const day = addDaysISO(today, i);
        if (appointments.some(a => a.date === day && isOpenAppointment(a))) return day;
    }
    return addDaysISO(today, 1);
}

/** O'sha kunning nechta qabuli bor va nechtasi tasdiqlangan (boshqa kompyuterda tasdiqlangani ham) */
export function confirmProgress(appointments: Appointment[], day: string, log: CallLog = {}): { total: number; confirmed: number } {
    let total = 0;
    let confirmed = 0;
    for (const a of appointments) {
        if (a.date !== day || !isOpenAppointment(a)) continue;
        const r = log[`cf-${a.id}`]?.r;
        if (r === 'cancelled') continue;
        total++;
        if (a.status !== 'Pending' || r === 'confirmed' || r === 'rescheduled') confirmed++;
    }
    return { total, confirmed };
}

/** Bugungi jurnal bo'yicha qisqa hisob — karta pastidagi qator uchun */
export function callSummary(log: CallLog): { confirmed: number; cancelled: number; booked: number; noAnswer: number } {
    const s = { confirmed: 0, cancelled: 0, booked: 0, noAnswer: 0 };
    for (const e of Object.values(log)) {
        if (e.r === 'confirmed' || e.r === 'rescheduled') s.confirmed++;
        else if (e.r === 'cancelled') s.cancelled++;
        else if (e.r === 'booked') s.booked++;
        else if (!e.r && e.n) s.noAnswer++;
    }
    return s;
}

export function buildCallList({ appointments, patients, recalls, leads, today, nowMin, includeLeads, log = {} }: CallInput): CallItem[] {
    const confirmOn = confirmDay(appointments, today);
    const byId = new Map(patients.map(p => [p.id, p]));
    // Keyingi kunlarga yozilgan bemor — kelmagan yoki nazorat uchun qo'ng'iroq shart emas
    // (masalan, boshqa kompyuterdan yoki botdan yozilgan)
    const upcoming = new Set(appointments.filter(a => a.date > today && isOpenAppointment(a)).map(a => a.patientId));
    const comesToday = new Set(appointments.filter(a => a.date === today && isOpenAppointment(a)).map(a => a.patientId));
    const visited = new Set<string>();
    const missed = new Set<string>();
    for (const a of appointments) {
        if (a.date >= today) continue;
        if (a.status === 'Completed') visited.add(a.patientId);
        else if (a.status === 'No-Show') missed.add(a.patientId);
    }
    const phones = (patientId: string) => {
        const p = byId.get(patientId);
        return { phone: p?.phone, secondaryPhone: p?.secondaryPhone || undefined };
    };

    const fresh: CallItem[] = [];
    const retry: CallItem[] = [];
    const push = (item: Omit<CallItem, 'attempts'>) => {
        const entry = log[item.key];
        if (entry?.r) return; // natija yozilgan
        const attempts = entry?.n || 0;
        const full: CallItem = { ...item, attempts, lastAttemptAt: attempts ? entry!.at : undefined, lastAttemptBy: attempts ? entry!.by : undefined };
        (attempts ? retry : fresh).push(full);
    };

    appointments
        .filter(a => a.date === today && a.status === 'No-Show' && !upcoming.has(a.patientId))
        .sort(byTime)
        .forEach(a => push({
            key: `ns-${a.id}`, kind: 'noshow', name: a.patientName, ...phones(a.patientId),
            patientId: a.patientId, appointmentId: a.id, apptDate: a.date, time: a.time, doctorName: a.doctorName,
        }));

    if (includeLeads) {
        leads
            .filter(l => l.status === 'New')
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .forEach(l => push({
                key: `ld-${l.id}`, kind: 'lead', name: l.name, phone: l.phone, leadId: l.id,
                note: l.service || l.source || undefined,
            }));
    }

    appointments
        .filter(a => a.status === 'Pending'
            && ((a.date === today && minutesOf(a.time) > nowMin) || a.date === confirmOn))
        .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))
        .forEach(a => {
            const p = byId.get(a.patientId);
            push({
                key: `cf-${a.id}`, kind: 'confirm', name: a.patientName, ...phones(a.patientId),
                patientId: a.patientId, appointmentId: a.id, apptDate: a.date, time: a.time, doctorName: a.doctorName,
                // Tizimga ko'chirilgan eski bemorda qabullar tarixi bo'lmasligi mumkin — oxirgi tashrif sanasi bor
                firstVisit: !!p && !visited.has(a.patientId) && (!p.lastVisit || p.lastVisit === 'Never'),
                missedBefore: missed.has(a.patientId),
            });
        });

    recalls
        .filter(r => (r.status === 'planned' || r.status === 'reminded') && !upcoming.has(r.patientId) && !comesToday.has(r.patientId))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .forEach(r => {
            const p = byId.get(r.patientId);
            push({
                key: `rc-${r.id}`, kind: 'recall',
                name: r.patient ? `${r.patient.lastName} ${r.patient.firstName}` : (p ? `${p.lastName} ${p.firstName}` : '—'),
                phone: r.patient?.phone || p?.phone, secondaryPhone: p?.secondaryPhone || undefined,
                patientId: r.patientId, recallId: r.id, date: r.dueDate, overdue: r.dueDate < today,
                note: r.reason || undefined,
            });
        });

    const monthDay = today.slice(5);
    patients
        .filter(p => p.status !== 'Archived' && typeof p.dob === 'string' && p.dob.slice(5, 10) === monthDay)
        .forEach(p => {
            const year = Number(p.dob.slice(0, 4));
            push({
                key: `bd-${p.id}`, kind: 'birthday', name: `${p.lastName} ${p.firstName}`,
                phone: p.phone, secondaryPhone: p.secondaryPhone || undefined,
                patientId: p.id, age: year > 1900 ? Number(today.slice(0, 4)) - year : undefined,
            });
        });

    // Ko'tarmaganlar — eng oldin urinilgani birinchi (qayta qo'ng'iroq navbati)
    retry.sort((a, b) => String(a.lastAttemptAt || '').localeCompare(String(b.lastAttemptAt || '')));
    return [...fresh, ...retry];
}

// ── Qabul uchun bo'sh vaqtlar ────────────────────────────────────────────────

export interface Slot {
    time: string;
    /** Shifokorning boshqa qabuli bilan ustma-ust tushadi */
    busy: boolean;
    /** Bugun va vaqti o'tib ketgan */
    past: boolean;
}

/**
 * Shifokorning bir kunlik vaqtlari (klinika ish soatlari ichida, qadam bilan).
 * Band — shu oraliqqa boshqa (bekor qilinmagan) qabul tushsa.
 */
export function daySlots(
    appointments: Appointment[],
    doctorId: string,
    date: string,
    opts: { startHour: number; endHour: number; step?: number; nowMin?: number; ignoreAppointmentId?: string },
): Slot[] {
    const step = opts.step ?? 30;
    const taken = appointments
        .filter(a => a.doctorId === doctorId && a.date === date && a.status !== 'Cancelled' && a.id !== opts.ignoreAppointmentId)
        .map(a => {
            const s = minutesOf(a.time);
            return [s, s + (Number(a.duration) || 30)] as const;
        });
    const start = Math.max(0, Math.min(23, opts.startHour)) * 60;
    const end = Math.max(start + step, Math.min(24, opts.endHour) * 60);
    const out: Slot[] = [];
    for (let m = start; m < end; m += step) {
        out.push({
            time: hhmm(m),
            busy: taken.some(([s, e]) => s < m + step && m < e),
            past: opts.nowMin !== undefined && m < opts.nowMin,
        });
    }
    return out;
}
