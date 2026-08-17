import type { PaymentMethod } from './utils/paymentMethods';

export type { PaymentMethod };

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DOCTOR = 'DOCTOR',
  RECEPTIONIST = 'RECEPTIONIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
  SALES_AGENT = 'SALES_AGENT'
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
  salaryType?: 'none' | 'fixed' | 'fixed_kpi' | 'kpi'; // Maosh turi
  fixedSalary?: number; // Fix maosh summasi (salaryType 'fixed'/'fixed_kpi' uchun)
  secondaryPhone?: string;
  color?: string;
  startHour?: number | null;
  endHour?: number | null;
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
  secondaryPhone?: string;
  doctorId?: string;    // Assigned doctor
  doctorName?: string;  // Cached doctor name
  avatarUrl?: string;
  portraitUrl?: string;
  balance?: number;
  pinfl?: string;
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
  review?: Review;
}

export interface Transaction {
  id: string;
  patientName: string;
  date: string;
  amount: number;
  type: PaymentMethod;
  service: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  clinicId: string;
  doctorId?: string;      // Optional - for backward compatibility
  doctorName?: string;    // Optional - for backward compatibility
  patientId?: string;     // Optional - for backward compatibility
  createdAt?: string | null; // to'lov qabul qilingan aniq vaqt (eski yozuvlarda yo'q)
  receivedById?: string | null;   // pulni kim qabul qildi (server yozadi)
  receivedByName?: string | null;
  discountPercent?: number; // Chegirma foizi (0-100)
  discountAmount?: number;  // Chegirma summasi
}

export type ExpenseCategory = 'DoctorShare' | 'Salary' | 'Rent' | 'Utilities' | 'Inventory' | 'Lab' | 'Other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  DoctorShare: 'Shifokor ulushi',
  Salary: 'Oylik',
  Rent: 'Ijara',
  Utilities: 'Kommunal',
  Inventory: 'Ombor',
  Lab: 'Laboratoriya',
  Other: 'Boshqa',
};

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  title: string;
  method?: PaymentMethod | null;
  note?: string | null;
  clinicId: string;
  doctorId?: string | null;      // 'DoctorShare' va shifokorga 'Salary' uchun
  receptionistId?: string | null; // reception xodimiga 'Salary' uchun
  labOrderId?: string | null;    // avtomatik Laboratoriya xarajati bog'lami
  inventoryItemId?: string | null; // avtomatik Ombor xarajati bog'lami
  createdAt?: string;
}

/**
 * Kassa kunini yopish yozuvi. Kun bo'yicha bitta bo'ladi (qayta yopilsa yangilanadi).
 * Yopish kunni qulflamaydi — kechroq kelgan to'lov baribir yoziladi, faqat Kassa
 * sahifasida "yopilgandan keyin o'zgardi" belgisi chiqadi.
 */
export interface CashRegisterDay {
  id: string;
  clinicId: string;
  date: string;
  shift: number;           // bitta smenali klinikada har doim 1
  shiftStart?: string | null;
  shiftEnd?: string | null;
  openingCash: number;     // smena boshidagi naqd qoldiq
  countedCash: number;     // kassir sanagan naqd
  expectedCash: number;    // yopilgan daqiqadagi hisob bo'yicha naqd
  difference: number;      // countedCash − expectedCash
  countedCard?: number | null;   // terminal Z-hisoboti (kiritilmasa solishtirilmaydi)
  expectedCard?: number | null;
  countedClick?: number | null;  // Click/Payme kabineti
  expectedClick?: number | null;
  note?: string | null;
  closedByName?: string | null;
  closedByRole?: string | null;
  closedAt: string;
}

/**
 * Kassaga xizmat to'lovidan tashqari kirgan/chiqqan pul.
 * Xarajat emas — inkassatsiya va qaytarish klinikaning xarajati emas,
 * shuning uchun sof foydadan ayirilmaydi.
 */
export type CashMovementType = 'Encashment' | 'Refund' | 'CashIn';

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  Encashment: 'Inkassatsiya (kassadan olindi)',
  Refund: 'Bemorga qaytarildi',
  CashIn: 'Kassaga solindi',
};

export interface CashMovement {
  id: string;
  clinicId: string;
  date: string;
  type: CashMovementType;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  patientId?: string | null;
  transactionId?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

/** Kassa yozuvlariga qilingan o'zgarishlar izi */
export interface CashAuditLog {
  id: string;
  clinicId: string;
  date: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  afterClose: boolean;
  byName?: string | null;
  byRole?: string | null;
  createdAt: string;
}

// ─── Xabarlar (yagona xabarlar tizimi) ───
// 'both' — ikkalasiga ham yuboradi (SMS uchun alohida pul ketadi).
// 'telegram_first' — Telegram bo'lsa faqat Telegram, bo'lmasa/xato bo'lsa SMS.
export type MessageChannel = 'sms' | 'telegram' | 'both' | 'telegram_first';
// Trigger ro'yxati backendda (backend/triggers.ts) va oddiy String ustunda
// saqlanadi — yangi trigger qo'shish uchun migratsiya kerak emas.
export type AutomationTrigger = string;

/** Backend qaytaradigan trigger tavsifi — forma shu asosda quriladi */
export interface TriggerDescriptor {
  id: string;
  label: string;
  respectCooldown: boolean;
  supportsDoctorFilter: boolean;
  /** Tinch soatlar — trigger faqat shu oraliqda yuboradi (Toshkent vaqti) */
  sendWindow?: { fromHour: number; toHour: number };
  offset?: {
    label: string;
    unit: 'hour' | 'day' | 'month';
    options: number[];
    default: number;
  };
}

export interface MessageTemplate {
  id: string;
  clinicId: string;
  name: string;
  text: string;
  eskizTemplateId?: number | null;
  eskizStatus?: string | null; // Eskiz moderatsiya holati: moderation/confirmed/declined/error/not_found
  eskizSubmittedAt?: string | null;
  createdAt?: string;
}

export interface AutomationRule {
  id: string;
  clinicId: string;
  name: string;
  templateId: string;
  trigger: AutomationTrigger;
  hoursBefore?: number | null;
  channel: MessageChannel;
  doctorId?: string | null;
  active: boolean;
  createdAt?: string;
}

export interface MessageLog {
  id: string;
  clinicId: string;
  patientId?: string | null;
  type: string;
  // 'Retried' — xato yozuv qayta yuborishga jo'natilgan, natijasi alohida logda
  // 'Skipped' — chastota chegarasi sababli ataylab yuborilmagan (xato emas)
  status: 'Sent' | 'Failed' | 'Retried' | 'Skipped';
  message?: string | null;
  error?: string | null;
  sentAt: string;
  channel: 'sms' | 'telegram';
  source: string; // 'manual' | 'auto' | 'bulk' | 'debt' | 'birthday' | 'noshow' | 'retry'
  ruleId?: string | null;
  refId?: string | null;
  recipient?: string | null;
  patient?: { id: string; firstName: string; lastName: string; phone?: string } | null;
}

// Fonda ketayotgan qo'lda (bulk) yuborish holati
export interface BulkSendStatus {
  active: boolean;
  total?: number;
  sent?: number;
  failed?: number;
  done?: boolean;
  startedAt?: number;
  error?: string;
}

export interface InstallmentPlan {
  id: string;
  patientId: string;
  clinicId: string;
  doctorId?: string;
  service: string;
  totalAmount: number;
  totalPaid: number;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Completed' | 'Cancelled';
  createdAt?: string;
  items?: InstallmentItem[];
  
  // Relations mapped out
  patient?: Patient;
  doctor?: Doctor;
}

export interface InstallmentItem {
  id: string;
  planId: string;
  expectedDate: string;
  amount: number;
  status: 'Pending' | 'Paid';
  paidDate?: string;
  transactionId?: string;
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
  address?: string; // New field
  email?: string; // New field
  ownerPhone?: string; // Dedicated phone for clinic owner to receive reports
  status: 'Active' | 'Blocked' | 'Pending';
  planId: string;
  subscriptionStartDate: string; // Added field
  expiryDate: string;
  monthlyRevenue: number; // For SaaS analytics
  botToken?: string; // Telegram bot token
  customPrice?: number; // Optional custom pricing for special offers
  subscriptionType: 'Paid' | 'Trial';
  facebookPageId?: string;
  facebookPageAccessToken?: string;
  facebookPageName?: string;
  startHour?: number;
  endHour?: number;
  enableReceipts?: boolean;
  notificationMode?: 'telegram_only' | 'sms_only' | 'both';
  eskizEmail?: string;
  hasPassword?: boolean;
  isConnected?: boolean;
  eskizTokenExpiry?: string;
  dmedEnabled?: boolean;
  dmedApiKey?: string;
  dmedApiSecret?: string;
  dmedClinicId?: string;
  dmedToken?: string;
  dmedTokenExpiry?: string;
  prepaymentEnabled?: boolean;
  prepaymentCardNumber?: string;
  prepaymentAmount?: number;
  salesAgentId?: string | null; // Biriktirilgan sotuvchi (reseller)
  accessControl?: string | AccessControl | null; // DB'da JSON string, frontendda parse qilinadi
  cashShiftsPerDay?: number; // kuniga nechta kassa smenasi (1 yoki 2)
  leadApiKey?: string | null;        // tashqi lid manbalari uchun kalit
  leadApiKeyCreatedAt?: string | null;
}

// Rol bo'yicha modul/ma'lumot ko'rish huquqlari (Sozlamalar → Ruxsatlar).
// Maydon yo'q bo'lsa — hozirgi (hammasi ochiq) xatti-harakat saqlanadi.
export interface RoleAccess {
  hiddenModules?: string[];   // yashirilgan modul id lari (nav id: 'finance', 'leads', ...)
  showFinance?: boolean;      // pul ko'rsatkichlari (dashboard KPI, tushum grafigi); default true
  showPatientPhone?: boolean; // bemor telefon raqamlari; default true
}

export interface AccessControl {
  doctor?: RoleAccess;
  receptionist?: RoleAccess;
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

export interface Review {
  id: string;
  appointmentId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  appointment?: Appointment;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  service?: string;
  source?: string;
  notes?: string;
  address?: string;        // tashqi manbadan kelsa, bemorga aylantirishda ko'chiriladi
  dob?: string;            // tug'ilgan sana (kelgan bo'lsa)
  raw?: string;            // tashqi payload'ning asl nusxasi (JSON matn)
  status: 'New' | 'Contacted' | 'Thinking' | 'Booked' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
  clinicId: string;
}

// Tashqi lid manbalari (yuboraman.uz va h.k.) uchun integratsiya ma'lumotlari.
export interface LeadApiKeyInfo {
  apiKey: string | null;
  createdAt: string | null;
  endpoint: string;
}

export interface SalesAgent {
  id: string;
  name: string;
  username: string;
  password?: string;
  phone: string;
  status: 'Active' | 'Blocked';
  clinicCount?: number;
  createdAt: string;
}

export interface LabTechnician {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string;
  status: 'Active' | 'Inactive' | 'Deleted';
  clinicId: string;
  username?: string;
  password?: string;
}

export interface LabOrder {
  id: string;
  patientName: string;
  doctorName: string;
  technicianId: string;
  technicianName: string;
  clinicId: string;
  orderType: string;
  material?: string;
  toothNumbers?: string;
  notes?: string;
  status: 'Pending' | 'In-Progress' | 'Ready' | 'Delivered' | 'Cancelled';
  priority: 'Normal' | 'Urgent';
  orderedAt: string;
  deadline: string;
  deliveredAt?: string;
  price: number;
  clinicianNotes?: string;
  technicianNotes?: string;
}
