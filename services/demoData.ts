import { Patient, Appointment, Transaction, Expense, Doctor, Receptionist, Service, Clinic, SubscriptionPlan, InventoryItem, InventoryLog, ServiceCategory, PatientDiagnosis, Lead, InstallmentPlan, LabTechnician, LabOrder, MessageTemplate, AutomationRule, MessageLog, TriggerDescriptor, SegmentFieldDescriptor, Recall, FlowLog, TicketLog, UserRole } from '../types';
import { formatDateToISO } from '../utils/dateUtils';
import { advanceDemoDay, buildDemoSeed, DEMO_SEED_VERSION, DemoDayState } from './demoSeed';

/**
 * Demo rejim ma'lumotlari. Demo butunlay brauzerda ishlaydi: services/api.ts dagi demo
 * tarmoqlari shu massivlar bilan ishlaydi, serverga ham, bazaga ham hech narsa yozilmaydi.
 *
 * Ma'lumot har kuni shu kunga moslab quriladi (services/demoSeed.ts) — bosh sahifada har
 * doim bir nechta shifokorning qabullari bor. Kun davomidagi o'zgarishlar brauzerda
 * saqlanadi, ertasi kuni demo yangidan boshlanadi. Oddiy (demo bo'lmagan) sessiyada bu
 * yerda hech narsa qurilmaydi.
 */

// --- PERSISTENCE HELPERS ---
const STORAGE_KEY = 'dentalflow_demo_data';

export const loadDemoData = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('❌ Failed to load demo data', e);
    }
    return null;
};

/** Demo sessiya ochiqmi — api.ts dagi isDemoMode bilan bir xil (aylanma import bo'lmasin) */
const demoSessionActive = (): boolean => {
    try {
        const raw = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        return !!raw && JSON.parse(raw).isDemo === true;
    } catch {
        return false;
    }
};

// --- O'ZGARMAS QISMLAR (har kuni shu holatdan boshlanadi) ---

const baseClinic = (): Clinic => ({
    id: 'demo-clinic-1',
    name: 'Demo Stomatologiya',
    adminName: 'Demo Admin',
    username: 'demoklinikaadmin',
    phone: '+998 00 123 45 67',
    status: 'Active',
    planId: 'pro',
    subscriptionStartDate: new Date('2024-01-01').toISOString(),
    expiryDate: new Date('2030-12-31').toISOString(),
    monthlyRevenue: 0,
    subscriptionType: 'Paid',
    botToken: '',
    startHour: 8,
    endHour: 20
});

const baseCategories = (): ServiceCategory[] => [
    { id: 'cat-1', name: 'Konsultatsiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-2', name: 'Gigiena va Profilaktika', clinicId: 'demo-clinic-1' },
    { id: 'cat-3', name: 'Terapiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-4', name: 'Jarrohlik', clinicId: 'demo-clinic-1' },
    { id: 'cat-5', name: 'Ortodontiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-6', name: 'Protezlash', clinicId: 'demo-clinic-1' },
];

const baseTemplates = (): MessageTemplate[] => [
    {
        id: 'demo-tpl-1',
        clinicId: 'demo-clinic-1',
        name: 'Qabul eslatmasi',
        text: "Hurmatli {bemor_ismi}, qabulingiz {sana} kuni {vaqt} da. {klinika_nomi}",
        createdAt: new Date('2026-01-10').toISOString(),
    },
];

const baseRules = (): AutomationRule[] => [
    {
        id: 'demo-rule-1',
        clinicId: 'demo-clinic-1',
        name: 'Qabuldan 2 soat oldin eslatma',
        templateId: 'demo-tpl-1',
        trigger: 'before_appointment',
        hoursBefore: 2,
        channel: 'telegram',
        doctorId: null,
        active: true,
        createdAt: new Date('2026-01-10').toISOString(),
    },
];

const baseTechnicians = (): LabTechnician[] => [
    {
        id: 'demo-tech-1',
        firstName: 'Farhod',
        lastName: 'Karimov',
        specialty: 'Metallkeramika',
        phone: '+998 00 999 88 77',
        status: 'Active',
        clinicId: 'demo-clinic-1'
    },
    {
        id: 'demo-tech-2',
        firstName: 'Zuhra',
        lastName: 'Nazarova',
        specialty: 'Veneer / E-max',
        phone: '+998 00 777 66 55',
        status: 'Active',
        clinicId: 'demo-clinic-1'
    }
];

// --- MA'LUMOTLAR (ensureDemoData to'ldiradi) ---

export let DEMO_CLINIC: Clinic = baseClinic();
export let DEMO_CLINICS: Clinic[] = [DEMO_CLINIC];
export let DEMO_RECEPTIONISTS: Receptionist[] = [];
export let DEMO_TEETH: any[] = [];
export let DEMO_DIAGNOSES: PatientDiagnosis[] = [];
export let DEMO_DOCTORS: Doctor[] = [];
export let DEMO_CATEGORIES: ServiceCategory[] = baseCategories();
export let DEMO_SERVICES: Service[] = [];
export let DEMO_PATIENTS: Patient[] = [];
export let DEMO_APPOINTMENTS: Appointment[] = [];
export let DEMO_TRANSACTIONS: Transaction[] = [];
export let DEMO_EXPENSES: Expense[] = [];
export let DEMO_MESSAGE_TEMPLATES: MessageTemplate[] = baseTemplates();
export let DEMO_AUTOMATION_RULES: AutomationRule[] = baseRules();
export let DEMO_MESSAGE_LOGS: MessageLog[] = [];
export let DEMO_INVENTORY: InventoryItem[] = [];
export let DEMO_INVENTORY_LOGS: InventoryLog[] = [];
export let DEMO_LEADS: Lead[] = [];
export let DEMO_INSTALLMENTS: InstallmentPlan[] = [];
export let DEMO_LAB_TECHNICIANS: LabTechnician[] = baseTechnicians();
export let DEMO_LAB_ORDERS: LabOrder[] = [];
export let DEMO_RECALLS: Recall[] = [];

/** Bugun kim kabinetda va navbat raqamlari (bosh sahifa xaritasi, Onlayn navbat) */
export interface DemoFlow { date: string; entries: FlowLog; tickets: TicketLog; seq: number }
export let DEMO_FLOW: DemoFlow = { date: '', entries: {}, tickets: {}, seq: 0 };

/** Ma'lumot qaysi kun uchun qurilgan */
let seedDay = '';
let dayState: DemoDayState | null = null;
let hydrated = false;
/** Shu sahifa ochilgandan beri ishlatilayotgan kun (yarim tunda almashsa — sahifa yangilanadi) */
let activeDay = '';

export const saveDemoData = () => {
    try {
        const data = {
            seedVersion: DEMO_SEED_VERSION,
            seedDay,
            dayState,
            flow: DEMO_FLOW,
            recalls: DEMO_RECALLS,
            patients: DEMO_PATIENTS,
            appointments: DEMO_APPOINTMENTS,
            transactions: DEMO_TRANSACTIONS,
            services: DEMO_SERVICES,
            doctors: DEMO_DOCTORS,
            receptionists: DEMO_RECEPTIONISTS,
            clinic: DEMO_CLINIC,
            clinics: DEMO_CLINICS,
            teeth: DEMO_TEETH,
            diagnoses: DEMO_DIAGNOSES,
            inventory: DEMO_INVENTORY,
            logs: DEMO_INVENTORY_LOGS,
            categories: DEMO_CATEGORIES,
            leads: DEMO_LEADS,
            installments: DEMO_INSTALLMENTS,
            labTechnicians: DEMO_LAB_TECHNICIANS,
            labOrders: DEMO_LAB_ORDERS,
            expenses: DEMO_EXPENSES,
            messageTemplates: DEMO_MESSAGE_TEMPLATES,
            automationRules: DEMO_AUTOMATION_RULES,
            messageLogs: DEMO_MESSAGE_LOGS
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('❌ Failed to save demo data', e);
    }
};

/** Brauzerda saqlangan demo'ni tiklaydi (bir marta). Eski versiyadagisi tashlab yuboriladi. */
function hydrate(): void {
    if (hydrated) return;
    hydrated = true;
    const s = loadDemoData();
    if (!s || s.seedVersion !== DEMO_SEED_VERSION || !s.seedDay || !s.dayState) return;
    seedDay = s.seedDay;
    dayState = s.dayState;
    DEMO_CLINIC = s.clinic || baseClinic();
    const clinics: Clinic[] = s.clinics || [];
    DEMO_CLINICS = clinics.length ? clinics.map(c => (c.id === DEMO_CLINIC.id ? DEMO_CLINIC : c)) : [DEMO_CLINIC];
    DEMO_RECEPTIONISTS = s.receptionists || [];
    DEMO_TEETH = s.teeth || [];
    DEMO_DIAGNOSES = s.diagnoses || [];
    DEMO_DOCTORS = s.doctors || [];
    DEMO_CATEGORIES = s.categories || baseCategories();
    DEMO_SERVICES = s.services || [];
    DEMO_PATIENTS = s.patients || [];
    DEMO_APPOINTMENTS = s.appointments || [];
    DEMO_TRANSACTIONS = s.transactions || [];
    DEMO_EXPENSES = s.expenses || [];
    DEMO_MESSAGE_TEMPLATES = s.messageTemplates || baseTemplates();
    DEMO_AUTOMATION_RULES = s.automationRules || baseRules();
    DEMO_MESSAGE_LOGS = s.messageLogs || [];
    DEMO_INVENTORY = s.inventory || [];
    DEMO_INVENTORY_LOGS = s.logs || [];
    DEMO_LEADS = s.leads || [];
    DEMO_INSTALLMENTS = s.installments || [];
    DEMO_LAB_TECHNICIANS = s.labTechnicians || baseTechnicians();
    DEMO_LAB_ORDERS = s.labOrders || [];
    DEMO_RECALLS = s.recalls || [];
    if (s.flow) DEMO_FLOW = s.flow;
}

/** Bugungi kun uchun yangi demo */
function reseed(now: Date): void {
    const seed = buildDemoSeed(now);
    DEMO_CLINIC = { ...baseClinic(), ...seed.clinicHours };
    DEMO_CLINICS = [DEMO_CLINIC];
    DEMO_RECEPTIONISTS = seed.receptionists;
    DEMO_TEETH = [];
    DEMO_DIAGNOSES = [];
    DEMO_DOCTORS = seed.doctors;
    DEMO_CATEGORIES = baseCategories();
    DEMO_SERVICES = seed.services;
    DEMO_PATIENTS = seed.patients;
    DEMO_APPOINTMENTS = seed.appointments;
    DEMO_TRANSACTIONS = seed.transactions;
    DEMO_EXPENSES = seed.expenses;
    DEMO_MESSAGE_TEMPLATES = baseTemplates();
    DEMO_AUTOMATION_RULES = baseRules();
    DEMO_MESSAGE_LOGS = seed.messageLogs;
    DEMO_INVENTORY = seed.inventory;
    DEMO_INVENTORY_LOGS = seed.inventoryLogs;
    DEMO_LEADS = seed.leads;
    DEMO_INSTALLMENTS = seed.installments;
    DEMO_LAB_TECHNICIANS = baseTechnicians();
    DEMO_LAB_ORDERS = seed.labOrders;
    DEMO_RECALLS = seed.recalls;
    DEMO_FLOW = { date: seed.day.date, entries: seed.flow, tickets: {}, seq: 0 };
    dayState = seed.day;
    seedDay = seed.day.date;
}

/**
 * Demo'ni bugungi kunga tayyorlaydi: kun almashgan (yoki hali qurilmagan) bo'lsa — yangidan
 * quradi, aks holda bugungi qabullarni hozirgi soatga yetkazadi (kimdir kabinetga kiradi,
 * kimdir yakunlanadi). O'zgarish bo'lmasa hech narsa saqlanmaydi — tez-tez chaqirsa bo'ladi.
 */
export function ensureDemoData(now: Date = new Date()): void {
    hydrate();
    const today = formatDateToISO(now);
    if (seedDay !== today || !dayState) {
        reseed(now);
        saveDemoData();
        // Sahifa yarim tundan keyin ham ochiq turgan bo'lsa: ilova holatida kechagi demo
        // qolgan — aralashib ketmasin, yangi kun toza yuklansin
        if (activeDay && activeDay !== today && typeof window !== 'undefined') window.location.reload();
        activeDay = today;
        return;
    }
    activeDay = today;
    if (advanceDemoDay({ day: dayState, appointments: DEMO_APPOINTMENTS, transactions: DEMO_TRANSACTIONS, patients: DEMO_PATIENTS, flow: demoFlowDay(today).entries }, now)) {
        // Kechki smena cho'zilgan bo'lsa — kalendar to'ri ham unga yetsin
        const lastEnd = DEMO_APPOINTMENTS
            .filter(a => a.date === today)
            .reduce((mx, a) => Math.max(mx, Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3, 5)) + (a.duration || 30)), 0);
        const endHour = Math.min(23, Math.ceil(lastEnd / 60));
        if (endHour > (DEMO_CLINIC.endHour ?? 20)) DEMO_CLINIC.endHour = endHour;
        saveDemoData();
    }
}

/** Kunning "kabinetda" belgilari; boshqa kun so'ralsa — bo'sh boshlanadi */
export const demoFlowDay = (date: string): DemoFlow => {
    if (DEMO_FLOW.date !== date) DEMO_FLOW = { date, entries: {}, tickets: {}, seq: 0 };
    return DEMO_FLOW;
};

// Demo rejim uchun trigger tavsiflari — backend/triggers.ts bilan mos
export const DEMO_TRIGGERS: TriggerDescriptor[] = [
    { id: 'before_appointment', label: 'Qabuldan oldin', respectCooldown: false, supportsDoctorFilter: true, offset: { label: 'Necha soat oldin', unit: 'hour', options: [1, 2, 3, 6, 12, 24], default: 2 } },
    { id: 'birthday', label: "Tug'ilgan kun", respectCooldown: true, supportsDoctorFilter: true },
    { id: 'no_show', label: 'Kelmagan bemor', respectCooldown: true, supportsDoctorFilter: true },
    { id: 'after_appointment', label: 'Qabuldan keyin', respectCooldown: true, supportsDoctorFilter: true, offset: { label: 'Necha soat keyin', unit: 'hour', options: [2, 4, 24, 48, 72], default: 24 } },
    { id: 'new_patient', label: "Yangi bemor ro'yxatdan o'tdi", respectCooldown: false, supportsDoctorFilter: true, offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 1 } },
    { id: 'payment_received', label: "To'lov qabul qilindi", respectCooldown: false, supportsDoctorFilter: false, offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 0 } },
    { id: 'recall', label: 'Uzoq kelmaganlarni qaytarish', respectCooldown: true, supportsDoctorFilter: true, offset: { label: 'Necha oydan beri kelmagan', unit: 'month', options: [3, 6, 9, 12], default: 6 } },
    { id: 'debt_reminder', label: 'Qarz eslatmasi', respectCooldown: true, supportsDoctorFilter: false, offset: { label: 'Qarz necha kundan beri', unit: 'day', options: [3, 7, 14, 30], default: 7 } },
    // Segmentga jadval bo'yicha yuborish. Backendda bor edi (backend/triggers.ts),
    // lekin demo ro'yxatiga tushmagani uchun demo rejimda auditoriya
    // konstruktorini umuman ko'rib bo'lmasdi.
    { id: 'scheduled', label: "Jadval bo'yicha (segmentga)", respectCooldown: true, supportsDoctorFilter: false, supportsSegment: true, supportsSchedule: true },
];

// Demo rejim uchun segment maydonlari — backend/segmentFields.ts qisqartmasi
export const DEMO_SEGMENT_FIELDS: SegmentFieldDescriptor[] = [
    {
        id: 'status', label: 'Bemor holati', type: 'enum', group: "Bemor ma'lumotlari",
        operators: [{ id: 'eq', label: 'teng', arity: 1 }, { id: 'neq', label: 'teng emas', arity: 1 }],
        options: [{ value: 'Active', label: 'Faol' }, { value: 'Archived', label: 'Arxivlangan' }],
        defaultOp: 'eq', defaultValue: 'Active',
    },
    {
        id: 'gender', label: 'Jinsi', type: 'enum', group: "Bemor ma'lumotlari",
        operators: [{ id: 'eq', label: 'teng', arity: 1 }, { id: 'neq', label: 'teng emas', arity: 1 }],
        options: [{ value: 'Female', label: 'Ayol' }, { value: 'Male', label: 'Erkak' }],
        defaultOp: 'eq', defaultValue: 'Female',
    },
    {
        id: 'age', label: 'Yoshi', type: 'number', group: "Bemor ma'lumotlari",
        operators: [{ id: 'gte', label: 'kamida', arity: 1 }, { id: 'lte', label: "ko'pi bilan", arity: 1 }, { id: 'between', label: "oralig'ida", arity: 2 }],
        unit: 'yosh', defaultOp: 'between', defaultValue: [18, 45],
    },
    {
        id: 'hasDebt', label: 'Qarzi bor', type: 'bool', group: 'Moliya',
        operators: [{ id: 'is_true', label: 'ha', arity: 0 }, { id: 'is_false', label: "yo'q", arity: 0 }],
        defaultOp: 'is_true',
    },
    {
        id: 'hasTelegram', label: 'Telegram botga ulangan', type: 'bool', group: 'Aloqa',
        operators: [{ id: 'is_true', label: 'ha', arity: 0 }, { id: 'is_false', label: "yo'q", arity: 0 }],
        defaultOp: 'is_true',
    },
];

// Demo Subscription Plan
export const DEMO_PLAN: SubscriptionPlan = {
    id: 'pro',
    name: 'Pro',
    price: 0,
    features: ['Cheklanmagan shifokorlar', 'Cheklanmagan bemorlar', 'Ombor', 'Telegram Bot'],
    maxDoctors: 999,
};

// Demo credentials
export const DEMO_CREDENTIALS = {
    username: 'demoklinikaadmin',
    password: 'demoklinikaparol',
};

/** Login demo akkauntniki (bo'sh joy va katta-kichik harf farq qilmaydi) */
export const isDemoUsername = (username: unknown): boolean =>
    String(username ?? '').trim().toLowerCase() === DEMO_CREDENTIALS.username;

/** Brauzer demosi sessiyasi — serverga bormaydi, token soxta */
export const demoAuthData = () => ({
    role: UserRole.CLINIC_ADMIN,
    name: 'Demo Admin',
    clinicId: 'demo-clinic-1',
    username: DEMO_CREDENTIALS.username,
    token: 'demo-token',
    isDemo: true,
});

/**
 * Saytdagi demo login ilgari serverdagi "Demo Klinika"ga kirardi. O'sha paytda ochilgan
 * sessiya brauzerda qolgan bo'lsa, ilova login oynasini ko'rsatmay eski klinikani ochaverardi.
 * Bunday sessiya ham brauzer demosiga o'tkaziladi (server tokeni tashlanadi) — boshqa
 * foydalanuvchilarning sessiyasiga tegilmaydi.
 */
function migrateDemoLogin(): void {
    for (const store of [sessionStorage, localStorage]) {
        try {
            const raw = store.getItem('dentalflow_auth');
            if (!raw) continue;
            const auth = JSON.parse(raw);
            if (auth && !auth.isDemo && isDemoUsername(auth.username)) {
                store.setItem('dentalflow_auth', JSON.stringify(demoAuthData()));
            }
        } catch { /* xotira yopiq — o'tkazib yuboriladi */ }
    }
}

// Ilova sessiyani o'qishidan oldin: eski demo sessiyasi — brauzer demosiga
migrateDemoLogin();
// Sahifa demo ochiq holda yangilangan bo'lsa — ma'lumot birinchi so'rovgacha tayyor bo'lsin
if (demoSessionActive()) ensureDemoData();
