/**
 * Shifokorga Telegram xabarlari: unga yangi qabul yozilganda (yoki boshqa
 * shifokordan o'tkazilganda) va unga yangi bemor biriktirilganda.
 *
 * Qoidalar:
 * - Shifokor klinika botiga ulanmagan bo'lsa (telegramChatId yo'q) — jim o'tadi.
 * - Amalni shifokorning o'zi bajargan bo'lsa — xabar ketmaydi (o'zi biladi).
 * - O'tib ketgan kunga yoki yakunlangan/bekor qilingan qabul uchun — ketmaydi:
 *   tugagan tashrifni yozish "yangi qabul" emas.
 * - Hech qachon xato otmaydi: xabar ketmagani uchun qabul yoki bemor saqlanmay
 *   qolishi mumkin emas.
 *
 * Bot orqali bemorning o'zi yozilganda xabar botManager ichida alohida ketadi.
 */

import { prisma } from './db';
import { tashkentDateStr } from './triggers';

// botManager -> server -> ... aylanma importdan qochish uchun kechiktirib olinadi
const bot = () => require('./botManager').botManager;

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ddmmyyyy = (d: string) => String(d || '').split('-').reverse().join('.');

const INACTIVE = new Set(['Completed', 'Checked-In', 'Cancelled', 'No-Show']);

async function send(doctorId: string | null | undefined, actorDoctorId: string | null | undefined, text: string, refId: string) {
    try {
        if (!doctorId || doctorId === actorDoctorId) return;
        const doctor = await prisma.doctor.findUnique({
            where: { id: doctorId },
            select: { telegramChatId: true, clinicId: true },
        });
        if (!doctor?.telegramChatId) return;
        await bot().notifyClinicUser(
            doctor.clinicId, doctor.telegramChatId, text, undefined, 'DoctorAlert',
            undefined, { source: 'doctor_alert', refId }, { parseMode: 'HTML' }
        );
    } catch (e: any) {
        console.error('[doctorAlerts] yuborilmadi:', e?.message || e);
    }
}

async function patientPhone(patientId: string | null | undefined): Promise<string> {
    if (!patientId) return '';
    const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { phone: true } }).catch(() => null);
    return p?.phone || '';
}

type Appt = {
    id: string; patientId?: string | null; patientName?: string | null; doctorId?: string | null;
    date: string; time?: string | null; type?: string | null; status?: string | null;
};

/** Qabul xabari: yangi yozilgan (`moved: false`) yoki boshqa shifokordan o'tkazilgan (`moved: true`). */
async function appointmentAlert(appt: Appt, actorDoctorId: string | null | undefined, moved: boolean) {
    try {
        if (!appt?.doctorId || INACTIVE.has(String(appt.status || ''))) return;
        if (appt.date < tashkentDateStr(0)) return;
        const phone = await patientPhone(appt.patientId);
        const lines = [
            moved ? '🔁 <b>Sizga qabul o\'tkazildi</b>' : '🔔 <b>Sizga yangi qabul yozildi</b>',
            '',
            `👤 Bemor: <b>${esc(appt.patientName)}</b>`,
            ...(phone ? [`📱 Telefon: ${esc(phone)}`] : []),
            `📅 Sana: ${ddmmyyyy(appt.date)}${appt.time ? `, ⏰ ${esc(appt.time)}` : ''}`,
            ...(appt.type ? [`🦷 ${esc(appt.type)}`] : []),
        ];
        await send(appt.doctorId, actorDoctorId, lines.join('\n'), `appt:${appt.id}:${appt.doctorId}`);
    } catch (e: any) {
        console.error('[doctorAlerts] qabul xabari:', e?.message || e);
    }
}

export const newAppointment = (appt: Appt, actorDoctorId?: string | null) => appointmentAlert(appt, actorDoctorId, false);
export const appointmentReassigned = (appt: Appt, actorDoctorId?: string | null) => appointmentAlert(appt, actorDoctorId, true);

/** Shifokorga bemor biriktirildi (yangi bemor yoki boshqa shifokordan o'tkazildi). */
export async function patientAssigned(
    patient: { id: string; firstName?: string | null; lastName?: string | null; phone?: string | null; doctorId?: string | null },
    actorDoctorId?: string | null
) {
    try {
        if (!patient?.doctorId) return;
        const name = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
        const lines = [
            '🆕 <b>Sizga yangi bemor biriktirildi</b>',
            '',
            `👤 Bemor: <b>${esc(name)}</b>`,
            ...(patient.phone ? [`📱 Telefon: ${esc(patient.phone)}`] : []),
        ];
        await send(patient.doctorId, actorDoctorId, lines.join('\n'), `patient:${patient.id}:${patient.doctorId}`);
    } catch (e: any) {
        console.error('[doctorAlerts] bemor xabari:', e?.message || e);
    }
}
