import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Expense, EXPENSE_CATEGORY_LABELS } from '../../types';
import { getPaymentMethodLabel } from '../../utils/paymentMethods';
import { currentMonth, fmt, monthLabel, shiftMonth, toDay } from '../../utils/staffStats';

// Xodim profili sahifalari uchun kichik umumiy bo'laklar

export const TH = 'px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap';
export const TD = 'px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200';

/** "Xizmat|narx||...||TOTAL|jami" ko'rinishidagi matndan birinchi xizmat nomi */
export const serviceLabel = (service?: string) =>
   service?.includes('|') ? service.split('||')[0].split('|')[0] : (service || '—');

const TONE: Record<string, string> = {
   default: 'text-gray-900 dark:text-white',
   green: 'text-emerald-600 dark:text-emerald-400',
   amber: 'text-amber-600 dark:text-amber-400',
   red: 'text-red-600 dark:text-red-400',
};

export const StatTile: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: keyof typeof TONE }> = ({ label, value, hint, tone = 'default' }) => (
   <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 min-w-0">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums truncate ${TONE[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
   </div>
);

export const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
   <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
         <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
         {action}
      </div>
      {children}
   </div>
);

export const MonthSwitcher: React.FC<{ month: string; onChange: (month: string) => void }> = ({ month, onChange }) => {
   const btn = 'p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 disabled:pointer-events-none';
   return (
      <div className="flex items-center gap-2">
         <button type="button" className={btn} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Oldingi oy"><ChevronLeft className="w-4 h-4" /></button>
         <span className="min-w-[120px] text-center text-sm font-semibold text-gray-900 dark:text-white">{monthLabel(month)}</span>
         <button type="button" className={btn} disabled={month >= currentMonth()} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Keyingi oy"><ChevronRight className="w-4 h-4" /></button>
      </div>
   );
};

export const Empty: React.FC<{ text: string }> = ({ text }) => (
   <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{text}</p>
);

export const LAB_STATUS: Record<string, { label: string; className: string }> = {
   'Pending': { label: 'Kutilmoqda', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
   'In-Progress': { label: 'Ishlayapti', className: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
   'Ready': { label: 'Tayyor', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
   'Delivered': { label: 'Topshirildi', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
   'Cancelled': { label: 'Bekor qilindi', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export const ExpenseTable: React.FC<{ items: Expense[]; emptyText: string }> = ({ items, emptyText }) => {
   if (items.length === 0) return <Empty text={emptyText} />;
   return (
      <div className="overflow-x-auto">
         <table className="w-full">
            <thead>
               <tr className="border-b border-gray-100 dark:border-gray-700/60">
                  <th className={TH}>Sana</th><th className={TH}>Nomi</th><th className={TH}>Turi</th><th className={TH}>Usul</th><th className={`${TH} text-right`}>Summa</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
               {items.map(e => (
                  <tr key={e.id}>
                     <td className={`${TD} whitespace-nowrap tabular-nums`}>{toDay(e.date)}</td>
                     <td className={TD}>{e.title}</td>
                     <td className={`${TD} whitespace-nowrap`}>{EXPENSE_CATEGORY_LABELS[e.category] || e.category}</td>
                     <td className={`${TD} whitespace-nowrap`}>{e.method ? getPaymentMethodLabel(e.method) : '—'}</td>
                     <td className={`${TD} text-right tabular-nums font-medium`}>{fmt(e.amount)}</td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
};

/** Oy bo'yicha maosh holati: to'langan, qisman, to'lanmagan yoki hisoblanmagan */
export const PayStatus: React.FC<{ month: string; accrued: number; paid: number }> = ({ month, accrued, paid }) => {
   const label = monthLabel(month);
   let tone = 'gray', title = `${label}: hisoblangan maosh yo'q`, text = `Maosh turi va summasi kiritilgach shu yerda ko'rinadi`;
   if (accrued <= 0 && paid > 0) { tone = 'green'; title = `${label}: to'lov qilingan`; text = `${fmt(paid)} so'm`; }
   else if (accrued > 0 && paid >= accrued) { tone = 'green'; title = `${label}: to'langan ✓`; text = `${fmt(paid)} so'm`; }
   else if (accrued > 0 && paid > 0) { tone = 'amber'; title = `${label}: qisman to'langan`; text = `${fmt(paid)} / ${fmt(accrued)} so'm, qoldiq ${fmt(accrued - paid)}`; }
   else if (accrued > 0) { tone = 'red'; title = `${label}: to'lanmagan`; text = `Hisoblangan: ${fmt(accrued)} so'm`; }
   const cls: Record<string, string> = {
      gray: 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800/60 dark:border-gray-700 dark:text-gray-300',
      green: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
      amber: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
      red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
   };
   return (
      <div className={`rounded-xl border px-4 py-3 ${cls[tone]}`}>
         <p className="text-sm font-semibold">{title}</p>
         <p className="text-xs mt-0.5 opacity-90 tabular-nums">{text}</p>
      </div>
   );
};
