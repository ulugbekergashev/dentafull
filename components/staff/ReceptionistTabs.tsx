import React from 'react';
import { Link } from 'react-router-dom';
import { Receptionist, Transaction, Expense } from '../../types';
import { getPaymentMethodLabel } from '../../utils/paymentMethods';
import { fmt, receptionistMonth, todayIso, toDay } from '../../utils/staffStats';
import { StatTile, Section, MonthSwitcher, Empty, ExpenseTable, serviceLabel, TH, TD } from './ProfileBits';

// Resepshn profili: u qabul qilgan to'lovlar va unga to'langan maosh.
// Maosh summasi resepshn kartasida saqlanmaydi — faqat Moliyadagi to'lovlar bor.

interface ReceptionistTabsProps {
   tab: string;
   receptionist: Receptionist;
   transactions: Transaction[];
   expenses: Expense[];
   month: string;
   setMonth: (month: string) => void;
   canPay: boolean;
}

const ReceivedTable: React.FC<{ items: Transaction[]; emptyText: string }> = ({ items, emptyText }) => {
   if (items.length === 0) return <Empty text={emptyText} />;
   return (
      <div className="overflow-x-auto">
         <table className="w-full">
            <thead>
               <tr className="border-b border-gray-100 dark:border-gray-700/60">
                  <th className={TH}>Sana</th><th className={TH}>Bemor</th><th className={TH}>Xizmat</th><th className={TH}>Usul</th><th className={`${TH} text-right`}>Summa</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
               {items.map(tx => (
                  <tr key={tx.id}>
                     <td className={`${TD} whitespace-nowrap tabular-nums`}>
                        {toDay(tx.date)}
                        {tx.createdAt && <span className="ml-1.5 text-xs text-gray-400">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                     </td>
                     <td className={TD}>{tx.patientName}</td>
                     <td className={TD}>{serviceLabel(tx.service)}</td>
                     <td className={`${TD} whitespace-nowrap`}>{getPaymentMethodLabel(tx.type)}</td>
                     <td className={`${TD} text-right tabular-nums font-medium`}>{fmt(tx.amount)}</td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
};

export const ReceptionistTabs: React.FC<ReceptionistTabsProps> = ({ tab, receptionist, transactions, expenses, month, setMonth, canPay }) => {
   const m = receptionistMonth(receptionist, transactions, expenses, month);
   const today = todayIso();
   const todayItems = transactions.filter(tx => tx.receivedById === receptionist.id && tx.status === 'Paid' && toDay(tx.date) === today);
   const header = (title: string) => (
      <div className="flex flex-wrap items-center justify-between gap-3">
         <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
         <MonthSwitcher month={month} onChange={setMonth} />
      </div>
   );

   if (tab === 'payments') {
      return (
         <div className="space-y-4">
            {header(`Qabul qilgan to'lovlari · ${m.received.length} ta · ${fmt(m.receivedSum)} so'm`)}
            <Section title="To'lovlar"><ReceivedTable items={m.received} emptyText="Bu oyda qabul qilgan to'lov yo'q" /></Section>
         </div>
      );
   }

   if (tab === 'salary') {
      return (
         <div className="space-y-4">
            {header('Maosh')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               <StatTile label="Shu oyda to'langan" value={fmt(m.paid)} hint="so'm" tone={m.paid > 0 ? 'green' : 'default'} />
               <StatTile label="To'lovlar soni" value={m.payments.length} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
               Resepshn uchun oylik summasi kartada saqlanmaydi. To'lovlar Moliya bo'limida xarajat sifatida yoziladi.
            </p>
            <Section
               title="Maosh to'lovlari"
               action={canPay ? <Link to="/finance?tab=hisobot" className="text-xs font-medium text-primary-600 hover:underline">Moliyada to'lash</Link> : undefined}
            >
               <ExpenseTable items={m.payments} emptyText="Bu oyda maosh to'lanmagan" />
            </Section>
         </div>
      );
   }

   return (
      <div className="space-y-4">
         {header("Ko'rsatkichlar")}
         <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatTile label="Qabul qilgan to'lovlar" value={m.received.length} hint="shu oyda" />
            <StatTile label="Summa" value={fmt(m.receivedSum)} hint="so'm" />
            <StatTile label="Bugun" value={todayItems.length} hint={`${fmt(todayItems.reduce((s, tx) => s + tx.amount, 0))} so'm`} />
            <StatTile label="Maosh to'langan" value={fmt(m.paid)} hint="shu oyda" tone={m.paid > 0 ? 'green' : 'default'} />
         </div>
         <Section title="So'nggi qabul qilgan to'lovlari">
            <ReceivedTable items={m.received.slice(0, 8)} emptyText="Bu oyda qabul qilgan to'lov yo'q" />
         </Section>
         <p className="text-xs text-gray-400">Faqat kim qabul qilgani yozilgan to'lovlar hisoblanadi.</p>
      </div>
   );
};
