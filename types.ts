
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DOCTOR = 'DOCTOR',
  RECEPTIONIST = 'RECEPTIONIST'
}

export enum ToothStatus {
  HEALTHY = 'Healthy',
  CAVITY = 'Cavity',
  FILLED = 'Filled',
  MISSING = 'Missing',
  CROWN = 'Crown',
  PULPITIS = 'Pulpitis',
  PERIODONTITIS = 'Periodontitis',
  ABSCESS = 'Abscess',
  PHLEGMON = 'Phlegmon',
  OSTEOMYELITIS = 'Osteomyelitis',
  ADENTIA = 'Adentia',
  IMPLANT = 'Implant'
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
  percentage?: number; // Revenue share percentage
}

export interface Receptionist {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  username: string;
  password?: string;
  status: 'Active' | 'Inactive';
  clinicId: string;
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
  address?: string;
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
  reminderSent?: boolean;
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
  doctorId?: string;      // Optional - for backward compatibility
  doctorName?: string;    // Optional - for backward compatibility
  patientId?: string;     // Optional - for backward compatibility
}

export interface Service {
  id?: number; // Optional because it might be auto-generated or missing in some contexts
  name: string;
  price: number;
  cost?: number; // Service cost (e.g., technician fee)
  duration?: number; // Optional, defaults to 60 minutes

  clinicId: string;
  categoryId?: string;
  category?: ServiceCategory;
}

export interface ServiceCategory {
  id: string;
  name: string;
  clinicId: string;
}

export interface ToothData {
  id: number;
  number: number; // 1-32
  conditions: ToothStatus[]; // Changed from single status to array
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
  subscriptionType: 'Paid' | 'Trial';
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

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLog {
  id: string;
  itemId: string;
  change: number;
  type: 'IN' | 'OUT';
  note?: string;
  date: string;
  userName: string;
  patientId?: string;
  patientName?: string;
}

export interface SMSCampaign {
  id: string;
  name: string;
  message: string;
  audience: 'all' | 'male' | 'female' | 'debtors';
  sentCount: number;
  status: 'Draft' | 'Sent' | 'Failed';
  date: string;
  clinicId: string;
}

// Workflow System Types
export interface Visit {
  id: string;
  patientId: string;
  appointmentId?: string; // Optional link to appointment
  date: string; // YYYY-MM-DD
  checkInTime: string; // ISO DateTime
  checkOutTime?: string; // ISO DateTime
  status: 'Waiting' | 'In Progress' | 'Completed' | 'Cancelled';
  complaints?: string; // Chief complaint
  vitalSigns?: string; // JSON string
  notes?: string; // General visit notes
  clinicId: string;

  // For UI display (populated from relations)
  patient?: Patient;
  diagnoses?: PatientDiagnosis[];
  procedures?: TreatmentProcedure[];
  transactions?: Transaction[];
}

export interface TreatmentProcedure {
  id: string;
  visitId: string;
  procedureName: string;
  toothNumber?: number; // 1-32, optional for general procedures
  toothSurface?: string; // e.g., "Mesial", "Distal", "Occlusal"
  status: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';
  basePrice: number;
  discount: number;
  finalPrice: number;
  materialsUsed?: string; // JSON array of materials
  notes?: string;
  duration?: number; // in minutes
  doctorId: string;
  doctorName: string;
  createdAt: string; // ISO DateTime
  completedAt?: string; // ISO DateTime
}
