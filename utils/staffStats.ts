import { Appointment, Clinic, Doctor, Expense, LabOrder, Receptionist, LabTechnician, Review, Transaction } from '../types';
import { transactionBelongsToDoctor } from './financialCalculations';

// Xodimlar ro'yxati va xodim profili uchun umumiy hisoblar. Hammasi bazada
// allaqachon bor ma'lumotdan: qabullar, to'lovlar, xarajatlar, lab buyurtmalari.

/** Ish kunlari bazada saqlanmaydi, shuning uchun yuklama Du–Sha bo'yicha olinadi */
export const WORK_DAYS_PER_WEEK = 6;

const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayIso = () => isoDay(new Date());
export const toDay = (value?: string | null) => String(value || '').slice(0, 10);
export const toMonth = (value?: string | null) => String(value || '').slice(0, 7);
export const currentMonth = () => todayIso().slice(0, 7);

export const shiftMonth = (month: string, delta: number) => {
    const [y, m] = month.split('-').map(Number);
    return isoDay(new Date(y, m - 1 + delta, 1)).slice(0, 7);
};

const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const monthLabel = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS_UZ[m - 1]} ${y}`;
};
export const WEEKDAYS_UZ = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

/** Haftaning 7 kuni (Dushanbadan), offset — necha hafta oldin/keyin */
export const weekDays = (offsetWeeks = 0) => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offsetWeeks * 7);
    return Array.from({ length: 7 }, (_, i) => isoDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
};

export const fmt = (n: number) => Math.round(n || 0).toLocaleString();
export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();
export const initials = (p: { firstName: string; lastName: string }) => `${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase();

export const doctorHours = (doctor: Doctor, clinic?: Clinic) => {
    const custom = doctor.startHour != null && doctor.endHour != null;
    const start = custom ? Number(doctor.startHour) : (clinic?.startHour ?? 8);
    const end = custom ? Number(doctor.endHour) : (clinic?.endHour ?? 20);
    return { start, end, perDay: Math.max(0, end - start), custom };
};

const countsAsBooked = (a: Appointment) => a.status !== 'Cancelled' && a.status !== 'No-Show';

export const doctorWeekLoad = (doctor: Doctor, appointments: Appointment[], clinic?: Clinic, offsetWeeks = 0) => {
    const { perDay } = doctorHours(doctor, clinic);
    const days = weekDays(offsetWeeks).map(day => {
        const list = appointments.filter(a => a.doctorId === doctor.id && toDay(a.date) === day && countsAsBooked(a));
        return { day, count: list.length, minutes: list.reduce((s, a) => s + (a.duration || 30), 0) };
    });
    const bookedMinutes = days.reduce((s, d) => s + d.minutes, 0);
    const capacityMinutes = perDay * 60 * WORK_DAYS_PER_WEEK;
    const percent = capacityMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 100)) : 0;
    return { days, bookedMinutes, capacityMinutes, percent, perDayMinutes: perDay * 60 };
};

export const SALARY_TYPE_LABEL: Record<string, string> = {
    none: 'Kiritilmagan', fixed: 'Fix', fixed_kpi: 'Fix + KPI', kpi: 'KPI',
};

/** Shifokorning bir oylik maoshi: maosh turiga qarab fix va KPI, shu oyda to'langan xarajatlar */
export const doctorPayroll = (doctor: Doctor, transactions: Transaction[], expenses: Expense[], month: string) => {
    const type = doctor.salaryType || 'none';
    const revenueTx = transactions.filter(tx => tx.status === 'Paid' && toMonth(tx.date) === month && transactionBelongsToDoctor(tx, doctor));
    const revenue = revenueTx.reduce((s, tx) => s + tx.amount, 0);
    const fixed = type === 'fixed' || type === 'fixed_kpi' ? (doctor.fixedSalary || 0) : 0;
    const kpi = type === 'kpi' || type === 'fixed_kpi' ? Math.round((revenue * (doctor.percentage || 0)) / 100) : 0;
    const payments = expenses
        .filter(e => e.doctorId === doctor.id && (e.category === 'Salary' || e.category === 'DoctorShare') && toMonth(e.date) === month)
        .sort((a, b) => b.date.localeCompare(a.date));
    const paid = payments.reduce((s, e) => s + e.amount, 0);
    const accrued = fixed + kpi;
    return { type, revenue, revenueTx, fixed, kpi, accrued, paid, balance: accrued - paid, payments };
};

/** Resepshn: u qabul qilgan to'lovlar va shu oyda unga to'langan maosh */
export const receptionistMonth = (rec: Receptionist, transactions: Transaction[], expenses: Expense[], month: string) => {
    const received = transactions
        .filter(tx => tx.receivedById === rec.id && tx.status === 'Paid' && toMonth(tx.createdAt || tx.date) === month)
        .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    const payments = expenses
        .filter(e => e.receptionistId === rec.id && toMonth(e.date) === month)
        .sort((a, b) => b.date.localeCompare(a.date));
    return {
        received,
        receivedSum: received.reduce((s, tx) => s + tx.amount, 0),
        payments,
        paid: payments.reduce((s, e) => s + e.amount, 0),
    };
};

/** Texnik: buyurtmalari va topshirilgan buyurtmalar uchun yozilgan Laboratoriya xarajatlari */
export const technicianStats = (tech: LabTechnician, labOrders: LabOrder[], expenses: Expense[], month: string) => {
    const today = todayIso();
    const orders = labOrders.filter(o => o.technicianId === tech.id);
    const active = orders.filter(o => o.status === 'Pending' || o.status === 'In-Progress');
    const overdue = active.filter(o => o.deadline < today);
    const delivered = orders.filter(o => o.status === 'Delivered' && toMonth(o.deliveredAt || o.orderedAt) === month);
    const orderIds = new Set(orders.map(o => o.id));
    const payments = expenses
        .filter(e => !!e.labOrderId && orderIds.has(e.labOrderId) && toMonth(e.date) === month)
        .sort((a, b) => b.date.localeCompare(a.date));
    return {
        orders, active, overdue, delivered,
        deliveredSum: delivered.reduce((s, o) => s + (o.price || 0), 0),
        payments,
        paid: payments.reduce((s, e) => s + e.amount, 0),
    };
};

// ---- Davr bo'yicha hisoblar (Xodimlar → Statistika) ----

export const inRange = (day: string, start: string, end: string) => !!day && day >= start && day <= end;

const parseDay = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
};

/** Davrdagi ish kunlari soni: yakshanbadan tashqari hamma kun */
export const workDaysInRange = (start: string, end: string) => {
    if (!start || !end || start > end) return 0;
    let count = 0;
    const day = parseDay(start);
    const last = parseDay(end);
    for (let guard = 0; day <= last && guard < 4000; guard++) {
        if (day.getDay() !== 0) count++;
        day.setDate(day.getDate() + 1);
    }
    return count;
};

/** Davr nechta kalendar oyiga tegadi — fix maosh shu songa ko'paytiriladi */
export const monthsInRange = (start: string, end: string) => {
    if (!start || !end || start > end) return 0;
    const [y1, m1] = start.split('-').map(Number);
    const [y2, m2] = end.split('-').map(Number);
    return (y2 - y1) * 12 + (m2 - m1) + 1;
};

export type PeriodPreset = 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom';

export const presetRange = (preset: PeriodPreset) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const lastDay = (yy: number, mm: number) => isoDay(new Date(yy, mm + 1, 0));
    if (preset === 'lastMonth') return { start: isoDay(new Date(y, m - 1, 1)), end: lastDay(y, m - 1) };
    if (preset === 'quarter') return { start: isoDay(new Date(y, m - 2, 1)), end: lastDay(y, m) };
    if (preset === 'year') return { start: `${y}-01-01`, end: `${y}-12-31` };
    return { start: isoDay(new Date(y, m, 1)), end: lastDay(y, m) };
};

export const doctorPeriodStats = (
    doctor: Doctor, appointments: Appointment[], transactions: Transaction[], expenses: Expense[],
    reviews: Review[], clinic: Clinic | undefined, start: string, end: string,
) => {
    const today = todayIso();
    const appts = appointments.filter(a => a.doctorId === doctor.id && inRange(toDay(a.date), start, end));
    const done = appts.filter(a => a.status === 'Completed').length;
    // Bajarilish — faqat kuni o'tgan (yoki bugungi) qabullar ichida; kelajakdagilar hisobni buzmasin
    const pastCount = appts.filter(a => toDay(a.date) <= today && a.status !== 'Cancelled').length;
    const bookedMinutes = appts.filter(countsAsBooked).reduce((s, a) => s + (a.duration || 30), 0);
    const capacityMinutes = doctorHours(doctor, clinic).perDay * 60 * workDaysInRange(start, end);
    const revenueTx = transactions.filter(tx => tx.status === 'Paid' && inRange(toDay(tx.date), start, end) && transactionBelongsToDoctor(tx, doctor));
    const revenue = revenueTx.reduce((s, tx) => s + tx.amount, 0);
    const type = doctor.salaryType || 'none';
    const fixed = type === 'fixed' || type === 'fixed_kpi' ? (doctor.fixedSalary || 0) * monthsInRange(start, end) : 0;
    const kpi = type === 'kpi' || type === 'fixed_kpi' ? Math.round((revenue * (doctor.percentage || 0)) / 100) : 0;
    const paid = expenses
        .filter(e => e.doctorId === doctor.id && (e.category === 'Salary' || e.category === 'DoctorShare') && inRange(toDay(e.date), start, end))
        .reduce((s, e) => s + e.amount, 0);
    const apptIds = new Set(appointments.filter(a => a.doctorId === doctor.id).map(a => a.id));
    const ratings = reviews.filter(r => apptIds.has(r.appointmentId) && inRange(toDay(r.createdAt), start, end)).map(r => r.rating);
    return {
        total: appts.length, done, pastCount,
        completion: pastCount ? Math.round((done / pastCount) * 100) : 0,
        patients: new Set(appts.map(a => a.patientId)).size,
        revenue, revenueCount: revenueTx.length,
        avgCheck: done ? Math.round(revenue / done) : 0,
        bookedMinutes, capacityMinutes,
        load: capacityMinutes ? Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 100)) : 0,
        type, fixed, kpi, accrued: fixed + kpi, paid, balance: fixed + kpi - paid,
        rating: ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0,
        ratingCount: ratings.length,
    };
};

export const receptionistPeriodStats = (rec: Receptionist, transactions: Transaction[], expenses: Expense[], start: string, end: string) => {
    const received = transactions.filter(tx => tx.receivedById === rec.id && tx.status === 'Paid' && inRange(toDay(tx.createdAt || tx.date), start, end));
    const paid = expenses.filter(e => e.receptionistId === rec.id && inRange(toDay(e.date), start, end)).reduce((s, e) => s + e.amount, 0);
    return { count: received.length, sum: received.reduce((s, tx) => s + tx.amount, 0), paid };
};

export const technicianPeriodStats = (tech: LabTechnician, labOrders: LabOrder[], expenses: Expense[], start: string, end: string) => {
    const today = todayIso();
    const orders = labOrders.filter(o => o.technicianId === tech.id);
    const active = orders.filter(o => o.status === 'Pending' || o.status === 'In-Progress');
    const delivered = orders.filter(o => o.status === 'Delivered' && inRange(toDay(o.deliveredAt || o.orderedAt), start, end));
    const ids = new Set(orders.map(o => o.id));
    const paid = expenses.filter(e => !!e.labOrderId && ids.has(e.labOrderId) && inRange(toDay(e.date), start, end)).reduce((s, e) => s + e.amount, 0);
    return {
        active: active.length,
        overdue: active.filter(o => o.deadline < today).length,
        delivered: delivered.length,
        deliveredSum: delivered.reduce((s, o) => s + (o.price || 0), 0),
        paid,
    };
};

/** Maosh holati yorlig'i: hisoblangan va to'langan summaga qarab */
export const payState = (accrued: number, paid: number): { label: string; tone: 'green' | 'amber' | 'red' | 'gray' } => {
    if (accrued <= 0 && paid <= 0) return { label: '—', tone: 'gray' };
    if (paid >= accrued) return { label: "To'langan", tone: 'green' };
    if (paid > 0) return { label: 'Qisman', tone: 'amber' };
    return { label: "To'lanmagan", tone: 'red' };
};
