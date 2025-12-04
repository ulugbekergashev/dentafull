import React, { useState } from 'react';
import { Card, Button, Input, Modal, Select } from '../components/Common';
import { UserRole, Doctor, Clinic, SubscriptionPlan } from '../types';
import { User, DollarSign, Users, Edit, Trash2, CheckCircle, Bot } from 'lucide-react';
import { api } from '../services/api';

interface SettingsProps {
   userRole: UserRole;
   services: { name: string; price: number; duration: number }[];
   doctors: Doctor[];
   onAddService: (service: { name: string; price: number; duration: number }) => void;
   onUpdateService: (index: number, service: { name: string; price: number; duration: number }) => void;
   onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
   onUpdateDoctor: (id: string, doctor: Partial<Doctor>) => void;
   onDeleteDoctor: (id: string) => void;
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
}

export const Settings: React.FC<SettingsProps> = ({
   userRole, services, doctors, onAddService, onUpdateService, onAddDoctor, onUpdateDoctor, onDeleteDoctor, currentClinic, plans
}) => {
   const [activeTab, setActiveTab] = useState<'general' | 'services' | 'doctors' | 'bot'>('services');

   // Service Modal State
   const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
   const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
   const [serviceForm, setServiceForm] = useState({ name: '', price: '', duration: '' });

   // Doctor Modal State
   const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
   const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
   const [doctorForm, setDoctorForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '' });

   // Upgrade Plan Modal State
   const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

   // Delete Doctor Confirmation Modal
   const [deleteConfirmDoctor, setDeleteConfirmDoctor] = useState<Doctor | null>(null);

   // General Form State
   const [generalForm, setGeneralForm] = useState({
      clinicName: 'DentaCRM Clinic',
      address: '123 Main St, Tashkent, Uzbekistan',
      phone: '+998 71 200 00 00',
      email: 'info@dentacrm.uz'
   });
   const [generalSaved, setGeneralSaved] = useState(false);

   // Bot Settings State
   const [botToken, setBotToken] = useState(currentClinic?.botToken || '');
   const [botSaved, setBotSaved] = useState(false);
   const [botUsername, setBotUsername] = useState<string | null>(null);

   // Debug: Log botUsername changes
   React.useEffect(() => {
      console.log('🔍 botUsername state changed:', botUsername);
   }, [botUsername]);

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

               const response = await fetch(`http://localhost:3001/api/clinics/${currentClinic.id}/bot-username`, {
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

   // Handlers
   const handleOpenServiceModal = (index?: number) => {
      if (index !== undefined) {
         setEditingServiceIndex(index);
         const s = services[index];
         setServiceForm({ name: s.name, price: s.price.toString(), duration: s.duration.toString() });
      } else {
         setEditingServiceIndex(null);
         setServiceForm({ name: '', price: '', duration: '' });
      }
      setIsServiceModalOpen(true);
   };

   const handleServiceSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const data = {
         name: serviceForm.name,
         price: Number(serviceForm.price),
         duration: Number(serviceForm.duration)
      };

      if (editingServiceIndex !== null) {
         onUpdateService(editingServiceIndex, data);
      } else {
         onAddService(data);
      }
      setIsServiceModalOpen(false);
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
            password: ''
         });
      } else {
         setEditingDoctorId(null);
         setDoctorForm({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '' });
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
         onUpdateDoctor(editingDoctorId, updateData);
      } else {
         onAddDoctor({
            ...doctorForm,
            status: 'Active'
         });
      }
      setIsDoctorModalOpen(false);
   };

   const handleGeneralSave = (e: React.FormEvent) => {
      e.preventDefault();
      setGeneralSaved(true);
      setTimeout(() => setGeneralSaved(false), 3000);
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
                  <Card className="p-6">
                     <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Umumiy Ma'lumotlar</h3>
                     <form onSubmit={handleGeneralSave} className="space-y-4">
                        <Input label="Klinika Nomi" value={generalForm.clinicName} onChange={e => setGeneralForm({ ...generalForm, clinicName: e.target.value })} />
                        <Input label="Manzil" value={generalForm.address} onChange={e => setGeneralForm({ ...generalForm, address: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                           <Input label="Telefon" value={generalForm.phone} onChange={e => setGeneralForm({ ...generalForm, phone: e.target.value })} />
                           <Input label="Email" value={generalForm.email} onChange={e => setGeneralForm({ ...generalForm, email: e.target.value })} />
                        </div>
                        <div className="pt-4 flex items-center gap-4">
                           <Button type="submit">Saqlash</Button>
                           {generalSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> Saqlandi!</span>}
                        </div>
                     </form>
                  </Card>
               )}

               {/* Services Tab */}
               {activeTab === 'services' && (
                  <>
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
                                    <th className="px-4 py-3 font-medium text-gray-500">Davomiyligi</th>
                                    <th className="px-4 py-3 font-medium text-gray-500">Narxi</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 text-right">Amal</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {services.map((s, i) => (
                                    <tr key={i} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                                       <td className="px-4 py-3 text-gray-900 dark:text-gray-200 font-medium">{s.name}</td>
                                       <td className="px-4 py-3 text-gray-500">{s.duration} daq</td>
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
                  </>
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
                                       const usernameResponse = await fetch(`http://localhost:3001/api/clinics/${currentClinic.id}/bot-username`, {
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
               <Input label="Davomiyligi (daq)" type="number" value={serviceForm.duration} onChange={e => setServiceForm({ ...serviceForm, duration: e.target.value })} required />
               <Input label="Narxi" type="number" value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })} required />
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsServiceModalOpen(false)}>Bekor qilish</Button>
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
      </div>
   );
};