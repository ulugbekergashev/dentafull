/**
 * Skrinshotlar uchun demo ma'lumotlarni bugungi kunga moslab tayyorlaydi.
 *
 * `services/demoData.ts` dagi standart yozuvlar 2026-yil yanvariga qotirilgan.
 * Boshqaruv paneli esa joriy davrni ko'rsatadi — natijada rasmga bo'sh ekran
 * tushadi. Bu yerda o'sha o'ylab topilgan bemorlar va shifokorlar bilan
 * bugungi sanaga bog'langan qabullar va to'lovlar yasaladi.
 *
 * Faqat `appointments`, `transactions` va `teeth` kalitlari beriladi —
 * qolgan hammasi (bemorlar, shifokorlar, xizmatlar, ombor, lidlar)
 * demoData dagi standart qiymatlarda qoladi.
 */

const PATIENTS = [
  { id: "demo-patient-1", name: "Aziza Rahimova" },
  { id: "demo-patient-2", name: "Bobur Aliyev" },
  { id: "demo-patient-3", name: "Dilnoza Karimova" },
  { id: "demo-patient-4", name: "Eldor Toshmatov" },
  { id: "demo-patient-5", name: "Feruza Shodiyeva" },
];

const DOCTORS = [
  { id: "demo-doctor-1", name: "Dr. Kamola Ahmedova" },
  { id: "demo-doctor-2", name: "Dr. Jamshid Karimov" },
];

const SERVICES = [
  { type: "Konsultatsiya", price: 50000, duration: 30 },
  { type: "Tish plombalash", price: 350000, duration: 45 },
  { type: "Professional tozalash", price: 200000, duration: 40 },
  { type: "Kanal davolash", price: 600000, duration: 60 },
  { type: "Breket nazorati", price: 250000, duration: 30 },
  { type: "Implant konsultatsiyasi", price: 100000, duration: 30 },
];

const CLINIC = "demo-clinic-1";
/**
 * Mahalliy sana (YYYY-MM-DD). `toISOString()` ishlatilmaydi: u UTC ga
 * o'tkazadi va Toshkent vaqtida yarim tundan oldingi soatlar bir kun
 * orqaga suriladi — natijada "bugungi" qabullar kechagi kunga tushib qoladi.
 */
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Bugungi kunga bog'langan qabullar: bir qismi bo'lgan, bir qismi kutilmoqda */
function buildAppointments(today) {
  const plan = [
    { time: "09:00", p: 0, d: 0, s: 1, status: "Completed" },
    { time: "09:45", p: 2, d: 0, s: 2, status: "Completed" },
    { time: "10:30", p: 1, d: 1, s: 4, status: "Completed" },
    { time: "11:15", p: 3, d: 0, s: 0, status: "Confirmed" },
    { time: "12:00", p: 4, d: 1, s: 4, status: "Confirmed" },
    { time: "14:00", p: 0, d: 1, s: 3, status: "Confirmed" },
    { time: "15:00", p: 2, d: 0, s: 5, status: "Scheduled" },
    { time: "16:00", p: 3, d: 1, s: 2, status: "Scheduled" },
  ];

  const list = plan.map((a, i) => {
    const patient = PATIENTS[a.p];
    const doctor = DOCTORS[a.d];
    const service = SERVICES[a.s];
    return {
      id: `demo-appt-t${i + 1}`,
      patientId: patient.id,
      patientName: patient.name,
      doctorId: doctor.id,
      doctorName: doctor.name,
      type: service.type,
      date: iso(today),
      time: a.time,
      duration: service.duration,
      status: a.status,
      notes: "",
      clinicId: CLINIC,
    };
  });

  // Ertangi va indingi kun uchun ham bir nechta yozuv — kalendar bo'sh qolmasin
  for (let day = 1; day <= 3; day++) {
    const d = new Date(today);
    d.setDate(d.getDate() + day);
    for (let k = 0; k < 3; k++) {
      const patient = PATIENTS[(day + k) % PATIENTS.length];
      const doctor = DOCTORS[k % DOCTORS.length];
      const service = SERVICES[(day + k) % SERVICES.length];
      list.push({
        id: `demo-appt-f${day}-${k}`,
        patientId: patient.id,
        patientName: patient.name,
        doctorId: doctor.id,
        doctorName: doctor.name,
        type: service.type,
        date: iso(d),
        time: ["10:00", "13:00", "16:30"][k],
        duration: service.duration,
        status: "Confirmed",
        notes: "",
        clinicId: CLINIC,
      });
    }
  }

  return list;
}

/** Oxirgi 12 kunlik to'lovlar — daromad grafigi va kassa uchun */
function buildTransactions(today) {
  const list = [];
  const methods = ["Cash", "Card", "Click"];
  let n = 0;

  for (let back = 11; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if (d.getDay() === 0) continue; // yakshanba — dam olish

    const count = 2 + ((back * 7) % 3);
    for (let k = 0; k < count; k++) {
      n += 1;
      const patient = PATIENTS[n % PATIENTS.length];
      const doctor = DOCTORS[n % DOCTORS.length];
      const service = SERVICES[(n + back) % SERVICES.length];
      const unpaid = back <= 2 && k === 0;

      const stamp = new Date(d);
      stamp.setHours(10 + ((n * 3) % 8), (n * 17) % 60, 0, 0);

      list.push({
        id: `demo-tx-t${n}`,
        patientId: patient.id,
        patientName: patient.name,
        date: stamp.toISOString(),
        amount: service.price,
        type: methods[n % methods.length],
        service: service.type,
        status: unpaid ? "Pending" : "Paid",
        clinicId: CLINIC,
        doctorId: doctor.id,
        doctorName: doctor.name,
        discountPercent: 0,
        discountAmount: 0,
      });
    }
  }

  return list;
}

/** Tish xaritasi bo'sh ko'rinmasligi uchun holatlar */
const TEETH = [
  { patientId: "demo-patient-1", number: 17, conditions: ["Cavity"], notes: "" },
  { patientId: "demo-patient-1", number: 15, conditions: ["Pulpitis"], notes: "" },
  { patientId: "demo-patient-1", number: 14, conditions: ["Filled"], notes: "" },
  { patientId: "demo-patient-1", number: 24, conditions: ["Missing"], notes: "" },
  { patientId: "demo-patient-1", number: 25, conditions: ["Implant"], notes: "" },
  { patientId: "demo-patient-1", number: 46, conditions: ["Crown"], notes: "" },
  { patientId: "demo-patient-1", number: 44, conditions: ["Filled"], notes: "" },
  { patientId: "demo-patient-1", number: 35, conditions: ["Cavity"], notes: "" },
  { patientId: "demo-patient-1", number: 36, conditions: ["Filled"], notes: "" },
];

export function buildDemoSeed(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    appointments: buildAppointments(today),
    transactions: buildTransactions(today),
    teeth: TEETH,
  };
}
