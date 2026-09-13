import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../Common';
import { Doctor, Appointment, Transaction, Patient, Expense, Review, Clinic } from '../../types';
import { getPaymentMethodLabel } from '../../utils/paymentMethods';
import { fmt, toDay, toMonth, todayIso, doctorPayroll, doctorHours, doctorWeekLoad, WEEKDAYS_UZ, WORK_DAYS_PER_WEEK, SALARY_TYPE_LABEL } from '../../utils/staffStats';
import { StatTile, Section, MonthSwitcher, Empty, ExpenseTable, PayStatus, serviceLabel, TH, TD } from './ProfileBits';

// Shifokor profili tablari: umumiy ko'rsatkichlar, qabullar, bemorlar, maosh va ish vaqti.
// Ilgari "Shifokor kartasi" sahifasida faqat qabullar, to'lovlar va bemorlar jadvali bor edi.

export interface DoctorTabsProps {
   tab: string;
   doctor: Doctor;
   appointments: Appointment[];
   transactions: Transaction[];
   patients: Patient[];
   expenses: Expense[];
   reviews: Review[];
   currentClinic?: Clinic;
   month: string;
   setMonth: (month: string) => void;
   canPay: boolean;
   onEditSalary: () => void;
   onPatientClick: (id: string) => void;
}

type P = DoctorTabsProps;

const FINISHED = ['Completed', 'Cancelled', 'No-Show'];

const ApptTable: React.FC<{ items: Appointment[]; emptyText: string; onPatientClick: (id: string) => void }> = ({ items, emptyText, onPatientClick }) => {
   if (items.length === 0) return <Empty text={emptyText} />;
   return (
      <div className="overflow-x-auto">
         <table className="w-full">
            <thead>
               <tr className="border-b border-gray-100 dark:border-gray-700/60">
                  <th className={TH}>Sana</th><th className={TH}>Bemor</th><th className={TH}>Xizmat</th><th className={TH}>Holat</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
               {items.map(a => (
                  <tr key={a.id}>
                     <td className={`${TD} whitespace-nowrap tabular-nums`}>
                        {toDay(a.date)}
                        <span className="block text-xs text-gray-400">{a.time}</span>
                     </td>
                     <td className={TD}>
                        <button onClick={() => a.patientId && onPatientClick(a.patientId)} className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left">{a.patientName}</button>
                     </td>
                     <td className={TD}>{a.type}</td>
                     <td className={`${TD} whitespace-nowrap`}><Badge status={a.status} /></td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
};

const MonthHeader: React.FC<{ title: string; month: string; setMonth: (m: string) => void }> = ({ title, month, setMonth }) => (
   <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <MonthSwitcher month={month} onChange={setMonth} />
   </div>
);

const Overview: React.FC<P> = ({ doctor, appointments, transactions, expenses, reviews, month, setMonth, onPatientClick }) => {
   const mine = appointments.filter(a => a.doctorId === doctor.id);
   const monthAppts = mine.filter(a => toMonth(a.date) === month);
   const done = monthAppts.filter(a => a.status === 'Completed').length;
   const patientCount = new Set(monthAppts.map(a => a.patientId)).size;
   const payroll = doctorPayroll(doctor, transactions, expenses, month);
   const apptIds = new Set(mine.map(a => a.id));
   const myReviews = reviews.filter(r => apptIds.has(r.appointmentId));
   const rating = myReviews.length ? myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length : 0;
   const today = todayIso();
   const upcoming = mine
      .filter(a => toDay(a.date) >= today && !FINISHED.includes(a.status))
      .sort((a, b) => (toDay(a.date) + a.time).localeCompare(toDay(b.date) + b.time))
      .slice(0, 6);
   const counts = new Map<string, number>();
   monthAppts.forEach(a => counts.set(a.type, (counts.get(a.type) || 0) + 1));
   const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
   const max = top[0]?.[1] || 1;

   return (
      <div className="space-y-4">
         <MonthHeader title="Ko'rsatkichlar" month={month} setMonth={setMonth} />
         <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatTile label="Qabullar" value={`${done}/${monthAppts.length}`} hint="yakunlangan / jami" />
            <StatTile label="Bemorlar" value={patientCount} hint="shu oyda" />
            <StatTile label="Keltirgan tushum" value={fmt(payroll.revenue)} hint="so'm" />
            <StatTile label="Reyting" value={rating > 0 ? `★ ${rating.toFixed(1)}` : '—'} hint={`${myReviews.length} ta baho`} />
         </div>
         <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3 min-w-0">
               <Section title="Yaqin qabullar">
                  <ApptTable items={upcoming} emptyText="Oldinda qabul yo'q" onPatientClick={onPatientClick} />
               </Section>
            </div>
            <div className="xl:col-span-2 min-w-0">
               <Section title="Ko'p bajargan xizmatlari">
                  {top.length === 0 ? <Empty text="Bu oyda qabul yo'q" /> : (
                     <ul className="p-4 space-y-3">
                        {top.map(([name, count]) => (
                           <li key={name}>
                              <div className="flex justify-between gap-3 text-sm">
                                 <span className="truncate text-gray-700 dark:text-gray-200">{name}</span>
                                 <span className="tabular-nums text-gray-500">{count}</span>
                              </div>
                              <div className="h-1.5 mt-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                 <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                              </div>
                           </li>
                        ))}
                     </ul>
                  )}
               </Section>
            </div>
         </div>
      </div>
   );
};

const AppointmentsTab: React.FC<P> = ({ doctor, appointments, onPatientClick }) => {
   const [view, setView] = useState<'upcoming' | 'history'>('upcoming');
   const today = todayIso();
   const mine = appointments.filter(a => a.doctorId === doctor.id);
   const isUpcoming = (a: Appointment) => toDay(a.date) >= today && !FINISHED.includes(a.status);
   const upcoming = mine.filter(isUpcoming).sort((a, b) => (toDay(a.date) + a.time).localeCompare(toDay(b.date) + b.time));
   const history = mine.filter(a => !isUpcoming(a)).sort((a, b) => (toDay(b.date) + b.time).localeCompare(toDay(a.date) + a.time));
   const options = [
      { key: 'upcoming' as const, label: `Kelgusi · ${upcoming.length}` },
      { key: 'history' as const, label: `Tarix · ${history.length}` },
   ];
   return (
      <div className="space-y-4">
         <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
            {options.map(o => (
               <button
                  key={o.key}
                  type="button"
                  onClick={() => setView(o.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${view === o.key ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
               >
                  {o.label}
               </button>
            ))}
         </div>
         <Section title={view === 'upcoming' ? 'Kelgusi qabullar' : 'Qabullar tarixi'}>
            <ApptTable items={view === 'upcoming' ? upcoming : history} emptyText="Qabul yo'q" onPatientClick={onPatientClick} />
         </Section>
      </div>
   );
};

const PatientsTab: React.FC<P> = ({ doctor, patients, onPatientClick }) => {
   const mine = patients
      .filter(p => p.doctorId === doctor.id)
      .sort((a, b) => String(b.lastVisit || '').localeCompare(String(a.lastVisit || '')));
   return (
      <Section title={`Biriktirilgan bemorlar · ${mine.length}`}>
         {mine.length === 0 ? <Empty text="Bu shifokorga bemor biriktirilmagan" /> : (
            <div className="overflow-x-auto">
               <table className="w-full">
                  <thead>
                     <tr className="border-b border-gray-100 dark:border-gray-700/60">
                        <th className={TH}>Bemor</th><th className={TH}>Telefon</th><th className={TH}>So'nggi tashrif</th><th className={TH}>Holat</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                     {mine.map(p => (
                        <tr key={p.id}>
                           <td className={TD}>
                              <button onClick={() => onPatientClick(p.id)} className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left">{p.lastName} {p.firstName}</button>
                           </td>
                           <td className={`${TD} whitespace-nowrap tabular-nums`}>{p.phone}</td>
                           <td className={`${TD} whitespace-nowrap tabular-nums`}>{toDay(p.lastVisit) || '—'}</td>
                           <td className={TD}>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                 {p.status === 'Active' ? 'Faol' : 'Arxiv'}
                              </span>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         )}
      </Section>
   );
};

const SalaryTab: React.FC<P> = ({ doctor, transactions, expenses, month, setMonth, canPay, onEditSalary }) => {
   const [showRevenue, setShowRevenue] = useState(false);
   const p = doctorPayroll(doctor, transactions, expenses, month);
   const pct = doctor.percentage || 0;
   const hasFixed = p.type === 'fixed' || p.type === 'fixed_kpi';
   const hasKpi = p.type === 'kpi' || p.type === 'fixed_kpi';
   const row = (label: React.ReactNode, value: string, cls = 'text-gray-900 dark:text-white') => (
      <div className="flex items-center justify-between gap-3">
         <span className="text-gray-500 dark:text-gray-400">{label}</span>
         <span className={`tabular-nums font-medium ${cls}`}>{value}</span>
      </div>
   );
   return (
      <div className="space-y-4">
         <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
               <p className="text-xs text-gray-500 dark:text-gray-400">Maosh turi</p>
               <p className={`text-lg font-bold ${p.type === 'none' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{SALARY_TYPE_LABEL[p.type]}</p>
            </div>
            {hasFixed && (
               <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fix maosh</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{fmt(doctor.fixedSalary || 0)} <span className="text-sm font-normal text-gray-400">so'm</span></p>
               </div>
            )}
            {hasKpi && (
               <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">KPI foizi</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{pct}%</p>
               </div>
            )}
            <button type="button" onClick={onEditSalary} className="ml-auto text-sm font-medium text-primary-600 hover:underline">O'zgartirish</button>
         </div>

         <MonthHeader title="Oylik hisob" month={month} setMonth={setMonth} />
         <PayStatus month={month} accrued={p.accrued} paid={p.paid} />

         <Section title="Maosh strukturasi">
            <div className="p-4 space-y-2.5 text-sm">
               {row('Fix maosh', fmt(p.fixed))}
               {row(<>KPI {hasKpi && <span className="text-xs text-gray-400">· tushum {fmt(p.revenue)} × {pct}%</span>}</>, fmt(p.kpi))}
               <div className="border-t border-gray-100 dark:border-gray-700/60 pt-2.5 space-y-2.5">
                  {row('Hisoblangan', fmt(p.accrued), 'text-gray-900 dark:text-white font-bold')}
                  {row("To'langan", fmt(p.paid), 'text-emerald-600 dark:text-emerald-400')}
                  {row('Qoldiq', fmt(Math.max(0, p.balance)), p.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white')}
               </div>
               {p.type === 'none' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">Maosh turi kiritilmagan, shuning uchun maosh hisoblanmaydi. "O'zgartirish" orqali belgilang.</p>
               )}
            </div>
         </Section>

         <Section
            title="Maosh to'lovlari"
            action={canPay ? <Link to="/finance?tab=hisobot" className="text-xs font-medium text-primary-600 hover:underline">Moliyada to'lash</Link> : undefined}
         >
            <ExpenseTable items={p.payments} emptyText="Bu oyda maosh to'lanmagan" />
         </Section>

         <Section
            title={`Keltirgan tushum · ${p.revenueTx.length} ta to'lov · ${fmt(p.revenue)} so'm`}
            action={<button type="button" onClick={() => setShowRevenue(v => !v)} className="text-xs font-medium text-primary-600 hover:underline">{showRevenue ? 'Yashirish' : "Ko'rsatish"}</button>}
         >
            {showRevenue && (p.revenueTx.length === 0 ? <Empty text="Bu oyda to'lov yo'q" /> : (
               <div className="overflow-x-auto">
                  <table className="w-full">
                     <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700/60">
                           <th className={TH}>Sana</th><th className={TH}>Bemor</th><th className={TH}>Xizmat</th><th className={TH}>Usul</th><th className={`${TH} text-right`}>Summa</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {p.revenueTx.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(tx => (
                           <tr key={tx.id}>
                              <td className={`${TD} whitespace-nowrap tabular-nums`}>{toDay(tx.date)}</td>
                              <td className={TD}>{tx.patientName}</td>
                              <td className={TD}>{serviceLabel(tx.service)}</td>
                              <td className={`${TD} whitespace-nowrap`}>{getPaymentMethodLabel(tx.type)}</td>
                              <td className={`${TD} text-right tabular-nums font-medium`}>{fmt(tx.amount)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            ))}
         </Section>
      </div>
   );
};

const ScheduleTab: React.FC<P> = ({ doctor, appointments, currentClinic }) => {
   const [offset, setOffset] = useState(0);
   const hours = doctorHours(doctor, currentClinic);
   const load = doctorWeekLoad(doctor, appointments, currentClinic, offset);
   const today = todayIso();
   const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
   const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
   const hoursText = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} soat`;
   const btn = 'p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white';
   return (
      <div className="space-y-4">
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="Ish soatlari" value={`${hh(hours.start)}–${hh(hours.end)}`} hint={hours.custom ? `kuniga ${hours.perDay} soat` : 'klinika ish vaqti'} />
            <StatTile label="Band vaqt" value={hoursText(load.bookedMinutes)} hint={`${Math.round(load.capacityMinutes / 60)} soatdan`} />
            <StatTile label="Yuklama" value={`${load.percent}%`} hint={`haftasiga ${WORK_DAYS_PER_WEEK} ish kuni`} tone={load.percent >= 80 ? 'green' : load.percent < 30 ? 'amber' : 'default'} />
         </div>

         <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Haftalik jadval</h3>
            <div className="flex items-center gap-2">
               {offset !== 0 && <button type="button" onClick={() => setOffset(0)} className="text-xs font-medium text-primary-600 hover:underline mr-1">Bu hafta</button>}
               <button type="button" className={btn} onClick={() => setOffset(o => o - 1)} aria-label="Oldingi hafta"><ChevronLeft className="w-4 h-4" /></button>
               <span className="min-w-[110px] text-center text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{dm(load.days[0].day)} – {dm(load.days[6].day)}</span>
               <button type="button" className={btn} onClick={() => setOffset(o => o + 1)} aria-label="Keyingi hafta"><ChevronRight className="w-4 h-4" /></button>
            </div>
         </div>

         <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 min-w-[560px]">
               {load.days.map((d, i) => {
                  const pct = load.perDayMinutes ? Math.min(100, Math.round((d.minutes / load.perDayMinutes) * 100)) : 0;
                  const isToday = d.day === today;
                  return (
                     <div
                        key={d.day}
                        className={`rounded-xl border p-3 text-center ${isToday ? 'border-primary-400 bg-primary-50/60 dark:border-primary-600 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'} ${i === 6 ? 'opacity-60' : ''}`}
                     >
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{WEEKDAYS_UZ[i]}</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{d.day.slice(8, 10)}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{d.count} qabul</p>
                        <p className="text-[11px] text-gray-400 tabular-nums">{hoursText(d.minutes)}</p>
                        <div className="h-1.5 mt-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                           <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                        </div>
                     </div>
                  );
               })}
            </div>
         </div>

         <p className="text-xs text-gray-500 dark:text-gray-400">
            Shifokorning ish kunlari hozircha bazada saqlanmaydi, shuning uchun yakshanba dam olish kuni deb olinadi.
            Ish soatini shifokorni tahrirlash oynasida o'zgartirish mumkin.
         </p>
      </div>
   );
};

export const DoctorTabs: React.FC<P> = (props) => {
   switch (props.tab) {
      case 'appointments': return <AppointmentsTab {...props} />;
      case 'patients': return <PatientsTab {...props} />;
      case 'salary': return <SalaryTab {...props} />;
      case 'schedule': return <ScheduleTab {...props} />;
      default: return <Overview {...props} />;
   }
};
