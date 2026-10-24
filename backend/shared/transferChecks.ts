/**
 * KO'CHIRISH TEKSHIRUVI — denta7 (bulut) va dentalocal da AYNAN BIR XIL fayl:
 *   backend/shared/transferChecks.ts (ikkala dasturda). Birida o'zgartirsangiz, ikkinchisiga ham ko'chiring.
 *
 * Bulut eksport faylini yasaganda har bir bemor bo'yicha to'rtta raqamni faylga yozadi
 * (backend/dentalocalExport.ts); dentalocal yuklab bo'lgach, o'zi YOZGAN narsadan xuddi shu
 * raqamlarni qaytadan hisoblaydi va solishtiradi (backend/dentacrmImport.ts):
 *  - debt         — qarz (backend/shared/debtRules.ts qoidasi: ochiq yozuvlar + faol bo'lib to'lash);
 *  - paid         — to'langan yozuvlar summasi (avans kiritish va avansdan to'lash ham);
 *  - balance      — bemor hisobidagi avans qoldig'i;
 *  - appointments — qabullar soni (bekor qilinganlari ham).
 * Farq faqat ko'chirishda biror narsa yo'qolsa yoki buzilsa chiqadi: hisob ikkala tomonda shu fayl.
 */
import { buildDebtors, DebtTx, DebtPlan } from './debtRules';

export const CHECK_FIELDS = ['debt', 'paid', 'balance', 'appointments'] as const;
export type CheckField = typeof CHECK_FIELDS[number];
export type PatientCheck = Record<CheckField, number>;
/** Bemor id → raqamlar */
export type PatientChecks = Record<string, PatientCheck>;

export interface CheckPatient {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    balance?: number | string | null;
}

export interface CheckAppointment {
    patientId?: string | null;
    date?: string | null;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
};
const fullName = (p: CheckPatient): string => `${p.lastName || ''} ${p.firstName || ''}`.trim();

/** Har bir bemor uchun to'rtta raqam (so'mda yaxlitlangan). Ro'yxatdagi har bir bemor qatnashadi — 0 bo'lsa ham */
export function patientTransferChecks(input: {
    patients: CheckPatient[];
    transactions: DebtTx[];
    plans: DebtPlan[];
    appointments: CheckAppointment[];
}): PatientChecks {
    const out: PatientChecks = {};
    for (const p of input.patients || []) {
        if (p?.id) out[p.id] = { debt: 0, paid: 0, balance: Math.round(num(p.balance)), appointments: 0 };
    }

    const debtors = buildDebtors(input.transactions || [], input.plans || [], (input.patients || []).map(p => ({ id: p.id, name: fullName(p) })));
    for (const row of debtors) if (row.patientId && out[row.patientId]) out[row.patientId].debt = Math.round(row.total);

    for (const tx of input.transactions || []) {
        const row = tx?.patientId ? out[tx.patientId] : undefined;
        if (row && tx.status === 'Paid' && tx.type !== 'Expense') row.paid += num(tx.amount);
    }

    // Bir bemorga bir kunda bitta qabul (ikkala dasturda ham) — kun bo'yicha sanaladi
    const seen = new Set<string>();
    for (const a of input.appointments || []) {
        const row = a?.patientId ? out[a.patientId] : undefined;
        const key = `${a?.patientId}|${a?.date}`;
        if (!row || seen.has(key)) continue;
        seen.add(key);
        row.appointments += 1;
    }

    for (const row of Object.values(out)) row.paid = Math.round(row.paid);
    return out;
}

export interface CheckMismatch {
    patientId: string;
    name: string;
    field: CheckField;
    cloud: number;
    local: number;
}

export interface TransferCheckResult {
    patients: number;
    /** Faylda bor (solishtirilgan) raqamlar — eski faylda faqat qarz bo'ladi */
    fields: CheckField[];
    totals: Record<CheckField, { cloud: number; local: number }>;
    /** Farq qilgan qatorlar (ko'pi bilan 30 tasi) */
    mismatches: CheckMismatch[];
    /** Farqi bor bemorlar soni */
    mismatchCount: number;
}

/**
 * Bulut raqamlari bilan shu bazadagilarni solishtiradi. `cloud` — fayldagi checks.patients;
 * eski faylda (2026-10-24 gacha) faqat checks.patientDebts bor — shunda faqat qarz solishtiriladi.
 */
export function compareTransferChecks(
    patients: CheckPatient[],
    cloud: { patients?: PatientChecks; patientDebts?: Record<string, number> } | null | undefined,
    local: PatientChecks
): TransferCheckResult {
    const full = cloud?.patients;
    const fields: CheckField[] = full ? [...CHECK_FIELDS] : ['debt'];
    const cloudOf = (id: string, field: CheckField): number =>
        full ? Math.round(num(full[id]?.[field])) : Math.round(num(cloud?.patientDebts?.[id]));

    const totals = Object.fromEntries(CHECK_FIELDS.map(f => [f, { cloud: 0, local: 0 }])) as TransferCheckResult['totals'];
    const mismatches: CheckMismatch[] = [];
    const bad = new Set<string>();
    for (const p of patients || []) {
        if (!p?.id) continue;
        for (const field of fields) {
            const c = cloudOf(p.id, field);
            const l = Math.round(num(local[p.id]?.[field]));
            totals[field].cloud += c;
            totals[field].local += l;
            if (c === l) continue;
            bad.add(p.id);
            if (mismatches.length < 30) mismatches.push({ patientId: p.id, name: fullName(p), field, cloud: c, local: l });
        }
    }
    return { patients: (patients || []).filter(p => p?.id).length, fields, totals, mismatches, mismatchCount: bad.size };
}
