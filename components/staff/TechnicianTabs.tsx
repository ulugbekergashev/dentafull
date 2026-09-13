import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LabTechnician, LabOrder, Expense } from '../../types';
import { fmt, technicianStats, todayIso, toDay } from '../../utils/staffStats';
import { StatTile, Section, MonthSwitcher, Empty, ExpenseTable, LAB_STATUS, TH, TD } from './ProfileBits';

// Texnik profili: laboratoriya buyurtmalari va ular uchun yozilgan xarajatlar.
// Buyurtma "Topshirildi" bo'lganda narxi avtomatik Laboratoriya xarajati bo'ladi.

interface TechnicianTabsProps {
   tab: string;
   tech: LabTechnician;
   labOrders: LabOrder[];
   expenses: Expense[];
   month: string;
   setMonth: (month: string) => void;
}

const OrdersTable: React.FC<{ items: LabOrder[]; emptyText: string }> = ({ items, emptyText }) => {
   if (items.length === 0) return <Empty text={emptyText} />;
   const today = todayIso();
   return (
      <div className="overflow-x-auto">
         <table className="w-full min-w-[640px]">
            <thead>
               <tr className="border-b border-gray-100 dark:border-gray-700/60">
                  <th className={TH}>Buyurtma</th><th className={TH}>Bemor</th><th className={TH}>Turi</th><th className={TH}>Shifokor</th>
                  <th className={TH}>Muddat</th><th className={TH}>Holat</th><th className={`${TH} text-right`}>Narx</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
               {items.map(o => {
                  const overdue = (o.status === 'Pending' || o.status === 'In-Progress') && o.deadline < today;
                  const status = LAB_STATUS[o.status] || LAB_STATUS['Pending'];
                  return (
                     <tr key={o.id}>
                        <td className={`${TD} whitespace-nowrap tabular-nums`}>{toDay(o.orderedAt)}</td>
                        <td className={TD}>{o.patientName}</td>
                        <td className={TD}>{o.orderType}</td>
                        <td className={TD}>{o.doctorName}</td>
                        <td className={`${TD} whitespace-nowrap tabular-nums ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>{toDay(o.deadline)}</td>
                        <td className={TD}><span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.className}`}>{status.label}</span></td>
                        <td className={`${TD} text-right tabular-nums`}>{fmt(o.price)}</td>
                     </tr>
                  );
               })}
            </tbody>
         </table>
      </div>
   );
};

export const TechnicianTabs: React.FC<TechnicianTabsProps> = ({ tab, tech, labOrders, expenses, month, setMonth }) => {
   const [showAll, setShowAll] = useState(false);
   const s = technicianStats(tech, labOrders, expenses, month);
   const header = (title: string) => (
      <div className="flex flex-wrap items-center justify-between gap-3">
         <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
         <MonthSwitcher month={month} onChange={setMonth} />
      </div>
   );

   if (tab === 'orders') {
      const items = (showAll ? s.orders : s.active).slice().sort((a, b) => String(b.orderedAt).localeCompare(String(a.orderedAt)));
      return (
         <div className="space-y-4">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
               {[{ key: false, label: `Faol · ${s.active.length}` }, { key: true, label: `Hammasi · ${s.orders.length}` }].map(opt => (
                  <button
                     key={String(opt.key)}
                     type="button"
                     onClick={() => setShowAll(opt.key)}
                     className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${showAll === opt.key ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                     {opt.label}
                  </button>
               ))}
            </div>
            <Section title="Buyurtmalar" action={<Link to="/lab" className="text-xs font-medium text-primary-600 hover:underline">Laboratoriya bo'limi</Link>}>
               <OrdersTable items={items} emptyText={showAll ? "Buyurtmalar yo'q" : "Faol buyurtma yo'q"} />
            </Section>
         </div>
      );
   }

   if (tab === 'salary') {
      return (
         <div className="space-y-4">
            {header('Hisob-kitob')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               <StatTile label="Topshirilgan buyurtmalar" value={s.delivered.length} hint={`${fmt(s.deliveredSum)} so'm`} />
               <StatTile label="Laboratoriya xarajati" value={fmt(s.paid)} hint="so'm, shu oyda" tone={s.paid > 0 ? 'green' : 'default'} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
               Texnikka alohida oylik yozilmaydi: buyurtma "Topshirildi" bo'lganda uning narxi Laboratoriya xarajati sifatida yoziladi.
            </p>
            <Section title="Laboratoriya xarajatlari">
               <ExpenseTable items={s.payments} emptyText="Bu oyda xarajat yozilmagan" />
            </Section>
         </div>
      );
   }

   return (
      <div className="space-y-4">
         {header("Ko'rsatkichlar")}
         <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatTile label="Faol buyurtmalar" value={s.active.length} hint="hozir" />
            <StatTile label="Muddati o'tgan" value={s.overdue.length} hint="hozir" tone={s.overdue.length > 0 ? 'red' : 'default'} />
            <StatTile label="Topshirilgan" value={s.delivered.length} hint="shu oyda" />
            <StatTile label="Summa" value={fmt(s.deliveredSum)} hint="so'm, shu oyda" />
         </div>
         <Section title="Faol buyurtmalar">
            <OrdersTable items={s.active.slice().sort((a, b) => a.deadline.localeCompare(b.deadline))} emptyText="Faol buyurtma yo'q" />
         </Section>
      </div>
   );
};
