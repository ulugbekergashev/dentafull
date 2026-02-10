import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Modal, Select } from '../components/Common';

import { UserRole, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, ServiceCategory, Review } from '../types';
import { User, DollarSign, Users, Edit, Trash2, CheckCircle, Bot, Phone, Star, MessageSquare } from 'lucide-react';
import { api, API_URL } from '../services/api';

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
   const [activeTab, setActiveTab] = useState<'general' | 'services' | 'doctors' | 'receptionists' | 'bot'>('services');
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
   const [doctorForm, setDoctorForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '', percentage: '' });

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
      ownerPhone: ''
   });
   const [generalSaved, setGeneralSaved] = useState(false);

   // Bot Settings State
   const [botToken, setBotToken] = useState(currentClinic?.botToken || '');
   const [botSaved, setBotSaved] = useState(false);
   const [botUsername, setBotUsername] = useState<string | null>(null);

   const [botLogs, setBotLogs] = useState<any[]>([]);
   const [isLoadingLogs, setIsLoadingLogs] = useState(false);

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
            ownerPhone: currentClinic.ownerPhone || ''
         });
      }
   }, [currentClinic]);

   // Sync botToken with currentClinic
   React.useEffect(() => {
      setBotToken(currentClinic?.botToken || '');
   }, [currentClinic?.botToken]);


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
         const maxDoctors = currentPlan?.maxDoctors || 0;

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
            username: doctor.username || '',
            password: '',
            percentage: (doctor.percentage || 0).toString()
         });
      } else {
         setEditingDoctorId(null);
         setDoctorForm({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '', percentage: '' });
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

   const handleGeneralSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         const response = await api.clinics.updateSettings(currentClinic.id, {
            ownerPhone: generalForm.ownerPhone
         });

         if (response.success) {
            setGeneralSaved(true);
            setTimeout(() => setGeneralSaved(false), 3000);
         }
      } catch (error) {
         console.error('Failed to save general settings:', error);
         alert('Xatolik yuz berdi');
      }
   };

   if (userRole === UserRole.DOCTOR) {
      return (
         <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mening Profilim</h1>
            <Card className="p-6">
               <div className="flex items-center gap-6 mb-6">
                  <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                     <User className="w-10 h-10 text-gray-400" />
                  </div>
                  <div>
                     <Button variant="secondary" size="sm">Rasmni o'zgartirish</Button>
                  </div>
               </div>
               <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <Input label="Ism" defaultValue="Alisher" />
                     <Input label="Familiya" defaultValue="Sobirov" />
                  </div>
                  <Input label="Email" type="email" defaultValue="dr.sobirov@clinic.com" />
                  <Input label="Mutaxassislik" disabled defaultValue="Terapevt" />
                  <div className="pt-4">
                     <Button onClick={(e) => { e.preventDefault(); alert('Profil yangilandi!'); }}>Saqlash</Button>
                  </div>
               </form>
            </Card>
         </div>
      );
   }

   return (
      <div className="space-y-6 animate-fade-in">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Klinika Sozlamalari</h1>

         <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Tabs */}
            <Card className="col-span-1 h-fit p-2">
               {[
                  { id: 'general', name: 'Umumiy', icon: User },
                  { id: 'services', name: 'Xizmatlar va Narxlar', icon: DollarSign },
                  { id: 'doctors', name: 'Shifokorlar', icon: Users },
                  { id: 'receptionists', name: 'Resepshnlar', icon: Phone },
                  { id: 'bot', name: 'Telegram Bot', icon: Bot },
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
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Klinika Reytingi</p>
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
                           {reviews.length} ta fikr
                        </div>
                     </Card>

                     <Card className="p-6">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Umumiy Ma'lumotlar</h3>
                        <form onSubmit={handleGeneralSave} className="space-y-4">
                           <Input label="Klinika Nomi" value={generalForm.clinicName} onChange={e => setGeneralForm({ ...generalForm, clinicName: e.target.value })} />
                           <Input label="Manzil" value={generalForm.address} onChange={e => setGeneralForm({ ...generalForm, address: e.target.value })} />
                           <div className="grid grid-cols-2 gap-4">
                              <Input label="Telefon" value={generalForm.phone} onChange={e => setGeneralForm({ ...generalForm, phone: e.target.value })} />
                              <Input label="Email" value={generalForm.email} onChange={e => setGeneralForm({ ...generalForm, email: e.target.value })} />
                           </div>
                           <Input
                              label="Klinika Egasi Telefoni (Hisobotlar uchun)"
                              value={generalForm.ownerPhone}
                              onChange={e => setGeneralForm({ ...generalForm, ownerPhone: e.target.value })}
                              placeholder="998901234567"
                              helperText="Ushbu raqam Telegram bot orqali bog'langanda hisobotlarni qabul qiladi."
                           />
                           <div className="pt-4 flex items-center gap-4">
                              <Button type="submit">Saqlash</Button>
                              {generalSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> Saqlandi!</span>}
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
                           <h3 className="font-medium text-gray-900 dark:text-white">Kategoriyalar</h3>
                           <Button size="sm" variant="secondary" onClick={() => setIsCategoryModalOpen(true)}>+</Button>
                        </div>
                        <div className="space-y-1">
                           <button
                              onClick={() => setSelectedCategory(null)}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${!selectedCategory ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                           >
                              Barcha Xizmatlar
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
                                 <h3 className="text-lg font-medium text-gray-900 dark:text-white">Xizmatlar va Narxlar</h3>
                                 <p className="text-sm text-gray-500">Davolash turlari va narxlarini boshqarish.</p>
                              </div>
                              <Button size="sm" onClick={() => handleOpenServiceModal()}>Xizmat Qo'shish</Button>
                           </div>

                           <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                              <table className="w-full text-left text-sm">
                                 <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                       <th className="px-4 py-3 font-medium text-gray-500">Xizmat Nomi</th>
                                       <th className="px-4 py-3 font-medium text-gray-500">Narxi</th>
                                       <th className="px-4 py-3 font-medium text-gray-500 text-right">Amal</th>
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
                                             Xizmatlar topilmadi
                                          </td>
                                       </tr>
                                    )}
                                 </tbody>
                              </table>
                           </div>
                        </Card>

                        <Card className="p-6">
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Joriy Tarif</h3>
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
                                 Tarifni Yangilash
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
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">Shifokorlar Boshqaruvi</h3>
                           <p className="text-sm text-gray-500">Klinika xodimlarini boshqarish.</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenDoctorModal()}>Shifokor Qo'shish</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {doctors.map(doc => (
                           <div key={doc.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold">
                                    {doc.firstName[0]}{doc.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Dr. {doc.firstName} {doc.lastName}</p>
                                    <p className="text-xs text-gray-500">{doc.specialty}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{doc.status === 'Active' ? 'Faol' : 'Ta\'tilda'}</span>
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
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">Resepshn Boshqaruvi</h3>
                           <p className="text-sm text-gray-500">Resepshn xodimlarini boshqarish.</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenReceptionistModal()}>Resepshn Qo'shish</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {receptionists.map(rec => (
                           <div key={rec.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 font-bold">
                                    {rec.firstName[0]}{rec.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{rec.firstName} {rec.lastName}</p>
                                    <p className="text-xs text-gray-500">{rec.phone}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{rec.status === 'Active' ? 'Faol' : 'Faol Emas'}</span>
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
                           <div className="text-center py-8 text-gray-500">
                              Resepshnlar mavjud emas
                           </div>
                        )}
                     </div>
                  </Card>
               )}

               {/* Bot Settings Tab */}
               {activeTab === 'bot' && (
                  <Card className="p-6">
                     <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Telegram Bot Sozlamalari</h3>
                     <p className="text-sm text-gray-500 mb-6">
                        Klinikangiz uchun Telegram bot tokenini kiriting. Bot bemorlar va xodimlarga avtomatik xabarlar yuboradi.
                     </p>
                     <form onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                           if (!currentClinic?.id) return;

                           const response = await api.clinics.updateSettings(currentClinic.id, {
                              botToken: botToken || undefined
                           });

                           if (response.success) {
                              setBotSaved(true);
                              setTimeout(() => setBotSaved(false), 3000);

                              // Fetch bot username after saving token
                              if (botToken) {
                                 setTimeout(async () => {
                                    try {
                                       const usernameResponse = await fetch(`${API_URL}/clinics/${currentClinic.id}/bot-username`, {
                                          headers: {
                                             'Authorization': `Bearer ${JSON.parse(localStorage.getItem('dentalflow_auth') || '{}').token}`
                                          }
                                       });
                                       const data = await usernameResponse.json();
                                       if (data.botUsername) {
                                          setBotUsername(data.botUsername);
                                       }
                                    } catch (err) {
                                       console.error('Failed to fetch bot username:', err);
                                    }
                                 }, 1000); // Wait 1 second for bot to initialize
                              } else {
                                 setBotUsername(null);
                              }
                           } else {
                              alert('Xatolik yuz berdi');
                           }
                        } catch (e) {
                           console.error(e);
                           alert('Xatolik yuz berdi');
                        }
                     }} className="space-y-4">
                        <Input
                           label="Bot Token"
                           value={botToken}
                           onChange={e => setBotToken(e.target.value)}
                           placeholder="123456789:AABbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQq"
                           helperText="@BotFather dan olgan tokenni kiriting"
                        />
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                           <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">📱 Bot yaratish:</h4>
                           <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                              <li>Telegram'da @BotFather ni oching</li>
                              <li>/newbot buyrug'ini yuboring</li>
                              <li>Bot nomi va username kiriting</li>
                              <li>Olingan tokenni yuqoridagi maydonga kiriting</li>
                           </ol>
                        </div>
                        <div className="pt-4 flex items-center gap-4">
                           <Button type="submit">Botni ulash</Button>
                           {botSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> Bot muvaffaqiyatli ulandi!</span>}
                        </div>
                     </form>

                     {/* Bot Link Section */}
                     {botToken && (
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800 mt-6">
                           <h4 className="font-medium text-green-900 dark:text-green-200 mb-3">🤖 Sizning botingiz:</h4>
                           {botUsername ? (
                              <div className="space-y-3">
                                 <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-green-200 dark:border-green-700">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Bot havolasi:</p>
                                    <a
                                       href={`https://t.me/${botUsername}`}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="text-blue-600 dark:text-blue-400 hover:underline font-medium break-all"
                                    >
                                       https://t.me/{botUsername}
                                    </a>
                                 </div>
                                 <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                       navigator.clipboard.writeText(`https://t.me/${botUsername}`);
                                       alert('✅ Bot havolasi nusxalandi!');
                                    }}
                                    className="w-full"
                                 >
                                    📋 Havolani nusxalash
                                 </Button>
                                 <p className="text-xs text-gray-600 dark:text-gray-400">
                                    💡 Ushbu havolani bemorlar bilan bo'lishing. Ular botga start bosgandan keyin xabar yuborishingiz mumkin.
                                 </p>
                              </div>
                           ) : (
                              <div className="text-center py-4">
                                 <p className="text-gray-500 dark:text-gray-400">Bot ma'lumotlari yuklanmoqda...</p>
                              </div>
                           )}
                        </div>
                     )}
                  </Card>
               )}

            </div>
         </div>

         {/* Add/Edit Service Modal */}
         <Modal isOpen={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} title={editingServiceIndex !== null ? "Xizmatni Tahrirlash" : "Yangi Xizmat Qo'shish"}>
            <form onSubmit={handleServiceSubmit} className="space-y-4">
               <Input label="Xizmat Nomi" value={serviceForm.name} onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })} required />

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
                  <Input label="Narxi" type="number" value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })} required />
                  <Input label="Texniklar xarajati" type="number" value={serviceForm.cost} onChange={e => setServiceForm({ ...serviceForm, cost: e.target.value })} placeholder="0" />
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsServiceModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Saqlash</Button>
               </div>
            </form>
         </Modal>

         {/* Add Category Modal */}
         <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title="Yangi Kategoriya Qo'shish">
            <form onSubmit={handleCategorySubmit} className="space-y-4">
               <Input label="Kategoriya Nomi" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsCategoryModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Saqlash</Button>
               </div>
            </form>
         </Modal>

         {/* Add/Edit Doctor Modal */}
         <Modal isOpen={isDoctorModalOpen} onClose={() => setIsDoctorModalOpen(false)} title={editingDoctorId ? "Shifokorni Tahrirlash" : "Yangi Shifokor Qo'shish"}>
            <form onSubmit={handleDoctorSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Ism" value={doctorForm.firstName} onChange={e => setDoctorForm({ ...doctorForm, firstName: e.target.value })} required />
                  <Input label="Familiya" value={doctorForm.lastName} onChange={e => setDoctorForm({ ...doctorForm, lastName: e.target.value })} required />
               </div>
               <Input label="Mutaxassislik" value={doctorForm.specialty} onChange={e => setDoctorForm({ ...doctorForm, specialty: e.target.value })} required />
               <Input label="Telefon" value={doctorForm.phone} onChange={e => setDoctorForm({ ...doctorForm, phone: e.target.value })} required />

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Tizimga kirish ma'lumotlari</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={doctorForm.username}
                        onChange={e => setDoctorForm({ ...doctorForm, username: e.target.value })}
                        required={!editingDoctorId}
                        placeholder="shifokor_login"
                     />
                     <Input
                        label="Parol"
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
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsDoctorModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Saqlash</Button>
               </div>
            </form>
         </Modal>

         {/* Upgrade Plan Modal */}
         <Modal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} title="Tarifni Yangilash">
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
         <Modal isOpen={!!deleteConfirmDoctor} onClose={() => setDeleteConfirmDoctor(null)} title="Shifokorni O'chirish">
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  <strong>Dr. {deleteConfirmDoctor?.firstName} {deleteConfirmDoctor?.lastName}</strong> ni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmDoctor(null)}>Bekor qilish</Button>
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
         <Modal isOpen={isReceptionistModalOpen} onClose={() => setIsReceptionistModalOpen(false)} title={editingReceptionistId ? "Resepshnni Tahrirlash" : "Yangi Resepshn Qo'shish"}>
            <form onSubmit={handleReceptionistSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Ism" value={receptionistForm.firstName} onChange={e => setReceptionistForm({ ...receptionistForm, firstName: e.target.value })} required />
                  <Input label="Familiya" value={receptionistForm.lastName} onChange={e => setReceptionistForm({ ...receptionistForm, lastName: e.target.value })} required />
               </div>
               <Input label="Telefon" value={receptionistForm.phone} onChange={e => setReceptionistForm({ ...receptionistForm, phone: e.target.value })} required />

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Tizimga kirish ma'lumotlari</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={receptionistForm.username}
                        onChange={e => setReceptionistForm({ ...receptionistForm, username: e.target.value })}
                        required={!editingReceptionistId}
                        placeholder="resepshn_login"
                     />
                     <Input
                        label="Parol"
                        type="password"
                        value={receptionistForm.password}
                        onChange={e => setReceptionistForm({ ...receptionistForm, password: e.target.value })}
                        required={!editingReceptionistId}
                        placeholder={editingReceptionistId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsReceptionistModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Saqlash</Button>
               </div>
            </form>
         </Modal>

         {/* Delete Receptionist Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmReceptionist} onClose={() => setDeleteConfirmReceptionist(null)} title="Resepshnni O'chirish">
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  <strong>{deleteConfirmReceptionist?.firstName} {deleteConfirmReceptionist?.lastName}</strong> ni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmReceptionist(null)}>Bekor qilish</Button>
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
      </div>
   );
};