import { Patient, Appointment, Transaction, Doctor, Receptionist, Service, Clinic, SubscriptionPlan, InventoryItem, InventoryLog, ServiceCategory, PatientDiagnosis } from '../types';

// --- PERSISTENCE HELPERS ---
const STORAGE_KEY = 'dentalflow_demo_data';

export const loadDemoData = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        console.log('📦 Loading Demo Data from LS:', stored ? 'Found' : 'Not Found');
        if (stored) {
            const parsed = JSON.parse(stored);
            console.log('✅ Demo Data Parsed:', {
                patients: parsed.patients?.length,
                appointments: parsed.appointments?.length,
                transactions: parsed.transactions?.length
            });
            return parsed;
        }
    } catch (e) {
        console.error('❌ Failed to load demo data', e);
    }
    return null;
};

// Load initial data
const savedData = loadDemoData();

export const saveDemoData = () => {
    try {
        const data = {
            patients: DEMO_PATIENTS,
            appointments: DEMO_APPOINTMENTS,
            transactions: DEMO_TRANSACTIONS,
            services: DEMO_SERVICES,
            doctors: DEMO_DOCTORS,
            receptionists: DEMO_RECEPTIONISTS,
            clinic: DEMO_CLINIC,
            teeth: DEMO_TEETH,
            diagnoses: DEMO_DIAGNOSES,
            inventory: DEMO_INVENTORY,
            logs: DEMO_INVENTORY_LOGS,
            categories: DEMO_CATEGORIES
        };
        const stringified = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, stringified);
        console.log('💾 Demo Data Saved to LS. Size:', Math.round(stringified.length / 1024), 'KB');
    } catch (e) {
        console.error('❌ Failed to save demo data', e);
        if (e instanceof Error && e.name === 'QuotaExceededError') {
            console.error('Critial: LocalStorage Quota Exceeded!');
        }
    }
};

// Demo Clinic
export let DEMO_CLINIC: Clinic = savedData?.clinic || {
    id: 'demo-clinic-1',
    name: 'Demo Stomatologiya',
    adminName: 'Demo Admin',
    username: 'demoklinikaadmin',
    phone: '+998 90 123 45 67',
    status: 'Active',
    planId: 'pro',
    subscriptionStartDate: new Date('2024-01-01').toISOString(),
    expiryDate: new Date('2030-12-31').toISOString(),
    monthlyRevenue: 0,
    subscriptionType: 'Paid',
    botToken: '',
};

export let DEMO_RECEPTIONISTS: Receptionist[] = savedData?.receptionists || [];

export let DEMO_TEETH: any[] = savedData?.teeth || [];

export let DEMO_DIAGNOSES: PatientDiagnosis[] = savedData?.diagnoses || [];


// Demo Doctors
export let DEMO_DOCTORS: Doctor[] = savedData?.doctors || [
    {
        id: 'demo-doctor-1',
        firstName: 'Kamola',
        lastName: 'Ahmedova',
        specialty: 'Umumiy Stomatolog',
        phone: '+998 90 111 22 33',
        status: 'Active',
        clinicId: 'demo-clinic-1',
        percentage: 40,
        username: 'kamola',
    },
    {
        id: 'demo-doctor-2',
        firstName: 'Jamshid',
        lastName: 'Karimov',
        specialty: 'Ortodont',
        phone: '+998 90 444 55 66',
        status: 'Active',
        clinicId: 'demo-clinic-1',
        percentage: 35,
        username: 'jamshid',
    },
];

// Demo Categories
export let DEMO_CATEGORIES: ServiceCategory[] = savedData?.categories || [
    { id: 'cat-1', name: 'Konsultatsiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-2', name: 'Gigiena va Profilaktika', clinicId: 'demo-clinic-1' },
    { id: 'cat-3', name: 'Terapiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-4', name: 'Jarrohlik', clinicId: 'demo-clinic-1' },
    { id: 'cat-5', name: 'Ortodontiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-6', name: 'Protezlash', clinicId: 'demo-clinic-1' },
];

// Demo Services
export let DEMO_SERVICES: Service[] = savedData?.services || [
    { id: 1, name: 'Konsultatsiya', price: 50000, categoryId: 'cat-1', duration: 30, clinicId: 'demo-clinic-1' },
    { id: 2, name: 'Tish tozalash', price: 200000, categoryId: 'cat-2', duration: 45, clinicId: 'demo-clinic-1' },
    { id: 3, name: 'Tish plombalash', price: 300000, categoryId: 'cat-3', duration: 60, clinicId: 'demo-clinic-1' },
    { id: 4, name: 'Tish olib tashlash', price: 150000, categoryId: 'cat-4', duration: 30, clinicId: 'demo-clinic-1' },
    { id: 5, name: 'Tish oqartirish', price: 800000, categoryId: 'cat-2', duration: 90, clinicId: 'demo-clinic-1' },
    { id: 6, name: 'Metall-keramika toj', price: 1200000, categoryId: 'cat-6', duration: 120, clinicId: 'demo-clinic-1' },
    { id: 7, name: 'Breket tizimi', price: 5000000, categoryId: 'cat-5', duration: 90, clinicId: 'demo-clinic-1' },
];

// Demo Patients
export let DEMO_PATIENTS: Patient[] = savedData?.patients || [
    {
        id: 'demo-patient-1',
        firstName: 'Aziza',
        lastName: 'Rahimova',
        phone: '+998 90 123 11 11',
        dob: '1990-05-15',
        address: 'Yunusobod tumani, 12-mavze',
        medicalHistory: 'Yuqori qon bosimi',
        clinicId: 'demo-clinic-1',
        lastVisit: '2026-01-27',
        status: 'Active',
        gender: 'Female',
        telegramChatId: '123456'
    },
    {
        id: 'demo-patient-2',
        firstName: 'Bobur',
        lastName: 'Aliyev',
        phone: '+998 91 234 22 22',
        dob: '1985-08-20',
        address: 'Chilonzor tumani, 5-kvartal',
        medicalHistory: 'Allergiya (penitsiliinga)',
        clinicId: 'demo-clinic-1',
        lastVisit: '2026-01-20',
        status: 'Active',
        gender: 'Male',
        telegramChatId: '123457'
    },
    {
        id: 'demo-patient-3',
        firstName: 'Dilnoza',
        lastName: 'Karimova',
        phone: '+998 93 345 33 33',
        dob: '1995-03-10',
        address: 'Mirzo Ulug\'bek tumani, Ziyolilar ko\'chasi',
        medicalHistory: '',
        clinicId: 'demo-clinic-1',
        lastVisit: '2026-01-25',
        status: 'Active',
        gender: 'Female'
    },
    {
        id: 'demo-patient-4',
        firstName: 'Eldor',
        lastName: 'Toshmatov',
        phone: '+998 94 456 44 44',
        dob: '1988-11-25',
        address: 'Yashnobod tumani, Abdulla Qodiriy ko\'chasi',
        medicalHistory: 'Qandli diabet (2-tur)',
        clinicId: 'demo-clinic-1',
        lastVisit: '2026-01-15',
        status: 'Active',
        gender: 'Male'
    },
    {
        id: 'demo-patient-5',
        firstName: 'Feruza',
        lastName: 'Shodiyeva',
        phone: '+998 95 567 55 55',
        dob: '1992-07-08',
        address: 'Sergeli tumani, Yangi hayot',
        medicalHistory: '',
        clinicId: 'demo-clinic-1',
        lastVisit: 'Never',
        status: 'Active',
        gender: 'Female'
    },
];

// Demo Appointments
export let DEMO_APPOINTMENTS: Appointment[] = savedData?.appointments || [
    {
        id: 'demo-appt-1',
        patientId: 'demo-patient-1',
        patientName: 'Aziza Rahimova',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        type: 'Konsultatsiya',
        date: new Date('2026-01-28').toISOString().split('T')[0],
        time: '10:00',
        duration: 30,
        status: 'Confirmed',
        notes: 'Tish og\'rig\'i tekshiruvi',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-2',
        patientId: 'demo-patient-2',
        patientName: 'Bobur Aliyev',
        doctorId: 'demo-doctor-2',
        doctorName: 'Dr. Jamshid Karimov',
        type: 'Breket tizimi',
        date: new Date('2026-01-28').toISOString().split('T')[0],
        time: '14:00',
        duration: 90,
        status: 'Confirmed',
        notes: 'Breket nazorati',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-3',
        patientId: 'demo-patient-3',
        patientName: 'Dilnoza Karimova',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        type: 'Tish tozalash',
        date: new Date('2026-01-29').toISOString().split('T')[0],
        time: '11:00',
        duration: 45,
        status: 'Confirmed',
        notes: 'Tish tozalash',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-4',
        patientId: 'demo-patient-4',
        patientName: 'Eldor Toshmatov',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        type: 'Tish plombalash',
        date: new Date('2026-01-27').toISOString().split('T')[0],
        time: '15:00',
        duration: 60,
        status: 'Completed',
        notes: 'Plombalash',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-5',
        patientId: 'demo-patient-5',
        patientName: 'Feruza Shodiyeva',
        doctorId: 'demo-doctor-2',
        doctorName: 'Dr. Jamshid Karimov',
        type: 'Konsultatsiya',
        date: new Date('2026-01-30').toISOString().split('T')[0],
        time: '09:00',
        duration: 30,
        status: 'Confirmed',
        notes: 'Konsultatsiya',
        clinicId: 'demo-clinic-1',
    },
];

// Demo Transactions
export let DEMO_TRANSACTIONS: Transaction[] = savedData?.transactions || [
    {
        id: 'demo-tx-1',
        patientId: 'demo-patient-1',
        patientName: 'Aziza Rahimova',
        date: new Date('2026-01-27').toISOString(),
        amount: 300000,
        type: 'Cash',
        service: 'Tish plombalash',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova'
    },
    {
        id: 'demo-tx-2',
        patientId: 'demo-patient-2',
        patientName: 'Bobur Aliyev',
        date: new Date('2026-01-20').toISOString(),
        amount: 1500000,
        type: 'Card',
        service: 'Breket tizimi',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-2',
        doctorName: 'Dr. Jamshid Karimov'
    },
    {
        id: 'demo-tx-3',
        patientId: 'demo-patient-3',
        patientName: 'Dilnoza Karimova',
        date: new Date('2026-01-25').toISOString(),
        amount: 200000,
        type: 'Cash',
        service: 'Tish tozalash',
        status: 'Pending',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova'
    },
    {
        id: 'demo-tx-4',
        patientId: 'demo-patient-4',
        patientName: 'Eldor Toshmatov',
        date: new Date('2026-01-15').toISOString(),
        amount: 50000,
        type: 'Cash',
        service: 'Konsultatsiya',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova'
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

// Demo Inventory Items
export let DEMO_INVENTORY: InventoryItem[] = savedData?.inventory || [
    {
        id: 'demo-item-1',
        name: 'Liqidoqain',
        unit: 'ampula',
        quantity: 50,
        minQuantity: 10,
        clinicId: 'demo-clinic-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-item-2',
        name: 'Paxta',
        unit: 'kg',
        quantity: 5,
        minQuantity: 2,
        clinicId: 'demo-clinic-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-item-3',
        name: 'Shprits 2ml',
        unit: 'dona',
        quantity: 100,
        minQuantity: 20,
        clinicId: 'demo-clinic-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

// Demo Inventory Logs
export let DEMO_INVENTORY_LOGS: InventoryLog[] = savedData?.logs || [
    {
        id: 'demo-log-1',
        itemId: 'demo-item-1',
        change: 50,
        type: 'IN',
        note: 'Boshlang\'ich qoldiq',
        date: new Date('2026-01-01').toISOString(),
        userName: 'Demo Admin',
    },
    {
        id: 'demo-log-2',
        itemId: 'demo-item-2',
        change: 5,
        type: 'IN',
        note: 'Xarid',
        date: new Date('2026-01-05').toISOString(),
        userName: 'Demo Admin',
    }
];


