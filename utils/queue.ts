import { Appointment } from '../types';

/**
 * Bosh sahifadagi navbat — alohida jadval emas, bugungi qabullarning o'zi.
 *
 * Navbatda: bugungi, vaqti kelgan (hozirdan oldin yoki hozir) va hali yakunlanmagan
 * qabul. Resepshn "Hozir keldi" orqali bemorni hozirgi vaqtga yozadi — u shu zahoti
 * shifokor navbatiga tushadi. Shifokor bemor kartasida qabulni yakunlaganda
 * ("Completed") navbatdan chiqadi. Shu sababli bazaga yangi ustun yoki holat kerak emas.
 *
 * "Onlayn navbat" moduli bundan alohida ishlaydi.
 */

const OPEN_STATUSES = new Set(['Pending', 'Confirmed', 'Checked-In']);

export const isOpenAppointment = (a: Pick<Appointment, 'status'>): boolean => OPEN_STATUSES.has(a.status);

const pad = (n: number) => String(n).padStart(2, '0');

/** Hozirgi vaqt "HH:MM" ko'rinishida (mahalliy soat) */
export const nowHHMM = (d: Date = new Date()): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "HH:MM" → kun boshidan beri daqiqa. Noto'g'ri qiymat — kun oxiri (navbatga tushmaydi) */
export const minutesOf = (hhmm?: string): number => {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
};

const byTime = (a: Appointment, b: Appointment) => minutesOf(a.time) - minutesOf(b.time);

/** Shifokorning hozirgi navbati — vaqti kelgan, yakunlanmagan bugungi qabullar */
export function doctorQueue(appointments: Appointment[], doctorId: string, today: string, nowMin: number): Appointment[] {
    return appointments
        .filter(a => a.date === today && a.doctorId === doctorId && isOpenAppointment(a) && minutesOf(a.time) <= nowMin)
        .sort(byTime);
}

/** Bugun keyinroqqa yozilganlar — hali vaqti kelmagan */
export function doctorLater(appointments: Appointment[], doctorId: string, today: string, nowMin: number): Appointment[] {
    return appointments
        .filter(a => a.date === today && a.doctorId === doctorId && isOpenAppointment(a) && minutesOf(a.time) > nowMin)
        .sort(byTime);
}

/** Qancha vaqtdan beri kutmoqda (daqiqa) */
export const waitMinutes = (a: Pick<Appointment, 'time'>, nowMin: number): number => Math.max(0, nowMin - minutesOf(a.time));

/** Kutish vaqti rangi: 15 daqiqagacha oddiy, 15–30 sariq, 30 dan ortiq qizil */
export const waitTone = (mins: number): 'normal' | 'warn' | 'late' => (mins >= 30 ? 'late' : mins >= 15 ? 'warn' : 'normal');

/**
 * Bemorni hozir qabulga yozishda nima qilinadi.
 * Bir bemorga bir kunda bitta qabul (bazada shunday cheklov bor), shuning uchun
 * bugun yozilgan bo'lsa yangi qabul ochilmaydi — mavjudi hozirga ko'chadi.
 */
export type ArrivalPlan =
    | { kind: 'create' }
    | { kind: 'move'; appointment: Appointment }
    | { kind: 'already-waiting'; appointment: Appointment }
    | { kind: 'already-done'; appointment: Appointment };

export function planArrival(appointments: Appointment[], patientId: string, today: string, nowMin: number): ArrivalPlan {
    const existing = appointments.find(a => a.patientId === patientId && a.date === today && a.status !== 'Cancelled');
    if (!existing) return { kind: 'create' };
    if (existing.status === 'Completed') return { kind: 'already-done', appointment: existing };
    if (isOpenAppointment(existing) && minutesOf(existing.time) <= nowMin) return { kind: 'already-waiting', appointment: existing };
    // Keyinroqqa yozilgan va erta keldi, yoki "Kelmadi" deb belgilangan edi — hozirga ko'chadi
    return { kind: 'move', appointment: existing };
}

/** Bemorning kasallik tarixidan birinchi ogohlantirish (allergiya va h.k.) — "Sog'lom" hisobga olinmaydi */
export function healthAlert(medicalHistory?: string): string | null {
    const line = String(medicalHistory || '')
        .split('\n')
        .map(l => l.trim())
        .find(l => l && !/^SOG'LOM/i.test(l) && !/^yo'q$/i.test(l));
    return line || null;
}

/**
 * Bir kunlik yangi ro'yxatni umumiy ro'yxatga qo'shish (qabullar yoki kassa yozuvlari):
 * o'sha kundagilar serverdagisi bilan almashadi, boshqa kunlar tegilmaydi. O'zgarish
 * bo'lmasa — o'sha massivning o'zi qaytadi (keraksiz qayta chizish bo'lmasin).
 */
export function mergeDay<T extends { id: string; date: string }>(prev: T[], fresh: T[], day: string): T[] {
    const incoming = fresh.filter(a => a.date === day);
    const current = prev.filter(a => a.date === day);
    const sig = (list: T[]) => JSON.stringify([...list].sort((a, b) => String(a.id).localeCompare(String(b.id))));
    if (sig(current) === sig(incoming)) return prev;
    return [...prev.filter(a => a.date !== day), ...incoming];
}

/** Keyingi yarim soatlik vaqt ("10:12" → "10:30"). Kun tugagan bo'lsa — ertalabki boshlanish */
export function nextSlotHHMM(d: Date = new Date(), startHour = 9): string {
    const mins = Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 30) * 30;
    if (mins >= 24 * 60) return `${pad(startHour)}:00`;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}
