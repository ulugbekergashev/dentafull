import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock Data (copied and adapted from constants.ts)
const getRelativeDate = (daysOffset: number) => {
  const date = new Date();
  date.setDate(new Date().getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

const DEMO_CLINIC_ID = 'c1';

const MOCK_PATIENTS = [
  { id: '1', firstName: 'Aziz', lastName: 'Rahimov', phone: '+998 90 123 45 67', dob: '1985-04-12', lastVisit: getRelativeDate(-5), status: 'Active', gender: 'Male', medicalHistory: 'Penitsillinga allergiya', clinicId: DEMO_CLINIC_ID },
  { id: '2', firstName: 'Malika', lastName: 'Karimova', phone: '+998 93 987 65 43', dob: '1992-08-23', lastVisit: getRelativeDate(-2), status: 'Active', gender: 'Female', medicalHistory: 'Yo\'q', clinicId: DEMO_CLINIC_ID },
  { id: '3', firstName: 'Jamshid', lastName: 'Aliyev', phone: '+998 97 555 44 33', dob: '1978-12-01', lastVisit: getRelativeDate(-10), status: 'Active', gender: 'Male', medicalHistory: 'Qandli diabet', clinicId: DEMO_CLINIC_ID },
  { id: '4', firstName: 'Sevara', lastName: 'Tursunova', phone: '+998 99 111 22 33', dob: '2000-02-14', lastVisit: getRelativeDate(-1), status: 'Active', gender: 'Female', medicalHistory: 'Yo\'q', clinicId: DEMO_CLINIC_ID },
  { id: '5', firstName: 'Botir', lastName: 'Zokirov', phone: '+998 91 777 88 99', dob: '1988-06-30', lastVisit: getRelativeDate(-20), status: 'Archived', gender: 'Male', medicalHistory: 'Yuqori qon bosimi', clinicId: DEMO_CLINIC_ID },
];

const MOCK_DOCTORS = [
  { id: 'd1', firstName: 'Alisher', lastName: 'Sobirov', specialty: 'Terapevt', phone: '+998 90 111 22 22', email: 'sobirov@clinic.com', status: 'Active', clinicId: DEMO_CLINIC_ID, username: 'doctor1', password: 'password1' },
  { id: 'd2', firstName: 'Nargiza', lastName: 'Umarova', specialty: 'Ortodont', phone: '+998 90 333 44 44', email: 'umarova@clinic.com', status: 'Active', clinicId: DEMO_CLINIC_ID, username: 'doctor2', password: 'password1' },
];

const MOCK_APPOINTMENTS = [
  { id: '101', patientId: '1', patientName: 'Aziz Rahimov', doctorId: 'd1', doctorName: 'Dr. Sobirov', type: 'Kanal davolash', date: getRelativeDate(0), time: '09:00', duration: 60, status: 'Confirmed', notes: 'Tish og\'rig\'i shikoyati', clinicId: DEMO_CLINIC_ID },
  { id: '102', patientId: '2', patientName: 'Malika Karimova', doctorId: 'd2', doctorName: 'Dr. Umarova', type: 'Tozalash', date: getRelativeDate(0), time: '10:30', duration: 30, status: 'Completed', clinicId: DEMO_CLINIC_ID },
  { id: '103', patientId: '3', patientName: 'Jamshid Aliyev', doctorId: 'd1', doctorName: 'Dr. Sobirov', type: 'Konsultatsiya', date: getRelativeDate(1), time: '11:00', duration: 30, status: 'Pending', clinicId: DEMO_CLINIC_ID },
  { id: '104', patientId: '4', patientName: 'Sevara Tursunova', doctorId: 'd2', doctorName: 'Dr. Umarova', type: 'Sug\'urish', date: getRelativeDate(2), time: '14:00', duration: 45, status: 'Confirmed', clinicId: DEMO_CLINIC_ID },
  { id: '105', patientId: '1', patientName: 'Aziz Rahimov', doctorId: 'd1', doctorName: 'Dr. Sobirov', type: 'Tekshiruv', date: getRelativeDate(-1), time: '16:00', duration: 30, status: 'Completed', clinicId: DEMO_CLINIC_ID },
];

const MOCK_TRANSACTIONS = [
  { id: 't1', patientName: 'Aziz Rahimov', date: getRelativeDate(0), amount: 1500000, type: 'Card', service: 'Kanal davolash', status: 'Paid', clinicId: DEMO_CLINIC_ID },
  { id: 't2', patientName: 'Malika Karimova', date: getRelativeDate(0), amount: 300000, type: 'Cash', service: 'Tozalash', status: 'Paid', clinicId: DEMO_CLINIC_ID },
  { id: 't3', patientName: 'Jamshid Aliyev', date: getRelativeDate(-1), amount: 100000, type: 'Card', service: 'Konsultatsiya', status: 'Paid', clinicId: DEMO_CLINIC_ID },
  { id: 't4', patientName: 'Botir Zokirov', date: getRelativeDate(-5), amount: 4500000, type: 'Insurance', service: 'Implant', status: 'Pending', clinicId: DEMO_CLINIC_ID },
];

const SERVICES_LIST = [
  { name: 'Konsultatsiya', price: 100000, duration: 30, clinicId: DEMO_CLINIC_ID },
  { name: 'Tish tozalash', price: 300000, duration: 45, clinicId: DEMO_CLINIC_ID },
  { name: 'Kanal davolash', price: 1500000, duration: 90, clinicId: DEMO_CLINIC_ID },
  { name: 'Tish sug\'urish', price: 400000, duration: 45, clinicId: DEMO_CLINIC_ID },
  { name: 'Oqartirish', price: 2000000, duration: 60, clinicId: DEMO_CLINIC_ID },
];

const SUBSCRIPTION_PLANS = [
  { id: 'trial', name: 'Bepul Sinov (14 kun)', price: 0, maxDoctors: 1, features: JSON.stringify(['Barcha funksiyalar', '14 kunlik muddat', 'Cheklangan shifokorlar']) },
  { id: 'individual', name: 'Individual', price: 250000, maxDoctors: 1, features: JSON.stringify(['Yakka tartibda ishlash', 'Bemorlar bazasi', 'Moliya', '14 kunlik sinov']) },
  { id: 'basic', name: 'Start', price: 500000, maxDoctors: 3, features: JSON.stringify(['Bemorlar bazasi', 'Jadval', 'Oddiy hisobotlar']) },
  { id: 'pro', name: 'Pro', price: 1200000, maxDoctors: 10, features: JSON.stringify(['Barcha Start funksiyalari', 'Moliya moduli', 'SMS xabarnomalar']) },
  { id: 'business', name: 'Business', price: 2500000, maxDoctors: 50, features: JSON.stringify(['Barcha Pro funksiyalari', 'API integratsiya', 'Shaxsiy menejer', 'Call-center moduli']) },
];

// Only ONE demo clinic
const MOCK_CLINICS = [
  {
    id: DEMO_CLINIC_ID,
    name: 'Demo Klinika',
    adminName: 'Demo Admin',
    username: 'demoklinikaadmin',
    password: 'demoklinikaparol',
    phone: '+998 90 000 00 01',
    status: 'Active',
    planId: 'pro',
    subscriptionStartDate: getRelativeDate(-5),
    expiryDate: getRelativeDate(25),
    monthlyRevenue: 15000000
  },
];

async function main() {
  const forceSeed = process.env.FORCE_SEED === 'true';

  // Check if database is already seeded
  const existingClinics = await prisma.clinic.count();
  const existingUsers = await prisma.doctor.count();

  if (existingClinics > 0 || existingUsers > 0) {
    if (!forceSeed) {
      console.log('Database is not empty. Skipping seed to prevent data loss.');
      console.log('To force seed (and WIPE ALL DATA), run with FORCE_SEED=true');
      return;
    } else {
      console.warn('WARNING: FORCE_SEED is set. Wiping all data...');
    }
  }

  console.log('Seeding database...');

  // Clear existing data (only if forced or empty - effectively only if we are here)
  if (forceSeed) {
    await prisma.service.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.appointment.deleteMany({});
    await prisma.patient.deleteMany({});
    await prisma.doctor.deleteMany({});
    await prisma.clinic.deleteMany({});
    await prisma.subscriptionPlan.deleteMany({});
  }

  // Seed subscription plans
  for (const plan of SUBSCRIPTION_PLANS) {
    // Upsert to avoid duplicates if partial data exists (though we return early above usually)
    // But for safety let's use upsert or just create if we wiped.
    // Since we only proceed if empty or forced-wiped, create is fine, but upsert is safer generally.
    // However, keeping it simple as per plan: just gate the whole thing.
    // But wait, if I don't wipe, I shouldn't try to create duplicates.
    // The logic above returns if not empty. So here we are either empty or wiped.
    await prisma.subscriptionPlan.create({
      data: plan,
    });
  }

  // Seed clinic
  for (const clinic of MOCK_CLINICS) {
    await prisma.clinic.create({
      data: clinic,
    });
  }

  // Seed doctors
  for (const doctor of MOCK_DOCTORS) {
    await prisma.doctor.create({
      data: doctor,
    });
  }

  // Seed patients
  for (const patient of MOCK_PATIENTS) {
    await prisma.patient.create({
      data: patient,
    });
  }

  // Seed appointments
  for (const appt of MOCK_APPOINTMENTS) {
    await prisma.appointment.create({
      data: appt,
    });
  }

  // Seed transactions
  for (const tx of MOCK_TRANSACTIONS) {
    await prisma.transaction.create({
      data: tx,
    });
  }

  // Seed services
  for (const service of SERVICES_LIST) {
    await prisma.service.create({
      data: service,
    });
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
