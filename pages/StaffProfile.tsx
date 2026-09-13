import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Phone, Trash2, Star, KeyRound, MapPin, Clock, Briefcase } from 'lucide-react';
import { Card } from '../components/Common';
import { useStaffEditors, StaffEditorsProps } from '../hooks/useStaffEditors';
import { StaffKind, ROLE_BADGE_CLASS } from '../components/StaffManagement';
import { DoctorTabs } from '../components/staff/DoctorTabs';
import { ReceptionistTabs } from '../components/staff/ReceptionistTabs';
import { TechnicianTabs } from '../components/staff/TechnicianTabs';
import { UserRole, Receptionist, LabTechnician, Appointment, Transaction, Patient, Expense, LabOrder, Review } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { currentMonth, doctorHours, doctorPayroll, fmt, fullName, initials, receptionistMonth, technicianStats, SALARY_TYPE_LABEL } from '../utils/staffStats';

// Xodim profili: shifokor, resepshn yoki texnik. Chapda maosh va aloqa ma'lumotlari,
// o'ngda tablar. Ilgari faqat shifokor uchun oddiy jadvalli sahifa bor edi.

interface StaffProfileProps extends StaffEditorsProps {
   kind: StaffKind;
   userRole: UserRole;
   receptionists: Receptionist[];
   labTechnicians: LabTechnician[];
   appointments: Appointment[];
   transactions: Transaction[];
   patients: Patient[];
   expenses: Expense[];
   labOrders: LabOrder[];
   reviews: Review[];
   onPatientClick: (id: string) => void;
}

const TABS: Record<StaffKind, { key: string; label: string }[]> = {
   doctor: [
      { key: 'overview', label: 'Umumiy' }, { key: 'appointments', label: 'Qabullar' }, { key: 'patients', label: 'Bemorlar' },
      { key: 'salary', label: 'Maosh' }, { key: 'schedule', label: 'Ish vaqti' },
   ],
   receptionist: [{ key: 'overview', label: 'Umumiy' }, { key: 'payments', label: "To'lovlar" }, { key: 'salary', label: 'Maosh' }],
   labTech: [{ key: 'overview', label: 'Umumiy' }, { key: 'orders', label: 'Buyurtmalar' }, { key: 'salary', label: 'Hisob-kitob' }],
};

export const StaffProfile: React.FC<StaffProfileProps> = (props) => {
   const { kind, userRole, doctors, receptionists, labTechnicians, appointments, transactions, patients, expenses, labOrders, reviews, branches = [], currentClinic, onPatientClick } = props;
   const { t } = useLanguage();
   const { staffId } = useParams<{ staffId: string }>();
   const navigate = useNavigate();
   const [searchParams, setSearchParams] = useSearchParams();
   const [month, setMonth] = useState(currentMonth());
   const editors = useStaffEditors({ ...props, onDeleted: () => navigate('/doctors') });

   const doctor = kind === 'doctor' ? doctors.find(d => d.id === staffId) : undefined;
   const receptionist = kind === 'receptionist' ? receptionists.find(r => r.id === staffId) : undefined;
   const tech = kind === 'labTech' ? labTechnicians.find(x => x.id === staffId) : undefined;
   const person = doctor || receptionist || tech;

   const tabs = TABS[kind];
   const requested = searchParams.get('tab');
   const tab = tabs.some(x => x.key === requested) ? String(requested) : 'overview';
   const selectTab = (key: string) => {
      const next = new URLSearchParams(searchParams);
      if (key === 'overview') next.delete('tab'); else next.set('tab', key);
      setSearchParams(next, { replace: true });
   };

   if (!person) {
      return (
         <Card className="p-10 text-center space-y-3">
            <p className="text-gray-600 dark:text-gray-300">Xodim topilmadi</p>
            <button onClick={() => navigate('/doctors')} className="text-primary-600 font-medium hover:underline">Xodimlar ro'yxatiga qaytish</button>
         </Card>
      );
   }

   const thisMonth = currentMonth();
   const roleLabel = kind === 'doctor' ? t('staff.role.doctor') : kind === 'receptionist' ? t('staff.role.receptionist') : t('staff.role.labTech');
   const active = person.status === 'Active';
   const statusLabel = active ? t('settings.staff.statusActive') : kind === 'labTech' ? 'Faol emas' : t('settings.staff.statusVoc');
   const name = doctor ? `Dr. ${fullName(doctor)}` : fullName(person);
   const position = doctor ? doctor.specialty : tech ? tech.specialty : 'Qabulxona';
   const branchName = doctor?.branchId ? branches.find(b => b.id === doctor.branchId)?.name : undefined;
   const doctorApptIds = doctor ? new Set(appointments.filter(a => a.doctorId === doctor.id).map(a => a.id)) : null;
   const doctorReviews = doctorApptIds ? reviews.filter(r => doctorApptIds.has(r.appointmentId)) : [];
   const rating = doctorReviews.length ? doctorReviews.reduce((s, r) => s + r.rating, 0) / doctorReviews.length : 0;
   const avatarStyle = doctor ? { backgroundColor: doctor.color || '#3B82F6' } : undefined;
   const avatarClass = doctor ? 'text-white'
      : receptionist ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
         : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
   const edit = () => { if (doctor) editors.openDoctor(doctor); else if (receptionist) editors.openReceptionist(receptionist); else if (tech) editors.openLabTech(tech); };
   const remove = () => { if (doctor) editors.askDeleteDoctor(doctor); else if (receptionist) editors.askDeleteReceptionist(receptionist); else if (tech) editors.askDeleteLabTech(tech); };
   const canPay = userRole === UserRole.CLINIC_ADMIN;
   const payroll = doctor ? doctorPayroll(doctor, transactions, expenses, thisMonth) : null;
   const recMonth = receptionist ? receptionistMonth(receptionist, transactions, expenses, thisMonth) : null;
   const techStats = tech ? technicianStats(tech, labOrders, expenses, thisMonth) : null;
   const hours = doctor ? doctorHours(doctor, currentClinic) : null;
   const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

   const infoRow = (Icon: React.ElementType, label: string, value?: React.ReactNode) => (
      <div className="flex items-center justify-between gap-3 py-2.5">
         <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 shrink-0"><Icon className="w-4 h-4" />{label}</span>
         <span className="text-sm font-medium text-gray-900 dark:text-white text-right truncate">{value || '—'}</span>
      </div>
   );
   const sumRow = (label: string, value: string, cls = 'text-gray-900 dark:text-white') => (
      <div className="flex justify-between gap-3 text-sm">
         <span className="text-gray-500 dark:text-gray-400">{label}</span>
         <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
      </div>
   );

   return (
      <div className="space-y-6 animate-fade-in">
         <button onClick={() => navigate('/doctors')} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-4 h-4" /> Xodimlar ro'yxati
         </button>

         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
               <div className={`h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-full flex items-center justify-center text-2xl font-bold shadow-sm ${avatarClass}`} style={avatarStyle}>
                  {initials(person)}
               </div>
               <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                     <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{name}</h1>
                     <button onClick={edit} title="Tahrirlash" className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <Pencil className="w-4 h-4" />
                     </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
                     <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${ROLE_BADGE_CLASS[kind]}`}>{roleLabel}</span>
                     <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{statusLabel}</span>
                     <span className="text-gray-500 dark:text-gray-400">{position}</span>
                     {branchName && <span className="text-gray-500 dark:text-gray-400">· {branchName}</span>}
                     {rating > 0 && (
                        <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                           <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />{rating.toFixed(1)}
                           <span className="text-gray-400">({doctorReviews.length})</span>
                        </span>
                     )}
                  </div>
               </div>
            </div>
            <div className="flex items-center gap-2">
               {person.phone && (
                  <a href={`tel:${person.phone}`} title="Qo'ng'iroq qilish" className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary-600">
                     <Phone className="w-4 h-4" />
                  </a>
               )}
               <button onClick={remove} title="O'chirish" className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
               </button>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <Card className="lg:col-span-4 p-5">
               <div className="rounded-xl p-4 bg-gradient-to-br from-primary-50 to-indigo-50 border border-primary-100 dark:from-gray-900/60 dark:to-gray-900/20 dark:border-gray-700">
                  {doctor && payroll && (
                     <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Maosh turi · {SALARY_TYPE_LABEL[payroll.type]}</p>
                        {payroll.type === 'none' ? (
                           <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-2">Maosh turi kiritilmagan</p>
                        ) : (
                           <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">
                              {payroll.type === 'kpi' ? `${doctor.percentage || 0}%` : fmt(doctor.fixedSalary || 0)}
                              <span className="text-sm font-normal text-gray-400 ml-1">{payroll.type === 'kpi' ? 'tushumdan' : "so'm"}</span>
                           </p>
                        )}
                        {payroll.type === 'fixed_kpi' && <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">+ KPI {doctor.percentage || 0}%</p>}
                        <div className="border-t border-primary-100 dark:border-gray-700 mt-3 pt-3 space-y-1.5">
                           {sumRow('Bu oy hisoblangan', fmt(payroll.accrued))}
                           {sumRow("To'langan", fmt(payroll.paid), 'text-emerald-600 dark:text-emerald-400')}
                        </div>
                     </>
                  )}
                  {recMonth && (
                     <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Bu oy to'langan maosh</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{fmt(recMonth.paid)} <span className="text-sm font-normal text-gray-400">so'm</span></p>
                        <div className="border-t border-primary-100 dark:border-gray-700 mt-3 pt-3">
                           {sumRow("Qabul qilgan to'lovlari", `${recMonth.received.length} ta`)}
                        </div>
                     </>
                  )}
                  {techStats && (
                     <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Faol buyurtmalar</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{techStats.active.length}</p>
                        <div className="border-t border-primary-100 dark:border-gray-700 mt-3 pt-3 space-y-1.5">
                           {sumRow("Muddati o'tgan", `${techStats.overdue.length} ta`, techStats.overdue.length ? 'text-red-600 dark:text-red-400' : undefined)}
                           {sumRow('Bu oy lab xarajati', fmt(techStats.paid))}
                        </div>
                     </>
                  )}
               </div>

               <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mt-5 mb-1">Aloqa ma'lumotlari</p>
               <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {infoRow(Phone, 'Telefon', person.phone)}
                  {doctor?.secondaryPhone && infoRow(Phone, "Qo'shimcha", doctor.secondaryPhone)}
                  {infoRow(Briefcase, 'Lavozim', position)}
                  {infoRow(KeyRound, 'Login', person.username)}
                  {doctor && branches.length > 0 && infoRow(MapPin, 'Filial', branchName || 'Barcha filiallar')}
                  {hours && infoRow(Clock, 'Ish vaqti', `${hh(hours.start)}–${hh(hours.end)}${hours.custom ? '' : ' · klinika'}`)}
               </div>
            </Card>

            <Card className="lg:col-span-8 overflow-hidden min-w-0">
               <div className="flex gap-1 px-3 border-b border-gray-100 dark:border-gray-700/60 overflow-x-auto">
                  {tabs.map(x => (
                     <button
                        key={x.key}
                        onClick={() => selectTab(x.key)}
                        className={`px-3 sm:px-4 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === x.key
                           ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                           : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                     >
                        {x.label}
                     </button>
                  ))}
               </div>
               <div className="p-4 sm:p-5">
                  {doctor && (
                     <DoctorTabs tab={tab} doctor={doctor} appointments={appointments} transactions={transactions} patients={patients} expenses={expenses}
                        reviews={reviews} currentClinic={currentClinic} month={month} setMonth={setMonth} canPay={canPay} onEditSalary={edit} onPatientClick={onPatientClick} />
                  )}
                  {receptionist && (
                     <ReceptionistTabs tab={tab} receptionist={receptionist} transactions={transactions} expenses={expenses} month={month} setMonth={setMonth} canPay={canPay} />
                  )}
                  {tech && <TechnicianTabs tab={tab} tech={tech} labOrders={labOrders} expenses={expenses} month={month} setMonth={setMonth} />}
               </div>
            </Card>
         </div>

         {editors.modals}
      </div>
   );
};
