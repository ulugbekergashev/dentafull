import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Card } from './Common';
import { Doctor, Receptionist, LabTechnician, Appointment, Transaction, Expense, LabOrder, Review, Clinic } from '../types';
import { staffProfilePath } from './StaffManagement';
import { StatTile, Empty, TH, TD } from './staff/ProfileBits';
import {
   fmt, fullName, initials, inRange, toDay, presetRange, PeriodPreset, payState, SALARY_TYPE_LABEL,
   doctorPeriodStats, receptionistPeriodStats, technicianPeriodStats,
} from '../utils/staffStats';

// Xodimlar statistikasi — tanlangan davr bo'yicha. Ro'yxat tabida raqam yo'q: tushum,
// qabullar, yuklama va maosh holati shu yerda, bir joyda. Hisoblar utils/staffStats'da,
// xodim profili bilan bir manbadan — sahifalar orasida raqamlar farq qilmaydi.

interface StaffStatisticsProps {
   doctors: Doctor[];
   receptionists: Receptionist[];
   labTechnicians: LabTechnician[];
   appointments: Appointment[];
   transactions: Transaction[];
   expenses: Expense[];
   labOrders: LabOrder[];
   reviews: Review[];
   currentClinic?: Clinic;
}

type SortKey = 'name' | 'total' | 'completion' | 'patients' | 'revenue' | 'avgCheck' | 'load' | 'accrued' | 'rating';

const PRESETS: { key: PeriodPreset; label: string }[] = [
   { key: 'month', label: 'Bu oy' },
   { key: 'lastMonth', label: "O'tgan oy" },
   { key: 'quarter', label: '3 oy' },
   { key: 'year', label: 'Bu yil' },
];

const TOOLTIP_STYLE = { backgroundColor: '#1F2937', border: 'none', borderRadius: 12, color: '#F9FAFB', fontSize: 12 };
const AXIS_TICK = { fill: '#9CA3AF', fontSize: 12 };

const PILL: Record<string, string> = {
   green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
   amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
   red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
   gray: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const compactMoney = (v: number) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10} mln` : fmt(v));

export const StaffStatistics: React.FC<StaffStatisticsProps> = ({ doctors, receptionists, labTechnicians, appointments, transactions, expenses, labOrders, reviews, currentClinic }) => {
   const navigate = useNavigate();
   const [preset, setPreset] = useState<PeriodPreset>('month');
   const [range, setRange] = useState(() => presetRange('month'));
   const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'revenue', dir: 'desc' });
   const { start, end } = range;

   const choosePreset = (key: PeriodPreset) => { setPreset(key); setRange(presetRange(key)); };
   const setCustom = (patch: Partial<{ start: string; end: string }>) => { setPreset('custom'); setRange(r => ({ ...r, ...patch })); };

   const rows = doctors.map(doctor => ({
      doctor,
      name: `Dr. ${fullName(doctor)}`,
      ...doctorPeriodStats(doctor, appointments, transactions, expenses, reviews, currentClinic, start, end),
   }));
   const sortKey = sort.key;
   const sorted = [...rows].sort((a, b) => {
      const cmp = sortKey === 'name' ? a.name.localeCompare(b.name) : (a as any)[sortKey] - (b as any)[sortKey];
      return sort.dir === 'asc' ? cmp : -cmp;
   });
   const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).map(r => ({
      id: r.doctor.id, name: r.doctor.lastName, revenue: r.revenue, done: r.done, rest: Math.max(0, r.total - r.done),
      color: r.doctor.color || '#3B82F6',
   }));

   const sum = (pick: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
   const totalRevenue = sum(r => r.revenue);
   const totalDone = sum(r => r.done);
   const totalAppts = sum(r => r.total);
   const pastAppts = sum(r => r.pastCount);
   const capacity = sum(r => r.capacityMinutes);
   const avgLoad = capacity ? Math.round((sum(r => r.bookedMinutes) / capacity) * 100) : 0;
   const accrued = sum(r => r.accrued);
   const paid = sum(r => r.paid);
   const noSalary = rows.filter(r => r.type === 'none').length;
   const periodRatings = reviews.filter(r => inRange(toDay(r.createdAt), start, end));
   const rating = periodRatings.length ? periodRatings.reduce((s, r) => s + r.rating, 0) / periodRatings.length : 0;

   const recRows = receptionists.map(rec => ({ rec, ...receptionistPeriodStats(rec, transactions, expenses, start, end) }));
   const techRows = labTechnicians.map(tech => ({ tech, ...technicianPeriodStats(tech, labOrders, expenses, start, end) }));

   const sortTh = (key: SortKey, label: string, right = false) => (
      <th className={`${TH} ${right ? 'text-right' : ''}`}>
         <button
            type="button"
            onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
            className={`inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white ${sort.key === key ? 'text-gray-900 dark:text-white' : ''}`}
         >
            {label}
            {sort.key === key && (sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
         </button>
      </th>
   );

   return (
      <div className="space-y-5">
         {/* Davr */}
         <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
               {PRESETS.map(p => (
                  <button
                     key={p.key}
                     type="button"
                     onClick={() => choosePreset(p.key)}
                     className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${preset === p.key ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                     {p.label}
                  </button>
               ))}
            </div>
            <div className="flex items-center gap-2">
               <input type="date" value={start} max={end} onChange={e => e.target.value && setCustom({ start: e.target.value })}
                  className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 dark:[color-scheme:dark]" />
               <span className="text-gray-400">—</span>
               <input type="date" value={end} min={start} onChange={e => e.target.value && setCustom({ end: e.target.value })}
                  className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 dark:[color-scheme:dark]" />
            </div>
         </Card>

         {/* Asosiy ko'rsatkichlar */}
         <Card className="p-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
               <StatTile label="Shifokorlar tushumi" value={fmt(totalRevenue)} hint={`so'm · ${sum(r => r.revenueCount)} ta to'lov`} />
               <StatTile label="Qabullar" value={`${totalDone}/${totalAppts}`} hint={`bajarilish ${pastAppts ? Math.round((totalDone / pastAppts) * 100) : 0}%`} />
               <StatTile label="O'rtacha yuklama" value={`${avgLoad}%`} hint="yakshanbasiz ish soati bo'yicha" />
               <StatTile label="Hisoblangan maosh" value={fmt(accrued)} hint={noSalary ? `${noSalary} ta shifokorda maosh turi yo'q` : `to'langan ${fmt(paid)}`} />
               <StatTile label="Klinika reytingi" value={rating ? `★ ${rating.toFixed(1)}` : '—'} hint={`${periodRatings.length} ta baho`} />
            </div>
         </Card>

         {/* Shifokorlar */}
         <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
               <h3 className="text-base font-semibold text-gray-900 dark:text-white">Shifokorlar</h3>
               <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ustun nomini bosib saralang, qatorni bosib profilni oching</p>
            </div>
            {rows.length === 0 ? <Empty text="Shifokorlar yo'q" /> : (
               <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px]">
                     <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700/60">
                           {sortTh('name', 'Shifokor')}
                           {sortTh('total', 'Qabullar', true)}
                           {sortTh('completion', 'Bajarilish', true)}
                           {sortTh('patients', 'Bemorlar', true)}
                           {sortTh('revenue', 'Tushum', true)}
                           {sortTh('avgCheck', "O'rtacha chek", true)}
                           {sortTh('load', 'Yuklama')}
                           {sortTh('accrued', 'Maosh', true)}
                           {sortTh('rating', 'Reyting', true)}
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {sorted.map(r => (
                           <tr key={r.doctor.id} onClick={() => navigate(staffProfilePath('doctor', r.doctor.id))} className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className={TD}>
                                 <div className="flex items-center gap-3 min-w-0">
                                    <span className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: r.doctor.color || '#3B82F6' }}>{initials(r.doctor)}</span>
                                    <div className="min-w-0">
                                       <p className="font-medium text-gray-900 dark:text-white truncate">{r.name}</p>
                                       <p className="text-xs text-gray-500 truncate">{r.doctor.specialty}</p>
                                    </div>
                                 </div>
                              </td>
                              <td className={`${TD} text-right tabular-nums`}>{r.done}/{r.total}</td>
                              <td className={`${TD} text-right tabular-nums`}>{r.pastCount ? `${r.completion}%` : '—'}</td>
                              <td className={`${TD} text-right tabular-nums`}>{r.patients}</td>
                              <td className={`${TD} text-right tabular-nums font-medium text-gray-900 dark:text-white`}>{fmt(r.revenue)}</td>
                              <td className={`${TD} text-right tabular-nums`}>{r.avgCheck ? fmt(r.avgCheck) : '—'}</td>
                              <td className={TD}>
                                 <div className="flex items-center gap-2">
                                    <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                       <div className="h-full rounded-full bg-primary-500" style={{ width: `${r.load}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 tabular-nums">{r.load}%</span>
                                 </div>
                              </td>
                              <td className={`${TD} text-right tabular-nums`}>{r.type === 'none' ? <span className="text-xs text-amber-600 dark:text-amber-400">Kiritilmagan</span> : fmt(r.accrued)}</td>
                              <td className={`${TD} text-right tabular-nums`}>{r.ratingCount ? `★ ${r.rating.toFixed(1)}` : '—'}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            )}
         </Card>

         {/* Grafiklar: har bir shifokor o'z kalendar rangida */}
         {rows.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
               <Card className="p-5">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tushum</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Shifokorga yozilgan to'langan to'lovlar</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, byRevenue.length * 52)}>
                     <BarChart data={byRevenue} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#6B7280" strokeOpacity={0.2} />
                        <XAxis type="number" tick={AXIS_TICK} tickFormatter={compactMoney} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={100} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#E5E7EB' }} formatter={(value: any) => [`${fmt(Number(value))} so'm`, 'Tushum']} />
                        <Bar dataKey="revenue" radius={[0, 6, 6, 0]} barSize={22}>
                           {byRevenue.map(d => <Cell key={d.id} fill={d.color} />)}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </Card>
               <Card className="p-5">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Qabullar</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Yakunlangan va qolgan qabullar</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, byRevenue.length * 52) + 28}>
                     <BarChart data={byRevenue} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#6B7280" strokeOpacity={0.2} />
                        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={100} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#E5E7EB' }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="done" name="Yakunlangan" stackId="appts" fill="#10B981" barSize={22} />
                        <Bar dataKey="rest" name="Qolgan" stackId="appts" fill="#94A3B8" fillOpacity={0.45} radius={[0, 6, 6, 0]} barSize={22} />
                     </BarChart>
                  </ResponsiveContainer>
               </Card>
            </div>
         )}

         {/* Maosh holati: shifokorlar va resepshnlar */}
         {(rows.length > 0 || recRows.length > 0) && (
            <Card className="overflow-hidden">
               <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Maosh holati</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                     Hisoblangan: fix summa davrdagi oylar soniga ko'paytiriladi, KPI tushumdan olinadi. To'langan: shu davrda Moliyada yozilgan to'lovlar.
                  </p>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                     <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700/60">
                           <th className={TH}>Xodim</th><th className={TH}>Maosh turi</th>
                           <th className={`${TH} text-right`}>Hisoblangan</th><th className={`${TH} text-right`}>To'langan</th>
                           <th className={`${TH} text-right`}>Qoldiq</th><th className={TH}>Holat</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {rows.map(r => {
                           const state = payState(r.accrued, r.paid);
                           return (
                              <tr key={r.doctor.id} onClick={() => navigate(`${staffProfilePath('doctor', r.doctor.id)}?tab=salary`)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                 <td className={`${TD} font-medium text-gray-900 dark:text-white`}>{r.name}</td>
                                 <td className={TD}>
                                    <span className={r.type === 'none' ? 'text-amber-600 dark:text-amber-400' : ''}>{SALARY_TYPE_LABEL[r.type]}</span>
                                    {(r.type === 'kpi' || r.type === 'fixed_kpi') && <span className="text-xs text-gray-400 ml-1">{r.doctor.percentage || 0}%</span>}
                                 </td>
                                 <td className={`${TD} text-right tabular-nums`}>{fmt(r.accrued)}</td>
                                 <td className={`${TD} text-right tabular-nums text-emerald-600 dark:text-emerald-400`}>{fmt(r.paid)}</td>
                                 <td className={`${TD} text-right tabular-nums`}>{r.balance > 0 ? fmt(r.balance) : '—'}</td>
                                 <td className={TD}>{state.tone === 'gray' ? <span className="text-gray-400">—</span> : <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PILL[state.tone]}`}>{state.label}</span>}</td>
                              </tr>
                           );
                        })}
                        {recRows.map(r => (
                           <tr key={r.rec.id} onClick={() => navigate(`${staffProfilePath('receptionist', r.rec.id)}?tab=salary`)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className={`${TD} font-medium text-gray-900 dark:text-white`}>{fullName(r.rec)}</td>
                              <td className={`${TD} text-gray-400`}>Resepshn · summa kiritilmaydi</td>
                              <td className={`${TD} text-right text-gray-400`}>—</td>
                              <td className={`${TD} text-right tabular-nums text-emerald-600 dark:text-emerald-400`}>{fmt(r.paid)}</td>
                              <td className={`${TD} text-right text-gray-400`}>—</td>
                              <td className={TD}>{r.paid > 0 ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PILL.green}`}>To'lov bor</span> : <span className="text-gray-400">—</span>}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </Card>
         )}

         {/* Resepshnlar va texniklar */}
         {(recRows.length > 0 || techRows.length > 0) && (
            <div className={`grid grid-cols-1 gap-5 ${recRows.length > 0 && techRows.length > 0 ? 'xl:grid-cols-2' : ''}`}>
               {recRows.length > 0 && (
                  <Card className="overflow-hidden">
                     <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Resepshnlar</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Qabul qilgan to'lovlari, kim qabul qilgani yozilganlari</p>
                     </div>
                     <table className="w-full">
                        <thead><tr className="border-b border-gray-100 dark:border-gray-700/60"><th className={TH}>Xodim</th><th className={`${TH} text-right`}>To'lovlar</th><th className={`${TH} text-right`}>Summa</th></tr></thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                           {recRows.map(r => (
                              <tr key={r.rec.id} onClick={() => navigate(staffProfilePath('receptionist', r.rec.id))} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                 <td className={`${TD} font-medium text-gray-900 dark:text-white`}>{fullName(r.rec)}</td>
                                 <td className={`${TD} text-right tabular-nums`}>{r.count}</td>
                                 <td className={`${TD} text-right tabular-nums`}>{fmt(r.sum)}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </Card>
               )}
               {techRows.length > 0 && (
                  <Card className="overflow-hidden">
                     <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Laboratoriya texniklari</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Faol va muddati o'tgan hozirgi holat, topshirilganlar tanlangan davr bo'yicha</p>
                     </div>
                     <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px]">
                           <thead><tr className="border-b border-gray-100 dark:border-gray-700/60"><th className={TH}>Xodim</th><th className={`${TH} text-right`}>Faol</th><th className={`${TH} text-right`}>Muddati o'tgan</th><th className={`${TH} text-right`}>Topshirilgan</th><th className={`${TH} text-right`}>Summa</th></tr></thead>
                           <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                              {techRows.map(r => (
                                 <tr key={r.tech.id} onClick={() => navigate(staffProfilePath('labTech', r.tech.id))} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className={`${TD} font-medium text-gray-900 dark:text-white`}>{fullName(r.tech)}</td>
                                    <td className={`${TD} text-right tabular-nums`}>{r.active}</td>
                                    <td className={`${TD} text-right tabular-nums ${r.overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>{r.overdue}</td>
                                    <td className={`${TD} text-right tabular-nums`}>{r.delivered}</td>
                                    <td className={`${TD} text-right tabular-nums`}>{fmt(r.deliveredSum)}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </Card>
               )}
            </div>
         )}
      </div>
   );
};
