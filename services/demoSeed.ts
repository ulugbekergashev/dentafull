import {
    Appointment, Doctor, Expense, FlowLog, InstallmentItem, InstallmentPlan, InventoryItem, InventoryLog, LabOrder, Lead,
    MessageLog, Patient, PaymentMethod, Recall, Receptionist, Service, Transaction,
} from '../types';
import { formatDateToISO } from '../utils/dateUtils';

/**
 * Demo klinika ma'lumotlari — har kuni shu kunga moslab quriladi.
 *
 * Demo butunlay brauzerda ishlaydi (services/demoData.ts): serverga ham, bazaga ham hech
 * narsa yozilmaydi. Bosh sahifa bo'sh ko'rinmasligi uchun bu yerda jonli klinika yasaladi:
 * to'rt shifokor, o'tgan to'rt hafta (grafiklar va moliya uchun), bugun — hozirgi soatga
 * qarab (kimdir kabinetda, kimdir navbatda, kimdir keyinroq keladi) — va keyingi hafta.
 *
 * Har kunning jadvali o'sha sanadan hosil qilinadigan tasodifiy sonlar bilan quriladi:
 * ertaga qayta qurilganda ham o'tgan kunlar o'zgarmaydi. Telefonlar "+998 00" — bunday
 * operator yo'q, ya'ni demo'dan bosilgan qo'ng'iroq begona odamga tushmaydi.
 */

/** Saqlangan demo boshqa versiyada qurilgan bo'lsa — yangidan quriladi */
export const DEMO_SEED_VERSION = 2;

const CLINIC = 'demo-clinic-1';
const HISTORY_DAYS = 28;
const FUTURE_DAYS = 7;
const PATIENT_COUNT = 320;
/** Shu raqamdan boshlab bemorlar hali kelmagan — faqat bugun va keyingi kunlarga yozilgan */
const NEW_PATIENTS_FROM = 291;
const LUNCH_FROM = 13 * 60;
const LUNCH_TO = 14 * 60;
const LAST_SLOT_END = 23 * 60 + 45;
/** Erta smena bundan oldin boshlanmaydi (tunda ochilgan demo 00:10 ga bemor yozmasin) */
const FIRST_SLOT_START = 6 * 60;

// ── Yordamchilar ─────────────────────────────────────────────────────────────

/** Satrdan hosil bo'ladigan tasodifiy sonlar (mulberry32): bir xil satr — bir xil ketma-ketlik */
function rngOf(seed: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    let a = h >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];

function weighted<T>(r: () => number, list: readonly [T, number][]): T {
    const total = list.reduce((s, [, w]) => s + w, 0);
    let x = r() * total;
    for (const [v, w] of list) {
        x -= w;
        if (x < 0) return v;
    }
    return list[list.length - 1][0];
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const dayAt = (base: Date, offset: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);

/** Sana + kun boshidan daqiqa → ISO vaqt (mahalliy soat bo'yicha) */
function stamp(date: string, min: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d, 0, min).toISOString();
}

/** 350000 → "350 000" (qabul izohidagi narx shu ko'rinishda o'qiladi) */
const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Mavjud bo'lmagan operator (+998 00): demo'dan qo'ng'iroq hech kimga bormaydi */
function phoneOf(i: number): string {
    const n = String(1000000 + ((i * 7919) % 9000000));
    return `+998 00 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)}`;
}

// ── Xizmatlar va shifokorlar ────────────────────────────────────────────────

export const DEMO_SERVICE_LIST: Service[] = [
    { id: 1, name: 'Konsultatsiya', price: 50000, duration: 30, categoryId: 'cat-1', clinicId: CLINIC },
    { id: 2, name: 'Tish tozalash', price: 200000, duration: 45, categoryId: 'cat-2', recallMonths: 6, clinicId: CLINIC },
    { id: 3, name: 'Tish plombalash', price: 300000, duration: 60, categoryId: 'cat-3', recallMonths: 6, clinicId: CLINIC },
    { id: 4, name: 'Tish olib tashlash', price: 150000, duration: 30, categoryId: 'cat-4', clinicId: CLINIC },
    { id: 5, name: 'Tish oqartirish', price: 800000, duration: 90, categoryId: 'cat-2', clinicId: CLINIC },
    { id: 6, name: 'Metall-keramika toj', price: 1200000, duration: 60, categoryId: 'cat-6', clinicId: CLINIC },
    { id: 7, name: 'Breket tizimi', price: 5000000, duration: 90, categoryId: 'cat-5', clinicId: CLINIC },
    { id: 8, name: 'Kanal davolash', price: 450000, duration: 60, categoryId: 'cat-3', clinicId: CLINIC },
    { id: 9, name: "Implant o'rnatish", price: 4500000, duration: 90, categoryId: 'cat-4', clinicId: CLINIC },
    { id: 10, name: 'Breket nazorati', price: 250000, duration: 30, categoryId: 'cat-5', recallMonths: 1, clinicId: CLINIC },
    { id: 11, name: 'Sut tishini plombalash', price: 180000, duration: 45, categoryId: 'cat-3', clinicId: CLINIC },
    { id: 12, name: 'Ftorlash', price: 120000, duration: 30, categoryId: 'cat-2', recallMonths: 6, clinicId: CLINIC },
    { id: 13, name: 'Dental rentgen', price: 40000, duration: 15, categoryId: 'cat-1', clinicId: CLINIC },
];
const SERVICE_BY_ID = new Map(DEMO_SERVICE_LIST.map(s => [s.id!, s]));
/** Tish raqami yoziladigan xizmatlar */
const TOOTH_SERVICES = new Set([3, 4, 6, 8, 9, 11]);

interface Profile {
    doctor: Doctor;
    /** Ish vaqti, kun boshidan daqiqa */
    hours: [number, number];
    /** Yakshanba navbatchiligi; yo'q bo'lsa — dam oladi */
    sunday?: [number, number];
    /** [xizmat id, ulushi] */
    mix: [number, number][];
    /** Bolalar shifokori — faqat bolalarni qabul qiladi */
    kids?: boolean;
    /** Demo kechqurun ochilsa ham ishlab turadi */
    late?: boolean;
    /** Demo erta tongda ochilsa ham ishlab turadi */
    early?: boolean;
}

const doctorOf = (id: string, firstName: string, lastName: string, specialty: string, color: string, percentage: number, username: string, phoneN: number): Doctor => ({
    id, firstName, lastName, specialty, color, percentage, username,
    phone: phoneOf(phoneN), status: 'Active', clinicId: CLINIC,
});

const PROFILES: Profile[] = [
    {
        doctor: doctorOf('demo-doctor-1', 'Kamola', 'Ahmedova', 'Terapevt', '#3B82F6', 40, 'kamola', 9001),
        hours: [9 * 60, 19 * 60], sunday: [10 * 60, 15 * 60], late: true,
        mix: [[3, 5], [8, 3], [1, 2], [2, 2], [5, 1]],
    },
    {
        doctor: doctorOf('demo-doctor-2', 'Jamshid', 'Karimov', 'Ortodont', '#10B981', 50, 'jamshid', 9002),
        hours: [10 * 60, 20 * 60], late: true,
        mix: [[10, 7], [1, 2], [2, 1], [7, 0.4]],
    },
    {
        doctor: doctorOf('demo-doctor-3', 'Sardor', 'Yusupov', 'Jarroh-implantolog', '#F59E0B', 45, 'sardor', 9003),
        hours: [9 * 60, 17 * 60], sunday: [10 * 60, 14 * 60], early: true,
        mix: [[4, 4], [1, 2], [6, 2], [8, 1], [9, 0.8]],
    },
    {
        doctor: doctorOf('demo-doctor-4', 'Malika', 'Rustamova', 'Bolalar stomatologi', '#EC4899', 40, 'malika', 9004),
        hours: [8 * 60, 15 * 60], kids: true, early: true,
        mix: [[11, 5], [12, 3], [1, 2], [2, 1], [4, 1]],
    },
];
const DOCTOR_BY_ID = new Map(PROFILES.map(p => [p.doctor.id, p.doctor]));

// ── Bemorlar ─────────────────────────────────────────────────────────────────

const MALE = ['Aziz', 'Bekzod', 'Bobur', 'Davron', 'Eldor', 'Farrux', "G'ayrat", 'Husan', 'Ibrohim', 'Jasur', 'Kamron', 'Laziz', 'Mansur', 'Nodir', 'Otabek', 'Rustam', 'Sherzod', 'Temur', 'Xurshid', 'Yusuf', 'Zafar', 'Anvar', 'Doston', 'Islom', 'Javohir', 'Sanjar', 'Shoxrux', 'Abror', 'Diyor', 'Samandar'];
const FEMALE = ['Aziza', 'Barno', 'Dilnoza', 'Dilfuza', 'Feruza', 'Gulnora', 'Hilola', 'Iroda', 'Lola', 'Madina', 'Nargiza', 'Nilufar', 'Ozoda', 'Rayhona', 'Sabina', 'Sevara', 'Shahnoza', 'Umida', 'Yulduz', 'Zarina', 'Nigora', 'Mohira', 'Sitora', 'Shoira', 'Muslima', 'Maftuna', 'Kumush', 'Zilola', 'Charos', 'Durdona'];
const SURNAMES = ['Abdullayev', 'Aliyev', 'Azimov', 'Boboyev', 'Hasanov', 'Ismoilov', "Jo'rayev", 'Latipov', 'Mahmudov', 'Mirzayev', 'Nazarov', 'Normatov', 'Olimov', 'Qodirov', 'Rahimov', 'Rashidov', 'Saidov', 'Salimov', 'Sobirov', 'Sultonov', 'Tursunov', 'Umarov', 'Usmonov', 'Xoliqov', "Yo'ldoshev", 'Zokirov', 'Qosimov', 'Hamidov', 'Valiyev', 'Sharipov'];
const DISTRICTS = ['Yunusobod tumani', 'Chilonzor tumani', "Mirzo Ulug'bek tumani", 'Yakkasaroy tumani', 'Shayxontohur tumani', 'Olmazor tumani', 'Sergeli tumani', 'Yashnobod tumani', 'Mirobod tumani', 'Uchtepa tumani'];
const HISTORY = ['Yuqori qon bosimi', 'Allergiya: penitsillin', 'Qandli diabet (2-tur)', 'Astma', 'Allergiya: lidokain', 'Yurak ritmi buzilishi'];
const COMPLAINTS = ["Og'riq: pastki jag', chap tomon", 'Plomba tushib ketgan', 'Sovuqqa sezuvchanlik', 'Milk qonaydi', "Nazorat ko'rigi", "Breket simi bo'shagan"];

interface PatientMeta { kid: boolean; primary: string; isNew: boolean }

function buildPool(year: number): { patients: Patient[]; meta: Map<string, PatientMeta> } {
    const r = rngOf('demo-patients');
    const patients: Patient[] = [];
    const meta = new Map<string, PatientMeta>();
    for (let i = 1; i <= PATIENT_COUNT; i++) {
        const kid = i % 6 === 0;
        const female = r() < 0.55;
        const firstName = pick(r, female ? FEMALE : MALE);
        const stem = pick(r, SURNAMES);
        const age = kid ? 4 + Math.floor(r() * 10) : 18 + Math.floor(r() * 50);
        const dob = `${year - age}-${pad(1 + Math.floor(r() * 12))}-${pad(1 + Math.floor(r() * 28))}`;
        const primary = kid ? 'demo-doctor-4' : weighted(r, [['demo-doctor-1', 4], ['demo-doctor-2', 2], ['demo-doctor-3', 2.5]] as [string, number][]);
        const history = r() < 0.15 ? pick(r, HISTORY) : '';
        const address = `${pick(r, DISTRICTS)}, ${1 + Math.floor(r() * 40)}-uy`;
        const telegram = r() < 0.45;
        const id = `demo-patient-${i}`;
        patients.push({
            id, firstName, lastName: female ? `${stem}a` : stem, phone: phoneOf(i), dob,
            gender: female ? 'Female' : 'Male', status: 'Active', medicalHistory: history, address,
            clinicId: CLINIC, lastVisit: 'Never', doctorId: primary, doctorName: `Dr. ${DOCTOR_BY_ID.get(primary)!.lastName}`,
            ...(telegram ? { telegramChatId: String(700000000 + i * 131) } : {}),
        });
        meta.set(id, { kid, primary, isNew: i >= NEW_PATIENTS_FROM });
    }
    return { patients, meta };
}

// ── Kun jadvali ──────────────────────────────────────────────────────────────

export interface DemoItem { name: string; tooth?: number; price: number }

/** Bugungi bitta qabulning rejasi — vaqt o'tishi bilan holati shundan hisoblanadi */
export interface DemoSlot {
    doctorId: string;
    /** Yozilgan vaqt, kun boshidan daqiqa */
    start: number;
    duration: number;
    fate: 'done' | 'noshow' | 'cancel';
    pay: 'paid' | 'unpaid' | 'debt';
    payType: PaymentMethod;
    /** Yakunlanganda izohga yoziladigan muolajalar */
    items: DemoItem[];
    /** Vaqti hali uzoq bo'lganda holati */
    initial: 'Pending' | 'Confirmed';
    /** Vaqtidan oldinroq kelib, navbatda kutadi */
    early: boolean;
}

/** Bugungi kun: qabul rejalari va demo o'zi qo'ygan oxirgi holatlar */
export interface DemoDayState {
    date: string;
    plan: Record<string, DemoSlot>;
    /** Qabul id → demo qo'ygan "holat|vaqt|shifokor". Farq qilsa — foydalanuvchi o'zgartirgan */
    auto: Record<string, string>;
    /** "Kabinetda" belgisini demo o'zi qo'ygan qabullar */
    autoChair: Record<string, true>;
}

interface PlannedSlot extends DemoSlot { patient: Patient; serviceId: number; note: string }

const GAPS = [0, 0, 5, 10, 10, 15, 20, 30, -10, -15];

function toothOf(r: () => number, kid: boolean): number {
    const quadrant = 1 + Math.floor(r() * 4);
    return kid ? (quadrant + 4) * 10 + 1 + Math.floor(r() * 5) : quadrant * 10 + weighted(r, [[6, 4], [7, 3], [5, 2], [4, 1.5], [1, 1], [2, 1], [3, 0.5], [8, 1]] as [number, number][]);
}

/**
 * Bir kunning jadvali. `nowMin` faqat bugun uchun beriladi: demo kechqurun yoki erta
 * tongda ochilsa, ikki shifokor ish vaqtini hozirgi soatgacha cho'zadi — bosh sahifada
 * har doim kimdir kabinetda bo'lsin.
 */
function planDay(date: string, offset: number, pool: { patients: Patient[]; meta: Map<string, PatientMeta> }, nowMin?: number): PlannedSlot[] {
    const r = rngOf(`demo-day-${date}`);
    const [y, m, d] = date.split('-').map(Number);
    const sunday = new Date(y, m - 1, d).getDay() === 0;
    const density = offset < 0 ? 0.86 : offset === 0 ? 1 : Math.max(0.3, 0.92 - offset * 0.09);
    const onDuty = PROFILES.filter(p => (sunday ? p.sunday : p.hours));
    const lateTwo = new Set([...onDuty].sort((a, b) => Number(!!b.late) - Number(!!a.late)).slice(0, 2).map(p => p.doctor.id));
    const earlyTwo = new Set([...onDuty].sort((a, b) => Number(!!b.early) - Number(!!a.early)).slice(0, 2).map(p => p.doctor.id));

    const byPrimary = new Map<string, Patient[]>();
    const adults: Patient[] = [];
    const kids: Patient[] = [];
    for (const p of pool.patients) {
        const info = pool.meta.get(p.id)!;
        if (info.isNew && offset < 0) continue;
        (info.kid ? kids : adults).push(p);
        if (!byPrimary.has(info.primary)) byPrimary.set(info.primary, []);
        byPrimary.get(info.primary)!.push(p);
    }
    const used = new Set<string>();
    const choosePatient = (profile: Profile): Patient | null => {
        const own = byPrimary.get(profile.doctor.id) || [];
        const any = profile.kids ? kids : adults;
        for (let k = 0; k < 30; k++) {
            const list = own.length && r() < 0.6 ? own : any;
            const p = pick(r, list);
            if (!p || used.has(p.id)) continue;
            used.add(p.id);
            return p;
        }
        return null;
    };

    const out: PlannedSlot[] = [];
    for (const profile of onDuty) {
        let [from, to] = (sunday ? profile.sunday : profile.hours)!;
        if (nowMin !== undefined) {
            if (lateTwo.has(profile.doctor.id) && nowMin > to - 90) to = Math.min(LAST_SLOT_END, Math.max(to, nowMin + 150));
            if (earlyTwo.has(profile.doctor.id) && nowMin < from + 60) from = Math.max(FIRST_SLOT_START, Math.min(from, Math.floor((nowMin - 120) / 5) * 5));
        }
        let t = from + pick(r, [0, 0, 10, 20]);
        for (;;) {
            if (t >= LUNCH_FROM && t < LUNCH_TO && from < LUNCH_FROM && to > LUNCH_TO) t = LUNCH_TO + pick(r, [0, 10]);
            const serviceId = weighted(r, profile.mix);
            const service = SERVICE_BY_ID.get(serviceId)!;
            const duration = service.duration || 30;
            if (t + duration > to) break;
            const take = r() < density;
            // Tasodifiy sonlar har qatorda bir xil tartibda olinadi — kun jadvali barqaror bo'lsin
            const fateRoll = r();
            const payRoll = r();
            const typeRoll = r();
            const statusRoll = r();
            const earlyRoll = r();
            const noteRoll = r();
            if (take) {
                const patient = choosePatient(profile);
                if (patient) {
                    const kid = pool.meta.get(patient.id)!.kid;
                    const items: DemoItem[] = [{ name: service.name, price: service.price, ...(TOOTH_SERVICES.has(serviceId) ? { tooth: toothOf(r, kid) } : {}) }];
                    if (serviceId === 3 && r() < 0.18) items.push({ name: service.name, price: service.price, tooth: toothOf(r, kid) });
                    if (!profile.kids && TOOTH_SERVICES.has(serviceId) && r() < 0.3) items.push({ name: 'Dental rentgen', price: 40000 });
                    const fate: DemoSlot['fate'] = fateRoll < 0.035 ? 'noshow' : fateRoll < 0.055 ? 'cancel' : 'done';
                    // Olinmagan pul: bugun bir-ikkitasi, o'tgan haftada — sanoqli, eskilari to'langan
                    let pay: DemoSlot['pay'] = 'paid';
                    if (offset === 0) pay = payRoll < 0.07 ? 'unpaid' : payRoll < 0.09 ? 'debt' : 'paid';
                    else if (offset >= -7) pay = payRoll < 0.02 ? 'unpaid' : payRoll < 0.028 ? 'debt' : 'paid';
                    else if (offset >= -21) pay = payRoll < 0.006 ? 'debt' : 'paid';
                    if (pay === 'debt' && items.reduce((s, i) => s + i.price, 0) < 100000) pay = 'paid';
                    const payType: PaymentMethod = typeRoll < 0.5 ? 'Cash' : typeRoll < 0.8 ? 'Card' : 'Click';
                    const pendingShare = offset === 1 ? 0.55 : offset > 1 ? 0.45 : 0.35;
                    out.push({
                        doctorId: profile.doctor.id, start: t, duration, fate, pay, payType, items,
                        initial: statusRoll < pendingShare ? 'Pending' : 'Confirmed',
                        early: offset === 0 && earlyRoll < 0.35,
                        patient, serviceId,
                        note: noteRoll < 0.15 ? pick(r, COMPLAINTS) : '',
                    });
                }
            }
            t = Math.max(from, Math.round((t + duration + pick(r, GAPS)) / 5) * 5);
        }
    }
    return out.sort((a, b) => a.start - b.start || a.doctorId.localeCompare(b.doctorId));
}

// ── Holat va to'lov ──────────────────────────────────────────────────────────

const sigOf = (a: Pick<Appointment, 'status' | 'time' | 'doctorId'>) => `${a.status}|${a.time}|${a.doctorId}`;

export const notesDone = (items: DemoItem[]) =>
    'Bajarilgan ishlar:\n' + items.map(i => `- ${i.name} (${i.tooth ? `Tish #${i.tooth}` : 'Umumiy'}) [${money(i.price)} UZS]`).join('\n');

interface Expect { status: Appointment['status']; since?: number; doneAt?: number }

const upcoming = (s: DemoSlot, nowMin: number): Appointment['status'] => (s.start - nowMin <= 60 ? 'Confirmed' : s.initial);

/**
 * Bugungi qabullar hozir qanday holatda bo'lishi kerak. Har shifokor bemorlarni ketma-ket
 * qabul qiladi: oldingisi cho'zilsa, keyingisi navbatda kutadi. Kelmagan bemor 20 daqiqadan
 * keyin "Kelmadi" bo'ladi va kabinetni band qilmaydi.
 */
function expectedAt(plan: Record<string, DemoSlot>, nowMin: number): Map<string, Expect> {
    const out = new Map<string, Expect>();
    const byDoctor = new Map<string, [string, DemoSlot][]>();
    for (const [id, s] of Object.entries(plan)) {
        if (!byDoctor.has(s.doctorId)) byDoctor.set(s.doctorId, []);
        byDoctor.get(s.doctorId)!.push([id, s]);
    }
    for (const list of byDoctor.values()) {
        list.sort((a, b) => a[1].start - b[1].start);
        let free = 0;
        for (const [id, s] of list) {
            if (s.fate === 'cancel') { out.set(id, { status: 'Cancelled' }); continue; }
            if (s.fate === 'noshow') {
                out.set(id, { status: nowMin >= s.start + 20 ? 'No-Show' : upcoming(s, nowMin) });
                continue;
            }
            const begin = Math.max(s.start, free);
            const end = begin + s.duration;
            free = end;
            if (end <= nowMin) out.set(id, { status: 'Completed', doneAt: end });
            else if (begin <= nowMin) out.set(id, { status: 'Checked-In', since: begin });
            else if (s.start <= nowMin || (s.early && s.start - nowMin <= 20)) out.set(id, { status: 'Checked-In' });
            else out.set(id, { status: upcoming(s, nowMin) });
        }
    }
    return out;
}

/** Yakunlangan qabul uchun kassa yozuvlari (to'lov oynasi yozadigan ko'rinishda) */
function paymentRecords(a: Appointment, s: DemoSlot, doneAt: number): Transaction[] {
    if (s.pay === 'unpaid') return [];
    const total = s.items.reduce((acc, i) => acc + i.price, 0);
    const service = [...new Set(s.items.map(i => i.name))].join(', ');
    const doc = DOCTOR_BY_ID.get(a.doctorId);
    const base = {
        patientId: a.patientId, patientName: a.patientName, date: a.date, clinicId: CLINIC,
        doctorId: a.doctorId, doctorName: doc ? `${doc.lastName} ${doc.firstName}` : a.doctorName,
        discountPercent: 0, discountAmount: 0, createdAt: stamp(a.date, doneAt + 4),
    };
    if (s.pay === 'debt') {
        const part = Math.round(total / 2 / 10000) * 10000;
        return [
            { ...base, id: `demo-tx-${a.id}`, amount: part, type: s.payType, service: `${service} (Qisman to'lov)`, status: 'Paid' },
            { ...base, id: `demo-tx-${a.id}-q`, amount: total - part, type: s.payType, service: `${service} (Qarz)`, status: 'Pending', isDebt: true },
        ];
    }
    return [{ ...base, id: `demo-tx-${a.id}`, amount: total, type: s.payType, service, status: 'Paid' }];
}

const slotOf = (p: PlannedSlot): DemoSlot => ({
    doctorId: p.doctorId, start: p.start, duration: p.duration, fate: p.fate, pay: p.pay,
    payType: p.payType, items: p.items, initial: p.initial, early: p.early,
});

// ── To'liq demo ──────────────────────────────────────────────────────────────

export interface DemoSeed {
    clinicHours: { startHour: number; endHour: number };
    doctors: Doctor[];
    receptionists: Receptionist[];
    services: Service[];
    patients: Patient[];
    appointments: Appointment[];
    transactions: Transaction[];
    expenses: Expense[];
    leads: Lead[];
    recalls: Recall[];
    installments: InstallmentPlan[];
    labOrders: LabOrder[];
    messageLogs: MessageLog[];
    inventory: InventoryItem[];
    inventoryLogs: InventoryLog[];
    day: DemoDayState;
    /** Bugun kabinetdagilar (bosh sahifa xaritasi) */
    flow: FlowLog;
}

export function buildDemoSeed(now: Date): DemoSeed {
    const today = formatDateToISO(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const pool = buildPool(now.getFullYear());
    const patients = pool.patients.map(p => ({ ...p }));
    const patientById = new Map(patients.map(p => [p.id, p]));
    const nameOf = (p: Patient) => `${p.lastName} ${p.firstName}`;

    // Bugun tug'ilgan kun — qo'ng'iroqlar ro'yxatida tabrik chiqsin (bitta katta, bitta bola)
    for (const id of ['demo-patient-7', 'demo-patient-42']) {
        const p = patientById.get(id)!;
        p.dob = `${p.dob.slice(0, 4)}-${today.slice(5)}`;
    }

    const appointments: Appointment[] = [];
    const transactions: Transaction[] = [];
    const day: DemoDayState = { date: today, plan: {}, auto: {}, autoChair: {} };
    const flow: FlowLog = {};
    const lastDone = new Map<string, { date: string; slot: PlannedSlot }>();
    let dayStart = 8 * 60;
    let dayEnd = 20 * 60;

    for (let offset = -HISTORY_DAYS; offset <= FUTURE_DAYS; offset++) {
        const date = formatDateToISO(dayAt(now, offset));
        const slots = planDay(date, offset, pool, offset === 0 ? nowMin : undefined);
        const expected = offset === 0
            ? expectedAt(Object.fromEntries(slots.map((s, i) => [`k${i}`, slotOf(s)])), nowMin)
            : null;
        slots.forEach((s, i) => {
            const id = `demo-appt-${date.replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`;
            let status: Appointment['status'];
            let exp: Expect | undefined;
            if (offset < 0) status = s.fate === 'noshow' ? 'No-Show' : s.fate === 'cancel' ? 'Cancelled' : 'Completed';
            else if (offset === 0) { exp = expected!.get(`k${i}`)!; status = exp.status; }
            else status = s.initial;
            const appt: Appointment = {
                id, patientId: s.patient.id, patientName: nameOf(s.patient), doctorId: s.doctorId,
                doctorName: `Dr. ${DOCTOR_BY_ID.get(s.doctorId)!.lastName}`, type: SERVICE_BY_ID.get(s.serviceId)!.name,
                date, time: hhmm(s.start), duration: s.duration, status,
                notes: status === 'Completed' ? notesDone(s.items) : s.note, clinicId: CLINIC,
            };
            appointments.push(appt);
            if (status === 'Completed') {
                transactions.push(...paymentRecords(appt, s, exp?.doneAt ?? s.start + s.duration));
                if (offset < 0) lastDone.set(s.patient.id, { date, slot: s });
                const p = patientById.get(s.patient.id)!;
                if (p.lastVisit === 'Never' || p.lastVisit < date) p.lastVisit = date;
            }
            if (offset === 0) {
                day.plan[id] = slotOf(s);
                day.auto[id] = sigOf(appt);
                if (exp!.since !== undefined) {
                    flow[id] = { in: stamp(date, exp!.since), by: 'Demo' };
                    day.autoChair[id] = true;
                }
                dayStart = Math.min(dayStart, s.start);
                dayEnd = Math.max(dayEnd, s.start + s.duration);
            }
        });
    }

    const at = (offset: number) => formatDateToISO(dayAt(now, offset));
    const ref = (p: Patient) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, phone: p.phone });
    const P = (n: number) => patientById.get(`demo-patient-${n}`)!;

    // ── Nazoratga chaqirish: oxirgi tashrifi o'tgan, oldinda qabuli yo'q bemorlar ──
    const booked = new Set(appointments
        .filter(a => a.date >= today && ['Pending', 'Confirmed', 'Checked-In'].includes(a.status))
        .map(a => a.patientId));
    const rr = rngOf(`demo-recalls-${today}`);
    const candidates = [...lastDone.entries()].filter(([pid]) => !booked.has(pid));
    const recalls: Recall[] = [];
    [-2, 0, 2, 4, 7, 11].forEach((dueOffset, k) => {
        if (!candidates.length) return;
        const [pid, last] = candidates.splice(Math.floor(rr() * candidates.length), 1)[0];
        const item = last.slot.items[0];
        const p = patientById.get(pid)!;
        recalls.push({
            id: `demo-recall-${k + 1}`, clinicId: CLINIC, patientId: pid, doctorId: last.slot.doctorId,
            dueDate: at(dueOffset), reason: `${item.name}${item.tooth ? ` #${item.tooth}` : ''}`,
            status: k === 2 ? 'reminded' : 'planned', kind: last.slot.serviceId === 8 ? 'treatment' : 'checkup',
            createdAt: stamp(last.date, 18 * 60), updatedAt: stamp(last.date, 18 * 60),
            patient: { ...ref(p), doctorId: last.slot.doctorId },
        });
    });

    // ── Bo'lib to'lash ──
    const installments: InstallmentPlan[] = [];
    const addInstallment = (id: string, p: Patient, doctorId: string, service: string, total: number, first: number, startOffset: number, items: [number, number, boolean][]) => {
        const paidItems = items.filter(([, , paid]) => paid);
        const totalPaid = first + paidItems.reduce((s, [, amount]) => s + amount, 0);
        installments.push({
            id, patientId: p.id, clinicId: CLINIC, doctorId, service, totalAmount: total, totalPaid,
            startDate: at(startOffset), endDate: at(items[items.length - 1][0]), status: 'Active',
            createdAt: stamp(at(startOffset), 11 * 60),
            items: items.map(([dueOffset, amount, paid], k): InstallmentItem => ({
                id: `${id}-${k + 1}`, planId: id, expectedDate: at(dueOffset), amount,
                status: paid ? 'Paid' : 'Pending', ...(paid ? { paidDate: at(dueOffset) } : {}),
            })),
        });
        const doc = DOCTOR_BY_ID.get(doctorId)!;
        paidItems.forEach(([dueOffset, amount], k) => transactions.push({
            id: `${id}-tx-${k + 1}`, patientId: p.id, patientName: nameOf(p), clinicId: CLINIC, doctorId,
            doctorName: `${doc.lastName} ${doc.firstName}`, amount, date: at(dueOffset), type: 'Card',
            service: `Bo'lib to'lash (${service})`, status: 'Paid', createdAt: stamp(at(dueOffset), 12 * 60),
        }));
    };
    addInstallment('demo-ins-1', P(12), 'demo-doctor-2', 'Breket tizimi', 5000000, 1000000, -70, [[-40, 800000, true], [-10, 800000, true], [20, 800000, false], [50, 800000, false], [80, 800000, false]]);
    addInstallment('demo-ins-2', P(25), 'demo-doctor-3', "Implant o'rnatish", 4500000, 1500000, -35, [[-5, 1000000, false], [25, 1000000, false], [55, 1000000, false]]);

    // ── Laboratoriya ──
    const lab = (id: string, p: Patient, doctorId: string, techId: string, tech: string, orderType: string, material: string, teeth: string, status: LabOrder['status'], priority: LabOrder['priority'], orderedOffset: number, deadlineOffset: number, price: number): LabOrder => ({
        id, patientName: nameOf(p), doctorName: `Dr. ${DOCTOR_BY_ID.get(doctorId)!.lastName}`, technicianId: techId, technicianName: tech,
        clinicId: CLINIC, orderType, material, toothNumbers: teeth, status, priority,
        orderedAt: stamp(at(orderedOffset), 11 * 60), deadline: at(deadlineOffset), price,
    });
    const labOrders: LabOrder[] = [
        lab('demo-order-1', P(31), 'demo-doctor-3', 'demo-tech-1', 'Karimov Farhod', 'Koronka', 'Metallkeramika', '36', 'Ready', 'Normal', -6, -1, 450000),
        lab('demo-order-2', P(44), 'demo-doctor-1', 'demo-tech-2', 'Nazarova Zuhra', 'Veneer', 'E-max (litiy disilikat)', '11, 21', 'In-Progress', 'Urgent', -4, 0, 2400000),
        lab('demo-order-3', P(53), 'demo-doctor-1', 'demo-tech-1', 'Karimov Farhod', 'Koronka', 'Sirkoniy', '46', 'In-Progress', 'Normal', -2, 3, 900000),
        lab('demo-order-4', P(67), 'demo-doctor-2', 'demo-tech-2', 'Nazarova Zuhra', 'Breket apparati', 'Metall', '', 'Pending', 'Normal', 0, 7, 1500000),
    ];

    // ── Lidlar ──
    const lead = (n: number, name: string, service: string, source: string, status: Lead['status'], createdAt: string, notes = ''): Lead => ({
        id: `demo-lead-${n}`, name, phone: phoneOf(8000 + n), service, source, notes, status, createdAt, updatedAt: createdAt, clinicId: CLINIC,
    });
    const leads: Lead[] = [
        lead(1, 'Nilufar Hamidova', 'Implantatsiya', 'Instagram', 'New', stamp(today, nowMin - 35), "Narxini so'radi"),
        lead(2, 'Sherzod Valiyev', 'Breket', 'Telegram', 'New', stamp(at(-1), 18 * 60 + 10)),
        lead(3, 'Madina Sharipova', 'Tish oqartirish', 'Facebook', 'Thinking', stamp(at(-2), 12 * 60)),
        lead(4, 'Gulnora Qosimova', 'Implantatsiya', 'Instagram', 'Contacted', stamp(at(-3), 16 * 60)),
        lead(5, 'Bobur Olimov', 'Konsultatsiya', 'Sayt', 'Booked', stamp(at(-5), 10 * 60)),
    ];

    // ── Xarajatlar: shu va o'tgan oy ──
    const expenses: Expense[] = [];
    const monthDay = (monthsBack: number, dayOfMonth: number) => formatDateToISO(new Date(now.getFullYear(), now.getMonth() - monthsBack, dayOfMonth));
    const expense = (id: string, date: string, amount: number, category: Expense['category'], title: string, method: PaymentMethod, extra: Partial<Expense> = {}) => {
        if (date <= today) expenses.push({ id, date, amount, category, title, method, clinicId: CLINIC, ...extra });
    };
    [1, 0].forEach(back => {
        expense(`demo-exp-rent-${back}`, monthDay(back, 1), 8000000, 'Rent', 'Ijara', 'Transfer');
        expense(`demo-exp-util-${back}`, monthDay(back, 5), 1150000, 'Utilities', "Kommunal to'lovlar", 'Card');
        expense(`demo-exp-salary-${back}`, monthDay(back, 10), 4500000, 'Salary', 'Qabulxona oyligi', 'Cash', { receptionistId: 'demo-rec-1' });
    });
    const supplies: [number, number, string][] = [[-2, 1200000, 'Ombor: kompozit material'], [-9, 650000, 'Ombor: anestetiklar'], [-16, 380000, "Ombor: qo'lqop va niqob"], [-23, 3600000, 'Ombor: implantlar']];
    supplies.forEach(([offset, amount, title], k) => expense(`demo-exp-inv-${k}`, at(offset), amount, 'Inventory', title, 'Transfer'));
    expense('demo-exp-lab-1', at(-6), 450000, 'Lab', 'Laboratoriya: koronka', 'Cash');
    expense('demo-exp-lab-2', at(-13), 1200000, 'Lab', 'Laboratoriya: veneer', 'Cash');
    expense('demo-exp-other-1', at(-4), 180000, 'Other', 'Mehmonlar uchun choy va suv', 'Cash');

    // ── Xabarlar tarixi: kechagi eslatmalar va bugungi tabrik ──
    const messageLogs: MessageLog[] = [];
    const remindedToday = appointments.filter(a => a.date === today && a.status !== 'Cancelled').slice(0, 7);
    remindedToday.forEach((a, k) => {
        const p = patientById.get(a.patientId)!;
        const channel = p.telegramChatId && k % 3 !== 0 ? 'telegram' : 'sms';
        const failed = k === 4;
        messageLogs.push({
            id: `demo-msg-${k + 1}`, clinicId: CLINIC, patientId: p.id, type: 'Reminder',
            status: failed ? 'Failed' : 'Sent', ...(failed ? { error: "Raqam faol emas" } : {}),
            message: `Hurmatli ${p.firstName}, ertaga soat ${a.time} da qabulingiz bor. Demo Stomatologiya`,
            sentAt: stamp(at(-1), 18 * 60 + k * 2), channel, source: 'auto',
            recipient: channel === 'telegram' ? p.telegramChatId : p.phone, patient: ref(p),
        });
    });
    const bday = P(7);
    messageLogs.push({
        id: 'demo-msg-bday', clinicId: CLINIC, patientId: bday.id, type: 'Birthday', status: 'Sent',
        message: `Hurmatli ${bday.firstName}, tug'ilgan kuningiz bilan! Demo Stomatologiya jamoasi`,
        sentAt: stamp(today, 9 * 60), channel: 'sms', source: 'birthday', recipient: bday.phone, patient: ref(bday),
    });
    messageLogs.sort((a, b) => b.sentAt.localeCompare(a.sentAt));

    // ── Ombor ──
    const item = (n: number, name: string, unit: string, quantity: number, minQuantity: number): InventoryItem => ({
        id: `demo-item-${n}`, name, unit, quantity, minQuantity, clinicId: CLINIC,
        createdAt: stamp(at(-30), 10 * 60), updatedAt: stamp(at(-(n % 5)), 17 * 60),
    });
    const inventory: InventoryItem[] = [
        item(1, 'Lidokain 2%', 'ampula', 42, 10),
        item(2, 'Paxta', 'kg', 5, 2),
        item(3, 'Shprits 2 ml', 'dona', 96, 20),
        item(4, 'Kompozit plomba (A2)', 'shprits', 4, 6),
        item(5, "Qo'lqop (M)", 'quti', 11, 5),
        item(6, 'Ftor lak', 'dona', 2, 4),
        item(7, 'Implant (Osstem)', 'dona', 6, 3),
    ];
    const invLog = (id: string, itemId: string, change: number, type: 'IN' | 'OUT', note: string, offset: number, userName: string): InventoryLog =>
        ({ id, itemId, change, type, note, date: stamp(at(offset), 12 * 60), userName });
    const inventoryLogs: InventoryLog[] = [
        invLog('demo-log-1', 'demo-item-4', 10, 'IN', 'Xarid', -2, 'Demo Admin'),
        invLog('demo-log-2', 'demo-item-1', 50, 'IN', 'Xarid', -9, 'Demo Admin'),
        invLog('demo-log-3', 'demo-item-5', 10, 'IN', 'Xarid', -16, 'Demo Admin'),
        invLog('demo-log-4', 'demo-item-7', 8, 'IN', 'Xarid', -23, 'Demo Admin'),
        invLog('demo-log-5', 'demo-item-7', 2, 'OUT', "Implant o'rnatish", -3, 'Dr. Yusupov'),
        invLog('demo-log-6', 'demo-item-1', 8, 'OUT', 'Muolajalar', -1, 'Dr. Ahmedova'),
    ];

    const receptionists: Receptionist[] = [
        { id: 'demo-rec-1', firstName: 'Nodira', lastName: 'Qosimova', phone: phoneOf(9005), username: 'nodira', status: 'Active', clinicId: CLINIC },
    ];

    return {
        // Kalendar to'ri bugungi jadvalni to'liq sig'dirsin (kechqurun cho'zilgan smena ham)
        clinicHours: { startHour: Math.max(0, Math.min(8, Math.floor(dayStart / 60))), endHour: Math.min(23, Math.max(20, Math.ceil(dayEnd / 60))) },
        doctors: PROFILES.map(p => ({ ...p.doctor })),
        receptionists,
        services: DEMO_SERVICE_LIST.map(s => ({ ...s })),
        patients,
        appointments,
        transactions,
        expenses,
        leads,
        recalls,
        installments,
        labOrders,
        messageLogs,
        inventory,
        inventoryLogs,
        day,
        flow,
    };
}

// ── Kun davomida ─────────────────────────────────────────────────────────────

export interface DemoLiveState {
    day: DemoDayState;
    appointments: Appointment[];
    transactions: Transaction[];
    patients: Patient[];
    /** Bugungi "kabinetda" belgilari — joyida yangilanadi */
    flow: FlowLog;
}

const minutesOfTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

/**
 * Kechki smena. Demo kunduzi qurilib, kechqurun yana ochilsa, klinika bo'shab qolmasin:
 * "kechki" ikki shifokor bo'shashiga bir yarim soat qolganda unga navbatdagi qabullar
 * qo'shiladi (xuddi kun davomida yangi bemorlar yozilgandek). Jadval shifokorning oxirgi
 * qabulidan hosil bo'ladi — qayta chaqirilganda takror qabul ochilmaydi.
 */
function extendEvening(live: DemoLiveState, nowMin: number): boolean {
    const date = live.day.date;
    if (nowMin >= LAST_SLOT_END - 30) return false;
    const [y, m, d] = date.split('-').map(Number);
    const sunday = new Date(y, m - 1, d).getDay() === 0;
    const onDuty = PROFILES.filter(p => (sunday ? p.sunday : p.hours));
    const lateTwo = [...onDuty].sort((a, b) => Number(!!b.late) - Number(!!a.late)).slice(0, 2);
    const todays = live.appointments.filter(a => a.date === date && a.status !== 'Cancelled');
    const busy = new Set(todays.map(a => a.patientId));
    const taken = new Set(live.appointments.filter(a => a.date === date).map(a => a.id));
    const ymd = date.replace(/-/g, '');
    let changed = false;
    for (const profile of lateTwo) {
        const doctorId = profile.doctor.id;
        const lastEnd = todays.filter(a => a.doctorId === doctorId)
            .reduce((mx, a) => Math.max(mx, minutesOfTime(a.time) + (a.duration || 30)), 0);
        if (nowMin <= lastEnd - 90 || lastEnd >= LAST_SLOT_END - 20) continue;
        const r = rngOf(`demo-evening-${date}-${doctorId}-${lastEnd}`);
        const to = Math.min(LAST_SLOT_END, nowMin + 150);
        const own = live.patients.filter(p => p.doctorId === doctorId);
        const adults = live.patients.filter(p => p.doctorId !== 'demo-doctor-4');
        let t = Math.max(lastEnd + pick(r, [0, 10, 15]), Math.round((nowMin - 60) / 5) * 5);
        for (;;) {
            const serviceId = weighted(r, profile.mix);
            const service = SERVICE_BY_ID.get(serviceId)!;
            const duration = service.duration || 30;
            if (t + duration > to) break;
            let patient: Patient | undefined;
            for (let k = 0; k < 30 && !patient; k++) {
                const p = pick(r, own.length && r() < 0.6 ? own : adults);
                if (p && !busy.has(p.id)) patient = p;
            }
            if (!patient) break;
            busy.add(patient.id);
            let n = 1;
            while (taken.has(`demo-appt-${ymd}-e${n}`)) n++;
            const id = `demo-appt-${ymd}-e${n}`;
            taken.add(id);
            const items: DemoItem[] = [{ name: service.name, price: service.price, ...(TOOTH_SERVICES.has(serviceId) ? { tooth: toothOf(r, false) } : {}) }];
            const payRoll = r();
            const typeRoll = r();
            const appt: Appointment = {
                id, patientId: patient.id, patientName: `${patient.lastName} ${patient.firstName}`, doctorId,
                doctorName: `Dr. ${profile.doctor.lastName}`, type: service.name, date, time: hhmm(t), duration,
                status: 'Confirmed', notes: '', clinicId: CLINIC,
            };
            live.appointments.push(appt);
            live.day.plan[id] = {
                doctorId, start: t, duration, fate: 'done', pay: payRoll < 0.07 ? 'unpaid' : 'paid',
                payType: typeRoll < 0.5 ? 'Cash' : typeRoll < 0.8 ? 'Card' : 'Click', items,
                initial: 'Confirmed', early: r() < 0.35,
            };
            live.day.auto[id] = sigOf(appt);
            changed = true;
            t = Math.round((t + duration + pick(r, GAPS)) / 5) * 5;
        }
    }
    return changed;
}

/**
 * Bugungi kunni hozirgi soatga yetkazadi: vaqti kelgan bemor kabinetga kiradi, qabuli
 * tugagani yakunlanadi va to'lanadi. Faqat demo o'zi qo'ygan holatdagi qabullar yuritiladi —
 * foydalanuvchi o'zgartirgan qabulga (holat, vaqt, shifokor, "Kirdi") boshqa tegilmaydi.
 *
 * Qabul obyekti joyida o'zgartirilmaydi, almashtiriladi: ilova holati eski obyektni ushlab
 * turadi va yangilanishni shundan sezadi. Nimadir o'zgargan bo'lsa true.
 */
export function advanceDemoDay(live: DemoLiveState, now: Date): boolean {
    const { day } = live;
    if (day.date !== formatDateToISO(now)) return false;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let changed = extendEvening(live, nowMin);
    const index = new Map(live.appointments.map((a, i) => [a.id, i]));
    const forget = (id: string) => {
        delete day.plan[id];
        delete day.auto[id];
        delete day.autoChair[id];
        changed = true;
    };
    for (const id of Object.keys(day.plan)) {
        const i = index.get(id);
        if (i === undefined) { forget(id); continue; }
        if (day.auto[id] !== sigOf(live.appointments[i]) || !!live.flow[id] !== !!day.autoChair[id]) forget(id);
    }
    for (const [id, e] of expectedAt(day.plan, nowMin)) {
        const i = index.get(id)!;
        const a = live.appointments[i];
        const s = day.plan[id];
        if (e.status !== a.status) {
            const next: Appointment = { ...a, status: e.status, ...(e.status === 'Completed' ? { notes: notesDone(s.items) } : {}) };
            live.appointments[i] = next;
            day.auto[id] = sigOf(next);
            changed = true;
            // Foydalanuvchi o'zi to'lov olgan bo'lsa — ikkinchisi yozilmaydi
            if (e.status === 'Completed' && !live.transactions.some(t => t.patientId === a.patientId && t.date === a.date)) {
                live.transactions.push(...paymentRecords(next, s, e.doneAt ?? nowMin));
            }
        }
        if (e.since !== undefined && !live.flow[id]) {
            live.flow[id] = { in: stamp(a.date, e.since), by: 'Demo' };
            day.autoChair[id] = true;
            changed = true;
        } else if (e.since === undefined && day.autoChair[id]) {
            delete live.flow[id];
            delete day.autoChair[id];
            changed = true;
        }
    }
    return changed;
}
