
import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Modal, Select, Badge } from '../components/Common';
import { Clinic, SubscriptionPlan } from '../types';
import { Building2, Users, CreditCard, TrendingUp, Plus, Lock, ShieldCheck, Ban, CheckCircle, Calendar, ArrowRight, Save, Clock, Phone, MapPin, Inbox, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

interface SuperAdminDashboardProps {
   clinics: Clinic[];
   plans: SubscriptionPlan[];
   onAddClinic: (clinic: Omit<Clinic, 'id'>) => void;
   onUpdateClinic: (id: string, data: Partial<Clinic>) => void;
   onUpdatePlan: (id: string, data: Partial<SubscriptionPlan>) => void;
   onDeleteClinic: (id: string) => void;
   salesAgentMode?: boolean;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
   clinics, plans, onAddClinic, onUpdateClinic, onUpdatePlan, onDeleteClinic, salesAgentMode = false
}) => {
   const { t } = useLanguage();
   const [activeTab, setActiveTab] = useState<'overview' | 'clinics' | 'plans' | 'blocked' | 'sales' | 'leads'>(salesAgentMode ? 'clinics' : 'overview');

   const handleTabChange = (tab: 'overview' | 'clinics' | 'plans' | 'blocked' | 'sales' | 'leads') => {
      setActiveTab(tab);
      setCurrentPage(1);
      setFilterStatus('All');
      setSearchQuery('');
   };

   // Demo Requests State
   const [demoRequests, setDemoRequests] = useState<any[]>([]);
   const [demoLoading, setDemoLoading] = useState(false);

   useEffect(() => {
      if (activeTab === 'leads') {
         setDemoLoading(true);
         api.demoRequests.getAll()
            .then(setDemoRequests)
            .catch(err => console.error('Demo so\'rovlarni yuklashda xatolik:', err))
            .finally(() => setDemoLoading(false));
      }
   }, [activeTab]);

   const DEMO_STAGES = ['New', 'Contacted', 'Thinking', 'Booked', 'Cancelled'];
   const DEMO_STAGE_LABELS: Record<string, string> = {
      New: 'Yangi', Contacted: 'Bog\'lashildi', Thinking: 'O\'ylamoqda', Booked: 'Oldi', Cancelled: 'Bekor'
   };
   const DEMO_STAGE_COLORS: Record<string, string> = {
      New: 'bg-primary-100 text-primary-700', Contacted: 'bg-amber-100 text-amber-700',
      Thinking: 'bg-purple-100 text-purple-700', Booked: 'bg-emerald-100 text-emerald-700',
      Cancelled: 'bg-red-100 text-red-700'
   };

   // Sales Agents State
   const [salesAgents, setSalesAgents] = useState<any[]>([]);
   const [isAddSalesModalOpen, setIsAddSalesModalOpen] = useState(false);
   const [newSalesForm, setNewSalesForm] = useState({
      name: '',
      username: '',
      password: '',
      phone: ''
   });
   const [createdSalesCreds, setCreatedSalesCreds] = useState<{ username: string, password: string, name: string } | null>(null);
   const [salesError, setSalesError] = useState<string | null>(null);

   const loadSalesAgents = () => {
      api.sales.getAll()
         .then(setSalesAgents)
         .catch(err => console.error('Sotuvchilarni yuklashda xatolik:', err));
   };

   // Sotuvchilar ro'yxati boshida yuklanadi (klinikani biriktirish dropdown'i uchun kerak),
   // 'sales' tabga o'tilganda esa qayta yangilanadi. Sotuvchi rejimida bu ma'lumot kerak emas
   // (va sotuvchining bu endpointga ruxsati yo'q).
   useEffect(() => {
      if (!salesAgentMode) loadSalesAgents();
   }, []);
   useEffect(() => {
      if (!salesAgentMode && activeTab === 'sales') loadSalesAgents();
   }, [activeTab]);

   // Create Clinic State
   const [isAddClinicModalOpen, setIsAddClinicModalOpen] = useState(false);
   const [newClinicForm, setNewClinicForm] = useState({
      name: '',
      adminName: '',
      username: '',
      password: '',
      phone: '',
      planId: plans.length > 0 ? plans[0].id : '',
      useCustomPrice: false,
      customPrice: 0,
      doctorCount: 1,
      subscriptionType: 'Paid' as 'Paid' | 'Trial'
   });

   // Success modal for credentials
   const [createdClinicCreds, setCreatedClinicCreds] = useState<{ username: string, password: string, name: string } | null>(null);

   // Detail/Edit Modal State
   const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
   const [editClinicData, setEditClinicData] = useState<{ status: string; expiryDate: string; planId: string; subscriptionType: 'Paid' | 'Trial'; customPrice: number; useCustomPrice: boolean; salesAgentId: string } | null>(null);

   // Delete Confirmation Modal
   const [deleteConfirmClinic, setDeleteConfirmClinic] = useState<Clinic | null>(null);

   // Password Change Modal
   const [passwordChangeClinic, setPasswordChangeClinic] = useState<Clinic | null>(null);
   const [newPassword, setNewPassword] = useState('');

   // Helper to calculate days remaining
   const getDaysRemaining = (expiry: string) => {
      const today = new Date();
      const exp = new Date(expiry);
      const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff;
   };

   const [searchQuery, setSearchQuery] = useState('');
   const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Blocked' | 'Expiring' | 'Expired' | 'NotExpired'>('All');
   const [currentPage, setCurrentPage] = useState(1);
   const itemsPerPage = 10;

   // Sync edit data when selectedClinic changes
   useEffect(() => {
      if (selectedClinic) {
         setEditClinicData({
            status: selectedClinic.status,
            expiryDate: selectedClinic.expiryDate,
            planId: selectedClinic.planId,
            subscriptionType: selectedClinic.subscriptionType,
            customPrice: selectedClinic.customPrice || 0,
            useCustomPrice: selectedClinic.customPrice !== undefined && selectedClinic.customPrice !== null,
            salesAgentId: selectedClinic.salesAgentId || ''
         });
      } else {
         setEditClinicData(null);
      }
   }, [selectedClinic]);

   const totalRevenue = clinics
      .filter(c => c.status === 'Active') // Only active clinics contribute to revenue
      .reduce((acc, c) => {
         const plan = plans.find(p => p.id === c.planId);
         const price = (c.customPrice !== undefined && c.customPrice !== null) ? c.customPrice : (plan?.price || 0);
         return acc + price;
      }, 0);

   const activeClinics = clinics.filter(c => c.status === 'Active').length;
   const totalClinics = clinics.filter(c => c.status !== 'Blocked').length; // "Total" clinics are now only non-blocked ones
   const blockedCount = clinics.filter(c => c.status === 'Blocked').length;

   // Pre-calculate counts for filters
   const allCount = totalClinics;
   const activeCount = activeClinics;
   const expiringCount = clinics.filter(c => {
      const days = getDaysRemaining(c.expiryDate);
      return days <= 3 && days > 0;
   }).length;
   const expiredCount = clinics.filter(c => getDaysRemaining(c.expiryDate) <= 0).length;
   const notExpiredCount = clinics.filter(c => getDaysRemaining(c.expiryDate) > 0).length;

   // Analytics Calculations
   const expiringSoonCount = expiringCount;

   const newClinicsThisMonth = clinics.filter(c => {
      const start = new Date(c.subscriptionStartDate);
      const now = new Date();
      return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
   }).length;

   // Filter & Pagination Logic
   const filteredClinics = clinics.filter(clinic => {
      const matchesSearch =
         clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
         clinic.adminName.toLowerCase().includes(searchQuery.toLowerCase()) ||
         clinic.phone.includes(searchQuery);

      const daysLeft = getDaysRemaining(clinic.expiryDate);
      const isExpiring = daysLeft <= 3 && daysLeft > 0;
      const isExpired = daysLeft <= 0;
      const isNotExpired = daysLeft > 0;

      // Tab specific filtering
      if (activeTab === 'clinics' && clinic.status === 'Blocked') return false;
      if (activeTab === 'blocked' && clinic.status !== 'Blocked') return false;

      if (filterStatus === 'All') return matchesSearch;
      if (filterStatus === 'Active') return matchesSearch && clinic.status === 'Active';
      if (filterStatus === 'Blocked') return matchesSearch && clinic.status === 'Blocked';
      if (filterStatus === 'Expiring') return matchesSearch && isExpiring;
      if (filterStatus === 'Expired') return matchesSearch && isExpired;
      if (filterStatus === 'NotExpired') return matchesSearch && isNotExpired;

      return matchesSearch;
   });

   const totalPages = Math.ceil(filteredClinics.length / itemsPerPage);
   const paginatedClinics = filteredClinics.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
   );

   const handleAddClinicSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      // Auto generate expiry date
      const date = new Date();

      if (newClinicForm.subscriptionType === 'Trial') {
         date.setDate(date.getDate() + 14);
      } else {
         date.setMonth(date.getMonth() + 1); // Default 1 month for paid
      }

      const expiryDate = date.toISOString().split('T')[0];
      const startDate = new Date().toISOString().split('T')[0];

      onAddClinic({
         name: newClinicForm.name,
         adminName: newClinicForm.adminName,
         username: newClinicForm.username,
         password: newClinicForm.password,
         phone: newClinicForm.phone,
         planId: newClinicForm.planId,
         status: 'Active',
         subscriptionStartDate: startDate,
         expiryDate: expiryDate,
         monthlyRevenue: 0,
         customPrice: newClinicForm.useCustomPrice ? newClinicForm.customPrice : undefined,
         subscriptionType: newClinicForm.subscriptionType
      });

      setCreatedClinicCreds({
         username: newClinicForm.username,
         password: newClinicForm.password,
         name: newClinicForm.name
      });

      setIsAddClinicModalOpen(false);
      setNewClinicForm({ name: '', adminName: '', username: '', password: '', phone: '', planId: plans.length > 0 ? plans[0].id : '', useCustomPrice: false, customPrice: 0, doctorCount: 1, subscriptionType: 'Paid' });
   };

   const generatePassword = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
      let pass = '';
      for (let i = 0; i < 10; i++) {
         pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setNewClinicForm(prev => ({ ...prev, password: pass }));
   };

   const handleAddSalesSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setSalesError(null);
      try {
         const res = await api.sales.create(newSalesForm);
         if (res.success) {
            setCreatedSalesCreds({
               username: newSalesForm.username,
               password: newSalesForm.password,
               name: newSalesForm.name
            });
            setIsAddSalesModalOpen(false);
            setNewSalesForm({ name: '', username: '', password: '', phone: '' });
            // Reload sales agents
            const updatedAgents = await api.sales.getAll();
            setSalesAgents(updatedAgents);
         }
      } catch (err: any) {
         setSalesError(err.message || 'Sotuvchini qo\'shishda xatolik yuz berdi');
      }
   };

   const generateSalesPassword = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let pass = '';
      for (let i = 0; i < 10; i++) {
         pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setNewSalesForm(prev => ({ ...prev, password: pass }));
   };

   // Management Logic
   const handleExtendSubscription = (months: number) => {
      if (!editClinicData) return;

      const currentExpiry = new Date(editClinicData.expiryDate);
      const now = new Date();

      // If expired, start from today, else extend from current expiry
      const baseDate = currentExpiry < now ? now : currentExpiry;

      baseDate.setMonth(baseDate.getMonth() + months);
      setEditClinicData({
         ...editClinicData,
         expiryDate: baseDate.toISOString().split('T')[0]
      });
   };

   const handleSubscriptionTypeChange = (newType: 'Paid' | 'Trial') => {
      if (!selectedClinic || !editClinicData) return;

      const startDate = new Date(selectedClinic.subscriptionStartDate);
      const newExpiryDate = new Date(startDate);

      if (newType === 'Trial') {
         newExpiryDate.setDate(newExpiryDate.getDate() + 14); // 14 days for trial
      } else {
         newExpiryDate.setMonth(newExpiryDate.getMonth() + 1); // 1 month for paid
      }

      setEditClinicData({
         ...editClinicData,
         subscriptionType: newType,
         expiryDate: newExpiryDate.toISOString().split('T')[0]
      });
   };

   const handleSaveChanges = () => {
      if (selectedClinic && editClinicData) {
         onUpdateClinic(selectedClinic.id, {
            status: editClinicData.status as 'Active' | 'Blocked',
            expiryDate: editClinicData.expiryDate,
            planId: editClinicData.planId,
            subscriptionType: editClinicData.subscriptionType,
            customPrice: editClinicData.useCustomPrice ? editClinicData.customPrice : null,
            salesAgentId: editClinicData.salesAgentId || null
         });
         setSelectedClinic(null);
      }
   };



   const getProgressPercentage = (start: string, end: string) => {
      const startDate = new Date(start).getTime();
      const endDate = new Date(end).getTime();
      const today = new Date().getTime();

      const total = endDate - startDate;
      const elapsed = today - startDate;

      let percent = (elapsed / total) * 100;
      if (percent < 0) percent = 0;
      if (percent > 100) percent = 100;
      return percent;
   };

   return (
      <div className="space-y-6 animate-fade-in">
         {/* Header */}
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('superAdmin.title')}</h1>
               <p className="text-sm text-gray-500 dark:text-gray-400">{t('superAdmin.subtitle')}</p>
            </div>
            <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
               {!salesAgentMode && (
                  <button
                     onClick={() => handleTabChange('overview')}
                     className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'overview' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}
                  >
                     {t('superAdmin.tabs.overview')}
                  </button>
               )}
               <button
                  onClick={() => handleTabChange('clinics')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'clinics' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}
               >
                  {t('superAdmin.tabs.clinics')}
               </button>
               {!salesAgentMode && (
                  <>
                     <button
                        onClick={() => handleTabChange('plans')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'plans' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}
                     >
                        {t('superAdmin.tabs.plans')}
                     </button>
                     <button
                        onClick={() => handleTabChange('sales')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'sales' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}
                     >
                        Sotuvchilar
                     </button>
                     <button
                        onClick={() => handleTabChange('blocked')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'blocked' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}`}
                     >
                        {t('superAdmin.tabs.blocked')} ({blockedCount})
                     </button>
                     <button
                        onClick={() => handleTabChange('leads')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'leads' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'text-gray-600 dark:text-gray-400'}`}
                     >
                        <Inbox className="w-3.5 h-3.5" />
                        Lidlar
                     </button>
                  </>
               )}
            </div>
         </div>

         {/* OVERVIEW TAB */}
         {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <Card className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-none">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-indigo-100 font-medium">{t('superAdmin.stats.revenue')}</p>
                        <h3 className="text-3xl font-bold mt-2">{totalRevenue.toLocaleString()} UZS</h3>
                        <p className="text-xs text-indigo-200 mt-2">+12% o'tgan oyga nisbatan</p>
                     </div>
                     <div className="p-3 bg-white/10 rounded-full backdrop-blur-sm">
                        <CreditCard className="w-6 h-6 text-white" />
                     </div>
                  </div>
               </Card>

               <Card className="p-6">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Jami {t('superAdmin.tabs.clinics')}</p>
                        <h3 className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">{totalClinics}</h3>
                        <div className="flex gap-3 mt-3 text-xs">
                           <span className="text-green-600 font-medium flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> {activeClinics} Faol</span>
                           <span className="text-red-500 font-medium flex items-center"><Ban className="w-3 h-3 mr-1" /> {blockedCount} Bloklangan</span>
                        </div>
                     </div>
                     <div className="p-3 bg-primary-50 dark:bg-primary-900/30 rounded-full">
                        <Building2 className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                     </div>
                  </div>
               </Card>

               <Card className="p-6">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Faol {t('superAdmin.tabs.plans')}</p>
                        <div className="mt-3 space-y-2">
                           {plans.map(plan => {
                              const count = clinics.filter(c => c.planId === plan.id && c.status === 'Active').length;
                              return (
                                 <div key={plan.id} className="flex items-center justify-between text-sm w-full gap-8">
                                    <span className="text-gray-700 dark:text-gray-300">{plan.name}</span>
                                    <span className="font-bold text-gray-900 dark:text-white">{count} ta</span>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                     <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-full">
                        <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                     </div>
                  </div>
               </Card>

               {/* New Analytics Cards */}
               <Card className="p-6">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Muddati Tugayotgan</p>
                        <h3 className="text-3xl font-bold mt-2 text-orange-600">{expiringSoonCount}</h3>
                        <p className="text-xs text-gray-500 mt-2">3 kun ichida tugaydiganlar</p>
                     </div>
                     <div className="p-3 bg-orange-50 dark:bg-orange-900/30 rounded-full">
                        <Clock className="w-6 h-6 text-orange-600" />
                     </div>
                  </div>
               </Card>

               <Card className="p-6">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Yangi (Bu oy)</p>
                        <h3 className="text-3xl font-bold mt-2 text-primary-600">{newClinicsThisMonth}</h3>
                        <p className="text-xs text-gray-500 mt-2">O'tgan oyga nisbatan +{newClinicsThisMonth > 0 ? '100%' : '0%'}</p>
                     </div>
                     <div className="p-3 bg-primary-50 dark:bg-primary-900/30 rounded-full">
                        <Users className="w-6 h-6 text-primary-600" />
                     </div>
                  </div>
               </Card>
            </div>
         )}

         {/* CLINICS TAB */}
         {activeTab === 'clinics' && (
            <Card className="p-6">
               <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('superAdmin.tabs.clinics')} Ro'yxati</h3>

                  <div className="flex flex-1 w-full md:w-auto gap-3">
                     <div className="relative flex-1 md:w-64">
                        <Input
                           placeholder={t('superAdmin.clinics.search')}
                           value={searchQuery}
                           onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                           className="w-full"
                        />
                     </div>
                     <select
                        className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
                     >
                        <option value="All">Barchasi ({allCount})</option>
                        <option value="NotExpired">Hali tugamagan ({notExpiredCount})</option>
                        <option value="Active">Faol ({activeCount})</option>
                        <option value="Blocked">Bloklangan ({blockedCount})</option>
                        <option value="Expiring">Tugayotganlar ({expiringCount})</option>
                        <option value="Expired">Muddati tugagan ({expiredCount})</option>
                     </select>
                     <Button onClick={() => setIsAddClinicModalOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> {t('superAdmin.clinics.add')}
                     </Button>
                  </div>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thName')}</th>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thPlan')}</th>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thExpiry')}</th>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thStatus')}</th>
                           {!salesAgentMode && <th className="p-4 font-medium text-gray-500">Sotuvchi</th>}
                           <th className="p-4 font-medium text-gray-500 text-right">{t('superAdmin.clinics.thAction')}</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedClinics.length === 0 ? (
                           <tr>
                              <td colSpan={salesAgentMode ? 5 : 6} className="p-8 text-center text-gray-500">
                                 {t('common.noData')}
                              </td>
                           </tr>
                        ) : (
                           paginatedClinics.map(clinic => {
                              const daysLeft = getDaysRemaining(clinic.expiryDate);
                              const isExpiring = daysLeft <= 3 && daysLeft > 0;
                              const isExpired = daysLeft <= 0;

                              return (
                                 <tr
                                    key={clinic.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedClinic(clinic)}
                                 >
                                    <td className="p-4">
                                       <div className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors">{clinic.name}</div>
                                       <div className="text-xs text-gray-500">{clinic.adminName}</div>
                                    </td>
                                    <td className="p-4">
                                       <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase
                                    ${clinic.planId === 'trial'
                                             ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                                             : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                          }
                                  `}>
                                          {plans.find(p => p.id === clinic.planId)?.name}
                                       </span>
                                       {clinic.subscriptionType === 'Trial' && (
                                          <span className="ml-2 px-2 py-1 rounded-md text-xs font-bold uppercase bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                                             TRIAL
                                          </span>
                                       )}
                                    </td>
                                    <td className="p-4">
                                       <div className="flex items-center gap-2">
                                          <Calendar className="w-3 h-3 text-gray-400" />
                                          <span className="text-gray-700 dark:text-gray-300 text-xs">
                                             {clinic.subscriptionStartDate} <ArrowRight className="inline w-3 h-3 mx-1" /> {clinic.expiryDate}
                                          </span>
                                       </div>
                                       <div className={`text-xs mt-1 font-medium ${isExpired ? 'text-red-500' : isExpiring ? 'text-orange-500' : 'text-green-500'}`}>
                                          {isExpired ? 'Muddati tugagan' : `${daysLeft} kun qoldi`}
                                       </div>
                                    </td>
                                    <td className="p-4">
                                       <Badge status={clinic.status === 'Active' ? 'active' : 'blocked'} />
                                    </td>
                                    {!salesAgentMode && (
                                       <td className="p-4">
                                          {(() => {
                                             const agent = salesAgents.find((a: any) => a.id === clinic.salesAgentId);
                                             return agent ? (
                                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                                   {agent.name}
                                                </span>
                                             ) : <span className="text-xs text-gray-400">—</span>;
                                          })()}
                                       </td>
                                    )}
                                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                       <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => setSelectedClinic(clinic)}
                                       >
                                          {t('superAdmin.clinics.manage')}
                                       </Button>
                                    </td>
                                 </tr>
                              );
                           }))}
                     </tbody>
                  </table>
               </div>

               {/* Pagination Controls */}
               {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                     <div className="text-sm text-gray-500">
                        Jami: {filteredClinics.length} ta klinika (Sahifa {currentPage} / {totalPages})
                     </div>
                     <div className="flex gap-2">
                        <Button
                           variant="secondary"
                           size="sm"
                           onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                           disabled={currentPage === 1}
                        >
                           Ortga
                        </Button>
                        <Button
                           variant="secondary"
                           size="sm"
                           onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                           disabled={currentPage === totalPages}
                        >
                           Oldinga
                        </Button>
                     </div>
                  </div>
               )}
            </Card>
         )}

         {/* BLOCKED/TRASH TAB */}
         {activeTab === 'blocked' && (
            <Card className="p-6">
               <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                  <div>
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Bloklangan {t('superAdmin.tabs.clinics')} (Savat)</h3>
                     <p className="text-sm text-gray-500">Ushbu klinikalar bloklangan va tushum hisobiga kirmaydi.</p>
                  </div>

                  <div className="flex flex-1 w-full md:w-auto gap-3">
                     <div className="relative flex-1 md:w-64">
                        <Input
                           placeholder={t('superAdmin.clinics.search')}
                           value={searchQuery}
                           onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                           className="w-full"
                        />
                     </div>
                  </div>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thName')}</th>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thPlan')}</th>
                           <th className="p-4 font-medium text-gray-500">Sana</th>
                           <th className="p-4 font-medium text-gray-500">{t('superAdmin.clinics.thStatus')}</th>
                           <th className="p-4 font-medium text-gray-500 text-right">{t('superAdmin.clinics.thAction')}</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedClinics.length === 0 ? (
                           <tr>
                              <td colSpan={5} className="p-8 text-center text-gray-500">
                                 Bloklangan klinikalar yo'q
                              </td>
                           </tr>
                        ) : (
                           paginatedClinics.map(clinic => (
                              <tr key={clinic.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                 <td className="p-4">
                                    <div className="font-medium text-gray-900 dark:text-white">{clinic.name}</div>
                                    <div className="text-xs text-gray-500">{clinic.phone}</div>
                                 </td>
                                 <td className="p-4">
                                    <span className="px-2 py-1 rounded-md text-xs font-bold uppercase bg-gray-100 text-gray-600">
                                       {plans.find(p => p.id === clinic.planId)?.name}
                                    </span>
                                 </td>
                                 <td className="p-4 text-xs text-gray-500">
                                    {clinic.expiryDate} (tugagan)
                                 </td>
                                 <td className="p-4">
                                    <Badge status="blocked" />
                                 </td>
                                 <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                          <Button
                                             size="sm"
                                             variant="secondary"
                                             onClick={() => onUpdateClinic(clinic.id, { status: 'Active' })}
                                          >
                                             {t('superAdmin.clinics.activate')}
                                          </Button>
                                    </div>
                                 </td>
                              </tr>
                           ))
                        )}
                     </tbody>
                  </table>
               </div>

               {/* Pagination Controls for Blocked Tab */}
               {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                     <div className="text-sm text-gray-500">
                        Jami: {filteredClinics.length} ta (Sahifa {currentPage} / {totalPages})
                     </div>
                     <div className="flex gap-2">
                        <Button
                           variant="secondary"
                           size="sm"
                           onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                           disabled={currentPage === 1}
                        >
                           Ortga
                        </Button>
                        <Button
                           variant="secondary"
                           size="sm"
                           onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                           disabled={currentPage === totalPages}
                        >
                           Oldinga
                        </Button>
                     </div>
                  </div>
               )}
            </Card>
         )}

         {/* PLANS TAB */}
         {activeTab === 'plans' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {plans.map(plan => {
                  const isStart = plan.id === 'basic'; // 'basic' is START
                  const isPro = plan.id === 'pro';
                  const isBusiness = plan.id === 'business';

                  return (
                     <Card key={plan.id} className="p-6 relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                           <ShieldCheck className="w-24 h-24" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
                        <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 mb-6">
                           {plan.price.toLocaleString()} <span className="text-sm text-gray-500 font-normal">UZS/oy</span>
                        </div>

                        <div className="space-y-3 flex-1">
                           <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                              <Users className="w-4 h-4 text-primary-500" />
                              <span>{plan.maxDoctors} {t('superAdmin.plans.maxDoctors')}</span>
                           </div>
                           {plan.features.map((feat, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                 <CheckCircle className="w-4 h-4 text-green-500" />
                                 <span>{feat}</span>
                              </div>
                           ))}

                           {/* Discount Details for START and PRO */}
                           {(isStart || isPro) && (
                              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                                 <div className="flex justify-between">
                                    <span className="text-gray-500">3 oy (-10%)</span>
                                    <span className="font-medium">{(plan.price * 0.9).toLocaleString()} / oy</span>
                                 </div>
                                 <div className="flex justify-between">
                                    <span className="text-gray-500">6 oy (-15%)</span>
                                    <span className="font-medium">{(plan.price * 0.85).toLocaleString()} / oy</span>
                                 </div>
                                 <div className="flex justify-between">
                                    <span className="text-gray-500">12 oy (-25%)</span>
                                    <span className="font-medium">{(plan.price * 0.75).toLocaleString()} / oy</span>
                                 </div>
                              </div>
                           )}

                           {/* Business Plan Note */}
                           {isBusiness && (
                              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                                 <p>10 tadan ortiq shifokor — har bir qo‘shimcha shifokor uchun <strong>50 000 so‘m / oy</strong></p>
                              </div>
                           )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                           <Button variant="secondary" className="w-full" onClick={() => alert('Tarifni tahrirlash hozircha mavjud emas')}>{t('common.edit')}</Button>
                        </div>
                     </Card>
                  );
               })}
            </div>
         )}

         {/* SALES AGENT TAB */}
         {activeTab === 'sales' && (
            <Card className="p-6">
               <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                  <div>
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sotuvchilar (Resellers)</h3>
                     <p className="text-sm text-gray-500">Tizimni klinikalar uchun targ'ib qiluvchi sotuvchilarni boshqarish bo'limi</p>
                  </div>
                  <Button onClick={() => {
                     setSalesError(null);
                     setIsAddSalesModalOpen(true);
                  }}>
                     <Plus className="w-4 h-4 mr-2" /> Yangi Sotuvchi Qo'shish
                  </Button>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                           <th className="p-4 font-medium text-gray-500">Sotuvchi</th>
                           <th className="p-4 font-medium text-gray-500">Login (Username)</th>
                           <th className="p-4 font-medium text-gray-500">Telefon</th>
                           <th className="p-4 font-medium text-gray-500 text-center">Biriktirilgan Klinikalar</th>
                           <th className="p-4 font-medium text-gray-500">Yaratilgan Sana</th>
                           <th className="p-4 font-medium text-gray-500">Holat</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {salesAgents.length === 0 ? (
                           <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-500">
                                 Sotuvchilar mavjud emas
                              </td>
                           </tr>
                        ) : (
                           salesAgents.map(agent => (
                              <tr key={agent.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                 <td className="p-4 font-medium text-gray-900 dark:text-white">
                                    {agent.name}
                                 </td>
                                 <td className="p-4 font-mono text-primary-600 dark:text-primary-400">
                                    {agent.username}
                                 </td>
                                 <td className="p-4">
                                    {agent.phone}
                                 </td>
                                 <td className="p-4 text-center font-bold text-indigo-600 dark:text-indigo-400">
                                    {agent.clinicCount || 0} ta
                                 </td>
                                 <td className="p-4 text-xs text-gray-500">
                                    {new Date(agent.createdAt).toLocaleDateString('uz-UZ')}
                                 </td>
                                 <td className="p-4">
                                    <Badge status={agent.status === 'Active' ? 'active' : 'blocked'} />
                                 </td>
                              </tr>
                           ))
                        )}
                     </tbody>
                  </table>
               </div>
            </Card>
         )}

         {/* LEADS (DEMO REQUESTS) TAB */}
         {activeTab === 'leads' && (
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <div>
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Inbox className="w-5 h-5 text-emerald-500" /> Demo So'rovlari (Lidlar)
                     </h3>
                     <p className="text-sm text-gray-500">Landing page orqali kelgan demo so'rovlar</p>
                  </div>
                  <button
                     onClick={() => { setDemoLoading(true); api.demoRequests.getAll().then(setDemoRequests).finally(() => setDemoLoading(false)); }}
                     className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                     Yangilash
                  </button>
               </div>
               {demoLoading ? (
                  <Card className="p-10 text-center text-gray-400">Yuklanmoqda...</Card>
               ) : demoRequests.length === 0 ? (
                  <Card className="p-10 text-center">
                     <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                     <p className="text-gray-500">Hali so'rovlar yo'q</p>
                     <p className="text-xs text-gray-400 mt-1">Landing sahifadan demo so'rov yuborilganda bu yerda ko'rinadi</p>
                  </Card>
               ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                     {demoRequests.map((req: any) => (
                        <Card key={req.id} className="p-5 hover:shadow-md transition-shadow">
                           <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                                    {req.name ? req.name[0].toUpperCase() : '?'}
                                 </div>
                                 <div>
                                    <p className="font-bold text-gray-900 dark:text-white text-sm">{req.name}</p>
                                    <p className="text-xs text-gray-400">{new Date(req.createdAt).toLocaleDateString('uz-UZ', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
                                 </div>
                              </div>
                              <button
                                 onClick={() => { if (window.confirm('O\'chirishni tasdiqlaysizmi?')) { api.demoRequests.remove(req.id).then(() => setDemoRequests(prev => prev.filter(r => r.id !== req.id))); } }}
                                 className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              >
                                 <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                           <div className="space-y-1.5 mb-3">
                              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                 <Phone className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                                 <a href={`tel:${req.phone}`} className="hover:text-primary-600 font-medium">{req.phone}</a>
                              </div>
                              {req.clinicName && (
                                 <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <Building2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                    <span>{req.clinicName}</span>
                                 </div>
                              )}
                              {req.city && (
                                 <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <MapPin className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                                    <span>{req.city}{req.doctorsCount ? ` · ${req.doctorsCount} ta shifokor` : ''}</span>
                                 </div>
                              )}
                           </div>
                           <div className="flex items-center justify-between">
                              <select
                                 value={req.status}
                                 onChange={e => {
                                    const newStatus = e.target.value;
                                    api.demoRequests.update(req.id, { status: newStatus });
                                    setDemoRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: newStatus } : r));
                                 }}
                                 className={`text-xs font-bold px-2.5 py-1 rounded-full border-0 cursor-pointer ${DEMO_STAGE_COLORS[req.status] || 'bg-gray-100 text-gray-700'}`}
                              >
                                 {DEMO_STAGES.map(s => (
                                    <option key={s} value={s}>{DEMO_STAGE_LABELS[s]}</option>
                                 ))}
                              </select>
                              <a
                                 href={`tel:${req.phone}`}
                                 className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                 <Phone className="w-3 h-3" /> Qo'ng'iroq
                              </a>
                           </div>
                        </Card>
                     ))}
                  </div>
               )}
            </div>
         )}

         {/* Add Clinic Modal */}
         <Modal isOpen={isAddClinicModalOpen} onClose={() => setIsAddClinicModalOpen(false)} title={t('superAdmin.modals.addClinic')}>
            <form onSubmit={handleAddClinicSubmit} className="space-y-4">
               <Input label={t('superAdmin.clinics.thName')} value={newClinicForm.name} onChange={e => setNewClinicForm({ ...newClinicForm, name: e.target.value })} required />
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('superAdmin.forms.adminName')} value={newClinicForm.adminName} onChange={e => setNewClinicForm({ ...newClinicForm, adminName: e.target.value })} required />
                  <Input label={t('common.phone')} value={newClinicForm.phone} onChange={e => setNewClinicForm({ ...newClinicForm, phone: e.target.value })} required />
               </div>

               <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2"><Lock className="w-4 h-4" /> Kirish Ma'lumotlari</h4>
                  <Input label={t('superAdmin.forms.login')} value={newClinicForm.username} onChange={e => setNewClinicForm({ ...newClinicForm, username: e.target.value })} required />
                  <div className="flex items-end gap-2">
                     <Input label="Parol" type="text" value={newClinicForm.password} onChange={e => setNewClinicForm({ ...newClinicForm, password: e.target.value })} required className="flex-1" />
                     <Button type="button" variant="secondary" onClick={generatePassword} className="mb-[1px]">{t('superAdmin.forms.generate')}</Button>
                  </div>
               </div>

               <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800 space-y-4">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
                     <CreditCard className="w-4 h-4" /> Tarif va Narx
                  </h4>

                  <div className="flex gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                           type="radio"
                           name="subscriptionType"
                           checked={newClinicForm.subscriptionType === 'Paid'}
                           onChange={() => setNewClinicForm({ ...newClinicForm, subscriptionType: 'Paid' })}
                           className="text-primary-600"
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{t('superAdmin.forms.paid')}</span>
                     </label>
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                           type="radio"
                           name="subscriptionType"
                           checked={newClinicForm.subscriptionType === 'Trial'}
                           onChange={() => setNewClinicForm({ ...newClinicForm, subscriptionType: 'Trial' })}
                           className="text-primary-600"
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{t('superAdmin.forms.trial')}</span>
                     </label>
                  </div>

                  <Select
                     label={t('superAdmin.tabs.plans')} Rejasi
                     options={plans.map(p => ({ value: p.id, label: `${p.name} - ${p.price.toLocaleString()} UZS` }))}
                     value={newClinicForm.planId}
                     onChange={e => {
                        const planId = e.target.value;
                        setNewClinicForm({
                           ...newClinicForm,
                           planId,
                           // Reset custom price if switching away from business, or set logic
                           useCustomPrice: planId === 'business',
                           customPrice: planId === 'business' ? 590000 : 0
                        });
                     }}
                  />

                  {newClinicForm.planId === 'business' && (
                     <div className="animate-fade-in">
                        <Input
                           label={t('superAdmin.forms.doctorCount')}
                           type="number"
                           value={newClinicForm.doctorCount}
                           onChange={e => {
                              const count = parseInt(e.target.value) || 1;
                              const basePrice = 590000;
                              const extraPrice = 50000;
                              const included = 10;
                              const price = count <= included ? basePrice : basePrice + (count - included) * extraPrice;

                              setNewClinicForm({
                                 ...newClinicForm,
                                 doctorCount: count,
                                 customPrice: price
                              });
                           }}
                           min={1}
                        />
                     </div>
                  )}

                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                     <input
                        type="checkbox"
                        id="useCustomPrice"
                        checked={newClinicForm.useCustomPrice}
                        onChange={(e) => setNewClinicForm({ ...newClinicForm, useCustomPrice: e.target.checked })}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer"
                     />
                     <label htmlFor="useCustomPrice" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex-1">
                        {t('superAdmin.forms.customPrice')}
                     </label>
                  </div>

                  {newClinicForm.useCustomPrice && (
                     <div className="animate-fade-in">
                        <Input
                           label={t('superAdmin.forms.customPriceLabel')}
                           type="number"
                           value={newClinicForm.customPrice}
                           onChange={e => setNewClinicForm({ ...newClinicForm, customPrice: parseInt(e.target.value) || 0 })}
                           required
                           placeholder="Masalan: 800000"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                           {t('superAdmin.forms.customPriceHint')}
                        </p>
                     </div>
                  )}
               </div>

               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsAddClinicModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('superAdmin.forms.create')}</Button>
               </div>
            </form>
         </Modal>

         {/* Clinic Management Modal */}
         {selectedClinic && editClinicData && (
            <Modal isOpen={!!selectedClinic} onClose={() => setSelectedClinic(null)} title={t('superAdmin.modals.manageSubscription')}>
               <div className="space-y-6">
                  <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-4">
                     <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedClinic.name}</h3>
                        <p className="text-gray-500 text-sm">@{selectedClinic.username}</p>
                        <p className="text-gray-500 text-sm">{selectedClinic.phone}</p>
                     </div>
                     <div className="text-right">
                        <div className="text-xs text-gray-500">Joriy Holat</div>
                        <div className="flex gap-2 justify-end">
                           <Badge status={editClinicData.status === 'Active' ? 'active' : 'blocked'} />
                           {editClinicData.subscriptionType === 'Trial' && (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-primary-100 text-primary-800">TRIAL</span>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Subscription Management Section */}
                  <div className="space-y-4">
                     <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Muddatni Uzaytirish
                     </h4>

                     <div className="grid grid-cols-3 gap-3">
                        <button
                           onClick={() => handleExtendSubscription(1)}
                           className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:border-primary-200 transition-all"
                        >
                           <span className="font-bold text-lg text-primary-600">+1 Oy</span>
                           <span className="text-xs text-gray-500">Uzaytirish</span>
                        </button>
                        <button
                           onClick={() => handleExtendSubscription(3)}
                           className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:border-primary-200 transition-all"
                        >
                           <span className="font-bold text-lg text-primary-600">+3 Oy</span>
                           <span className="text-xs text-gray-500">Uzaytirish</span>
                        </button>
                        <button
                           onClick={() => handleExtendSubscription(12)}
                           className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:border-primary-200 transition-all"
                        >
                           <span className="font-bold text-lg text-primary-600">+1 Yil</span>
                           <span className="text-xs text-gray-500">Uzaytirish</span>
                        </button>
                     </div>

                     <div className="grid grid-cols-2 gap-4 pt-2">
                        <Input
                           label="Tugash Sanasi"
                           type="date"
                           value={editClinicData.expiryDate}
                           onChange={(e) => setEditClinicData({ ...editClinicData, expiryDate: e.target.value })}
                        />
                        <Select
                           label={t('superAdmin.tabs.plans')} Rejasi
                           value={editClinicData.planId}
                           onChange={(e) => setEditClinicData({ ...editClinicData, planId: e.target.value })}
                           options={plans.map(p => ({ value: p.id, label: p.name }))}
                        />
                     </div>

                     <div className="pt-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Obuna Turi</label>
                        <div className="flex gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                 type="radio"
                                 name="editSubscriptionType"
                                 checked={editClinicData.subscriptionType === 'Paid'}
                                 onChange={() => handleSubscriptionTypeChange('Paid')}
                                 className="text-primary-600"
                              />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{t('superAdmin.forms.paid')}</span>
                           </label>
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                 type="radio"
                                 name="editSubscriptionType"
                                 checked={editClinicData.subscriptionType === 'Trial'}
                                 onChange={() => handleSubscriptionTypeChange('Trial')}
                                 className="text-primary-600"
                              />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">Sinov Davri (Trial)</span>
                           </label>
                        </div>
                     </div>
                  </div>

                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800 space-y-4">
                     <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <CreditCard className="w-4 h-4" /> Tarif va Narx
                     </h4>

                     <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <input
                           type="checkbox"
                           id="editUseCustomPrice"
                           checked={editClinicData.useCustomPrice}
                           onChange={(e) => setEditClinicData({ ...editClinicData, useCustomPrice: e.target.checked })}
                           className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer"
                        />
                        <label htmlFor="editUseCustomPrice" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex-1">
                           Maxsus narx belgilash
                        </label>
                     </div>

                     {editClinicData.useCustomPrice && (
                        <div className="animate-fade-in">
                           <Input
                              label="Maxsus oylik to'lov summasi"
                              type="number"
                              value={editClinicData.customPrice}
                              onChange={e => setEditClinicData({ ...editClinicData, customPrice: parseInt(e.target.value) || 0 })}
                              required
                              placeholder="Masalan: 800000"
                           />
                           <p className="text-xs text-gray-500 mt-1">
                              Ushbu klinika uchun tarif narxi o'rniga shu summa hisoblanadi.
                           </p>
                        </div>
                     )}
                  </div>

                  {/* Access Control Section */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
                     <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> Kirish Huquqi
                     </h4>
                     <Select
                        label="Klinika Statusi"
                        value={editClinicData.status}
                        onChange={(e) => setEditClinicData({ ...editClinicData, status: e.target.value })}
                        options={[
                           { value: 'Active', label: 'Faol (Ruxsat berilgan)' },
                           { value: 'Blocked', label: 'Bloklangan (Taqiqlangan)' }
                        ]}
                     />
                     {!salesAgentMode && (
                        <>
                           <Select
                              label="Sotuvchiga biriktirish"
                              value={editClinicData.salesAgentId}
                              onChange={(e) => setEditClinicData({ ...editClinicData, salesAgentId: e.target.value })}
                              options={[
                                 { value: '', label: 'Biriktirilmagan' },
                                 ...salesAgents.map((a: any) => ({ value: a.id, label: `${a.name} (@${a.username})` }))
                              ]}
                           />
                           <p className="text-xs text-gray-500">
                              Biriktirilgan sotuvchi ushbu klinikani o'z panelida ko'radi va obunasini boshqara oladi.
                           </p>
                        </>
                     )}
                  </div>

                  {/* Stats Preview */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 rounded-lg flex justify-between items-center text-sm">
                     <span className="text-gray-500">Joriy hisoblangan muddat:</span>
                     <span className={`font-bold ${getDaysRemaining(editClinicData.expiryDate) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {editClinicData.expiryDate} ({getDaysRemaining(editClinicData.expiryDate)} kun)
                     </span>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between gap-3">
                     <Button
                        variant="secondary"
                        className="bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200"
                        onClick={() => {
                           setDeleteConfirmClinic(selectedClinic);
                           setSelectedClinic(null);
                        }}
                     >
                        {t('superAdmin.actions.blockAndTrash')}
                     </Button>
                     <div className="flex gap-3">
                        <Button
                           variant="secondary"
                           onClick={() => {
                              setPasswordChangeClinic(selectedClinic);
                              setSelectedClinic(null);
                           }}
                        >
                           <Lock className="w-4 h-4 mr-2" /> {t('superAdmin.modals.changePassword')}
                        </Button>
                        <Button variant="secondary" onClick={() => setSelectedClinic(null)}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={handleSaveChanges}>
                           <Save className="w-4 h-4 mr-2" /> {t('superAdmin.actions.saveChanges')}
                        </Button>
                     </div>
                  </div>
               </div>
            </Modal>
         )
         }

         {/* Credentials Success Modal */}
         <Modal isOpen={!!createdClinicCreds} onClose={() => setCreatedClinicCreds(null)} title={t('superAdmin.modals.successTitle')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
               </div>
               <p className="text-gray-600 dark:text-gray-300">
                  {t('superAdmin.modals.successDesc')}
               </p>
               <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-left space-y-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between">
                     <span className="text-gray-500 text-sm">{t('superAdmin.creds.clinic')}</span>
                     <span className="font-bold text-gray-900 dark:text-white">{createdClinicCreds?.name}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-gray-500 text-sm">{t('superAdmin.creds.login')}</span>
                     <span className="font-mono font-bold text-primary-600">{createdClinicCreds?.username}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-gray-500 text-sm">{t('superAdmin.creds.password')}</span>
                     <span className="font-mono font-bold text-red-600">{createdClinicCreds?.password}</span>
                  </div>
               </div>
               <div className="pt-2">
                  <Button onClick={() => setCreatedClinicCreds(null)} className="w-full">{t('superAdmin.actions.close')}</Button>
               </div>
            </div>
         </Modal>

         {/* Delete (Block) Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmClinic} onClose={() => setDeleteConfirmClinic(null)} title={t('superAdmin.modals.blockClinic')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <Ban className="w-6 h-6 text-orange-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('common.confirm')}</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  <strong>{deleteConfirmClinic?.name}</strong> {t('superAdmin.modals.blockConfirm')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmClinic(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-orange-600 hover:bg-orange-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmClinic) {
                           onDeleteClinic(deleteConfirmClinic.id);
                           setDeleteConfirmClinic(null);
                        }
                     }}
                  >
                     {t('superAdmin.actions.yesBlock')}
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Password Change Modal */}
         <Modal isOpen={!!passwordChangeClinic} onClose={() => { setPasswordChangeClinic(null); setNewPassword(''); }} title={t('superAdmin.modals.changePassword')}>
            <div className="space-y-4">
               <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-200 dark:border-primary-800">
                  <p className="text-sm text-primary-800 dark:text-primary-200">
                     <strong>{passwordChangeClinic?.name}</strong> {t('superAdmin.modals.passwordDesc')}
                  </p>
               </div>
               <div className="flex items-end gap-2">
                  <Input
                     label={t('superAdmin.forms.newPassword')}
                     type="text"
                     value={newPassword}
                     onChange={(e) => setNewPassword(e.target.value)}
                     required
                     className="flex-1"
                  />
                  <Button
                     type="button"
                     variant="secondary"
                     onClick={() => {
                        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
                        let pass = '';
                        for (let i = 0; i < 10; i++) {
                           pass += chars.charAt(Math.floor(Math.random() * chars.length));
                        }
                        setNewPassword(pass);
                     }}
                     className="mb-[1px]"
                  >
                     {t('superAdmin.forms.generate')}
                  </Button>
               </div>
               <div className="flex justify-end gap-3 pt-4">
                  <Button variant="secondary" onClick={() => { setPasswordChangeClinic(null); setNewPassword(''); }}>{t('common.cancel')}</Button>
                  <Button
                     onClick={() => {
                        if (passwordChangeClinic && newPassword) {
                           onUpdateClinic(passwordChangeClinic.id, { password: newPassword });
                           setPasswordChangeClinic(null);
                           setNewPassword('');
                        }
                     }}
                     disabled={!newPassword}
                  >
                     Parolni Saqlash
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Add Sales Agent Modal */}
         <Modal isOpen={isAddSalesModalOpen} onClose={() => setIsAddSalesModalOpen(false)} title="Yangi Sotuvchi (Reseller) Qo'shish">
            <form onSubmit={handleAddSalesSubmit} className="space-y-4">
               {salesError && (
                  <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-sm rounded-lg">
                     {salesError}
                  </div>
               )}
               <Input
                  label="F.I.SH."
                  value={newSalesForm.name}
                  onChange={e => setNewSalesForm({ ...newSalesForm, name: e.target.value })}
                  required
               />
               <div className="grid grid-cols-2 gap-4">
                  <Input
                     label="Telefon raqami"
                     value={newSalesForm.phone}
                     onChange={e => setNewSalesForm({ ...newSalesForm, phone: e.target.value })}
                     required
                  />
                  <Input
                     label="Login (Username)"
                     value={newSalesForm.username}
                     onChange={e => setNewSalesForm({ ...newSalesForm, username: e.target.value })}
                     required
                  />
               </div>
               
               <div className="flex items-end gap-2">
                  <Input
                     label="Parol"
                     type="text"
                     value={newSalesForm.password}
                     onChange={e => setNewSalesForm({ ...newSalesForm, password: e.target.value })}
                     required
                     className="flex-1"
                  />
                  <Button type="button" variant="secondary" onClick={generateSalesPassword} className="mb-[1px]">
                     Generatsiya qilish
                  </Button>
               </div>

               <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <Button type="button" variant="secondary" onClick={() => setIsAddSalesModalOpen(false)}>
                     Bekor qilish
                  </Button>
                  <Button type="submit">
                     Saqlash
                  </Button>
               </div>
            </form>
         </Modal>

         {/* Sales Agent Created Credentials Modal */}
         <Modal isOpen={!!createdSalesCreds} onClose={() => setCreatedSalesCreds(null)} title="Sotuvchi Muvaffaqiyatli Yaratildi">
            <div className="space-y-4 text-center">
               <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-green-600" />
               </div>
               <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center justify-center gap-1">Kirish Ma'lumotlari</h3>
                  <p className="text-sm text-gray-500">Sotuvchi {createdSalesCreds?.name} uchun tizimga kirish ma'lumotlari:</p>
               </div>
               <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-left space-y-2 border border-gray-200 dark:border-gray-700">
                  <div>
                     <span className="text-xs text-gray-400">Login:</span>
                     <span className="block font-mono font-bold text-gray-800 dark:text-gray-200">{createdSalesCreds?.username}</span>
                  </div>
                  <div>
                     <span className="text-xs text-gray-400">Parol:</span>
                     <span className="block font-mono font-bold text-red-600">{createdSalesCreds?.password}</span>
                  </div>
               </div>
               <div className="pt-2">
                  <Button onClick={() => setCreatedSalesCreds(null)} className="w-full">Yopish</Button>
               </div>
            </div>
         </Modal>
      </div >
   );
};
