import { Appointment, InstallmentPlan, LabOrder, Lead, Patient, Recall } from '../types';
import { minutesOf } from './queue';

/**
 * Resepshn ish stoli (bosh sahifa) uchun tanlovlar — sof funksiyalar.
 * Hammasi ilovada allaqachon yuklangan ma'lumotdan hisoblanadi, bazaga yangi
 * so'rov yoki ustun kerak emas.
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

/** Faol rejalardagi to'lanmagan bo'laklar: muddati o'tgan yoki yaqin kunlarda keladiganlar */
export function installmentDues(plans: InstallmentPlan[], today: string, horizonDays = 3): InstallmentDue[] {
    const horizon = addDaysISO(today, horizonDays);
    const out: InstallmentDue[] = [];
    for (const plan of plans || []) {
        if (!plan || plan.status !== 'Active') continue;
        const patient = plan.patient;
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
 * tartibida: kelmaganlar (qayta yozish), yangi lidlar (tez javob muhim), ertangi
 * tasdiqlanmagan qabullar, nazoratga chaqirish, tug'ilgan kunlar.
 */
export type CallKind = 'noshow' | 'lead' | 'confirm' | 'recall' | 'birthday';

export interface CallItem {
    key: string;
    kind: CallKind;
    name: string;
    phone?: string;
    patientId?: string;
    recallId?: string;
    /** Qabul vaqti (kelmagan / ertangi) */
    time?: string;
    doctorName?: string;
    /** Nazorat muddati */
    date?: string;
    overdue?: boolean;
    /** Lid qiziqqan xizmat yoki manba; nazorat sababi */
    note?: string;
    /** Tug'ilgan kunda to'ladigan yosh */
    age?: number;
}

interface CallInput {
    appointments: Appointment[];
    patients: Patient[];
    recalls: Recall[];
    leads: Lead[];
    today: string;
    includeLeads: boolean;
}

const byTime = (a: Appointment, b: Appointment) => minutesOf(a.time) - minutesOf(b.time);

export function buildCallList({ appointments, patients, recalls, leads, today, includeLeads }: CallInput): CallItem[] {
    const tomorrow = addDaysISO(today, 1);
    const byId = new Map(patients.map(p => [p.id, p]));
    const out: CallItem[] = [];

    appointments
        .filter(a => a.date === today && a.status === 'No-Show')
        .sort(byTime)
        .forEach(a => out.push({
            key: `ns-${a.id}`, kind: 'noshow', name: a.patientName, phone: byId.get(a.patientId)?.phone,
            patientId: a.patientId, time: a.time, doctorName: a.doctorName,
        }));

    if (includeLeads) {
        leads
            .filter(l => l.status === 'New')
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .forEach(l => out.push({
                key: `ld-${l.id}`, kind: 'lead', name: l.name, phone: l.phone, note: l.service || l.source || undefined,
            }));
    }

    appointments
        .filter(a => a.date === tomorrow && a.status === 'Pending')
        .sort(byTime)
        .forEach(a => out.push({
            key: `cf-${a.id}`, kind: 'confirm', name: a.patientName, phone: byId.get(a.patientId)?.phone,
            patientId: a.patientId, time: a.time, doctorName: a.doctorName,
        }));

    recalls
        .filter(r => r.status === 'planned' || r.status === 'reminded')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .forEach(r => out.push({
            key: `rc-${r.id}`, kind: 'recall',
            name: r.patient ? `${r.patient.lastName} ${r.patient.firstName}` : (byId.get(r.patientId) ? `${byId.get(r.patientId)!.lastName} ${byId.get(r.patientId)!.firstName}` : '—'),
            phone: r.patient?.phone || byId.get(r.patientId)?.phone,
            patientId: r.patientId, recallId: r.id, date: r.dueDate, overdue: r.dueDate < today,
            note: r.reason || undefined,
        }));

    const monthDay = today.slice(5);
    patients
        .filter(p => p.status !== 'Archived' && typeof p.dob === 'string' && p.dob.slice(5, 10) === monthDay)
        .forEach(p => {
            const year = Number(p.dob.slice(0, 4));
            out.push({
                key: `bd-${p.id}`, kind: 'birthday', name: `${p.lastName} ${p.firstName}`, phone: p.phone,
                patientId: p.id, age: year > 1900 ? Number(today.slice(0, 4)) - year : undefined,
            });
        });

    return out;
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
