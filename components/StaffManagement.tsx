import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from './Common';
import { useStaffEditors, StaffEditorsProps } from '../hooks/useStaffEditors';
import { Receptionist, LabTechnician } from '../types';
import { Edit, Trash2, Plus, ChevronDown, ChevronRight, Stethoscope, Phone, FlaskConical } from 'lucide-react';
import { usePerms } from '../context/PermissionsContext';
import { useLanguage } from '../context/LanguageContext';
import { fmt, fullName, initials } from '../utils/staffStats';

// Xodimlar ro'yxati — faqat boshqaruv: kim, qaysi lavozimda, qanday maosh shartida.
// Raqamlar (tushum, qabullar, yuklama, maosh holati) Statistika tabida, bitta joyda.

interface StaffManagementProps extends StaffEditorsProps {
   receptionists?: Receptionist[];
   labTechnicians?: LabTechnician[];
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
   salary: string;
   salaryWarn?: boolean;
   branchId?: string | null;
   edit: () => void;
   remove: () => void;
}

export const StaffManagement: React.FC<StaffManagementProps> = (props) => {
   const { doctors, receptionists = [], labTechnicians = [], branches = [], onUpdateDoctor } = props;
   const { t } = useLanguage();
   const navigate = useNavigate();
   const editors = useStaffEditors(props);
   const perms = usePerms();
   const canCreate = perms.can('doctors', 'list', 'create');
   const canEdit = perms.can('doctors', 'list', 'edit');
   const canDelete = perms.can('doctors', 'list', 'delete');
   const [filter, setFilter] = useState<'all' | StaffKind>('all');
   const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

   const doctorRows: StaffRow[] = doctors.map(doc => {
      const type = doc.salaryType || 'none';
      const pct = doc.percentage || 0;
      return {
         kind: 'doctor', id: doc.id, name: `Dr. ${fullName(doc)}`, initials: initials(doc),
         avatarStyle: { backgroundColor: doc.color || '#3B82F6' }, avatarClass: 'text-white shadow-sm',
         phone: doc.phone, position: doc.specialty, active: doc.status === 'Active',
         statusLabel: doc.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc'),
         salary: type === 'fixed' ? `${fmt(doc.fixedSalary || 0)} so'm`
            : type === 'fixed_kpi' ? `${fmt(doc.fixedSalary || 0)} + ${pct}%`
               : type === 'kpi' ? `${pct}% KPI` : 'Kiritilmagan',
         salaryWarn: type === 'none', branchId: doc.branchId,
         edit: () => editors.openDoctor(doc), remove: () => editors.askDeleteDoctor(doc),
      };
   });

   const receptionistRows: StaffRow[] = receptionists.map(rec => ({
      kind: 'receptionist', id: rec.id, name: fullName(rec), initials: initials(rec),
      avatarClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
      phone: rec.phone, position: 'Qabulxona', active: rec.status === 'Active',
      statusLabel: rec.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc'),
      salary: '—', edit: () => editors.openReceptionist(rec), remove: () => editors.askDeleteReceptionist(rec),
   }));

   const techRows: StaffRow[] = labTechnicians.map(tech => ({
      kind: 'labTech', id: tech.id, name: fullName(tech), initials: initials(tech),
      avatarClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      phone: tech.phone, position: tech.specialty, active: tech.status === 'Active',
      statusLabel: tech.status === 'Active' ? 'Faol' : 'Faol emas',
      salary: '—', edit: () => editors.openLabTech(tech), remove: () => editors.askDeleteLabTech(tech),
   }));

   const roleLabel: Record<StaffKind, string> = {
      doctor: t('staff.role.doctor'),
      receptionist: t('staff.role.receptionist'),
      labTech: t('staff.role.labTech'),
   };

   const filters: { key: 'all' | StaffKind; label: string; count: number }[] = [
      { key: 'all', label: t('staff.filter.all'), count: doctors.length + receptionists.length + labTechnicians.length },
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

   const rows = [...doctorRows, ...receptionistRows, ...techRows].filter(r => filter === 'all' || r.kind === filter);

   // Qatorni bosish profilni ochadi; ichidagi tugma, tanlagich va havola o'z ishini qiladi
   const onRowClick = (e: React.MouseEvent, row: StaffRow) => {
      if ((e.target as HTMLElement).closest('button, a, select, input, label')) return;
      navigate(staffProfilePath(row.kind, row.id));
   };

   return (
      <>
         <Card className="overflow-hidden">
            <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-b border-gray-100 dark:border-gray-700/60">
               <div className="flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                  {filters.map(f => (
                     <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filter === f.key ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                        {f.label}
                        <span className="text-xs font-semibold text-gray-400 tabular-nums">{f.count}</span>
                     </button>
                  ))}
               </div>
               {canCreate && <div className="relative">
                  <Button size="sm" onClick={() => setIsAddMenuOpen(open => !open)} aria-expanded={isAddMenuOpen}>
                     <Plus className="w-4 h-4 mr-1.5" />{t('staff.add')}<ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                  {isAddMenuOpen && (
                     <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsAddMenuOpen(false)} />
                        <div className="absolute right-0 mt-2 w-48 z-20 py-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
                           {addOptions.map(option => (
                              <button key={option.kind} type="button" onClick={() => { setIsAddMenuOpen(false); option.open(); }}
                                 className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                                 <option.icon className="w-4 h-4 text-gray-400" />{roleLabel[option.kind]}
                              </button>
                           ))}
                        </div>
                     </>
                  )}
               </div>}
            </div>

            <div className="overflow-x-auto">
               <table className="w-full text-sm min-w-[760px]">
                  <thead>
                     <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                        <th className="px-5 py-3 font-medium">{t('auto.Xodim')}</th>
                        <th className="px-3 py-3 font-medium">{t('auto.Lavozim')}</th>
                        <th className="px-3 py-3 font-medium">{t('auto.Rol')}</th>
                        {branches.length > 0 && <th className="px-3 py-3 font-medium">{t('auto.Filial')}</th>}
                        <th className="px-3 py-3 font-medium text-right">{t('auto.Maosh sharti')}</th>
                        <th className="px-3 py-3 font-medium">{t('auto.Holat')}</th>
                        <th className="px-5 py-3" />
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                     {rows.map(row => (
                        <tr key={`${row.kind}-${row.id}`} onClick={(e) => onRowClick(e, row)} className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                           <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                 <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${row.avatarClass}`} style={row.avatarStyle}>{row.initials}</div>
                                 <div className="min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">{row.name}</p>
                                    <p className="text-xs text-gray-500 tabular-nums">{row.phone}</p>
                                 </div>
                              </div>
                           </td>
                           <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{row.position || '—'}</td>
                           <td className="px-3 py-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${ROLE_BADGE_CLASS[row.kind]}`}>{roleLabel[row.kind]}</span>
                           </td>
                           {branches.length > 0 && (
                              <td className="px-3 py-3">
                                 {row.kind === 'doctor' ? (
                                    <select value={row.branchId || ''} disabled={!canEdit} onChange={(e) => onUpdateDoctor(row.id, { branchId: e.target.value || null })} title={t('branches.doctorBranch')}
                                       className="h-8 max-w-[160px] rounded-md border border-gray-200 dark:border-gray-700 bg-transparent text-xs text-gray-600 dark:text-gray-300 px-2 focus:ring-2 focus:ring-primary-500">
                                       <option value="">{t('branches.doctorAllBranches')}</option>
                                       {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                 ) : <span className="text-gray-400">—</span>}
                              </td>
                           )}
                           <td className={`px-3 py-3 text-right whitespace-nowrap tabular-nums ${row.salaryWarn ? 'text-amber-600 dark:text-amber-400 text-xs' : 'text-gray-900 dark:text-white'}`}>{row.salary}</td>
                           <td className="px-3 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${row.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{row.statusLabel}</span>
                           </td>
                           <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-1">
                                 {canEdit && <button onClick={row.edit} title="Tahrirlash" className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md"><Edit className="w-4 h-4" /></button>}
                                 {canDelete && <button onClick={row.remove} title="O'chirish" className="p-2 text-gray-400 hover:text-red-600 rounded-md"><Trash2 className="w-4 h-4" /></button>}
                                 <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                              </div>
                           </td>
                        </tr>
                     ))}
                     {rows.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-10 text-gray-500 text-sm">{t('staff.empty')}</td></tr>
                     )}
                  </tbody>
               </table>
            </div>
         </Card>

         {editors.modals}
      </>
   );
};
