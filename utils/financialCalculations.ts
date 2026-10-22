import { Transaction, Expense, Doctor, Service } from '../types';
import { buildTechnicianCostIndex, technicianCostOf, ServiceLike } from './workBilling';
export type { ServiceLike } from './workBilling';

// Yangi moliya modeli (kassa usuli + shifokor ulushi hisobi):
// - Kirim (hisoblangan daromad) = status 'Paid' bo'lgan to'lovlar, AVANS DEPOZITISIZ.
//   Avans — bemor oldindan qo'ygan pul: xizmat hali ko'rsatilmagan, hech bir shifokor
//   uni ishlab topmagan. U keyin 'Balance' usuli bilan sarflanganda daromad bo'ladi.
//   Ilgari depozit ham, uning sarfi ham daromadga qo'shilardi (bitta pul ikki marta),
//   depozit esa ro'yxatdagi birinchi shifokorga yozilib, unga ulush hisoblanardi.
//   Kassaga tushgan pul = daromad − avansdan yechilgan + avans depozitlari (Kassa tabi).
// - Shifokor ulushi AVTOMATIK hisoblanadi: (to'lov − shu ishning texnik xarajati) × foiz.
//   Texnik xarajati — Sozlamalar → Xizmatlar → "Texniklar xarajati" (utils/workBilling.ts, dentalocal
//   bilan bir xil). Sozlamalarda "sof foydadan foiz" deb yozilgan, hisob esa ilgari to'liq summadan edi.
// - Kassadan shifokorga pul berilganda 'DoctorShare' kategoriyali Expense yoziladi —
//   bu hisoblangan ulushni "to'laydi", lekin sof foydadan QAYTA ayirilmaydi (double-count yo'q).
// - Sof foyda = Kirim − hisoblangan ulush − boshqa xarajatlar (DoctorShare dan tashqari).

export interface DoctorShareSummary {
    doctorId: string;
    doctorName: string;
    percentage: number;
    grossRevenue: number; // shifokorga tegishli kirim (Paid)
    technicianCost: number; // shu ishlarning texnik xarajati (ulush undan keyin hisoblanadi)
    accrued: number;      // hisoblangan ulush
    paid: number;         // to'langan (DoctorShare xarajatlari)
    balance: number;      // qoldiq (accrued - paid)
}

export interface TotalFinancials {
    totalRevenue: number;       // hisoblangan daromad (Paid to'lovlar, avans depozitisiz)
    advanceDeposits: number;    // shu davrda qo'yilgan avanslar (daromad emas, kassaga tushgan)
    balanceDrawdown: number;    // avansdan yechib to'langan (daromad, lekin kassaga yangi pul emas)
    doctorShareAccrued: number; // hisoblangan shifokor ulushlari jami
    doctorSharePaid: number;    // to'langan shifokor ulushlari jami
    totalExpenses: number;      // barcha xarajatlar (kassadan chiqqan pul, DoctorShare bilan)
    otherExpenses: number;      // sof foydada ayiriladigan xarajatlar (DoctorShare dan tashqari)
    labCosts: number;           // shundan: Laboratoriya kategoriyasi
    inventoryCosts: number;     // shundan: Ombor kategoriyasi
    netProfit: number;          // sof foyda
}

/** Avans depoziti — bemor oldindan qo'ygan pul (xizmat nomi 'Avans'). Kassa ham shu qoidani ishlatadi. */
export const isAdvanceDeposit = (tx: Pick<Transaction, 'service'>): boolean =>
    (tx.service || '').trim().toLowerCase() === 'avans';

/** Hisoblangan daromadga kiradimi: to'langan va avans depoziti emas */
export const isEarnedRevenue = (tx: Pick<Transaction, 'status' | 'service'>): boolean =>
    tx.status === 'Paid' && !isAdvanceDeposit(tx);

/**
 * Shifokorga tushumdan foiz hisoblanadimi va qancha. Maosh turi 'Fix' bo'lsa — yo'q
 * (forma foiz maydonini yashiradi, lekin eski qiymat bazada qoladi). Maosh turi
 * kiritilmagan eski shifokorlarda foiz bo'lsa — avvalgidek foiz hisoblanadi.
 * Moliya va Xodimlar sahifalari shu bitta qoidadan foydalanadi.
 */
export const doctorSharePercent = (doctor: Pick<Doctor, 'salaryType' | 'percentage'>): number => {
    const type = doctor.salaryType || 'none';
    if (type === 'fixed') return 0;
    return doctor.percentage || 0;
};

// Shifokor ismini qat'iy solishtirish uchun normalizatsiya:
// "Dr. Alisher Atajanov" === "Atajanov Alisher" (prefiks/tartib/punktuatsiyadan qat'i nazar),
// lekin qism-satr (includes) moslashtirish YO'Q — turli shifokorlar aralashmaydi.
export function normalizeDoctorName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\bdr[._]?\s*/g, '')
        .replace(/[.,_]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
}

// Tranzaksiya shu shifokorga tegishlimi — qat'iy tekshiruv:
// doctorId bor bo'lsa faqat id tengligi; yo'q bo'lsa (eski yozuvlar) faqat aniq ism tengligi.
export function transactionBelongsToDoctor(tx: Transaction, doctor: Doctor): boolean {
    if (tx.doctorId) return tx.doctorId === doctor.id;
    const txDocName = (tx.doctorName || '').trim();
    if (!txDocName) return false;
    return normalizeDoctorName(txDocName) === normalizeDoctorName(`${doctor.lastName} ${doctor.firstName}`);
}

// Tranzaksiyani shifokorga biriktirish: doctorId → aniq ism → yagona shifokor fallback
export function findDoctorForTransaction(tx: Transaction, doctors: Doctor[]): Doctor | undefined {
    let doctor = doctors.find(d => transactionBelongsToDoctor(tx, d));

    // Yagona shifokorli klinikada barcha kirim o'sha shifokorga tegishli
    if (!doctor && doctors.length === 1) {
        doctor = doctors[0];
    }
    return doctor;
}

/**
 * Shifokor ulushi hisoblanadigan summa: to'lov − shu ishning texnik xarajati. Bo'lingan ish
 * (qisman to'lov + qarz, bo'lib to'lash) qismlari texnik haqqini ulush bo'yicha bo'lishadi —
 * shuning uchun `context` (davr filtrisiz ro'yxat) beriladi. Xizmatlar berilmasa — to'lovning o'zi.
 */
export function shareBaseOf(
    transactions: Transaction[],
    services: ServiceLike[] = [],
    context?: Transaction[]
): (tx: Transaction) => { base: number; technicianCost: number } {
    if (!services.length) return tx => ({ base: tx.amount || 0, technicianCost: 0 });
    const index = buildTechnicianCostIndex(context || transactions, services);
    const own = () => buildTechnicianCostIndex(transactions, services);
    return tx => {
        const technicianCost = technicianCostOf(tx, index, own);
        return { base: Math.max(0, (tx.amount || 0) - technicianCost), technicianCost };
    };
}

/**
 * Har bir shifokor bo'yicha ulush hisobi: hisoblangan / to'langan / qoldiq.
 * transactions va expenses bir xil davr filtri bilan berilishi kerak.
 */
export function calculateDoctorShares(
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[],
    services: ServiceLike[] = [],
    context?: Transaction[]
): DoctorShareSummary[] {
    const baseOf = shareBaseOf(transactions, services, context);
    const summaries = new Map<string, DoctorShareSummary>();
    doctors.forEach(d => {
        summaries.set(d.id, {
            doctorId: d.id,
            doctorName: `${d.lastName} ${d.firstName}`,
            percentage: doctorSharePercent(d),
            grossRevenue: 0,
            technicianCost: 0,
            accrued: 0,
            paid: 0,
            balance: 0,
        });
    });

    transactions.forEach(tx => {
        if (!isEarnedRevenue(tx)) return;
        const doctor = findDoctorForTransaction(tx, doctors);
        if (!doctor) return;
        const s = summaries.get(doctor.id)!;
        const { base, technicianCost } = baseOf(tx);
        s.grossRevenue += tx.amount;
        s.technicianCost += technicianCost;
        if (s.percentage > 0) {
            s.accrued += base * (s.percentage / 100);
        }
    });

    expenses.forEach(exp => {
        if (exp.category !== 'DoctorShare' || !exp.doctorId) return;
        const s = summaries.get(exp.doctorId);
        if (s) s.paid += exp.amount;
    });

    summaries.forEach(s => { s.balance = s.accrued - s.paid; });
    return Array.from(summaries.values());
}

/**
 * Klinika bo'yicha umumiy moliya: kirim, xarajatlar, sof foyda.
 * Finance sahifasi va Dashboard shu bitta manbadan foydalanadi.
 */
export function calculateTotalFinancials(
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[],
    services: ServiceLike[] = [],
    context?: Transaction[]
): TotalFinancials {
    let totalRevenue = 0;
    let advanceDeposits = 0;
    let balanceDrawdown = 0;
    transactions.forEach(tx => {
        if (tx.status !== 'Paid') return;
        if (isAdvanceDeposit(tx)) { advanceDeposits += tx.amount; return; }
        totalRevenue += tx.amount;
        if (tx.type === 'Balance') balanceDrawdown += tx.amount;
    });

    const shares = calculateDoctorShares(transactions, expenses, doctors, services, context);
    const doctorShareAccrued = shares.reduce((sum, s) => sum + s.accrued, 0);
    const doctorSharePaid = shares.reduce((sum, s) => sum + s.paid, 0);

    let totalExpenses = 0;
    let otherExpenses = 0;
    let labCosts = 0;
    let inventoryCosts = 0;
    expenses.forEach(exp => {
        totalExpenses += exp.amount;
        if (exp.category === 'DoctorShare') return; // sof foydada accrued orqali hisoblangan
        otherExpenses += exp.amount;
        if (exp.category === 'Lab') labCosts += exp.amount;
        if (exp.category === 'Inventory') inventoryCosts += exp.amount;
    });

    const netProfit = totalRevenue - doctorShareAccrued - otherExpenses;

    return {
        totalRevenue,
        advanceDeposits,
        balanceDrawdown,
        doctorShareAccrued,
        doctorSharePaid,
        totalExpenses,
        otherExpenses,
        labCosts,
        inventoryCosts,
        netProfit,
    };
}

/**
 * Bitta shifokor uchun ulush hisobi (DoctorsAnalytics / DoctorDetails).
 * transactions — shu shifokorga tegishli (yoki umumiy, biriktirish ichkarida) to'lovlar.
 */
export function calculateDoctorShare(
    transactions: Transaction[],
    doctor: Doctor,
    expenses: Expense[] = [],
    services: ServiceLike[] = [],
    context?: Transaction[]
): DoctorShareSummary {
    const [summary] = calculateDoctorShares(transactions, expenses, [doctor], services, context);
    return summary;
}

/**
 * Qabul izohidan bajarilgan ishlar summasi — utils/appointmentTotal.ts (dentalocal da ham aynan shu fayl).
 * Erkin matn (reja, izoh) endi summaga kirmaydi: faqat narxli qatorlar va "Bajarilgan ishlar" /
 * "Qo'shimcha" blokidagi "- " bandlari. Ilgari istalgan qator xizmat nomiga o'xshasa pulga qo'shilardi
 * (dentalocal dagi klinika: 420 000 o'rniga 750 000).
 */
export { calculateAppointmentTotal } from './appointmentTotal';

/**
 * Qabul to'langanmi — sana + bemor (id ustuvor, aks holda ism) bo'yicha moslashtiradi.
 * Reception ish oqimi: shifokor "Completed" qiladi → to'lov shu qabul sanasiga yozilmaguncha "kutilmoqda" hisoblanadi.
 */
export function isAppointmentPaid(
    appointment: { date: string; patientId?: string; patientName: string },
    transactions: Transaction[]
): boolean {
    return transactions.some(t => {
        if (!t || (t.forDate || String(t.date || '').slice(0, 10)) !== appointment.date || t.status !== 'Paid' || isAdvanceDeposit(t)) return false;
        if (appointment.patientId && t.patientId) return t.patientId === appointment.patientId;
        return t.patientName === appointment.patientName;
    });
}
