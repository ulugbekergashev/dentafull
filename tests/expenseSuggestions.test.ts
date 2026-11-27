// Kassadagi xarajat nomlari tavsiyasi (utils/expenseSuggestions.ts).
// Ishga tushirish: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    collectExpenseSuggestions, filterExpenseSuggestions, hideExpenseTitle, loadHiddenExpenseTitles,
} from '../utils/expenseSuggestions';
import type { Expense, ExpenseCategory } from '../types';

const KASSA: ExpenseCategory[] = ['Other', 'Inventory', 'Lab', 'Rent', 'Utilities'];
let n = 0;
const exp = (title: string, amount: number, createdAt: string, extra: Partial<Expense> = {}): Expense => ({
    id: `e${++n}`, date: createdAt.slice(0, 10), amount, category: 'Other', title, clinicId: 'c1', createdAt, ...extra,
});

test('bir xil nom bitta bo\'ladi, ko\'p yozilgani oldinda, oxirgi summa va kategoriya olinadi', () => {
    const list = collectExpenseSuggestions([
        exp('Taksi', 20000, '2026-11-01T10:00:00Z'),
        exp('lidokain ', 50000, '2026-11-02T10:00:00Z', { category: 'Inventory' }),
        exp('Lidokain', 55000, '2026-11-20T10:00:00Z', { category: 'Inventory' }),
        exp('LIDOKAIN', 40000, '2026-11-10T10:00:00Z'),
    ], KASSA);
    assert.deepEqual(list.map(s => s.title), ['Lidokain', 'Taksi']);
    assert.equal(list[0].count, 3);
    assert.equal(list[0].amount, 55000);
    assert.equal(list[0].category, 'Inventory');
});

test('avtomatik va kassaga tegishli bo\'lmagan xarajatlar tavsiyaga kirmaydi', () => {
    const list = collectExpenseSuggestions([
        exp('Texnik: koronka', 300000, '2026-11-01T10:00:00Z', { category: 'Lab', labOrderId: 'l1' }),
        exp('Omborga kirim', 100000, '2026-11-01T10:00:00Z', { category: 'Inventory', inventoryItemId: 'i1' }),
        exp('Dr Aziz ulushi', 900000, '2026-11-01T10:00:00Z', { category: 'DoctorShare' }),
        exp('   ', 1000, '2026-11-01T10:00:00Z'),
        exp('Suv', 15000, '2026-11-01T10:00:00Z'),
    ], KASSA);
    assert.deepEqual(list.map(s => s.title), ['Suv']);
});

test('yozilgan harflar bo\'yicha qisqaradi, aynan yozilgan nom qayta chiqmaydi', () => {
    const all = collectExpenseSuggestions([
        exp('Lidokain', 1, '2026-11-01T10:00:00Z'),
        exp('Septanest', 1, '2026-11-01T10:00:00Z'),
        exp('Paxta', 1, '2026-11-01T10:00:00Z'),
    ], KASSA);
    assert.deepEqual(filterExpenseSuggestions(all, 'ka', {}).map(s => s.title), ['Lidokain']);
    assert.deepEqual(filterExpenseSuggestions(all, 'paxta', {}).map(s => s.title), []);
    assert.equal(filterExpenseSuggestions(all, '', {}).length, 3);
    assert.equal(filterExpenseSuggestions(all, '', {}, 2).length, 2);
});

test('yashirilgan nom chiqmaydi, keyin qayta yozilsa yana chiqadi', () => {
    const before = collectExpenseSuggestions([exp('Taksi', 1, '2026-11-01T10:00:00Z')], KASSA);
    const hidden = { taksi: Date.parse('2026-11-05T00:00:00Z') };
    assert.equal(filterExpenseSuggestions(before, '', hidden).length, 0);
    const after = collectExpenseSuggestions([
        exp('Taksi', 1, '2026-11-01T10:00:00Z'), exp('Taksi', 1, '2026-11-09T10:00:00Z'),
    ], KASSA);
    assert.equal(filterExpenseSuggestions(after, '', hidden).length, 1);
});

test('yashirish klinika bo\'yicha saqlanadi, xotira yopiq bo\'lsa ham ishlaydi', () => {
    const g = globalThis as any;
    const store = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const h = hideExpenseTitle('c1', {}, 'taksi', 100);
    assert.deepEqual(loadHiddenExpenseTitles('c1'), h);
    assert.deepEqual(loadHiddenExpenseTitles('c2'), {});

    g.localStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    const m = hideExpenseTitle('c3', {}, 'suv', 200);
    assert.deepEqual(loadHiddenExpenseTitles('c3'), m);
    delete g.localStorage;
});
