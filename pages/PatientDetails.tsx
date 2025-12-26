import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer, Send } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { TeethChart } from '../components/TeethChart';
import { ToothStatus, Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis } from '../types';
import { api } from '../services/api';

interface PatientDetailsProps {
   patientId: string | null;
   patients: Patient[];
   appointments: Appointment[];
   transactions: Transaction[];
   doctors: Doctor[];
   services: Service[];
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>) => void;
   onAddTransaction: (tx: Omit<Transaction, 'id'>) => void;
   onUpdateTransaction: (id: string, data: Partial<Transaction>) => void;
   onAddAppointment: (appt: Omit<Appointment, 'id'>) => void;
}

export const PatientDetails: React.FC<PatientDetailsProps> = ({
   patientId, patients, appointments, transactions, doctors, services,
   onBack, onUpdatePatient, onAddTransaction, onUpdateTransaction, onAddAppointment
}) => {
   const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'appointments' | 'payments' | 'diagnoses'>('overview');
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
   const [noteText, setNoteText] = useState('');

   const patient = patients.find(p => p.id === patientId);

   // Edit Form State
   const [editFormData, setEditFormData] = useState<Partial<Patient>>({});
   // Payment Form State
   const [paymentData, setPaymentData] = useState({ amount: '', service: '', type: 'Cash', status: 'Paid' });

   // Message Modal State
   const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
   const [messageText, setMessageText] = useState('');
   const [messageType, setMessageType] = useState('Custom'); // Custom, Tomorrow, Debt, Missed

   // New Appointment Modal State
   const [isApptModalOpen, setIsApptModalOpen] = useState(false);
   const [apptData, setApptData] = useState({
      doctorId: '',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      type: 'Konsultatsiya',
      duration: 60,
      notes: ''
   });

   // Diagnosis State
   const [diagnoses, setDiagnoses] = useState<PatientDiagnosis[]>([]);
   const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
   const [icd10Query, setIcd10Query] = useState('');
   const [icd10Results, setIcd10Results] = useState<ICD10Code[]>([]);
   const [selectedCode, setSelectedCode] = useState<ICD10Code | null>(null);
   const [diagnosisNote, setDiagnosisNote] = useState('');

   useEffect(() => {
      if (patientId) {
         api.diagnoses.getByPatient(patientId).then(setDiagnoses).catch(console.error);
      }
   }, [patientId]);

   const handleSearchICD10 = async (query: string) => {
      setIcd10Query(query);
      if (query.length > 1) {
         try {
            const results = await api.diagnoses.searchCodes(query);
            setIcd10Results(results);
         } catch (e) {
            console.error(e);
         }
      } else {
         setIcd10Results([]);
      }
   };

   const handleAddDiagnosis = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCode || !patient) return;

      try {
         const newDiagnosis = await api.diagnoses.add({
            patientId: patient.id,
            code: selectedCode.code,
            date: new Date().toISOString().split('T')[0],
            notes: diagnosisNote,
            status: 'Active',
            clinicId: patient.clinicId
         });
         setDiagnoses([newDiagnosis, ...diagnoses]);
         setIsDiagnosisModalOpen(false);
         setSelectedCode(null);
         setDiagnosisNote('');
         setIcd10Query('');
         setIcd10Results([]);
         alert('Tashxis qo\'shildi!');
      } catch (e) {
         alert('Xatolik yuz berdi');
      }
   };

   const handleDeleteDiagnosis = async (id: string) => {
      if (!confirm('Tashxisni o\'chirishni xohlaysizmi?')) return;
      try {
         await api.diagnoses.delete(id);
         setDiagnoses(diagnoses.filter(d => d.id !== id));
      } catch (e) {
         alert('Xatolik yuz berdi');
      }
   };


   if (!patient) {
      return <div className="p-8 text-center">Bemor topilmadi <Button onClick={onBack}>Ortga</Button></div>;
   }

   // Filter related data
   const patientAppointments = appointments.filter(a => a.patientId === patient.id);
   const patientTransactions = transactions.filter(t => t.patientName.includes(patient.firstName)); // Simple match for demo

   const handleEditOpen = () => {
      setEditFormData(patient);
      setIsEditModalOpen(true);
   };

   const handleEditSave = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdatePatient(patient.id, editFormData);
      setIsEditModalOpen(false);
   };

   const handlePaymentSave = (e: React.FormEvent) => {
      e.preventDefault();
      onAddTransaction({
         patientName: `${patient.firstName} ${patient.lastName}`,
         date: new Date().toISOString().split('T')[0],
         amount: Number(paymentData.amount),
         service: paymentData.service,
         type: paymentData.type as any,
         status: paymentData.status as any
      });
      setIsPaymentModalOpen(false);
      setPaymentData({ amount: '', service: '', type: 'Cash', status: 'Paid' });
   };

   const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         await api.patients.sendMessage(patient.id, messageText);
         alert('Xabar muvaffaqiyatli yuborildi!');
         setIsMessageModalOpen(false);
         setMessageText('');
      } catch (error: any) {
         console.error('Error sending message:', error);
         if (error.message === 'Bot not configured' || error.error === 'Bot not configured') {
            setIsMessageModalOpen(false);
            alert('⚠️ Bot sozlanmagan. Iltimos, Sozlamalar bo\'limida bot tokenini kiriting.');
         } else {
            alert(`Xatolik: ${error.message || 'Xabar yuborishda xatolik yuz berdi.'}`);
         }
      }
   };

   const handleApptSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      // Past Time Validation
      const selectedDateTime = new Date(`${apptData.date}T${apptData.time}`);
      const now = new Date();

      if (selectedDateTime < now) {
         alert("O'tgan vaqtga qabul belgilash mumkin emas!");
         return;
      }

      if (!apptData.doctorId) {
         alert('Iltimos, shifokorni tanlang!');
         return;
      }

      const doctor = doctors.find(d => d.id === apptData.doctorId);
      if (!doctor) {
         alert('Shifokor topilmadi!');
         return;
      }

      // Doctor Conflict Validation
      const doctorConflict = appointments.some(appt =>
         appt.doctorId === doctor.id &&
         appt.date === apptData.date &&
         appt.time === apptData.time &&
         appt.status !== 'Cancelled'
      );

      if (doctorConflict) {
         alert('Ushbu vaqtda shifokorda boshqa qabul mavjud! Iltimos, boshqa vaqt tanlang.');
         return;
      }

      // Patient Conflict Validation
      const patientConflict = appointments.some(appt =>
         appt.patientId === patient.id &&
         appt.date === apptData.date &&
         appt.time === apptData.time &&
         appt.status !== 'Cancelled'
      );

      if (patientConflict) {
         alert('Ushbu vaqtda bemorda boshqa qabul mavjud! Iltimos, boshqa vaqt tanlang.');
         return;
      }

      onAddAppointment({
         patientId: patient.id,
         patientName: `${patient.firstName} ${patient.lastName}`,
         doctorId: doctor.id,
         doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
         type: apptData.type,
         date: apptData.date,
         time: apptData.time,
         duration: Number(apptData.duration),
         status: 'Pending',
         notes: apptData.notes,
         clinicId: patient.clinicId
      });
      setIsApptModalOpen(false);
      setApptData({ doctorId: '', date: new Date().toISOString().split('T')[0], time: '09:00', type: 'Konsultatsiya', duration: 60, notes: '' });
   };

   const openApptModal = () => {
      setApptData(prev => ({
         ...prev,
         doctorId: doctors.length > 0 ? doctors[0].id : '',
      }));
      setIsApptModalOpen(true);
   };


   return (
      <div className="space-y-6 animate-fade-in pb-10">
         {/* Top Nav */}
         <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onBack} className="!p-2">
               <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bemor Profili</h1>
         </div>

         {/* Header Card */}
         <Card className="p-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
               <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-200 flex items-center justify-center text-3xl font-bold flex-shrink-0">
                  {patient.firstName[0]}{patient.lastName[0]}
               </div>
               <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                  <div className="space-y-1">
                     <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{patient.firstName} {patient.lastName}</h2>
                     <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span className="capitalize">{patient.gender === 'Male' ? 'Erkak' : 'Ayol'}</span> • {patient.dob ? (new Date().getFullYear() - new Date(patient.dob).getFullYear()) : 'N/A'} yosh
                     </p>
                     <div className="pt-2">
                        <Badge status={patient.status} />
                     </div>
                  </div>

                  <div className="space-y-3 text-sm">
                     <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Phone className="w-4 h-4" /> {patient.phone}
                     </div>
                     <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <MapPin className="w-4 h-4" /> Tashkent, Uzbekistan
                     </div>
                     <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Clock className="w-4 h-4" /> Oxirgi tashrif: {patient.lastVisit}
                     </div>
                  </div>

                  <div className="flex md:justify-end items-start gap-2">
                     <Button variant="secondary" size="sm" onClick={() => {
                        setMessageType('Custom');
                        setMessageText('');
                        setIsMessageModalOpen(true);
                     }}>
                        <Send className="w-4 h-4 mr-2" /> Xabar yuborish
                     </Button>
                     <Button variant="secondary" size="sm" onClick={handleEditOpen}>
                        <Edit className="w-4 h-4 mr-2" /> Tahrirlash
                     </Button>
                  </div>
               </div>
            </div>
         </Card>

         {/* Tabs */}
         <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
               {[
                  { id: 'overview', label: 'Umumiy', icon: User },
                  { id: 'diagnoses', label: 'Diagnostika', icon: Activity },
                  { id: 'chart', label: 'Tish Kartasi', icon: Activity },
                  { id: 'appointments', label: 'Qabullar', icon: Calendar },
                  { id: 'payments', label: 'To\'lovlar', icon: CreditCard },
               ].map(tab => (
                  <button
                     key={tab.id}
                     onClick={() => setActiveTab(tab.id as any)}
                     className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                  ${activeTab === tab.id
                           ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                           : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }
                `}
                  >
                     <tab.icon className={`
                  -ml-0.5 mr-2 h-4 w-4
                  ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}
                `} />
                     {tab.label}
                  </button>
               ))}
            </nav>
         </div>

         {/* Tab Content */}
         <div className="min-h-[400px]">

            {/* Overview Tab */}
            {activeTab === 'overview' && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-6 space-y-4">
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-5 h-5" /> Tibbiy Tarix
                     </h3>
                     <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800">
                        <p className="text-yellow-800 dark:text-yellow-200 font-medium">Allergiya va Kasalliklar</p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                           {patient.medicalHistory || 'Ma\'lumot yo\'q.'}
                        </p>
                     </div>
                     <div>
                        <p className="font-medium mb-2 text-gray-700 dark:text-gray-300">Klinik Izohlar</p>
                        <textarea
                           className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                           rows={4}
                           placeholder="Klinik izoh qo'shish..."
                           value={noteText}
                           onChange={(e) => setNoteText(e.target.value)}
                        />
                        <div className="mt-2 flex justify-end">
                           <Button size="sm" onClick={() => {
                              if (noteText) {
                                 onUpdatePatient(patient.id, { medicalHistory: patient.medicalHistory ? patient.medicalHistory + '\n' + noteText : noteText });
                                 setNoteText('');
                              }
                           }}>Saqlash</Button>
                        </div>
                     </div>
                  </Card>
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kutilayotgan Qabullar</h3>
                        <Button size="sm" variant="secondary" onClick={openApptModal}>+ Yangi</Button>
                     </div>
                     {patientAppointments.filter(a => a.status === 'Pending' || a.status === 'Confirmed').length > 0 ? (
                        <div className="space-y-3">
                           {patientAppointments.filter(a => a.status === 'Pending' || a.status === 'Confirmed').map(app => (
                              <div key={app.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                 <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded text-blue-600">
                                       <Calendar className="w-4 h-4" />
                                    </div>
                                    <div>
                                       <p className="font-medium text-gray-900 dark:text-white">{app.date} soat {app.time}</p>
                                       <p className="text-xs text-gray-500">{app.type} - {app.doctorName}</p>
                                    </div>
                                 </div>
                                 <Badge status={app.status} />
                              </div>
                           ))}
                        </div>
                     ) : (
                        <div className="text-center py-6">
                           <p className="text-gray-500 text-sm">Kutilayotgan qabullar yo'q.</p>
                        </div>
                     )}
                  </Card>
               </div>
            )}

            {/* Diagnoses Tab */}
            {activeTab === 'diagnoses' && (
               <div className="space-y-6">
                  <div className="flex justify-between items-center">
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Bemor Tashxislari</h3>
                     <Button onClick={() => setIsDiagnosisModalOpen(true)}>+ Tashxis Qo'shish</Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                     {diagnoses.length > 0 ? (
                        diagnoses.map(diagnosis => (
                           <Card key={diagnosis.id} className="p-4">
                              <div className="flex justify-between items-start">
                                 <div>
                                    <div className="flex items-center gap-2">
                                       <span className="font-bold text-lg text-gray-900 dark:text-white">{diagnosis.code}</span>
                                       <span className="text-gray-600 dark:text-gray-300">{diagnosis.icd10?.name}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1">
                                       Sana: {diagnosis.date} • Status: <span className="font-medium text-blue-600">{diagnosis.status}</span>
                                    </p>
                                    {diagnosis.notes && (
                                       <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                          Izoh: {diagnosis.notes}
                                       </p>
                                    )}
                                 </div>
                                 <Button variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteDiagnosis(diagnosis.id)}>
                                    O'chirish
                                 </Button>
                              </div>
                           </Card>
                        ))
                     ) : (
                        <div className="text-center py-10 text-gray-500">
                           Hozircha tashxislar yo'q.
                        </div>
                     )}
                  </div>
               </div>
            )}

            {/* Dental Chart Tab */}
            {activeTab === 'chart' && (
               <div className="space-y-4">
                  <div className="flex justify-between items-center">
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Odontogramma</h3>
                     <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Chop etish</Button>
                        <Button size="sm" onClick={() => alert('Faqat vizual saqlandi (Mock)')}>O'zgarishlarni Saqlash</Button>
                     </div>
                  </div>
                  <TeethChart initialData={[]} />
               </div>
            )}

            {/* Appointments Tab */}
            {activeTab === 'appointments' && (
               <Card className="overflow-hidden">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                           <th className="p-4 font-medium text-gray-500">Sana</th>
                           <th className="p-4 font-medium text-gray-500">Muolaja</th>
                           <th className="p-4 font-medium text-gray-500">Shifokor</th>
                           <th className="p-4 font-medium text-gray-500">Davomiylik</th>
                           <th className="p-4 font-medium text-gray-500">Status</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {patientAppointments.map(app => (
                           <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                              <td className="p-4 text-gray-900 dark:text-white font-medium">{app.date} {app.time}</td>
                              <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                              <td className="p-4 text-gray-600 dark:text-gray-300">{app.doctorName}</td>
                              <td className="p-4 text-gray-600 dark:text-gray-300">{app.duration} daq</td>
                              <td className="p-4"><Badge status={app.status} /></td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {patientAppointments.length === 0 && <div className="p-8 text-center text-gray-500">Qabullar tarixi topilmadi.</div>}
               </Card>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
               <Card className="overflow-hidden">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                     <div>
                        <p className="text-sm text-gray-500">Jami Xarajat</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                           {patientTransactions.reduce((acc, t) => acc + t.amount, 0).toLocaleString()} UZS
                        </p>
                     </div>
                     <Button size="sm" onClick={() => setIsPaymentModalOpen(true)}>To'lov Qilish</Button>
                  </div>
                  <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                           <th className="p-4 font-medium text-gray-500">Sana</th>
                           <th className="p-4 font-medium text-gray-500">Xizmat</th>
                           <th className="p-4 font-medium text-gray-500">Usul</th>
                           <th className="p-4 font-medium text-gray-500">Summa</th>
                           <th className="p-4 font-medium text-gray-500">Status</th>
                           <th className="p-4 font-medium text-gray-500">Amal</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {patientTransactions.map(t => (
                           <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                              <td className="p-4 text-gray-900 dark:text-white">{t.date}</td>
                              <td className="p-4 text-gray-600 dark:text-gray-300">{t.service}</td>
                              <td className="p-4 text-gray-600 dark:text-gray-300">{t.type === 'Cash' ? 'Naqd' : t.type === 'Card' ? 'Karta' : 'Sug\'urta'}</td>
                              <td className="p-4 text-gray-900 dark:text-white font-medium">{t.amount.toLocaleString()} UZS</td>
                              <td className="p-4"><Badge status={t.status} /></td>
                              <td className="p-4">
                                 {t.status === 'Pending' && (
                                    <Button
                                       size="sm"
                                       onClick={() => onUpdateTransaction(t.id, { status: 'Paid' })}
                                    >
                                       To'landi
                                    </Button>
                                 )}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {patientTransactions.length === 0 && <div className="p-8 text-center text-gray-500">To'lovlar tarixi topilmadi.</div>}
               </Card>
            )}
         </div>

         {/* Edit Modal */}
         <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Profilni Tahrirlash">
            <form onSubmit={handleEditSave} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Ism" value={editFormData.firstName || ''} onChange={e => setEditFormData({ ...editFormData, firstName: e.target.value })} />
                  <Input label="Familiya" value={editFormData.lastName || ''} onChange={e => setEditFormData({ ...editFormData, lastName: e.target.value })} />
               </div>
               <Input label="Telefon" value={editFormData.phone || ''} onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })} />
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Saqlash</Button>
               </div>
            </form>
         </Modal>

         {/* Payment Modal */}
         <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="To'lov Qabul Qilish">
            <form onSubmit={handlePaymentSave} className="space-y-4">
               <Select
                  label="Xizmat Nomi"
                  value={paymentData.service}
                  onChange={e => {
                     const selectedService = services.find(s => s.name === e.target.value);
                     setPaymentData({
                        ...paymentData,
                        service: e.target.value,
                        amount: selectedService ? selectedService.price.toString() : paymentData.amount
                     });
                  }}
                  options={[
                     { value: '', label: 'Xizmatni tanlang' },
                     ...services.map(s => ({ value: s.name, label: `${s.name} (${s.price.toLocaleString()} UZS)` }))
                  ]}
               />
               <Input label="Summa" type="number" value={paymentData.amount} onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })} placeholder="0.00" required />
               <div className="grid grid-cols-2 gap-4">
                  <Select
                     label="To'lov Usuli"
                     value={paymentData.type}
                     onChange={e => setPaymentData({ ...paymentData, type: e.target.value })}
                     options={[
                        { value: 'Cash', label: 'Naqd' },
                        { value: 'Card', label: 'Karta' },
                        { value: 'Insurance', label: 'Sug\'urta' }
                     ]}
                  />
                  <Select
                     label="Holati"
                     value={paymentData.status}
                     onChange={e => setPaymentData({ ...paymentData, status: e.target.value })}
                     options={[
                        { value: 'Paid', label: 'To\'landi' },
                        { value: 'Pending', label: 'Qarz (Kutilmoqda)' }
                     ]}
                  />
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Saqlash</Button>
               </div>
            </form>
         </Modal>

         {/* Message Modal */}
         <Modal isOpen={isMessageModalOpen} onClose={() => setIsMessageModalOpen(false)} title="Xabar Yuborish">
            <form onSubmit={handleSendMessage} className="space-y-4">
               <Select
                  label="Xabar Turi"
                  value={messageType}
                  onChange={(e) => {
                     const type = e.target.value;
                     setMessageType(type);

                     if (type === 'Custom') {
                        setMessageText('');
                     } else if (type === 'Tomorrow') {
                        // Find tomorrow's appointment
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        const tomorrowStr = tomorrow.toISOString().split('T')[0];
                        const appt = patientAppointments.find(a => a.date === tomorrowStr);

                        if (appt) {
                           // Format date nicely
                           const dateObj = new Date(appt.date);
                           const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
                           const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
                           const dayName = dayNames[dateObj.getDay()];
                           const day = dateObj.getDate();
                           const month = monthNames[dateObj.getMonth()];

                           setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${patient.firstName} ${patient.lastName}!\n\nSizni ertaga, ${day}-${month} (${dayName}) kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.\n\n📍 Manzil: Klinikamiz\n⏰ Vaqt: ${appt.time}\n👨‍⚕️ Shifokor: ${appt.doctorName}\n\nIltimos, vaqtida kelishingizni so'raymiz.\n\nSavol bo'lsa, biz bilan bog'laning.`);
                        } else {
                           setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${patient.firstName} ${patient.lastName}!\n\nSizni ertaga klinikamizga qabulga kutamiz.\n\nIltimos, aniq vaqtni aniqlash uchun biz bilan bog'laning.`);
                        }
                     } else if (type === 'Debt') {
                        const debt = patientTransactions.filter(t => t.status === 'Pending' || t.status === 'Overdue').reduce((acc, t) => acc + t.amount, 0);
                        if (debt > 0) {
                           setMessageText(`💳 To'lov eslatmasi\n\nHurmatli ${patient.firstName} ${patient.lastName}!\n\nSizning ${debt.toLocaleString()} UZS miqdorida qarzdorligingiz mavjud.\n\nIltimos, to'lovni amalga oshiring.\n\n📞 To'lov bo'yicha savol bo'lsa, biz bilan bog'laning.`);
                        } else {
                           setMessageText(`✅ To'lovlar\n\nHurmatli ${patient.firstName} ${patient.lastName}!\n\nSizning qarzdorligingiz yo'q.\n\nRahmat!`);
                        }
                     } else if (type === 'Missed') {
                        setMessageText(`⚠️ Qoldirilgan qabul\n\nHurmatli ${patient.firstName} ${patient.lastName}!\n\nSiz bugungi qabulga kelmadingiz.\n\nIltimos, yangi vaqt belgilash uchun biz bilan bog'laning.\n\n📞 Telefon: [klinika telefoni]`);
                     }
                  }}
                  options={[
                     { value: 'Custom', label: 'Maxsus Xabar' },
                     { value: 'Tomorrow', label: 'Ertangi Qabul Eslatmasi' },
                     { value: 'Debt', label: 'Qarzdorlik Eslatmasi' },
                     { value: 'Missed', label: 'Qoldirilgan Qabul' }
                  ]}
               />
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Xabar Matni</label>
                  <textarea
                     className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                     rows={4}
                     placeholder="Xabar matnini kiriting..."
                     value={messageText}
                     onChange={(e) => setMessageText(e.target.value)}
                     required
                  />
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsMessageModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Yuborish</Button>
               </div>
            </form>
         </Modal>

         {/* New Appointment Modal */}
         <Modal isOpen={isApptModalOpen} onClose={() => setIsApptModalOpen(false)} title="Yangi Qabul">
            <form onSubmit={handleApptSubmit} className="space-y-4">
               <Select
                  label="Shifokor"
                  options={doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))}
                  value={apptData.doctorId}
                  onChange={(e) => setApptData({ ...apptData, doctorId: e.target.value })}
               />
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Sana" type="date" value={apptData.date} onChange={e => setApptData({ ...apptData, date: e.target.value })} required />
                  <Input label="Vaqt" type="time" value={apptData.time} onChange={e => setApptData({ ...apptData, time: e.target.value })} required />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <Select
                     label="Muolaja turi"
                     options={services.map(s => ({ value: s.name, label: s.name }))}
                     value={apptData.type}
                     onChange={e => setApptData({ ...apptData, type: e.target.value })}
                  />
                  <Input label="Davomiylik (daq)" type="number" value={apptData.duration} onChange={e => setApptData({ ...apptData, duration: Number(e.target.value) })} required />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Izohlar</label>
                  <textarea
                     className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                     rows={3}
                     value={apptData.notes}
                     onChange={(e) => setApptData({ ...apptData, notes: e.target.value })}
                  />
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsApptModalOpen(false)}>Bekor qilish</Button>
                  <Button type="submit">Band qilish</Button>
               </div>
            </form>
         </Modal>

         {/* Diagnosis Modal */}
         <Modal isOpen={isDiagnosisModalOpen} onClose={() => setIsDiagnosisModalOpen(false)} title="Tashxis Qo'shish (MKB-10)">
            <form onSubmit={handleAddDiagnosis} className="space-y-4">
               {!selectedCode ? (
                  <div className="space-y-4">
                     {icd10Query ? (
                        // Show codes within a selected category
                        <div>
                           <div className="flex items-center gap-2 mb-4">
                              <Button variant="secondary" size="sm" onClick={() => { setIcd10Query(''); setIcd10Results([]); }}>
                                 <ArrowLeft className="w-4 h-4" /> Ortga
                              </Button>
                              <h4 className="font-bold text-gray-900 dark:text-white">{icd10Query}</h4>
                           </div>
                           <div className="space-y-2 max-h-60 overflow-y-auto">
                              {icd10Results.map(code => (
                                 <div
                                    key={code.code}
                                    className="p-3 border rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                                    onClick={() => setSelectedCode(code)}
                                 >
                                    <div className="font-bold text-blue-600 dark:text-blue-400">{code.code}</div>
                                    <div className="text-sm text-gray-700 dark:text-gray-300">{code.name}</div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     ) : (
                        // Show Categories
                        <div className="space-y-2">
                           <p className="text-sm text-gray-500 mb-2">Kategoriyani tanlang:</p>
                           {[
                              "Og'iz bo'shlig'i kasalliklari",
                              "Milk va periodontal kasalliklar",
                              "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar",
                              "Jag' va temporomandibulyar bo'g'im kasalliklari",
                              "Tish protezlari va davolash bilan bog'liq asoratlar"
                           ].map(category => (
                              <div
                                 key={category}
                                 className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex justify-between items-center group"
                                 onClick={() => handleSearchICD10(category)}
                              >
                                 <span className="font-medium text-gray-900 dark:text-white">{category}</span>
                                 <ArrowLeft className="w-4 h-4 rotate-180 text-gray-400 group-hover:text-blue-500 transition-colors" />
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               ) : (
                  // Selected Code Confirmation
                  <div className="space-y-4">
                     <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                        <div>
                           <p className="font-bold text-blue-800 dark:text-blue-200">{selectedCode.code}</p>
                           <p className="text-sm text-blue-700 dark:text-blue-300">{selectedCode.name}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCode(null)}>O'zgartirish</Button>
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Izoh</label>
                        <textarea
                           className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                           rows={3}
                           placeholder="Qo'shimcha izoh..."
                           value={diagnosisNote}
                           onChange={(e) => setDiagnosisNote(e.target.value)}
                        />
                     </div>
                  </div>
               )}

               <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-700">
                  <Button type="button" variant="secondary" onClick={() => { setIsDiagnosisModalOpen(false); setSelectedCode(null); setIcd10Query(''); }}>Yopish</Button>
                  {selectedCode && <Button type="submit">Saqlash</Button>}
               </div>
            </form>
         </Modal>


      </div>
   );
};