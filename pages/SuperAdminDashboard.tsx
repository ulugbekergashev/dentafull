
import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Modal, Select, Badge } from '../components/Common';
import { Clinic, SubscriptionPlan } from '../types';
import { Building2, Users, CreditCard, TrendingUp, Plus, Lock, ShieldCheck, Ban, CheckCircle, Calendar, ArrowRight, Save, Clock } from 'lucide-react';

interface SuperAdminDashboardProps {
   clinics: Clinic[];
   plans: SubscriptionPlan[];
   onAddClinic: (clinic: Omit<Clinic, 'id'>) => void;
   onUpdateClinic: (id: string, data: Partial<Clinic>) => void;
   onUpdatePlan: (id: string, data: Partial<SubscriptionPlan>) => void;
   onDeleteClinic: (id: string) => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
   clinics, plans, onAddClinic, onUpdateClinic, onUpdatePlan, onDeleteClinic
}) => {
   const [activeTab, setActiveTab] = useState<'overview' | 'clinics' | 'plans'>('overview');

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
      customPrice: 0
   });

   // Success modal for credentials
   const [createdClinicCreds, setCreatedClinicCreds] = useState<{ username: string, password: string, name: string } | null>(null);

   // Detail/Edit Modal State
   const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
   const [editClinicData, setEditClinicData] = useState<{ status: string; expiryDate: string; planId: string } | null>(null);

   // Delete Confirmation Modal
   const [deleteConfirmClinic, setDeleteConfirmClinic] = useState<Clinic | null>(null);

   // Password Change Modal
   const [passwordChangeClinic, setPasswordChangeClinic] = useState<Clinic | null>(null);
   const [newPassword, setNewPassword] = useState('');

   // Sync edit data when selectedClinic changes
   useEffect(() => {
      if (selectedClinic) {
         setEditClinicData({
            status: selectedClinic.status,
            expiryDate: selectedClinic.expiryDate,
            planId: selectedClinic.planId
         });
      } else {
         setEditClinicData(null);
      }
   }, [selectedClinic]);

   const totalRevenue = clinics.reduce((acc, c) => acc + (plans.find(p => p.id === c.planId)?.price || 0), 0);
   const activeClinics = clinics.filter(c => c.status === 'Active').length;
   const totalClinics = clinics.length;

   const handleAddClinicSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      // Auto generate expiry date
      const date = new Date();
      // Universal 14-day trial for ALL plans
      date.setDate(date.getDate() + 14);

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
         customPrice: newClinicForm.useCustomPrice ? newClinicForm.customPrice : undefined
      });

      setCreatedClinicCreds({
         username: newClinicForm.username,
         password: newClinicForm.password,
         name: newClinicForm.name
      });

      setIsAddClinicModalOpen(false);
      setNewClinicForm({ name: '', adminName: '', username: '', password: '', phone: '', planId: plans.length > 0 ? plans[0].id : '', useCustomPrice: false, customPrice: 0 });
   };

   const generatePassword = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
      let pass = '';
      for (let i = 0; i < 10; i++) {
         pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setNewClinicForm(prev => ({ ...prev, password: pass }));
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

   const handleSaveChanges = () => {
      if (selectedClinic && editClinicData) {
         onUpdateClinic(selectedClinic.id, {
            status: editClinicData.status as 'Active' | 'Blocked',
            expiryDate: editClinicData.expiryDate,
            planId: editClinicData.planId
         });
         setSelectedClinic(null);
      }
   };

   // Helper to calculate days remaining
   const getDaysRemaining = (expiry: string) => {
      const today = new Date();
      const exp = new Date(expiry);
      const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff;
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
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SaaS Boshqaruv Paneli</h1>
               <p className="text-sm text-gray-500 dark:text-gray-400">Super Admin uchun boshqaruv markazi</p>
            </div>
            <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
               <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'overview' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}`}
               >
                  Umumiy
               </button>
               <button
                  onClick={() => setActiveTab('clinics')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'clinics' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}`}
               >
                  Klinikalar
               </button>
               <button
                  onClick={() => setActiveTab('plans')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'plans' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}`}
               >
                  Tariflar
               </button>
            </div>
         </div>

         {/* OVERVIEW TAB */}
         {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <Card className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-none">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-indigo-100 font-medium">Oylik Obuna Tushumi</p>
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
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Jami Klinikalar</p>
                        <h3 className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">{totalClinics}</h3>
                        <div className="flex gap-3 mt-3 text-xs">
                           <span className="text-green-600 font-medium flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> {activeClinics} Faol</span>
                           <span className="text-red-500 font-medium flex items-center"><Ban className="w-3 h-3 mr-1" /> {totalClinics - activeClinics} Bloklangan</span>
                        </div>
                     </div>
                     <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-full">
                        <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                     </div>
                  </div>
               </Card>

               <Card className="p-6">
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Faol Tariflar</p>
                        <div className="mt-3 space-y-2">
                           {plans.map(plan => {
                              const count = clinics.filter(c => c.planId === plan.id).length;
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
            </div>
         )}

         {/* CLINICS TAB */}
         {activeTab === 'clinics' && (
            <Card className="p-6">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Klinikalar Ro'yxati</h3>
                  <Button onClick={() => setIsAddClinicModalOpen(true)}>
                     <Plus className="w-4 h-4 mr-2" /> Klinika Qo'shish
                  </Button>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                           <th className="p-4 font-medium text-gray-500">Klinika Nomi</th>
                           <th className="p-4 font-medium text-gray-500">Tarif</th>
                           <th className="p-4 font-medium text-gray-500">Obuna Muddati</th>
                           <th className="p-4 font-medium text-gray-500">Status</th>
                           <th className="p-4 font-medium text-gray-500 text-right">Amallar</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {clinics.map(clinic => {
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
                                    <div className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">{clinic.name}</div>
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
                                 <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => setSelectedClinic(clinic)}
                                    >
                                       Boshqarish
                                    </Button>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            </Card>
         )}

         {/* PLANS TAB */}
         {activeTab === 'plans' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {plans.map(plan => (
                  <Card key={plan.id} className="p-6 relative overflow-hidden flex flex-col">
                     <div className="absolute top-0 right-0 p-4 opacity-10">
                        <ShieldCheck className="w-24 h-24" />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
                     <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-6">
                        {plan.price.toLocaleString()} <span className="text-sm text-gray-500 font-normal">UZS/oy</span>
                     </div>

                     <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                           <Users className="w-4 h-4 text-blue-500" />
                           <span>{plan.maxDoctors} tagacha shifokor</span>
                        </div>
                        {plan.features.map((feat, i) => (
                           <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span>{feat}</span>
                           </div>
                        ))}
                     </div>

                     <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <Button variant="secondary" className="w-full" onClick={() => alert('Tarifni tahrirlash hozircha mavjud emas')}>Tahrirlash</Button>
                     </div>
                  </Card>
               ))}
            </div>
         )}

         {/* Add Clinic Modal */}
         <Modal isOpen={isAddClinicModalOpen} onClose={() => setIsAddClinicModalOpen(false)} title="Yangi Klinika Qo'shish">
            <form onSubmit={handleAddClinicSubmit} className="space-y-4">
               <Input label="Klinika Nomi" value={newClinicForm.name} onChange={e => setNewClinicForm({ ...newClinicForm, name: e.target.value })} required />
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Admin Ismi" value={newClinicForm.adminName} onChange={e => setNewClinicForm({ ...newClinicForm, adminName: e.target.value })} required />
                  <Input label="Telefon" value={newClinicForm.phone} onChange={e => setNewClinicForm({ ...newClinicForm, phone: e.target.value })} required />
               </div>

               <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2"><Lock className="w-4 h-4" /> Kirish Ma'lumotlari</h4>
                  <Input label="Admin Login (Username)" value={newClinicForm.username} onChange={e => setNewClinicForm({ ...newClinicForm, username: e.target.value })} required />
                  <div className="flex items-end gap-2">
                     <Input label="Parol" type="text" value={newClinicForm.password} onChange={e => setNewClinicForm({ ...newClinicForm, password: e.target.value })} required className="flex-1" />
                     <Button type="button" variant="secondary" onClick={generatePassword} className="mb-[1px]">Generatsiya</Button>
                  </div>
               </div>

               <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-4">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
                     <CreditCard className="w-4 h-4" /> Tarif va Narx
                  </h4>

                  <Select
                     label="Tarif Rejasi"
                     options={plans.map(p => ({ value: p.id, label: `${p.name} - ${p.price.toLocaleString()} UZS` }))}
                     value={newClinicForm.planId}
                     onChange={e => setNewClinicForm({ ...newClinicForm, planId: e.target.value })}
                  />

                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                     <input
                        type="checkbox"
                        id="useCustomPrice"
                        checked={newClinicForm.useCustomPrice}
                        onChange={(e) => setNewClinicForm({ ...newClinicForm, useCustomPrice: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                     />
                     <label htmlFor="useCustomPrice" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex-1">
                        Maxsus narx belgilash (alohida taklif)
                     </label>
                  </div>

                  {newClinicForm.useCustomPrice && (
                     <div className="animate-fade-in">
                        <Input
                           label="Maxsus Oylik Narx (UZS)"
                           type="number"
                           value={newClinicForm.customPrice}
                           onChange={e => setNewClinicForm({ ...newClinicForm, customPrice: parseInt(e.target.value) || 0 })}
                           required
                           placeholder="Masalan: 800000"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                           💡 Bu narx standart tarif narxi o'rniga ishlatiladi
                        </p>
                     </div>
                  )}
               </div>

               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsAddClinicModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Klinikani Yaratish</Button>
               </div>
            </form>
         </Modal>

         {/* Clinic Management Modal */}
         {selectedClinic && editClinicData && (
            <Modal isOpen={!!selectedClinic} onClose={() => setSelectedClinic(null)} title="Obuna Boshqaruvi">
               <div className="space-y-6">
                  <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-4">
                     <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedClinic.name}</h3>
                        <p className="text-gray-500 text-sm">@{selectedClinic.username}</p>
                     </div>
                     <div className="text-right">
                        <div className="text-xs text-gray-500">Joriy Holat</div>
                        <Badge status={editClinicData.status === 'Active' ? 'active' : 'blocked'} />
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
                           className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-200 transition-all"
                        >
                           <span className="font-bold text-lg text-blue-600">+1 Oy</span>
                           <span className="text-xs text-gray-500">Uzaytirish</span>
                        </button>
                        <button
                           onClick={() => handleExtendSubscription(3)}
                           className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-200 transition-all"
                        >
                           <span className="font-bold text-lg text-blue-600">+3 Oy</span>
                           <span className="text-xs text-gray-500">Uzaytirish</span>
                        </button>
                        <button
                           onClick={() => handleExtendSubscription(12)}
                           className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-200 transition-all"
                        >
                           <span className="font-bold text-lg text-blue-600">+1 Yil</span>
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
                           label="Tarif Rejasi"
                           value={editClinicData.planId}
                           onChange={(e) => setEditClinicData({ ...editClinicData, planId: e.target.value })}
                           options={plans.map(p => ({ value: p.id, label: p.name }))}
                        />
                     </div>
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
                        className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200"
                        onClick={() => {
                           setDeleteConfirmClinic(selectedClinic);
                           setSelectedClinic(null);
                        }}
                     >
                        Klinikani O'chirish
                     </Button>
                     <div className="flex gap-3">
                        <Button
                           variant="secondary"
                           onClick={() => {
                              setPasswordChangeClinic(selectedClinic);
                              setSelectedClinic(null);
                           }}
                        >
                           <Lock className="w-4 h-4 mr-2" /> Parolni O'zgartirish
                        </Button>
                        <Button variant="secondary" onClick={() => setSelectedClinic(null)}>Bekor qilish</Button>
                        <Button variant="primary" onClick={handleSaveChanges}>
                           <Save className="w-4 h-4 mr-2" /> O'zgarishlarni Saqlash
                        </Button>
                     </div>
                  </div>
               </div>
            </Modal>
         )}

         {/* Credentials Success Modal */}
         <Modal isOpen={!!createdClinicCreds} onClose={() => setCreatedClinicCreds(null)} title="Klinika Muvaffaqiyatli Yaratildi!">
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
               </div>
               <p className="text-gray-600 dark:text-gray-300">
                  Quyidagi ma'lumotlarni nusxalab oling va klinika administratoriga bering.
               </p>
               <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-left space-y-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between">
                     <span className="text-gray-500 text-sm">Klinika:</span>
                     <span className="font-bold text-gray-900 dark:text-white">{createdClinicCreds?.name}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-gray-500 text-sm">Login:</span>
                     <span className="font-mono font-bold text-blue-600">{createdClinicCreds?.username}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-gray-500 text-sm">Parol:</span>
                     <span className="font-mono font-bold text-red-600">{createdClinicCreds?.password}</span>
                  </div>
               </div>
               <div className="pt-2">
                  <Button onClick={() => setCreatedClinicCreds(null)} className="w-full">Yopish</Button>
               </div>
            </div>
         </Modal>

         {/* Delete Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmClinic} onClose={() => setDeleteConfirmClinic(null)} title="Klinikani O'chirish">
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Ban className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  <strong>{deleteConfirmClinic?.name}</strong> klinikasini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi va barcha ma'lumotlar o'chib ketadi.
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmClinic(null)}>Bekor qilish</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmClinic) {
                           onDeleteClinic(deleteConfirmClinic.id);
                           setDeleteConfirmClinic(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Password Change Modal */}
         <Modal isOpen={!!passwordChangeClinic} onClose={() => { setPasswordChangeClinic(null); setNewPassword(''); }} title="Parolni O'zgartirish">
            <div className="space-y-4">
               <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                     <strong>{passwordChangeClinic?.name}</strong> uchun yangi parol belgilang.
                  </p>
               </div>
               <div className="flex items-end gap-2">
                  <Input
                     label="Yangi Parol"
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
                     Generatsiya
                  </Button>
               </div>
               <div className="flex justify-end gap-3 pt-4">
                  <Button variant="secondary" onClick={() => { setPasswordChangeClinic(null); setNewPassword(''); }}>Bekor qilish</Button>
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
      </div>
   );
};
