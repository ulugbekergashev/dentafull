import React, { useState } from 'react';
import { Card, Button, Input, Modal, Select } from '../components/Common';
import { UpgradePlanModal } from '../components/UpgradePlanModal';

import { UserRole, Doctor, Clinic, SubscriptionPlan, Service, ServiceCategory, LeadApiKeyInfo, Branch } from '../types';
import { User, DollarSign, Users, Edit, Trash2, CheckCircle, Bot, Phone, MessageSquare, Building2, Plus, Activity, RefreshCw, KeyRound, Copy, Eye, EyeOff, Link2, ChevronDown, Sparkles, AlertTriangle, CreditCard, Plug, MapPin, SlidersHorizontal } from 'lucide-react';
import { api, API_URL } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

// Sozlamalar — klinikaning o'z sozlamalari:
//   Klinika             — ma'lumotlar va ish vaqti
//   Filiallar           — faqat klinika egasiga
//   Maxsus imkoniyatlar — chek chiqarish, oldindan to'lov, kassa smenalari
//   Xizmatlar       — kategoriyalar va narxlar
//   Integratsiyalar — Telegram va SMS, DMED, AI kaliti, lid API
//   Tarif           — obuna, muddat va cheklovlar
// Ilgari o'n bitta bo'lim aralash turardi: tarif "Xizmatlar" ichida, reyting
// "Umumiy" tepasida, xodimlar uch bo'lakka bo'lingan edi. Xodimlar va ruxsatlar
// endi yon menyudagi "Xodimlar" sahifasida, klinika reytingi — uning statistikasida.

interface SettingsProps {
   userRole: UserRole;
   services: Service[];
   /** Tarif cheklovi (nechta shifokor bor) va filial kartalaridagi hisob uchun */
   doctors: Doctor[];
   categories: ServiceCategory[];
   onAddService: (service: Omit<Service, 'id' | 'clinicId'>) => void;
   onUpdateService: (index: number, service: Partial<Service>) => void;
   onDeleteService?: (id: number) => Promise<void>;
   onAddCategory: (category: Omit<ServiceCategory, 'id' | 'clinicId'>) => void;
   onDeleteCategory: (id: string) => void;
   branches?: Branch[];
   /** Filial bo'yicha bemorlar soni. '' kaliti — filialsiz bemorlar. */
   patientCountByBranch?: Record<string, number>;
   onAddBranch?: (data: { name: string; address?: string; phone?: string; assignExisting?: boolean }) => Promise<Branch>;
   onUpdateBranch?: (id: string, data: Partial<Branch>) => Promise<void>;
   onDeleteBranch?: (id: string) => Promise<void>;
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
}

export const Settings: React.FC<SettingsProps> = ({
   userRole, services, categories, doctors, onAddService, onUpdateService, onDeleteService, onAddCategory, onDeleteCategory, branches = [], patientCountByBranch = {}, onAddBranch, onUpdateBranch, onDeleteBranch, currentClinic, plans
}) => {
   const { t } = useLanguage();
   const isAdmin = userRole === UserRole.CLINIC_ADMIN;
   type SettingsTab = 'clinic' | 'branches' | 'services' | 'features' | 'integrations' | 'plan';
   type IntegrationTab = 'messaging' | 'dmed' | 'ai' | 'leadApi';
   // Boshqa sahifadan aniq bo'limga yo'naltirish uchun: /settings?tab=leadApi.
   // Eski bo'lim nomlari (general, branches, messaging, dmed...) ham ishlaydi.
   const [initialTab, initialIntegration] = ((): [SettingsTab, IntegrationTab] => {
      try {
         const tab = new URLSearchParams(window.location.search).get('tab') || '';
         if (tab === 'clinic' || tab === 'general') return ['clinic', 'messaging'];
         if (tab === 'branches' && isAdmin) return ['branches', 'messaging'];
         if (tab === 'features') return ['features', 'messaging'];
         if (tab === 'services' || tab === 'integrations' || tab === 'plan') return [tab, 'messaging'];
         if (tab === 'messaging' || tab === 'dmed') return ['integrations', tab];
         // AI va lid kalitini faqat klinika egasi ko'radi
         if ((tab === 'ai' || tab === 'leadApi') && isAdmin) return ['integrations', tab];
      } catch { /* manzilni o'qib bo'lmasa — odatdagi bo'lim */ }
      return ['services', 'messaging'];
   })();
   const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
   const [integrationTab, setIntegrationTab] = useState<IntegrationTab>(initialIntegration);
   // Hozir ochiq bo'lim. Integratsiyalar ichidagi har bir bo'lim o'z ma'lumotini
   // faqat o'zi ochilganda yuklaydi — quyidagi effektlar shunga qaraydi.
   const activeSection: string = activeTab === 'integrations' ? integrationTab : activeTab;

   // Klinikaning o'z AI kaliti
   const [aiInfo, setAiInfo] = useState<{ provider: string; hasKey: boolean; keyHint: string; checkedAt: string | null; providers: string[] } | null>(null);
   const [aiProvider, setAiProvider] = useState('gemini');
   const [aiKeyInput, setAiKeyInput] = useState('');
   const [aiSaving, setAiSaving] = useState(false);
   const [aiMsg, setAiMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

   // Tashqi lid manbalari (yuboraman.uz va h.k.) uchun integratsiya kaliti
   const [leadApiInfo, setLeadApiInfo] = useState<LeadApiKeyInfo | null>(null);
   const [leadApiLoading, setLeadApiLoading] = useState(false);
   const [leadKeyVisible, setLeadKeyVisible] = useState(false);
   const [leadCopied, setLeadCopied] = useState<string | null>(null);
   const [leadDocsOpen, setLeadDocsOpen] = useState(false);

   React.useEffect(() => {
      if (activeSection !== 'leadApi' || !currentClinic?.id) return;
      let cancelled = false;
      setLeadApiLoading(true);
      api.leads.getApiKey(currentClinic.id)
         .then(info => { if (!cancelled) setLeadApiInfo(info); })
         .catch(err => console.error('Lid API kalitini yuklab bo\'lmadi', err))
         .finally(() => { if (!cancelled) setLeadApiLoading(false); });
      return () => { cancelled = true; };
   }, [activeSection, currentClinic?.id]);

   React.useEffect(() => {
      if (activeSection !== 'ai' || !currentClinic?.id) return;
      let cancelled = false;
      api.aiSettings.get(currentClinic.id)
         .then(info => {
            if (cancelled) return;
            setAiInfo(info);
            if (info.provider) setAiProvider(info.provider);
         })
         .catch(err => console.error("AI sozlamalarini yuklab bo'lmadi", err));
      return () => { cancelled = true; };
   }, [activeSection, currentClinic?.id]);

   const handleSaveAiKey = async () => {
      if (!currentClinic?.id) return;
      setAiSaving(true);
      setAiMsg(null);
      try {
         await api.aiSettings.save(currentClinic.id, aiProvider, aiKeyInput.trim());
         setAiKeyInput('');
         const info = await api.aiSettings.get(currentClinic.id);
         setAiInfo(info);
         setAiMsg({ kind: 'ok', text: 'Kalit tekshirildi va saqlandi.' });
      } catch (e: any) {
         // Server kalitni saqlashdan OLDIN tekshiradi, shuning uchun bu
         // yerdagi xato aniq sabab bo'ladi: kalit noto'g'ri, provayder
         // javob bermadi va h.k.
         setAiMsg({ kind: 'err', text: e?.message || 'Kalit saqlanmadi.' });
      } finally {
         setAiSaving(false);
      }
   };

   const handleRemoveAiKey = async () => {
      if (!currentClinic?.id) return;
      setAiSaving(true);
      setAiMsg(null);
      try {
         await api.aiSettings.save(currentClinic.id, '', null);
         const info = await api.aiSettings.get(currentClinic.id);
         setAiInfo(info);
         setAiMsg({ kind: "ok", text: "Kalit o'chirildi. Umumiy kalit ishlatiladi." });
      } catch (e: any) {
         setAiMsg({ kind: "err", text: e?.message || "O'chirib bo'lmadi." });
      } finally {
         setAiSaving(false);
      }
   };

   const copyLeadValue = async (value: string, marker: string) => {
      try {
         await navigator.clipboard.writeText(value);
         setLeadCopied(marker);
         setTimeout(() => setLeadCopied(null), 1800);
      } catch {
         alert('Nusxalab bo\'lmadi. Qo\'lda belgilab oling.');
      }
   };

   const handleGenerateLeadKey = async () => {
      if (!currentClinic?.id) return;
      if (leadApiInfo?.apiKey && !window.confirm('Yangi kalit yaratilsa, eski kalit darhol ishlamay qoladi. Davom etasizmi?')) return;
      setLeadApiLoading(true);
      try {
         setLeadApiInfo(await api.leads.generateApiKey(currentClinic.id));
         setLeadKeyVisible(true);
      } catch (err: any) {
         alert(err?.message || 'Kalit yaratishda xatolik');
      } finally {
         setLeadApiLoading(false);
      }
   };

   const handleRevokeLeadKey = async () => {
      if (!currentClinic?.id) return;
      if (!window.confirm('Kalit o\'chirilsa, tashqi manbadan lid tushishi to\'xtaydi. Davom etasizmi?')) return;
      setLeadApiLoading(true);
      try {
         await api.leads.revokeApiKey(currentClinic.id);
         setLeadApiInfo(prev => prev ? { ...prev, apiKey: null, createdAt: null } : prev);
      } catch (err: any) {
         alert(err?.message || 'Kalitni o\'chirishda xatolik');
      } finally {
         setLeadApiLoading(false);
      }
   };

   // Kassa smenalari — Klinika bo'limida. Ilgari Ruxsatlar oxirida turardi, lekin u ruxsat emas.
   const [cashShifts, setCashShifts] = useState<number>(currentClinic?.cashShiftsPerDay || 1);
   const [cashShiftsSaving, setCashShiftsSaving] = useState(false);

   // Klinika ma'lumoti keyin yuklansa, qiymatni sinxronlash
   React.useEffect(() => {
      setCashShifts(currentClinic?.cashShiftsPerDay || 1);
   }, [currentClinic?.id, currentClinic?.cashShiftsPerDay]);

   const saveCashShifts = async (value: number) => {
      if (!currentClinic?.id) return;
      setCashShifts(value);
      setCashShiftsSaving(true);
      try {
         await api.clinics.updateCashSettings(currentClinic.id, value);
      } catch (error: any) {
         console.error('Cash settings save failed:', error);
         setCashShifts(currentClinic?.cashShiftsPerDay || 1);
         alert(error?.message || 'Kassa sozlamasini saqlashda xatolik');
      } finally {
         setCashShiftsSaving(false);
      }
   };

   const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
   const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
   const [categoryForm, setCategoryForm] = useState({ name: '' });

   // Service Modal State
   const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
   const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
   const [serviceForm, setServiceForm] = useState({ name: '', price: '', cost: '', categoryId: '', recallMonths: '' });

   // Filial modali
   const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
   const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
   const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', assignExisting: false });
   const [branchSaving, setBranchSaving] = useState(false);
   const [branchError, setBranchError] = useState<string | null>(null);
   const [deleteConfirmBranch, setDeleteConfirmBranch] = useState<Branch | null>(null);

   const handleOpenBranchModal = (branch?: Branch) => {
      setBranchError(null);
      if (branch) {
         setEditingBranchId(branch.id);
         setBranchForm({ name: branch.name, address: branch.address || '', phone: branch.phone || '', assignExisting: false });
      } else {
         setEditingBranchId(null);
         // Birinchi filialda mavjud yozuvlarni biriktirish odatiy yoqilgan:
         // aks holda filial tanlangan zahoti hamma ro'yxat bo'sh ko'rinadi.
         setBranchForm({ name: '', address: '', phone: '', assignExisting: branches.length === 0 });
      }
      setIsBranchModalOpen(true);
   };

   const handleBranchSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!branchForm.name.trim()) return;
      setBranchSaving(true);
      setBranchError(null);
      try {
         if (editingBranchId) {
            await onUpdateBranch?.(editingBranchId, {
               name: branchForm.name.trim(),
               address: branchForm.address.trim() || null,
               phone: branchForm.phone.trim() || null,
            });
         } else {
            await onAddBranch?.({
               name: branchForm.name.trim(),
               address: branchForm.address.trim() || undefined,
               phone: branchForm.phone.trim() || undefined,
               assignExisting: branchForm.assignExisting,
            });
         }
         setIsBranchModalOpen(false);
      } catch (err: any) {
         setBranchError(err?.message || 'Saqlanmadi');
      } finally {
         setBranchSaving(false);
      }
   };

   // Upgrade Plan Modal State
   const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

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

   // Prepayment Settings State
   const [prepaymentForm, setPrepaymentForm] = useState({
      prepaymentEnabled: false,
      prepaymentCardNumber: '',
      prepaymentAmount: 0,
   });
   const [prepaymentSaved, setPrepaymentSaved] = useState(false);

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

   // Sync prepayment settings
   React.useEffect(() => {
      if (currentClinic) {
         setPrepaymentForm({
            prepaymentEnabled: currentClinic.prepaymentEnabled ?? false,
            prepaymentCardNumber: currentClinic.prepaymentCardNumber || '',
            prepaymentAmount: currentClinic.prepaymentAmount ?? 0,
         });
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
      if (activeSection === 'messaging') {
          fetchSms();
      }
   }, [currentClinic?.id, activeSection]);

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

   // Categories effect removed as it's now in App.tsx


   // Handlers
   const handleOpenServiceModal = (service?: Service) => {
      if (service) {
         setEditingServiceId(service.id as number);
         setServiceForm({
            name: service.name,
            price: service.price.toString(),
            cost: (service.cost || 0).toString(),
            categoryId: service.categoryId || '',
            recallMonths: service.recallMonths ? String(service.recallMonths) : ''
         });
      } else {
         setEditingServiceId(null);
         setServiceForm({ name: '', price: '', cost: '', categoryId: selectedCategory || '', recallMonths: '' });
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
         categoryId: serviceForm.categoryId || undefined,
         // Nazorat: necha oydan keyin bemorni qayta chaqirish (bo'sh — kerak emas)
         recallMonths: serviceForm.recallMonths === '' ? null : Number(serviceForm.recallMonths)
      };

      if (editingServiceId !== null) {
         const realIndex = services.findIndex(s => s.id === editingServiceId);
         if (realIndex !== -1) onUpdateService(realIndex, data);
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

   const handleSmsSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         await api.sms.saveSettings(currentClinic.id, {
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
            alert('Ulanishda xatolik: ' + ((res as any).error || 'Noma\'lum xatolik'));
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
         const response = await api.clinics.updateGeneral(currentClinic.id, {
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

   const handlePrepaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;
      try {
         await api.clinics.savePrepaymentSettings(currentClinic.id, {
            prepaymentEnabled: prepaymentForm.prepaymentEnabled,
            prepaymentCardNumber: prepaymentForm.prepaymentCardNumber,
            prepaymentAmount: Number(prepaymentForm.prepaymentAmount),
         });
         setPrepaymentSaved(true);
         setTimeout(() => setPrepaymentSaved(false), 2000);
      } catch (error) {
         console.error('Failed to save prepayment settings:', error);
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

   const tabs: { id: SettingsTab; name: string; icon: React.ElementType }[] = [
      { id: 'clinic', name: t('settings.tabs.clinic'), icon: Building2 },
      // Filiallarni faqat klinika egasi boshqaradi
      ...(isAdmin ? [{ id: 'branches' as const, name: t('branches.title'), icon: MapPin }] : []),
      { id: 'services', name: t('settings.tabs.servicesPrices'), icon: DollarSign },
      { id: 'features', name: t('settings.tabs.features'), icon: SlidersHorizontal },
      { id: 'integrations', name: t('settings.tabs.integrations'), icon: Plug },
      { id: 'plan', name: t('settings.tabs.plan'), icon: CreditCard },
   ];

   const integrationTabs: { id: IntegrationTab; name: string; icon: React.ElementType }[] = [
      { id: 'messaging', name: t('settings.integrations.messaging'), icon: MessageSquare },
      { id: 'dmed', name: 'DMED', icon: Activity },
      // Kalitlarni faqat klinika egasi ko'radi — backend ham shu rolni talab qiladi.
      ...(isAdmin ? [
         { id: 'ai' as const, name: t('settings.integrations.ai'), icon: Sparkles },
         { id: 'leadApi' as const, name: t('settings.integrations.leadApi'), icon: Link2 },
      ] : []),
   ];

   return (
      <div className="space-y-6 animate-fade-in">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

         <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Bo'limlar */}
            <Card className="col-span-1 h-fit p-2">
               {tabs.map((item) => (
                  <button
                     key={item.id}
                     onClick={() => setActiveTab(item.id)}
                     className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-colors ${activeTab === item.id
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                  >
                     <item.icon className="w-4 h-4" />
                     {item.name}
                  </button>
               ))}
            </Card>

            <div className="lg:col-span-3 space-y-6">

               {/* Klinika: ma'lumotlar va ish vaqti */}
               {activeTab === 'clinic' && (
                  <div className="space-y-6">
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

                           <div className="pt-4 flex items-center gap-4">
                              <Button type="submit">{t('common.save')}</Button>
                              {generalSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                           </div>
                        </form>
                     </Card>
                  </div>
               )}

               {/* Filiallar — faqat klinika egasi boshqaradi, backend ham shuni talab qiladi */}
               {activeTab === 'branches' && isAdmin && (
                     <Card className="p-6">
                        <div className="flex justify-between items-start gap-4 mb-6">
                           <div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('branches.title')}</h3>
                              <p className="text-sm text-gray-500">{t('branches.subtitle')}</p>
                           </div>
                           <Button size="sm" onClick={() => handleOpenBranchModal()}>
                              <Plus className="w-4 h-4 mr-1.5" />
                              {t('branches.add')}
                           </Button>
                        </div>

                        {branches.length === 0 ? (
                           <div className="text-center py-12 px-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                              <div className="mx-auto w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3">
                                 <Building2 className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                              </div>
                              <p className="font-medium text-gray-900 dark:text-white">{t('branches.empty')}</p>
                              <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{t('branches.emptyHint')}</p>
                           </div>
                        ) : (
                           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                              {branches.map(branch => (
                                 <div
                                    key={branch.id}
                                    className="group relative p-5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 hover:border-primary-200 dark:hover:border-primary-800 hover:shadow-sm transition-all"
                                 >
                                    <div className="flex items-start justify-between">
                                       <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 flex items-center justify-center">
                                          <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                       </div>
                                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                          <button
                                             type="button"
                                             onClick={() => handleOpenBranchModal(branch)}
                                             className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
                                             title={t('branches.edit')}
                                          >
                                             <Edit className="w-4 h-4" />
                                          </button>
                                          <button
                                             type="button"
                                             onClick={() => setDeleteConfirmBranch(branch)}
                                             className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                                             title={t('branches.deleteTitle')}
                                          >
                                             <Trash2 className="w-4 h-4" />
                                          </button>
                                       </div>
                                    </div>
                                    <p className="mt-4 font-semibold text-gray-900 dark:text-white truncate">{branch.name}</p>
                                    <p className="text-sm text-gray-500 truncate">{branch.address || '—'}</p>
                                    {branch.phone && (
                                       <p className="mt-1 text-xs text-gray-400 flex items-center gap-1.5">
                                          <Phone className="w-3 h-3" />
                                          {branch.phone}
                                       </p>
                                    )}
                                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-3 text-xs text-gray-500">
                                       <span className="inline-flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-gray-400" />
                                          {t('branches.doctorCount').replace('{n}', String(doctors.filter(d => d.branchId === branch.id).length))}
                                       </span>
                                       <span className="inline-flex items-center gap-1.5">
                                          <User className="w-3.5 h-3.5 text-gray-400" />
                                          {t('branches.patientCount').replace('{n}', String(patientCountByBranch[branch.id] || 0))}
                                       </span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        )}

                        {branches.length > 0 && (patientCountByBranch[''] || 0) > 0 && (
                           <div className="mt-5 flex items-start gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20">
                              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                              <div className="text-sm">
                                 <p className="font-medium text-gray-900 dark:text-white">
                                    {t('branches.unassignedPatients').replace('{n}', String(patientCountByBranch[''] || 0))}
                                 </p>
                                 <p className="text-gray-600 dark:text-gray-400 mt-0.5">{t('branches.unassignedHint')}</p>
                              </div>
                           </div>
                        )}
                     </Card>
               )}

               {/* Maxsus imkoniyatlar: yoqib-o'chiriladigan qo'shimcha funksiyalar */}
               {activeTab === 'features' && (
                  <div className="space-y-6">
                     {/* Chek chiqarish — umumiy ma'lumotlar bilan bitta so'rovda saqlanadi */}
                     <Card className="p-6">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Chek chiqarish</h3>
                        <form onSubmit={handleGeneralSave} className="space-y-4">
                           <div className="pt-2">
                              <label className="flex items-center space-x-3 cursor-pointer">
                                 <input
                                    type="checkbox"
                                    checked={generalForm.enableReceipts}
                                    onChange={(e) => setGeneralForm({ ...generalForm, enableReceipts: e.target.checked })}
                                    className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
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

                     {/* Prepayment Settings Card */}
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl text-emerald-600 dark:text-emerald-400">
                              <DollarSign className="w-8 h-8" />
                           </div>
                           <div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Oldindan To'lov (Bron uchun)</h3>
                              <p className="text-sm text-gray-500">Bemor bot orqali qabulga yozilganda oldindan to'lov talab qilish.</p>
                           </div>
                        </div>

                        <form onSubmit={handlePrepaymentSave} className="space-y-5">
                           <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-700">
                              <label className="flex items-center justify-between cursor-pointer">
                                 <div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Oldindan to'lovni yoqish</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Yoqilsa, bemor qabulga yozilgandan keyin to'lov cheki yuborishi shart bo'ladi</p>
                                 </div>
                                 <div className="relative w-12 h-6 flex-shrink-0">
                                    <input
                                       type="checkbox"
                                       className="sr-only"
                                       checked={prepaymentForm.prepaymentEnabled}
                                       onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepaymentEnabled: e.target.checked })}
                                    />
                                    <div className={`w-12 h-6 rounded-full transition-colors ${prepaymentForm.prepaymentEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                       <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prepaymentForm.prepaymentEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                 </div>
                              </label>
                           </div>

                           {prepaymentForm.prepaymentEnabled && (
                              <div className="space-y-4">
                                 <Input
                                    label="Karta raqami"
                                    value={prepaymentForm.prepaymentCardNumber}
                                    onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepaymentCardNumber: e.target.value })}
                                    placeholder="8600 1234 5678 9012"
                                 />
                                 <Input
                                    label="Bron summasi (so'm)"
                                    type="number"
                                    value={prepaymentForm.prepaymentAmount === 0 ? '' : String(prepaymentForm.prepaymentAmount)}
                                    onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepaymentAmount: Number(e.target.value) })}
                                    placeholder="50000"
                                 />
                                 <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Bemor to'lov chekini (rasm yoki fayl) telegram bot orqali yuborganda, bu chek admin telegram chatiga avtomatik yuboriladi.
                                 </p>
                              </div>
                           )}

                           <div className="flex items-center gap-4">
                              <Button type="submit" variant="primary">Saqlash</Button>
                              {prepaymentSaved && (
                                 <span className="text-green-600 text-sm flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" /> Saqlandi
                                 </span>
                              )}
                           </div>
                        </form>
                     </Card>

                     {/* Kassa smenalari — backend faqat klinika egasiga ruxsat beradi */}
                     {isAdmin && (
                        <Card className="p-6">
                           <div className="mb-4">
                              <h4 className="text-base font-bold text-gray-900 dark:text-white">Kassa smenalari</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                 Smena kassir "Kunni yopish" bosgan daqiqada tugaydi — soat bo'yicha emas.
                                 Undan keyingi to'lovlar keyingi smenaga o'tadi.
                              </p>
                           </div>
                           <div className="flex flex-wrap items-center gap-2">
                              {[1, 2].map(n => (
                                 <button
                                    key={n}
                                    type="button"
                                    disabled={cashShiftsSaving}
                                    onClick={() => saveCashShifts(n)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all disabled:opacity-50 ${cashShifts === n
                                       ? 'bg-primary-600 text-white border-primary-600'
                                       : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                                 >
                                    {n === 1 ? 'Kuniga 1 smena' : 'Kuniga 2 smena'}
                                 </button>
                              ))}
                              {cashShiftsSaving && <span className="text-xs text-gray-400">Saqlanmoqda...</span>}
                           </div>
                           <p className="text-[11px] text-gray-400 mt-3">
                              {cashShifts === 1
                                 ? 'Kassa sahifasida kun butunligicha ko\'rinadi.'
                                 : 'Kassa sahifasida "1-smena / 2-smena" tanlagichi chiqadi. 2-smena 1-smena topshirgan naqddan boshlanadi.'}
                           </p>
                        </Card>
                     )}
                  </div>
               )}

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
                              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${!selectedCategory ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                           >
                              {t('settings.services.all')}
                           </button>
                           {categories.map(cat => (
                              <div key={cat.id} className="group flex items-center justify-between">
                                 <button
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex-1 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedCategory === cat.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
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
                                       <th className="px-4 py-3 font-medium text-gray-500">{t('settings.services.thRecall')}</th>
                                       <th className="px-4 py-3 font-medium text-gray-500 text-right">{t('settings.services.thAction')}</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {services
                                       .filter(s => !selectedCategory || s.categoryId === selectedCategory)
                                       .map((s) => (
                                          <tr key={s.id ?? s.name} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                                             <td className="px-4 py-3 text-gray-900 dark:text-gray-200 font-medium">{s.name}</td>
                                             <td className="px-4 py-3 text-gray-500">{s.price.toLocaleString()} UZS</td>
                                             <td className="px-4 py-3 text-gray-500">{s.recallMonths ? `${s.recallMonths} ${t('patients.details.recall.months')}` : '—'}</td>
                                             <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                   <button
                                                      onClick={() => handleOpenServiceModal(s)}
                                                      className="text-primary-600 hover:text-primary-800 p-1 hover:bg-primary-50 rounded transition-colors"
                                                   >
                                                      <Edit className="w-4 h-4" />
                                                   </button>
                                                   {onDeleteService && s.id && (
                                                      <button
                                                         onClick={async () => {
                                                            if (!window.confirm(`"${s.name}" xizmatini o'chirishni tasdiqlaysizmi?`)) return;
                                                            await onDeleteService(s.id as number);
                                                         }}
                                                         className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors"
                                                      >
                                                         <Trash2 className="w-4 h-4" />
                                                      </button>
                                                   )}
                                                </div>
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
                     </div>
                  </div>
               )}

               {/* Integratsiyalar: tashqi xizmatlar bilan ulanishlar bir joyda */}
               {activeTab === 'integrations' && (
                  <div className="space-y-6">
                     <div className="flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit max-w-full">
                        {integrationTabs.map(item => (
                           <button
                              key={item.id}
                              type="button"
                              onClick={() => setIntegrationTab(item.id)}
                              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${integrationTab === item.id
                                 ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                 : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                           >
                              <item.icon className="w-4 h-4" />
                              {item.name}
                           </button>
                        ))}
                     </div>

                     {/* Telegram bot va Eskiz SMS (birlashtirilgan) */}
                     {integrationTab === 'messaging' && (
                  <div className="space-y-6">
                  <Card className="p-6">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-primary-100 dark:bg-primary-900/40 rounded-xl text-primary-600 dark:text-primary-400">
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

                        {/* Eskiz SMS — bot tokeni bilan bir joyda. Telegram'ga ulanmagan
                            bemorga avtomatik xabar SMS orqali boradi: kanalni ulangan
                            narsa belgilaydi, alohida "rejim" tanlash yo'q. */}
                        <form onSubmit={handleSmsSave} className="space-y-3">
                              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                                 <div className="flex items-center justify-between mb-6">
                                    <h4 className="text-lg font-medium text-gray-900 dark:text-white">Eskiz.uz SMS</h4>
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
                                 <p className="text-sm text-gray-600 dark:text-gray-400 -mt-3 mb-5">Telegram botga ulanmagan bemorlarga xabarlar SMS orqali yuboriladi (pullik).</p>
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

                           
                           {smsSaved && <span className="text-green-600 text-sm flex items-center mt-2"><CheckCircle className="w-4 h-4 mr-1" /> Saqlandi</span>}
                        </form>
                     </div>
                  </Card>

                     {smsConnected && (
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

                     {integrationTab === 'dmed' && (
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

                        <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-100 dark:border-primary-800/40 mb-6">
                           <p className="text-sm text-primary-800 dark:text-primary-200">
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

                     {integrationTab === 'ai' && isAdmin && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <Sparkles className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">AI kaliti</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                           DentaAI hozir umumiy kalit bilan ishlaydi va u barcha klinikalarga taqsimlanadi —
                           tig'iz paytda "xizmat band" xabari chiqishi mumkin. O'z kalitingizni kiritsangiz,
                           chegara faqat sizniki bo'ladi va kutish yo'qoladi. Kalit bepul olinadi.
                        </p>

                        {aiInfo?.hasKey ? (
                           <div className="rounded-lg border border-emerald-200 dark:border-emerald-800
                                           bg-emerald-50 dark:bg-emerald-900/20 p-4 mb-5">
                              <div className="flex items-start gap-3">
                                 <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                                 <div className="min-w-0">
                                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                                       O'z kalitingiz ulangan
                                    </p>
                                    <p className="text-sm text-emerald-700/80 dark:text-emerald-300/70 mt-0.5">
                                       {aiInfo.provider} · {aiInfo.keyHint}
                                       {aiInfo.checkedAt && ` · tekshirilgan: ${new Date(aiInfo.checkedAt).toLocaleString('uz-UZ')}`}
                                    </p>
                                 </div>
                              </div>
                           </div>
                        ) : (
                           <div className="rounded-lg border border-gray-200 dark:border-gray-700
                                           bg-gray-50 dark:bg-gray-800/50 p-4 mb-5">
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                 Hozir umumiy kalit ishlatilmoqda.
                              </p>
                           </div>
                        )}

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                           Provayder
                        </label>
                        <select
                           value={aiProvider}
                           onChange={e => setAiProvider(e.target.value)}
                           className="w-full px-3 py-2.5 mb-4 bg-white dark:bg-gray-800 border border-gray-200
                                      dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                        >
                           <option value="gemini">Google Gemini (bepul, tavsiya etiladi)</option>
                           <option value="groq">Groq</option>
                           <option value="openrouter">OpenRouter</option>
                        </select>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                           Kalit
                        </label>
                        <div className="flex gap-2">
                           <input
                              type="password"
                              value={aiKeyInput}
                              onChange={e => setAiKeyInput(e.target.value)}
                              placeholder={aiInfo?.hasKey ? 'Yangi kalit kiriting (almashtirish uchun)' : 'API kalitini shu yerga qo\'ying'}
                              className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200
                                         dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100"
                           />
                           <Button onClick={handleSaveAiKey} disabled={aiSaving || aiKeyInput.trim().length < 10}>
                              {aiSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                              Tekshirish va saqlash
                           </Button>
                        </div>

                        {/* Saqlashdan oldin server kalitni haqiqiy so'rov bilan
                            tekshiradi — shuning uchun bu yerdagi xabar aniq sabab
                            bo'ladi, "keyinroq bilib olasiz" emas. */}
                        {aiMsg && (
                           <div className={`flex items-start gap-2 mt-3 text-sm ${aiMsg.kind === 'ok'
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-red-600 dark:text-red-400'}`}>
                              {aiMsg.kind === 'ok'
                                 ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                 : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                              <span>{aiMsg.text}</span>
                           </div>
                        )}

                        {aiInfo?.hasKey && (
                           <div className="mt-4">
                              <Button variant="danger" onClick={handleRemoveAiKey} disabled={aiSaving}>
                                 <Trash2 className="w-4 h-4 mr-2" />
                                 Kalitni o'chirish
                              </Button>
                           </div>
                        )}
                     </Card>

                     <Card className="p-6">
                        <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                           Bepul kalitni qanday olish
                        </h4>
                        <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
                           <li>
                              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                                 className="text-primary-600 dark:text-primary-400 hover:underline">
                                 aistudio.google.com/apikey
                              </a> manzilini oching va Google hisobingiz bilan kiring.
                           </li>
                           <li>"Create API key" tugmasini bosing.</li>
                           <li>Chiqqan kalitni nusxalab, yuqoridagi maydonga qo'ying.</li>
                           <li>"Tekshirish va saqlash" — kalit darhol sinab ko'riladi.</li>
                        </ol>
                        <p className="text-xs text-gray-400 mt-4">
                           Kalit faqat serverda saqlanadi va hech qachon qaytarib berilmaydi.
                           Uni o'chirsangiz, klinika yana umumiy kalitga qaytadi.
                        </p>
                     </Card>
                  </div>
                     )}

                     {integrationTab === 'leadApi' && isAdmin && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <Link2 className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">Lid integratsiyasi</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                           yuboraman.uz va shunga o'xshash manbalar lidlarni to'g'ridan-to'g'ri CRM'ga yuborishi uchun
                           quyidagi manzil va kalitni ularga bering. Lid tushishi bilan «Lidlar» bo'limida paydo bo'ladi
                           va Telegram bot orqali xabar keladi.
                        </p>

                        {/* Endpoint */}
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">So'rov manzili (endpoint)</label>
                        <div className="flex gap-2 mb-5">
                           <code className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 break-all">
                              POST {leadApiInfo?.endpoint || '—'}
                           </code>
                           <Button
                              variant="secondary"
                              onClick={() => leadApiInfo?.endpoint && copyLeadValue(leadApiInfo.endpoint, 'endpoint')}
                              disabled={!leadApiInfo?.endpoint}
                           >
                              {leadCopied === 'endpoint' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                           </Button>
                        </div>

                        {/* API kalit */}
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API kalit (X-API-Key)</label>
                        {leadApiInfo?.apiKey ? (
                           <>
                              <div className="flex gap-2">
                                 <code className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 break-all">
                                    {leadKeyVisible
                                       ? leadApiInfo.apiKey
                                       : `${leadApiInfo.apiKey.slice(0, 8)}${'•'.repeat(24)}${leadApiInfo.apiKey.slice(-4)}`}
                                 </code>
                                 <Button variant="secondary" onClick={() => setLeadKeyVisible(v => !v)}>
                                    {leadKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                 </Button>
                                 <Button variant="secondary" onClick={() => copyLeadValue(leadApiInfo.apiKey as string, 'key')}>
                                    {leadCopied === 'key' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                 </Button>
                              </div>
                              {leadApiInfo.createdAt && (
                                 <p className="text-xs text-gray-400 mt-2">
                                    Yaratilgan: {new Date(leadApiInfo.createdAt).toLocaleString('uz-UZ')}
                                 </p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-4">
                                 <Button variant="secondary" onClick={handleGenerateLeadKey} disabled={leadApiLoading}>
                                    <RefreshCw className={`w-4 h-4 mr-2 ${leadApiLoading ? 'animate-spin' : ''}`} />
                                    Yangi kalit yaratish
                                 </Button>
                                 <Button variant="danger" onClick={handleRevokeLeadKey} disabled={leadApiLoading}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Kalitni o'chirish
                                 </Button>
                              </div>
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                                 ⚠️ Kalitni faqat ishonchli hamkorga bering — u bilan klinikangizga lid yozish mumkin.
                              </p>
                           </>
                        ) : (
                           <div className="p-5 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center">
                              <KeyRound className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                 Kalit hali yaratilmagan.
                              </p>
                              <Button onClick={handleGenerateLeadKey} disabled={leadApiLoading}>
                                 <Plus className="w-4 h-4 mr-2" />
                                 Kalit yaratish
                              </Button>
                           </div>
                        )}
                     </Card>

                     {/* Texnik ma'lumot — odatda kerak emas, shuning uchun yig'ib qo'yilgan.
                         yuboraman.uz'da DentaCRM allaqachon ulangan, kalitni kiritish yetarli.
                         Bu bo'lim klinikaning o'z dasturchisi yoki boshqa xizmat uchun qoldirilgan. */}
                     <Card className="p-6">
                        <button
                           onClick={() => setLeadDocsOpen(v => !v)}
                           className="w-full flex items-center justify-between gap-3 text-left"
                        >
                           <div>
                              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Texnik ma'lumot</h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                 Odatda kerak emas — kalitni kiritish yetarli. Boshqa xizmat ulanmoqchi bo'lsa kerak bo'ladi.
                              </p>
                           </div>
                           <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${leadDocsOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {leadDocsOpen && (<>
                        <pre className="mt-4 p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto leading-relaxed">
{`POST ${leadApiInfo?.endpoint || 'https://<server>/api/public/leads'}
Content-Type: application/json
X-API-Key: ${leadKeyVisible && leadApiInfo?.apiKey ? leadApiInfo.apiKey : '<sizga berilgan kalit>'}

{
  "name": "Ali Valiyev",
  "phone": "+998901234567",
  "service": "Implantatsiya",
  "manzil": "Toshkent, Chilonzor 5",
  "yosh": "34"
}`}
                        </pre>

                        <div className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                           <p><b className="text-gray-900 dark:text-white">phone</b> — yagona majburiy maydon. Qolgani ixtiyoriy.</p>
                           <p>
                              <b className="text-gray-900 dark:text-white">Tanish maydonlar:</b> name/ism/fio, phone/telefon,
                              service/xizmat, source/manba, address/manzil, dob/tug'ilgan sana, notes/izoh.
                           </p>
                           <p>
                              <b className="text-gray-900 dark:text-white">Boshqa har qanday maydon</b> ham qabul qilinadi —
                              u lid kartasida alohida qator bo'lib ko'rinadi. Ya'ni target formasidagi savollar
                              o'zgarsa ham, bizga qayta sozlash kerak emas.
                           </p>
                           <p>
                              Javob: muvaffaqiyatli bo'lsa <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">201</code> va lid <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">id</code> si.
                              15 daqiqa ichida shu raqamdan takroriy lid kelsa, <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">duplicate: true</code> qaytadi va yangi yozuv yaratilmaydi.
                           </p>
                        </div>
                        </>)}
                     </Card>
                  </div>
                     )}
                  </div>
               )}

               {/* Tarif — ilgari "Xizmatlar" ichida, narxnoma ostida turardi */}
               {activeTab === 'plan' && (() => {
                  const plan = plans?.find(p => p.id === currentClinic?.planId);
                  const maxDoctors = plan?.maxDoctors || 10;
                  const usedPercent = Math.min(100, Math.round((doctors.length / maxDoctors) * 100));
                  const price = currentClinic?.customPrice ?? plan?.price ?? 0;
                  const expiry = currentClinic?.expiryDate ? String(currentClinic.expiryDate).slice(0, 10) : '';
                  const expiryTime = expiry ? new Date(expiry).getTime() : NaN;
                  const daysLeft = Number.isNaN(expiryTime) ? null : Math.ceil((expiryTime - Date.now()) / 86400000);
                  const features: string[] = plan && Array.isArray(plan.features) ? plan.features : [];
                  return (
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
                              <CreditCard className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                           </div>
                           <div>
                              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('settings.services.currentPlan')}</h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400">{t('settings.plan.subtitle')}</p>
                           </div>
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800 space-y-5">
                           <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                 <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xl font-bold text-indigo-900 dark:text-indigo-200">{plan?.name || 'Standart Tarif'}</p>
                                    {currentClinic?.subscriptionType === 'Trial' && (
                                       <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                          {t('settings.plan.trial')}
                                       </span>
                                    )}
                                 </div>
                                 {price > 0 && (
                                    <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">
                                       {price.toLocaleString()} UZS {t('settings.plan.perMonth')}
                                    </p>
                                 )}
                              </div>
                              <Button
                                 size="sm"
                                 className="bg-indigo-600 hover:bg-indigo-700 text-white border-none"
                                 onClick={() => setIsUpgradeModalOpen(true)}
                              >
                                 {t('settings.services.upgrade')}
                              </Button>
                           </div>

                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              <div>
                                 <div className="flex justify-between text-sm mb-1.5">
                                    <span className="text-gray-600 dark:text-gray-300">{t('settings.plan.doctors')}</span>
                                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{doctors.length} / {maxDoctors}</span>
                                 </div>
                                 <div className="h-2 rounded-full bg-white dark:bg-gray-800 overflow-hidden">
                                    <div
                                       className={`h-full rounded-full ${usedPercent >= 100 ? 'bg-red-500' : 'bg-indigo-500'}`}
                                       style={{ width: `${usedPercent}%` }}
                                    />
                                 </div>
                              </div>
                              {daysLeft !== null && (
                                 <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1.5">{t('settings.plan.validUntil')}</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                                       {expiry}
                                       <span className={`ml-2 text-xs font-medium ${daysLeft < 0 ? 'text-red-600 dark:text-red-400' : daysLeft <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                          {daysLeft < 0 ? t('settings.plan.expired') : t('settings.plan.daysLeft').replace('{n}', String(daysLeft))}
                                       </span>
                                    </p>
                                 </div>
                              )}
                           </div>

                           {features.length > 0 && (
                              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                 {features.map(feature => (
                                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                       <CheckCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                                       {feature}
                                    </li>
                                 ))}
                              </ul>
                           )}
                        </div>
                     </Card>
                  );
               })()}

            </div>
         </div>

         {/* Add/Edit Service Modal */}
         <Modal isOpen={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} title={editingServiceId !== null ? t('settings.services.edit') : t('settings.services.addModal')}>
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
               {/* Nazorat: shu xizmatdan keyin bemor necha oydan so'ng qayta kelishi kerak.
                   Shifokor qabulni yakunlaganda shu muddat o'zi taklif qilinadi. */}
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.services.thRecall')}</label>
                  <select
                     value={serviceForm.recallMonths}
                     onChange={e => setServiceForm({ ...serviceForm, recallMonths: e.target.value })}
                     className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                     <option value="">{t('settings.services.recallNone')}</option>
                     {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} {t('patients.details.recall.months')}</option>)}
                  </select>
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

         <UpgradePlanModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} />

         {/* Filial qo'shish / tahrirlash */}
         <Modal isOpen={isBranchModalOpen} onClose={() => setIsBranchModalOpen(false)} title={editingBranchId ? t('branches.edit') : t('branches.addTitle')}>
            <form onSubmit={handleBranchSubmit} className="space-y-4">
               <Input
                  label={t('branches.name')}
                  value={branchForm.name}
                  onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder={t('branches.namePlaceholder')}
                  autoFocus
                  required
               />
               <Input
                  label={t('branches.address')}
                  value={branchForm.address}
                  onChange={e => setBranchForm({ ...branchForm, address: e.target.value })}
                  placeholder={t('branches.addressPlaceholder')}
               />
               <Input
                  label={t('branches.phone')}
                  value={branchForm.phone}
                  onChange={e => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder="+998 90 123 45 67"
               />
               {!editingBranchId && (
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 cursor-pointer">
                     <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={branchForm.assignExisting}
                        onChange={e => setBranchForm({ ...branchForm, assignExisting: e.target.checked })}
                     />
                     <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('branches.assignExisting')}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{t('branches.assignExistingHint')}</span>
                     </span>
                  </label>
               )}
               {branchError && (
                  <p className="text-sm text-red-600 flex items-center gap-2">
                     <AlertTriangle className="w-4 h-4" />
                     {branchError}
                  </p>
               )}
               <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setIsBranchModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={branchSaving || !branchForm.name.trim()}>{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Filialni o'chirish */}
         <Modal isOpen={!!deleteConfirmBranch} onClose={() => setDeleteConfirmBranch(null)} title={t('branches.deleteTitle')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">{deleteConfirmBranch?.name}</h3>
               <p className="text-gray-600 dark:text-gray-300 text-sm">{t('branches.deleteConfirm')}</p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmBranch(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={async () => {
                        if (!deleteConfirmBranch) return;
                        try {
                           await onDeleteBranch?.(deleteConfirmBranch.id);
                           setDeleteConfirmBranch(null);
                        } catch (err: any) {
                           setBranchError(err?.message || "O'chirilmadi");
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>
      </div>
   );
};
