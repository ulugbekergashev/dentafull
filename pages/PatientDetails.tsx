import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer, Send } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { TeethChart } from '../components/TeethChart';
import { PatientPhotos } from '../components/PatientPhotos';
import { ToothStatus, Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis, Clinic, SubscriptionPlan } from '../types';
import { api } from '../services/api';
import { diagnosisTemplates } from './diagnosisTemplates';

interface PatientDetailsProps {
   patientId: string | null;
   patients: Patient[];
   appointments: Appointment[];
   transactions: Transaction[];
   doctors: Doctor[];
   services: Service[];
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>) => void;
   onAddTransaction: (tx: Omit<Transaction, 'id'>) => void;
   onUpdateTransaction: (id: string, data: Partial<Transaction>) => void;
   onAddAppointment: (appt: Omit<Appointment, 'id'>) => void;
}

export const PatientDetails: React.FC<PatientDetailsProps> = ({
   patientId, patients, appointments, transactions, doctors, services, currentClinic, plans,
   onBack, onUpdatePatient, onAddTransaction, onUpdateTransaction, onAddAppointment
}) => {
   const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'appointments' | 'payments' | 'diagnoses'>('overview');
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);


   const patient = patients.find(p => p.id === patientId);

   // Edit Form State
   const [editFormData, setEditFormData] = useState<Partial<Patient>>({});
   // Payment Form State
   const [paymentData, setPaymentData] = useState({ amount: '', service: '', type: 'Cash', status: 'Paid', doctorId: '' });

   // Medical History State
   const [historyText, setHistoryText] = useState('');

   useEffect(() => {
      if (patient) {
         setHistoryText(patient.medicalHistory || '');
      }
   }, [patient]);

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
   const [token, setToken] = useState('');

   // Tooth Data State
   const [teethData, setTeethData] = useState<any[]>([]);

   // Payment Edit State
   const [isPaymentEditModalOpen, setIsPaymentEditModalOpen] = useState(false);
   const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
   const [editPaymentAmount, setEditPaymentAmount] = useState('');

   useEffect(() => {
      const storedAuth = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
      if (storedAuth) {
         try {
            const { token } = JSON.parse(storedAuth);
            setToken(token);
         } catch (e) {
            console.error('Failed to parse auth token');
         }
      }
   }, []);

   useEffect(() => {
      if (patientId) {
         api.diagnoses.getByPatient(patientId).then(setDiagnoses).catch(console.error);
         api.teeth.getAll(patientId).then(setTeethData).catch(console.error);
      }
   }, [patientId]);

   const handleSearchICD10 = async (query: string) => {
      setIcd10Query(query);
      if (query.length > 1) {
         try {
            // Use local templates instead of API
            const results = diagnosisTemplates.map(t => {
               // Extract code from title like "Chuqur karies (K02.1)" -> "K02.1"
               const codeMatch = t.title.match(/\(([^)]+)\)/);
               const code = codeMatch ? codeMatch[1] : t.title.split(' ')[0];

               return {
                  code: code,
                  name: t.title,
                  category: query,
                  description: ''
               };
            });
            setIcd10Results(results as any);
         } catch (e) {
            console.error(e);
         }
      } else {
         setIcd10Results([]);
      }
   };

   const formatDiagnosisNotes = (notes: string) => {
      if (!notes) return null;
      return notes.split('\n').map((line, index) => {
         const cleanLine = line.replace(/^#+\s*/, '');
         if (line.trim().startsWith('###')) {
            return <div key={index} className="font-bold mt-2 text-gray-900 dark:text-white print:text-black">{cleanLine}</div>;
         }
         return <div key={index} className="text-gray-700 dark:text-gray-300 print:text-black">{cleanLine}</div>;
      });
   };

   const handleAddDiagnosis = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCode || !patient) return;

      try {
         // Find matching template based on code
         const matchingTemplate = diagnosisTemplates.find(t => t.title.includes(selectedCode.code));

         // Create local diagnosis object
         const newDiagnosis: PatientDiagnosis = {
            id: Date.now().toString(),
            patientId: patient.id,
            code: selectedCode.code,
            date: new Date().toISOString().split('T')[0],
            notes: matchingTemplate ? matchingTemplate.content : diagnosisNote,
            status: 'Active',
            clinicId: patient.clinicId,
            icd10: selectedCode
         };

         // Add to diagnoses list
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

   const handleSaveTeeth = async (data: { number: number; conditions: any[]; notes: string }) => {
      if (!patientId) return;
      try {
         await api.teeth.save(patientId, data);
         // Update local state if needed, but TeethChart handles its own state mostly
         // We could refresh all teeth data here to be safe
         const updatedTeeth = await api.teeth.getAll(patientId);
         setTeethData(updatedTeeth);
      } catch (e) {
         console.error('Failed to save tooth data', e);
         alert('Tish ma\'lumotlarini saqlashda xatolik yuz berdi');
      }
   };

   const handleEditPaymentOpen = (transaction: Transaction) => {
      setEditingTransaction(transaction);
      setEditPaymentAmount(transaction.amount.toString());
      setIsPaymentEditModalOpen(true);
   };

   const handleEditPaymentSave = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTransaction) return;

      onUpdateTransaction(editingTransaction.id, { amount: Number(editPaymentAmount) });
      setIsPaymentEditModalOpen(false);
      setEditingTransaction(null);
      setEditPaymentAmount('');
   };


   if (!patient) {
      return <div className="p-8 text-center">Bemor topilmadi <Button onClick={onBack}>Ortga</Button></div>;
   }

   // Filter related data
   const patientAppointments = appointments.filter(a => a.patientId === patient.id);
   const patientTransactions = transactions.filter(t => {
      // Priority 1: Match by ID (new data)
      if (t.patientId) {
         return t.patientId === patient.id;
      }
      // Priority 2: Strict Name Match (legacy data)
      // Check both "LastName FirstName" and "FirstName LastName" formats
      const fullName = `${patient.lastName} ${patient.firstName}`;
      const fullNameReverse = `${patient.firstName} ${patient.lastName}`;
      return t.patientName === fullName || t.patientName === fullNameReverse;
   });

   const handleEditOpen = () => {
      setEditFormData(patient);
      setIsEditModalOpen(true);
   };

   const handleEditSave = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdatePatient(patient.id, editFormData);
      setIsEditModalOpen(false);
   };

   const handlePaymentModalOpen = () => {
      // Check if current plan is individual
      const isIndividualPlan = currentClinic?.planId === 'individual';

      // Debug logging
      console.log('🔍 Payment Modal Debug:', {
         currentClinic: currentClinic,
         planId: currentClinic?.planId,
         isIndividualPlan,
         doctorsCount: doctors.length,
         firstDoctorId: doctors[0]?.id
      });

      // Auto-select first doctor for individual plans
      if (isIndividualPlan && doctors.length > 0) {
         console.log('✅ Auto-selecting doctor:', doctors[0].id);
         setPaymentData({ amount: '', service: '', type: 'Cash', status: 'Paid', doctorId: doctors[0].id });
      } else {
         console.log('❌ Not auto-selecting. IsIndividual:', isIndividualPlan, 'DoctorCount:', doctors.length);
         setPaymentData({ amount: '', service: '', type: 'Cash', status: 'Paid', doctorId: '' });
      }

      setIsPaymentModalOpen(true);
   };

   const handlePaymentSave = (e: React.FormEvent) => {
      e.preventDefault();

      // Check if current plan is individual
      const isIndividualPlan = currentClinic?.planId === 'individual';

      // Validate doctor selection - required for multi-doctor plans, optional for individual with no doctors
      if (!paymentData.doctorId) {
         if (!isIndividualPlan || (isIndividualPlan && doctors.length > 0)) {
            alert('Iltimos, shifokorni tanlang!');
            return;
         }
      }

      const doctor = doctors.find(d => d.id === paymentData.doctorId);

      onAddTransaction({
         patientId: patient.id,
         patientName: `${patient.lastName} ${patient.firstName}`,
         date: new Date().toISOString().split('T')[0],
         amount: Number(paymentData.amount),
         service: paymentData.service,
         type: paymentData.type as any,
         status: paymentData.status as any,
         doctorId: paymentData.doctorId || '',
         doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
      });
      setIsPaymentModalOpen(false);
      setPaymentData({ amount: '', service: '', type: 'Cash', status: 'Paid', doctorId: '' });
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
         patientName: `${patient.lastName} ${patient.firstName}`,
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
      <>
         <div className="space-y-6 animate-fade-in pb-10 print:hidden">
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
                           <span className="capitalize">{patient.gender === 'Male' ? 'Erkak' : 'Ayol'}</span> • {patient.dob ? (new Date().getFullYear() - new Date(patient.dob).getFullYear()) : 'N/A'} yosh{patient.dob && ` (${new Date(patient.dob).toLocaleDateString('uz-UZ')})`}
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
                           <MapPin className="w-4 h-4" /> {patient.address || 'Manzil kiritilmagan'}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                           <Clock className="w-4 h-4" /> Oxirgi tashrif: {patient.lastVisit}
                        </div>
                     </div>

                     <div className="flex md:justify-end items-start gap-2">
                        <Button variant="secondary" size="sm" onClick={() => window.print()}>
                           <Printer className="w-4 h-4 mr-2" /> Chop etish
                        </Button>
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
                     { id: 'photos', label: 'Rasmlar', icon: FileText },
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
                           <div className="flex justify-between items-center mb-2">
                              <p className="text-yellow-800 dark:text-yellow-200 font-medium">Allergiya va Kasalliklar</p>
                              <Button
                                 size="sm"
                                 variant="secondary"
                                 className="h-7 text-xs"
                                 onClick={() => {
                                    onUpdatePatient(patient.id, { medicalHistory: historyText });
                                    alert('Saqlandi!');
                                 }}
                              >
                                 Saqlash
                              </Button>
                           </div>
                           <textarea
                              className="w-full bg-transparent border-none p-0 text-sm text-yellow-900 dark:text-yellow-100 focus:ring-0 resize-none"
                              rows={4}
                              value={historyText}
                              onChange={(e) => setHistoryText(e.target.value)}
                              placeholder="Ma'lumot yo'q. Yozish uchun bosing..."
                           />
                        </div>


                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                           <p className="font-medium mb-3 text-gray-700 dark:text-gray-300">Tezkor Tanlov (Kasalliklar)</p>
                           <div className="flex flex-wrap gap-2">
                              {[
                                 "SOG'LOM(SHIKOYATI YO'Q )",
                                 "HOMILADORLIK-Z 32.1",
                                 "TASDIQLANMAGAN HOMILADORLIK-Z 32.0",
                                 "GIPERTONIYA (DAVLENIYA)-I 11.0",
                                 "MIOKARD INFARKTI-I 21.9",
                                 "SURUNKALI YURAK ISHEMIK KASALLIGI -I 25.9",
                                 "OITS -B.20",
                                 "GEPATIT A-B.15",
                                 "GEPATIT B-B.16",
                                 "TUBERKULOZ(SIL)-A.15.0",
                                 "QANDLI DIABET(SHAKAR)-E 10.9",
                                 "QANDLI DIABET(SHAKAR)-E 11.9",
                                 "RAHIT-E 55.9",
                                 "SURUNKALI REVMATIZM-I 09.8"
                              ].map((disease) => (
                                 <button
                                    key={disease}
                                    onClick={() => {
                                       // Avoid duplicates if possible, or just append
                                       if (!historyText.includes(disease)) {
                                          const newHistory = historyText ? historyText + '\n' + disease : disease;
                                          setHistoryText(newHistory);
                                          onUpdatePatient(patient.id, {
                                             medicalHistory: newHistory
                                          });
                                       } else {
                                          alert('Bu kasallik allaqachon qo\'shilgan!');
                                       }
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 rounded-full transition-colors border border-blue-100 dark:border-blue-800"
                                 >
                                    {disease}
                                 </button>
                              ))}
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
                                          <div className="text-sm mt-2 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                             {formatDiagnosisNotes(diagnosis.notes)}
                                          </div>
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
                        </div>
                     </div>
                     <TeethChart initialData={teethData} onSave={handleSaveTeeth} />
                  </div>
               )}

               {/* Photos Tab */}
               {activeTab === 'photos' && (
                  <PatientPhotos patientId={patient.id} clinicId={patient.clinicId} token={token} />
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
                        <Button size="sm" onClick={handlePaymentModalOpen}>To'lov Qilish</Button>
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
                                    <div className="flex gap-2">
                                       {t.status === 'Pending' && (
                                          <Button
                                             size="sm"
                                             onClick={() => onUpdateTransaction(t.id, { status: 'Paid' })}
                                          >
                                             To'landi
                                          </Button>
                                       )}
                                       <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => handleEditPaymentOpen(t)}
                                       >
                                          <Edit className="w-4 h-4" />
                                       </Button>
                                    </div>
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
                  {/* Only show doctor field for non-individual plans OR individual plans with doctors */}
                  {!(currentClinic?.planId === 'individual' && doctors.length === 0) && (
                     <Select
                        label="Shifokor"
                        value={paymentData.doctorId}
                        onChange={e => setPaymentData({ ...paymentData, doctorId: e.target.value })}
                        options={[
                           { value: '', label: 'Shifokorni tanlang' },
                           ...doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))
                        ]}
                        required
                     />
                  )}
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

            {/* Payment Edit Modal */}
            <Modal isOpen={isPaymentEditModalOpen} onClose={() => setIsPaymentEditModalOpen(false)} title="To'lovni Tahrirlash">
               <form onSubmit={handleEditPaymentSave} className="space-y-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
                     <p className="text-sm text-gray-500">Xizmat:</p>
                     <p className="font-medium text-gray-900 dark:text-white">{editingTransaction?.service}</p>
                     <p className="text-sm text-gray-500 mt-2">Sana:</p>
                     <p className="font-medium text-gray-900 dark:text-white">{editingTransaction?.date}</p>
                  </div>
                  <Input
                     label="Summa"
                     type="number"
                     value={editPaymentAmount}
                     onChange={e => setEditPaymentAmount(e.target.value)}
                     placeholder="0.00"
                     required
                  />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsPaymentEditModalOpen(false)}>Bekor qilish</Button>
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

                              setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${patient.lastName} ${patient.firstName}!\n\nSizni ertaga, ${day}-${month} (${dayName}) kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.\n\n📍 Manzil: Klinikamiz\n⏰ Vaqt: ${appt.time}\n👨‍⚕️ Shifokor: ${appt.doctorName}\n\nIltimos, vaqtida kelishingizni so'raymiz.\n\nSavol bo'lsa, biz bilan bog'laning.`);
                           } else {
                              setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${patient.lastName} ${patient.firstName}!\n\nSizni ertaga klinikamizga qabulga kutamiz.\n\nIltimos, aniq vaqtni aniqlash uchun biz bilan bog'laning.`);
                           }
                        } else if (type === 'Debt') {
                           const debt = patientTransactions.filter(t => t.status === 'Pending').reduce((acc, t) => acc + t.amount, 0);
                           if (debt > 0) {
                              setMessageText(`💳 To'lov eslatmasi\n\nHurmatli ${patient.lastName} ${patient.firstName}!\n\nSizning ${debt.toLocaleString()} UZS miqdorida qarzdorligingiz mavjud.\n\nIltimos, to'lovni amalga oshiring.\n\n📞 To'lov bo'yicha savol bo'lsa, biz bilan bog'laning.`);
                           } else {
                              setMessageText(`✅ To'lovlar\n\nHurmatli ${patient.lastName} ${patient.firstName}!\n\nSizning qarzdorligingiz yo'q.\n\nRahmat!`);
                           }
                        } else if (type === 'Missed') {
                           setMessageText(`⚠️ Qoldirilgan qabul\n\nHurmatli ${patient.lastName} ${patient.firstName}!\n\nSiz bugungi qabulga kelmadingiz.\n\nIltimos, yangi vaqt belgilash uchun biz bilan bog'laning.\n\n📞 Telefon: [klinika telefoni]`);
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
         </div >

         {/* Print Template */}
         < div className="hidden print:block print:p-8 bg-white text-black" >
            <div className="text-center mb-8 border-b-2 border-gray-800 pb-4">
               <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">DentalFlow Clinic</h1>
               <p className="text-sm text-gray-600">Tish davolash va diagnostika markazi</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
               <div>
                  <h2 className="text-xs font-bold uppercase text-gray-500 mb-1">Bemor</h2>
                  <p className="text-xl font-bold">{patient.lastName} {patient.firstName}</p>
                  <p className="text-sm">{patient.phone}</p>
                  <p className="text-sm">{patient.dob ? new Date(patient.dob).toLocaleDateString('uz-UZ') : ''} ({patient.dob ? (new Date().getFullYear() - new Date(patient.dob).getFullYear()) : ''} yosh)</p>
               </div>
               <div className="text-right">
                  <h2 className="text-xs font-bold uppercase text-gray-500 mb-1">Sana</h2>
                  <p className="text-xl font-bold">{new Date().toLocaleDateString('uz-UZ')}</p>
                  <p className="text-sm">{new Date().toLocaleTimeString('uz-UZ')}</p>
               </div>
            </div>

            {/* Diagnoses Section */}
            {
               diagnoses.length > 0 && (
                  <div className="mb-8">
                     <h3 className="text-lg font-bold border-b border-gray-400 mb-4 pb-1">Tashxislar</h3>
                     <div className="space-y-4">
                        {diagnoses.map(d => (
                           <div key={d.id} className="mb-4">
                              <div className="flex justify-between items-baseline mb-1">
                                 <span className="font-bold text-lg">{d.code} - {d.icd10?.name}</span>
                                 <span className="text-sm text-gray-600">{d.date}</span>
                              </div>
                              <div className="text-sm pl-4 border-l-2 border-gray-300">
                                 {formatDiagnosisNotes(d.notes)}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )
            }

            {/* Teeth Chart Section */}
            <div className="mb-8 break-inside-avoid">
               <h3 className="text-lg font-bold border-b border-gray-400 mb-4 pb-1">Tish Kartasi</h3>
               <div className="scale-75 origin-top-left">
                  <TeethChart initialData={teethData} readOnly={true} />
               </div>
            </div>

            <div className="mt-12 pt-8 border-t border-gray-300 flex justify-between">
               <div>
                  <p className="text-sm font-bold">Shifokor:</p>
                  <p className="mt-8 border-t border-black w-48 pt-1 text-xs text-center">(Imzo)</p>
               </div>
               <div className="text-right">
                  <p className="text-sm italic">DentalFlow orqali chop etildi</p>
               </div>
            </div>
         </div >
      </>
   );
};