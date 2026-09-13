import React, { useState } from 'react';
import { Button, Input, Modal, Select } from '../components/Common';
import { UpgradePlanModal } from '../components/UpgradePlanModal';
import { Doctor, Receptionist, LabTechnician, Clinic, SubscriptionPlan, Branch } from '../types';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Xodim qo'shish, tahrirlash va o'chirish oynalari. Ro'yxat ham, profil sahifasi
// ham shu bitta manbadan foydalanadi — oynalar ikki joyda takrorlanmasin.

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

export interface StaffEditorsProps {
   doctors: Doctor[];
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
   /** O'chirilgandan keyin — masalan, profil sahifasidan ro'yxatga qaytish */
   onDeleted?: () => void;
}

export function useStaffEditors({
   doctors, onAddDoctor, onUpdateDoctor, onDeleteDoctor, onAddReceptionist, onUpdateReceptionist, onDeleteReceptionist, onAddLabTechnician, onUpdateLabTechnician, onDeleteLabTechnician, branches = [], currentClinic, plans, onDeleted
}: StaffEditorsProps) {
   const { t } = useLanguage();

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

   const modals = (
      <>
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
                           onDeleted?.();
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
                           onDeleted?.();
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
                           onDeleted?.();
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

   return {
      openDoctor: handleOpenDoctorModal,
      openReceptionist: handleOpenReceptionistModal,
      openLabTech: handleOpenLabTechModal,
      askDeleteDoctor: setDeleteConfirmDoctor,
      askDeleteReceptionist: setDeleteConfirmReceptionist,
      askDeleteLabTech: setDeleteConfirmLabTech,
      modals,
   };
}
