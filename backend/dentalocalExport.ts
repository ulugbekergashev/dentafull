/**
 * Klinikani dentalocal (kompyuterdagi nusxa) ga ko'chirish — eksport fayli (2026-10-22).
 *
 * Bulutdan dentalocal ga o'tayotgan klinikaning BUTUN bazasi bitta faylga yig'iladi; dentalocal
 * Sozlamalar → Import → "DentaCRM (bulut)dan ko'chirish" uni o'qiydi (dentalocal:
 * backend/dentacrmImport.ts). Faylni faqat platforma egasi (SUPER_ADMIN) yuklab oladi.
 *
 * Format:
 *   { format: 'dentacrm-clinic-export', version: 1, exportedAt, source, clinic, tables, checks }
 *   tables — har bir jadvalning barcha ustunlari bulutdagi nomlari bilan. dentalocal faqat
 *            o'zida bor ustunlarni oladi, shuning uchun sxemalar keyinchalik farq qilsa ham buzilmaydi.
 *   checks — ko'chirishdan keyin solishtirish uchun: jadval bo'yicha soni va har bir bemorning qarzi
 *            (backend/shared/debtRules.ts — dentalocal da ham aynan shu fayl, natija bir xil chiqishi shart).
 *
 * Faylda bemorlarning shaxsiy ma'lumoti va xodimlarning parol xeshlari bor (loginlar dentalocal da
 * ham ishlashi uchun). Shuning uchun dentalocal ishlatmaydigan maxfiy maydonlar (PINFL, pasport,
 * AI/DMED/to'lov kalitlari, Telegram/SMS loginlari) bu yerdayoq olib tashlanadi.
 */
import { buildDebtors } from './shared/debtRules';
import { patientTransferChecks, PatientChecks } from './shared/transferChecks';

export const EXPORT_FORMAT = 'dentacrm-clinic-export';
export const EXPORT_VERSION = 1;

/** Klinikaning dentalocal ga o'tadigan sozlamalari. Litsenziya, login, obuna, bot va SMS — yo'q */
export const CLINIC_SETTINGS = [
    'name', 'adminName', 'phone', 'address', 'email', 'ownerPhone',
    'startHour', 'endHour', 'enableReceipts', 'accessControl', 'cashShiftsPerDay',
];

/** Jadval bo'yicha olib tashlanadigan maydonlar (maxfiy yoki faqat bulutga tegishli) */
const DROP_FIELDS: Record<string, string[]> = {
    Patient: ['pinfl', 'passport', 'regionCode', 'districtCode', 'branchId'],
    Doctor: ['pinfl', 'argosId', 'specialtyCode', 'branchId'],
    Receptionist: ['telegramChatId'],
    Appointment: ['branchId'],
    Transaction: ['branchId'],
    Expense: ['branchId'],
    Service: ['snomedCode'],
};

/** Jadvallar dentalocal ga kiritiladigan tartibda (bog'langan yozuv oldin) */
export const EXPORT_TABLES = [
    'ServiceCategory', 'Service', 'Doctor', 'Receptionist', 'LabTechnician', 'Patient',
    'ICD10Code', 'PatientDiagnosis', 'ToothData', 'PatientPhoto', 'Appointment', 'Transaction',
    'InstallmentPlan', 'InstallmentItem', 'LabOrder', 'Expense', 'CashRegisterDay', 'CashMovement',
    'CashAuditLog', 'Recall', 'InventoryItem', 'InventoryLog',
] as const;

export type ExportTable = typeof EXPORT_TABLES[number];

export interface ClinicExport {
    format: string;
    version: number;
    exportedAt: string;
    source: { system: 'denta7'; clinicId: string; clinicName: string };
    clinic: Record<string, unknown>;
    tables: Record<ExportTable, Record<string, unknown>[]>;
    checks: {
        counts: Record<string, number>;
        /** Bemor id → qarz (ochiq yozuvlar + faol bo'lib to'lash qoldig'i) */
        patientDebts: Record<string, number>;
        totalDebt: number;
        /**
         * Bemor id → qarz, to'langan, avans, qabullar soni (backend/shared/transferChecks.ts) —
         * dentalocal yuklab bo'lgach o'zi yozganidan qayta hisoblab, shu bilan solishtiradi
         */
        patients: PatientChecks;
    };
}

const strip = (table: string, rows: any[]): Record<string, unknown>[] => {
    const drop = DROP_FIELDS[table] || [];
    return rows.map(row => {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row || {})) {
            if (drop.includes(key) || (value !== null && typeof value === 'object' && !(value instanceof Date))) continue;
            out[key] = value;
        }
        return out;
    });
};

/** Bitta klinikaning eksport fayli (JSON obyekt). Klinika topilmasa — xato */
export async function buildClinicExport(prisma: any, clinicId: string): Promise<ClinicExport> {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new Error('Klinika topilmadi');

    const own = { where: { clinicId } };
    const ofPatients = { where: { patient: { clinicId } } };
    const [
        ServiceCategory, Service, Doctor, Receptionist, LabTechnician, Patient,
        PatientDiagnosis, ToothData, PatientPhoto, Appointment, Transaction,
        InstallmentPlan, InstallmentItem, LabOrder, Expense, CashRegisterDay, CashMovement,
        CashAuditLog, Recall, InventoryItem, InventoryLog,
    ] = await Promise.all([
        prisma.serviceCategory.findMany(own),
        prisma.service.findMany(own),
        prisma.doctor.findMany(own),
        prisma.receptionist.findMany(own),
        prisma.labTechnician.findMany(own),
        prisma.patient.findMany(own),
        prisma.patientDiagnosis.findMany(own),
        prisma.toothData.findMany(ofPatients),
        prisma.patientPhoto.findMany(ofPatients),
        prisma.appointment.findMany(own),
        prisma.transaction.findMany(own),
        prisma.installmentPlan.findMany(own),
        prisma.installmentItem.findMany({ where: { plan: { clinicId } } }),
        prisma.labOrder.findMany(own),
        prisma.expense.findMany(own),
        prisma.cashRegisterDay.findMany(own),
        prisma.cashMovement.findMany(own),
        prisma.cashAuditLog.findMany(own),
        prisma.recall.findMany(own),
        prisma.inventoryItem.findMany(own),
        prisma.inventoryLog.findMany({ where: { item: { clinicId } } }),
    ]);
    // Tashxislar ICD-10 kodiga bog'langan — faqat ishlatilgan kodlar
    const codes = [...new Set((PatientDiagnosis as any[]).map(d => d.icd10Code || d.code).filter(Boolean))];
    const ICD10Code = codes.length ? await prisma.iCD10Code.findMany({ where: { code: { in: codes } } }) : [];

    const raw: Record<ExportTable, any[]> = {
        ServiceCategory, Service, Doctor, Receptionist, LabTechnician, Patient, ICD10Code,
        PatientDiagnosis, ToothData, PatientPhoto, Appointment, Transaction, InstallmentPlan,
        InstallmentItem, LabOrder, Expense, CashRegisterDay, CashMovement, CashAuditLog, Recall,
        InventoryItem, InventoryLog,
    };
    const tables = Object.fromEntries(EXPORT_TABLES.map(t => [t, strip(t, raw[t] || [])])) as ClinicExport['tables'];

    const debtors = buildDebtors(
        Transaction,
        InstallmentPlan,
        (Patient as any[]).map(p => ({ id: p.id, name: `${p.lastName} ${p.firstName}` })),
    );
    const patientDebts: Record<string, number> = {};
    for (const row of debtors) if (row.patientId) patientDebts[row.patientId] = row.total;

    const settings: Record<string, unknown> = {};
    for (const key of CLINIC_SETTINGS) if (clinic[key] !== undefined) settings[key] = clinic[key];

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        source: { system: 'denta7', clinicId: clinic.id, clinicName: clinic.name },
        clinic: settings,
        tables,
        checks: {
            counts: Object.fromEntries(EXPORT_TABLES.map(t => [t, tables[t].length])),
            patientDebts,
            totalDebt: debtors.reduce((sum, r) => sum + r.total, 0),
            patients: patientTransferChecks({ patients: Patient, transactions: Transaction, plans: InstallmentPlan, appointments: Appointment }),
        },
    };
}

/** Fayl nomi: lotin harflari, raqam va chiziqcha */
export const exportFileName = (clinicName: string, date: string): string =>
    `DentaCRM-${String(clinicName || 'klinika').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'klinika'}-${date}.json.gz`;
