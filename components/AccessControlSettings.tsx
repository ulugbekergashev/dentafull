import React, { useState } from 'react';
import { Card, Button } from './Common';
import { Clinic, AccessControl, RoleAccess } from '../types';
import { Shield } from 'lucide-react';
import { api } from '../services/api';
import { parseAccessControl } from '../utils/accessControl';
import { ACCESS_MODULES, SIMPLE_VIEW_HIDDEN_MODULES } from '../constants';

interface AccessControlSettingsProps {
   currentClinic?: Clinic;
}

// Ruxsatlar: shifokor va resepshn qaysi bo'limlar va ma'lumotlarni ko'radi.
// Ilgari Sozlamalar ro'yxatining oxirida edi; bu savol xodimlar haqida bo'lgani
// uchun endi Xodimlar sahifasida. Shu yerda turgan "Kassa smenalari" esa
// ruxsat emas — u Sozlamalar → Klinika bo'limiga ko'chdi.
export const AccessControlSettings: React.FC<AccessControlSettingsProps> = ({ currentClinic }) => {
   // Ruxsatlar (access control) formasi — klinika sozlamalaridan boshlang'ich qiymat
   const [accessForm, setAccessForm] = useState<AccessControl>(() => parseAccessControl(currentClinic));
   const [accessSaving, setAccessSaving] = useState(false);
   const [accessSaved, setAccessSaved] = useState(false);

   const updateRoleAccess = (roleKey: 'doctor' | 'receptionist', patch: Partial<RoleAccess>) => {
      setAccessForm(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], ...patch } }));
   };

   const toggleModule = (roleKey: 'doctor' | 'receptionist', moduleId: string) => {
      const hidden = accessForm[roleKey]?.hiddenModules || [];
      const next = hidden.includes(moduleId) ? hidden.filter(m => m !== moduleId) : [...hidden, moduleId];
      updateRoleAccess(roleKey, { hiddenModules: next });
   };

   // Tayyor presetlar: "Sodda" — faqat kundalik ish uchun kerak modullar, "Hammasi" — cheklovsiz
   const applyPreset = (roleKey: 'doctor' | 'receptionist', preset: 'simple' | 'all') => {
      const roleId = roleKey === 'doctor' ? 'DOCTOR' : 'RECEPTIONIST';
      updateRoleAccess(roleKey, {
         hiddenModules: preset === 'simple' ? [...SIMPLE_VIEW_HIDDEN_MODULES[roleId]] : [],
      });
   };

   const isSimplePreset = (roleKey: 'doctor' | 'receptionist') => {
      const roleId = roleKey === 'doctor' ? 'DOCTOR' : 'RECEPTIONIST';
      const hidden = [...(accessForm[roleKey]?.hiddenModules || [])].sort();
      const target = [...SIMPLE_VIEW_HIDDEN_MODULES[roleId]].sort();
      return hidden.length === target.length && hidden.every((m, i) => m === target[i]);
   };

   // Klinika ma'lumoti keyin yuklansa, formani sinxronlash
   React.useEffect(() => {
      setAccessForm(parseAccessControl(currentClinic));
   }, [currentClinic?.id, currentClinic?.accessControl]);

   const handleAccessSave = async () => {
      if (!currentClinic?.id) return;
      setAccessSaving(true);
      try {
         await api.clinics.updateAccessControl(currentClinic.id, accessForm);
         setAccessSaved(true);
         setTimeout(() => {
            setAccessSaved(false);
            window.location.reload();
         }, 1000);
      } catch (error: any) {
         console.error('Failed to save access control:', error);
         alert(error?.message || 'Ruxsatlarni saqlashda xatolik. Backend yangilanganiga ishonch hosil qiling.');
      } finally {
         setAccessSaving(false);
      }
   };

   return (
      <div className="space-y-6">
         <Card className="p-6">
            <div className="flex items-start gap-3">
               <div className="p-2.5 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
                  <Shield className="w-5 h-5 text-primary-600 dark:text-primary-400" />
               </div>
               <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ruxsatlarni boshqarish</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                     Shifokor va resepshn qaysi bo'limlar va ma'lumotlarni ko'rishini belgilang.
                     Belgisi olib tashlangan modul menyuda ko'rinmaydi. Bosh sahifa (Dashboard) har doim ochiq qoladi.
                  </p>
               </div>
            </div>
         </Card>

         {([
            { roleKey: 'receptionist' as const, roleId: 'RECEPTIONIST' as const, title: 'Resepshn', desc: 'Qabulxona xodimlari uchun' },
            { roleKey: 'doctor' as const, roleId: 'DOCTOR' as const, title: 'Shifokor', desc: 'Shifokorlar uchun' },
         ]).map(({ roleKey, roleId, title, desc }) => {
            const roleAccess = accessForm[roleKey] || {};
            const hidden = roleAccess.hiddenModules || [];
            const modules = ACCESS_MODULES.filter(m => m.roles.includes(roleId));
            return (
               <Card key={roleKey} className="p-6">
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                     <div>
                        <h4 className="text-base font-bold text-gray-900 dark:text-white">{title}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                     </div>
                     <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        {([
                           { key: 'simple' as const, label: 'Sodda', active: isSimplePreset(roleKey) },
                           { key: 'all' as const, label: 'Hammasi', active: (accessForm[roleKey]?.hiddenModules || []).length === 0 },
                        ]).map(p => (
                           <button
                              key={p.key}
                              type="button"
                              onClick={() => applyPreset(roleKey, p.key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${p.active
                                 ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                 : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                           >
                              {p.label}
                           </button>
                        ))}
                     </div>
                  </div>

                  {roleKey === 'receptionist' && (
                     <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 -mt-2">
                        <b>Sodda</b> — faqat kundalik ish uchun kerak bo'lgan bo'limlar qoladi
                        (Bemorlar, Kalendar, Kassa, Navbat). Menyu qisqarsa, yangi xodim tezroq o'rganadi.
                     </p>
                  )}

                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Ko'rinadigan modullar</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                     {modules.map(m => {
                        const visible = !hidden.includes(m.id);
                        return (
                           <label key={m.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${visible
                              ? 'border-primary-200 bg-primary-50/60 text-primary-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300'
                              : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 line-through'}`}>
                              <input
                                 type="checkbox"
                                 checked={visible}
                                 onChange={() => toggleModule(roleKey, m.id)}
                                 className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                              />
                              {m.label}
                           </label>
                        );
                     })}
                  </div>

                  {roleKey === 'doctor' && (
                     <>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Ko'rish doirasi</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                           {([
                              { value: false, title: 'Faqat o\'z bemorlari', desc: 'Shifokor o\'ziga biriktirilgan bemorlar, qabullar va kalendarni ko\'radi (standart)' },
                              { value: true, title: 'Klinikadagi barcha bemorlar', desc: 'Shifokor boshqa shifokorlarning bemorlari, qabullari va kalendarini ham ko\'radi — huddi admin kabi' },
                           ]).map(opt => {
                              const active = (roleAccess.seeAllPatients === true) === opt.value;
                              return (
                                 <label key={String(opt.value)} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${active
                                    ? 'border-primary-300 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'}`}>
                                    <input
                                       type="radio"
                                       name="doctor-scope"
                                       checked={active}
                                       onChange={() => updateRoleAccess('doctor', { seeAllPatients: opt.value })}
                                       className="w-4 h-4 mt-0.5 text-primary-600 focus:ring-primary-500"
                                    />
                                    <div>
                                       <p className="text-sm font-semibold text-gray-900 dark:text-white">{opt.title}</p>
                                       <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
                                    </div>
                                 </label>
                              );
                           })}
                        </div>
                     </>
                  )}

                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Maxfiy ma'lumotlar</p>
                  <div className="space-y-2">
                     <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary-300 transition-colors">
                        <input
                           type="checkbox"
                           checked={roleAccess.showFinance !== false}
                           onChange={e => updateRoleAccess(roleKey, { showFinance: e.target.checked })}
                           className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                        />
                        <div>
                           <p className="text-sm font-semibold text-gray-900 dark:text-white">Moliyaviy ko'rsatkichlarni ko'rsatish</p>
                           <p className="text-xs text-gray-500 dark:text-gray-400">Dashboarddagi tushum, o'rtacha chek va "Olinmagan pul" ro'yxatidagi summalar. O'chirilsa ro'yxat ko'rinadi, lekin summalarsiz</p>
                        </div>
                     </label>
                     <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary-300 transition-colors">
                        <input
                           type="checkbox"
                           checked={roleAccess.canTakePayment !== false}
                           onChange={e => updateRoleAccess(roleKey, { canTakePayment: e.target.checked })}
                           className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                        />
                        <div>
                           <p className="text-sm font-semibold text-gray-900 dark:text-white">Bemordan to'lovni o'zi qabul qila olsin</p>
                           <p className="text-xs text-gray-500 dark:text-gray-400">O'chirilsa, tugagan qabulni faqat "Kassaga yuborish" mumkin bo'ladi — pulni kassir oladi</p>
                        </div>
                     </label>
                     {roleKey === 'doctor' && (
                        <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary-300 transition-colors">
                           <input
                              type="checkbox"
                              checked={roleAccess.showPatientPhone !== false}
                              onChange={e => updateRoleAccess(roleKey, { showPatientPhone: e.target.checked })}
                              className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                           />
                           <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">Bemor telefon raqamlarini ko'rsatish</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">O'chirilsa, shifokorga raqamlar yulduzcha bilan maskalanadi (masalan, +*** ** *** ** 67)</p>
                           </div>
                        </label>
                     )}
                  </div>
               </Card>
            );
         })}

         <div className="flex items-center gap-3">
            <Button onClick={handleAccessSave} disabled={accessSaving}>
               {accessSaving ? 'Saqlanmoqda...' : accessSaved ? 'Saqlandi ✓' : 'Saqlash'}
            </Button>
            {accessSaved && <span className="text-sm text-success-600 font-medium">Ruxsatlar yangilandi, sahifa yangilanmoqda...</span>}
         </div>
      </div>
   );
};
