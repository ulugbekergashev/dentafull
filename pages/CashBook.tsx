import React, { useMemo, useState } from 'react';
import {
    ChevronLeft, ChevronRight, Download, Wallet, Banknote, CreditCard,
    TrendingDown, Users, CalendarDays, AlertCircle, Coins, Lock, LockOpen, Check,
} from 'lucide-react';
import { Card, Button, Modal, Input } from '../components/Common';
import { Transaction, Expense, Doctor, Clinic, CashRegisterDay, EXPENSE_CATEGORY_LABELS } from '../types';
import {
    buildCashBookDay,
    buildCashBookMonth,
    getClosureStatus,
    formatDateLabel,
    formatMonthLabel,
    shiftDate,
    shiftMonth,
    CashBookTotals,
} from '../utils/cashbook';
import { exportCashBookDay, exportCashBookMonth } from '../utils/cashbookExport';
import { PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { formatDateToISO } from '../utils/dateUtils';

interface CashBookProps {
    transactions: Transaction[];
    expenses: Expense[];
    doctors: Doctor[];
    currentClinic?: Clinic | null;
    onPatientClick?: (patientId: string) => void;
    closures?: CashRegisterDay[];
    /** Yopilgan kunni qayta ochish — faqat klinika admini */
    canReopen?: boolean;
    onCloseDay?: (payload: { date: string; countedCash: number; expectedCash: number; note?: string }) => Promise<any>;
    onReopenDay?: (date: string) => Promise<void>;
}

const num = (v: number) => Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ');

// ── Yakun plitkasi ───────────────────────────────────────────────────────────
const Tile: React.FC<{
    label: string;
    value: number;
    icon: React.ElementType;
    tone?: 'default' | 'cash' | 'card' | 'expense' | 'drawer';
    hint?: string;
}> = ({ label, value, icon: Icon, tone = 'default', hint }) => {
    const tones: Record<string, string> = {
        default: 'text-gray-900 dark:text-white',
        cash: 'text-emerald-600 dark:text-emerald-400',
        card: 'text-blue-600 dark:text-blue-400',
        expense: 'text-red-600 dark:text-red-400',
        drawer: 'text-amber-600 dark:text-amber-400',
    };
    const bgs: Record<string, string> = {
        default: 'bg-gray-50 dark:bg-gray-700/40',
        cash: 'bg-emerald-50 dark:bg-emerald-900/20',
        card: 'bg-blue-50 dark:bg-blue-900/20',
        expense: 'bg-red-50 dark:bg-red-900/20',
        drawer: 'bg-amber-50 dark:bg-amber-900/20',
    };
    return (
        <Card className="p-4">
            <div className="flex items-start justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${bgs[tone]}`}>
                    <Icon className={`w-4 h-4 ${tones[tone]}`} />
                </div>
            </div>
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
            <h3 className={`text-lg font-black mt-0.5 ${tones[tone]}`}>{num(value)}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">{hint || 'UZS'}</p>
        </Card>
    );
};

const SummaryTiles: React.FC<{ totals: CashBookTotals }> = ({ totals }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Jami tushum" value={totals.gross} icon={Coins} hint={`${totals.paymentCount} ta to'lov`} />
        <Tile label="Naqd" value={totals.cashIn} icon={Banknote} tone="cash" />
        <Tile label="Naqdsiz" value={totals.nonCashIn} icon={CreditCard} tone="card" hint="Karta / Click / o'tkazma" />
        <Tile label="Xarajat" value={totals.expenseTotal} icon={TrendingDown} tone="expense" hint={`naqd: ${num(totals.cashExpense)}`} />
        <Tile label="Kassada qoldi" value={totals.drawer} icon={Wallet} tone="drawer" hint="naqd yashik" />
        <Tile label="Qarzga yozildi" value={totals.unpaid} icon={AlertCircle} hint="to'lanmagan" />
    </div>
);

// ── To'lov usullari qatori ───────────────────────────────────────────────────
const MethodStrip: React.FC<{ totals: CashBookTotals }> = ({ totals }) => {
    const shown = PAYMENT_METHODS.filter(m => (totals.byMethod[m.key] || 0) !== 0);
    if (shown.length === 0) return null;
    return (
        <Card className="p-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
                {shown.map(m => (
                    <div key={m.key} className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <div>
                            <p className="text-[11px] text-gray-400 leading-tight">{m.label}</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                                {num(totals.byMethod[m.key])}
                            </p>
                        </div>
                    </div>
                ))}
                {totals.fromBalance > 0 && (
                    <div className="flex items-center gap-2.5 pl-4 border-l border-dashed border-gray-300 dark:border-gray-600">
                        <div>
                            <p className="text-[11px] text-gray-400 leading-tight">Avansdan yechilgan</p>
                            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 leading-tight">
                                {num(totals.fromBalance)} <span className="text-[10px] font-normal">· kassaga kirmagan</span>
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

// ── Oylik jadvaldagi yopilish nishoni ────────────────────────────────────────
const ClosureChip: React.FC<{
    status?: ReturnType<typeof getClosureStatus>;
    hasActivity: boolean;
}> = ({ status, hasActivity }) => {
    if (!status?.closed) {
        if (!hasActivity) return <span className="text-gray-200 dark:text-gray-700">·</span>;
        return <span className="text-[10px] font-bold text-gray-400 uppercase">ochiq</span>;
    }
    if (status.changedAfterClose) {
        return (
            <span title="Yopilgandan keyin o'zgargan" className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3 h-3" /> o'zgardi
            </span>
        );
    }
    const exact = Math.abs(status.closure?.difference || 0) < 1;
    return exact ? (
        <span title="Kassa to'g'ri keldi" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" /> yopildi
        </span>
    ) : (
        <span title="Farq bilan yopilgan" className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
            <Lock className="w-3 h-3" /> {(status.closure!.difference > 0 ? '+' : '')}{num(status.closure!.difference)}
        </span>
    );
};

// ── Yopilgan kun banneri ─────────────────────────────────────────────────────
const ClosureBanner: React.FC<{
    status: ReturnType<typeof getClosureStatus>;
    currentDrawer: number;
    canReopen: boolean;
    onReopen: () => void;
    onRecount: () => void;
}> = ({ status, currentDrawer, canReopen, onReopen, onRecount }) => {
    const c = status.closure!;
    const diff = status.changedAfterClose ? status.currentDifference : c.difference;
    const exact = Math.abs(diff) < 1;

    const tone = status.changedAfterClose
        ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
        : exact
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20';

    return (
        <div className={`rounded-2xl border p-4 ${tone}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                        {exact && !status.changedAfterClose
                            ? <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            : <AlertCircle className={`w-5 h-5 ${status.changedAfterClose ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} />}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {status.changedAfterClose
                                ? 'Kun yopilgan, lekin keyin o\'zgardi'
                                : exact ? 'Kun yopilgan — kassa to\'g\'ri keldi' : 'Kun yopilgan — farq bor'}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            Sanalgan <b>{num(c.countedCash)}</b>
                            <span className="mx-1.5">·</span>
                            Hisob bo'yicha <b>{num(status.changedAfterClose ? currentDrawer : c.expectedCash)}</b>
                            <span className="mx-1.5">·</span>
                            Farq <b className={exact ? '' : diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                                {diff > 0 ? '+' : ''}{num(diff)}
                            </b>
                        </p>
                        {status.changedAfterClose && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                Yopilgandan keyin bu kunga to'lov yoki xarajat qo'shilgan.
                                Naqdni qayta sanab, kunni yangilang.
                            </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            {c.closedByName || 'Xodim'} · {new Date(c.closedAt).toLocaleString('uz-UZ')}
                            {c.note ? ` · ${c.note}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={onRecount}>
                        <Lock className="w-3.5 h-3.5 mr-1.5" /> Qayta sanash
                    </Button>
                    {canReopen && (
                        <Button variant="ghost" size="sm" onClick={onReopen}>
                            <LockOpen className="w-3.5 h-3.5 mr-1.5" /> Qayta ochish
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const CashBook: React.FC<CashBookProps> = ({
    transactions, expenses, doctors, currentClinic, onPatientClick,
    closures = [], canReopen = false, onCloseDay, onReopenDay,
}) => {
    const today = formatDateToISO(new Date());
    const [view, setView] = useState<'day' | 'month'>('day');
    const [date, setDate] = useState(today);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [isCloseOpen, setIsCloseOpen] = useState(false);
    const [countedInput, setCountedInput] = useState('');
    const [closeNote, setCloseNote] = useState('');
    const [closeSaving, setCloseSaving] = useState(false);

    const day = useMemo(
        () => buildCashBookDay(date, transactions, expenses, doctors),
        [date, transactions, expenses, doctors]
    );

    const monthData = useMemo(
        () => buildCashBookMonth(month, transactions, expenses, doctors),
        [month, transactions, expenses, doctors]
    );

    const clinicName = currentClinic?.name;

    const closureStatus = useMemo(
        () => getClosureStatus(date, day.totals.drawer, closures),
        [date, day.totals.drawer, closures]
    );

    // Oylik ko'rinishda har bir kunning yopilish holati
    const closureByDate = useMemo(() => {
        const map = new Map<string, ReturnType<typeof getClosureStatus>>();
        monthData.days.forEach(d => {
            map.set(d.date, getClosureStatus(d.date, d.totals.drawer, closures));
        });
        return map;
    }, [monthData.days, closures]);

    const handleExport = () => {
        if (view === 'day') {
            exportCashBookDay(day, doctors, clinicName, closureStatus);
        } else {
            const days = monthData.days
                .filter(d => d.hasActivity)
                .map(d => buildCashBookDay(d.date, transactions, expenses, doctors));
            exportCashBookMonth(monthData, days, doctors, clinicName, closures);
        }
    };

    const openDay = (targetDate: string) => {
        setDate(targetDate);
        setView('day');
    };

    const openCloseModal = () => {
        // Qayta yopishda avvalgi sanalgan summa boshlang'ich qiymat bo'ladi
        setCountedInput(closureStatus.closure ? String(closureStatus.closure.countedCash) : '');
        setCloseNote(closureStatus.closure?.note || '');
        setIsCloseOpen(true);
    };

    const countedValue = Number(countedInput.replace(/\s/g, ''));
    const previewDifference = isFinite(countedValue) ? countedValue - day.totals.drawer : 0;

    const handleCloseDay = async () => {
        if (!onCloseDay || !isFinite(countedValue) || countedInput.trim() === '') return;
        setCloseSaving(true);
        try {
            await onCloseDay({
                date,
                countedCash: countedValue,
                expectedCash: day.totals.drawer,
                note: closeNote.trim() || undefined,
            });
            setIsCloseOpen(false);
        } catch {
            // xatolik toast orqali ko'rsatiladi
        } finally {
            setCloseSaving(false);
        }
    };

    const handleReopen = async () => {
        if (!onReopenDay) return;
        await onReopenDay(date).catch(() => { });
    };

    const doctorCols = view === 'day' ? day.doctorColumns : monthData.doctorColumns;
    const totals = view === 'day' ? day.totals : monthData.totals;

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Kassa</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Kassaga tushgan va kassadan chiqqan haqiqiy pul
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Kun / Oy */}
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        {(['day', 'month'] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === v
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                {v === 'day' ? 'Kun' : 'Oy'}
                            </button>
                        ))}
                    </div>

                    {/* Sana boshqaruvi */}
                    {view === 'day' ? (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setDate(shiftDate(date, -1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Oldingi kun"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <input
                                type="date"
                                value={date}
                                onChange={e => e.target.value && setDate(e.target.value)}
                                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={() => setDate(shiftDate(date, 1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Keyingi kun"
                            >
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                            {date !== today && (
                                <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Bugun</Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setMonth(shiftMonth(month, -1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Oldingi oy"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <input
                                type="month"
                                value={month}
                                onChange={e => e.target.value && setMonth(e.target.value)}
                                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={() => setMonth(shiftMonth(month, 1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Keyingi oy"
                            >
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                    )}

                    <Button variant="secondary" onClick={handleExport} className="h-9">
                        <Download className="w-4 h-4 mr-2" /> Excel
                    </Button>

                    {view === 'day' && onCloseDay && !closureStatus.closed && (
                        <Button onClick={openCloseModal} className="h-9">
                            <Lock className="w-4 h-4 mr-2" /> Kunni yopish
                        </Button>
                    )}
                </div>
            </div>

            {/* Sarlavha: sana */}
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                {view === 'day' ? formatDateLabel(date) : formatMonthLabel(month)}
            </div>

            {view === 'day' && closureStatus.closed && closureStatus.closure && (
                <ClosureBanner
                    status={closureStatus}
                    currentDrawer={day.totals.drawer}
                    canReopen={canReopen && !!onReopenDay}
                    onReopen={handleReopen}
                    onRecount={openCloseModal}
                />
            )}

            <SummaryTiles totals={totals} />
            <MethodStrip totals={totals} />

            {view === 'day' ? (
                <>
                    {/* ── Kunlik matritsa: bemor × shifokor ── */}
                    <Card className="overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                To'lovlar — shifokorlar bo'yicha
                            </h3>
                            <span className="text-xs text-gray-400">({day.rows.length} ta)</span>
                        </div>

                        {day.rows.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <Wallet className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">Bu kunda to'lov qayd etilmagan</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700/40">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10 min-w-[180px]">
                                                Bemor
                                            </th>
                                            <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase w-20">Vaqt</th>
                                            {doctorCols.map(col => (
                                                <th key={col.id} className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap min-w-[110px]">
                                                    {col.name}
                                                </th>
                                            ))}
                                            <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">Usul</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {day.rows.map(row => (
                                            <tr
                                                key={row.id}
                                                className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${!row.isMoneyIn ? 'opacity-60' : ''}`}
                                            >
                                                <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                    {row.patientId && onPatientClick ? (
                                                        <button
                                                            onClick={() => onPatientClick(row.patientId!)}
                                                            className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left"
                                                        >
                                                            {row.patientName}
                                                        </button>
                                                    ) : (
                                                        <span className="font-medium text-gray-900 dark:text-white">{row.patientName}</span>
                                                    )}
                                                    {row.service && (
                                                        <p className="text-[11px] text-gray-400 truncate max-w-[220px]">{row.service}</p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{row.time || '—'}</td>
                                                {doctorCols.map(col => (
                                                    <td key={col.id} className="px-3 py-2.5 text-right tabular-nums">
                                                        {col.id === row.doctorId ? (
                                                            <span className={row.isMoneyIn ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-400 line-through'}>
                                                                {num(row.amount)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-200 dark:text-gray-700">·</span>
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <span
                                                        className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
                                                    >
                                                        <span
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ backgroundColor: PAYMENT_METHODS.find(m => m.key === row.method)?.color || '#9CA3AF' }}
                                                        />
                                                        {getPaymentMethodLabel(row.method)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 dark:bg-gray-700/40 border-t-2 border-gray-200 dark:border-gray-600">
                                        <tr>
                                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10">
                                                JAMI
                                            </td>
                                            <td />
                                            {doctorCols.map(col => (
                                                <td key={col.id} className="px-3 py-3 text-right font-black text-gray-900 dark:text-white tabular-nums">
                                                    {col.total ? num(col.total) : '—'}
                                                </td>
                                            ))}
                                            <td className="px-3 py-3 text-right font-black text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                                                {num(day.totals.gross)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* ── Kunlik xarajatlar ── */}
                    <Card className="overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingDown className="w-4 h-4 text-gray-400" />
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Xarajatlar</h3>
                                <span className="text-xs text-gray-400">({day.expenses.length} ta)</span>
                            </div>
                            <span className="text-sm font-black text-red-600 dark:text-red-400 tabular-nums">
                                {num(day.totals.expenseTotal)} UZS
                            </span>
                        </div>
                        {day.expenses.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                Bu kunda xarajat yo'q
                            </p>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {day.expenses.map(e => (
                                    <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.title}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {EXPENSE_CATEGORY_LABELS[e.category] || e.category}
                                                <span className="mx-1.5">·</span>
                                                {getPaymentMethodLabel(e.method)}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums shrink-0">
                                            −{num(e.amount)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {/* ── Kassa yakuni ── */}
                    <Card className="p-5">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Kun yakuni</h3>
                        <div className="max-w-sm space-y-2 text-sm">
                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                <span>Naqd tushum</span>
                                <span className="font-semibold tabular-nums">{num(day.totals.cashIn)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                <span>Naqd xarajat</span>
                                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                                    −{num(day.totals.cashExpense)}
                                </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600 text-base">
                                <span className="font-bold text-gray-900 dark:text-white">Kassada qoldi</span>
                                <span className="font-black tabular-nums text-amber-600 dark:text-amber-400">
                                    {num(day.totals.drawer)}
                                </span>
                            </div>
                            {closureStatus.closed && closureStatus.closure && (
                                <>
                                    <div className="flex justify-between text-gray-600 dark:text-gray-300 pt-2">
                                        <span>Kassir sanagan</span>
                                        <span className="font-semibold tabular-nums">{num(closureStatus.closure.countedCash)}</span>
                                    </div>
                                    <div className="flex justify-between text-base">
                                        <span className="font-bold text-gray-900 dark:text-white">Farq</span>
                                        <span className={`font-black tabular-nums ${Math.abs(closureStatus.currentDifference) < 1
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-red-600 dark:text-red-400'}`}>
                                            {closureStatus.currentDifference > 0 ? '+' : ''}{num(closureStatus.currentDifference)}
                                        </span>
                                    </div>
                                </>
                            )}
                            {day.totals.nonCashIn > 0 && (
                                <p className="text-[11px] text-gray-400 pt-2">
                                    Naqdsiz {num(day.totals.nonCashIn)} UZS hisob raqamga tushgan — yashikda emas.
                                </p>
                            )}
                            {!closureStatus.closed && onCloseDay && (
                                <Button onClick={openCloseModal} className="w-full mt-3">
                                    <Lock className="w-4 h-4 mr-2" /> Kunni yopish
                                </Button>
                            )}
                        </div>
                    </Card>
                </>
            ) : (
                /* ── Oylik daftar ── */
                <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Kunlik daftar</h3>
                        <span className="text-xs text-gray-400">kunni bosing — o'sha kun varag'i ochiladi</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700/40">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10">Kun</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">Naqd</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">Naqdsiz</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">Jami</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">Xarajat</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">Kassada qoldi</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">Holat</th>
                                    {doctorCols.map(col => (
                                        <th key={col.id} className="px-3 py-3 text-right text-[11px] font-bold text-gray-400 uppercase whitespace-nowrap min-w-[100px]">
                                            {col.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {monthData.days.map(d => (
                                    <tr
                                        key={d.date}
                                        onClick={() => openDay(d.date)}
                                        className={`cursor-pointer transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/10 ${!d.hasActivity ? 'opacity-40' : ''
                                            } ${d.date === today ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                                    >
                                        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10 whitespace-nowrap">
                                            {String(d.day).padStart(2, '0')}
                                            {d.date === today && <span className="ml-2 text-[10px] text-primary-600 font-bold">bugun</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {d.totals.cashIn ? num(d.totals.cashIn) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400">
                                            {d.totals.nonCashIn ? num(d.totals.nonCashIn) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-900 dark:text-white">
                                            {d.totals.gross ? num(d.totals.gross) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                                            {d.totals.expenseTotal ? `−${num(d.totals.expenseTotal)}` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                                            {d.totals.drawer ? num(d.totals.drawer) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <ClosureChip status={closureByDate.get(d.date)} hasActivity={d.hasActivity} />
                                        </td>
                                        {doctorCols.map(col => (
                                            <td key={col.id} className="px-3 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                                                {d.byDoctor[col.id] ? num(d.byDoctor[col.id]) : <span className="text-gray-200 dark:text-gray-700">·</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 dark:bg-gray-700/40 border-t-2 border-gray-200 dark:border-gray-600">
                                <tr>
                                    <td className="px-4 py-3 font-black text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10">JAMI</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">{num(monthData.totals.cashIn)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-blue-600 dark:text-blue-400">{num(monthData.totals.nonCashIn)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-gray-900 dark:text-white">{num(monthData.totals.gross)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-red-600 dark:text-red-400">−{num(monthData.totals.expenseTotal)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-amber-600 dark:text-amber-400">{num(monthData.totals.drawer)}</td>
                                    <td className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 whitespace-nowrap">
                                        {monthData.days.filter(d => closureByDate.get(d.date)?.closed).length}
                                        {' / '}
                                        {monthData.days.filter(d => d.hasActivity).length} yopilgan
                                    </td>
                                    {doctorCols.map(col => {
                                        const total = monthData.days.reduce((s, d) => s + (d.byDoctor[col.id] || 0), 0);
                                        return (
                                            <td key={col.id} className="px-3 py-3 text-right font-black tabular-nums text-gray-900 dark:text-white">
                                                {total ? num(total) : '—'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* ── Kunni yopish modali ── */}
            <Modal
                isOpen={isCloseOpen}
                onClose={() => setIsCloseOpen(false)}
                title={`Kunni yopish — ${formatDateLabel(date)}`}
            >
                <div className="space-y-5">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>Naqd tushum</span>
                            <span className="font-semibold tabular-nums">{num(day.totals.cashIn)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>Naqd xarajat</span>
                            <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">−{num(day.totals.cashExpense)}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-base">
                            <span className="font-bold text-gray-900 dark:text-white">Hisob bo'yicha kassada</span>
                            <span className="font-black tabular-nums text-amber-600 dark:text-amber-400">{num(day.totals.drawer)}</span>
                        </div>
                    </div>

                    <div>
                        <Input
                            label="Kassada haqiqatda sanalgan naqd (UZS)"
                            type="number"
                            value={countedInput}
                            onChange={e => setCountedInput(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="0"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setCountedInput(String(Math.round(day.totals.drawer)))}
                            className="mt-2 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                        >
                            Hisob bo'yicha summani qo'yish ({num(day.totals.drawer)})
                        </button>
                    </div>

                    {countedInput.trim() !== '' && isFinite(countedValue) && (
                        <div className={`rounded-xl p-4 border ${Math.abs(previewDifference) < 1
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-900 dark:text-white">Farq</span>
                                <span className={`text-lg font-black tabular-nums ${Math.abs(previewDifference) < 1
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'}`}>
                                    {previewDifference > 0 ? '+' : ''}{num(previewDifference)}
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                {Math.abs(previewDifference) < 1
                                    ? "Kassa to'g'ri keldi."
                                    : previewDifference > 0
                                        ? "Kassada hisobdan ko'p pul bor — kiritilmagan to'lov bo'lishi mumkin."
                                        : "Kassada hisobdan kam pul bor — yozilmagan xarajat bo'lishi mumkin."}
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Izoh (ixtiyoriy)</label>
                        <textarea
                            value={closeNote}
                            onChange={e => setCloseNote(e.target.value)}
                            rows={2}
                            placeholder="Masalan: 50 000 ertaga topshiriladi"
                            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    <p className="text-[11px] text-gray-400">
                        Yopish kunni qulflamaydi — kechroq kelgan to'lov baribir yoziladi.
                        Shunda bu sahifada "yopilgandan keyin o'zgardi" belgisi chiqadi.
                    </p>

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setIsCloseOpen(false)}>Bekor</Button>
                        <Button
                            className="flex-1"
                            onClick={handleCloseDay}
                            disabled={closeSaving || countedInput.trim() === '' || !isFinite(countedValue)}
                        >
                            {closeSaving ? 'Saqlanmoqda...' : closureStatus.closed ? 'Yangilash' : 'Kunni yopish'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
