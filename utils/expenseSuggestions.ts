/**
 * Kassada xarajat yozganda "Nomi" maydoni ostidagi tayyor nomlar.
 *
 * Nega: klinikalar har kuni bir xil dori/materialni sotib oladi va nomini har safar qo'lda
 * yozadi (2026-11-27 so'rov: "sozlamaga yozib qo'ysak keyin tanlasak"). Alohida ro'yxat
 * yuritmaslik uchun nomlar klinikaning o'zi avval yozgan xarajatlaridan olinadi:
 * eng ko'p yozilgani birinchi, bosilganda oxirgi kategoriya va summa ham qo'yiladi.
 */
import type { Expense, ExpenseCategory } from '../types';

export interface ExpenseSuggestion {
    /** Oxirgi marta qanday yozilgan bo'lsa, shunday */
    title: string;
    /** Taqqoslash kaliti: kichik harf, ortiqcha bo'shliqsiz */
    key: string;
    category: ExpenseCategory;
    /** Oxirgi yozilgan summa */
    amount: number;
    count: number;
    /** Oxirgi ishlatilgan vaqt (ms) — yashirilgandan keyin qayta yozilsa yana chiqadi */
    lastUsedAt: number;
}

/** Nom → yashirilgan vaqt (ms) */
export type HiddenExpenseTitles = Record<string, number>;

export const SUGGESTION_LIMIT = 8;

export const normalizeExpenseTitle = (title: string): string =>
    title.trim().replace(/\s+/g, ' ').toLowerCase();

const usedAt = (e: Expense): number => {
    const ms = Date.parse(e.createdAt || e.date);
    return Number.isFinite(ms) ? ms : 0;
};

/** Avtomatik yozilgan xarajatlar (laboratoriya, ombor) tavsiyaga kirmaydi — ularni odam yozmagan */
const isHandWritten = (e: Expense, categories: readonly ExpenseCategory[]): boolean =>
    !e.labOrderId && !e.inventoryItemId && categories.includes(e.category) && normalizeExpenseTitle(e.title || '') !== '';

/** Klinikaning xarajatlaridan nomlar ro'yxati: ko'p ishlatilgani oldin, teng bo'lsa yangisi oldin */
export function collectExpenseSuggestions(
    expenses: readonly Expense[],
    categories: readonly ExpenseCategory[],
): ExpenseSuggestion[] {
    const byKey = new Map<string, ExpenseSuggestion>();
    for (const e of expenses) {
        if (!isHandWritten(e, categories)) continue;
        const key = normalizeExpenseTitle(e.title);
        const at = usedAt(e);
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, { title: e.title.trim().replace(/\s+/g, ' '), key, category: e.category, amount: Number(e.amount) || 0, count: 1, lastUsedAt: at });
            continue;
        }
        const newer = at >= prev.lastUsedAt;
        byKey.set(key, {
            ...prev,
            count: prev.count + 1,
            ...(newer ? { title: e.title.trim().replace(/\s+/g, ' '), category: e.category, amount: Number(e.amount) || 0, lastUsedAt: at } : {}),
        });
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt);
}

/**
 * Hozir ko'rsatiladigan nomlar: yozilgan harflarga mos, yashirilmagan, aynan yozilgani emas.
 * Bo'sh maydonda eng ko'p ishlatilganlar chiqadi.
 */
export function filterExpenseSuggestions(
    all: readonly ExpenseSuggestion[],
    query: string,
    hidden: HiddenExpenseTitles,
    limit = SUGGESTION_LIMIT,
): ExpenseSuggestion[] {
    const q = normalizeExpenseTitle(query);
    return all
        .filter(s => !(hidden[s.key] && hidden[s.key] >= s.lastUsedAt))
        .filter(s => s.key !== q && (q === '' || s.key.includes(q)))
        .slice(0, limit);
}

/* ── Yashirilgan nomlar: shu qurilmada saqlanadi, xotira yopiq bo'lsa sahifa ochiq turguncha ── */

const HIDDEN_KEY_PREFIX = 'dentalflow_expense_hidden:';
const memoryHidden = new Map<string, HiddenExpenseTitles>();

export function loadHiddenExpenseTitles(clinicId: string): HiddenExpenseTitles {
    try {
        const raw = localStorage.getItem(HIDDEN_KEY_PREFIX + clinicId);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as HiddenExpenseTitles;
        }
    } catch { /* xotira yopiq yoki buzilgan yozuv */ }
    return memoryHidden.get(clinicId) || {};
}

export function hideExpenseTitle(clinicId: string, current: HiddenExpenseTitles, key: string, now = Date.now()): HiddenExpenseTitles {
    const next = { ...current, [key]: now };
    memoryHidden.set(clinicId, next);
    try {
        localStorage.setItem(HIDDEN_KEY_PREFIX + clinicId, JSON.stringify(next));
    } catch { /* sig'masa — shu sahifa ochiq turguncha yashirin */ }
    return next;
}
