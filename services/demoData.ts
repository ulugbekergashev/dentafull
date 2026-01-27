import { Patient, Appointment, Transaction, Doctor, Service, Clinic, SubscriptionPlan } from '../types';

// Demo Clinic
export const DEMO_CLINIC: Clinic = {
    id: 'demo-clinic-1',
    name: 'Demo Stomatologiya',
    adminName: 'Demo Admin',
    username: 'demoklinikaadmin',
    phone: '+998 90 123 45 67',
    status: 'Active',
    planId: 'individual',
    subscriptionStartDate: new Date('2024-01-01').toISOString(),
    expiryDate: new Date('2025-12-31').toISOString(),
    monthlyRevenue: 0,
    subscriptionType: 'Paid',
    botToken: '',
};

// Demo Doctors
export const DEMO_DOCTORS: Doctor[] = [
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

// Demo Services
export const DEMO_SERVICES: Service[] = [
    { id: 1, name: 'Konsultatsiya', price: 50000, category: 'Konsultatsiya', duration: 30, clinicId: 'demo-clinic-1' },
    { id: 2, name: 'Tish tozalash', price: 200000, category: 'Profilaktika', duration: 45, clinicId: 'demo-clinic-1' },
    { id: 3, name: 'Tish plombalash', price: 300000, category: 'Terapiya', duration: 60, clinicId: 'demo-clinic-1' },
    { id: 4, name: 'Tish olib tashlash', price: 150000, category: 'Jarrohlik', duration: 30, clinicId: 'demo-clinic-1' },
    { id: 5, name: 'Tish oqartirish', price: 800000, category: 'Estetik', duration: 90, clinicId: 'demo-clinic-1' },
    { id: 6, name: 'Metall-keramika toj', price: 1200000, category: 'Protezlash', duration: 120, clinicId: 'demo-clinic-1' },
    { id: 7, name: 'Breket tizimi', price: 5000000, category: 'Ortodontiya', duration: 90, clinicId: 'demo-clinic-1' },
];

// Demo Patients
export const DEMO_PATIENTS: Patient[] = [
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
export const DEMO_APPOINTMENTS: Appointment[] = [
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
export const DEMO_TRANSACTIONS: Transaction[] = [
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
    id: 'individual',
    name: 'Individual',
    price: 0,
    features: ['Bir shifokor', 'Cheklanmagan bemorlar'],
};

// Demo credentials
export const DEMO_CREDENTIALS = {
    username: 'demoklinikaadmin',
    password: 'demoklinikaparol',
};
