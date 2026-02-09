import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer, Send, Package } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { TeethChart } from '../components/TeethChart';
import { PatientPhotos } from '../components/PatientPhotos';
import { VisitWorkflow } from '../components/ProceduresSection';
import { ToothStatus, Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis, Clinic, SubscriptionPlan, InventoryLog, InventoryItem, ServiceCategory } from '../types';
import { api } from '../services/api';
import { diagnosisTemplates } from './diagnosisTemplates';

interface PatientDetailsProps {
   patientId: string | null;
   patients: Patient[];
   appointments: Appointment[];
   transactions: Transaction[];
   doctors: Doctor[];
   services: Service[];
   categories: ServiceCategory[];
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>) => void;
   onAddTransaction: (data: Omit<Transaction, 'id'>) => Promise<void>;
   onUpdateTransaction: (id: string, data: Partial<Transaction>) => void;
   onAddAppointment: (appt: Omit<Appointment, 'id'>) => void;
   onUpdateAppointment: (id: string, data: Partial<Appointment>) => void;
}

export const PatientDetails: React.FC<PatientDetailsProps> = ({
   patientId, patients, appointments, transactions, doctors, services, categories, currentClinic, plans,
   onBack, onUpdatePatient, onAddTransaction, onUpdateTransaction, onAddAppointment, onUpdateAppointment
}) => {
   const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'appointments' | 'payments' | 'diagnoses' | 'materials'>('overview');
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);


   const patient = patients.find(p => p.id === patientId);

   // Edit Form State
   const [editFormData, setEditFormData] = useState<Partial<Patient>>({});
   // Payment Form State
   const [paymentData, setPaymentData] = useState({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: '' });
   const [pendingProcedures, setPendingProcedures] = useState<any[]>([]);

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
      categoryId: '',
      duration: 60,
      notes: ''
   });

   // Key to reset VisitWorkflow after successful payment
   const [visitKey, setVisitKey] = useState(0);
   const [processedBatches, setProcessedBatches] = useState<Set<string>>(new Set());

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
   const [editPaymentStatus, setEditPaymentStatus] = useState('Paid');
   const [editPaymentMethod, setEditPaymentMethod] = useState('Cash');

   // Material Usage State
   const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
   const [materialLogs, setMaterialLogs] = useState<InventoryLog[]>([]);
   const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
   const [materialData, setMaterialData] = useState({ itemId: '', quantity: '', note: '' });

   // Prevents double submission
   const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
   const isSubmittingRef = React.useRef(false);

   // Manual Payment Selection State
   const [manualPaymentCategoryId, setManualPaymentCategoryId] = useState<string>('');
   const [manualPaymentServiceId, setManualPaymentServiceId] = useState<number | null>(null);

   // Parse procedures from appointment notes
   const pastProcedures = React.useMemo(() => {
      const results: { id: string; serviceName: string; date: string; toothNumber?: number }[] = [];
      const regex = /- ([^\n(]+) \((?:Tish #(\d+)|Umumiy)\)/g;

      appointments.forEach(appt => {
         if (appt.patientId !== (patientId || patient?.id) || !appt.notes) return;
         regex.lastIndex = 0;
         let match;
         while ((match = regex.exec(appt.notes)) !== null) {
            results.push({
               id: `past-${appt.id}-${results.length}`,
               serviceName: match[1].trim(),
               date: appt.date,
               toothNumber: match[2] ? parseInt(match[2]) : undefined
            });
         }
      });
      return results;
   }, [appointments, patientId, patient?.id]);

   const allProceduresHistory = React.useMemo(() => {
      const today = new Date().toISOString().split('T')[0];
      const current = pendingProcedures.map((p: any) => ({
         id: p.id,
         serviceName: p.serviceName,
         date: today,
         toothNumber: p.toothNumber
      }));
      return [...pastProcedures, ...current];
   }, [pastProcedures, pendingProcedures]);


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

   const [isLoaded, setIsLoaded] = useState(false);

   // Persistence for pending procedures
   useEffect(() => {
      setIsLoaded(false);
      if (patientId) {
         const key = `pending_procedures_${patientId}`;
         const saved = localStorage.getItem(key);

         if (saved) {
            try {
               const parsed = JSON.parse(saved);
               setPendingProcedures(parsed);
            } catch (e) {
               console.error('Failed to parse saved procedures');
               setPendingProcedures([]);
            }
         } else {
            setPendingProcedures([]);
         }
         setIsLoaded(true);
      }
   }, [patientId]);

   useEffect(() => {
      if (patientId && isLoaded) {
         const key = `pending_procedures_${patientId}`;
         if (pendingProcedures.length > 0) {
            localStorage.setItem(key, JSON.stringify(pendingProcedures));
         } else {
            localStorage.removeItem(key);
         }
      }
   }, [patientId, pendingProcedures, isLoaded]);

   useEffect(() => {
      if (patientId) {
         api.diagnoses.getByPatient(patientId).then(setDiagnoses).catch(console.error);
         api.teeth.getAll(patientId).then(setTeethData).catch(console.error);

         // Fetch inventory data
         if (currentClinic) {
            api.inventory.getAll(currentClinic.id).then(setInventoryItems).catch(console.error);
            api.inventory.getLogs(currentClinic.id, patientId).then(setMaterialLogs).catch(console.error);
         }
      }
   }, [patientId, currentClinic]);

   const handleSearchICD10 = async (query: string) => {
      setIcd10Query(query);
      if (query.length > 1) {
         try {
            // Define category prefixes
            const categoryPrefixes: Record<string, string[]> = {
               "Og'iz bo'shlig'i kasalliklari": ['K00', 'K01', 'K02', 'K03', 'K04'],
               "Milk va periodontal kasalliklar": ['K05', 'K06'],
               "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar": ['K11', 'K12', 'K13', 'K14', 'B37'],
               "Jag' va temporomandibulyar bo'g'im kasalliklari": ['K07', 'K09', 'S02', 'Q35', 'M26'],
               "Tish protezlari va davolash bilan bog'liq asoratlar": ['T88', 'K08']
            };

            // Get prefixes for the selected category
            const prefixes = categoryPrefixes[query] || [];

            // Filter templates based on prefixes
            const results = diagnosisTemplates
               .filter(t => {
                  // Extract code from title like "Chuqur karies (K02.1)" -> "K02.1"
                  // Use specific regex to find code pattern (Letter + Number + optional dot + Number) inside parentheses
                  // This avoids matching descriptions in parentheses like "(yallig'lanish)"
                  const codeMatch = t.title.match(/\(([A-Z]\d+(?:\.\d+)?)\)/);
                  const code = codeMatch ? codeMatch[1] : t.title.split(' ')[0];

                  // Check if code starts with any of the prefixes
                  return prefixes.some(prefix => code.startsWith(prefix));
               })
               .map(t => {
                  const codeMatch = t.title.match(/\(([A-Z]\d+(?:\.\d+)?)\)/);
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

         // Create diagnosis payload
         const diagnosisPayload = {
            patientId: patient.id,
            code: selectedCode.code,
            name: selectedCode.name, // Send name for backend to create if missing
            description: selectedCode.description, // Send description
            date: new Date().toISOString().split('T')[0],
            notes: matchingTemplate ? matchingTemplate.content : diagnosisNote,
            status: 'Active' as 'Active' | 'Resolved' | 'Chronic',
            clinicId: patient.clinicId
         };

         // Call API to save diagnosis
         const newDiagnosis = await api.diagnoses.add(diagnosisPayload);

         // Add to diagnoses list
         setDiagnoses([newDiagnosis, ...diagnoses]);

         setIsDiagnosisModalOpen(false);
         setSelectedCode(null);
         setDiagnosisNote('');
         setIcd10Query('');
         setIcd10Results([]);
         alert('Tashxis qo\'shildi!');
      } catch (e) {
         console.error('Failed to add diagnosis', e);
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

   // Helper: Calculate total amount from appointment procedures and generate breakdown
   const calculateAppointmentTotal = (appointmentNotes: string): { total: number; breakdown: string } => {
      if (!appointmentNotes) return { total: 0, breakdown: '' };

      let total = 0;
      const lines = appointmentNotes.split('\n');
      const breakdownLines: string[] = [];

      for (const line of lines) {
         // Skip header lines and empty lines
         if (line.includes('Bajarilgan ishlar:') || line.includes("Qo'shimcha") || line.trim() === '') {
            continue;
         }

         // Extract service name from format like "- Konsultatsiya (Tish #11)"
         const match = line.match(/^[\s-]*(.+?)\s*\(/);
         const serviceName = match ? match[1].trim() : line.replace(/^[\s-]*/, '').trim();

         if (!serviceName) continue;

         // Try to match service names
         for (const service of services) {
            if (serviceName.includes(service.name) || service.name.includes(serviceName)) {
               total += service.price;
               breakdownLines.push(`${service.name}|${service.price.toLocaleString()}`);
               break;
            }
         }
      }

      if (breakdownLines.length === 0) {
         return { total: 0, breakdown: '' };
      }

      const breakdown = breakdownLines.join('||') + '||TOTAL||' + total.toLocaleString();
      return { total, breakdown };
   };

   const handleEditPaymentOpen = (transaction: Transaction) => {
      setEditingTransaction(transaction);
      setEditPaymentAmount(transaction.amount.toString());
      setIsPaymentEditModalOpen(true);
   };

   const handleEditPaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTransaction) return;

      const newAmount = Number(editPaymentAmount);
      const originalAmount = editingTransaction.amount;
      const isNowPaid = editPaymentStatus === 'Paid';

      // Repayment logic: if marking a pending debt as paid
      if (editingTransaction.status === 'Pending' && isNowPaid) {
         // Case 1: Partial Repayment
         if (newAmount < originalAmount) {
            // 1. Create a new Paid transaction for the partial amount
            await onAddTransaction({
               ...editingTransaction,
               id: undefined as any,
               amount: newAmount,
               status: 'Paid',
               type: editPaymentMethod as any,
               service: `${editingTransaction.service} (Qarzdorlik yopildi)`,
               date: new Date().toISOString().split('T')[0]
            });

            // 2. Reduce the original Pending amount
            await onUpdateTransaction(editingTransaction.id, {
               amount: originalAmount - newAmount
            });
         }
         // Case 2: Full Repayment
         else {
            await onUpdateTransaction(editingTransaction.id, {
               status: 'Paid',
               amount: newAmount,
               type: editPaymentMethod as any,
               date: new Date().toISOString().split('T')[0]
            });
         }
      } else {
         // Simple edit for other scenarios
         await onUpdateTransaction(editingTransaction.id, {
            amount: newAmount,
            status: editPaymentStatus as any,
            type: editPaymentMethod as any
         });
      }

      setIsPaymentEditModalOpen(false);
      setEditingTransaction(null);
      setEditPaymentAmount('');
   };

   const handleMaterialSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!materialData.itemId || !patientId || !currentClinic) return;

      try {
         await api.inventory.updateStock(materialData.itemId, {
            change: Number(materialData.quantity),
            type: 'OUT',
            note: materialData.note || `Bemor: ${patient?.firstName} ${patient?.lastName}`,
            userName: 'Doctor', // Ideally get from auth context
            patientId: patientId
         });

         // Refresh logs and items
         const updatedLogs = await api.inventory.getLogs(currentClinic.id, patientId);
         setMaterialLogs(updatedLogs);
         const updatedItems = await api.inventory.getAll(currentClinic.id);
         setInventoryItems(updatedItems);

         setIsMaterialModalOpen(false);
         setMaterialData({ itemId: '', quantity: '', note: '' });
         alert('Material sarflandi!');
      } catch (e) {
         console.error('Failed to use material', e);
         alert('Xatolik yuz berdi');
      }
   };


   if (!patient) {
      return <div className="p-8 text-center">Bemor topilmadi <Button onClick={onBack}>Ortga</Button></div>;
   }

   // Filter related data
   // FIX: Deduplicate appointments on the frontend as a safety net
   const rawPatientAppointments = appointments.filter(a => a.patientId === patient.id);
   const patientAppointments = rawPatientAppointments.filter((appt, index, self) =>
      index === self.findIndex((t) => (
         t.date === appt.date &&
         // Treat as duplicate if same date AND (same time OR same notes content)
         // This is aggressive deduplication to hide the errors the user is seeing
         (t.time === appt.time || t.notes === appt.notes)
      ))
   );
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

      // Auto-select first doctor for individual plans
      if (isIndividualPlan && doctors.length > 0) {
         setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: doctors[0].id });
      } else {
         setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: '' });
      }

      setManualPaymentCategoryId('');
      setManualPaymentServiceId(null);

      setIsPaymentModalOpen(true);
   };

   const handleManualServiceChange = (serviceId: number) => {
      setManualPaymentServiceId(serviceId);
      const service = services.find(s => s.id === serviceId);
      if (service) {
         setPaymentData({
            ...paymentData,
            service: service.name,
            paidAmount: service.price.toString()
         });
      }
   };

   const handlePaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsPaymentSubmitting(true);

      // Check if current plan is individual
      const isIndividualPlan = currentClinic?.planId === 'individual';

      // Validate doctor selection - required for multi-doctor plans, optional for individual with no doctors
      if (!paymentData.doctorId) {
         if (!isIndividualPlan || (isIndividualPlan && doctors.length > 0)) {
            alert('Iltimos, shifokorni tanlang!');
            isSubmittingRef.current = false;
            setIsPaymentSubmitting(false);
            return;
         }
      }

      const doctor = doctors.find(d => d.id === paymentData.doctorId);

      // Calculate amounts
      const paidAmount = Number(paymentData.paidAmount.replace(/,/g, '')) || 0;
      const debtAmount = Number(paymentData.debtAmount.replace(/,/g, '')) || 0;
      const totalAmount = paidAmount + debtAmount;

      try {
         // Scenario 1: Full Payment (Debt == 0)
         if (debtAmount <= 0) {
            await onAddTransaction({
               patientId: patient.id,
               patientName: `${patient.lastName} ${patient.firstName}`,
               date: new Date().toISOString().split('T')[0],
               amount: totalAmount,
               service: paymentData.service,
               type: paymentData.type as any,
               status: 'Paid',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
            });
         }
         // Scenario 2: No Payment (Paid == 0)
         else if (paidAmount <= 0) {
            await onAddTransaction({
               patientId: patient.id,
               patientName: `${patient.lastName} ${patient.firstName}`,
               date: new Date().toISOString().split('T')[0],
               amount: totalAmount,
               service: paymentData.service,
               type: paymentData.type as any,
               status: 'Pending',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
            });
         }
         // Scenario 3: Partial Payment (Paid > 0 && Debt > 0)
         else {
            // 1. Paid Part
            await onAddTransaction({
               patientId: patient.id,
               patientName: `${patient.lastName} ${patient.firstName}`,
               date: new Date().toISOString().split('T')[0],
               amount: paidAmount,
               service: `${paymentData.service} (Qisman to'lov)`,
               type: paymentData.type as any,
               status: 'Paid',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
            });

            // 2. Pending Part (Debt)
            await onAddTransaction({
               patientId: patient.id,
               patientName: `${patient.lastName} ${patient.firstName}`,
               date: new Date().toISOString().split('T')[0],
               amount: debtAmount,
               service: `${paymentData.service} (Qarz)`,
               type: paymentData.type as any,
               status: 'Pending',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
            });
         }

         setIsPaymentModalOpen(false);
         setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: '' });

         setVisitKey(prev => prev + 1);
      } catch (error) {
         console.error('Payment processing failed', error);
         alert('To\'lovni saqlashda xatolik yuz berdi');
      } finally {
         isSubmittingRef.current = false;
         setIsPaymentSubmitting(false);
      }
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
         clinicId: patient.clinicId,
         categoryId: apptData.categoryId || null // Add categoryId
      });
      setIsApptModalOpen(false);
      setApptData({ doctorId: '', date: new Date().toISOString().split('T')[0], time: '09:00', type: 'Konsultatsiya', categoryId: '', duration: 60, notes: '' });
   };

   const openApptModal = () => {
      setApptData(prev => ({
         ...prev,
         doctorId: doctors.length > 0 ? doctors[0].id : '',
         categoryId: categories.length > 0 ? categories[0].id : '', // Set default category
      }));
      setIsApptModalOpen(true);
   };

   const handleCompleteVisit = async (procedures: any[], total: number) => {
      // 1. Double-check if we are already processing or have processed this exact content recently
      // (Though isSubmitting in child handles UI, this handles logic safety)
      const today = new Date().toISOString().split('T')[0];

      // Generate a simple hash/signature for this batch of procedures
      const batchSignature = `${today}-${total}-${procedures.map(p => p.id).join(',')}`;

      if (processedBatches.has(batchSignature)) {
         console.log("Duplicate prevention: Batch already processed");
         return;
      }

      // Add to processed set immediately
      setProcessedBatches(prev => {
         const newSet = new Set(prev);
         newSet.add(batchSignature);
         return newSet;
      });

      const existingAppt = appointments.find(a =>
         a.patientId === patient.id &&
         a.date === today &&
         a.status !== 'Cancelled'
      );

      let doctorId = doctors.length > 0 ? doctors[0].id : '';
      const proceduresText = procedures.map(p => `- ${p.serviceName} (${p.toothNumber ? `Tish #${p.toothNumber}` : 'Umumiy'})`).join('\n');

      if (!existingAppt) {
         // Create NEW Appointment
         // newApptId is not used in onAddAppointment, it's Omit<Appointment, 'id'>
         doctorId = doctors.length > 0 ? doctors[0].id : '';

         await onAddAppointment({
            patientId: patient.id,
            patientName: `${patient.lastName} ${patient.firstName}`,
            doctorId: doctorId,
            doctorName: doctors.find(d => d.id === doctorId)?.firstName || 'Doctor',
            type: 'Davolash',
            date: today,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            duration: 60,
            status: 'Completed',
            notes: `Bajarilgan ishlar:\n` + proceduresText,
            clinicId: patient.clinicId
         });
         alert("Qabul tarixi saqlandi!");
      } else {
         // Update EXISTING Appointment
         const currentNotes = existingAppt.notes || '';

         // Deduplication check: if notes already contain this text, skip appending
         if (currentNotes.includes(proceduresText)) {
            console.log("Duplicate prevention: Procedures already in notes");
            // We still alert success to user so they don't panic, but we don't duplicate data
            alert("Qabul tarixi yangilandi!");
            setPendingProcedures([]);
            setVisitKey(prev => prev + 1);
            return;
         }

         const newNotes = currentNotes ? currentNotes + '\n\n' + `Qo'shimcha (${new Date().toLocaleTimeString()}):\n` + proceduresText : `Bajarilgan ishlar:\n` + proceduresText;

         await onUpdateAppointment(existingAppt.id, {
            notes: newNotes,
            status: 'Completed'
         });
         alert("Qabul tarixi yangilandi!");
      }

      // 2. Cleanup
      setPendingProcedures([]);
      setVisitKey(prev => prev + 1);
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
                     { id: 'materials', label: 'Materiallar', icon: Package },
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

               {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                     <VisitWorkflow
                        key={visitKey}
                        services={services}
                        categories={categories}
                        doctors={doctors}
                        initialProcedures={pendingProcedures}
                        onProceduresChange={setPendingProcedures}
                        onCompleteVisit={handleCompleteVisit}
                     />

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
                     <TeethChart
                        initialData={teethData}
                        onSave={handleSaveTeeth}
                        procedures={allProceduresHistory}
                     />
                  </div>
               )}

               {/* Photos Tab */}
               {activeTab === 'photos' && (
                  <PatientPhotos patientId={patient.id} clinicId={patient.clinicId} token={token} />
               )}

               {/* Appointments Tab */}
               {activeTab === 'appointments' && (
                  <div className="space-y-6">
                     {/* Upcoming Appointments Section */}
                     <Card className="p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Kutilayotgan Qabullar</h3>
                        <div className="space-y-3">
                           {patientAppointments
                              .filter(a => {
                                 const apptDateTime = new Date(`${a.date}T${a.time}`);
                                 const now = new Date();
                                 return apptDateTime >= now && a.status !== 'Cancelled' && a.status !== 'Completed';
                              })
                              .sort((a, b) => {
                                 const dateA = new Date(`${a.date}T${a.time}`);
                                 const dateB = new Date(`${b.date}T${b.time}`);
                                 return dateA.getTime() - dateB.getTime();
                              })
                              .map(app => (
                                 <div key={app.id} className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg hover:shadow-md transition-all">
                                    <div className="flex items-center gap-4">
                                       <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                                          {new Date(app.date).getDate()}
                                       </div>
                                       <div>
                                          <p className="font-bold text-gray-900 dark:text-white">
                                             {new Date(app.date).toLocaleDateString('uz-UZ', { weekday: 'long', month: 'long', day: 'numeric' })}
                                          </p>
                                          <p className="text-sm text-gray-600 dark:text-gray-300">
                                             {app.time} • {app.type} • {app.doctorName}
                                          </p>
                                       </div>
                                    </div>
                                    <Badge status={app.status} />
                                 </div>
                              ))
                           }
                           {patientAppointments.filter(a => {
                              const apptDateTime = new Date(`${a.date}T${a.time}`);
                              const now = new Date();
                              return apptDateTime >= now && a.status !== 'Cancelled' && a.status !== 'Completed';
                           }).length === 0 && (
                                 <div className="text-center py-8 text-gray-500">
                                    Kutilayotgan qabullar yo'q
                                 </div>
                              )}
                        </div>
                     </Card>

                     {/* Appointments History */}
                     <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                           <h3 className="text-lg font-bold text-gray-900 dark:text-white">Qabullar Tarixi</h3>
                           <Button size="sm" onClick={openApptModal}>+ Yangi</Button>
                        </div>
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                 <th className="p-4 font-medium text-gray-500">Sana</th>
                                 <th className="p-4 font-medium text-gray-500">Muolaja</th>
                                 <th className="p-4 font-medium text-gray-500 w-1/3">Bajarilgan ishlar</th>
                                 <th className="p-4 font-medium text-gray-500">Shifokor</th>
                                 <th className="p-4 font-medium text-gray-500">Status</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {patientAppointments
                                 .sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime())
                                 .map(app => (
                                    <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => {
                                       // Optional: Add click handler if user wants to open details modal
                                       if (app.notes) alert(app.notes); // Temporary quick view or just rely on the column
                                    }}>
                                       <td className="p-4 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                                          {new Date(app.date).toLocaleDateString('uz-UZ')} <br />
                                          <span className="text-xs text-gray-500 font-normal">{app.time}</span>
                                       </td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300 min-w-[200px]">
                                          {app.notes ? (
                                             <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 whitespace-pre-line">
                                                {app.notes}
                                             </div>
                                          ) : (
                                             <span className="text-xs text-gray-400">-</span>
                                          )}
                                       </td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{app.doctorName}</td>
                                       <td className="p-4"><Badge status={app.status} /></td>
                                    </tr>
                                 ))}
                           </tbody>
                        </table>
                        {patientAppointments.length === 0 && <div className="p-8 text-center text-gray-500">Qabullar tarixi topilmadi.</div>}
                     </Card>
                  </div>
               )}

               {/* Payments Tab */}
               {activeTab === 'payments' && (
                  <div className="space-y-6">
                     {/* Pending Payments Section */}
                     <Card className="overflow-hidden border-yellow-200 dark:border-yellow-800">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-800 flex justify-between items-center">
                           <div>
                              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-600" /> To'lov Kutayotgan Qabullar</h3>
                              <p className="text-sm text-gray-500">Ushbu qabullar uchun to'lov amalga oshirilmagan</p>
                           </div>
                        </div>
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                 <th className="p-4 font-medium text-gray-500">Sana</th>
                                 <th className="p-4 font-medium text-gray-500">Muolaja</th>
                                 <th className="p-4 font-medium text-gray-500 w-1/3">Bajarilgan ishlar</th>
                                 <th className="p-4 font-medium text-gray-500">Status</th>
                                 <th className="p-4 font-medium text-gray-500">Amal</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {patientAppointments.filter(app => {
                                 // Check if there is any PAID transaction for this date
                                 // Since we enforce 1 appt/day, date match is sufficient and more robust than text matching
                                 const isPaid = patientTransactions.some(t => t.date === app.date && t.status === 'Paid');
                                 return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid;
                              }).map(app => (
                                 <tr key={app.id} className="hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10 transition-colors">
                                    <td className="p-4 text-gray-900 dark:text-white font-medium whitespace-nowrap">{new Date(app.date).toLocaleDateString('uz-UZ')} <br /><span className="text-xs text-gray-500 font-normal">{app.time}</span></td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300 min-w-[200px]"><div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 whitespace-pre-line">{app.notes || '-'}</div></td>
                                    <td className="p-4"><Badge status="Pending" /></td>
                                    <td className="p-4"><Button size="sm" onClick={() => {
                                       const { total, breakdown } = calculateAppointmentTotal(app.notes || '');
                                       setPaymentData({
                                          amount: total.toString(),
                                          paidAmount: total.toString(),
                                          debtAmount: '0',
                                          service: breakdown || app.type,
                                          type: 'Cash',
                                          status: 'Paid',
                                          doctorId: app.doctorId
                                       });
                                       setIsPaymentModalOpen(true);
                                    }}>To'lov</Button></td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        {patientAppointments.filter(app => { const isPaid = patientTransactions.some(t => t.date === app.date && t.service && t.service.includes(app.type) && t.status === 'Paid'); return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid; }).length === 0 && <div className="p-8 text-center text-gray-500">To'lov kutayotgan qabullar yo'q.</div>}
                     </Card>
                     {/* Transaction History Section */}
                     <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                           <div><h3 className="text-lg font-bold text-gray-900 dark:text-white">To'lovlar Tarixi</h3><p className="text-sm text-gray-500">Barcha amalga oshirilgan to'lovlar</p></div>
                           <div className="flex items-center gap-6">
                              <div className="text-right"><p className="text-sm text-gray-500">Jami To'landi</p><p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{patientTransactions.filter(t => t.status === 'Paid').reduce((acc, t) => acc + t.amount, 0).toLocaleString()} UZS</p></div>
                              <Button size="sm" onClick={handlePaymentModalOpen}>+ To'lov</Button>
                           </div>
                        </div>
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr><th className="p-4 font-medium text-gray-500">Sana</th><th className="p-4 font-medium text-gray-500">Xizmat</th><th className="p-4 font-medium text-gray-500">Usul</th><th className="p-4 font-medium text-gray-500">Summa</th><th className="p-4 font-medium text-gray-500">Status</th><th className="p-4 font-medium text-gray-500">Amal</th></tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {patientTransactions.map(t => (
                                 <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    <td className="p-4 text-gray-900 dark:text-white">{t.date}</td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300">{t.service}</td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300">{t.type}</td>
                                    <td className="p-4 text-gray-900 dark:text-white font-medium">{t.amount.toLocaleString()} UZS</td>
                                    <td className="p-4"><Badge status={t.status} /></td>
                                    <td className="p-4 flex gap-2">
                                       {t.status === 'Pending' && (
                                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                                             setEditingTransaction(t);
                                             setEditPaymentAmount(t.amount.toString());
                                             setEditPaymentStatus('Paid');
                                             setEditPaymentMethod('Cash');
                                             setIsPaymentEditModalOpen(true);
                                          }}>To'lash</Button>
                                       )}
                                       <Button size="sm" variant="secondary" onClick={() => {
                                          setEditingTransaction(t);
                                          setEditPaymentAmount(t.amount.toString());
                                          setEditPaymentStatus(t.status);
                                          setEditPaymentMethod(t.type);
                                          setIsPaymentEditModalOpen(true);
                                       }}><Edit className="w-4 h-4" /></Button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        {patientTransactions.length === 0 && <div className="p-8 text-center text-gray-500">To'lovlar tarixi topilmadi.</div>}
                     </Card>
                  </div>
               )}
               {activeTab === 'materials' && (
                  <Card className="overflow-hidden">
                     <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 dark:text-white">Ishlatilgan Materiallar</h3>
                        <Button size="sm" onClick={() => setIsMaterialModalOpen(true)}>+ Material Ishlatish</Button>
                     </div>
                     <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                           <tr>
                              <th className="p-4 font-medium text-gray-500">Sana</th>
                              <th className="p-4 font-medium text-gray-500">Material</th>
                              <th className="p-4 font-medium text-gray-500">Miqdor</th>
                              <th className="p-4 font-medium text-gray-500">Izoh</th>
                              <th className="p-4 font-medium text-gray-500">Foydalanuvchi</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                           {materialLogs.map(log => (
                              <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                 <td className="p-4 text-gray-900 dark:text-white">{new Date(log.date).toLocaleDateString('uz-UZ')}</td>
                                 <td className="p-4 text-gray-900 dark:text-white font-medium">
                                    {log.item?.name}
                                    <span className="text-xs text-gray-500 ml-1">({log.item?.unit})</span>
                                 </td>
                                 <td className="p-4 text-red-600 font-medium">{Math.abs(log.change)}</td>
                                 <td className="p-4 text-gray-600 dark:text-gray-300">{log.note || '-'}</td>
                                 <td className="p-4 text-gray-600 dark:text-gray-300">{log.userName}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                     {materialLogs.length === 0 && <div className="p-8 text-center text-gray-500">Hozircha material ishlatilmagan.</div>}
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
                  <Input label="Manzil" value={editFormData.address || ''} onChange={e => setEditFormData({ ...editFormData, address: e.target.value })} placeholder="Bemor manzilini kiriting..." />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>Bekor qilish</Button>
                     <Button type="submit">Saqlash</Button>
                  </div>
               </form>
            </Modal>


            {/* Material Usage Modal */}
            <Modal isOpen={isMaterialModalOpen} onClose={() => setIsMaterialModalOpen(false)} title="Material Ishlatish">
               <form onSubmit={handleMaterialSubmit} className="space-y-4">
                  <Select
                     label="Material"
                     value={materialData.itemId}
                     onChange={e => setMaterialData({ ...materialData, itemId: e.target.value })}
                     options={[
                        { value: '', label: 'Materialni tanlang' },
                        ...inventoryItems.map(item => ({
                           value: item.id,
                           label: `${item.name} (${item.quantity} ${item.unit} mavjud)`
                        }))
                     ]}
                     required
                  />
                  <Input
                     label="Miqdor"
                     type="number"
                     value={materialData.quantity}
                     onChange={e => setMaterialData({ ...materialData, quantity: e.target.value })}
                     placeholder="0"
                     required
                  />
                  <Input
                     label="Izoh"
                     value={materialData.note}
                     onChange={e => setMaterialData({ ...materialData, note: e.target.value })}
                     placeholder="Qo'shimcha izoh..."
                  />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsMaterialModalOpen(false)}>Bekor qilish</Button>
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
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📋 Bajarilgan Xizmatlar</label>
                     <div className="border-2 border-blue-100 dark:border-blue-800 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 p-4 space-y-0.5">
                        {paymentData.service && paymentData.service.includes('|') ? (
                           paymentData.service.split('||').filter(Boolean).map((item, idx) => {
                              const parts = item.split('|');
                              if (parts[0] === 'TOTAL') {
                                 return (
                                    <div key={idx} className="pt-3 mt-3 border-t-2 border-blue-300 dark:border-blue-700">
                                       <div className="flex justify-between items-center bg-blue-600 dark:bg-blue-700 text-white px-4 py-2.5 rounded-md font-bold text-base">
                                          <span className="flex items-center gap-2">💰 JAMI:</span>
                                          <span className="text-lg">{parts[1]} UZS</span>
                                       </div>
                                    </div>
                                 );
                              }
                              return (
                                 <div key={idx} className="flex justify-between items-center bg-white dark:bg-gray-800 px-3 py-2 rounded border border-blue-100 dark:border-gray-700">
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">{parts[0]}</span>
                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{parts[1]} UZS</span>
                                 </div>
                              );
                           })
                        ) : (
                           <div className="space-y-4">
                              {categories && categories.length > 0 && (
                                 <Select
                                    label="Kategoriya"
                                    value={manualPaymentCategoryId}
                                    onChange={(e) => {
                                       setManualPaymentCategoryId(e.target.value);
                                       setManualPaymentServiceId(null);
                                       setPaymentData({ ...paymentData, service: '', paidAmount: '' });
                                    }}
                                 >
                                    <option value="">Barcha kategoriyalar</option>
                                    {categories.map(cat => (
                                       <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                 </Select>
                              )}

                              <Select
                                 label="Xizmat"
                                 value={manualPaymentServiceId?.toString() || ''}
                                 onChange={(e) => handleManualServiceChange(parseInt(e.target.value))}
                              >
                                 <option value="">Xizmatni tanlang...</option>
                                 {(services || [])
                                    .filter(s => {
                                       if (!manualPaymentCategoryId) return true;
                                       const serviceCatId = (s as any).categoryId?.toString();
                                       return serviceCatId === manualPaymentCategoryId.toString();
                                    })
                                    .map(service => (
                                       <option key={service.id} value={service.id}>
                                          {service.name} - {service.price.toLocaleString()} UZS
                                       </option>
                                    ))}
                              </Select>
                           </div>
                        )}
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="To'lanayotgan Summa"
                        type="number"
                        value={paymentData.paidAmount}
                        onChange={e => setPaymentData({ ...paymentData, paidAmount: e.target.value })}
                        placeholder="0.00"
                        required
                     />
                     <Input
                        label="Qolgan Qarzdorlik"
                        type="number"
                        value={paymentData.debtAmount}
                        onChange={e => setPaymentData({ ...paymentData, debtAmount: e.target.value })}
                        placeholder="0.00"
                     />
                  </div>

                  {/* Total Calculator Display */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center">
                     <span className="text-gray-700 dark:text-gray-300 font-medium">Jami Summa:</span>
                     <span className="text-gray-900 dark:text-white font-bold text-lg">
                        {((Number(paymentData.paidAmount) || 0) + (Number(paymentData.debtAmount) || 0)).toLocaleString()} UZS
                     </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
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
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)} disabled={isPaymentSubmitting}>Bekor qilish</Button>
                     <Button type="submit" disabled={isPaymentSubmitting}>
                        {isPaymentSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                     </Button>
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
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Summa"
                        type="number"
                        value={editPaymentAmount}
                        onChange={e => setEditPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        required
                     />
                     <Select
                        label="Status"
                        value={editPaymentStatus}
                        onChange={e => setEditPaymentStatus(e.target.value)}
                        options={[
                           { value: 'Paid', label: 'To\'landi' },
                           { value: 'Pending', label: 'Kutilmoqda' }
                        ]}
                     />
                  </div>
                  <Select
                     label="To'lov Usuli"
                     value={editPaymentMethod}
                     onChange={e => setEditPaymentMethod(e.target.value)}
                     options={[
                        { value: 'Cash', label: 'Naqd' },
                        { value: 'Card', label: 'Karta' },
                        { value: 'Insurance', label: 'Sug\'urta' }
                     ]}
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
                  {categories.length > 0 && (
                     <Select
                        label="Xizmat kategoriyasi"
                        options={[
                           { value: '', label: 'Barcha kategoriyalar' },
                           ...categories.map(c => ({ value: c.id, label: c.name }))
                        ]}
                        value={apptData.categoryId}
                        onChange={(e) => setApptData({ ...apptData, categoryId: e.target.value, type: '' })}
                     />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                     <Select
                        label="Muolaja turi"
                        options={services
                           .filter(s => !apptData.categoryId || (s as any).categoryId === apptData.categoryId)
                           .map(s => ({ value: s.name, label: s.name }))}
                        value={apptData.type}
                        onChange={e => {
                           const service = services.find(s => s.name === e.target.value);
                           setApptData({
                              ...apptData,
                              type: e.target.value,
                              duration: service?.duration || apptData.duration
                           });
                        }}
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
                  <TeethChart
                     initialData={teethData}
                     readOnly={true}
                     procedures={allProceduresHistory}
                  />
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
