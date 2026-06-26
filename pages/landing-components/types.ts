export interface Patient {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  status: "Davolanmoqda" | "Sog'lom" | "Navbatda";
  debt: number;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: "Ortodont" | "Terapevt" | "Xirurg" | "Ortoped" | "Implantolog";
  status: "Band" | "Bo'sh" | "Tushlikda";
  appointmentsToday: number;
}

export interface Appointment {
  id: string;
  patientName: string;
  doctorName: string;
  time: string;
  treatment: string;
  price: number;
  status: "Kutilmoqda" | "Tugallandi" | "Kelmagan";
}

export interface ToothState {
  id: number; // Tooth number (e.g., 11 to 48)
  condition: "Sog'lom" | "Karies" | "Kanal" | "Plomba" | "Yo'q" | "Implant";
  selected: boolean;
}

export interface LeadRequest {
  id: string;
  clinicName: string;
  ownerName: string;
  phone: string;
  doctorsCount: number;
  submittedAt: string;
}
