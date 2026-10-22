/**
 * BAJARILGAN ISH VA TO'LOV HISOBI — denta7 (bulut) va dentalocal da AYNAN BIR XIL fayl:
 *   utils/workBilling.ts (ikkala dasturda). Birida o'zgartirsangiz, ikkinchisiga ham ko'chiring.
 *
 * - To'lov yozuvidagi xizmat matnini o'qish ("Nom|narx||...||TOTAL|jami", "(Qarz)", "Bo'lib to'lash (...)");
 * - texniklar xarajatini yozuvlarga taqsimlash (shifokor ulushi texnik haqqi ayirilgan summadan);
 * - qaysi qabullar hali to'lov yozuvi bilan yopilmagani ("Olinmagan pul" / "To'lov kutilmoqda").
 *
 * Ilgari bu dentalocal da edi, bulutda esa soddaroq qoidalar bor edi: qabul kunidagi istalgan yozuv
 * qabulni to'liq yopardi (keyin qo'shilgan ish ko'rinmasdi), shifokor ulushi texnik haqqi bilan birga
 * hisoblanardi. 2026-10-22 dan ikkala dasturda shu fayl (backend/shared/debtRules.ts bilan birga).
 */
import { isAdvanceDeposit } from '../backend/shared/debtRules';

/** To'lov yozuvining hisob uchun kerakli qismi (ikkala dasturdagi Transaction ga mos) */
export interface WorkTx {
    id?: string;
    service: string;
    status: string;
    type?: string | null;
    date: string;
    amount: number;
    discountAmount?: number | null;
    discountPercent?: number | null;
    patientId?: string | null;
    patientName?: string | null;
    /** dentalocal: qaysi qabul uchun to'lov */
    appointmentId?: string | null;
    /** bulut: tashrif kuni (qarz boshqa kuni to'lansa ham o'zgarmaydi) */
    forDate?: string | null;
}

/** Qabulning hisob uchun kerakli qismi */
export interface WorkAppointment {
    id: string;
    date: string;
    status: string;
    notes?: string | null;
}

/** To'lov qaysi tashrif kuni uchun: bulutda forDate, aks holda sana (vaqtli eski sana ham kunga) */
export const visitDayOfTx = (tx: { date?: string | null; forDate?: string | null }): string =>
    String(tx.forDate || tx.date || '').slice(0, 10);

/** Xizmatning hisob-kitob uchun kerakli minimal ko'rinishi */
export type ServiceLike = { name: string; price: number; cost?: number; duration?: number };

export interface ServiceBreakdown {
    /** Xizmat(lar)ning narxnomadagi umumiy summasi (chegirmagacha) */
    listedTotal: number;
    /** Shu ishlar uchun texniklarga to'lanadigan umumiy summa */
    technicianCost: number;
    /** Bitta ish bir nechta to'lovga bo'linganmi (qisman to'lov / qarz / bo'lib to'lash) */
    isPartial: boolean;
}

// To'lov yozuvida xizmat nomi uch xil ko'rinishda saqlanadi:
//   1) "Metallokeramik koronka"                                     - bitta xizmat
//   2) "Koronka|500 000||Konsultatsiya|100 000||TOTAL|600 000"      - qabuldagi ishlar ro'yxati
//   3) yuqoridagilarning oxirida "(Qisman to'lov)" / "(Qarz)" / "(Qarzdorlik yopildi)"
// Ilgari faqat 1-holat aniq mos kelardi, 2- va 3-holatda xizmat topilmay,
// texniklar xarajati 0 bo'lib qolardi - shuning uchun u shifokor ulushidan ayrilmasdi.
// Bitta ish bir nechta to'lovga bo'linganini bildiruvchi belgilar.
// FAQAT shu holatda texnik xarajati to'langan ulushga qarab bo'linadi.
// "\u0414\u043e\u043b\u0433 \u043f\u043e\u0433\u0430\u0448\u0435\u043d" - Kassa rus tilida qarzni qisman yopganda yozadigan belgi.
const PARTIAL_SUFFIX = /\s*\((qisman to['\u2018\u2019]lov|qarz|qarzdorlik yopildi|\u0434\u043e\u043b\u0433 \u043f\u043e\u0433\u0430\u0448\u0435\u043d)\)\s*$/i;
const INSTALLMENT_PREFIX = /^\s*bo['\u2018\u2019]lib to['\u2018\u2019]lash\s*\((.*)\)\s*$/i;

const normalize = (s: string): string => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const parseMoney = (s: string): number => {
    const n = parseFloat(String(s || '').replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
};

// Qarzni QISMAN yopish yozuvi: "... (Qarzdorlik yopildi)" yoki Kassaning ruscha belgisi
const REPAYMENT_SUFFIX = /\((qarzdorlik yopildi|\u0434\u043e\u043b\u0433 \u043f\u043e\u0433\u0430\u0448\u0435\u043d)\)\s*$/i;

/**
 * Yozuv qaysi ishga tegishli - belgilarsiz kalit. Bitta qabulning barcha
 * to'lovlari (qisman, qarz, yopilgan qarz, bo'lib to'lash) bir xil kalitga ega.
 */
export function serviceBaseKey(txService: string): string {
    let raw = (txService || '').trim();
    while (PARTIAL_SUFFIX.test(raw)) raw = raw.replace(PARTIAL_SUFFIX, '');
    const installment = raw.match(INSTALLMENT_PREFIX);
    if (installment) raw = installment[1];
    return normalize(raw);
}

/** Qarzning bir qismi yopilgan yozuv - ishning asosiy to'lovi emas */
export const isDebtRepaymentPart = (txService: string): boolean => REPAYMENT_SUFFIX.test((txService || '').trim());

function findService(name: string, services: ServiceLike[]): ServiceLike | undefined {
    const target = normalize(name);
    if (!target) return undefined;

    const exact = services.find(s => normalize(s.name) === target);
    if (exact) return exact;

    // Nomga qo'shimcha qo'shilgan bo'lsa - eng uzun mos kelganini olamiz
    return services
        .filter(s => {
            const n = normalize(s.name);
            return n.length > 2 && (target.includes(n) || n.includes(target));
        })
        .sort((a, b) => b.name.length - a.name.length)[0];
}

/**
 * Tranzaksiyadagi xizmat nomidan narxnoma summasini va texniklar xarajatini ajratib oladi.
 * Qabuldagi bir nechta ish uchun har bir ishning texnik xarajati qo'shib boriladi.
 */
export function resolveServiceBreakdown(txService: string, services: ServiceLike[]): ServiceBreakdown {
    let raw = (txService || '').trim();
    let isPartial = false;

    // Qarz qisman yopilganda belgi ikkinchi marta qo'shiladi: "... (Qarz) (Qarzdorlik yopildi)"
    while (PARTIAL_SUFFIX.test(raw)) {
        isPartial = true;
        raw = raw.replace(PARTIAL_SUFFIX, '');
    }

    const installment = raw.match(INSTALLMENT_PREFIX);
    if (installment) {
        isPartial = true;
        raw = installment[1];
    }

    if (!raw.trim()) return { listedTotal: 0, technicianCost: 0, isPartial };

    // Qabuldagi ishlar ro'yxati: "Nom|narx||Nom|narx||TOTAL|jami"
    if (raw.includes('|')) {
        let listedTotal = 0;
        let technicianCost = 0;

        raw.split('||').forEach(chunk => {
            if (!chunk) return;
            const parts = chunk.split('|');
            const name = parts[0];
            if (!name || normalize(name) === 'total') return;

            const service = findService(name, services);
            const price = parseMoney(parts[1]) || service?.price || 0;
            listedTotal += price;
            technicianCost += service?.cost || 0;
        });

        return { listedTotal, technicianCost, isPartial };
    }

    const service = findService(raw, services);
    return {
        listedTotal: service?.price || 0,
        technicianCost: service?.cost || 0,
        isPartial
    };
}

/**
 * Bo'lingan ishning shu yozuvga to'g'ri keladigan ulushi (0..1).
 *
 * To'lov oynasi chegirmani ham qismlarga bo'lib yozadi: 1 000 000 lik ish 10%
 * chegirma bilan 900 000, u 500 000 + 400 000 ga bo'linsa, yozuvlardagi
 * chegirma 55 556 va 44 444 bo'ladi. Demak har bir qism narxnomaning
 * (summa + o'z chegirmasi) qismini yopadi: 555 556 + 444 444 = 1 000 000.
 *
 * Ilgari qismdagi chegirma BUTUN ishning chegirmasi deb olinardi:
 * 500 000 / 944 444 + 400 000 / 955 556 = 0.948 - texnikka 260 000 o'rniga
 * 246 484 chiqardi, ya'ni chegirma texnik haqidan ham ayrilardi.
 */
function partialShare(tx: WorkTx, listedTotal: number): number {
    if (listedTotal <= 0) return 1;
    return Math.min(coveredListAmount(tx) / listedTotal, 1);
}

/** Yozuv narxnomaning qancha qismini yopadi: summa + o'z chegirmasi */
function coveredListAmount(tx: WorkTx): number {
    const amount = Math.max(0, Number(tx.amount) || 0);

    const ownDiscount = Number(tx.discountAmount) || 0;
    if (ownDiscount > 0) return amount + ownDiscount;

    // Faqat foiz saqlangan yozuv: foiz butun ishga tegishli
    const percent = Number(tx.discountPercent) || 0;
    if (percent > 0 && percent < 100) return amount / (1 - percent / 100);

    return amount;
}

/**
 * Bitta tranzaksiyaga tegishli texniklar xarajati.
 *
 * ASOSIY QOIDA: texnik haqqi o'zgarmaydi. Xizmat 1 000 000, texnikka 300 000
 * bo'lsa va bemor chegirma bilan 950 000 to'lasa ham - texnikka baribir 300 000.
 * Chegirma faqat klinika va shifokor foydasidan chiqadi:
 * 950 000 - 300 000 = 650 000, shifokor 50% -> 325 000.
 *
 * Ilgari xarajat to'langan summaga proporsional kamayardi (300 000 x 0.95 = 285 000),
 * shuning uchun shifokorga 332 500 - ortiqcha 7 500 - hisoblanardi.
 *
 * ISTISNO: bitta ish bir nechta to'lovga bo'lingan bo'lsa ("Qisman to'lov" + "Qarz",
 * yoki "Bo'lib to'lash (...)"), xarajat to'langan ulushga qarab taqsimlanadi -
 * aks holda u har bir to'lovda qaytadan to'liq hisoblanib ketardi.
 */
export function allocateTechnicianCost(tx: WorkTx, services: ServiceLike[]): ServiceBreakdown {
    const { listedTotal, technicianCost, isPartial } = resolveServiceBreakdown(tx.service, services);
    if (technicianCost <= 0) return { listedTotal, technicianCost: 0, isPartial };

    let cost = technicianCost;

    if (isPartial) {
        cost = technicianCost * partialShare(tx, listedTotal);
    }

    return {
        listedTotal,
        technicianCost: Math.min(cost, Math.max(0, tx.amount)),
        isPartial
    };
}

// Qarz qismlarga bo'linganini bildiradi (bo'lib to'lash bundan tashqari)
const SPLIT_SUFFIX = /\((qisman to['‘’]lov|qarz|qarzdorlik yopildi|долг погашен)\)\s*$/i;

/** Texnik xarajati: yozuv -> summa. Bir ishning barcha to'lovlari birga ko'rilganda tuziladi */
export type TechnicianCostIndex = Map<WorkTx, number>;

// Bir xil ro'yxat uchun qayta hisoblanmasin (har shifokor uchun chaqiriladi). Uzunlik — ro'yxat
// joyida o'zgartirilgan bo'lsa eskirgan natija qaytmasin
const techIndexCache = new WeakMap<WorkTx[], WeakMap<ServiceLike[], { length: number; index: TechnicianCostIndex }>>();

/**
 * Har bir yozuvga tushadigan texnik xarajati — ishning BARCHA to'lovlarini birga ko'rib.
 *
 * Klinika (2026-10-14, ikkinchi marta): "skidka bersak texnik haqqidan ham skidka qilyapti".
 * Bo'lingan ishda (qisman to'lov + qarz, qarzning bir qismi yopilgan) har bir qism o'z ulushini
 * (summa + chegirma) / narxnoma bo'yicha olardi. Chegirma maydon orqali emas, summani kamaytirib
 * berilsa (qarz qoldig'i 0 ga o'zgartirilsa, qarz kamroq summaga yopilsa) qismlar yig'indisi
 * narxnomadan kam chiqib, texnik haqqi ham shuncha kamayardi.
 *
 * Endi bitta ishning (bemor + ishlar ro'yxati) bo'lingan yozuvlari guruh bo'ladi: texnik haqqi
 * to'liq, faqat qismlar orasida (summa + chegirma) ulushiga qarab taqsimlanadi. Guruhda ikki
 * xil qabuldagi bir xil ish bo'lsa — nechta ish ekani yig'indidan chiqariladi.
 * Qarzga to'liq yozilib, keyin bo'lib yopilgan ish (belgisiz qarz + "(Qarzdorlik yopildi)")
 * ham guruhga kiradi — ilgari qolgan qarz yopilganda texnik haqqi qaytadan to'liq qo'shilardi.
 * Bo'lib to'lash rejasining kelgusi to'lovlari hali yozuv emas — ular avvalgidek ulush bo'yicha.
 *
 * `transactions` — oy/davr bo'yicha filtrlanmagan ro'yxat bo'lishi kerak: qismlar turli oyda bo'lsa,
 * har biri o'z ulushini oladi.
 */
export function buildTechnicianCostIndex(transactions: WorkTx[], services: ServiceLike[]): TechnicianCostIndex {
    if (!Array.isArray(transactions) || !Array.isArray(services)) return new Map();
    const cached = techIndexCache.get(transactions)?.get(services);
    if (cached && cached.length === transactions.length) return cached.index;

    const index: TechnicianCostIndex = new Map();
    const groups = new Map<string, { split: WorkTx[]; plain: WorkTx[]; plainOrigin: boolean }>();

    transactions.forEach(tx => {
        if (!tx || tx.type === 'Expense' || isAdvanceDeposit(tx)) return;
        const service = (tx.service || '').trim();
        const installment = INSTALLMENT_PREFIX.test(service.replace(PARTIAL_SUFFIX, ''));
        const split = !installment && SPLIT_SUFFIX.test(service);
        if (!split) {
            index.set(tx, allocateTechnicianCost(tx, services).technicianCost);
            if (installment) return;
        }
        const key = `${tx.patientId || tx.patientName || ''}|${serviceBaseKey(service)}`;
        const group = groups.get(key) || { split: [], plain: [], plainOrigin: false };
        if (split) {
            group.split.push(tx);
            // "<belgisiz ish> (Qarzdorlik yopildi)" — qarz to'liq yozilgan, keyin bo'lib yopilgan
            if (REPAYMENT_SUFFIX.test(service) && !SPLIT_SUFFIX.test(service.replace(REPAYMENT_SUFFIX, '').trim())) {
                group.plainOrigin = true;
            }
        } else {
            group.plain.push(tx);
        }
        groups.set(key, group);
    });

    groups.forEach(group => {
        if (group.split.length === 0) return;
        const members = group.plainOrigin ? [...group.split, ...group.plain] : group.split;
        const { listedTotal, technicianCost } = resolveServiceBreakdown(members[0].service, services);
        const covered = members.map(coveredListAmount);
        const sum = covered.reduce((s, c) => s + c, 0);
        const jobs = listedTotal > 0 ? Math.max(1, Math.round(sum / listedTotal)) : 1;
        members.forEach((tx, i) => {
            const cost = technicianCost > 0 && sum > 0 ? technicianCost * jobs * covered[i] / sum : 0;
            index.set(tx, Math.min(cost, Math.max(0, Number(tx.amount) || 0)));
        });
    });

    const byServices = techIndexCache.get(transactions) || new WeakMap();
    byServices.set(services, { length: transactions.length, index });
    techIndexCache.set(transactions, byServices);
    return index;
}

/** Yozuvning texnik xarajati: avval butun ro'yxat (context) bo'yicha, topilmasa — berilgan ro'yxatdan */
export function technicianCostOf(tx: WorkTx, index: TechnicianCostIndex, fallback: () => TechnicianCostIndex): number {
    const cost = index.get(tx);
    if (cost !== undefined) return cost;
    return fallback().get(tx) ?? 0;
}

/** Ishlar ro'yxatidagi bitta ish: "Nom|narx" */
interface WorkItem {
    /** Nom + narx (kichik harf, bo'shliqlar bir xil) — solishtirish kaliti */
    key: string;
    price: number;
    /** Ro'yxatdagi asl ko'rinishi — qolgan ishlar ro'yxatini qayta yig'ish uchun */
    chunk: string;
}

/** "Nom|narx||Nom|narx||TOTAL|jami (Qarz)" → ishlar (TOTAL siz). Ro'yxat bo'lmasa — bo'sh */
function parseWorkItems(service: string): WorkItem[] {
    let raw = (service || '').trim();
    while (PARTIAL_SUFFIX.test(raw)) raw = raw.replace(PARTIAL_SUFFIX, '');
    const installment = raw.match(INSTALLMENT_PREFIX);
    if (installment) raw = installment[1];
    if (!raw.includes('|')) return [];
    return raw.split('||')
        .map(chunk => chunk.trim())
        .filter(chunk => chunk && normalize(chunk.split('|')[0]) !== 'total')
        .map(chunk => {
            const [name, price] = chunk.split('|');
            const amount = parseMoney(price);
            return { key: `${normalize(name)}|${amount}`, price: amount, chunk };
        });
}

const countItems = (items: WorkItem[]): Map<string, number> => {
    const counts = new Map<string, number>();
    items.forEach(i => counts.set(i.key, (counts.get(i.key) || 0) + 1));
    return counts;
};

/** a ning har bir ishi b da (kamida shuncha marta) bormi */
const isSubset = (a: Map<string, number>, b: Map<string, number>): boolean =>
    [...a].every(([key, n]) => (b.get(key) || 0) >= n);

// utils/appointmentTotal.ts dagi kabi
const formatSum = (n: number): string => n.toLocaleString().replace(/,/g, ' ');

/** To'lov kutayotgan qabul. `remaining` — ishlarning bir qismi to'langan bo'lsa, qolgani */
export interface UnbilledWork<A extends WorkAppointment = WorkAppointment> {
    appointment: A;
    remaining?: { breakdown: string; total: number };
}

/**
 * Bemor kartasidagi "To'lov kutayotgan qabullar": yakunlangan, lekin ishlari hali to'lov
 * yozuvi (to'langan yoki qarz) bilan yopilmagan qabullar.
 *
 * Ilgari qabul faqat o'sha SANADAGI "To'landi" yozuvi bilan ro'yxatdan chiqardi:
 *  - qarzga yozilgan qabul ro'yxatda qolardi; "To'lov" yana bosilsa ikkinchi
 *    yozuv paydo bo'lib, qarz ham turaverardi (bemor ikki marta qarzdor);
 *  - qarz keyin yopilganda yozuv sanasi to'lov kuniga ko'chadi, kassaga
 *    yuborilgan so'rov ham olingan kuni yoziladi - qabul "to'lanmagan" qolardi;
 *  - boshqa qabulning qarzi shu kuni yopilsa, o'sha yozuv bu kungi to'lanmagan
 *    qabulni ham "to'langan" qilib yashirardi.
 *
 * Klinika (2026-10-14, qaytalangan xato): qarz yopilgach qabul yana "Kutilmoqda" bo'lib chiqardi,
 * "To'lov" bosilsa pul ikki marta yozilardi. Sabab: to'lovdan keyin qabulga yana ish qo'shilsa
 * (o'sha kuni ikkinchi kelish — bir kunda bitta qabul, "Qo'shimcha" bo'lib yoziladi; 0 so'mlik
 * ko'rik ham) ishlar ro'yxati boshqa kalit bo'lib qolardi va to'lov qabulga bog'lanmasdi.
 *
 * Endi qabul ISHLAR bo'yicha yopiladi:
 *  0) yozuvda qabul ID si bo'lsa (2026-10-17 dan) — to'g'ridan-to'g'ri;
 *  1) sana + ishlar ro'yxati bir xil;
 *  2) ishlar ro'yxati bir xil, qabuldan keyin yozilgan (qarz keyin yopilgan / kassada olingan);
 *  3) yozuvdagi ishlar qabul ishlarining bir qismi (avval o'sha kun, keyin keyingi kunlar).
 *     Qabulning narxi bor (0 so'mdan katta) BARCHA ishlari yopilsa — qabul to'langan; bir qismi
 *     yopilsa — faqat qolgan ishlar "To'lov kutilmoqda"da turadi (remaining);
 *  4) faqat sana - ishlar ro'yxatidan tanib bo'lmaydigan eski yoki qo'lda yozilgan to'lovlar.
 * Qisman to'lov + qarz (bir xil ro'yxat) bitta to'lov deb sanaladi. Qarzning bir qismini yopgan
 * yozuv hisobga olinmaydi: ishning asosiy yozuvi baribir bor.
 *
 * `breakdownOf` - qabul izohidan to'lov yozuvidagi ko'rinishdagi ishlar ro'yxati.
 */
export function findUnbilledWork<A extends WorkAppointment>(
    appointments: A[],
    transactions: WorkTx[],
    breakdownOf: (appointment: A) => string
): UnbilledWork<A>[] {
    const billing = (transactions || [])
        .filter(tx => tx && tx.type !== 'Expense' && !isAdvanceDeposit(tx) && !isDebtRepaymentPart(tx.service)
            && ['Paid', 'paid', 'Pending', 'Overdue'].includes(tx.status))
        .map(tx => {
            const items = parseWorkItems(tx.service);
            return { tx, day: visitDayOfTx(tx), key: serviceBaseKey(tx.service), items, counts: countItems(items) };
        });
    type Billing = typeof billing[number];

    const pending = (appointments || [])
        .filter(a => a && a.date && (a.status === 'Completed' || a.status === 'Checked-In'))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(a => {
            const breakdown = breakdownOf(a);
            const items = parseWorkItems(breakdown);
            // Narxi bor ishlar — to'lanishi kerak bo'lganlari (0 so'mlik ko'rik qabulni ochiq qoldirmaydi)
            const priced = items.filter(i => i.price > 0);
            return {
                a, key: serviceBaseKey(breakdown), counts: countItems(items), priced,
                needed: countItems(priced),
                covered: new Map<string, number>(),
                claimedKeys: new Set<string>(),
                claimed: false,
                full: false,
            };
        });
    type Pending = typeof pending[number];

    const apptKeys = new Set(pending.map(p => p.key));
    const used = new Set<string>();

    const isCovered = (p: Pending): boolean =>
        [...p.needed].every(([key, n]) => (p.covered.get(key) || 0) >= n);

    const take = (p: Pending, b: Billing) => {
        used.add(b.tx.id);
        p.claimed = true;
        // Bir xil ro'yxatli yozuvlar (qisman to'lov + qarz) — bitta to'lovning qismlari
        if (!p.claimedKeys.has(b.key)) {
            p.claimedKeys.add(b.key);
            b.counts.forEach((n, key) => p.covered.set(key, (p.covered.get(key) || 0) + n));
        }
        // Ro'yxatsiz (eski, bitta xizmat nomi) yoki aynan bir xil ro'yxat — qabul to'liq yopilgan
        if (b.items.length === 0 || b.key === p.key || isCovered(p)) p.full = true;
    };

    // 0) Qabulga to'g'ridan-to'g'ri bog'langan yozuvlar
    pending.forEach(p => {
        billing.filter(b => !used.has(b.tx.id) && b.tx.appointmentId === p.a.id).forEach(b => take(p, b));
    });

    const open = () => pending.filter(p => !p.full);
    const free = (b: Billing) => !used.has(b.tx.id) && !b.tx.appointmentId;

    // 1) va 2) Ishlar ro'yxati to'liq bir xil
    open().forEach(p => billing.filter(b => free(b) && b.key === p.key && b.day === p.a.date).forEach(b => take(p, b)));
    open().forEach(p => {
        const hit = billing.find(b => free(b) && b.key === p.key && b.day >= p.a.date);
        if (hit) take(p, hit);
    });

    // 3) Yozuv qabul ishlarining bir qismi: avval o'sha kun, keyin keyingi kunlar
    const bySubset = (sameDay: boolean) => open().forEach(p => {
        if (p.priced.length === 0) return;
        billing
            .filter(b => free(b) && b.items.some(i => i.price > 0)
                && (sameDay ? b.day === p.a.date : b.day > p.a.date)
                && isSubset(b.counts, p.counts))
            .sort((x, y) => x.day.localeCompare(y.day))
            .forEach(b => {
                if (p.full) return;
                const sibling = p.claimedKeys.has(b.key);
                const addsCoverage = [...b.counts].some(([key]) => (p.covered.get(key) || 0) < (p.needed.get(key) || 0));
                if (sibling || addsCoverage) take(p, b);
            });
    });
    bySubset(true);
    bySubset(false);

    // 4) Ishlar ro'yxatidan tanib bo'lmaydigan eski/qo'lda yozilgan to'lov — o'sha kuni
    const recognizable = (b: Billing) => apptKeys.has(b.key)
        || (b.items.length > 0 && pending.some(p => isSubset(b.counts, p.counts)));
    open().forEach(p => {
        if (p.claimed) return;
        billing
            .filter(b => free(b) && b.day === p.a.date && !recognizable(b))
            .forEach(b => {
                used.add(b.tx.id);
                p.claimed = true;
                p.full = true;
            });
    });

    return pending
        .filter(p => !p.full)
        .map(p => {
            if (!p.claimed || p.priced.length === 0) return { appointment: p.a };
            // Ishlarning bir qismi to'langan — qolganlari (takrorlangan ish ham sanab chiqiladi)
            const seen = new Map<string, number>();
            const left = p.priced.filter(item => {
                const n = (seen.get(item.key) || 0) + 1;
                seen.set(item.key, n);
                return n > (p.covered.get(item.key) || 0);
            });
            const total = left.reduce((s, i) => s + i.price, 0);
            return {
                appointment: p.a,
                remaining: { breakdown: `${left.map(i => i.chunk).join('||')}||TOTAL|${formatSum(total)}`, total },
            };
        });
}

/** To'lov kutayotgan qabullar (ro'yxat va sanoq uchun) — findUnbilledWork izohiga qarang */
export function findUnbilledAppointments<A extends WorkAppointment>(
    appointments: A[],
    transactions: WorkTx[],
    breakdownOf: (appointment: A) => string
): A[] {
    return findUnbilledWork(appointments, transactions, breakdownOf).map(w => w.appointment);
}
