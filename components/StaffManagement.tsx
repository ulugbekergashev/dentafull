import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from './Common';
import { useStaffEditors, StaffEditorsProps } from '../hooks/useStaffEditors';
import { Receptionist, LabTechnician, Appointment, Transaction, Expense, LabOrder } from '../types';
import { Edit, Trash2, Plus, ChevronDown, ChevronRight, Stethoscope, Phone, FlaskConical } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { currentMonth, toMonth, fmt, fullName, initials, doctorPayroll, doctorWeekLoad, receptionistMonth, technicianStats, WORK_DAYS_PER_WEEK } from '../utils/staffStats';

// Xodimlar ro'yxati: tepada qisqa ko'rsatkichlar, pastda jadval. Qator bosilsa
// xodim profili ochiladi. Qo'shish, tahrirlash va o'chirish oynalari useStaffEditors'da.

interface StaffManagementProps extends StaffEditorsProps {
   receptionists?: Receptionist[];
   labTechnicians?: LabTechnician[];
   appointments?: Appointment[];
   transactions?: Transaction[];
   expenses?: Expense[];
   labOrders?: LabOrder[];
}

export type StaffKind = 'doctor' | 'receptionist' | 'labTech';

export const staffProfilePath = (kind: StaffKind, id: string) =>
   kind === 'doctor' ? `/doctors/${id}` : kind === 'receptionist' ? `/doctors/receptionist/${id}` : `/doctors/technician/${id}`;

// Avatar ranglari bilan bir xil: resepshn — binafsha, texnik — yashil
export const ROLE_BADGE_CLASS: Record<StaffKind, string> = {
   doctor: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
   receptionist: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
   labTech: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

interface StaffRow {
   kind: StaffKind;
   id: string;
   name: string;
   initials: string;
   avatarStyle?: React.CSSProperties;
   avatarClass: string;
   phone: string;
   position: string;
   active: boolean;
   statusLabel: string;
   monthText: string;
   load?: { percent: number; hours: number };
   salary: string;
   salaryHint?: string;
   salaryWarn?: boolean;
   branchId?: string | null;
   edit: () => void;
   remove: () => void;
}

export const StaffManagement: React.FC<StaffManagementProps> = (props) => {
   const { doctors, receptionists = [], labTechnicians = [], appointments = [], transactions = [], expenses = [], labOrders = [], branches = [], currentClinic, onUpdateDoctor } = props;
   const { t } = useLanguage();
   const navigate = useNavigate();
   const editors = useStaffEditors(props);
   const [filter, setFilter] = useState<'all' | StaffKind>('all');
   const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
   const month = currentMonth();

   const doctorData = doctors.map(doc => {
      const monthAppts = appointments.filter(a => a.doctorId === doc.id && toMonth(a.date) === month);
      const done = monthAppts.filter(a => a.status === 'Completed').length;
      const payroll = doctorPayroll(doc, transactions, expenses, month);
      const load = doctorWeekLoad(doc, appointments, currentClinic);
      const pct = doc.percentage || 0;
      const salary = payroll.type === 'fixed' ? fmt(doc.fixedSalary || 0)
         : payroll.type === 'fixed_kpi' ? `${fmt(doc.fixedSalary || 0)} + ${pct}%`
            : payroll.type === 'kpi' ? `KPI ${pct}%` : 'Kiritilmagan';
      const row: StaffRow = {
         kind: 'doctor', id: doc.id, name: `Dr. ${fullName(doc)}`, initials: initials(doc),
         avatarStyle: { backgroundColor: doc.color || '#3B82F6' }, avatarClass: 'text-white shadow-sm',
         phone: doc.phone, position: doc.specialty, active: doc.status === 'Active',
         statusLabel: doc.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc'),
         monthText: `${done}/${monthAppts.length} qabul`,
         load: { percent: load.percent, hours: Math.round(load.bookedMinutes / 60) },
         salary, salaryHint: payroll.accrued > 0 ? `bu oy ${fmt(payroll.accrued)}` : undefined, salaryWarn: payroll.type === 'none',
         branchId: doc.branchId, edit: () => editors.openDoctor(doc), remove: () => editors.askDeleteDoctor(doc),
      };
      return { row, monthAppts: monthAppts.length, done, payroll, load };
   });

   const receptionistRows: StaffRow[] = receptionists.map(rec => {
      const m = receptionistMonth(rec, transactions, expenses, month);
      return {
         kind: 'receptionist', id: rec.id, name: fullName(rec), initials: initials(rec),
         avatarClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
         phone: rec.phone, position: 'Qabulxona', active: rec.status === 'Active',
         statusLabel: rec.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc'),
         monthText: `${m.received.length} to'lov`,
         salary: m.paid > 0 ? fmt(m.paid) : '—', salaryHint: m.paid > 0 ? "bu oy to'langan" : undefined,
         edit: () => editors.openReceptionist(rec), remove: () => editors.askDeleteReceptionist(rec),
      };
   });

   const techRows: StaffRow[] = labTechnicians.map(tech => {
      const s = technicianStats(tech, labOrders, expenses, month);
      return {
         kind: 'labTech', id: tech.id, name: fullName(tech), initials: initials(tech),
         avatarClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
         phone: tech.phone, position: tech.specialty, active: tech.status === 'Active',
         statusLabel: tech.status === 'Active' ? 'Faol' : 'Faol emas',
         monthText: `${s.active.length} faol buyurtma`,
         salary: s.paid > 0 ? fmt(s.paid) : '—', salaryHint: s.paid > 0 ? 'bu oy lab xarajati' : undefined,
         edit: () => editors.openLabTech(tech), remove: () => editors.askDeleteLabTech(tech),
      };
   });

   // Tepadagi ko'rsatkichlar
   const totalStaff = doctors.length + receptionists.length + labTechnicians.length;
   const monthAppts = doctorData.reduce((s, d) => s + d.monthAppts, 0);
   const monthDone = doctorData.reduce((s, d) => s + d.done, 0);
   const loadDoctors = doctorData.filter(d => d.row.active && d.load.capacityMinutes > 0);
   const avgLoad = loadDoctors.length ? Math.round(loadDoctors.reduce((s, d) => s + d.load.percent, 0) / loadDoctors.length) : 0;
   const fund = doctorData.reduce((s, d) => s + d.payroll.accrued, 0);
   const fundPaid = doctorData.reduce((s, d) => s + d.payroll.paid, 0);
   const noSalaryType = doctorData.filter(d => d.payroll.type === 'none').length;

   const roleLabel: Record<StaffKind, string> = {
      doctor: t('staff.role.doctor'),
      receptionist: t('staff.role.receptionist'),
      labTech: t('staff.role.labTech'),
   };

   const roleBadge = (kind: StaffKind) => (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${ROLE_BADGE_CLASS[kind]}`}>
         {roleLabel[kind]}
      </span>
   );

   const filters: { key: 'all' | StaffKind; label: string; count: number }[] = [
      { key: 'all', label: t('staff.filter.all'), count: totalStaff },
      { key: 'doctor', label: t('staff.filter.doctors'), count: doctors.length },
      { key: 'receptionist', label: t('staff.filter.receptionists'), count: receptionists.length },
      { key: 'labTech', label: t('staff.filter.labTechs'), count: labTechnicians.length },
   ];

   // Qo'shish menyusi: avval rol tanlanadi, keyin o'sha rolning odatdagi oynasi ochiladi
   const addOptions: { kind: StaffKind; icon: React.ElementType; open: () => void }[] = [
      { kind: 'doctor', icon: Stethoscope, open: () => editors.openDoctor() },
      { kind: 'receptionist', icon: Phone, open: () => editors.openReceptionist() },
      { kind: 'labTech', icon: FlaskConical, open: () => editors.openLabTech() },
   ];

   const rows = [...doctorData.map(d => d.row), ...receptionistRows, ...techRows]
      .filter(r => filter === 'all' || r.kind === filter);

   // Qatorni bosish profilni ochadi; ichidagi tugma, tanlagich va havola o'z ishini qiladi
   const onRowClick = (e: React.MouseEvent, row: StaffRow) => {
      if ((e.target as HTMLElement).closest('button, a, select, input, label')) return;
      navigate(staffProfilePath(row.kind, row.id));
   };

   const statCard = 'p-5';
   const statLabel = 'text-sm text-gray-500 dark:text-gray-400';
   const statValue = 'text-3xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums';
   const statHint = 'text-xs text-gray-500 dark:text-gray-400 mt-2';

   return (
      <div className="space-y-5">
         <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className={statCard}>
               <p className={statLabel}>Jami xodim</p>
               <p className={statValue}>{totalStaff}</p>
               <p className={statHint}>{doctors.length} shifokor · {receptionists.length} resepshn · {labTechnicians.length} texnik</p>
            </Card>
            <Card className={statCard}>
               <p className={statLabel}>Bu oy qabullar</p>
               <p className={statValue}>{monthAppts}</p>
               <p className={statHint}>{monthDone} tasi yakunlangan</p>
            </Card>
            <Card className={statCard}>
               <p className={statLabel}>O'rtacha haftalik yuklama</p>
               <p className={statValue}>{avgLoad}<span className="text-base font-medium text-gray-400 ml-1">%</span></p>
               <div className="h-1.5 mt-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${avgLoad}%` }} />
               </div>
               <p className={statHint}>Ish soati bo'yicha, haftasiga {WORK_DAYS_PER_WEEK} kun deb olingan</p>
            </Card>
            <Card className={statCard}>
               <p className={statLabel}>Shifokorlar maoshi, bu oy</p>
               <p className={statValue}>{fmt(fund)}</p>
               {noSalaryType > 0
                  ? <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{noSalaryType} ta shifokorning maosh turi kiritilmagan</p>
                  : <p className={statHint}>To'langan: {fmt(fundPaid)}</p>}
            </Card>
         </div>

         <Card className="overflow-hidden">
            <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-b border-gray-100 dark:border-gray-700/60">
               {/* Rol bo'yicha filtr */}
               <div className="flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                  {filters.map(f => (
                     <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filter === f.key
                           ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                           : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                     >
                        {f.label}
                        <span className="text-xs font-semibold text-gray-400 tabular-nums">{f.count}</span>
                     </button>
                  ))}
               </div>

               <div className="relative">
                  <Button size="sm" onClick={() => setIsAddMenuOpen(open => !open)} aria-expanded={isAddMenuOpen}>
                     <Plus className="w-4 h-4 mr-1.5" />
                     {t('staff.add')}
                     <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                  {isAddMenuOpen && (
                     <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsAddMenuOpen(false)} />
                        <div className="absolute right-0 mt-2 w-48 z-20 py-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
                           {addOptions.map(option => (
                              <button
                                 key={option.kind}
                                 type="button"
                                 onClick={() => { setIsAddMenuOpen(false); option.open(); }}
                                 className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                              >
                                 <option.icon className="w-4 h-4 text-gray-400" />
                                 {roleLabel[option.kind]}
                              </button>
                           ))}
                        </div>
                     </>
                  )}
               </div>
            </div>

            <div className="overflow-x-auto">
               <table className="w-full text-sm min-w-[900px]">
                  <thead>
                     <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                        <th className="px-5 py-3 font-medium">Xodim</th>
                        <th className="px-3 py-3 font-medium">Lavozim</th>
                        <th className="px-3 py-3 font-medium">Rol</th>
                        {branches.length > 0 && <th className="px-3 py-3 font-medium">Filial</th>}
                        <th className="px-3 py-3 font-medium">Bu oy</th>
                        <th className="px-3 py-3 font-medium">Haftalik yuklama</th>
                        <th className="px-3 py-3 font-medium text-right">Oylik</th>
                        <th className="px-3 py-3 font-medium">Holat</th>
                        <th className="px-5 py-3" />
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                     {rows.map(row => (
                        <tr key={`${row.kind}-${row.id}`} onClick={(e) => onRowClick(e, row)} className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                           <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                 <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${row.avatarClass}`} style={row.avatarStyle}>
                                    {row.initials}
                                 </div>
                                 <div className="min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">{row.name}</p>
                                    <p className="text-xs text-gray-500 tabular-nums">{row.phone}</p>
                                 </div>
                              </div>
                           </td>
                           <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{row.position || '—'}</td>
                           <td className="px-3 py-3">{roleBadge(row.kind)}</td>
                           {branches.length > 0 && (
                              <td className="px-3 py-3">
                                 {row.kind === 'doctor' ? (
                                    /* Filialni shu yerdan almashtirish mumkin. Bo'sh qiymat: barcha filiallarda ko'rinadi. */
                                    <select
                                       value={row.branchId || ''}
                                       onChange={(e) => onUpdateDoctor(row.id, { branchId: e.target.value || null })}
                                       title={t('branches.doctorBranch')}
                                       className="h-8 max-w-[160px] rounded-md border border-gray-200 dark:border-gray-700 bg-transparent text-xs text-gray-600 dark:text-gray-300 px-2 focus:ring-2 focus:ring-primary-500"
                                    >
                                       <option value="">{t('branches.doctorAllBranches')}</option>
                                       {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                 ) : <span className="text-gray-400">—</span>}
                              </td>
                           )}
                           <td className="px-3 py-3 text-gray-700 dark:text-gray-200 whitespace-nowrap tabular-nums">{row.monthText}</td>
                           <td className="px-3 py-3">
                              {row.load ? (
                                 <div className="flex items-center gap-2">
                                    <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                       <div className={`h-full rounded-full ${row.load.percent >= 80 ? 'bg-emerald-500' : row.load.percent >= 40 ? 'bg-primary-500' : 'bg-amber-500'}`} style={{ width: `${row.load.percent}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">{row.load.hours} soat</span>
                                 </div>
                              ) : <span className="text-gray-400">—</span>}
                           </td>
                           <td className="px-3 py-3 text-right whitespace-nowrap">
                              <p className={`tabular-nums ${row.salaryWarn ? 'text-amber-600 dark:text-amber-400 text-xs' : 'text-gray-900 dark:text-white'}`}>{row.salary}</p>
                              {row.salaryHint && <p className="text-[11px] text-gray-400">{row.salaryHint}</p>}
                           </td>
                           <td className="px-3 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${row.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                 {row.statusLabel}
                              </span>
                           </td>
                           <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-1">
                                 <button onClick={row.edit} title="Tahrirlash" className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md">
                                    <Edit className="w-4 h-4" />
                                 </button>
                                 <button onClick={row.remove} title="O'chirish" className="p-2 text-gray-400 hover:text-red-600 rounded-md">
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                                 <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                              </div>
                           </td>
                        </tr>
                     ))}
                     {rows.length === 0 && (
                        <tr>
                           <td colSpan={9} className="text-center py-10 text-gray-500 text-sm">{t('staff.empty')}</td>
                        </tr>
                     )}
                  </tbody>
               </table>
            </div>
         </Card>

         {editors.modals}
      </div>
   );
};
