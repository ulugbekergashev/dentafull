import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Modal, Select } from '../components/Common';

import { UserRole, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, ServiceCategory, Review } from '../types';
import { User, DollarSign, Users, Edit, Trash2, CheckCircle, Bot, Phone, Star, MessageSquare, Building2, Plus, Facebook, Activity, RefreshCw } from 'lucide-react';
import { api, API_URL } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

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

interface SettingsProps {
   userRole: UserRole;
   services: Service[];
   doctors: Doctor[];
   receptionists?: Receptionist[];
   categories: ServiceCategory[];
   onAddService: (service: Omit<Service, 'id' | 'clinicId'>) => void;
   onUpdateService: (index: number, service: Partial<Service>) => void;
   onAddCategory: (category: Omit<ServiceCategory, 'id' | 'clinicId'>) => void;
   onDeleteCategory: (id: string) => void;
   onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
   onUpdateDoctor: (id: string, doctor: Partial<Doctor>) => void;
   onDeleteDoctor: (id: string) => void;
   onAddReceptionist?: (receptionist: Omit<Receptionist, 'id'>) => void;
   onUpdateReceptionist?: (id: string, receptionist: Partial<Receptionist>) => void;
   onDeleteReceptionist?: (id: string) => void;
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
   reviews: Review[];
}

export const Settings: React.FC<SettingsProps> = ({
   userRole, services, categories, doctors, receptionists = [], onAddService, onUpdateService, onAddCategory, onDeleteCategory, onAddDoctor, onUpdateDoctor, onDeleteDoctor, onAddReceptionist, onUpdateReceptionist, onDeleteReceptionist, currentClinic, plans, reviews
}) => {
   const { t } = useLanguage();
   const [activeTab, setActiveTab] = useState<'general' | 'services' | 'doctors' | 'receptionists' | 'bot' | 'facebook' | 'sms' | 'dmed'>('services');
   const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
   const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
   const [categoryForm, setCategoryForm] = useState({ name: '' });

   // Service Modal State
   const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
   const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
   const [serviceForm, setServiceForm] = useState({ name: '', price: '', cost: '', categoryId: '' });

   // Doctor Modal State
   const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
   const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
   const [doctorForm, setDoctorForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', username: '', password: '', percentage: '', color: DOCTOR_COLORS[0].value });

   // Receptionist Modal State
   const [isReceptionistModalOpen, setIsReceptionistModalOpen] = useState(false);
   const [editingReceptionistId, setEditingReceptionistId] = useState<string | null>(null);
   const [receptionistForm, setReceptionistForm] = useState({ firstName: '', lastName: '', phone: '', username: '', password: '' });

   // Upgrade Plan Modal State
   const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

   // Delete Confirmation Modals
   const [deleteConfirmDoctor, setDeleteConfirmDoctor] = useState<Doctor | null>(null);
   const [deleteConfirmReceptionist, setDeleteConfirmReceptionist] = useState<Receptionist | null>(null);



   // General Form State
   const [generalForm, setGeneralForm] = useState({
      clinicName: '',
      address: '',
      phone: '',
      email: '',
      ownerPhone: '',
      startHour: 8,
      endHour: 20,
      enableReceipts: false
   });
   const [generalSaved, setGeneralSaved] = useState(false);

   // Bot Settings State
   const [botToken, setBotToken] = useState(currentClinic?.botToken || '');
   const [botSaved, setBotSaved] = useState(false);
   const [botUsername, setBotUsername] = useState<string | null>(null);

   const [botLogs, setBotLogs] = useState<any[]>([]);
   const [isLoadingLogs, setIsLoadingLogs] = useState(false);

   // Facebook State
   const [facebookPages, setFacebookPages] = useState<any[]>([]);
   const [isFBPageModalOpen, setIsFBPageModalOpen] = useState(false);
   const [isFBLoading, setIsFBLoading] = useState(false);

   // SMS Settings State
   const [smsForm, setSmsForm] = useState({
      notificationMode: 'telegram_only',
      eskizEmail: '',
      eskizPassword: '',
      eskizNick: '4546'
   });
   const [smsConnected, setSmsConnected] = useState(false);
   const [smsHasPassword, setSmsHasPassword] = useState(false);
   const [smsBalance, setSmsBalance] = useState<number | null>(null);
   const [isCheckingSms, setIsCheckingSms] = useState(false);
   const [smsTestPhone, setSmsTestPhone] = useState('');
   const [smsSaved, setSmsSaved] = useState(false);
   
   // DMED Settings State
   const [dmedEnabled, setDmedEnabled] = useState(false);
   const [dmedApiKey, setDmedApiKey] = useState('');
   const [dmedApiSecret, setDmedApiSecret] = useState('');
   const [dmedClinicId, setDmedClinicId] = useState('');
   const [dmedSaved, setDmedSaved] = useState(false);
   const [isCheckingDmed, setIsCheckingDmed] = useState(false);

   // Clinic overall rating calculation
   const clinicAvgRating = useMemo(() => {
      if (!reviews || reviews.length === 0) return 0;
      const total = reviews.reduce((sum, r) => sum + r.rating, 0);
      return total / reviews.length;
   }, [reviews]);

   // Debug: Log botUsername changes
   React.useEffect(() => {
      console.log('🔍 botUsername state changed:', botUsername);
   }, [botUsername]);

   // Sync generalForm with currentClinic
   React.useEffect(() => {
      if (currentClinic) {
         setGeneralForm({
            clinicName: currentClinic.name || '',
            address: (currentClinic as any).address || '',
            phone: currentClinic.phone || '',
            email: (currentClinic as any).email || '',
            ownerPhone: currentClinic.ownerPhone || '',
            startHour: currentClinic.startHour ?? 8,
            endHour: currentClinic.endHour ?? 20,
            enableReceipts: currentClinic.enableReceipts ?? false
         });
      }
   }, [currentClinic]);

   // Sync DMED settings
   React.useEffect(() => {
      if (currentClinic) {
         setDmedEnabled(currentClinic.dmedEnabled || false);
         setDmedApiKey(currentClinic.dmedApiKey || '');
         setDmedApiSecret(currentClinic.dmedApiSecret || '');
         setDmedClinicId(currentClinic.dmedClinicId || '');
      }
   }, [currentClinic]);

   // Load SMS settings
   React.useEffect(() => {
      const fetchSms = async () => {
         if (currentClinic?.id) {
            try {
               const data = await api.sms.getSettings(currentClinic.id);
               setSmsForm(prev => ({
                  ...prev,
                  notificationMode: data.notificationMode || 'telegram_only',
                  eskizEmail: data.eskizEmail || '',
                  eskizNick: data.eskizNick || '4546'
               }));
               setSmsHasPassword(data.hasPassword);
               setSmsConnected(data.isConnected);

               if (data.isConnected) {
                  const balanceRes = await api.sms.getBalance(currentClinic.id);
                  if (balanceRes.balance !== null) setSmsBalance(balanceRes.balance);
               }
            } catch (err) {
               console.error('Failed to fetch SMS settings', err);
            }
         }
      };
      if (activeTab === 'sms') {
          fetchSms();
      }
   }, [currentClinic?.id, activeTab]);


   // Fetch bot username when clinic has bot token
   React.useEffect(() => {
      const fetchBotUsername = async () => {
         console.log('Checking bot username...', {
            clinicId: currentClinic?.id,
            hasBotToken: !!currentClinic?.botToken,
            botToken: currentClinic?.botToken?.substring(0, 10) + '...'
         });

         if (currentClinic?.id && currentClinic?.botToken) {
            try {
               const authData = localStorage.getItem('dentalflow_auth');
               if (!authData) {
                  console.error('No auth data found');
                  return;
               }

               const token = JSON.parse(authData).token;
               if (!token) {
                  console.error('No token found in auth data');
                  return;
               }

               const response = await fetch(`${API_URL}/clinics/${currentClinic.id}/bot-username`, {
                  headers: {
                     'Authorization': `Bearer ${token}`
                  }
               });

               if (!response.ok) {
                  console.error('Failed to fetch bot username:', response.status, response.statusText);
                  return;
               }

               const data = await response.json();
               console.log('Bot username response:', data);
               if (data.botUsername) {
                  setBotUsername(data.botUsername);
                  console.log('Bot username set:', data.botUsername);
               }
            } catch (err) {
               console.error('Failed to fetch bot username:', err);
            }
         } else {
            console.log('No clinic ID or bot token, clearing username');
            setBotUsername(null);
         }
      };
      fetchBotUsername();
   }, [currentClinic?.id, currentClinic?.botToken]);

   // Handle Facebook Redirect success
   React.useEffect(() => {
       const urlParams = new URLSearchParams(window.location.search);
       if (urlParams.get('connected') === 'true' && urlParams.get('tab') === 'facebook') {
           setActiveTab('facebook');
           handleFetchFBPages();
           // Clear search params
           window.history.replaceState({}, '', window.location.pathname);
       }
   }, []);

   const handleFetchFBPages = async () => {
       if (!currentClinic?.id) return;
       setIsFBLoading(true);
       try {
           const pages = await api.facebook.getPages(currentClinic.id);
           setFacebookPages(pages);
           setIsFBPageModalOpen(true);
       } catch (error) {
           console.error('Failed to fetch FB pages:', error);
           alert('Facebook sahifalarini yuklashda xatolik yuz berdi');
       } finally {
           setIsFBLoading(false);
       }
   };

   const handleConnectFB = async () => {
       if (!currentClinic?.id) return;
       try {
           const { url } = await api.facebook.getAuthUrl(currentClinic.id);
           const width = 700;
           const height = 850;
           const left = Math.max(0, (window.screen.width / 2) - (width / 2));
           const top = Math.max(0, (window.screen.height / 2) - (height / 2));
           window.open(
               url,
               'FacebookLogin',
               `width=${width},height=${height},left=${left},top=${top},status=yes,scrollbars=yes`
           );
       } catch (error) {
           console.error('Failed to get FB auth URL:', error);
           alert('Facebook-ga bog\'lanishda xatolik yuz berdi');
       }
   };

   const handleSelectFBPage = async (page: any) => {
       if (!currentClinic?.id) return;
       try {
           await api.facebook.selectPage({
               clinicId: currentClinic.id,
               pageId: page.id,
               pageAccessToken: page.access_token,
               pageName: page.name
           });
           setIsFBPageModalOpen(false);
           alert('Sahifa muvaffaqiyatli bog\'landi!');
           window.location.reload(); // Refresh to get updated clinic data
       } catch (error) {
           console.error('Failed to select FB page:', error);
           alert('Sahifani saqlashda xatolik yuz berdi');
       }
   };

   const handleDisconnectFB = async () => {
       if (!currentClinic?.id || !window.confirm('Facebook-ni uzmoqchimisiz?')) return;
       try {
           await api.facebook.disconnect(currentClinic.id);
           alert('Facebook muvaffaqiyatli uzildi');
           window.location.reload();
       } catch (error) {
           console.error('Failed to disconnect FB:', error);
       }
   };

   // Categories effect removed as it's now in App.tsx


   // Handlers
   const handleOpenServiceModal = (index?: number) => {
      if (index !== undefined) {
         setEditingServiceIndex(index);
         const s = services[index];
         setServiceForm({
            name: s.name,
            price: s.price.toString(),
            cost: (s.cost || 0).toString(),
            categoryId: s.categoryId || ''
         });
      } else {
         setEditingServiceIndex(null);
         setServiceForm({ name: '', price: '', cost: '', categoryId: selectedCategory || '' });
      }
      setIsServiceModalOpen(true);
   };

   const handleServiceSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const data = {
         name: serviceForm.name,
         price: Number(serviceForm.price),
         cost: Number(serviceForm.cost) || 0,
         duration: 60,
         categoryId: serviceForm.categoryId || undefined
      };

      if (editingServiceIndex !== null) {
         onUpdateService(editingServiceIndex, data);
      } else {
         onAddService(data);
      }
      setIsServiceModalOpen(false);
   };

   const handleCategorySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      onAddCategory({ name: categoryForm.name });
      setCategoryForm({ name: '' });
      setIsCategoryModalOpen(false);
   };

   const handleDeleteCategory = async (id: string) => {
      if (!window.confirm('Kategoriyani o\'chirmoqchimisiz?')) return;
      onDeleteCategory(id);
      if (selectedCategory === id) setSelectedCategory(null);
   };

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
            color: doctor.color || DOCTOR_COLORS[0].value
         });
      } else {
         setEditingDoctorId(null);
         setDoctorForm({ firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', username: '', password: '', percentage: '', color: DOCTOR_COLORS[0].value });
      }
      setIsDoctorModalOpen(true);
   };

   const handleDoctorSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingDoctorId) {
         const updateData: any = { ...doctorForm };
         if (!updateData.password) {
            delete updateData.password;
         }
         updateData.percentage = Number(updateData.percentage) || 0;
         onUpdateDoctor(editingDoctorId, updateData);
      } else {
         onAddDoctor({
            ...doctorForm,
            percentage: Number(doctorForm.percentage) || 0,
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

   const handleSmsSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         await api.sms.saveSettings(currentClinic.id, {
            notificationMode: smsForm.notificationMode,
            eskizEmail: smsForm.eskizEmail,
            eskizPassword: smsForm.eskizPassword || undefined,
            eskizNick: smsForm.eskizNick || '4546'
         });
         
         setSmsSaved(true);
         setTimeout(() => setSmsSaved(false), 3000);
         
         // Reload settings to get updated state
         const data = await api.sms.getSettings(currentClinic.id);
         setSmsConnected(data.isConnected);
         setSmsHasPassword(data.hasPassword);
         
         setSmsForm(prev => ({ ...prev, eskizPassword: '' }));
         
         if (data.isConnected) {
             const balanceRes = await api.sms.getBalance(currentClinic.id);
             if (balanceRes.balance !== null) setSmsBalance(balanceRes.balance);
         }
      } catch (error: any) {
         console.error('Failed to save SMS settings:', error);
         alert(error.message || t('common.error'));
      }
   };

   const handleSmsTest = async () => {
      if (!currentClinic?.id || !smsTestPhone) return;
      setIsCheckingSms(true);
      try {
         const res = await api.sms.testSend(currentClinic.id, smsTestPhone);
         if (res.success) {
            alert('Test SMS muvaffaqiyatli yuborildi!');
         }
      } catch (error: any) {
         alert(error.message || 'SMS yuborishda xatolik yuz berdi. Sozlamalarni tekshiring.');
      } finally {
         setIsCheckingSms(false);
      }
   };

   const handleDmedSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;
      try {
         await api.clinics.updateDmedSettings(currentClinic.id, {
            dmedEnabled,
            dmedApiKey,
            dmedApiSecret,
            dmedClinicId
         });
         setDmedSaved(true);
         setTimeout(() => setDmedSaved(false), 3000);
         window.location.reload(); 
      } catch (error) {
         console.error('Failed to save DMED settings:', error);
         alert('DMED sozlamalarini saqlashda xatolik yuz berdi');
      }
   };

   const handleDmedTest = async () => {
      if (!currentClinic?.id) return;
      setIsCheckingDmed(true);
      try {
         const res = await api.clinics.testDmed(currentClinic.id, {
            dmedApiKey,
            dmedApiSecret
         });
         if (res.valid) {
            alert('DMED ulanishi muvaffaqiyatli!');
         } else {
            alert('Ulanishda xatolik: ' + (res.error || 'Noma\'lum xatolik'));
         }
      } catch (error: any) {
         alert('DMED test xatosi: ' + error.message);
      } finally {
         setIsCheckingDmed(false);
      }
   };

   const handleGeneralSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         const response = await api.clinics.update(currentClinic.id, {
            name: generalForm.clinicName,
            address: generalForm.address,
            phone: generalForm.phone,
            email: generalForm.email,
            ownerPhone: generalForm.ownerPhone,
            startHour: Number(generalForm.startHour),
            endHour: Number(generalForm.endHour),
            enableReceipts: generalForm.enableReceipts
         });

         if (response && response.id) {
            setGeneralSaved(true);
            setTimeout(() => {
               setGeneralSaved(false);
               window.location.reload();
            }, 1000);
         }
      } catch (error) {
         console.error('Failed to save general settings:', error);
         alert(t('common.error'));
      }
   };

   const handleBotSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         await api.clinics.updateSettings(currentClinic.id, { botToken });
         setBotSaved(true);
         setTimeout(() => {
            setBotSaved(false);
            window.location.reload();
         }, 1000);
      } catch (error) {
         console.error('Failed to save bot settings:', error);
         alert(t('common.error'));
      }
   };

   if (userRole === UserRole.DOCTOR) {
      return (
         <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.general.myProfile')}</h1>
            <Card className="p-6">
               <div className="flex items-center gap-6 mb-6">
                  <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                     <User className="w-10 h-10 text-gray-400" />
                  </div>
                  <div>
                     <Button variant="secondary" size="sm">{t('settings.general.changePhoto')}</Button>
                  </div>
               </div>
               <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('settings.staff.firstName')} defaultValue="Alisher" />
                     <Input label={t('settings.staff.lastName')} defaultValue="Sobirov" />
                  </div>
                  <Input label={t('settings.general.email')} type="email" defaultValue="dr.sobirov@clinic.com" />
                  <Input label={t('settings.staff.specialty')} disabled defaultValue="Terapevt" />
                  <div className="pt-4">
                     <Button onClick={(e) => { e.preventDefault(); alert(t('settings.general.saved')); }}>{t('common.save')}</Button>
                  </div>
               </form>
            </Card>
         </div>
      );
   }

   return (
      <div className="space-y-6 animate-fade-in">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

         <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Tabs */}
            <Card className="col-span-1 h-fit p-2">
               {[
                  { id: 'general', name: t('settings.tabs.general'), icon: User },
                  { id: 'services', name: t('settings.tabs.services'), icon: DollarSign },
                  { id: 'doctors', name: t('settings.tabs.doctors'), icon: Users },
                  { id: 'receptionists', name: t('settings.tabs.receptionists'), icon: Phone },
                  { id: 'bot', name: t('settings.tabs.bot'), icon: Bot },
                  { id: 'sms', name: "SMS Sozlamalari", icon: MessageSquare },
                  { id: 'dmed', name: "DMED (IT-MED)", icon: Activity },
               ].map((item) => (
                  <button
                     key={item.id}
                     onClick={() => setActiveTab(item.id as any)}
                     className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-colors 
                   ${activeTab === item.id
                           ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                           : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                        }`}
                  >
                     <item.icon className="w-4 h-4" />
                     {item.name}
                  </button>
               ))}
            </Card>

            <div className="lg:col-span-3 space-y-6">

                {/* General Tab */}
               {activeTab === 'general' && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center justify-between">
                           <div>
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('settings.general.rating')}</p>
                              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                 {clinicAvgRating > 0 ? clinicAvgRating.toFixed(1) : '0.0'}
                              </h3>
                           </div>
                           <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-full">
                              <Star className="w-6 h-6 text-yellow-500 fill-current" />
                           </div>
                        </div>
                        <div className="mt-4 flex items-center text-sm text-gray-500">
                           <span className="font-medium text-yellow-600 mr-2 flex items-center">
                              {[...Array(5)].map((_, i) => (
                                 <Star key={i} className={`w-3 h-3 ${i < Math.round(clinicAvgRating) ? 'fill-current' : 'text-gray-200'}`} />
                              ))}
                           </span>
                           {reviews.length} {t('settings.general.reviewsSuffix')}
                        </div>
                     </Card>

                     <Card className="p-6">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{t('settings.general.info')}</h3>
                        <form onSubmit={handleGeneralSave} className="space-y-4">
                           <Input label={t('settings.general.clinicName')} value={generalForm.clinicName} onChange={e => setGeneralForm({ ...generalForm, clinicName: e.target.value })} />
                           <Input label={t('settings.general.address')} value={generalForm.address} onChange={e => setGeneralForm({ ...generalForm, address: e.target.value })} />
                           <div className="grid grid-cols-2 gap-4">
                              <Input label={t('settings.general.phone')} value={generalForm.phone} onChange={e => setGeneralForm({ ...generalForm, phone: e.target.value })} />
                              <Input label={t('settings.general.email')} value={generalForm.email} onChange={e => setGeneralForm({ ...generalForm, email: e.target.value })} />
                           </div>
                           <Input
                              label={t('settings.general.ownerPhone')}
                              value={generalForm.ownerPhone}
                              onChange={e => setGeneralForm({ ...generalForm, ownerPhone: e.target.value })}
                              placeholder="998901234567"
                              helperText={t('settings.general.ownerPhoneHelp')}
                           />
                           <div className="grid grid-cols-2 gap-4 mt-4">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ishni boshlash vaqti</label>
                                 <Select
                                    value={generalForm.startHour.toString()}
                                    onChange={e => setGeneralForm({ ...generalForm, startHour: parseInt(e.target.value) })}
                                    options={Array.from({ length: 24 }, (_, i) => ({ value: i.toString(), label: `${i.toString().padStart(2, '0')}:00` }))}
                                 />
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ishni tugash vaqti</label>
                                 <Select
                                    value={generalForm.endHour.toString()}
                                    onChange={e => setGeneralForm({ ...generalForm, endHour: parseInt(e.target.value) })}
                                    options={Array.from({ length: 24 }, (_, i) => ({ value: i.toString(), label: `${i.toString().padStart(2, '0')}:00` }))}
                                 />
                              </div>
                           </div>
                           
                           {/* Receipt Printing Toggle */}
                           <div className="pt-2">
                              <label className="flex items-center space-x-3 cursor-pointer">
                                 <input
                                    type="checkbox"
                                    checked={generalForm.enableReceipts}
                                    onChange={(e) => setGeneralForm({ ...generalForm, enableReceipts: e.target.checked })}
                                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                                 />
                                 <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">Chek chiqarish funksiyasi</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Yoqilsa, to'lov qabul qilinganda avtomatik ravishda chek oynasi ochiladi.</p>
                                 </div>
                              </label>
                           </div>

                           <div className="pt-4 flex items-center gap-4">
                              <Button type="submit">{t('common.save')}</Button>
                              {generalSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                           </div>
                        </form>
                     </Card>
                  </div>
               )}

               {/* DMED Tab */}
               {activeTab === 'dmed' && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                              <Activity className="w-8 h-8" />
                           </div>
                           <div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">DMED (IT-MED) Integratsiyasi</h3>
                              <p className="text-sm text-gray-500">O'zbekiston milliy tibbiy axborot tizimi bilan bog'lanish va ma'lumotlarni sinxronizatsiya qilish.</p>
                           </div>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/40 mb-6">
                           <p className="text-sm text-blue-800 dark:text-blue-200">
                              <strong>Eslatma:</strong> DMED tizimiga ulanish uchun klinika rasmiy ravishda SSV (Uzinfocom) orqali Client ID va Client Secret kalitlarini olgan bo'lishi shart.
                           </p>
                        </div>

                        <form onSubmit={handleDmedSave} className="space-y-6">
                           <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                              <div>
                                 <h4 className="font-medium text-gray-900 dark:text-white">DMED Integratsiyasini yoqish</h4>
                                 <p className="text-sm text-gray-500">Agar yoqilsa, bemorlar profilida DMED ma'lumotlari paydo bo'ladi.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                 <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={dmedEnabled}
                                    onChange={(e) => setDmedEnabled(e.target.checked)}
                                 />
                                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                              </label>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Input 
                                 label="DMED Client ID (API Key)" 
                                 value={dmedApiKey} 
                                 onChange={e => setDmedApiKey(e.target.value)} 
                                 placeholder="Masalan: denta_clinic_123"
                                 disabled={!dmedEnabled}
                              />
                              <Input 
                                 label="DMED Client Secret" 
                                 value={dmedApiSecret} 
                                 onChange={e => setDmedApiSecret(e.target.value)} 
                                 type="password"
                                 placeholder="••••••••••••••••"
                                 disabled={!dmedEnabled}
                              />
                           </div>
                           
                           <Input 
                              label="Klinika ID (DMED tizimidagi)" 
                              value={dmedClinicId} 
                              onChange={e => setDmedClinicId(e.target.value)} 
                              placeholder="Masalan: 69213aa6-b1f2-11ee-9cc3..."
                              disabled={!dmedEnabled}
                           />

                           <div className="flex items-center gap-4 pt-4">
                              <Button type="submit" disabled={!dmedEnabled}>
                                 {t('common.save')}
                              </Button>
                              <Button 
                                 type="button" 
                                 variant="secondary" 
                                 onClick={handleDmedTest}
                                 disabled={!dmedEnabled || isCheckingDmed || !dmedApiKey || !dmedApiSecret}
                              >
                                 {isCheckingDmed ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                                 Ulanishni tekshirish
                              </Button>
                              {dmedSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                           </div>
                        </form>
                     </Card>
                  </div>
               )}

               {/* Services Tab */}
               {activeTab === 'services' && (

                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                     {/* Categories Sidebar */}
                     <Card className="col-span-1 h-fit p-4">
                        <div className="flex justify-between items-center mb-4">
                           <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.services.categories')}</h3>
                           <Button size="sm" variant="secondary" onClick={() => setIsCategoryModalOpen(true)}>+</Button>
                        </div>
                        <div className="space-y-1">
                           <button
                              onClick={() => setSelectedCategory(null)}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${!selectedCategory ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                           >
                              {t('settings.services.all')}
                           </button>
                           {categories.map(cat => (
                              <div key={cat.id} className="group flex items-center justify-between">
                                 <button
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex-1 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedCategory === cat.id ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                                 >
                                    {cat.name}
                                 </button>
                                 <button onClick={() => handleDeleteCategory(cat.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500">
                                    <Trash2 className="w-3 h-3" />
                                 </button>
                              </div>
                           ))}
                        </div>
                     </Card>

                     {/* Services List */}
                     <div className="lg:col-span-3 space-y-6">
                        <Card className="p-6">
                           <div className="flex justify-between items-center mb-6">
                              <div>
                                 <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.services.title')}</h3>
                                 <p className="text-sm text-gray-500">{t('settings.services.subtitle')}</p>
                              </div>
                              <Button size="sm" onClick={() => handleOpenServiceModal()}>Xizmat Qo'shish</Button>
                           </div>

                           <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                              <table className="w-full text-left text-sm">
                                 <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                       <th className="px-4 py-3 font-medium text-gray-500">{t('settings.services.thName')}</th>
                                       <th className="px-4 py-3 font-medium text-gray-500">{t('settings.services.thPrice')}</th>
                                       <th className="px-4 py-3 font-medium text-gray-500 text-right">{t('settings.services.thAction')}</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {services
                                       .filter(s => !selectedCategory || s.categoryId === selectedCategory)
                                       .map((s, i) => (
                                          <tr key={i} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                                             <td className="px-4 py-3 text-gray-900 dark:text-gray-200 font-medium">{s.name}</td>
                                             <td className="px-4 py-3 text-gray-500">{s.price.toLocaleString()} UZS</td>
                                             <td className="px-4 py-3 text-right">
                                                <button
                                                   onClick={() => handleOpenServiceModal(i)}
                                                   className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded transition-colors"
                                                >
                                                   <Edit className="w-4 h-4" />
                                                </button>
                                             </td>
                                          </tr>
                                       ))}
                                    {services.filter(s => !selectedCategory || s.categoryId === selectedCategory).length === 0 && (
                                       <tr>
                                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                             {t('settings.services.notFound')}
                                          </td>
                                       </tr>
                                    )}
                                 </tbody>
                              </table>
                           </div>
                        </Card>

                        <Card className="p-6">
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('settings.services.currentPlan')}</h3>
                           <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                              <div>
                                 <p className="font-bold text-indigo-900 dark:text-indigo-200">{plans?.find(p => p.id === currentClinic?.planId)?.name || 'Standart Tarif'}</p>
                                 <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">{plans?.find(p => p.id === currentClinic?.planId)?.maxDoctors || 10} tagacha shifokor • Ustuvor Yordam</p>
                              </div>
                              <Button
                                 size="sm"
                                 className="bg-indigo-600 hover:bg-indigo-700 text-white border-none"
                                 onClick={() => setIsUpgradeModalOpen(true)}
                              >
                                 {t('settings.services.upgrade')}
                              </Button>
                           </div>
                        </Card>
                     </div>
                  </div>
               )}

               {/* Doctors Tab */}
               {activeTab === 'doctors' && (
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.staff.doctorsTitle')}</h3>
                           <p className="text-sm text-gray-500">{t('settings.staff.doctorsSubtitle')}</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenDoctorModal()}>{t('settings.staff.addDoctor')}</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {doctors.map(doc => (
                           <div key={doc.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: doc.color || '#3B82F6' }}>
                                    {doc.firstName[0]}{doc.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Dr. {doc.firstName} {doc.lastName}</p>
                                    <p className="text-xs text-gray-500">{doc.specialty}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{doc.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc')}</span>
                                 <button
                                    onClick={() => handleOpenDoctorModal(doc)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
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
                     </div>
                  </Card>
               )}

                {/* Receptionists Tab */}
               {activeTab === 'receptionists' && (
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">Resepshnlar Boshqaruvi</h3>
                           <p className="text-sm text-gray-500">Qabul xodimlarini boshqarish.</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenReceptionistModal()}>Resepshn Qo'shish</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {receptionists.map(rec => (
                           <div key={rec.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
                                    {rec.firstName[0]}{rec.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{rec.firstName} {rec.lastName}</p>
                                    <p className="text-xs text-gray-500">{rec.phone}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{rec.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc')}</span>
                                 <button
                                    onClick={() => handleOpenReceptionistModal(rec)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
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
                        {receptionists.length === 0 && (
                           <div className="text-center py-8 text-gray-500 text-sm">
                              Hozircha resepshnlar qo'shilmagan
                           </div>
                        )}
                     </div>
                  </Card>
               )}

               {/* Bot Tab */}
               {activeTab === 'bot' && (
                  <Card className="p-6">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600 dark:text-blue-400">
                           <Bot className="w-8 h-8" />
                        </div>
                        <div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('settings.bot.title')}</h3>
                           <p className="text-sm text-gray-500">{t('settings.bot.subtitle')}</p>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                           <h4 className="font-bold text-gray-900 dark:text-white mb-2">Shaxsiy Telegram Botni Ulash</h4>
                           <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                              Telegram-da @BotFather orqali o'zingizning shaxsiy botingizni yarating va bot tokenini quyidagi maydonga kiritib, uni tizimga ulang.
                           </p>

                           <form onSubmit={handleBotSave} className="space-y-4">
                              <Input 
                                 label="Telegram Bot Token" 
                                 value={botToken} 
                                 onChange={e => setBotToken(e.target.value)} 
                                 placeholder="7451241151:AAEi-y2F4_abcdefghijklmnopqrst..." 
                              />
                              <div className="flex items-center gap-4">
                                 <Button type="submit">{t('common.save')}</Button>
                                 {botSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                              </div>
                           </form>
                        </div>

                        {currentClinic?.telegramChatId ? (
                           <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl">
                              <div className="flex items-center gap-3">
                                 <CheckCircle className="w-5 h-5 text-emerald-500" />
                                 <div>
                                    <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{t('settings.bot.active')}</p>
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400">Siz har kuni soat 22:00 da hisobotlarni qabul qilasiz.</p>
                                 </div>
                              </div>
                           </div>
                        ) : (
                           <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl">
                              <Activity className="w-5 h-5 text-amber-500" />
                              <p className="text-sm text-amber-900 dark:text-amber-200">{t('settings.bot.notConnected')}</p>
                           </div>
                        )}
                     </div>
                  </Card>
               )}

               {/* SMS Tab */}
               {activeTab === 'sms' && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-xl text-purple-600 dark:text-purple-400">
                              <MessageSquare className="w-8 h-8" />
                           </div>
                           <div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">SMS va Xabar Yuborish Rejimi</h3>
                              <p className="text-sm text-gray-500">Mijozlarga xabarnomalar qanday yuborilishini sozlang va Eskiz.uz profilingizni ulang.</p>
                           </div>
                        </div>
                        <form onSubmit={handleSmsSave} className="space-y-8">
                           <div>
                              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">1. Rejimni tanlang</h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <label className={`relative flex cursor-pointer rounded-lg border bg-white dark:bg-gray-800 p-4 shadow-sm focus:outline-none ${smsForm.notificationMode === 'telegram_only' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                    <input 
                                       type="radio" 
                                       name="notificationMode"
                                       value="telegram_only"
                                       checked={smsForm.notificationMode === 'telegram_only'}
                                       onChange={(e) => setSmsForm({...smsForm, notificationMode: e.target.value})}
                                       className="sr-only"
                                    />
                                    <span className="flex flex-1">
                                       <span className="flex flex-col">
                                          <span className="block text-sm font-medium text-gray-900 dark:text-white mb-1">🤖 Faqat Telegram Bot</span>
                                          <span className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400">Xabarlar mijozning Telegram profiliga (bepul) yuboriladi</span>
                                       </span>
                                    </span>
                                    <CheckCircle className={`h-5 w-5 ${smsForm.notificationMode === 'telegram_only' ? 'text-purple-600' : 'invisible'}`} />
                                 </label>
                                 <label className={`relative flex cursor-pointer rounded-lg border bg-white dark:bg-gray-800 p-4 shadow-sm focus:outline-none ${smsForm.notificationMode === 'sms_only' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                    <input 
                                       type="radio" 
                                       name="notificationMode"
                                       value="sms_only"
                                       checked={smsForm.notificationMode === 'sms_only'}
                                       onChange={(e) => setSmsForm({...smsForm, notificationMode: e.target.value})}
                                       className="sr-only"
                                    />
                                    <span className="flex flex-1">
                                       <span className="flex flex-col">
                                          <span className="block text-sm font-medium text-gray-900 dark:text-white mb-1">📱 Faqat SMS (Eskiz)</span>
                                          <span className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400">Xabarlar bevosita telefon raqamiga (pullik) yuboriladi</span>
                                       </span>
                                    </span>
                                    <CheckCircle className={`h-5 w-5 ${smsForm.notificationMode === 'sms_only' ? 'text-purple-600' : 'invisible'}`} />
                                 </label>
                                 <label className={`relative flex cursor-pointer rounded-lg border bg-white dark:bg-gray-800 p-4 shadow-sm focus:outline-none ${smsForm.notificationMode === 'both' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                    <input 
                                       type="radio" 
                                       name="notificationMode"
                                       value="both"
                                       checked={smsForm.notificationMode === 'both'}
                                       onChange={(e) => setSmsForm({...smsForm, notificationMode: e.target.value})}
                                       className="sr-only"
                                    />
                                    <span className="flex flex-1">
                                       <span className="flex flex-col">
                                          <span className="block text-sm font-medium text-gray-900 dark:text-white mb-1">🤖📱 Ikkalasi ham</span>
                                          <span className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400">Xabarlar avval Telegram, so'ng qo'shimcha sifatida SMS orqali boradi</span>
                                       </span>
                                    </span>
                                    <CheckCircle className={`h-5 w-5 ${smsForm.notificationMode === 'both' ? 'text-purple-600' : 'invisible'}`} />
                                 </label>
                              </div>
                           </div>

                           {(smsForm.notificationMode === 'sms_only' || smsForm.notificationMode === 'both') && (
                              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                                 <div className="flex items-center justify-between mb-6">
                                    <h4 className="text-lg font-medium text-gray-900 dark:text-white">2. Eskiz.uz Integratsiyasi</h4>
                                    {smsConnected ? (
                                       <span className="flex items-center text-green-600 text-sm font-medium bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full">
                                          <CheckCircle className="w-4 h-4 mr-1.5" /> Ulangan
                                       </span>
                                    ) : (
                                       <span className="flex items-center text-amber-600 text-sm font-medium bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-full">
                                          <Activity className="w-4 h-4 mr-1.5" /> Ulanmagan
                                       </span>
                                    )}
                                 </div>
                                 <div className="space-y-4">
                                    <Input 
                                       label="Eskiz.uz Kabinet Email" 
                                       placeholder="kabinet@eskiz.uz"
                                       value={smsForm.eskizEmail} 
                                       onChange={(e) => setSmsForm({...smsForm, eskizEmail: e.target.value})}
                                       required
                                    />
                                    <div className="space-y-1">
                                        <p className="sms-settings-label text-sm font-medium text-gray-700 dark:text-gray-300">Eskiz.uz Kabinet Paroli</p>
                                        <input
                                            type="password"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            placeholder={smsHasPassword ? "(Parol kiritilgan. O'zgartirish uchun yangisini kiriting)" : "Yashirin kalitni kiriting"}
                                            value={smsForm.eskizPassword}
                                            onChange={(e) => setSmsForm({...smsForm, eskizPassword: e.target.value})}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <p className="sms-settings-label text-sm font-medium text-gray-700 dark:text-gray-300">Nickname (Yuboruvchi nomi)</p>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            placeholder="Masalan: 4546 yoki DentaCRM"
                                            value={smsForm.eskizNick}
                                            onChange={(e) => setSmsForm({...smsForm, eskizNick: e.target.value})}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Eskizda tasdiqlangan maxsus nomingiz bo'lsa kiriting. Aks holda 4546 qoladi.
                                        </p>
                                    </div>
                                </div>
                     
                                    <div className="pt-2">
                                       <Button type="submit" className="w-full sm:w-auto">Saqlash va Ulanishni Tekshirish</Button>
                                    </div>
                                 </div>
                           )}

                           {smsForm.notificationMode === 'telegram_only' && (
                              <div className="pt-4">
                                 <Button type="submit" variant="primary">Saqlash</Button>
                              </div>
                           )}
                           
                           {smsSaved && <span className="text-green-600 text-sm flex items-center mt-2"><CheckCircle className="w-4 h-4 mr-1" /> Saqlandi</span>}
                        </form>
                     </Card>

                     {smsConnected && (smsForm.notificationMode === 'sms_only' || smsForm.notificationMode === 'both') && (
                        <Card className="p-6 border-l-4 border-l-purple-500">
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                              <div>
                                 <p className="text-sm font-medium text-gray-500 mb-1">Joriy SMS balans (Eskiz.uz)</p>
                                 <div className="flex items-end gap-2">
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                       {smsBalance !== null ? smsBalance.toLocaleString() : 'Tekshirilmoqda...'}
                                    </p>
                                    <span className="text-gray-500 mb-1 font-medium">ta SMS qoldi</span>
                                 </div>
                              </div>

                              <div className="w-full md:w-auto p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                 <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Test SMS yuborish</p>
                                 <div className="flex gap-2">
                                    <Input 
                                       placeholder="998901234567" 
                                       value={smsTestPhone} 
                                       onChange={(e) => setSmsTestPhone(e.target.value)} 
                                    />
                                    <Button onClick={handleSmsTest} disabled={!smsTestPhone || !smsConnected || isCheckingSms} variant="secondary" className="whitespace-nowrap">
                                       {isCheckingSms ? '...' : 'Yuborish'}
                                    </Button>
                                 </div>
                              </div>
                           </div>
                        </Card>
                     )}
                  </div>
               )}


            </div>
         </div>

         {/* Add/Edit Service Modal */}
         <Modal isOpen={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} title={editingServiceIndex !== null ? t('settings.services.edit') : t('settings.services.addModal')}>
            <form onSubmit={handleServiceSubmit} className="space-y-4">
               <Input label={t('settings.services.thName')} value={serviceForm.name} onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })} required />

               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategoriya</label>
                  <Select
                     value={serviceForm.categoryId}
                     onChange={e => setServiceForm({ ...serviceForm, categoryId: e.target.value })}
                     options={[
                        { value: '', label: 'Kategoriyasiz' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                     ]}
                  />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.services.thPrice')} type="number" value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })} required />
                  <Input label="Texniklar xarajati" type="number" value={serviceForm.cost} onChange={e => setServiceForm({ ...serviceForm, cost: e.target.value })} placeholder="0" />
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsServiceModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Add Category Modal */}
         <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={t('settings.services.addCategory')}>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
               <Input label={t('settings.services.categoryName')} value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsCategoryModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>



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
                     <Input
                        label="Shifokor Ulushi (%)"
                        type="number"
                        value={doctorForm.percentage}
                        onChange={e => setDoctorForm({ ...doctorForm, percentage: e.target.value })}
                        placeholder="50"
                        helperText="Sof foydadan shifokor olishi kerak bo'lgan foiz"
                     />
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kalendar rangi</label>
                     <div className="flex flex-wrap gap-3">
                        {DOCTOR_COLORS.map((color) => (
                           <button
                              key={color.value}
                              type="button"
                              onClick={() => setDoctorForm({ ...doctorForm, color: color.value })}
                              className={`w-8 h-8 rounded-full border-2 transition-all ${doctorForm.color === color.value ? 'border-blue-500 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                              style={{ backgroundColor: color.value }}
                              title={color.name}
                           />
                        ))}
                     </div>
                     <p className="text-xs text-gray-500 mt-2">Bu rang kalendarda shifokor qabullarini belgilash uchun ishlatiladi.</p>
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsDoctorModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Upgrade Plan Modal */}
         <Modal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} title="{t('settings.services.upgrade')}">
            <div className="text-center py-4 space-y-4">
               <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-indigo-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Cheklovlarni olib tashlang!</h3>
               <p className="text-gray-500 dark:text-gray-400 px-4">
                  Sizning tarifingiz bo'yicha yangi shifokor qo'sha olmaysiz. Iltimos, tarifingizni o'zgartirish uchun menejer bilan bog'laning!
               </p>
               <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                  <p className="font-bold text-gray-900 dark:text-white text-lg">+998 90 824 29 92</p>
                  <a
                     href="https://t.me/ergashevulugbekk"
                     target="_blank"
                     rel="noopener noreferrer"
                     className="flex items-center justify-center gap-2 text-blue-500 hover:text-blue-600 font-medium"
                  >
                     <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.44-.42-1.38-.88.03-.24.38-.49 1.03-.75 4.06-1.77 6.77-2.94 8.13-3.51 3.87-1.6 4.67-1.88 5.2-1.88.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.13-.03.23z" />
                     </svg>
                     t.me/ergashevulugbekk
                  </a>
               </div>
               <div className="pt-2">
                  <Button onClick={() => setIsUpgradeModalOpen(false)}>Tushunarli</Button>
               </div>
            </div>
         </Modal>

         {/* Delete Doctor Confirmation Modal */}
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
         {/* Facebook Page Selection Modal */}
         <Modal isOpen={isFBPageModalOpen} onClose={() => setIsFBPageModalOpen(false)} title="Facebook Sahifasini Tanlang">
            <div className="space-y-4">
               <p className="text-sm text-gray-500 mb-4">
                  Quyidagi sahifalardan birini tanlang. Ushbu sahifaga kelgan arizalar tizimga avtomatik tushadi.
               </p>
               <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                  {facebookPages.map(page => (
                     <button
                        key={page.id}
                        onClick={() => handleSelectFBPage(page)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-100 dark:border-gray-700 rounded-xl transition-all group"
                     >
                        <div className="flex items-center gap-3 text-left">
                           <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400">
                              <Facebook className="w-6 h-6" />
                           </div>
                           <div>
                              <div className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                 {page.name}
                               </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">ID: {page.id}</div>
                           </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                           <Plus className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                        </div>
                     </button>
                  ))}
                  {facebookPages.length === 0 && (
                     <div className="py-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <Facebook className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Hech qanday sahifa topilmadi</p>
                     </div>
                  )}
               </div>
               <div className="flex justify-end pt-4">
                  <Button variant="secondary" onClick={() => setIsFBPageModalOpen(false)}>Yopish</Button>
               </div>
            </div>
         </Modal>
      </div>
   );
};