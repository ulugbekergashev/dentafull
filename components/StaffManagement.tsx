import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Input, Modal, Select } from './Common';
import { UpgradePlanModal } from './UpgradePlanModal';
import { Doctor, Receptionist, LabTechnician, Clinic, SubscriptionPlan, Branch } from '../types';
import { Edit, Trash2, Plus, ChevronDown, Stethoscope, Phone, FlaskConical } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Xodimlar ro'yxati: shifokorlar, resepshnlar va laboratoriya texniklari bitta joyda.
// Ilgari ular Sozlamalar ichida uchta alohida bo'lim edi, yon menyudagi
// "Shifokorlar" esa faqat statistika ko'rsatardi — shifokor qo'shish uchun
// boshqa bo'limga o'tish kerak edi. Qo'shish va tahrirlash oynalari o'zgarmagan.

const DOCTOR_COLORS = [
   { name: 'Ko\'k', value: '#3B82F6' },
   { name: 'Yashil', value: '#10B981' },
   { name: 'Binafsha', value: '#8B5CF6' },
   { name: 'Qizil', value: '#F43F5E' },
   { name: 'Sariq', value: '#F59E0B' },
   { name: 'Havorang', value: '#06B6D4' },
   { name: 'To\'q ko\'k', value: '#6366F1' },
   { name: 'To\'q sariq', value: '#FB923C' },
];

interface StaffManagementProps {
   doctors: Doctor[];
   receptionists?: Receptionist[];
   labTechnicians?: LabTechnician[];
   onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
   onUpdateDoctor: (id: string, doctor: Partial<Doctor>) => void;
   onDeleteDoctor: (id: string) => void;
   onAddReceptionist?: (receptionist: Omit<Receptionist, 'id'>) => void;
   onUpdateReceptionist?: (id: string, receptionist: Partial<Receptionist>) => void;
   onDeleteReceptionist?: (id: string) => void;
   onAddLabTechnician?: (tech: Omit<LabTechnician, 'id' | 'status'>) => void;
   onUpdateLabTechnician?: (id: string, tech: Partial<LabTechnician>) => void;
   onDeleteLabTechnician?: (id: string) => void;
   branches?: Branch[];
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
}

type StaffKind = 'doctor' | 'receptionist' | 'labTech';

// Avatar ranglari bilan bir xil: resepshn — binafsha, texnik — yashil
const ROLE_BADGE_CLASS: Record<StaffKind, string> = {
   doctor: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
   receptionist: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
   labTech: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export const StaffManagement: React.FC<StaffManagementProps> = ({
   doctors, receptionists = [], labTechnicians = [], onAddDoctor, onUpdateDoctor, onDeleteDoctor, onAddReceptionist, onUpdateReceptionist, onDeleteReceptionist, onAddLabTechnician, onUpdateLabTechnician, onDeleteLabTechnician, branches = [], currentClinic, plans
}) => {
   const { t } = useLanguage();
   const [filter, setFilter] = useState<'all' | StaffKind>('all');
   const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

   // Doctor Modal State
   const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
   const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
   const [doctorForm, setDoctorForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', username: '', password: '', percentage: '', salaryType: 'none' as 'none' | 'fixed' | 'fixed_kpi' | 'kpi', fixedSalary: '', color: DOCTOR_COLORS[0].value, startHour: '', endHour: '', branchId: '' });

   // Receptionist Modal State
   const [isReceptionistModalOpen, setIsReceptionistModalOpen] = useState(false);
   const [editingReceptionistId, setEditingReceptionistId] = useState<string | null>(null);
   const [receptionistForm, setReceptionistForm] = useState({ firstName: '', lastName: '', phone: '', username: '', password: '' });

   // LabTechnician Modal State
   const [isLabTechModalOpen, setIsLabTechModalOpen] = useState(false);
   const [editingLabTechId, setEditingLabTechId] = useState<string | null>(null);
   const [labTechForm, setLabTechForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '' });

   // Tarif cheklovi: shifokorlar soni limitga yetganda ochiladi
   const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

   // Delete Confirmation Modals
   const [deleteConfirmDoctor, setDeleteConfirmDoctor] = useState<Doctor | null>(null);
   const [deleteConfirmLabTech, setDeleteConfirmLabTech] = useState<LabTechnician | null>(null);
   const [deleteConfirmReceptionist, setDeleteConfirmReceptionist] = useState<Receptionist | null>(null);

   const handleOpenDoctorModal = (doctor?: Doctor) => {
      if (!doctor) {
         // Adding new doctor - check limit
         const currentPlanId = currentClinic?.planId;
         const currentPlan = plans?.find(p => p.id === currentPlanId);
         const maxDoctors = currentPlan?.maxDoctors || 10;

         if (doctors.length >= maxDoctors) {
            setIsUpgradeModalOpen(true);
            return;
         }
      }

      if (doctor) {
         setEditingDoctorId(doctor.id);
         setDoctorForm({
            firstName: doctor.firstName,
            lastName: doctor.lastName,
            specialty: doctor.specialty,
            phone: doctor.phone,
            secondaryPhone: doctor.secondaryPhone || '',
            username: doctor.username || '',
            password: '',
            percentage: (doctor.percentage || 0).toString(),
            salaryType: (doctor.salaryType || 'none') as 'none' | 'fixed' | 'fixed_kpi' | 'kpi',
            fixedSalary: (doctor.fixedSalary || 0).toString(),
            color: doctor.color || DOCTOR_COLORS[0].value,
            startHour: doctor.startHour != null ? String(doctor.startHour) : '',
            endHour: doctor.endHour != null ? String(doctor.endHour) : '',
            branchId: doctor.branchId || '',
         });
      } else {
         setEditingDoctorId(null);
         setDoctorForm({ firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', username: '', password: '', percentage: '', salaryType: 'none', fixedSalary: '', color: DOCTOR_COLORS[0].value, startHour: '', endHour: '', branchId: '' });
      }
      setIsDoctorModalOpen(true);
   };

   const handleDoctorSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingDoctorId) {
         const updateData: any = { ...doctorForm };
         if (!updateData.password) delete updateData.password;
         updateData.percentage = Number(updateData.percentage) || 0;
         updateData.fixedSalary = Number(updateData.fixedSalary) || 0;
         updateData.startHour = doctorForm.startHour !== '' ? Number(doctorForm.startHour) : null;
         updateData.endHour = doctorForm.endHour !== '' ? Number(doctorForm.endHour) : null;
         updateData.branchId = doctorForm.branchId || null;
         onUpdateDoctor(editingDoctorId, updateData);
      } else {
         onAddDoctor({
            ...doctorForm,
            percentage: Number(doctorForm.percentage) || 0,
            fixedSalary: Number(doctorForm.fixedSalary) || 0,
            startHour: doctorForm.startHour !== '' ? Number(doctorForm.startHour) : null,
            endHour: doctorForm.endHour !== '' ? Number(doctorForm.endHour) : null,
            branchId: doctorForm.branchId || null,
            status: 'Active'
         });
      }
      setIsDoctorModalOpen(false);
   };

   const handleOpenReceptionistModal = (receptionist?: Receptionist) => {
      if (receptionist) {
         setEditingReceptionistId(receptionist.id);
         setReceptionistForm({
            firstName: receptionist.firstName,
            lastName: receptionist.lastName,
            phone: receptionist.phone,
            username: receptionist.username,
            password: ''
         });
      } else {
         setEditingReceptionistId(null);
         setReceptionistForm({ firstName: '', lastName: '', phone: '', username: '', password: '' });
      }
      setIsReceptionistModalOpen(true);
   };

   const handleReceptionistSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingReceptionistId) {
         if (onUpdateReceptionist) {
            const updateData: any = { ...receptionistForm };
            if (!updateData.password) {
               delete updateData.password;
            }
            onUpdateReceptionist(editingReceptionistId, updateData);
         }
      } else {
         if (onAddReceptionist) {
            onAddReceptionist({
               ...receptionistForm,
               status: 'Active',
               clinicId: currentClinic?.id || ''
            });
         }
      }
      setIsReceptionistModalOpen(false);
   };

   const handleOpenLabTechModal = (tech?: LabTechnician) => {
      if (tech) {
         setEditingLabTechId(tech.id);
         setLabTechForm({
            firstName: tech.firstName,
            lastName: tech.lastName,
            specialty: tech.specialty,
            phone: tech.phone,
            username: tech.username || '',
            password: ''
         });
      } else {
         setEditingLabTechId(null);
         setLabTechForm({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '' });
      }
      setIsLabTechModalOpen(true);
   };

   const handleLabTechSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const data: any = {
         firstName: labTechForm.firstName,
         lastName: labTechForm.lastName,
         specialty: labTechForm.specialty,
         phone: labTechForm.phone,
         username: labTechForm.username || undefined,
      };
      if (labTechForm.password) data.password = labTechForm.password;
      if (editingLabTechId) {
         if (onUpdateLabTechnician) onUpdateLabTechnician(editingLabTechId, data);
      } else {
         if (onAddLabTechnician) onAddLabTechnician(data);
      }
      setIsLabTechModalOpen(false);
   };

   const roleLabel: Record<StaffKind, string> = {
      doctor: t('staff.role.doctor'),
      receptionist: t('staff.role.receptionist'),
      labTech: t('staff.role.labTech'),
   };

   const roleBadge = (kind: StaffKind) => (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${ROLE_BADGE_CLASS[kind]}`}>
         {roleLabel[kind]}
      </span>
   );

   const filters: { key: 'all' | StaffKind; label: string; count: number }[] = [
      { key: 'all', label: t('staff.filter.all'), count: doctors.length + receptionists.length + labTechnicians.length },
      { key: 'doctor', label: t('staff.filter.doctors'), count: doctors.length },
      { key: 'receptionist', label: t('staff.filter.receptionists'), count: receptionists.length },
      { key: 'labTech', label: t('staff.filter.labTechs'), count: labTechnicians.length },
   ];

   // Qo'shish menyusi: avval rol tanlanadi, keyin o'sha rolning odatdagi oynasi ochiladi
   const addOptions: { kind: StaffKind; icon: React.ElementType; open: () => void }[] = [
      { kind: 'doctor', icon: Stethoscope, open: () => handleOpenDoctorModal() },
      { kind: 'receptionist', icon: Phone, open: () => handleOpenReceptionistModal() },
      { kind: 'labTech', icon: FlaskConical, open: () => handleOpenLabTechModal() },
   ];

   const shows = (kind: StaffKind) => filter === 'all' || filter === kind;
   const visibleCount = (shows('doctor') ? doctors.length : 0)
      + (shows('receptionist') ? receptionists.length : 0)
      + (shows('labTech') ? labTechnicians.length : 0);

   const rowClass = 'flex flex-wrap items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800';

   return (
      <>
         <Card className="p-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
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

            <div className="grid grid-cols-1 gap-4">
               {shows('doctor') && doctors.map(doc => (
                  <div key={doc.id} className={rowClass}>
                     <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: doc.color || '#3B82F6' }}>
                           {doc.firstName[0]}{doc.lastName[0]}
                        </div>
                        <div>
                           <div className="flex items-center gap-2">
                              {/* Ism shifokor kartasiga olib boradi: qabullar, to'lovlar, bemorlar */}
                              <Link to={`/doctors/${doc.id}`} className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                                 Dr. {doc.firstName} {doc.lastName}
                              </Link>
                              {roleBadge('doctor')}
                           </div>
                           <p className="text-xs text-gray-500">{doc.specialty}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-2">
                        {/* Filialni shu yerdan almashtirish mumkin — tahrirlash
                            oynasini ochish shart emas. Bo'sh qiymat: shifokor
                            barcha filiallarda ko'rinadi. */}
                        {branches.length > 0 && (
                           <select
                              value={doc.branchId || ''}
                              onChange={(e) => onUpdateDoctor(doc.id, { branchId: e.target.value || null })}
                              title={t('branches.doctorBranch')}
                              className="h-8 max-w-[170px] rounded-md border border-gray-200 dark:border-gray-700 bg-transparent text-xs text-gray-600 dark:text-gray-300 px-2 focus:ring-2 focus:ring-primary-500"
                           >
                              <option value="">{t('branches.doctorAllBranches')}</option>
                              {branches.map(b => (
                                 <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                           </select>
                        )}
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{doc.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc')}</span>
                        <button
                           onClick={() => handleOpenDoctorModal(doc)}
                           className="p-2 text-primary-600 hover:bg-primary-50 rounded-md"
                        >
                           <Edit className="w-4 h-4" />
                        </button>
                        <button
                           className="p-2 text-gray-400 hover:text-red-600"
                           onClick={() => setDeleteConfirmDoctor(doc)}
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </div>
               ))}

               {shows('receptionist') && receptionists.map(rec => (
                  <div key={rec.id} className={rowClass}>
                     <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
                           {rec.firstName[0]}{rec.lastName[0]}
                        </div>
                        <div>
                           <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-white">{rec.firstName} {rec.lastName}</p>
                              {roleBadge('receptionist')}
                           </div>
                           <p className="text-xs text-gray-500">{rec.phone}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{rec.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc')}</span>
                        <button
                           onClick={() => handleOpenReceptionistModal(rec)}
                           className="p-2 text-primary-600 hover:bg-primary-50 rounded-md"
                        >
                           <Edit className="w-4 h-4" />
                        </button>
                        <button
                           className="p-2 text-gray-400 hover:text-red-600"
                           onClick={() => setDeleteConfirmReceptionist(rec)}
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </div>
               ))}

               {shows('labTech') && labTechnicians.map(tech => (
                  <div key={tech.id} className={rowClass}>
                     <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                           {tech.firstName[0]}{tech.lastName[0]}
                        </div>
                        <div>
                           <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-white">{tech.firstName} {tech.lastName}</p>
                              {roleBadge('labTech')}
                           </div>
                           <p className="text-xs text-gray-500">{tech.specialty} · {tech.phone}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${tech.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                           {tech.status === 'Active' ? 'Faol' : 'Faol emas'}
                        </span>
                        <button
                           onClick={() => handleOpenLabTechModal(tech)}
                           className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md"
                        >
                           <Edit className="w-4 h-4" />
                        </button>
                        <button
                           className="p-2 text-gray-400 hover:text-red-600"
                           onClick={() => setDeleteConfirmLabTech(tech)}
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </div>
               ))}

               {visibleCount === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                     {t('staff.empty')}
                  </div>
               )}
            </div>
         </Card>

         {/* Add/Edit Doctor Modal */}
         <Modal isOpen={isDoctorModalOpen} onClose={() => setIsDoctorModalOpen(false)} title={editingDoctorId ? t('settings.staff.editDoctor') : t('settings.staff.addDoctorModal')}>
            <form onSubmit={handleDoctorSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.staff.firstName')} value={doctorForm.firstName} onChange={e => setDoctorForm({ ...doctorForm, firstName: e.target.value })} required />
                  <Input label={t('settings.staff.lastName')} value={doctorForm.lastName} onChange={e => setDoctorForm({ ...doctorForm, lastName: e.target.value })} required />
               </div>
               <Input label={t('settings.staff.specialty')} value={doctorForm.specialty} onChange={e => setDoctorForm({ ...doctorForm, specialty: e.target.value })} required />
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.staff.phone')} value={doctorForm.phone} onChange={e => setDoctorForm({ ...doctorForm, phone: e.target.value })} required />
                  <Input label="Qo'shimcha raqam (Ixtiyoriy)" value={doctorForm.secondaryPhone} onChange={e => setDoctorForm({ ...doctorForm, secondaryPhone: e.target.value })} />
               </div>
               {branches.length > 0 && (
                  <Select
                     label={t('branches.doctorBranch')}
                     value={doctorForm.branchId}
                     onChange={e => setDoctorForm({ ...doctorForm, branchId: e.target.value })}
                     options={[
                        { value: '', label: t('branches.doctorAllBranches') },
                        ...branches.map(b => ({ value: b.id, label: b.name })),
                     ]}
                  />
               )}

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.staff.authTitle')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={doctorForm.username}
                        onChange={e => setDoctorForm({ ...doctorForm, username: e.target.value })}
                        required={!editingDoctorId}
                        placeholder="shifokor_login"
                     />
                     <Input
                        label={t('settings.staff.password')}
                        type="password"
                        value={doctorForm.password}
                        onChange={e => setDoctorForm({ ...doctorForm, password: e.target.value })}
                        required={!editingDoctorId}
                        placeholder={editingDoctorId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>

                  <div className="mt-4">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Maosh turi</label>
                     <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                        {([
                           ['none', "Bo'sh"],
                           ['fixed', 'Fix'],
                           ['fixed_kpi', 'Fix+KPI'],
                           ['kpi', 'KPI'],
                        ] as const).map(([val, label]) => (
                           <button
                              key={val}
                              type="button"
                              onClick={() => setDoctorForm({ ...doctorForm, salaryType: val })}
                              className={`px-2 py-2 rounded-lg text-xs font-bold transition-all ${doctorForm.salaryType === val
                                 ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                 : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                           >
                              {label}
                           </button>
                        ))}
                     </div>
                     <p className="text-xs text-gray-500 mt-1.5">
                        {doctorForm.salaryType === 'none' && "Maosh turi belgilanmagan — Xarajat bo'limida qo'lda kiritiladi."}
                        {doctorForm.salaryType === 'fixed' && "Har oy belgilangan qat'iy summa to'lanadi."}
                        {doctorForm.salaryType === 'fixed_kpi' && "Qat'iy summa + sof foydadan foiz — ikkalasi ham to'lanadi."}
                        {doctorForm.salaryType === 'kpi' && "Faqat sof foydadan foiz (hisoblangan ulush) to'lanadi."}
                     </p>

                     {(doctorForm.salaryType === 'fixed' || doctorForm.salaryType === 'fixed_kpi') && (
                        <Input
                           label="Fix maosh (UZS)"
                           type="number"
                           value={doctorForm.fixedSalary}
                           onChange={e => setDoctorForm({ ...doctorForm, fixedSalary: e.target.value })}
                           placeholder="2000000"
                           containerClassName="w-full mt-3"
                        />
                     )}

                     {(doctorForm.salaryType === 'fixed_kpi' || doctorForm.salaryType === 'kpi') && (
                        <Input
                           label="Shifokor Ulushi (%)"
                           type="number"
                           value={doctorForm.percentage}
                           onChange={e => setDoctorForm({ ...doctorForm, percentage: e.target.value })}
                           placeholder="50"
                           helperText="Sof foydadan shifokor olishi kerak bo'lgan foiz"
                           containerClassName="w-full mt-3"
                        />
                     )}
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kalendar rangi</label>
                     <div className="flex flex-wrap gap-3">
                        {DOCTOR_COLORS.map((color) => (
                           <button
                              key={color.value}
                              type="button"
                              onClick={() => setDoctorForm({ ...doctorForm, color: color.value })}
                              className={`w-8 h-8 rounded-full border-2 transition-all ${doctorForm.color === color.value ? 'border-primary-500 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                              style={{ backgroundColor: color.value }}
                              title={color.name}
                           />
                        ))}
                     </div>
                     <p className="text-xs text-gray-500 mt-2">Bu rang kalendarda shifokor qabullarini belgilash uchun ishlatiladi.</p>
                  </div>
               </div>

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Ishlash vaqti (Ixtiyoriy)</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Bo'sh qoldirsa, klinika umumiy vaqti ishlatiladi</p>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Boshlanish vaqti</label>
                        <select
                           value={doctorForm.startHour}
                           onChange={e => setDoctorForm({ ...doctorForm, startHour: e.target.value })}
                           className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                           <option value="">— Klinika vaqti —</option>
                           {Array.from({ length: 18 }, (_, i) => i + 6).map(h => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tugash vaqti</label>
                        <select
                           value={doctorForm.endHour}
                           onChange={e => setDoctorForm({ ...doctorForm, endHour: e.target.value })}
                           className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                           <option value="">— Klinika vaqti —</option>
                           {Array.from({ length: 18 }, (_, i) => i + 6).map(h => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                           ))}
                        </select>
                     </div>
                  </div>
               </div>

               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsDoctorModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         <UpgradePlanModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} reason="doctorLimit" />

         <Modal isOpen={!!deleteConfirmDoctor} onClose={() => setDeleteConfirmDoctor(null)} title={t('settings.staff.deleteDoctorConfirm')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  {t('settings.staff.deleteDoctorConfirm')} <br />
                   <strong>Dr. {deleteConfirmDoctor?.firstName} {deleteConfirmDoctor?.lastName}</strong>. {t('common.confirmDeleteDesc')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmDoctor(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmDoctor) {
                           onDeleteDoctor(deleteConfirmDoctor.id);
                           setDeleteConfirmDoctor(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Add/Edit Receptionist Modal */}
         <Modal isOpen={isReceptionistModalOpen} onClose={() => setIsReceptionistModalOpen(false)} title={editingReceptionistId ? t('settings.staff.editReceptionist') : t('settings.staff.addReceptionistModal')}>
            <form onSubmit={handleReceptionistSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.staff.firstName')} value={receptionistForm.firstName} onChange={e => setReceptionistForm({ ...receptionistForm, firstName: e.target.value })} required />
                  <Input label={t('settings.staff.lastName')} value={receptionistForm.lastName} onChange={e => setReceptionistForm({ ...receptionistForm, lastName: e.target.value })} required />
               </div>
               <Input label={t('settings.staff.phone')} value={receptionistForm.phone} onChange={e => setReceptionistForm({ ...receptionistForm, phone: e.target.value })} required />

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.staff.authTitle')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={receptionistForm.username}
                        onChange={e => setReceptionistForm({ ...receptionistForm, username: e.target.value })}
                        required={!editingReceptionistId}
                        placeholder="resepshn_login"
                     />
                     <Input
                        label={t('settings.staff.password')}
                        type="password"
                        value={receptionistForm.password}
                        onChange={e => setReceptionistForm({ ...receptionistForm, password: e.target.value })}
                        required={!editingReceptionistId}
                        placeholder={editingReceptionistId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsReceptionistModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Add/Edit Lab Technician Modal */}
         <Modal isOpen={isLabTechModalOpen} onClose={() => setIsLabTechModalOpen(false)} title={editingLabTechId ? 'Texnikni Tahrirlash' : 'Texnik Qo\'shish'}>
            <form onSubmit={handleLabTechSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Ism" value={labTechForm.firstName} onChange={e => setLabTechForm({ ...labTechForm, firstName: e.target.value })} required />
                  <Input label="Familiya" value={labTechForm.lastName} onChange={e => setLabTechForm({ ...labTechForm, lastName: e.target.value })} required />
               </div>
               <Input label="Mutaxassislik" value={labTechForm.specialty} onChange={e => setLabTechForm({ ...labTechForm, specialty: e.target.value })} placeholder="Koronka, Protez, Veneer..." required />
               <Input label="Telefon" value={labTechForm.phone} onChange={e => setLabTechForm({ ...labTechForm, phone: e.target.value })} required />
               <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tizimga kirish (ixtiyoriy)</p>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={labTechForm.username}
                        onChange={e => setLabTechForm({ ...labTechForm, username: e.target.value })}
                        placeholder="texnik_login"
                     />
                     <Input
                        label="Parol"
                        type="password"
                        value={labTechForm.password}
                        onChange={e => setLabTechForm({ ...labTechForm, password: e.target.value })}
                        placeholder={editingLabTechId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setIsLabTechModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Delete Lab Technician Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmLabTech} onClose={() => setDeleteConfirmLabTech(null)} title="Texnikni O'chirish">
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  <strong>{deleteConfirmLabTech?.firstName} {deleteConfirmLabTech?.lastName}</strong> texnikni o'chirasizmi? {t('common.confirmDeleteDesc')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmLabTech(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmLabTech && onDeleteLabTechnician) {
                           onDeleteLabTechnician(deleteConfirmLabTech.id);
                           setDeleteConfirmLabTech(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Delete Receptionist Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmReceptionist} onClose={() => setDeleteConfirmReceptionist(null)} title={t('settings.staff.deleteReceptionistConfirm')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  {t('settings.staff.deleteReceptionistConfirm')} <br />
                   <strong>{deleteConfirmReceptionist?.firstName} {deleteConfirmReceptionist?.lastName}</strong>. {t('common.confirmDeleteDesc')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmReceptionist(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmReceptionist && onDeleteReceptionist) {
                           onDeleteReceptionist(deleteConfirmReceptionist.id);
                           setDeleteConfirmReceptionist(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>
      </>
   );
};
