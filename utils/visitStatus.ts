import { Appointment, FlowLog, Transaction } from '../types';
import { hasArrived, isOpenAppointment } from './queue';
import { appointmentPaymentState } from './unpaid';

/**
 * Tashrif holati — bitta manba.
 *
 * Bosh sahifadagi jadval, shifokor kartasi, kalendar va bemor kartasi shu funksiyadan
 * o'qiydi, shuning uchun bir tashrif hech qayerda boshqacha ko'rinmaydi. Bazada
 * alohida ustun yo'q: holat qabul statusidan, "kabinetda" belgisidan (xarita bilan
 * bir xil manba) va kassadan hisoblanadi.
 *
 *   Yozilgan → Navbatda → Kabinetda → To'lov kutilmoqda → To'landi
 *   (yon holatlar: Qarz, Kelmadi, Bekor qilindi)
 */
export type VisitStatus =
    | 'booked'
    | 'waiting'
    | 'inChair'
    | 'awaitingPayment'
    | 'paid'
    | 'debt'
    | 'noShow'
    | 'cancelled';

export interface VisitStatusContext {
    /** Bugungi sana (mahalliy), YYYY-MM-DD */
    today: string;
    /** Hozir — kun boshidan beri daqiqa */
    nowMin: number;
    /** Bugun kabinetga kirganlar — bosh sahifa xaritasi bilan bir xil manba */
    flowLog?: FlowLog;
    /** Kassa yozuvlari — "Kutilayotgan to'lovlar" bilan bir xil */
    transactions: Transaction[];
}

export function visitStatus(a: Appointment, ctx: VisitStatusContext): VisitStatus {
    if (a.status === 'Cancelled') return 'cancelled';
    if (a.status === 'No-Show') return 'noShow';
    if (isOpenAppointment(a)) {
        if (a.date === ctx.today) {
            if (ctx.flowLog?.[a.id]) return 'inChair';
            return hasArrived(a, ctx.nowMin) ? 'waiting' : 'booked';
        }
        // Kelgusi kun, yoki o'tgan kunda belgilanmay qolgan yozuv. O'tgan kungi
        // "Keldi" (Checked-In) — bemor kelgan: "Kutilayotgan to'lovlar" kabi pulini qaraymiz.
        if (a.date > ctx.today || a.status !== 'Checked-In') return 'booked';
    }
    const pay = appointmentPaymentState(a, ctx.transactions);
    return pay === 'paid' ? 'paid' : pay === 'debt' ? 'debt' : 'awaitingPayment';
}

/** "Yozilgan" qabul tasdiqlanganmi (qo'ng'iroqda "Keladi" dedi yoki tasdiqlangan holda yozilgan) */
export const isConfirmedBooking = (a: Pick<Appointment, 'status'>): boolean =>
    a.status === 'Confirmed' || a.status === 'Checked-In';

/** Holat rangi (kalendardagi blok va boshqa inline uslublar uchun) */
export const VISIT_STATUS_COLOR: Record<VisitStatus, string> = {
    booked: '#64748B',
    waiting: '#D97706',
    inChair: '#2563EB',
    awaitingPayment: '#7C3AED',
    paid: '#059669',
    debt: '#DC2626',
    noShow: '#9CA3AF',
    cancelled: '#EF4444',
};
