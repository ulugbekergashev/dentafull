import { Appointment, FlowLog, TicketLog } from '../types';
import { ClinicFlow, visitMinutes } from './flow';
import { minutesOf } from './queue';

/**
 * Onlayn navbat va TV ekrani — bosh sahifa xaritasi bilan BIR XIL ma'lumot:
 * bugungi qabullar (kim kutmoqda) + /api/desk/flow (kim kabinetga chaqirilgan,
 * navbat raqami). Alohida navbat jadvali yo'q, shuning uchun resepshn, shifokor,
 * TV va bosh sahifa har qanday qurilmada bir xil holatni ko'radi.
 */

/** Kabinetga chaqiruv: kirish payti yoki oxirgi "qayta chaqirish" */
export interface CallEvent {
    appointment: Appointment;
    /** ms */
    at: number;
    number?: number;
}

const ms = (iso?: string) => {
    const v = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(v) ? v : 0;
};

/** Bugungi chaqiruvlar — eng oxirgisi birinchi */
export function callEvents(appointments: Appointment[], log: FlowLog, tickets: TicketLog): CallEvent[] {
    const byId = new Map(appointments.map(a => [a.id, a]));
    const out: CallEvent[] = [];
    for (const [id, entry] of Object.entries(log)) {
        const appointment = byId.get(id);
        if (!appointment || appointment.status === 'Cancelled') continue;
        const at = Math.max(ms(entry.in), ms(entry.call));
        if (at > 0) out.push({ appointment, at, number: tickets[id] });
    }
    return out.sort((a, b) => b.at - a.at);
}

const minutesOfIso = (iso: string): number => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
};

/** Kutish zalidagi bemor: raqami, qancha kutgani, taxminan qachon kiradi */
export interface WaitingRow {
    appointment: Appointment;
    number?: number;
    /** Kutish zalida necha daqiqa (qabul vaqtidan beri) */
    waitMin: number;
    /** Taxminan kiradigan payt — kun boshidan daqiqa */
    etaAt: number;
    /** Shu shifokor navbatida nechanchi (1 — keyingi) */
    place: number;
}

/**
 * Hamma shifokorlar navbati bitta ro'yxatda — raqam tartibida (raqami yo'qlari
 * oxirida, qabul vaqti bo'yicha). Taxminiy kirish: kabinet bo'shashi + oldindagilar.
 */
export function waitingRows(flow: ClinicFlow, log: FlowLog, tickets: TicketLog, nowMin: number): WaitingRow[] {
    const rows: WaitingRow[] = [];
    for (const lane of flow.lanes) {
        let t = nowMin;
        if (lane.chair && log[lane.chair.id]) {
            t = Math.max(minutesOfIso(log[lane.chair.id].in) + visitMinutes(lane.chair), nowMin + 2);
        }
        lane.queue.forEach((a, i) => {
            rows.push({
                appointment: a,
                number: tickets[a.id],
                waitMin: Math.max(0, nowMin - minutesOf(a.time)),
                etaAt: t,
                place: i + 1,
            });
            t += visitMinutes(a);
        });
    }
    const big = Number.MAX_SAFE_INTEGER;
    return rows.sort((a, b) => (a.number ?? big) - (b.number ?? big) || minutesOf(a.appointment.time) - minutesOf(b.appointment.time));
}

/** "13:05" */
export const hhmmOfMinutes = (m: number): string => {
    const v = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
