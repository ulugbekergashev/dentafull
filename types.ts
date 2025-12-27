
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DOCTOR = 'DOCTOR'
}

export enum ToothStatus {
  HEALTHY = 'Healthy',
  CAVITY = 'Cavity',
  FILLED = 'Filled',
  MISSING = 'Missing',
  CROWN = 'Crown'
}

export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string;
  email?: string;
  status: 'Active' | 'On Leave';
  clinicId: string;
  username?: string;
  password?: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string; // YYYY-MM-DD
  lastVisit: string;
  status: 'Active' | 'Archived';
  gender: 'Male' | 'Female';
  medicalHistory: string;
  clinicId: string;
  telegramChatId?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  type: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  status: 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled' | 'No-Show' | 'Checked-In';
  notes?: string;
  clinicId: string;
}

export interface Transaction {
  id: string;
  patientName: string;
  date: string;
  amount: number;
  type: 'Cash' | 'Card' | 'Insurance';
  service: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  clinicId: string;
}

export interface Service {
  id?: number; // Optional because it might be auto-generated or missing in some contexts
  name: string;
  price: number;
  duration: number;
  clinicId: string;
}

export interface ToothData {
  id: number;
  number: number; // 1-32
  status: ToothStatus;
  notes?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: any;
  roles: UserRole[];
}

// --- Super Admin Types ---

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  maxDoctors: number;
  features: string[];
}

export interface Clinic {
  id: string;
  name: string;
  adminName: string;
  username: string;
  password?: string; // Only for display upon creation
  phone: string;
  status: 'Active' | 'Blocked' | 'Pending';
  planId: string;
  subscriptionStartDate: string; // Added field
  expiryDate: string;
  monthlyRevenue: number; // For SaaS analytics
  botToken?: string; // Telegram bot token
  customPrice?: number; // Optional custom pricing for special offers
}

export interface ICD10Code {
  code: string;
  name: string;
  description?: string;
}

export interface PatientDiagnosis {
  id: string;
  patientId: string;
  code: string;
  icd10?: ICD10Code;
  date: string;
  notes?: string;
  status: 'Active' | 'Resolved' | 'Chronic';
  clinicId: string;
}

export interface PatientPhoto {
  id: string;
  patientId: string;
  url: string;
  description?: string;
  category: string;
  date: string;
  createdAt: string;
}
