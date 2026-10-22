import { Appointment, Transaction, Service } from '../types';
import { calculateAppointmentTotal, isAdvanceDeposit } from './financialCalculations';
import { isOpenCharge } from '../backend/shared/debtRules';
import { findUnbilledWork, UnbilledWork } from './workBilling';

/** To'lov kutayotgan qabul: qabulning o'zi va (ishlarning bir qismi to'langan bo'lsa) qolgan ishlar */
export type UnbilledVisit = UnbilledWork<Appointment>;

/**
 * To'lov kutayotgan qabullar — qabul ISHLARI bo'yicha (utils/workBilling.ts, dentalocal bilan bir xil).
 *
 * Ilgari qabul kunidagi istalgan yozuv (bitta ishning to'lovi ham) qabulni to'liq yopardi:
 * to'lovdan keyin qo'shilgan ish ("Qo'shimcha") va qisman to'langan qabulning qolgan ishlari
 * hech qayerda ko'rinmasdi — pul olinmay qolardi. Endi qabul faqat ishlari to'lov yoki qarz
 * yozuvi bilan yopilganda yopiladi; bir qismi yopilsa — qolgani (remaining) kutiladi.
 * Bemor bo'yicha hisoblanadi (id, eski yozuvlarda ism): bitta to'lov ikki qabulni yopmaydi.
 * Natija: qabul id → kutilayotgan ish.
 */
export function findUnbilledVisits(
    appointments: Appointment[],
    transactions: Transaction[],
    services: Service[]
): Map<string, UnbilledVisit> {
    const txById = new Map<string, Transaction[]>();
    const txByName = new Map<string, Transaction[]>();
    for (const tx of transactions || []) {
        if (!tx) continue;
        const map = tx.patientId ? txById : txByName;
        const key = tx.patientId || tx.patientName || '';
        const list = map.get(key);
        if (list) list.push(tx); else map.set(key, [tx]);
    }
    const groups = new Map<string, Appointment[]>();
    for (const a of appointments || []) {
        if (!a) continue;
        const key = a.patientId ? `id:${a.patientId}` : `name:${a.patientName}`;
        const list = groups.get(key);
        if (list) list.push(a); else groups.set(key, [a]);
    }
    const breakdownOf = (a: Appointment) => calculateAppointmentTotal(a.notes || '', services).breakdown || a.type;
    const result = new Map<string, UnbilledVisit>();
    groups.forEach(appts => {
        const first = appts[0];
        const txs = [
            ...(first.patientId ? txById.get(first.patientId) || [] : []),
            ...(txByName.get(first.patientName) || []),
        ];
        for (const work of findUnbilledWork(appts, txs, breakdownOf)) result.set(work.appointment.id, work);
    });
    return result;
}

/** Qabulning hali olinmagan summasi va ishlar ro'yxati (to'lov oynasiga shu tushadi) */
export function unbilledDue(work: UnbilledVisit, services: Service[]): { total: number; breakdown: string } {
    return work.remaining || calculateAppointmentTotal(work.appointment.notes || '', services);
}

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

/**
 * To'lov qaysi kun tashrifi uchun. `date` — pul olingan kun: qarz boshqa kuni to'lansa u
 * ko'chadi. Ilgari bog'lash faqat `date` bo'yicha edi — to'langan qarzning tashrifi yana
 * "to'lov kutilmoqda" bo'lib chiqardi, eski qarzni bugun to'lash esa bugungi yangi
 * tashrifni "to'langan" qilib yuborardi.
 */
export const visitDayOf = (tx: Pick<Transaction, 'date' | 'forDate'>): string =>
    tx.forDate || String(tx.date || '').slice(0, 10);

/** Tranzaksiya shu qabulga tegishlimi — tashrif kuni + bemor (id ustuvor, aks holda ism) */
function txMatchesAppointment(
    tx: Transaction,
    app: { date: string; patientId?: string; patientName: string }
): boolean {
    if (!tx || visitDayOf(tx) !== app.date) return false;
    // Avans depoziti — tashrif to'lovi emas (shu kuni avans qo'yilgani qabulni "to'langan" qilmaydi)
    if (isAdvanceDeposit(tx)) return false;
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

/** Tashrifning puli: to'langan, hali to'lanmagan yoki qarzga yozilgan */
export type PaymentState = 'paid' | 'awaiting' | 'debt';

/**
 * Tashrif to'landimi: ishlari hali to'lov bilan yopilmagan — to'lov kutilmoqda; ochiq
 * (Pending/Overdue) yozuv bor — qarz; hammasi yopilgan — to'langan. Qarz qoidasi:
 * backend/shared/debtRules.ts. `unbilled` (findUnbilledVisits) berilsa — "Olinmagan pul"
 * ro'yxati bilan aynan bir xil qoida; berilmasa — kassada yozuvi bor-yo'qligi bo'yicha.
 */
export function appointmentPaymentState(
    appointment: { id?: string; date: string; patientId?: string; patientName: string },
    transactions: Transaction[],
    unbilled?: ReadonlyMap<string, unknown>
): PaymentState {
    const recorded = transactions.filter(tx => txMatchesAppointment(tx, appointment));
    if (unbilled && appointment.id && unbilled.has(appointment.id)) return 'awaiting';
    if (!unbilled && recorded.length === 0) return 'awaiting';
    return recorded.some(isOpenCharge) ? 'debt' : 'paid';
}

/** Ro'yxatdagi bitta qator — manbasidan qat'i nazar bir xil shaklda */
export interface UnpaidRow {
    key: string;
    /** 'debt' — kassada Pending yozuv bor; 'appointment' — kassada yozuv yo'q */
    source: 'debt' | 'appointment';
    /**
     * Qarzmi: kassada ochiq yozuv bor (source='debt') — qarz; kassada hali hech qanday
     * yozuv yo'q tugagan qabul — "Olinmagan pul", qarz emas (backend/shared/debtRules.ts).
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
    /** Qabul ishlarining bir qismi to'langan bo'lsa — qolgan ishlar ("Nom|narx||...||TOTAL|jami") */
    remainingBreakdown?: string;
}

/**
 * Tranzaksiya qarzmi — ochiq (Pending/Overdue) yozuv, "qarz" belgisi bor-yo'qligidan qat'i nazar.
 * Ilgari faqat `isDebt` belgisi yoki "(Qarz)" qo'shimchasi bo'lsa qarz sanalardi: belgisiz eski
 * yozuvlar Bosh sahifada "Olinmagan pul" da, Moliya va botda esa qarzda chiqardi (2026-10-22).
 * `isDebt` endi faqat "qarz yozildi" bildirishnomasi uchun.
 */
export function isDebtTransaction(tx: Transaction): boolean {
    return isOpenCharge(tx);
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
    /**
     * Bugungi sana. Berilsa, bugun "Keldi" (Checked-In) qilingan qabul hali davom
     * etyapti deb olinadi — pul u yakunlangandan keyin kutiladi. O'tgan kungi
     * Checked-In esa avvalgidek "kelgan, to'lanmagan" hisoblanadi.
     */
    today?: string;
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
    const { includeDebts = true, date, today } = options;
    const rows: UnpaidRow[] = [];

    if (includeDebts) {
        for (const tx of transactions) {
            if (!isOpenCharge(tx)) continue;
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

    // Ishlari to'lov yoki qarz yozuvi bilan yopilmagan qabullar (findUnbilledVisits izohiga qarang)
    const unbilled = findUnbilledVisits(appointments, transactions, services);
    for (const app of appointments) {
        if (app.status !== 'Completed' && app.status !== 'Checked-In') continue;
        if (app.status === 'Checked-In' && today && app.date >= today) continue;
        if (date && app.date !== date) continue;
        const work = unbilled.get(app.id);
        if (!work) continue;
        const { total, breakdown } = unbilledDue(work, services);
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
            // Ishlarning bir qismi to'langan — to'lov oynasiga faqat qolgani tushadi
            remainingBreakdown: work.remaining?.breakdown,
        });
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Summasi noma'lum qatorlar (protsedura yozilmagan) hisobga kirmaydi */
export function unpaidTotal(rows: UnpaidRow[]): number {
    return rows.reduce((acc, r) => acc + (r.amount > 0 ? r.amount : 0), 0);
}

/**
 * "Bepul deb yopish" — tugagan qabul uchun pul olinmaydi (bepul muolaja, kafolat,
 * adashib ochilgan qabul). Kassaga 0 so'mlik yozuv tushadi, chegirma esa to'liq
 * narx: qabul "Olinmagan pul"dan chiqadi, kechilgan summa chegirma sifatida
 * hisobotda ko'rinadi, Kassada esa yozuvning o'zi iz bo'lib qoladi.
 * Adashib yopilsa, shu yozuvni o'chirish kifoya — qabul ro'yxatga qaytadi.
 */
export function buildWaivedTransaction(
    app: Pick<Appointment, 'patientId' | 'patientName' | 'date' | 'doctorId' | 'doctorName' | 'clinicId' | 'type' | 'notes'>,
    services: Service[],
    reason: string,
    /** Qabul ishlarining bir qismi to'langan bo'lsa — faqat qolgani kechiriladi (unbilledDue) */
    due?: { total: number; breakdown: string }
): Omit<Transaction, 'id'> {
    const { total, breakdown } = due || calculateAppointmentTotal(app.notes || '', services);
    const name = breakdown ? breakdown.split('||')[0].split('|')[0] : (app.type || '—');
    const note = reason.trim();
    const suffix = ` (Bepul${note ? `: ${note}` : ''})`;
    return {
        patientId: app.patientId,
        patientName: app.patientName,
        date: app.date,
        clinicId: app.clinicId,
        doctorId: app.doctorId,
        doctorName: app.doctorName,
        amount: 0,
        type: 'Cash',
        // Ishlar ro'yxati bilan yoziladi — shunda yozuv aynan shu ishlarni yopadi (utils/workBilling.ts);
        // ro'yxat bo'lmasa (eski qabul) — avvalgidek birinchi ish nomi
        service: breakdown && breakdown.includes('|') ? `${breakdown}${suffix}` : `${name}${suffix}`,
        status: 'Paid',
        discountPercent: total > 0 ? 100 : 0,
        discountAmount: total,
    };
}
