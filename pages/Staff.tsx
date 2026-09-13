import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, BarChart3, Shield } from 'lucide-react';
import { StaffManagement } from '../components/StaffManagement';
import { AccessControlSettings } from '../components/AccessControlSettings';
import { DoctorsAnalytics } from './DoctorsAnalytics';
import { useLanguage } from '../context/LanguageContext';
import {
   UserRole, Doctor, Receptionist, LabTechnician, Clinic, SubscriptionPlan, Branch,
   Appointment, Service, Transaction, Review,
} from '../types';

// Xodimlar bo'limi — bitta menyu punkti, uchta tab:
//   Ro'yxat    — shifokor, resepshn va texniklarni qo'shish va tahrirlash.
//                Ilgari ular Sozlamalar ichida uchta alohida bo'lim edi.
//   Statistika — shifokorlar bo'yicha tushum, qabullar va baholar. Ilgari
//                "Shifokorlar" menyusining yagona mazmuni shu edi.
//   Ruxsatlar  — kim qaysi bo'limni ko'radi. Faqat klinika egasiga:
//                backend ham saqlashda shu rolni talab qiladi.
// Tab URL'da (?tab=) turadi: orqaga tugmasi ishlaydi, aniq tabga havola bersa bo'ladi.

type TabKey = 'list' | 'stats' | 'access';

interface StaffProps {
   userRole: UserRole;
   /** Barcha shifokorlar — boshqaruv ro'yxati filialdan qat'i nazar hammasini ko'rsatadi */
   doctors: Doctor[];
   /** Statistika uchun — sarlavhadagi filial tanloviga qarab filtrlangan */
   analyticsDoctors: Doctor[];
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
   appointments: Appointment[];
   services: Service[];
   transactions: Transaction[];
   reviews: Review[];
}

export const Staff: React.FC<StaffProps> = ({ userRole, analyticsDoctors, appointments, services, transactions, reviews, ...management }) => {
   const { t } = useLanguage();
   const isAdmin = userRole === UserRole.CLINIC_ADMIN;

   const [searchParams, setSearchParams] = useSearchParams();
   const requested = searchParams.get('tab');
   const activeTab: TabKey = requested === 'stats' ? 'stats'
      : requested === 'access' && isAdmin ? 'access'
         : 'list';

   const tabs: { key: TabKey; label: string; icon: React.ElementType; subtitle: string }[] = [
      { key: 'list', label: t('staff.tabs.list'), icon: Users, subtitle: t('staff.subtitle.list') },
      { key: 'stats', label: t('staff.tabs.stats'), icon: BarChart3, subtitle: t('staff.subtitle.stats') },
      ...(isAdmin ? [{ key: 'access' as const, label: t('staff.tabs.access'), icon: Shield, subtitle: t('staff.subtitle.access') }] : []),
   ];
   const current = tabs.find(tab => tab.key === activeTab) || tabs[0];

   const selectTab = (key: TabKey) => {
      const next = new URLSearchParams(searchParams);
      if (key === 'list') next.delete('tab');
      else next.set('tab', key);
      setSearchParams(next, { replace: true });
   };

   return (
      <div className="space-y-5 animate-fade-in">
         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.staff')}</h1>
               <p className="text-sm text-gray-500 dark:text-gray-400">{current.subtitle}</p>
            </div>

            {/* Telefonda tablar kenglikni teng bo'lishadi va ikonkasiz — aks holda uchinchi tab sig'masdi */}
            <div className="flex w-full sm:w-auto items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
               {tabs.map(tab => {
                  const Icon = tab.icon;
                  const active = tab.key === activeTab;
                  return (
                     <button
                        key={tab.key}
                        onClick={() => selectTab(tab.key)}
                        className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${active
                           ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                           : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                           }`}
                     >
                        <Icon className="w-4 h-4 hidden sm:block" />
                        {tab.label}
                     </button>
                  );
               })}
            </div>
         </div>

         {activeTab === 'list' && <StaffManagement {...management} />}
         {activeTab === 'stats' && (
            <DoctorsAnalytics
               embedded
               doctors={analyticsDoctors}
               appointments={appointments}
               services={services}
               transactions={transactions}
               reviews={reviews}
            />
         )}
         {activeTab === 'access' && <AccessControlSettings currentClinic={management.currentClinic} />}
      </div>
   );
};
