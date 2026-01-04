
import { Appointment, Doctor, Patient, Transaction, Clinic, SubscriptionPlan } from './types';

// Helper to get dates relative to today
const getRelativeDate = (daysOffset: number) => {
  const date = new Date();
  date.setDate(new Date().getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

export const MOCK_PATIENTS: Patient[] = [
  { id: '1', firstName: 'Aziz', lastName: 'Rahimov', phone: '+998 90 123 45 67', dob: '1985-04-12', lastVisit: getRelativeDate(-5), status: 'Active', gender: 'Male', medicalHistory: 'Penitsillinga allergiya' },
  { id: '2', firstName: 'Malika', lastName: 'Karimova', phone: '+998 93 987 65 43', dob: '1992-08-23', lastVisit: getRelativeDate(-2), status: 'Active', gender: 'Female', medicalHistory: 'Yo\'q' },
  { id: '3', firstName: 'Jamshid', lastName: 'Aliyev', phone: '+998 97 555 44 33', dob: '1978-12-01', lastVisit: getRelativeDate(-10), status: 'Active', gender: 'Male', medicalHistory: 'Qandli diabet' },
  { id: '4', firstName: 'Sevara', lastName: 'Tursunova', phone: '+998 99 111 22 33', dob: '2000-02-14', lastVisit: getRelativeDate(-1), status: 'Active', gender: 'Female', medicalHistory: 'Yo\'q' },
  { id: '5', firstName: 'Botir', lastName: 'Zokirov', phone: '+998 91 777 88 99', dob: '1988-06-30', lastVisit: getRelativeDate(-20), status: 'Archived', gender: 'Male', medicalHistory: 'Yuqori qon bosimi' },
];

export const MOCK_DOCTORS: Doctor[] = [
  { id: 'd1', firstName: 'Alisher', lastName: 'Sobirov', specialty: 'Terapevt', phone: '+998 90 111 22 22', email: 'sobirov@clinic.com', status: 'Active' },
  { id: 'd2', firstName: 'Nargiza', lastName: 'Umarova', specialty: 'Ortodont', phone: '+998 90 333 44 44', email: 'umarova@clinic.com', status: 'Active' },
];

export const MOCK_APPOINTMENTS: Appointment[] = [
  { id: '101', patientId: '1', patientName: 'Aziz Rahimov', doctorId: 'd1', doctorName: 'Dr. Sobirov', type: 'Kanal davolash', date: getRelativeDate(0), time: '09:00', duration: 60, status: 'Confirmed', notes: 'Tish og\'rig\'i shikoyati' },
  { id: '102', patientId: '2', patientName: 'Malika Karimova', doctorId: 'd2', doctorName: 'Dr. Umarova', type: 'Tozalash', date: getRelativeDate(0), time: '10:30', duration: 30, status: 'Completed' },
  { id: '103', patientId: '3', patientName: 'Jamshid Aliyev', doctorId: 'd1', doctorName: 'Dr. Sobirov', type: 'Konsultatsiya', date: getRelativeDate(1), time: '11:00', duration: 30, status: 'Pending' },
  { id: '104', patientId: '4', patientName: 'Sevara Tursunova', doctorId: 'd2', doctorName: 'Dr. Umarova', type: 'Sug\'urish', date: getRelativeDate(2), time: '14:00', duration: 45, status: 'Confirmed' },
  { id: '105', patientId: '1', patientName: 'Aziz Rahimov', doctorId: 'd1', doctorName: 'Dr. Sobirov', type: 'Tekshiruv', date: getRelativeDate(-1), time: '16:00', duration: 30, status: 'Completed' },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 't1', patientName: 'Aziz Rahimov', date: getRelativeDate(0), amount: 1500000, type: 'Card', service: 'Kanal davolash', status: 'Paid' },
  { id: 't2', patientName: 'Malika Karimova', date: getRelativeDate(0), amount: 300000, type: 'Cash', service: 'Tozalash', status: 'Paid' },
  { id: 't3', patientName: 'Jamshid Aliyev', date: getRelativeDate(-1), amount: 100000, type: 'Card', service: 'Konsultatsiya', status: 'Paid' },
  { id: 't4', patientName: 'Botir Zokirov', date: getRelativeDate(-5), amount: 4500000, type: 'Insurance', service: 'Implant', status: 'Pending' },
];

export const SERVICES_LIST = [
  { name: 'Konsultatsiya', price: 100000, duration: 30 },
  { name: 'Tish tozalash', price: 300000, duration: 45 },
  { name: 'Kanal davolash', price: 1500000, duration: 90 },
  { name: 'Tish sug\'urish', price: 400000, duration: 45 },
  { name: 'Oqartirish', price: 2000000, duration: 60 },
];

// --- Super Admin Mocks ---

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'individual', name: 'Individual', price: 250000, maxDoctors: 1, features: ['Yakka tartibda ishlash', 'Bemorlar bazasi', 'Moliya', '14 kunlik sinov'] },
  { id: 'basic', name: 'Start', price: 500000, maxDoctors: 3, features: ['Bemorlar bazasi', 'Jadval', 'Oddiy hisobotlar'] },
  { id: 'pro', name: 'Pro', price: 1200000, maxDoctors: 10, features: ['Barcha Start funksiyalari', 'Moliya moduli', 'SMS xabarnomalar'] },
  { id: 'business', name: 'Business', price: 2500000, maxDoctors: 50, features: ['Barcha Pro funksiyalari', 'API integratsiya', 'Shaxsiy menejer', 'Call-center moduli'] },
];

export const MOCK_CLINICS: Clinic[] = [
  {
    id: 'c1', name: 'Demo Klinika', adminName: 'Demo Admin', username: 'demoklinikaadmin', phone: '+998 90 000 00 01',
    status: 'Active', planId: 'pro', subscriptionStartDate: getRelativeDate(-5), expiryDate: getRelativeDate(25), monthlyRevenue: 15000000
  },
  {
    id: 'c2', name: 'Smile Dental', adminName: 'Sarvar K.', username: 'smile_admin', phone: '+998 90 123 11 11',
    status: 'Active', planId: 'business', subscriptionStartDate: getRelativeDate(-20), expiryDate: getRelativeDate(10), monthlyRevenue: 45000000
  },
  {
    id: 'c3', name: 'Happy Teeth', adminName: 'Lola M.', username: 'happy_admin', phone: '+998 93 444 55 66',
    status: 'Blocked', planId: 'basic', subscriptionStartDate: getRelativeDate(-32), expiryDate: getRelativeDate(-2), monthlyRevenue: 2000000
  },
  {
    id: 'c4', name: 'New Life Stom', adminName: 'Bekzod A.', username: 'newlife_admin', phone: '+998 99 888 77 66',
    status: 'Active', planId: 'individual', subscriptionStartDate: getRelativeDate(-3), expiryDate: getRelativeDate(11), monthlyRevenue: 500000
  },
];
