import { Appointment, Transaction, Service } from '../types';
import { calculateAppointmentTotal } from './financialCalculations';

/**
 * Olinmagan pul — yagona manba.
 *
 * Tarixan dashboardda ikkita alohida ro'yxat bor edi: "qarzga yozilgan" (Pending
 * tranzaksiya) va "kassaga umuman yozilmagan" (tugagan qabul). Foydalanuvchi uchun
 * bu bitta narsa — pul olinmagan. Bundan tashqari to'liq qarzga yozilgan qabul
 * ikkala ro'yxatga ham tushib, bir pul ikki marta ko'rinardi.
 *
 * Shu yerda ikkala manba bitta ro'yxatga yig'iladi va dublikat yo'qotiladi:
 * qabul uchun kassada YOZUV BOR bo'lsa (statusi qanday bo'lishidan qat'i nazar),
 * o'sha yozuv qatori ko'rsatiladi, qabulning o'zi emas.
 */

/** Tranzaksiya shu qabulga tegishlimi — sana + bemor (id ustuvor, aks holda ism) */
function txMatchesAppointment(
    tx: Transaction,
    app: { date: string; patientId?: string; patientName: string }
): boolean {
    if (!tx || tx.date !== app.date) return false;
    if (app.patientId && tx.patientId) return tx.patientId === app.patientId;
    return tx.patientName === app.patientName;
}

/**
 * Qabul kassada qayd etilganmi — statusi muhim emas.
 * `isAppointmentPaid` dan farqi shu: u faqat 'Paid' ni sanaydi, shuning uchun
 * to'liq qarzga yozilgan qabulni "yozilmagan" deb hisoblab yuborardi.
 */
export function isAppointmentRecorded(
    appointment: { date: string; patientId?: string; patientName: string },
    transactions: Transaction[]
): boolean {
    return transactions.some(tx => txMatchesAppointment(tx, appointment));
}

/** Ro'yxatdagi bitta qator — manbasidan qat'i nazar bir xil shaklda */
export interface UnpaidRow {
    key: string;
    /** 'debt' — kassada Pending yozuv bor; 'appointment' — kassada yozuv yo'q */
    source: 'debt' | 'appointment';
    /**
     * Pul ataylab qarzga yozilganmi. Kassada Pending yozuv bo'lishining o'zi
     * qarz degani emas: to'lov oddiygina hali kelmagan bo'lishi ham mumkin.
     * Shuning uchun bu yerda faqat qarz ekani ANIQ holatlar true bo'ladi.
     */
    isDebt: boolean;
    patientId?: string;
    patientName: string;
    date: string;
    service: string;
    /** Qabulda protseduralar yozilmagan bo'lsa 0 bo'lishi mumkin */
    amount: number;
    doctorId?: string;
    /** Shifokor bu qabulni kassaga uzatganmi (faqat source='appointment') */
    sentToCashier: boolean;
    transaction?: Transaction;
    appointment?: Appointment;
}

/**
 * Tranzaksiya qarzmi. `isDebt` — to'lov oynasida "Qolgan qarzdorlik" to'ldirilganda
 * yoziladigan aniq belgi. Bu ustun paydo bo'lishidan oldingi yozuvlarda esa qarzni
 * faqat xizmat nomidagi "(Qarz)" bildiradi; qolganlari uchun qarz ekani aniq emas.
 */
export function isDebtTransaction(tx: Transaction): boolean {
    return tx.isDebt === true || /\(Qarz\)/i.test(tx.service || '');
}

/** Xizmat nomini qabul yozuvlaridan/tranzaksiyadan o'qiydi */
function debtServiceLabel(tx: Transaction): string {
    return tx.service?.includes('|')
        ? tx.service.split('||')[0].split('|')[0]
        : (tx.service || '—');
}

export interface BuildUnpaidOptions {
    /** Qarz qatorlari (Pending/Overdue tranzaksiyalar) qo'shilsinmi */
    includeDebts?: boolean;
    /** Faqat shu sanadagi qatorlar (kassa sahifasi uchun) */
    date?: string;
}

/**
 * Tugagan qabullar + yopilmagan qarzlardan bitta ro'yxat yasaydi.
 * Sana bo'yicha eskisidan yangisiga saralanadi.
 */
export function buildUnpaidRows(
    appointments: Appointment[],
    transactions: Transaction[],
    services: Service[],
    options: BuildUnpaidOptions = {}
): UnpaidRow[] {
    const { includeDebts = true, date } = options;
    const rows: UnpaidRow[] = [];

    if (includeDebts) {
        for (const tx of transactions) {
            if (tx.status !== 'Pending' && tx.status !== 'Overdue') continue;
            if (date && tx.date !== date) continue;
            rows.push({
                key: `tx:${tx.id}`,
                source: 'debt',
                isDebt: isDebtTransaction(tx),
                patientId: tx.patientId,
                patientName: tx.patientName,
                date: String(tx.date).slice(0, 10),
                service: debtServiceLabel(tx),
                amount: tx.amount || 0,
                doctorId: tx.doctorId,
                sentToCashier: true, // kassada allaqachon yozuv bor
                transaction: tx,
            });
        }
    }

    for (const app of appointments) {
        if (app.status !== 'Completed' && app.status !== 'Checked-In') continue;
        if (date && app.date !== date) continue;
        // Kassada yozuv bor — qarz qatori uni allaqachon ifodalaydi
        if (isAppointmentRecorded(app, transactions)) continue;
        const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
        rows.push({
            key: `app:${app.id}`,
            source: 'appointment',
            // Kassada yozuv ham yo'q — qarz deyishga asos yo'q
            isDebt: false,
            patientId: app.patientId,
            patientName: app.patientName,
            date: app.date,
            service: breakdown ? breakdown.split('||')[0].split('|')[0] : app.type,
            amount: total,
            doctorId: app.doctorId,
            sentToCashier: !!app.sentToCashierAt,
            appointment: app,
        });
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Summasi noma'lum qatorlar (protsedura yozilmagan) hisobga kirmaydi */
export function unpaidTotal(rows: UnpaidRow[]): number {
    return rows.reduce((acc, r) => acc + (r.amount > 0 ? r.amount : 0), 0);
}
