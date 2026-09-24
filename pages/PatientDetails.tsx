import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Calendar, CalendarClock, CalendarPlus, ChevronDown, ChevronRight, X, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer, Send, Package, UserPlus, UserCheck, Plus, Trash2, Gift } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { TeethChart } from '../components/TeethChart';
import { PatientPhotos } from '../components/PatientPhotos';
import { VisitWorkflow, ProceduresSection } from '../components/ProceduresSection';
import { InstallmentsTab } from '../components/InstallmentsTab';
import { RegionDistrictSelect } from '../components/RegionDistrictSelect';
import { ToothStatus, Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis, Clinic, SubscriptionPlan, InventoryLog, InventoryItem, ServiceCategory, UserRole, Recall, PaymentMethod } from '../types';
import { api } from '../services/api';
import { diagnosisTemplates } from './diagnosisTemplates';
import { useLanguage } from '../context/LanguageContext';
import { formatDobDDMMYYYY, calcAge, formatDateToISO } from '../utils/dateUtils';
import { calculateAppointmentTotal } from '../utils/financialCalculations';
import { buildWaivedTransaction } from '../utils/unpaid';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { tLabel } from '../i18n/labels';
import { PaymentPart, balanceUsed, buildPaymentRecords, splitError } from '../utils/paymentSplit';
import { PaymentSplitRows } from '../components/PaymentSplitRows';
import { DateField } from '../components/DateField';
import { WaiveAppointmentModal } from '../components/WaiveAppointmentModal';
import { usePerms } from '../context/PermissionsContext';
import { maskPhone } from '../utils/accessControl';
import { printPatientCard } from '../utils/printPatientCard';

import { ReceiptModal } from '../components/ReceiptModal';

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
   userRole?: UserRole;
   doctorId?: string; // Kirgan shifokor (DOCTOR roli) — shifokor tanlovlarida defolt
   showPatientPhone?: boolean; // Ruxsatlar: bemor telefon raqamini ko'rsatish
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>) => void;
   onAddTransaction: (data: Omit<Transaction, 'id'>) => Promise<Transaction | void>;
   onUpdateTransaction: (id: string, data: Partial<Transaction>) => void;
   /** To'lovni o'chirish (Kassa sahifasidagi bilan bir xil) — shifokorga ko'rsatilmaydi */
   onDeleteTransaction?: (id: string) => Promise<void>;
   onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
   onUpdateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
}

export const PatientDetails: React.FC<PatientDetailsProps> = ({
   patientId: patientIdProp, 
   patients = [], 
   appointments = [], 
   transactions = [], 
   doctors = [], 
   services = [], 
   categories = [], 
   currentClinic, 
   plans = [], 
   userRole,
   doctorId: loggedDoctorId,
   showPatientPhone = true,
   onBack, onUpdatePatient, onAddTransaction, onUpdateTransaction, onDeleteTransaction, onAddAppointment, onUpdateAppointment
}) => {
   const { patientId: patientIdParam } = useParams<{ patientId: string }>();
   const patientId = patientIdProp || patientIdParam || null;
   const { t } = useLanguage();

   const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'appointments' | 'payments' | 'materials' | 'installments'>('overview');
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);


   const patient = patients.find(p => String(p.id).trim() === String(patientId).trim());

   // DOCTOR roli bilan kirilgan bo'lsa — shifokor tanlovlarida o'zi defolt tanlanadi
   const myDoctor = userRole === UserRole.DOCTOR && loggedDoctorId ? doctors.find(d => d.id === loggedDoctorId) : undefined;
   const defaultDoctorId = myDoctor?.id || '';

   // Edit Form State
   const [editFormData, setEditFormData] = useState<Partial<Patient>>({});
   // Payment Form State
   const [paymentData, setPaymentData] = useState({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: defaultDoctorId, appointmentDate: '', discountPercent: '' });
   const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
   /** To'lov oynasida xizmatlar ro'yxati ochiqmi */
   const [paymentServicesOpen, setPaymentServicesOpen] = useState(false);
   /** Asosiy usuldan tashqari to'lov usullari (bitta to'lovni bo'lish) */
   const [paymentExtras, setPaymentExtras] = useState<PaymentPart[]>([]);
   /**
    * To'lov sanasini o'zgartirsa bo'ladimi. Faqat qabulga bog'lanmagan to'lovda
    * (qo'lda to'lov, avans) — qabul to'lovi qabul sanasiga yozilishi shart,
    * aks holda qabul "Olinmagan pul" ro'yxatida qolib ketadi.
    */
   const [paymentDateEditable, setPaymentDateEditable] = useState(false);
   // Ruxsatlar jadvali (Xodimlar → Ruxsatlar). Klinika egasida hammasi ochiq.
   const perms = usePerms();
   const canPayCreate = perms.flag('money', 'payCreate');
   const canPayEdit = perms.flag('money', 'payEdit');
   const canPayDelete = perms.flag('money', 'payDelete');
   const canWaive = perms.flag('money', 'waive');
   const canBackdate = perms.flag('money', 'backdate');
   const maxDiscount = perms.limit('money', 'discount');
   const canEditCard = perms.can('patients', 'card', 'edit');
   const canViewHistory = perms.can('patients', 'history', 'view');
   const canEditHistory = perms.can('patients', 'history', 'edit');
   const canViewChart = perms.can('patients', 'chart', 'view');
   const canEditChart = perms.can('patients', 'chart', 'edit');
   const canViewPhotos = perms.can('patients', 'photos', 'view');
   const canViewPayments = perms.can('patients', 'payhist', 'view');
   const canMessage = perms.flag('patients', 'message');
   const canBook = perms.can('calendar', 'appts', 'create');
   const tabAllowed = (id: string) =>
      id === 'chart' ? canViewChart
         : id === 'photos' ? canViewPhotos
            : id === 'payments' || id === 'installments' ? canViewPayments
               : true;
   // Ruxsati yo'q tab ochiq qolib ketmasin (masalan havola orqali kelganda)
   useEffect(() => {
      if (!tabAllowed(activeTab)) setActiveTab('overview');
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [activeTab, canViewChart, canViewPhotos, canViewPayments]);
   /** "Bepul deb yopish" oynasi ochilgan qabul */
   const [waivingAppointment, setWaivingAppointment] = useState<Appointment | null>(null);

   // Chegirmadan keyingi jami summa (asl narx ma'lum bo'lganda)
   const getDiscountedTotal = (): number => {
      const baseAmount = Number(paymentData.amount) || 0;
      if (baseAmount <= 0) return 0;
      const discountVal = Number(paymentData.discountPercent) || 0;
      return discountType === 'percent'
         ? Math.round(baseAmount * (1 - discountVal / 100))
         : Math.max(0, baseAmount - discountVal);
   };
   const [pendingProcedures, setPendingProcedures] = useState<any[]>([]);

   // Installment quick-open state (from appointment row)
   const [installmentQuickOpen, setInstallmentQuickOpen] = useState<{ service: string; amount: number; doctorId: string } | null>(null);

   // Medical History State
   const [historyText, setHistoryText] = useState('');

   // Nazorat (qayta tashrif): shifokor qabulda belgilaydi, muddati kelganda
   // avtomatika bemorga yozadi, resepshn bosh sahifadan qo'ng'iroq qiladi.
   const [recalls, setRecalls] = useState<Recall[]>([]);
   const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);
   const [recallForm, setRecallForm] = useState<{ dueDate: string; reason: string; kind: 'checkup' | 'treatment' }>({ dueDate: '', reason: '', kind: 'checkup' });
   const [recallSaving, setRecallSaving] = useState(false);
   /** Kasallik tarixi: tayyor ro'yxat (chiplar) ochiqmi. Standart: yopiq. */
   const [showQuickSelect, setShowQuickSelect] = useState(false);

   useEffect(() => {
      if (patient) {
         setHistoryText(patient.medicalHistory || '');
      }
   }, [patient]);

   // Message Modal State
   const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
   const [messageText, setMessageText] = useState('');
   const [messageType, setMessageType] = useState('Custom'); // Custom, Tomorrow, Debt, Missed
   const [messageChannel, setMessageChannel] = useState<'auto' | 'telegram' | 'sms'>('auto');

   // New Appointment Modal State
   const [isApptModalOpen, setIsApptModalOpen] = useState(false);
   const [apptData, setApptData] = useState({
      doctorId: defaultDoctorId,
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
   // Qo'lda to'lovda bir nechta xizmat tanlanadi; har birining narxi alohida tahrirlanadi
   const [manualPaymentServiceIds, setManualPaymentServiceIds] = useState<number[]>([]);
   const [manualPaymentPrices, setManualPaymentPrices] = useState<Record<number, string>>({});

   // Receipt Modal State
   const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
   const [receiptTransaction, setReceiptTransaction] = useState<Transaction | null>(null);
   const [receiptParts, setReceiptParts] = useState<Transaction[]>([]);

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

   const handleImageUpload = async (type: 'avatar' | 'portrait', file: File) => {
      if (!patient) return;
      try {
         const res = type === 'avatar' 
            ? await api.patients.uploadAvatar(patient.id, file)
            : await api.patients.uploadPortrait(patient.id, file);
         
         if (res.success) {
            onUpdatePatient(patient.id, { [type === 'avatar' ? 'avatarUrl' : 'portraitUrl']: res.url });
            alert(t('common.save'));
         }
      } catch (error) {
         console.error(`Failed to upload ${type}:`, error);
         alert(t('patients.details.alerts.error'));
      }
   };

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
         api.recalls.getByPatient(patientId).then(setRecalls).catch(() => setRecalls([]));
         api.teeth.getAll(patientId).then(setTeethData).catch(console.error);

         // Fetch inventory data
         if (currentClinic) {
            api.inventory.getAll(currentClinic.id).then(setInventoryItems).catch(console.error);
            api.inventory.getLogs(currentClinic.id, patientId).then(setMaterialLogs).catch(console.error);
         }
      }
   }, [patientId, currentClinic]);

   const [isAssignDoctorModalOpen, setIsAssignDoctorModalOpen] = useState(false);

   const handleAssignDoctor = (doctorId: string) => {
      const selectedDoctor = doctors.find(d => d.id === doctorId);
      if (selectedDoctor) {
         onUpdatePatient(patient.id, {
            doctorId: selectedDoctor.id,
            doctorName: `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}`
         });
         alert(t('patients.details.alerts.doctorAssigned'));
      }
      setIsAssignDoctorModalOpen(false);
   };

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
         alert(t('patients.details.alerts.diagnosisAdded'));
      } catch (e) {
         console.error('Failed to add diagnosis', e);
         alert(t('patients.details.alerts.error'));
      }
   };

   const handleDeleteDiagnosis = async (id: string) => {
      if (!confirm(t('patients.details.alerts.deleteDiagnosisConfirm'))) return;
      try {
         await api.diagnoses.delete(id);
         setDiagnoses(diagnoses.filter(d => d.id !== id));
      } catch (e) {
         alert(t('patients.details.alerts.error'));
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
         alert(t('patients.details.alerts.error'));
      }
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
               date: formatDateToISO(new Date()),
               // Chegirma asl qarz yozuvida qoladi — bu yerda takrorlansa hisobotda ikki marta
               // sanalardi (Kassa va bosh sahifadagi qarz to'lovi ham chegirmasiz yozadi)
               discountPercent: 0,
               discountAmount: 0,
               isDebt: false,
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
               date: formatDateToISO(new Date())
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
         alert(t('patients.details.alerts.materialUsed'));
      } catch (e) {
         console.error('Failed to use material', e);
         alert(t('patients.details.alerts.error'));
      }
   };


   if (!patient) {
      return <div className="p-8 text-center">{t('patients.details.notFound')} <Button onClick={onBack}>{t('common.cancel')}</Button></div>;
   }

   // Filter related data
   const patientAppointments = (appointments || []).filter(a => a && a.patientId === patient.id);
   const patientTransactions = (transactions || []).filter(t => {
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

   const todayKey = formatDateToISO(new Date());
   const paymentSplitProblem = paymentData.service === 'Avans'
      ? null
      : splitError(Number(paymentData.paidAmount) || 0, paymentExtras, patient.balance || 0);

   // Chap panel va Umumiy tab uchun hisoblangan qiymatlar
   const patientAge = calcAge(patient.dob);
   const patientBalance = patient.balance || 0;
   const balanceLabel = patientBalance > 0
      ? t('patients.details.balanceAdvance')
      : patientBalance < 0 ? t('patients.details.balanceDebt') : t('patients.details.balanceSettled');
   const balanceText = patientBalance > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : patientBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white';
   // "Sog'lom" belgisi ogohlantirish emas — faqat haqiqiy kasallik/allergiyalar ko'rsatiladi
   const healthAlerts = (patient.medicalHistory || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !/^SOG'LOM/i.test(line));
   const nowTs = Date.now();
   const nextAppointment = patientAppointments
      .filter(a => a.status !== 'Cancelled' && a.status !== 'Completed' && new Date(`${a.date}T${a.time}`).getTime() >= nowTs)
      .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())[0];
   const lastVisitLabel = patient.lastVisit && patient.lastVisit !== 'Never'
      ? formatDobDDMMYYYY(patient.lastVisit)
      : t('patients.details.noVisits');

   // Ochiq nazorat: eng yaqin sanali rejalashtirilgan / eslatilgan / yozilgan
   const activeRecall = recalls
      .filter(r => r.status === 'planned' || r.status === 'reminded' || r.status === 'booked')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
   const recallStatusLabel: Record<string, string> = {
      planned: t('patients.details.recall.status.planned'),
      reminded: t('patients.details.recall.status.reminded'),
      booked: t('patients.details.recall.status.booked'),
   };
   /** Bugundan N oy keyingi sana, mahalliy vaqt bo'yicha (YYYY-MM-DD) */
   const addMonthsStr = (months: number) => {
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const day = `${d.getDate()}`.padStart(2, '0');
      return `${d.getFullYear()}-${m}-${day}`;
   };
   /** Bugundan N kun keyingi sana (YYYY-MM-DD) */
   const addDaysStr = (days: number) => {
      const d = new Date(Date.now() + days * 86400000);
      return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
   };
   const openRecallModal = () => {
      setRecallForm({ dueDate: addMonthsStr(6), reason: '', kind: 'checkup' });
      setIsRecallModalOpen(true);
   };
   const saveRecall = async () => {
      if (!recallForm.dueDate) return;
      setRecallSaving(true);
      try {
         const created = await api.recalls.create({
            patientId: patient.id,
            clinicId: patient.clinicId,
            doctorId: myDoctor?.id || patient.doctorId || null,
            dueDate: recallForm.dueDate,
            reason: recallForm.reason.trim() || undefined,
            kind: recallForm.kind,
         });
         setRecalls(prev => [created, ...prev.filter(r => r.id !== created.id)]);
         setIsRecallModalOpen(false);
      } catch (err: any) {
         alert(err?.message || t('patients.details.alerts.error'));
      } finally {
         setRecallSaving(false);
      }
   };
   const cancelRecall = async (id: string) => {
      if (!window.confirm(t('patients.details.recall.cancelConfirm'))) return;
      try {
         await api.recalls.update(id, { status: 'cancelled' });
         setRecalls(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r));
      } catch (err: any) {
         alert(err?.message || t('patients.details.alerts.error'));
      }
   };

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

      // Defolt shifokor: kirgan shifokor → bemorga biriktirilgan → individual planda birinchi → bo'sh
      const assignedDoctorId = patient?.doctorId && doctors.some(d => d.id === patient.doctorId) ? patient.doctorId : '';
      const autoDoctorId = defaultDoctorId || assignedDoctorId || (isIndividualPlan && doctors.length > 0 ? doctors[0].id : '');
      setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: autoDoctorId, appointmentDate: formatDateToISO(new Date()), discountPercent: '' });
      setPaymentExtras([]);
      setPaymentDateEditable(true);

      setDiscountType('percent');
      setManualPaymentCategoryId('');
      setManualPaymentServiceIds([]);
      setManualPaymentPrices({});

      setIsPaymentModalOpen(true);
   };

   // Tanlangan xizmatlardan to'lov summasi va xizmat matnini quradi.
   // Bitta xizmat — oddiy nom (avvalgidek). Bir nechta — qabul yakunlanganda
   // ishlatiladigan "nom|narx||...||TOTAL|jami" formati: uni moliya, bosh sahifa
   // va tarix allaqachon tushunadi.
   const applyManualServices = (ids: number[], priceMap: Record<number, string>) => {
      const rows = ids
         .map(id => services.find(s => s.id === id))
         .filter((s): s is NonNullable<typeof s> => !!s)
         .map(s => ({ name: s.name, price: Number(priceMap[s.id]) || 0 }));
      const total = rows.reduce((sum, r) => sum + r.price, 0);
      const service = rows.length === 0 ? ''
         : rows.length === 1 ? rows[0].name
            : rows.map(r => `${r.name}|${r.price}`).join('||') + `||TOTAL|${total}`;
      setPaymentData(prev => ({
         ...prev,
         service,
         amount: rows.length ? total.toString() : '',
         paidAmount: rows.length ? total.toString() : '',
         debtAmount: '0',
         discountPercent: ''
      }));
   };

   const toggleManualService = (serviceId: number) => {
      const service = services.find(s => s.id === serviceId);
      if (!service) return;
      const ids = manualPaymentServiceIds.includes(serviceId)
         ? manualPaymentServiceIds.filter(id => id !== serviceId)
         : [...manualPaymentServiceIds, serviceId];
      const priceMap = { ...manualPaymentPrices };
      if (ids.includes(serviceId)) priceMap[serviceId] = service.price.toString();
      else delete priceMap[serviceId];
      setManualPaymentServiceIds(ids);
      setManualPaymentPrices(priceMap);
      applyManualServices(ids, priceMap);
   };

   const changeManualServicePrice = (serviceId: number, value: string) => {
      const priceMap = { ...manualPaymentPrices, [serviceId]: value };
      setManualPaymentPrices(priceMap);
      applyManualServices(manualPaymentServiceIds, priceMap);
   };

   const handlePaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsPaymentSubmitting(true);

      // Calculate amounts early for validation
      const paidAmount = Number(paymentData.paidAmount.toString().replace(/,/g, '')) || 0;
      const debtAmount = Number(paymentData.debtAmount.toString().replace(/,/g, '')) || 0;
      const totalAmount = paidAmount + debtAmount;

      // Avans kiritishda to'lov bo'linmaydi — u kassaga pul solish
      const extras = paymentData.service === 'Avans' ? [] : paymentExtras;
      if (splitError(paidAmount, extras, patient.balance || 0)) {
         isSubmittingRef.current = false;
         setIsPaymentSubmitting(false);
         return;
      }

      // Validate balance if using from-account payment
      if (balanceUsed(paymentData.type as PaymentMethod, paidAmount, extras) > (patient.balance || 0)) {
         alert(t('patients.details.alerts.insufficientBalance'));
         isSubmittingRef.current = false;
         setIsPaymentSubmitting(false);
         return;
      }

      // Check if current plan is individual
      const isIndividualPlan = currentClinic?.planId === 'individual';

      // Validate doctor selection - required for multi-doctor plans, optional for individual with no doctors
      if (!paymentData.doctorId) {
         if (!isIndividualPlan || (isIndividualPlan && doctors.length > 0)) {
            alert(t('patients.details.alerts.selectDoctorReq'));
            isSubmittingRef.current = false;
            setIsPaymentSubmitting(false);
            return;
         }
      }

      const doctor = doctors.find(d => d.id === paymentData.doctorId);
      // Calculate discount percent and amount based on discount type
      const rawDiscountVal = Number(paymentData.discountPercent) || 0;
      // Chegirma asl narxga nisbatan hisoblanadi. Ilgari chegirmadan keyingi summaga
      // nisbatan olinardi: 100 000 dan 10 000 chegirma 11% bo'lib saqlanardi va
      // chegirma limiti (masalan 10%) bilan server uni rad etgan bo'lardi.
      // Asl narx noma'lum bo'lsa (xizmat tanlanmagan) — avvalgidek to'lov summasi.
      const discountBase = (Number(paymentData.amount) || 0) > 0 ? Number(paymentData.amount) : totalAmount;
      const discountPercent = discountType === 'percent'
         ? rawDiscountVal
         : (discountBase > 0 ? Math.round((rawDiscountVal / discountBase) * 100) : 0);
      const discountAmount = discountType === 'percent'
         ? Math.round(discountBase * (rawDiscountVal / 100))
         : rawDiscountVal;

      try {
         const records = buildPaymentRecords({
            service: paymentData.service,
            primaryMethod: paymentData.type as PaymentMethod,
            paidAmount,
            extras,
            debtAmount,
            discountAmount,
         });
         const created: Transaction[] = [];
         for (const record of records) {
            const tx = await onAddTransaction({
               patientId: patient.id,
               patientName: `${patient.lastName} ${patient.firstName}`,
               date: paymentData.appointmentDate || formatDateToISO(new Date()),
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : '',
               discountPercent,
               ...record,
            } as Omit<Transaction, 'id'>);
            if (tx) created.push(tx);
         }
         const paidCreated = created.filter(tx => tx.status === 'Paid');
         const finalTransaction = paidCreated[0] || created[0] || null;

         // Verify if clinic has receipt enabled
         if (finalTransaction && currentClinic?.enableReceipts) {
            setReceiptTransaction(finalTransaction);
            setReceiptParts(paidCreated);
            setIsReceiptModalOpen(true);
         }

         // Cleanup only on SUCCESS
         setIsPaymentModalOpen(false);
         setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: defaultDoctorId, appointmentDate: '', discountPercent: '' });
         setManualPaymentServiceIds([]);
         setManualPaymentPrices({});
         setPaymentExtras([]);
         setVisitKey(prev => prev + 1);
      } catch (error: any) {
         console.error('Payment processing failed', error);
         alert(`${t('patients.details.alerts.paymentError')} ${error.message || t('common.error')}`);
      } finally {
         isSubmittingRef.current = false;
         setIsPaymentSubmitting(false);
      }
   };


   const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         await api.patients.sendMessage(patient.id, messageText, messageChannel);
         alert(t('patients.details.alerts.messageSent'));
         setIsMessageModalOpen(false);
         setMessageText('');
      } catch (error: any) {
         console.error('Error sending message:', error);
         if (error.message === 'Bot not configured' || error.error === 'Bot not configured') {
            setIsMessageModalOpen(false);
            alert(`⚠️ ${t('patients.details.alerts.botNotConfigured')}`);
         } else {
            alert(`${t('common.error')}: ${error.message || t('common.error')}`);
         }
      }
   };

   const handleApptSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      if (!apptData.doctorId) {
         alert(t('patients.details.alerts.selectDoctorReq'));
         return;
      }

      const doctor = doctors.find(d => d.id === apptData.doctorId);
      if (!doctor) {
         alert(t('patients.details.alerts.doctorNotFound'));
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
         alert(t('patients.details.alerts.doctorConflict'));
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
         alert(t('patients.details.alerts.patientConflict'));
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
      setApptData({ doctorId: defaultDoctorId, date: new Date().toISOString().split('T')[0], time: '09:00', type: 'Konsultatsiya', categoryId: '', duration: 60, notes: '' });
   };

   const openApptModal = (presetDate?: unknown) => {
      // Nazoratdan kelganda sana tayyor qo'yiladi; onClick dan kelganda esa
      // birinchi argument hodisa bo'ladi — uni e'tiborsiz qoldiramiz.
      const date = typeof presetDate === 'string' ? presetDate : undefined;
      const assignedDoctorId = patient?.doctorId && doctors.some(d => d.id === patient.doctorId) ? patient.doctorId : '';
      setApptData(prev => ({
         ...prev,
         ...(date ? { date } : {}),
         doctorId: defaultDoctorId || assignedDoctorId || (doctors.length > 0 ? doctors[0].id : ''),
         categoryId: categories.length > 0 ? categories[0].id : '', // Set default category
      }));
      setIsApptModalOpen(true);
   };

   const handleCompleteVisit = async (procedures: any[], total: number, nextVisit: { kind: 'checkup' | 'treatment'; days: number } | null = null) => {
      // 1. Double-check if we are already processing or have processed this exact content recently
      const today = new Date().toISOString().split('T')[0];

      // Generate a simple hash/signature for this batch of procedures
      const batchSignature = `${today}-${total}-${procedures.map(p => p.id).join(',')}`;

      if (processedBatches.has(batchSignature)) {
         console.log("Duplicate prevention: Batch already processed");
         return;
      }

      const existingAppt = appointments.find(a =>
         a.patientId === patient.id &&
         a.date === today &&
         a.status !== 'Cancelled'
      );

      // Shifokor ustuvorligi: qabulga biriktirilgan → kirgan shifokor → bemorga biriktirilgan → birinchi.
      // Aks holda admin yakunlaganda to'lov har doim ro'yxatdagi birinchi shifokorga yozilib qolardi.
      const apptDoctor = existingAppt ? doctors.find(d => d.id === existingAppt.doctorId) : undefined;
      const patientDoctor = patient.doctorId ? doctors.find(d => d.id === patient.doctorId) : undefined;
      const chosenDoctor = apptDoctor || myDoctor || patientDoctor;
      let finalDoctorId = chosenDoctor?.id || (doctors.length > 0 ? doctors[0].id : '');
      let finalDoctorName = chosenDoctor ? `Dr. ${chosenDoctor.lastName}` : (doctors.length > 0 ? `Dr. ${doctors[0].lastName}` : 'Doctor');

      // Create a text summary of procedures for the appointment notes with explicit prices
      const proceduresText = procedures.map(p => `- ${p.serviceName} (${p.toothNumber ? `Tish #${p.toothNumber}` : 'Umumiy'}) [${p.price.toLocaleString().replace(/,/g, ' ')} UZS]`).join('\n');

      try {
         // ENSURE DOCTOR EXISTS (especially for new clinics or individual plans)
         if (!finalDoctorId) {
            const isIndividualPlan = currentClinic?.planId === 'individual';
            if (isIndividualPlan) {
               try {
                  console.log("Auto-creating doctor for individual plan...");
                  const adminNameParts = currentClinic?.adminName?.split(' ') || ['Admin'];
                  const firstName = adminNameParts[0];
                  const lastName = adminNameParts.slice(1).join(' ') || 'Doctor';

                  const newDoctor = await api.doctors.create({
                     firstName,
                     lastName,
                     specialty: 'Stomatolog',
                     phone: currentClinic?.phone || '',
                     status: 'Active',
                     clinicId: currentClinic?.id || ''
                  });

                  finalDoctorId = newDoctor.id;
                  finalDoctorName = `Dr. ${newDoctor.lastName}`;
               } catch (err) {
                  console.error('Failed to auto-create doctor', err);
                  // Fallback to error if we absolutely can't create one
                  throw new Error("Shifokor profilini avtomatik yaratib bo'lmadi. Iltimos, Sozlamalar bo'limida kamida bitta shifokor yarating.");
               }
            } else if (doctors.length > 0) {
               finalDoctorId = doctors[0].id;
               finalDoctorName = `Dr. ${doctors[0].lastName}`;
            } else {
               throw new Error("Tizimda shifokor topilmadi. Iltimos, 'Sozlamalar' bo'limida kamida bitta shifokor profilini yarating.");
            }
         }

         if (!existingAppt) {
            // Create NEW Appointment
            await onAddAppointment({
               patientId: patient.id,
               patientName: `${patient.lastName} ${patient.firstName}`,
               doctorId: finalDoctorId,
               doctorName: finalDoctorName,
               type: 'Davolash',
               date: today,
               time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
               duration: 60,
               status: 'Completed',
               notes: `Bajarilgan ishlar:\n` + proceduresText,
               clinicId: patient.clinicId
            });
            alert(t('patients.details.alerts.visitSaved'));
         } else {
            // Update EXISTING Appointment
            const currentNotes = existingAppt.notes || '';

            // Deduplication check: if notes already contain this text, skip appending
            if (currentNotes.includes(proceduresText)) {
               console.log("Duplicate prevention: Procedures already in notes");
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
            alert(t('patients.details.alerts.visitUpdated'));
         }

         // Keyingi nazorat: shifokor tanlagan (yoki xizmat taklif qilgan) bo'lsa
         if (nextVisit) {
            try {
               const reason = procedures
                  .map(p => p.toothNumber ? `${p.serviceName} #${p.toothNumber}` : p.serviceName)
                  .join(', ')
                  .slice(0, 200);
               const created = await api.recalls.create({
                  patientId: patient.id,
                  clinicId: patient.clinicId,
                  doctorId: finalDoctorId || null,
                  dueDate: addDaysStr(nextVisit.days),
                  reason,
                  kind: nextVisit.kind,
               });
               setRecalls(prev => [created, ...prev.filter(r => r.id !== created.id)]);
            } catch (err) {
               console.error('Nazoratni saqlab bo\'lmadi:', err);
            }
         }

         // 2. Cleanup only on SUCCESS
         setProcessedBatches(prev => {
            const newSet = new Set(prev);
            newSet.add(batchSignature);
            return newSet;
         });
         setPendingProcedures([]);
         setVisitKey(prev => prev + 1);

         // 3. Qabul yakunlangach — darhol to'lov oynasini oldindan to'ldirib ochamiz.
         // To'lov qabul qilish ruxsati bo'lmasa qabul "Olinmagan pul"da kassirni kutadi.
         if (total > 0 && canPayCreate) {
            const breakdown = procedures.map(p => `${p.serviceName}|${p.price}`).join('||') + `||TOTAL|${total}`;
            setDiscountType('percent');
            // Oldingi qo'lda tanlov qolib ketsa, oyna tayyor ro'yxat o'rniga tanlash maydonini ko'rsatardi
            setManualPaymentServiceIds([]);
            setManualPaymentPrices({});
            setPaymentData({
               amount: total.toString(),
               paidAmount: total.toString(),
               debtAmount: '0',
               service: breakdown,
               type: 'Cash',
               status: 'Paid',
               doctorId: finalDoctorId,
               appointmentDate: today,
               discountPercent: ''
            });
            setPaymentExtras([]);
            setPaymentDateEditable(false);
            setIsPaymentModalOpen(true);
         }
      } catch (error: any) {
         console.error('Visit completion failed', error);
         // Error toast is already shown by App.tsx, but we can add more specific alert here if needed
         alert(`Xatolik: ${error.message || 'Tashrifni yakunlashda xato yuz berdi. Iltimos qaytadan urunib ko\'ring.'}`);
      }
   };


   return (
      <>
         <div className="space-y-2 animate-fade-in pb-10 print:hidden">
            {/* Yuqori qator: orqaga (bemorlar ro'yxati) + bemor ismi */}
            <div className="flex items-center gap-2 text-sm">
               <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
               >
                  <ArrowLeft className="w-4 h-4" /> {t('patients.details.backToList')}
               </button>
               <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
               <span className="font-medium text-gray-900 dark:text-white truncate">{patient.firstName} {patient.lastName}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
            {/* Chap panel: bemor haqida umumiy ma'lumot. Kompyuterda scroll paytida joyida turadi */}
            <aside className="lg:sticky lg:top-32">
               <Card className="p-5">
                  {/* Kim: avatar, ism, yosh, holat. Anamnez bo'lsa — kichik belgi, matni Umumiy tabda */}
                  <div className="flex items-center gap-4">
                     <div className="relative group flex-shrink-0">
                        <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900 ring-4 ring-primary-50 dark:ring-primary-900/40 overflow-hidden flex items-center justify-center text-xl font-bold">
                           {patient.avatarUrl ? (
                              <img src={patient.avatarUrl} alt={patient.firstName} className="w-full h-full object-cover" />
                           ) : (
                              <span className="text-primary-600 dark:text-primary-200">{patient.firstName?.[0]}{patient.lastName?.[0]}</span>
                           )}
                        </div>
                        {canEditCard && <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                           <Edit className="w-5 h-5" />
                           <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if (file) handleImageUpload('avatar', file);
                              }}
                           />
                        </label>}
                     </div>
                     <div className="min-w-0 space-y-1">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight break-words">{patient.firstName} {patient.lastName}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                           {patient.gender === 'Male' ? t('patients.modal.male') : t('patients.modal.female')}
                           {patientAge !== null && patientAge !== undefined && <> · {patientAge} {t('patients.details.age')}</>}
                           {patient.dob && <span className="text-gray-400"> ({formatDobDDMMYYYY(patient.dob)})</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                           <Badge status={patient.status} />
                           {healthAlerts.length > 0 && (
                              <button
                                 type="button"
                                 onClick={() => setActiveTab('overview')}
                                 title={healthAlerts.join(', ')}
                                 className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              >
                                 <AlertTriangle className="w-3 h-3" /> {t('patients.details.anamnesisChip')}
                              </button>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Raqamlar: qutisiz, qator-qator */}
                  <dl className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-1.5 text-sm">
                     <div className="flex items-center justify-between gap-3">
                        <dt className="text-gray-500 dark:text-gray-400">{balanceLabel}</dt>
                        <dd className={`font-bold tabular-nums ${balanceText}`}>{Math.abs(patientBalance).toLocaleString()} UZS</dd>
                     </div>
                     <div className="flex items-center justify-between gap-3">
                        <dt className="text-gray-500 dark:text-gray-400">{t('patients.details.stats.lastVisit')}</dt>
                        <dd className="text-gray-900 dark:text-white tabular-nums">{lastVisitLabel}</dd>
                     </div>
                     {nextAppointment && (
                        <div className="flex items-center justify-between gap-3">
                           <dt className="text-gray-500 dark:text-gray-400">{t('patients.details.stats.nextAppointment')}</dt>
                           <dd>
                              <button type="button" onClick={() => setActiveTab('appointments')} className="font-semibold tabular-nums text-primary-600 hover:underline dark:text-primary-400">
                                 {formatDobDDMMYYYY(nextAppointment.date)} · {nextAppointment.time}
                              </button>
                           </dd>
                        </div>
                     )}
                     {activeRecall && (
                        <div className="flex items-start justify-between gap-3">
                           <dt className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                              <CalendarClock className="w-3.5 h-3.5" /> {t('patients.details.recall.title')}
                           </dt>
                           <dd className="text-right">
                              <span className="font-semibold tabular-nums text-sky-700 dark:text-sky-300" title={activeRecall.reason || undefined}>
                                 {formatDobDDMMYYYY(activeRecall.dueDate)}
                              </span>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{activeRecall.kind === 'treatment' ? t('patients.details.recall.kindTreatment') : t('patients.details.recall.kindCheckup')}</span>
                              {activeRecall.status !== 'booked' && (
                                 <span className="block text-xs">
                                    {canBook && <><button type="button" onClick={() => openApptModal(activeRecall.dueDate)} className="text-sky-700 hover:underline dark:text-sky-300">{t('patients.details.recall.book')}</button>
                                    <span className="mx-1 text-gray-300">·</span></>}
                                    <button type="button" onClick={() => cancelRecall(activeRecall.id)} className="text-gray-500 hover:text-red-600">{t('patients.details.recall.cancel')}</button>
                                 </span>
                              )}
                           </dd>
                        </div>
                     )}
                  </dl>

                  {/* Kontaktlar */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                     <a
                        href={showPatientPhone ? `tel:${patient.phone}` : undefined}
                        className="flex items-center gap-2.5 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400"
                     >
                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" /> <span className="tabular-nums">{showPatientPhone ? patient.phone : maskPhone(patient.phone)}</span>
                     </a>
                     {patient.secondaryPhone && (
                        <a
                           href={showPatientPhone ? `tel:${patient.secondaryPhone}` : undefined}
                           className="flex items-center gap-2.5 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400"
                        >
                           <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                           <span className="tabular-nums">{showPatientPhone ? patient.secondaryPhone : maskPhone(patient.secondaryPhone)}</span>
                           <span className="text-xs text-gray-400">{t('patients.details.secondaryPhone')}</span>
                        </a>
                     )}
                     <div className={`flex items-start gap-2.5 ${patient.address ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /> <span className="break-words">{patient.address || t('patients.details.noAddress')}</span>
                     </div>
                     <div className={`flex items-center gap-2.5 ${patient.doctorName ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>
                        <UserCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{patient.doctorName || t('patients.details.noDoctor')}</span>
                     </div>
                  </div>

                  {/* Amallar: bitta asosiy tugma + ikonkalar qatori (nomi hover da) */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                     {canBook && (
                        <Button className="w-full" onClick={() => openApptModal()}>
                           <CalendarPlus className="w-4 h-4 mr-2" /> {t('patients.details.newAppointment')}
                        </Button>
                     )}
                     <div className="mt-2 flex gap-1 [&>button]:flex-1">
                        {[
                           ...(canEditCard ? [{ icon: Edit, label: t('patients.details.editProfile'), onClick: handleEditOpen }] : []),
                           { icon: CalendarClock, label: t('patients.details.recall.schedule'), onClick: openRecallModal },
                           ...(canMessage ? [{ icon: Send, label: t('patients.details.sendMessage'), onClick: () => { setMessageType('Custom'); setMessageText(''); setIsMessageModalOpen(true); } }] : []),
                           ...(canEditCard ? [{ icon: UserPlus, label: patient.doctorId ? t('patients.details.changeDoctor') : t('patients.details.assignDoctor'), onClick: () => setIsAssignDoctorModalOpen(true) }] : []),
                           {
                              icon: Printer, label: t('patients.details.printCard'), onClick: () => printPatientCard({
                                 patient,
                                 clinic: currentClinic,
                                 doctor: doctors.find(d => d.id === patient.doctorId) || myDoctor || doctors[0],
                                 teeth: teethData,
                                 diagnoses,
                                 procedures: allProceduresHistory,
                              })
                           },
                        ].map(action => (
                           <button
                              key={action.label}
                              type="button"
                              onClick={action.onClick}
                              title={action.label}
                              aria-label={action.label}
                              className="flex items-center justify-center rounded-lg py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-white transition-colors"
                           >
                              <action.icon className="w-4 h-4" />
                           </button>
                        ))}
                     </div>
                  </div>
               </Card>
            </aside>

            {/* O'ng tomon: tablar va ularning mazmuni */}
            <div className="min-w-0 space-y-6">
            <div className="border-b border-gray-200 dark:border-gray-700">
               <nav className="-mb-px flex gap-6 overflow-x-auto">
                  {[
                     { id: 'overview', label: t('patients.details.tabs.overview'), icon: User },
                     { id: 'chart', label: t('patients.details.tabs.chart'), icon: Activity },
                     { id: 'photos', label: t('patients.details.tabs.photos'), icon: FileText },
                     { id: 'appointments', label: t('patients.details.tabs.appointments'), icon: Calendar },
                     { id: 'payments', label: t('patients.details.tabs.payments'), icon: CreditCard },
                     { id: 'installments', label: t('patients.details.tabs.installments'), icon: Clock },
                     { id: 'materials', label: t('patients.details.tabs.materials'), icon: Package },
                  ].filter(tab => tabAllowed(tab.id)).map(tab => (
                     <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`group inline-flex items-center pt-0 pb-2.5 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === tab.id
                           ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                           : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                     >
                        <tab.icon className={`-ml-0.5 mr-2 h-4 w-4 ${activeTab === tab.id ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                        {tab.label}
                     </button>
                  ))}
               </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">

               {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                     <VisitWorkflow
                        key={visitKey}
                        services={services}
                        categories={categories}
                        doctors={doctors}
                        initialProcedures={pendingProcedures}
                        onProceduresChange={setPendingProcedures}
                        onCompleteVisit={handleCompleteVisit}
                     />

                     {/* Kasallik tarixi: oddiy matn maydoni. Tayyor ro'yxat (14 ta chip)
                         faqat so'ralganda ochiladi — birinchi ko'rgan odamni cho'chitmasin. */}
                     {canViewHistory && <Card className="p-6 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                           <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                              <Activity className="w-5 h-5" /> {t('patients.details.medicalHistory.title')}
                           </h3>
                           {canEditHistory && (
                              <Button
                                 size="sm"
                                 variant="secondary"
                                 className="h-8 text-xs"
                                 onClick={() => {
                                    onUpdatePatient(patient.id, { medicalHistory: historyText });
                                    alert(t('common.save'));
                                 }}
                              >
                                 {t('common.save')}
                              </Button>
                           )}
                        </div>
                        <textarea
                           className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary-300 outline-none resize-y"
                           rows={5}
                           value={historyText}
                           readOnly={!canEditHistory}
                           onChange={(e) => setHistoryText(e.target.value)}
                           placeholder={t('patients.details.medicalHistory.placeholder')}
                        />
                        {canEditHistory && <button
                           type="button"
                           onClick={() => setShowQuickSelect(v => !v)}
                           className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                        >
                           {t('patients.details.medicalHistory.pickFromList')}
                           <ChevronRight className={`w-4 h-4 transition-transform ${showQuickSelect ? 'rotate-90' : ''}`} />
                        </button>}
                        {canEditHistory && showQuickSelect && (
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
                                    type="button"
                                    onClick={() => {
                                       if (!historyText.includes(disease)) {
                                          const newHistory = historyText ? historyText + '\n' + disease : disease;
                                          setHistoryText(newHistory);
                                          onUpdatePatient(patient.id, { medicalHistory: newHistory });
                                       } else {
                                          alert(t('patients.details.medicalHistory.alreadyAdded'));
                                       }
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50 rounded-full transition-colors border border-primary-100 dark:border-primary-800"
                                 >
                                    {disease}
                                 </button>
                              ))}
                           </div>
                        )}
                     </Card>}
                  </div>
               )}


               {/* Dental Chart Tab */}
               {activeTab === 'chart' && canViewChart && (
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('patients.details.chart.title')}</h3>
                        <div className="flex gap-2">
                           <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> {t('patients.details.chart.print')}</Button>
                        </div>
                     </div>
                     <TeethChart
                        initialData={teethData}
                        readOnly={!canEditChart}
                        onSave={canEditChart ? handleSaveTeeth : undefined}
                        procedures={allProceduresHistory}
                     />
                  </div>
               )}

               {/* Photos Tab */}
               {activeTab === 'photos' && canViewPhotos && (
                  <PatientPhotos
                     patientId={patient.id}
                     clinicId={patient.clinicId}
                     token={token}
                     canUpload={perms.can('patients', 'photos', 'create')}
                     canDelete={perms.can('patients', 'photos', 'delete')}
                  />
               )}

               {/* Appointments Tab */}
               {activeTab === 'appointments' && (
                  <div className="space-y-6">
                     {/* Upcoming Appointments Section */}
                     <Card className="p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('patients.details.appointments.upcoming')}</h3>
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
                                 <div key={app.id} className="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg hover:shadow-md transition-all">
                                    <div className="flex items-center gap-4">
                                       <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold">
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
                                    {t('auto.Kutilayotgan qabullar yo\'q')}
                                 </div>
                              )}
                        </div>
                     </Card>

                     {/* Appointments History */}
                     <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                           <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('patients.details.appointments.history')}</h3>
                           {canBook && <Button size="sm" onClick={openApptModal}>{t('patients.details.appointments.new')}</Button>}
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.date')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.procedure')}</th>
                                    <th className="p-4 font-medium text-gray-500 w-1/3">{t('patients.details.appointments.table.worksDone')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.doctor')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.status')}</th>
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
                        </div>
                        {patientAppointments.length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.appointments.historyEmpty')}</div>}
                     </Card>
                  </div>
               )}

               {/* Payments Tab */}
               {activeTab === 'payments' && canViewPayments && (
                  <div className="space-y-6">
                     {/* Pending Payments Section */}
                     <Card className="overflow-hidden border-yellow-200 dark:border-yellow-800">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-800 flex justify-between items-center">
                           <div>
                              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-600" /> {t('patients.details.payments.pendingTitle')}</h3>
                              <p className="text-sm text-gray-500">{t('patients.details.payments.pendingDesc')}</p>
                           </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.date')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.procedure')}</th>
                                    <th className="p-4 font-medium text-gray-500 w-1/3">{t('patients.details.appointments.table.worksDone')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.status')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('common.actions')}</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {patientAppointments.filter(app => {
                                    if (!app || !app.date) return false;
                                    const isPaid = (patientTransactions || []).some(t => t && t.date === app.date && (t.status === 'Paid' || t.status === 'paid'));
                                    return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid;
                                 }).map(app => {
                                    const doctor = (doctors || []).find(d => d && d.id === app.doctorId);
                                    return (
                                       <tr key={app.id} className="hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10 transition-colors">
                                          <td className="p-4 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                                             {app.date ? new Date(app.date).toLocaleDateString('uz-UZ') : 'N/A'} <br />
                                             <span className="text-xs text-gray-500 font-normal">{app.time}</span>
                                          </td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300 min-w-[200px]"><div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 whitespace-pre-line">{app.notes || '-'}</div></td>
                                          <td className="p-4"><Badge status="Pending" /></td>
                                          <td className="p-4 flex gap-2 flex-wrap">
                                             {canPayCreate && (<>
                                             <Button size="sm" onClick={() => {
                                                const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                                                setDiscountType('percent');
                                                setPaymentData({
                                                   amount: total.toString(),
                                                   paidAmount: total.toString(),
                                                   debtAmount: '0',
                                                   service: breakdown || app.type,
                                                   type: 'Cash',
                                                   status: 'Paid',
                                                   doctorId: app.doctorId,
                                                   appointmentDate: app.date,
                                                   discountPercent: ''
                                                });
                                                setPaymentExtras([]);
                                                setPaymentDateEditable(false);
                                                setIsPaymentModalOpen(true);
                                             }}>{t('auto.To\'lov')}</Button>
                                             <Button size="sm" variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800" onClick={() => {
                                                const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                                                setInstallmentQuickOpen({ service: breakdown || app.type, amount: total, doctorId: app.doctorId });
                                                setActiveTab('installments');
                                             }}>{t('auto.Bo\'lib to\'lash')}</Button>
                                             {(patient.balance || 0) > 0 && (
                                                <Button size="sm" variant="secondary" className="bg-primary-50 text-primary-700 border-primary-100" onClick={async () => {
                                                   const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                                                   if (confirm(`Ushbu qabul uchun ${total.toLocaleString()} UZS miqdorini bemor avansidan yechishga ruxsatingiz bormi?`)) {
                                                      const doctor = doctors.find(d => d.id === app.doctorId);
                                                      await onAddTransaction({
                                                         patientId: patient.id,
                                                         patientName: `${patient.lastName} ${patient.firstName}`,
                                                         date: app.date,
                                                         amount: total,
                                                         service: breakdown || app.type,
                                                         type: 'Balance' as any,
                                                         status: 'Paid',
                                                         doctorId: app.doctorId,
                                                         doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : '',
                                                         clinicId: patient.clinicId
                                                      });
                                                      alert("To'lov avans hisobidan muvaffaqiyatli amalga oshirildi!");
                                                   }
                                                }}>{t('auto.Hisobdan')}</Button>
                                             )}
                                             </>)}
                                             {canWaive && (
                                                <Button size="sm" variant="secondary" title={t('waive.hint')} onClick={() => setWaivingAppointment(app)}>
                                                   <Gift className="w-4 h-4 mr-1" /> {t('waive.action')}
                                                </Button>
                                             )}
                                          </td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                        </div>
                        {patientAppointments.filter(app => { const isPaid = (patientTransactions || []).some(trans => trans && trans.date === app.date && trans.status === 'Paid'); return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid; }).length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.payments.pendingEmpty')}</div>}
                     </Card>
                     {/* Transaction History Section */}
                     <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                           <div><h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('patients.details.payments.historyTitle')}</h3><p className="text-sm text-gray-500">{t('patients.details.payments.historyDesc')}</p></div>
                           <div className="flex items-center gap-6">
                              <div className="text-right">
                                 <p className="text-sm text-gray-500">{t('patients.details.payments.totalPaid')}</p>
                                 <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {(patientTransactions || [])
                                       .filter(transaction => transaction && transaction.status === 'Paid' && transaction.type !== 'Balance')
                                       .reduce((acc, transaction) => acc + (Number(transaction.amount) || 0), 0)
                                       .toLocaleString()} UZS
                                 </p>
                              </div>
                              <div className="text-right">
                                 <p className="text-sm text-gray-500">{t('patients.details.balance')}</p>
                                 <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
                                    {(patient.balance || 0).toLocaleString()} UZS
                                 </p>
                              </div>
                              <div className="flex gap-2">
                                 {canPayCreate && (<>
                                 <Button 
                                    size="sm" 
                                    variant="secondary"
                                    className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                    onClick={() => {
                                       setPaymentData({
                                          amount: '',
                                          paidAmount: '',
                                          debtAmount: '0',
                                          service: 'Avans',
                                          type: 'Cash',
                                          status: 'Paid',
                                          doctorId: doctors.length > 0 ? doctors[0].id : '',
                                          appointmentDate: formatDateToISO(new Date()),
                                          discountPercent: ''
                                       });
                                       setPaymentExtras([]);
                                       setPaymentDateEditable(true);
                                       setIsPaymentModalOpen(true);
                                    }}
                                 >
                                    <Plus className="w-4 h-4 mr-2" /> {t('patients.details.modals.advanceTitle')}
                                 </Button>
                                 <Button size="sm" onClick={handlePaymentModalOpen}>{t('patients.details.payments.newPayment')}</Button>
                                 </>)}
                              </div>
                           </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr><th className="p-4 font-medium text-gray-500">{t('finance.table.date')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.service')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.method')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.amount')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.discount')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.status')}</th><th className="p-4 font-medium text-gray-500">{t('common.actions')}</th></tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {(patientTransactions || []).map(transaction => (
                                    <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                       <td className="p-4 text-gray-900 dark:text-white">{transaction.date || 'N/A'}</td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">{transaction.service}</td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">{tLabel(t, getPaymentMethodLabel(transaction.type))}</td>
                                       <td className="p-4 text-gray-900 dark:text-white font-medium">{(Number(transaction.amount) || 0).toLocaleString()} UZS</td>
                                       <td className="p-4">
                                          {transaction.discountPercent ? (
                                             <div className="flex flex-col">
                                                <span className="text-xs text-orange-600 dark:text-orange-400 font-bold">-{transaction.discountPercent}%</span>
                                                {transaction.discountAmount ? <span className="text-[10px] text-gray-500">({(Number(transaction.discountAmount) || 0).toLocaleString()} UZS)</span> : null}
                                             </div>
                                          ) : (
                                             <span className="text-gray-400">-</span>
                                          )}
                                       </td>
                                       <td className="p-4"><Badge status={transaction.status} /></td>
                                       <td className="p-4 flex gap-2">
                                          {canPayCreate && transaction.status === 'Pending' && (
                                             <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                                                setEditingTransaction(transaction);
                                                setEditPaymentAmount(transaction.amount.toString());
                                                setEditPaymentStatus('Paid');
                                                setEditPaymentMethod('Cash');
                                                setIsPaymentEditModalOpen(true);
                                             }}>{t('patients.details.payments.payAction')}</Button>
                                          )}
                                          {canPayEdit && (
                                             <Button size="sm" variant="secondary" onClick={() => {
                                                setEditingTransaction(transaction);
                                                setEditPaymentAmount(transaction.amount.toString());
                                                setEditPaymentStatus(transaction.status);
                                                setEditPaymentMethod(transaction.type);
                                                setIsPaymentEditModalOpen(true);
                                             }}><Edit className="w-4 h-4" /></Button>
                                          )}
                                          {canPayDelete && onDeleteTransaction && (
                                             <Button size="sm" variant="secondary" title={t('payment.delete')} className="hover:text-red-600" onClick={async () => {
                                                const msg = t('payment.deleteConfirm')
                                                   .replace('{service}', transaction.service || '—')
                                                   .replace('{amount}', (Number(transaction.amount) || 0).toLocaleString());
                                                if (!window.confirm(msg)) return;
                                                try { await onDeleteTransaction(transaction.id); } catch { /* xatolik toast orqali */ }
                                             }}><Trash2 className="w-4 h-4" /></Button>
                                          )}
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {patientTransactions.length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.payments.historyEmpty')}</div>}
                     </Card>
                  </div>
               )}
               {activeTab === 'installments' && canViewPayments && patient && currentClinic && (
                  <InstallmentsTab 
                     patientId={patient.id} 
                     clinicId={currentClinic.id} 
                     canCreate={canPayCreate}
                     canDelete={canPayDelete}
                     doctors={doctors}
                     services={services}
                     initialCreateData={installmentQuickOpen || undefined}
                     onInitialDataConsumed={() => setInstallmentQuickOpen(null)}
                  />
               )}
               
               {activeTab === 'materials' && (
                  <Card className="overflow-hidden">
                     <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 dark:text-white">{t('patients.details.materials.title')}</h3>
                        <Button size="sm" onClick={() => setIsMaterialModalOpen(true)}>{t('patients.details.materials.useBtn')}</Button>
                     </div>
                     <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.date')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.material')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.quantity')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.note')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.user')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('common.actions')}</th>
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
                                    <td className="p-4">
                                       <button
                                          onClick={async () => {
                                             if (!confirm("Ushbu material yozuvini o'chirmoqchimisiz?")) return;
                                             try {
                                                await api.inventory.deleteLog(log.id);
                                                setMaterialLogs(prev => prev.filter(l => l.id !== log.id));
                                                // Refresh inventory items to restore stock
                                                if (currentClinic) {
                                                   const updatedItems = await api.inventory.getAll(currentClinic.id);
                                                   setInventoryItems(updatedItems);
                                                }
                                             } catch (e) {
                                                alert(t('patients.details.alerts.error'));
                                             }
                                          }}
                                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                          title={t('auto.O\'chirish')}
                                       >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                       </button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                     {materialLogs.length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.materials.empty')}</div>}
                  </Card>
               )}
            </div>
            </div>
            </div>

            {/* Nazoratga chaqirish */}
            <Modal isOpen={isRecallModalOpen} onClose={() => setIsRecallModalOpen(false)} title={t('patients.details.recall.modalTitle')}>
               <div className="space-y-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('patients.details.recall.treatment')}</label>
                     <div className="flex flex-wrap gap-2">
                        {[{ days: 3, label: `3 ${t('patients.details.recall.days')}` }, { days: 7, label: `1 ${t('patients.details.recall.week')}` }, { days: 14, label: `2 ${t('patients.details.recall.week')}` }].map(o => (
                           <button
                              key={o.days}
                              type="button"
                              onClick={() => setRecallForm(f => ({ ...f, kind: 'treatment', dueDate: addDaysStr(o.days) }))}
                              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${recallForm.kind === 'treatment' && recallForm.dueDate === addDaysStr(o.days)
                                 ? 'bg-primary-600 text-white'
                                 : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                           >
                              {o.label}
                           </button>
                        ))}
                     </div>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('patients.details.recall.checkup')}</label>
                     <div className="flex flex-wrap gap-2">
                        {[1, 3, 6, 12].map(m => (
                           <button
                              key={m}
                              type="button"
                              onClick={() => setRecallForm(f => ({ ...f, kind: 'checkup', dueDate: addMonthsStr(m) }))}
                              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${recallForm.kind === 'checkup' && recallForm.dueDate === addMonthsStr(m)
                                 ? 'bg-primary-600 text-white'
                                 : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                           >
                              {m} {t('patients.details.recall.months')}
                           </button>
                        ))}
                     </div>
                  </div>
                  <Input label={t('patients.details.recall.date')} type="date" value={recallForm.dueDate} onChange={e => setRecallForm(f => ({ ...f, dueDate: e.target.value }))} />
                  <Input label={t('patients.details.recall.reason')} value={recallForm.reason} onChange={e => setRecallForm(f => ({ ...f, reason: e.target.value }))} placeholder={t('patients.details.recall.reasonPlaceholder')} />
                  <div className="flex justify-end gap-2 pt-2">
                     <Button variant="secondary" onClick={() => setIsRecallModalOpen(false)} disabled={recallSaving}>{t('common.cancel')}</Button>
                     <Button onClick={saveRecall} disabled={recallSaving || !recallForm.dueDate}>{recallSaving ? '...' : t('common.save')}</Button>
                  </div>
               </div>
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={t('patients.details.modals.editProfile')}>
               <form onSubmit={handleEditSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('patients.modal.firstName')} value={editFormData.firstName || ''} onChange={e => setEditFormData({ ...editFormData, firstName: e.target.value })} />
                     <Input label={t('patients.modal.lastName')} value={editFormData.lastName || ''} onChange={e => setEditFormData({ ...editFormData, lastName: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('patients.modal.phone')} value={editFormData.phone || ''} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} required />
                     <Input label={t('patients.modal.secondaryPhone')} value={editFormData.secondaryPhone || ''} onChange={(e) => setEditFormData({ ...editFormData, secondaryPhone: e.target.value })} />
                  </div>
                  <Input label={t('patients.modal.address')} value={editFormData.address || ''} onChange={e => setEditFormData({ ...editFormData, address: e.target.value })} placeholder={t('auto.Bemor manzilini kiriting...')} />
                  <RegionDistrictSelect regionCode={editFormData.regionCode} districtCode={editFormData.districtCode} onChange={v => setEditFormData({ ...editFormData, ...v })} />
                  <div className="grid grid-cols-2 gap-4">
                     <Input label="JSHSHIR (PINFL)" value={editFormData.pinfl || ''} maxLength={14} placeholder="14 raqam" onChange={e => setEditFormData({ ...editFormData, pinfl: e.target.value })} />
                     <Input label={t('patients.modal.passport')} value={editFormData.passport || ''} placeholder={t('auto.AA1234567')} onChange={e => setEditFormData({ ...editFormData, passport: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>{t('common.cancel')}</Button>
                     <Button type="submit">{t('common.save')}</Button>
                  </div>
               </form>
            </Modal>


            {/* Material Usage Modal */}
            <Modal isOpen={isMaterialModalOpen} onClose={() => setIsMaterialModalOpen(false)} title={t('patients.details.modals.useMaterialTitle')}>
               <form onSubmit={handleMaterialSubmit} className="space-y-4">
                  <Select
                     label={t('patients.details.materials.table.material')}
                     value={materialData.itemId}
                     onChange={e => setMaterialData({ ...materialData, itemId: e.target.value })}
                     options={[
                        { value: '', label: t('patients.details.modals.selectMaterial') },
                        ...inventoryItems.map(item => ({
                           value: item.id,
                           label: `${item.name} (${item.quantity} ${item.unit} ${t('patients.details.modals.available')})`
                        }))
                     ]}
                     required
                  />
                  <Input
                     label={t('patients.details.materials.table.quantity')}
                     type="number"
                     value={materialData.quantity}
                     onChange={e => setMaterialData({ ...materialData, quantity: e.target.value })}
                     placeholder="0"
                     required
                  />
                  <Input
                     label={t('patients.details.materials.table.note')}
                     value={materialData.note}
                     onChange={e => setMaterialData({ ...materialData, note: e.target.value })}
                     placeholder={t('auto.Qo\'shimcha izoh...')}
                  />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsMaterialModalOpen(false)}>{t('auto.Bekor qilish')}</Button>
                     <Button type="submit">{t('auto.Saqlash')}</Button>
                  </div>
               </form>
            </Modal>

            {/* Payment Modal */}
            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentData.service === 'Avans' ? t('patients.details.modals.advanceTitle') : t('patients.details.modals.paymentTitle')}>
               <form onSubmit={handlePaymentSave} className="space-y-4">
                  {/* Only show doctor field for non-individual plans OR individual plans with doctors - AND NOT for Avans */}
                  {paymentData.service !== 'Avans' && !(currentClinic?.planId === 'individual' && doctors.length === 0) && (
                     <Select
                        label={t('finance.table.doctor')}
                        value={paymentData.doctorId}
                        onChange={e => setPaymentData({ ...paymentData, doctorId: e.target.value })}
                        options={[
                           { value: '', label: t('auto.Shifokorni tanlang') },
                           ...doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))
                        ]}
                        required
                     />
                  )}
                  {paymentData.service !== 'Avans' && (
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📋 {t('patients.details.modals.doneServices')}</label>
                        <div className="border-2 border-primary-100 dark:border-primary-800 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 p-4 space-y-0.5">
                           {/* Tayyor ro'yxat faqat qabuldan kelganda. Qo'lda bir nechta xizmat
                               tanlanganda ham matnda "|" bo'ladi — u holda tanlash maydoni qoladi. */}
                           {paymentData.service && paymentData.service.includes('|') && manualPaymentServiceIds.length === 0 ? (
                              paymentData.service.split('||').filter(Boolean).map((item, idx) => {
                                 const parts = item.split('|');
                                 if (parts[0] === 'TOTAL') {
                                    return (
                                       <div key={idx} className="pt-3 mt-3 border-t-2 border-primary-300 dark:border-primary-700">
                                          <div className="flex justify-between items-center bg-primary-600 dark:bg-primary-700 text-white px-4 py-2.5 rounded-md font-bold text-base">
                                             <span className="flex items-center gap-2">💰 {t('auto.JAMI')}:</span>
                                             <span className="text-lg">{parts[1]} UZS</span>
                                          </div>
                                       </div>
                                    );
                                 }
                                 return (
                                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-gray-800 px-3 py-2 rounded border border-primary-100 dark:border-gray-700">
                                       <span className="text-gray-700 dark:text-gray-200 font-medium">{parts[0]}</span>
                                       <span className="text-primary-600 dark:text-primary-400 font-semibold">{parts[1]} UZS</span>
                                    </div>
                                 );
                              })
                           ) : (
                              <div className="space-y-4">
                                 {categories && categories.length > 0 && (
                                    <Select
                                       label={t('auto.Kategoriya')}
                                       value={manualPaymentCategoryId}
                                       onChange={(e) => setManualPaymentCategoryId(e.target.value)}
                                    >
                                       <option value="">{t('auto.Barcha kategoriyalar')}</option>
                                       {categories.map(cat => (
                                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                                       ))}
                                    </Select>
                                 )}

                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                       {t('auto.Xizmat')}{manualPaymentServiceIds.length > 0 && <span className="ml-1 text-primary-600">({manualPaymentServiceIds.length})</span>}
                                    </label>
                                    <button
                                       type="button"
                                       onClick={() => setPaymentServicesOpen(v => !v)}
                                       className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-200 hover:border-primary-400 transition-colors"
                                    >
                                       <span className="truncate text-left">
                                          {manualPaymentServiceIds.length === 0
                                             ? t('auto.Xizmatni tanlang...')
                                             : t('auto.{n} ta tanlandi').replace('{n}', String(manualPaymentServiceIds.length))}
                                       </span>
                                       <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${paymentServicesOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Yopiq holatda ham tanlangan xizmatlar va narxlari ko'rinadi */}
                                    {!paymentServicesOpen && manualPaymentServiceIds.length > 0 && (
                                       <div className="mt-2 space-y-1.5">
                                          {(services || []).filter(sv => manualPaymentServiceIds.includes(sv.id)).map(service => (
                                             <div key={service.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-primary-100 dark:border-primary-800/50">
                                                <span className="flex-1 min-w-0 truncate text-sm text-gray-900 dark:text-white">{service.name}</span>
                                                <input
                                                   type="number"
                                                   value={manualPaymentPrices[service.id] ?? ''}
                                                   onChange={(e) => changeManualServicePrice(service.id, e.target.value)}
                                                   aria-label={`${t('auto.Narx')}: ${service.name}`}
                                                   className="w-28 h-8 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                                                />
                                                <button type="button" onClick={() => toggleManualService(service.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                                                   <X className="w-4 h-4" />
                                                </button>
                                             </div>
                                          ))}
                                       </div>
                                    )}

                                    {paymentServicesOpen && (
                                       <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                                       {(services || [])
                                          .filter(s => {
                                             if (!manualPaymentCategoryId) return true;
                                             const serviceCatId = (s as any).categoryId?.toString();
                                             return serviceCatId === manualPaymentCategoryId.toString();
                                          })
                                          .map(service => {
                                             const checked = manualPaymentServiceIds.includes(service.id);
                                             return (
                                                <div key={service.id} className={`flex items-center gap-3 px-3 py-2 ${checked ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''}`}>
                                                   <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                                      <input
                                                         type="checkbox"
                                                         checked={checked}
                                                         onChange={() => toggleManualService(service.id)}
                                                         className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                      />
                                                      <span className="text-sm text-gray-900 dark:text-white truncate">{service.name}</span>
                                                   </label>
                                                   {checked ? (
                                                      <input
                                                         type="number"
                                                         value={manualPaymentPrices[service.id] ?? ''}
                                                         onChange={(e) => changeManualServicePrice(service.id, e.target.value)}
                                                         aria-label={`${t('auto.Narx')}: ${service.name}`}
                                                         className="w-28 h-8 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                                      />
                                                   ) : (
                                                      <span className="text-xs text-gray-500 whitespace-nowrap">{service.price.toLocaleString()} UZS</span>
                                                   )}
                                                </div>
                                             );
                                          })}
                                    </div>
                                    )}
                                    {manualPaymentServiceIds.length > 1 && (
                                       <p className="mt-2 text-sm text-right text-gray-600 dark:text-gray-300">
                                          {t('auto.Jami')}: <strong className="text-primary-600 dark:text-primary-400">{(Number(paymentData.amount) || 0).toLocaleString()} UZS</strong>
                                       </p>
                                    )}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                  )}
                  {paymentData.service !== 'Avans' && maxDiscount > 0 && (
                     <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                           {t('auto.Chegirma')}
                           {maxDiscount < 100 && <span className="ml-1 font-normal text-gray-400">({t('payment.discountLimit').replace('{n}', String(maxDiscount))})</span>}
                        </label>
                        <div className="flex gap-2">
                           {/* Discount type selector */}
                           <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                              <button
                                 type="button"
                                 className={`px-3 py-2 text-sm font-medium transition-colors ${
                                    discountType === 'percent'
                                       ? 'bg-primary-600 text-white'
                                       : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                 }`}
                                 onClick={() => {
                                    setDiscountType('percent');
                                    setPaymentData({ ...paymentData, discountPercent: '' });
                                 }}
                              >{t('auto.Foiz (%)')}</button>
                              <button
                                 type="button"
                                 className={`px-3 py-2 text-sm font-medium transition-colors ${
                                    discountType === 'amount'
                                       ? 'bg-primary-600 text-white'
                                       : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                 }`}
                                 onClick={() => {
                                    setDiscountType('amount');
                                    setPaymentData({ ...paymentData, discountPercent: '' });
                                 }}
                              >{t('auto.Summa')}</button>
                           </div>
                           {/* Discount input */}
                           <div className="flex-1">
                              <Input
                                 label=""
                                 type="number"
                                 min="0"
                                 max={discountType === 'percent' ? Math.min(100, maxDiscount) : undefined}
                                 value={paymentData.discountPercent}
                                 onChange={e => {
                                    const val = Number(e.target.value);
                                    const baseTotal = Number(paymentData.amount) || 0;
                                    if (discountType === 'percent') {
                                       if (val < 0 || val > Math.min(100, maxDiscount)) return;
                                       const discountedTotal = baseTotal > 0 ? Math.round(baseTotal * (1 - val / 100)) : 0;
                                       setPaymentData({
                                          ...paymentData,
                                          discountPercent: e.target.value,
                                          paidAmount: baseTotal > 0 ? discountedTotal.toString() : paymentData.paidAmount,
                                          debtAmount: '0'
                                       });
                                    } else {
                                       // Fixed amount discount — foiz chegarasidan oshmasin (server ham tekshiradi)
                                       if (val < 0) return;
                                       if (maxDiscount < 100 && val > Math.floor(baseTotal * maxDiscount / 100)) return;
                                       const discountedTotal = baseTotal > 0 ? Math.max(0, baseTotal - val) : 0;
                                       // Store equivalent percent for data consistency
                                       const equivalentPercent = baseTotal > 0 ? Math.round((val / baseTotal) * 100) : 0;
                                       setPaymentData({
                                          ...paymentData,
                                          discountPercent: e.target.value, // store raw discount amount as string
                                          paidAmount: baseTotal > 0 ? discountedTotal.toString() : paymentData.paidAmount,
                                          debtAmount: '0'
                                       });
                                    }
                                 }}
                                 placeholder={discountType === 'percent' ? '0' : 'Summa kiriting'}
                              />
                           </div>
                        </div>
                        {/* Discount info box */}
                        {paymentData.discountPercent && Number(paymentData.discountPercent) > 0 && (
                           <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-800 dark:text-yellow-200">
                              {discountType === 'percent' ? (
                                 <>Chegirma summasi: <strong>{Math.round((Number(paymentData.amount) || 0) * (Number(paymentData.discountPercent) || 0) / 100).toLocaleString()} UZS</strong> ({paymentData.discountPercent}%)</>
                              ) : (
                                 <>Chegirma: <strong>{Number(paymentData.discountPercent).toLocaleString()} UZS</strong> &nbsp;(Umumiy {(Number(paymentData.amount)||0) > 0 ? Math.round((Number(paymentData.discountPercent)/(Number(paymentData.amount)||1))*100) : 0}%)</>
                              )}
                           </div>
                        )}
                     </div>
                  )}

                  {paymentData.service !== 'Avans' && (patient?.balance || 0) > 0 && (
                     <div className="mb-4">
                        <Button 
                           type="button" 
                           variant="secondary" 
                           className="w-full bg-primary-50 text-primary-700 hover:bg-primary-100 border-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-800 flex items-center justify-center gap-2"
                           onClick={() => {
                              const baseAmount = Number(paymentData.amount) || 0;
                              const discountVal = Number(paymentData.discountPercent) || 0;
                              let finalTotal = baseAmount;
                              
                              if (discountType === 'percent') {
                                 finalTotal = Math.round(baseAmount * (1 - discountVal / 100));
                              } else {
                                 finalTotal = Math.max(0, baseAmount - discountVal);
                              }

                              setPaymentData({ 
                                 ...paymentData, 
                                 type: 'Balance',
                                 paidAmount: finalTotal.toString(),
                                 debtAmount: '0'
                              });
                           }}
                        >
                           <CreditCard className="w-4 h-4" /> Bemor avansidan to'lash (Mavjud: {patient.balance.toLocaleString()} UZS)
                        </Button>
                     </div>
                  )}

                  <div className={paymentData.service === 'Avans' ? "grid grid-cols-1" : "grid grid-cols-2 gap-4"}>
                     <Input
                        label={t('auto.To\'lanayotgan Summa')}
                        type="number"
                        value={paymentData.paidAmount}
                        onChange={e => {
                           // Asl narx ma'lum bo'lsa: qarz = jami - to'lanayotgan (qarz to'lovga qo'shilib ketmasligi uchun)
                           const total = getDiscountedTotal();
                           const paid = Number(e.target.value) || 0;
                           setPaymentData({
                              ...paymentData,
                              paidAmount: e.target.value,
                              debtAmount: total > 0 ? String(Math.max(0, total - paid)) : paymentData.debtAmount,
                           });
                        }}
                        placeholder="0.00"
                        required
                     />
                     {paymentData.service !== 'Avans' && (
                        <Input
                           label={t('auto.Qolgan Qarzdorlik')}
                           type="number"
                           value={paymentData.debtAmount}
                           onChange={e => {
                              // Asl narx ma'lum bo'lsa: to'lanayotgan = jami - qarz (avtomatik ayriladi)
                              const total = getDiscountedTotal();
                              const debt = Number(e.target.value) || 0;
                              setPaymentData({
                                 ...paymentData,
                                 debtAmount: e.target.value,
                                 paidAmount: total > 0 ? String(Math.max(0, total - debt)) : paymentData.paidAmount,
                              });
                           }}
                           placeholder="0.00"
                        />
                     )}
                  </div>

                  {/* Total Calculator Display - Only for non-Avans */}
                  {paymentData.service !== 'Avans' && (
                     <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{t('auto.Jami Summa')}:</span>
                        <span className="text-gray-900 dark:text-white font-bold text-lg">
                           {((Number(paymentData.paidAmount) || 0) + (Number(paymentData.debtAmount) || 0)).toLocaleString()} UZS
                        </span>
                     </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                     <Select
                        label={t('auto.To\'lov Usuli')}
                        value={paymentData.type}
                        onChange={e => setPaymentData({ ...paymentData, type: e.target.value })}
                        options={paymentData.service === 'Avans'
                           // Avans — bu kassaga pul kiritish; sug'urta ham, hisobdan yechish ham bu yerda ma'nosiz
                           ? INCOMING_PAYMENT_METHODS
                              .filter(m => m !== 'Insurance')
                              .map(m => ({ value: m, label: tLabel(t, getPaymentMethodLabel(m)) }))
                           : [
                              ...INCOMING_PAYMENT_METHODS.map(m => ({ value: m, label: tLabel(t, getPaymentMethodLabel(m)) })),
                              { value: 'Balance', label: tLabel(t, getPaymentMethodLabel('Balance')), disabled: (patient?.balance || 0) <= 0 }
                           ]
                        }
                     />
                     {paymentData.service !== 'Avans' && (
                        <PaymentSplitRows
                           paidAmount={Number(paymentData.paidAmount) || 0}
                           primaryMethod={paymentData.type as PaymentMethod}
                           extras={paymentExtras}
                           onChange={setPaymentExtras}
                           methods={(patient?.balance || 0) > 0 ? [...INCOMING_PAYMENT_METHODS, 'Balance'] : INCOMING_PAYMENT_METHODS}
                           balance={patient?.balance || 0}
                        />
                     )}
                  </div>
                  {paymentDateEditable && canBackdate && (
                     <DateField
                        label={t('payment.date')}
                        value={paymentData.appointmentDate || todayKey}
                        onChange={v => setPaymentData(prev => ({ ...prev, appointmentDate: v }))}
                        max={todayKey}
                        required
                        helperText={(paymentData.appointmentDate || todayKey) !== todayKey ? t('payment.dateHint') : undefined}
                     />
                  )}
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)} disabled={isPaymentSubmitting}>{t('auto.Bekor qilish')}</Button>
                     <Button type="submit" disabled={isPaymentSubmitting || !!paymentSplitProblem}>
                        {isPaymentSubmitting ? t('auto.Saqlanmoqda...') : t('auto.Saqlash')}
                     </Button>
                  </div>
               </form>
            </Modal>

            {/* Payment Edit Modal */}
            <Modal isOpen={isPaymentEditModalOpen} onClose={() => setIsPaymentEditModalOpen(false)} title={t('auto.To\'lovni Tahrirlash')}>
               <form onSubmit={handleEditPaymentSave} className="space-y-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
                     <p className="text-sm text-gray-500">Xizmat:</p>
                     <p className="font-medium text-gray-900 dark:text-white">{editingTransaction?.service}</p>
                     <p className="text-sm text-gray-500 mt-2">Sana:</p>
                     <p className="font-medium text-gray-900 dark:text-white">{editingTransaction?.date}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label={t('auto.Summa')}
                        type="number"
                        value={editPaymentAmount}
                        onChange={e => setEditPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        required
                     />
                     <Select
                        label={t('auto.Status')}
                        value={editPaymentStatus}
                        onChange={e => setEditPaymentStatus(e.target.value)}
                        options={[
                           { value: 'Paid', label: 'To\'landi' },
                           { value: 'Pending', label: 'Kutilmoqda' }
                        ]}
                     />
                  </div>
                  <Select
                     label={t('auto.To\'lov Usuli')}
                     value={editPaymentMethod}
                     onChange={e => setEditPaymentMethod(e.target.value)}
                     options={INCOMING_PAYMENT_METHODS.map(m => ({ value: m, label: tLabel(t, getPaymentMethodLabel(m)) }))}
                  />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsPaymentEditModalOpen(false)}>{t('auto.Bekor qilish')}</Button>
                     <Button type="submit">{t('auto.Saqlash')}</Button>
                  </div>
               </form>
            </Modal>

            {/* Message Modal */}
            <Modal isOpen={isMessageModalOpen} onClose={() => setIsMessageModalOpen(false)} title={t('patients.details.modals.messageTitle')}>
               <form onSubmit={handleSendMessage} className="space-y-4">
                  <Select
                     label={t('patients.details.modals.messageType')}
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
                        { value: 'Custom', label: t('patients.details.modals.msgCustom') },
                        { value: 'Tomorrow', label: t('patients.details.modals.msgTomorrow') },
                        { value: 'Debt', label: t('patients.details.modals.msgDebt') },
                        { value: 'Missed', label: t('patients.details.modals.msgMissed') }
                     ]}
                  />
                  <Select
                     label={t('patients.details.modals.msgChannel')}
                     value={messageChannel}
                     onChange={(e) => setMessageChannel(e.target.value as 'auto' | 'telegram' | 'sms')}
                     options={[
                        { value: 'auto', label: t('patients.details.modals.msgChannelAuto') },
                        { value: 'telegram', label: t('patients.details.modals.msgChannelTelegram') },
                        { value: 'sms', label: t('patients.details.modals.msgChannelSms') },
                     ]}
                  />
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.details.modals.msgText')}</label>
                     <textarea
                        className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        rows={4}
                        placeholder={t('patients.details.modals.msgPlaceholder')}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        required
                     />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsMessageModalOpen(false)}>{t('common.cancel')}</Button>
                     <Button type="submit">{t('patients.details.modals.send')}</Button>
                  </div>
               </form>
            </Modal>

            {/* New Appointment Modal */}
            <Modal isOpen={isApptModalOpen} onClose={() => setIsApptModalOpen(false)} title={t('patients.details.modals.newAppt')}>
               <form onSubmit={handleApptSubmit} className="space-y-4">
                  <Select
                     label={t('patients.details.modals.doctor')}
                     options={doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))}
                     value={apptData.doctorId}
                     onChange={(e) => setApptData({ ...apptData, doctorId: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('patients.details.modals.date')} type="date" value={apptData.date} onChange={e => setApptData({ ...apptData, date: e.target.value })} required />
                     <Input label={t('patients.details.modals.time')} type="time" value={apptData.time} onChange={e => setApptData({ ...apptData, time: e.target.value })} required />
                  </div>
                  {categories.length > 0 && (
                     <Select
                        label={t('patients.details.modals.serviceCategory')}
                        options={[
                           { value: '', label: t('patients.details.modals.serviceAllCategories') },
                           ...categories.map(c => ({ value: c.id, label: c.name }))
                        ]}
                        value={apptData.categoryId}
                        onChange={(e) => setApptData({ ...apptData, categoryId: e.target.value, type: '' })}
                     />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                     <Select
                        label={t('patients.details.modals.procedureType')}
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
                     <Input label={t('patients.details.modals.duration')} type="number" value={apptData.duration} onChange={e => setApptData({ ...apptData, duration: Number(e.target.value) })} required />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.details.modals.notes')}</label>
                     <textarea
                        className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        rows={3}
                        value={apptData.notes}
                        onChange={(e) => setApptData({ ...apptData, notes: e.target.value })}
                     />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsApptModalOpen(false)}>{t('common.cancel')}</Button>
                     <Button type="submit">{t('patients.details.modals.book')}</Button>
                  </div>
               </form>
            </Modal>

            {/* Diagnosis Modal */}
            <Modal isOpen={isDiagnosisModalOpen} onClose={() => setIsDiagnosisModalOpen(false)} title={t('patients.details.modals.addDiagnosis')}>
               <form onSubmit={handleAddDiagnosis} className="space-y-4">
                  {!selectedCode ? (
                     <div className="space-y-4">
                        {icd10Query ? (
                           // Show codes within a selected category
                           <div>
                              <div className="flex items-center gap-2 mb-4">
                                 <Button variant="secondary" size="sm" onClick={() => { setIcd10Query(''); setIcd10Results([]); }}>
                                    <ArrowLeft className="w-4 h-4" /> {t('patients.details.modals.back')}
                                 </Button>
                                 <h4 className="font-bold text-gray-900 dark:text-white">{icd10Query}</h4>
                              </div>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                 {icd10Results.map(code => (
                                    <div
                                       key={code.code}
                                       className="p-3 border rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer transition-colors"
                                       onClick={() => setSelectedCode(code)}
                                    >
                                       <div className="font-bold text-primary-600 dark:text-primary-400">{code.code}</div>
                                       <div className="text-sm text-gray-700 dark:text-gray-300">{code.name}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        ) : (
                           // Show Categories
                           <div className="space-y-2">
                              <p className="text-sm text-gray-500 mb-2">{t('patients.details.modals.selectCategory')}:</p>
                              {[
                                 t('patients.details.modals.cat1'),
                                 t('patients.details.modals.cat2'),
                                 t('patients.details.modals.cat3'),
                                 t('patients.details.modals.cat4'),
                                 t('patients.details.modals.cat5')
                              ].map(category => (
                                 <div
                                    key={category}
                                    className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex justify-between items-center group"
                                    onClick={() => handleSearchICD10(category)}
                                 >
                                    <span className="font-medium text-gray-900 dark:text-white">{category}</span>
                                    <ArrowLeft className="w-4 h-4 rotate-180 text-gray-400 group-hover:text-primary-500 transition-colors" />
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  ) : (
                     // Selected Code Confirmation
                     <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
                           <div>
                              <p className="font-bold text-primary-800 dark:text-primary-200">{selectedCode.code}</p>
                              <p className="text-sm text-primary-700 dark:text-primary-300">{selectedCode.name}</p>
                           </div>
                           <Button variant="ghost" size="sm" onClick={() => setSelectedCode(null)}>{t('common.change')}</Button>
                        </div>

                        <div>
                           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.details.modals.notes')}</label>
                           <textarea
                              className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                              rows={3}
                              placeholder={t('patients.details.modals.notesPlaceholder')}
                              value={diagnosisNote}
                              onChange={(e) => setDiagnosisNote(e.target.value)}
                           />
                        </div>
                     </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-700">
                     <Button type="button" variant="secondary" onClick={() => { setIsDiagnosisModalOpen(false); setSelectedCode(null); setIcd10Query(''); }}>{t('common.close')}</Button>
                     {selectedCode && <Button type="submit">{t('common.save')}</Button>}
                  </div>
               </form>
            </Modal>
         </div >

         {/* Print Template */}
         < div className="hidden print:block print:p-8 bg-white text-black" >
            <div className="text-center mb-8 border-b-2 border-gray-800 pb-4">
               <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">{t('auto.DentalFlow Clinic')}</h1>
               <p className="text-sm text-gray-600">{t('auto.Tish davolash va diagnostika markazi')}</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
               <div>
                  <h2 className="text-xs font-bold uppercase text-gray-500 mb-1">{t('auto.Bemor')}</h2>
                  <p className="text-xl font-bold">{patient.lastName} {patient.firstName}</p>
                  <p className="text-sm">{showPatientPhone ? patient.phone : maskPhone(patient.phone)}</p>
                  <p className="text-sm">{formatDobDDMMYYYY(patient.dob)} ({calcAge(patient.dob) ?? ''} yosh)</p>
               </div>
               <div className="text-right">
                  <h2 className="text-xs font-bold uppercase text-gray-500 mb-1">{t('auto.Sana')}</h2>
                  <p className="text-xl font-bold">{new Date().toLocaleDateString('uz-UZ')}</p>
                  <p className="text-sm">{new Date().toLocaleTimeString('uz-UZ')}</p>
               </div>
            </div>

            {/* Diagnoses Section */}
            {
               diagnoses.length > 0 && (
                  <div className="mb-8">
                     <h3 className="text-lg font-bold border-b border-gray-400 mb-4 pb-1">{t('auto.Tashxislar')}</h3>
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
               <h3 className="text-lg font-bold border-b border-gray-400 mb-4 pb-1">{t('auto.Tish Kartasi')}</h3>
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
                  <p className="text-sm italic">{t('auto.DentalFlow orqali chop etildi')}</p>
               </div>
            </div>
         </div >

         {/* Assign Doctor Modal */}
         <Modal isOpen={isAssignDoctorModalOpen} onClose={() => setIsAssignDoctorModalOpen(false)} title={t('patients.details.modals.assignDoctorSelect')}>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
               {doctors.length > 0 ? (
                  doctors.map(doc => (
                     <button
                        key={doc.id}
                        onClick={() => handleAssignDoctor(doc.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all text-left group
                              ${patient.doctorId === doc.id
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                           }`}
                     >
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                              {doc.firstName[0]}{doc.lastName[0]}
                           </div>
                           <div>
                              <p className="font-bold text-gray-900 dark:text-white">Dr. {doc.firstName} {doc.lastName}</p>
                              <p className="text-xs text-gray-500">{doc.specialty}</p>
                           </div>
                        </div>
                        {patient.doctorId === doc.id && (
                           <div className="bg-primary-500 text-white p-1 rounded-full">
                              <UserCheck className="w-4 h-4" />
                           </div>
                        )}
                     </button>
                  ))
               ) : (
                  <div className="text-center py-8 text-gray-500">
                     {t('patients.details.alerts.doctorNotFound')}
                  </div>
               )}
            </div>
            <div className="flex justify-end pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
               <Button variant="secondary" onClick={() => setIsAssignDoctorModalOpen(false)}>{t('common.close')}</Button>
            </div>
         </Modal>
         
         <ReceiptModal
            isOpen={isReceiptModalOpen}
            onClose={() => setIsReceiptModalOpen(false)}
            transaction={receiptTransaction}
            clinic={currentClinic}
            parts={receiptParts}
         />
         {waivingAppointment && (
            <WaiveAppointmentModal
               isOpen
               onClose={() => setWaivingAppointment(null)}
               patientName={`${patient.lastName} ${patient.firstName}`}
               date={waivingAppointment.date}
               amount={calculateAppointmentTotal(waivingAppointment.notes || '', services).total}
               onConfirm={async reason => {
                  await onAddTransaction(buildWaivedTransaction(waivingAppointment, services, reason));
               }}
            />
         )}
      </>
   );
};
