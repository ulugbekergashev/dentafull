import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, Badge, Input, Modal, Button } from '../components/Common';
import { DashReports, ReportItem } from '../components/DashReports';
import {
  Users, Calendar, DollarSign, TrendingUp, TrendingDown,
  CheckCircle, Clock, AlertCircle, Plus, ChevronRight, Star, ArrowLeft,
  Zap, FlaskConical, CreditCard, UserCheck, XCircle, CalendarClock, Bot, Phone, Send, Gift
} from 'lucide-react';
import { TrendCharts, IntensityChart } from '../components/AppointmentCharts';
import { Patient, Appointment, Transaction, UserRole, Doctor, Lead, LabOrder, Clinic, Service, PaymentMethod, Recall, InstallmentPlan } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { formatDateToISO, formatHeaderDate } from '../utils/dateUtils';
import { transactionBelongsToDoctor, calculateAppointmentTotal } from '../utils/financialCalculations';
import { buildUnpaidRows, buildWaivedTransaction, unpaidTotal, UnpaidRow } from '../utils/unpaid';
import { WaiveAppointmentModal } from '../components/WaiveAppointmentModal';
import { PatientQuickSearch } from '../components/PatientQuickSearch';
import { DoctorQueueCard } from '../components/DoctorQueueCard';
import { DeskToday } from '../components/DeskToday';
import { PeriodPicker, Period, PeriodKey, periodOf, formatPeriodRange } from '../components/PeriodPicker';
import { DeskMoneyCard, DeskLabCard, DeskCallsCard, CallActions } from '../components/DeskCards';
import { BookingRequest } from '../components/BookingPanel';
import { buildCallList, callSummary, confirmDay, confirmProgress, installmentDues, labSummary } from '../utils/desk';
import { minutesOf, nowHHMM } from '../utils/queue';
import { useCallLog } from '../hooks/useCallLog';
import { prefillFromQuery } from '../utils/patientSearch';
import { usePerms } from '../context/PermissionsContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { AddPatientModal } from '../components/AddPatientModal';
import { QuickPaymentModal } from '../components/QuickPaymentModal';
import { api } from '../services/api';

interface DashboardProps {
  patients: Patient[];
  appointments: Appointment[];
  transactions: Transaction[];
  reviews: any[];
  userRole: UserRole;
  doctorId?: string;
  doctors: Doctor[];
  leads: Lead[];
  labOrders?: LabOrder[];
  services?: Service[];
  currentClinic?: Clinic;
  clinicId?: string;
  showFinance?: boolean; // Ruxsatlar: pul ko'rsatkichlari (KPI, tushum grafigi, summalar)
  canTakePayment?: boolean; // Ruxsatlar: pulni o'zi qabul qila oladimi yoki faqat kassaga uzatadimi
  seeAllPatients?: boolean; // Ruxsatlar → Ko'rish doirasi: shifokor butun klinika ma'lumotini ko'rsinmi
  onPatientClick?: (id: string) => void;
  /** silent — "Uchrashuv yangilandi" chiqmaydi (natijani qo'ng'iroq kartasi o'zi ko'rsatadi) */
  onUpdateAppointment?: (id: string, data: Partial<Appointment>, opts?: { silent?: boolean }) => Promise<void>;
  onUpdateTransaction?: (id: string, data: Partial<Transaction>) => Promise<void>;
  /** true — saqlandi; xatoni ilova o'zi ko'rsatadi */
  onUpdateLead?: (id: string, data: Partial<Lead>) => Promise<boolean>;
  onAddPatient?: (data: Omit<Patient, 'id' | 'clinicId'>, options?: { allowDuplicateName?: boolean }) => Promise<Patient | void>;
  /** Ruxsatlar: bemor telefon raqamini ko'rsatish (qidiruv natijalarida) */
  showPatientPhone?: boolean;
  onAddTransaction?: (tx: Omit<Transaction, 'id'>) => Promise<any>;
  onAddAppointment?: (appt: Omit<Appointment, 'id'>) => Promise<any>;
  /** "Qabul" yon panelini ochish (App darajasida, istalgan sahifadan ochiladi) */
  onOpenBooking?: (opts?: BookingRequest) => void;
  addToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

// Dashboard ro'yxatlarida ko'rsatiladigan qatorlar soni. Qolgani "Hammasi" ortida —
// dashboard umumiy holatni ko'rsatadi, to'liq ro'yxat o'z sahifasida.
const DASH_ROW_LIMIT = 4;

export const Dashboard: React.FC<DashboardProps> = ({ patients, appointments, transactions, reviews, userRole, doctorId, doctors, leads, labOrders = [], services = [], currentClinic, clinicId = '', showFinance = true, canTakePayment = true, seeAllPatients = false, showPatientPhone = true, onPatientClick, onUpdateAppointment, onUpdateTransaction, onUpdateLead, onAddPatient, onAddTransaction, onAddAppointment, onOpenBooking, addToast }) => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  /** Qidiruvdan "Yangi bemor" bosilganda formaga o'tadigan qiymatlar */
  const [newPatientPrefill, setNewPatientPrefill] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  const [isQuickPaymentOpen, setIsQuickPaymentOpen] = useState(false);
  const [payingAppointment, setPayingAppointment] = useState<Appointment | null>(null);
  const [payingDebt, setPayingDebt] = useState<Transaction | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtPayMethod, setDebtPayMethod] = useState<PaymentMethod>('Cash');
  const [debtSaving, setDebtSaving] = useState(false);
  const isReceptionist = userRole === UserRole.RECEPTIONIST;
  // Grafiklar va "jami" kartalar faqat shifokorga. Klinika egasi ularni Moliya →
  // Hisobot da ko'radi (bu yerda takror edi), shifokorda esa Hisobot yo'q.
  const isDoctor = userRole === UserRole.DOCTOR;
  const perms = usePerms();
  // Bepul yopish — ruxsatlar jadvalidagi "Pul va to'lovlar" guruhidan
  const canWaive = perms.flag('money', 'waive');
  // Resepshn va admin uchun bosh sahifa — ish stoli: navbat, bugungi qabullar, pul,
  // laboratoriya va qo'ng'iroqlar. Shifokorda o'z navbati (DoctorQueueCard).
  const isDesk = !isDoctor;
  // "Qabul" tugmasi yon panelni ochadi (Kalendarga o'tmasdan).
  // Shifokor umuman yo'q bo'lsa — Kalendarga (u yerda individual tarif uchun shifokor avtomatik yaratiladi).
  const canBookHere = !!onOpenBooking && perms.can('calendar', 'appts', 'create') && doctors.length > 0;
  const canMoveAppt = perms.can('calendar', 'appts', 'edit') && !!onUpdateAppointment;
  /** "Bepul deb yopish" oynasi ochilgan qator */
  const [waivingRow, setWaivingRow] = useState<UnpaidRow | null>(null);
  // Shifokor o'z ma'lumotlari bilan cheklanadimi. Ruxsatlar → Ko'rish doirasi
  // ochilgan bo'lsa cheklov yo'q — bosh sahifa butun klinikani ko'rsatadi.
  const scopeToMyPatients = isDoctor && !!doctorId && !seeAllPatients;
  const today = new Date().toISOString().split('T')[0];
  // Davr: resepshn va adminda — bugun (bosh sahifa bugungi ish haqida), shifokorda —
  // shu oy (grafiklar oy bo'yicha ma'noli). Tayyor tanlov har safar qayta hisoblanadi:
  // sahifa yarim tundan keyin ham ochiq tursa, "Bugun" yangi kunni ko'rsatadi.
  const [periodKey, setPeriodKey] = useState<PeriodKey>(isDoctor ? 'month' : 'today');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const period: Period = periodKey === 'custom' && customRange
    ? { key: 'custom', ...customRange }
    : periodOf(periodKey === 'custom' ? 'today' : periodKey);
  const changePeriod = (p: Period) => {
    setPeriodKey(p.key);
    if (p.key === 'custom') setCustomRange({ from: p.from, to: p.to });
  };
  const { from: startDate, to: endDate } = period;

  // Filter data for doctors - only show their appointments and transactions
  const filteredAppointmentsByDoctor = useMemo(() => {
    if (scopeToMyPatients) {
      return appointments.filter(a => a.doctorId === doctorId);
    }
    return appointments;
  }, [appointments, scopeToMyPatients, doctorId]);

  const filteredTransactionsByDoctor = useMemo(() => {
    if (scopeToMyPatients) {
      // Qat'iy atributsiya: doctorId yoki aniq ism tengligi (taxminiy moslashtirish yo'q)
      const doctor = doctors.find(d => d.id === doctorId);
      return transactions.filter(t => {
        if (t.doctorId) return t.doctorId === doctorId;
        return doctor ? transactionBelongsToDoctor(t, doctor) : false;
      });
    }
    return transactions;
  }, [transactions, doctors, scopeToMyPatients, doctorId]);

  // --- Filter Logic ---
  // Matn sifatida solishtiriladi: "2026-09-25T10:00" kabi vaqtli sana ham oxirgi kunga kiradi
  const isDateInRange = (dateStr: string) => {
    const day = String(dateStr || '').slice(0, 10);
    return day >= startDate && day <= endDate;
  };

  // Filter Data by date range
  const filteredAppointments = useMemo(() => filteredAppointmentsByDoctor.filter(a => isDateInRange(a.date)), [filteredAppointmentsByDoctor, startDate, endDate]);
  const filteredTransactions = useMemo(() => filteredTransactionsByDoctor.filter(t => isDateInRange(t.date)), [filteredTransactionsByDoctor, startDate, endDate]);

  // Stats Calculation
  const totalPatients = patients.length; // Patient count usually stays total DB count
  const activePatients = patients.filter(p => p.status === 'Active').length;

  const periodAppointmentsCount = filteredAppointments.length;
  const pendingAppointments = filteredAppointments.filter(a => a.status === 'Pending').length;

  // Daromad = to'langan to'lovlar (Finance sahifasi bilan izchil)
  const totalRevenue = filteredTransactions.reduce((acc, t) => acc + (t.status === 'Paid' ? t.amount : 0), 0);


  // New Stats Calculation
  const newLeadsCount = useMemo(() => leads.filter(l => l.status === 'New').length, [leads]);

  const avgCheck = useMemo(() => {
    const completed = filteredAppointments.filter(a => a.status === 'Completed').length;
    return completed > 0 ? Math.round(totalRevenue / completed) : 0;
  }, [totalRevenue, filteredAppointments]);

  const pendingRevenue = useMemo(() =>
    filteredTransactions.filter(t => t.status === 'Pending').reduce((acc, t) => acc + t.amount, 0)
    , [filteredTransactions]);


  // Today's Appointments
  const todayAppointments = useMemo(() => {
    const base = scopeToMyPatients
      ? appointments.filter(a => a.doctorId === doctorId)
      : appointments;
    return base
      .filter(a => a.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, today, scopeToMyPatients, doctorId]);

  // Tanlangan davrdagi qabullar — jadval shu bo'yicha. Masalan, adashib kechagi
  // kunga yozilgan qabulni "Kecha" tanlab topish mumkin.
  const periodAppointments = useMemo(
    () => [...filteredAppointments].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [filteredAppointments]);
  const [showAllPeriodAppts, setShowAllPeriodAppts] = useState(false);
  useEffect(() => { setShowAllPeriodAppts(false); }, [startDate, endDate]);
  const periodIsOneDay = startDate === endDate;
  // Kalendardagi kataklar ostida — o'sha kungi qabullar soni (bekor qilinganlarsiz)
  const apptCountsByDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of filteredAppointmentsByDoctor) {
      if (a.status !== 'Cancelled') m[a.date] = (m[a.date] || 0) + 1;
    }
    return m;
  }, [filteredAppointmentsByDoctor]);
  const periodLabel = period.key === 'custom' ? formatPeriodRange(period.from, period.to) : t(`dashboard.period.${period.key}` as any);
  const periodDateLine = (() => {
    const [y, m, d] = startDate.split('-').map(Number);
    if (periodIsOneDay) {
      // toLocaleDateString('uz-UZ') brauzerda "2026 M09 25, Fri" beradi — o'zimizniki
      const line = formatHeaderDate(language, new Date(y, m - 1, d));
      return y === new Date().getFullYear() ? line : `${line} ${y}`;
    }
    return formatPeriodRange(startDate, endDate);
  })();

  // Overdue lab orders (by patient name)
  const overdueLabPatients = useMemo(() => {
    return new Set(
      labOrders
        .filter(o => ['Pending', 'In-Progress'].includes(o.status) && o.deadline < today)
        .map(o => o.patientName)
    );
  }, [labOrders, today]);

  /**
   * Olinmagan pul — yagona ro'yxat. Ilgari bu ikkita alohida karta edi
   * ("qarzga yozilgan" va "kassaga yozilmagan"), lekin ikkalasi ham bitta narsani
   * bildiradi va to'liq qarzga yozilgan qabul ikkalasiga ham tushib ketardi.
   * Endi manba faqat qatorning belgisi — amal bitta joydan bajariladi.
   */
  // Olinmagan pul — "qilish kerak" ro'yxati, hisobot emas: yuqoridagi davr tanlovi unga
  // ta'sir qilmaydi, aks holda "Bugun" tanlanganda oy boshidagi olinmagan pul ko'rinmay
  // qolardi. Oyna har rolda avvalgidek: resepshn — bugun, admin va shifokor — oy
  // boshidan bugungacha (davr tanlagichidan oldingi sukut shunday edi).
  const unpaidWindow = periodOf(isReceptionist ? 'today' : 'month');
  const unpaidAppointments = useMemo(
    () => filteredAppointmentsByDoctor.filter(a => a.date >= unpaidWindow.from && a.date <= unpaidWindow.to),
    [filteredAppointmentsByDoctor, unpaidWindow.from, unpaidWindow.to]);
  const unpaidRows = useMemo(
    () => buildUnpaidRows(unpaidAppointments, filteredTransactionsByDoctor, services),
    [unpaidAppointments, filteredTransactionsByDoctor, services]);

  /**
   * Shifokor faqat hali hal qilmagan qabullarini ko'radi: "To'lovni olish" yoki
   * "Kassaga yuborish" bosilgach qator uning ro'yxatidan chiqadi. Resepshn va admin
   * esa hammasini ko'radi — aks holda shifokor unutgan pul hech kimga ko'rinmay qolardi.
   */
  const visibleUnpaid = useMemo(
    () => (isDoctor ? unpaidRows.filter(r => r.source === 'appointment' && !r.sentToCashier) : unpaidRows),
    [unpaidRows, isDoctor]);

  /**
   * Qarzlar alohida kartada. Ikkalasi ham bitta ro'yxatdan kelgani uchun
   * bir pul ikkala kartaga tushmaydi: qabul kassada yozilgan bo'lsa, uni
   * faqat kassa yozuvi ifodalaydi.
   */
  const debtRows = useMemo(() => visibleUnpaid.filter(r => r.isDebt), [visibleUnpaid]);
  const awaitingRows = useMemo(() => visibleUnpaid.filter(r => !r.isDebt), [visibleUnpaid]);
  const debtSum = useMemo(() => unpaidTotal(debtRows), [debtRows]);
  const awaitingSum = useMemo(() => unpaidTotal(awaitingRows), [awaitingRows]);
  // Qatorda "Kassaga yuborish" chiqadimi — faqat kassada yozuvi yo'q qabullarda
  const canSendToCashier = !!onUpdateAppointment;
  // Moliyani ko'rmaydigan xodim summani ham, "To'lovni olish" ni ham ko'rmaydi —
  // unga faqat kassaga uzatish qoladi, ro'yxatning o'zi esa ochiq turaveradi.
  const canCollect = canTakePayment && showFinance;

  // Eski nomlar — pastdagi KPI va AI stats shular orqali o'qiydi
  const pendingDebts = useMemo(
    () => unpaidRows.filter(r => r.source === 'debt'), [unpaidRows]);

  /**
   * O'ng ustunda ko'rsatiladigan "hali olinmagan pul" ro'yxatlari bormi.
   * Bo'lmasa, kunlik jadval butun kenglikni egallaydi.
   */
  // Nazoratga chaqirish: muddati kelgan yoki 14 kun ichida keladigan qayta
  // tashriflar. Shifokor faqat o'z bemorlarini ko'radi.
  const [dueRecalls, setDueRecalls] = useState<Recall[]>([]);
  const [showAllRecalls, setShowAllRecalls] = useState(false);
  useEffect(() => {
    if (!clinicId) return;
    api.recalls.getDue(clinicId, 14).then(setDueRecalls).catch(() => setDueRecalls([]));
  }, [clinicId]);
  const visibleRecalls = useMemo(
    () => (scopeToMyPatients ? dueRecalls.filter(r => r.doctorId === doctorId) : dueRecalls),
    [dueRecalls, scopeToMyPatients, doctorId]);
  const recallToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const dismissRecall = async (id: string) => {
    try {
      await api.recalls.update(id, { status: 'cancelled' });
      setDueRecalls(prev => prev.filter(r => r.id !== id));
    } catch { /* ro'yxat keyingi yuklashda yangilanadi */ }
  };

  const hasMoneyCards = visibleUnpaid.length > 0;
  // O'ng ustunda nazorat ro'yxati ham turadi. Resepshn va adminda bular
  // yuqoridagi ish stoli kartalarida — jadval butun kenglikni oladi.
  const hasSideCards = isDoctor && (hasMoneyCards || visibleRecalls.length > 0);

  // ── Ish stoli ma'lumotlari (resepshn / admin) ──
  const localToday = formatDateToISO(new Date());
  // Bo'lib to'lash: muddati kelgan yoki 3 kun ichida keladigan to'lovlar
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>([]);
  useEffect(() => {
    if (!clinicId || !isDesk || !showFinance) return;
    let alive = true;
    api.installments.getAll(clinicId)
      .then(data => { if (alive) setInstallmentPlans(Array.isArray(data) ? data : []); })
      .catch(() => { /* ro'yxatsiz ham sahifa ishlaydi */ });
    return () => { alive = false; };
  }, [clinicId, isDesk, showFinance]);
  const dueInstallments = useMemo(
    () => (showFinance ? installmentDues(installmentPlans, localToday, 3, patients) : []),
    [installmentPlans, localToday, showFinance, patients]);
  const lab = useMemo(() => labSummary(labOrders, localToday), [labOrders, localToday]);

  // ── Qo'ng'iroqlar (obzvon) ──
  // Bugungi tasdiqlashda vaqti o'tgan qabul chiqmasligi uchun daqiqa sayin yangilanadi
  const [nowMin, setNowMin] = useState(() => minutesOf(nowHHMM()));
  useEffect(() => {
    if (!isDesk) return;
    const id = setInterval(() => setNowMin(minutesOf(nowHHMM())), 60000);
    return () => clearInterval(id);
  }, [isDesk]);
  const callLog = useCallLog(clinicId, localToday, isDesk);
  const logCall = callLog.apply;
  const calls = useMemo(() => buildCallList({
    appointments, patients, recalls: dueRecalls, leads, today: localToday, nowMin,
    includeLeads: perms.menu('leads'), log: callLog.entries,
  }), [appointments, patients, dueRecalls, leads, localToday, nowMin, perms, callLog.entries]);
  const callProgress = useMemo(() => {
    const day = confirmDay(appointments, localToday);
    return { day, ...confirmProgress(appointments, day, callLog.entries) };
  }, [appointments, localToday, callLog.entries]);
  const callStats = useMemo(() => callSummary(callLog.entries), [callLog.entries]);

  const canLeadEdit = !!onUpdateLead && perms.can('leads', 'leads', 'edit');
  const canLeadBook = !!onUpdateLead && canBookHere && (perms.flag('leads', 'convert') || perms.can('leads', 'leads', 'edit'));
  const doneText = (key: string, name: string) => t(key as any).replace('{name}', name);
  const setLeadStatus = async (c: { leadId?: string; key: string; name: string }, status: Lead['status'], result: 'thinking' | 'rejected') => {
    // Saqlanmasa qator ochiq qoladi (xatoni ilova toasti ko'rsatgan)
    if (!c.leadId || !(await onUpdateLead!(c.leadId, { status }))) throw new Error('lead not saved');
    void logCall(c.key, { result });
    return {
      text: doneText(result === 'thinking' ? 'desk.call.done.thinking' : 'desk.call.done.rejected', c.name),
      undo: async () => {
        if (await onUpdateLead!(c.leadId!, { status: 'New' })) void logCall(c.key, { result: null });
      },
    };
  };
  const callActions: CallActions = {
    confirm: onUpdateAppointment ? async c => {
      await onUpdateAppointment(c.appointmentId!, { status: 'Confirmed' }, { silent: true });
      void logCall(c.key, { result: 'confirmed' });
      return {
        text: doneText('desk.call.done.confirmed', c.name),
        undo: async () => {
          await onUpdateAppointment(c.appointmentId!, { status: 'Pending' }, { silent: true });
          void logCall(c.key, { result: null });
        },
      };
    } : undefined,
    // Qaytarib bo'lmaydi: shifokorga "bekor qilindi" xabari ketgan. Shuning uchun oldin so'raladi.
    cancel: onUpdateAppointment ? async c => {
      await onUpdateAppointment(c.appointmentId!, { status: 'Cancelled' }, { silent: true });
      void logCall(c.key, { result: 'cancelled' });
      return { text: doneText('desk.call.done.cancelled', c.name), tone: 'danger' };
    } : undefined,
    reschedule: canBookHere && canMoveAppt ? c => onOpenBooking!({
      rescheduleId: c.appointmentId,
      onDone: () => { void logCall(c.key, { result: 'rescheduled' }); },
    }) : undefined,
    book: canBookHere ? c => onOpenBooking!({
      patientId: c.patientId,
      mode: 'day',
      confirmedUpTo: callProgress.day,
      onDone: () => { void logCall(c.key, { result: 'booked' }); },
    }) : undefined,
    bookLead: canLeadBook ? c => {
      const lead = leads.find(l => l.id === c.leadId);
      if (!lead) return;
      // Lidlar sahifasidagi "Bemorga aylantirish" bilan bir xil: birinchi so'z — ism
      const [firstName = '', ...rest] = lead.name.trim().split(/\s+/);
      onOpenBooking!({
        newPatient: { firstName, lastName: rest.join(' '), phone: lead.phone, dob: lead.dob, address: lead.address },
        mode: 'day',
        confirmedUpTo: callProgress.day,
        notes: lead.service ? t('desk.call.leadInterest').replace('{service}', lead.service) : undefined,
        onDone: () => {
          void onUpdateLead!(lead.id, { status: 'Booked' });
          void logCall(c.key, { result: 'booked' });
        },
      });
    } : undefined,
    thinking: canLeadEdit ? c => setLeadStatus(c, 'Thinking', 'thinking') : undefined,
    reject: canLeadEdit ? c => setLeadStatus(c, 'Cancelled', 'rejected') : undefined,
    dismiss: async c => {
      if (c.kind === 'recall' && c.recallId) {
        const recall = dueRecalls.find(r => r.id === c.recallId);
        try {
          await api.recalls.update(c.recallId, { status: 'cancelled' });
        } catch (e: any) {
          addToast?.('error', e?.message || t('common.error'));
          throw e;
        }
        setDueRecalls(prev => prev.filter(r => r.id !== c.recallId));
        // Boshqa kompyuterdagi ro'yxat ham yopilsin (nazoratlar u yerda qayta yuklanmaydi)
        void logCall(c.key, { result: 'dismissed' });
        return {
          text: doneText('desk.call.done.dismissed', c.name),
          undo: recall ? async () => {
            await api.recalls.update(recall.id, { status: recall.status });
            setDueRecalls(prev => (prev.some(r => r.id === recall.id) ? prev : [...prev, recall]));
            void logCall(c.key, { result: null });
          } : undefined,
        };
      }
      const result = c.kind === 'birthday' ? 'greeted' : 'dismissed';
      await logCall(c.key, { result });
      return {
        text: doneText(result === 'greeted' ? 'desk.call.done.greeted' : 'desk.call.done.dismissed', c.name),
        undo: () => logCall(c.key, { result: null }),
      };
    },
    noAnswer: async c => {
      await logCall(c.key, { noAnswer: 1 });
      return { text: doneText('desk.call.done.noAnswer', c.name), tone: 'missed', undo: () => logCall(c.key, { noAnswer: -1 }) };
    },
  };
  // "Keldi" — keyinroqqa yozilgan bemor erta keldi: qabuli hozirga ko'chadi va navbatga tushadi
  const arriveNow = async (a: Appointment) => {
    if (!onUpdateAppointment) return;
    await onUpdateAppointment(a.id, { time: nowHHMM() });
  };


  const openDebtPayment = (tx: Transaction) => {
    setPayingDebt(tx);
    setDebtPayAmount(String(tx.amount));
    setDebtPayMethod('Cash');
  };

  // PatientDetails'dagi qarz yopish mantig'i bilan bir xil:
  // qisman — yangi Paid tranzaksiya + qoldiq Pending'da qoladi; to'liq — Paid, sana bugungi
  const handleDebtPayment = async () => {
    if (!payingDebt || !onUpdateTransaction) return;
    const paid = Math.min(Number(debtPayAmount) || 0, payingDebt.amount);
    if (paid <= 0) return;
    setDebtSaving(true);
    try {
      if (paid < payingDebt.amount) {
        if (!onAddTransaction) return;
        await onAddTransaction({
          patientName: payingDebt.patientName,
          patientId: payingDebt.patientId,
          doctorId: payingDebt.doctorId,
          doctorName: payingDebt.doctorName,
          clinicId: payingDebt.clinicId,
          amount: paid,
          status: 'Paid',
          type: debtPayMethod,
          service: `${payingDebt.service} (Qarzdorlik yopildi)`,
          date: today,
        });
        await onUpdateTransaction(payingDebt.id, { amount: payingDebt.amount - paid });
      } else {
        await onUpdateTransaction(payingDebt.id, { status: 'Paid', type: debtPayMethod, date: today });
      }
      setPayingDebt(null);
    } finally {
      setDebtSaving(false);
    }
  };

  const openPaymentForAppointment = (app: Appointment) => {
    setPayingAppointment(app);
    setIsQuickPaymentOpen(true);
  };

  /**
   * "To'lovni olish" — qator manbasiga qarab to'g'ri oynani ochadi.
   * Foydalanuvchi uchun farqi yo'q: qarz yopiladimi yoki yangi to'lov yoziladimi,
   * buni dastur o'zi hal qiladi.
   */
  const openPaymentForRow = (row: UnpaidRow) => {
    if (row.source === 'debt' && row.transaction) openDebtPayment(row.transaction);
    else if (row.appointment) openPaymentForAppointment(row.appointment);
  };

  // "Kassaga yuborish" — shifokor pulga tegmaydi, qator resepshn ro'yxatida qoladi
  const [sendingToCashier, setSendingToCashier] = useState<string | null>(null);
  const sendRowToCashier = async (row: UnpaidRow) => {
    if (!row.appointment || !onUpdateAppointment) return;
    setSendingToCashier(row.key);
    try {
      await onUpdateAppointment(row.appointment.id, { sentToCashierAt: new Date().toISOString() });
    } finally {
      setSendingToCashier(null);
    }
  };

  /** Qatordagi sana: bugun — "bugun", joriy yil — "20.09", boshqa yil — "20.09.2025" */
  const rowDate = (iso: string) => {
    const d = String(iso || '').slice(0, 10);
    if (d === formatDateToISO(new Date())) return t('desk.today');
    const [y, m, day] = d.split('-');
    return y === String(new Date().getFullYear()) ? `${day}.${m}` : `${day}.${m}.${y}`;
  };
  /** Xizmat nomidan narx izohini ("[200 000 UZS]") olib tashlash — summa alohida ko'rinadi */
  const rowService = (s: string) => String(s || '').split('||')[0].replace(/\s*\[[\d\s.,]+\s*UZS\]/gi, '').trim();

  /**
   * Ro'yxatdagi bitta qator. Ikkala karta ham shu ko'rinishdan foydalanadi:
   * chapda ism va tafsilot, o'ngda summa bilan tugmalar.
   */
  const renderUnpaidRow = (row: UnpaidRow) => {
    const patient = patients.find(p => p.id === row.patientId)
      || patients.find(p => `${p.lastName} ${p.firstName}` === row.patientName);
    // Kassaga uzatish faqat shifokorga ma'noli: u shifokorning o'z ro'yxatini
    // bo'shatadi. Admin va resepshn butun ro'yxatni ko'radi, ularda bu tugma
    // bosilsa ham qator joyida qolardi — ya'ni behuda edi.
    const showSend = isDoctor && row.source === 'appointment' && canSendToCashier;
    return (
      <div key={row.key} className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
            className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
          >
            {row.patientName}
          </button>
          <p className="flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${row.isDebt ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <span className="truncate">{[rowDate(row.date), rowService(row.service)].filter(Boolean).join(' · ')}</span>
            {/* Shifokor bemorni kassaga yubordi — u hozir kassa oldida turibdi */}
            {!isDoctor && row.source === 'appointment' && row.sentToCashier && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-[10px] font-bold">{t('desk.sentToCashier')}</span>
            )}
          </p>
        </div>
        {showFinance && (
          <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${row.isDebt ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
            {row.amount > 0 ? row.amount.toLocaleString() : '—'}
          </span>
        )}
        {canCollect && (onUpdateTransaction || onAddTransaction) && (
          <button
            onClick={() => openPaymentForRow(row)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-success hover:bg-success-700 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0"
          >
            <CreditCard className="w-3.5 h-3.5" /> {t('dashboard.unpaidTake')}
          </button>
        )}
        {canWaive && onAddTransaction && row.source === 'appointment' && row.appointment && (
          <button
            onClick={() => setWaivingRow(row)}
            title={t('waive.hint')}
            aria-label={t('waive.action')}
            className="p-1.5 border border-gray-200 dark:border-gray-700 hover:border-primary-400 text-gray-500 hover:text-primary-600 dark:text-gray-400 rounded-lg transition-colors flex-shrink-0"
          >
            <Gift className="w-3.5 h-3.5" />
          </button>
        )}
        {showSend && (
          <button
            onClick={() => sendRowToCashier(row)}
            disabled={sendingToCashier === row.key}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 hover:border-primary-400 text-gray-600 dark:text-gray-300 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" /> {t('dashboard.unpaidSend')}
          </button>
        )}
      </div>
    );
  };

  // "Hisobotlar" blokidagi raqamlar — tepadagi 4–6 ta katta karta o'rniga bir nechtasi.
  // "Kutilmoqda" summasi yo'q: olinmagan pul "Kutilayotgan to'lovlar" blokida turibdi.
  const reportItems: ReportItem[] = [
    ...(isDoctor ? [{
      key: 'patients', label: t('dashboard.reports.patients'), value: totalPatients.toLocaleString(),
      hint: `+${activePatients} ${t('dashboard.active')}`,
    }] : []),
    {
      key: 'appts', label: t('dashboard.reports.appts'), value: periodAppointmentsCount,
      hint: pendingAppointments > 0 ? `${pendingAppointments} ${t('dashboard.pending').toLowerCase()}` : t('dashboard.allOk'),
    },
    ...(showFinance && isDoctor ? [{
      key: 'avg', label: t('dashboard.reports.avgCheck'), value: avgCheck.toLocaleString(), unit: 'UZS', hint: t('dashboard.perPatient'),
    }] : []),
    ...(showFinance ? [{
      key: 'revenue', label: t('dashboard.reports.revenue'), value: totalRevenue.toLocaleString(), unit: 'UZS', accent: true,
    }] : []),
    ...(!isDoctor && perms.menu('leads') ? [{
      key: 'leads', label: t('dashboard.reports.leads'), value: newLeadsCount, hint: t('dashboard.fromAds'),
    }] : []),
  ];
  // To'liq hisobot — Moliya → Hisobot (shifokorda Moliya sahifasi yo'q)
  const canOpenFullReport = (userRole === UserRole.CLINIC_ADMIN || isReceptionist)
    && perms.menu('finance') && perms.can('finance', 'reports', 'view');

  // AI tab uchun stats obyekti
  const aiStats = useMemo(() => ({
    todayAppointments: todayAppointments.length,
    monthAppointments: filteredAppointments.length,
    monthRevenue: totalRevenue,
    newLeads: newLeadsCount,
    debtorsCount: pendingDebts.length,
    pendingRevenue,
    totalPatients,
    avgCheck,
    unpaidCompleted: unpaidRows.filter(r => r.source === 'appointment').length,
  }), [todayAppointments, filteredAppointments, totalRevenue, newLeadsCount, pendingDebts, pendingRevenue, totalPatients, avgCheck, unpaidRows]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* AI endi bu yerda emas: u sarlavhadagi DentaAI tugmasidan har qanday
          sahifa ustidan ochiladi. Ilgari bu yerda "Hisobot / DentaAI"
          almashtirgichi turardi va u AI ni bitta sahifaga bog'lab qo'ygan
          edi — shifokor Kalendarda turib savol bera olmasdi. */}
      {/* Sarlavha va boshqaruvlar bitta qatorda — ilgari ular ikki blokka
          bo'lingan edi va orada keraksiz bo'sh band qolib ketardi. */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700/60">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight">
          {t('nav.dashboard')}
        </h1>

        <div className="flex flex-wrap items-center gap-3">
        {/* Davr hamma rolga: resepshn ham kechagi yoki boshqa kungi qabullarni topa olsin */}
        <PeriodPicker value={period} onChange={changePeriod} counts={apptCountsByDay} />

          {/* Quick Actions — dashboarddan turib bajariladi. Tor ekranda keyingi qatorga o'tadi */}
          <div className="flex flex-wrap items-center gap-2">
            {perms.menu('patients') && (
              <PatientQuickSearch
                patients={patients}
                showPhone={showPatientPhone}
                canAdd={perms.can('patients', 'card', 'create')}
                onOpen={id => onPatientClick?.(id)}
                onAddNew={query => {
                  if (!onAddPatient) return navigate('/patients');
                  setNewPatientPrefill(prefillFromQuery(query));
                  setIsAddPatientOpen(true);
                }}
              />
            )}
            {perms.menu('calendar') && (
              <button
                onClick={() => (canBookHere ? onOpenBooking!() : navigate('/calendar'))}
                className="flex items-center gap-1.5 px-3 py-2 bg-info hover:bg-info-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <Calendar className="w-3.5 h-3.5" />
                {t('dashboard.quickAppointment')}
              </button>
            )}
            {canTakePayment && (!isReceptionist || showFinance) && (
              <button
                onClick={() => {
                  if (!onAddTransaction) return navigate('/finance');
                  setPayingAppointment(null);
                  setIsQuickPaymentOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-success hover:bg-success-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {t('dashboard.quickPayment')}
              </button>
            )}
          </div>

        </div>
      </div>

      {isDesk && (
        <>
          <DeskToday
            appointments={appointments}
            doctors={doctors}
            onPatientClick={perms.menu('patients') ? onPatientClick : undefined}
            onArrived={canMoveAppt ? arriveNow : undefined}
            onOpenBooking={canBookHere ? () => onOpenBooking!() : undefined}
            onSeeAll={() => navigate('/calendar')}
          />
          {/* Kutilayotgan to'lovlar — alohida blok, butun kenglikda */}
          <DeskMoneyCard
            awaiting={awaitingRows}
            debts={debtRows}
            installments={dueInstallments}
            today={localToday}
            showAmounts={showFinance}
            renderRow={renderUnpaidRow}
            onPatientClick={perms.menu('patients') ? onPatientClick : undefined}
            onSeeAll={perms.menu('finance') ? () => navigate('/finance') : undefined}
          />
          <div className={`grid grid-cols-1 gap-6 items-start ${perms.menu('lab') ? 'lg:grid-cols-5' : ''}`}>
            <div className={`min-w-0 ${perms.menu('lab') ? 'lg:col-span-3' : ''}`}>
              <DeskCallsCard
                items={calls}
                today={localToday}
                showPhone={showPatientPhone}
                actions={callActions}
                progress={callProgress}
                summary={callStats}
                onPatientClick={perms.menu('patients') ? onPatientClick : undefined}
                onOpenLeads={perms.menu('leads') ? () => navigate('/leads') : undefined}
              />
            </div>
            {perms.menu('lab') && (
              <div className="min-w-0 lg:col-span-2">
                <DeskLabCard
                  summary={lab}
                  patients={patients}
                  showPhone={showPatientPhone}
                  onPatientClick={perms.menu('patients') ? onPatientClick : undefined}
                  onOpenLab={() => navigate('/lab')}
                />
              </div>
            )}
          </div>
        </>
      )}
      {isDoctor && doctorId && (
        <DoctorQueueCard
          doctorId={doctorId}
          appointments={appointments}
          patients={patients}
          showPhone={showPatientPhone}
          onPatientClick={perms.menu('patients') ? onPatientClick : undefined}
        />
      )}

      {/* UMUMIY */}
        <div className="space-y-6">
          {/* Ko'rsatkich kartalari (qabullar, daromad va h.k.) endi tepada emas —
              sahifa oxiridagi "Hisobotlar" blokida (DashReports). */}

      {/* Kunning ikki savoli yonma-yon: bugun kim keladi va qancha pul
          yig'ilmagan. Nisbat 8/4 — jadvalda yettita ustun bor, u tor joyda
          gorizontal siljishga tushib qoladi; o'ngdagi ro'yxatlar esa
          oddiy va tor kenglikda ham bemalol o'qiladi. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

      {/* Tanlangan davrdagi qabullar (odatda — bugungi) */}
      <Card className={`p-6 rounded-[2rem] ${hasSideCards ? 'xl:col-span-8' : 'xl:col-span-12'}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              {t(`dashboard.apptsTitleA.${period.key}` as any)} <span className="text-primary">{t(`dashboard.apptsTitleB.${period.key}` as any)}</span>
            </h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              {periodDateLine}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-black rounded-full">
              {periodAppointments.length} {t('dashboard.count')}
            </span>
            <button
              onClick={() => navigate('/calendar')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
            >
              {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {periodAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Calendar className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">{period.key === 'today' ? t('dashboard.noAppointmentsToday') : t('dashboard.noAppointmentsPeriod')}</p>
          </div>
        ) : (
          <div>
            {/* Ko'p kunlik davrda ro'yxat uzun bo'lishi mumkin — ochilganda o'z ichida siljiydi */}
            <div className={`overflow-x-auto ${showAllPeriodAppts ? 'max-h-[560px] overflow-y-auto' : ''}`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colTime')}</th>
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colPatient')}</th>
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colDoctor')}</th>
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colService')}</th>
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colStatus')}</th>
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colState')}</th>
                  <th className="pb-3 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {(showAllPeriodAppts ? periodAppointments : periodAppointments.slice(0, DASH_ROW_LIMIT)).map(app => {
                  const patient = patients.find(p => p.id === app.patientId);
                  const hasDebt = patient?.balance !== undefined && patient.balance < 0;
                  const hasLabWarning = overdueLabPatients.has(app.patientName);
                  const doctorColor = doctors.find(d => d.id === app.doctorId)?.color || '#3B82F6';
                  return (
                    <tr
                      key={app.id}
                      className="border-b border-gray-50 dark:border-gray-800/60 last:border-0 hover:bg-gray-50/70 dark:hover:bg-gray-800/30 transition-colors group"
                    >
                      <td className="py-3.5 pr-4">
                        {!periodIsOneDay && (
                          <span className="block text-[10px] font-bold text-gray-400 tabular-nums">{app.date.slice(8, 10)}.{app.date.slice(5, 7)}</span>
                        )}
                        <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums">{app.time}</span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <button
                          onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left whitespace-nowrap"
                        >
                          {app.patientName}
                        </button>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: doctorColor }} />
                          <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{app.doctorName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{app.type}</span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge status={app.status} />
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          {hasDebt && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-black rounded-full border border-red-100 dark:border-red-900/30" title={t('auto.Qarz bor')}>
                              <AlertCircle className="w-3 h-3" /> {t('auto.Qarz')}
                            </span>
                          )}
                          {hasLabWarning && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-black rounded-full border border-amber-100 dark:border-amber-900/30" title={t('auto.Lab buyurtma muddati o\'tgan')}>
                              <FlaskConical className="w-3 h-3" /> {t('auto.Lab')}
                            </span>
                          )}
                          {!hasDebt && !hasLabWarning && (
                            <span className="text-[10px] text-gray-300 dark:text-gray-600 font-medium">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5">
                        {app.status !== 'Completed' && app.status !== 'Cancelled' && onUpdateAppointment && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* "Keldi" — faqat bugungi qabulga; o'tgan kunni "keldi" deb bo'lmaydi */}
                            {app.status !== 'Checked-In' && app.date === localToday && (
                              <button
                                onClick={() => onUpdateAppointment(app.id, { status: 'Checked-In' })}
                                title="Keldi — tasdiqlash"
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-lg transition-colors"
                              >
                                <UserCheck className="w-3 h-3" /> {t('auto.Keldi')}
                              </button>
                            )}
                            <button
                              onClick={() => navigate('/calendar')}
                              title={t('dashboard.moveDay')}
                              className="flex items-center gap-1 px-2 py-1 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-[10px] font-bold rounded-lg transition-colors"
                            >
                              <CalendarClock className="w-3 h-3" /> {t('auto.Ko\'chir')}
                            </button>
                            <button
                              onClick={() => onUpdateAppointment(app.id, { status: 'Cancelled' })}
                              title={t('dashboard.cancel')}
                              className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 text-[10px] font-bold rounded-lg transition-colors"
                            >
                              <XCircle className="w-3 h-3" /> {t('auto.Bekor')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Shu yerning o'zida ochiladi: kechagi yoki boshqa kungi qabulni qidirganda
                Kalendarga o'tib, davrni qaytadan tanlash shart emas */}
            {periodAppointments.length > DASH_ROW_LIMIT && (
              <button
                onClick={() => setShowAllPeriodAppts(v => !v)}
                className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
              >
                {showAllPeriodAppts
                  ? t('desk.showLess')
                  : <>{t('dashboard.moreAll')} {periodAppointments.length - DASH_ROW_LIMIT} {t('dashboard.count')} <ChevronRight className="w-3.5 h-3.5" /></>}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Yig'ilmagan pul — o'ng ustunda ustma-ust.
          Ikkalasi ham "hali olinmagan pul" bo'lgani uchun bir joyda turadi. */}
      {hasSideCards && (
        <div className="xl:col-span-4 space-y-6">

          {/* Nazoratga chaqirish — muddati kelgan qayta tashriflar */}
          {visibleRecalls.length > 0 && (
            <Card className="p-6 rounded-[2rem] border border-sky-200 dark:border-sky-800/50">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    {t('dashboard.recall.titleA')} <span className="text-sky-500">{t('dashboard.recall.titleB')}</span>
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    {t('dashboard.recall.desc')}
                  </p>
                </div>
                <span className="px-3 py-1 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-xs font-black rounded-full flex-shrink-0">
                  {visibleRecalls.length} {t('dashboard.count')}
                </span>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {(showAllRecalls ? visibleRecalls : visibleRecalls.slice(0, DASH_ROW_LIMIT)).map(recall => {
                  const overdue = recall.dueDate < recallToday;
                  const name = recall.patient ? `${recall.patient.lastName} ${recall.patient.firstName}` : '—';
                  return (
                    <div key={recall.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => onPatientClick && onPatientClick(recall.patientId)}
                          className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {name}
                        </button>
                        <p className="text-[11px] text-gray-400 truncate">
                          <span className={overdue ? 'text-red-500 font-semibold' : ''}>{recall.dueDate.split('-').reverse().join('.')}</span>
                          {overdue && <span className="text-red-500"> · {t('dashboard.recall.overdue')}</span>}
                          {recall.status === 'reminded' && <span> · {t('dashboard.recall.reminded')}</span>}
                          <span> · {recall.kind === 'treatment' ? t('dashboard.recall.kindTreatment') : t('dashboard.recall.kindCheckup')}</span>
                          {recall.reason && <span> · {recall.reason}</span>}
                        </p>
                      </div>
                      {recall.patient?.phone && (
                        <a
                          href={`tel:${recall.patient.phone}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" /> {t('dashboard.recall.call')}
                        </a>
                      )}
                      <button
                        onClick={() => dismissRecall(recall.id)}
                        title={t('dashboard.recall.dismiss')}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {visibleRecalls.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => setShowAllRecalls(v => !v)}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  {showAllRecalls ? t('dashboard.recall.less') : `${t('dashboard.moreAll')} ${visibleRecalls.length - DASH_ROW_LIMIT} ${t('dashboard.count')}`}
                  <ChevronRight className={`w-3.5 h-3.5 ${showAllRecalls ? '-rotate-90' : ''}`} />
                </button>
              )}
            </Card>
          )}

          {/*
            Ikkita alohida karta. Ro'yxat bitta manbadan quriladi
            (buildUnpaidRows dublikatni yo'qotadi), keyin qarz belgisi bo'yicha
            ikkiga bo'linadi — shunda bir pul ikkala kartada ko'rinmaydi.
          */}
          {debtRows.length > 0 && (
            <Card className="p-6 rounded-[2rem] border border-red-200 dark:border-red-800/50">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    {t('dashboard.debtsTitleA')} <span className="text-red-500">{t('dashboard.debtsTitleB')}</span>
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    {t('dashboard.debtsDesc')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {showFinance && debtSum > 0 && (
                    <span className="px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-black rounded-full whitespace-nowrap">
                      {debtSum.toLocaleString()} UZS
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-gray-400">{debtRows.length} {t('dashboard.count')}</span>
                </div>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {debtRows.slice(0, DASH_ROW_LIMIT).map(renderUnpaidRow)}
              </div>

              {debtRows.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => navigate('/finance')}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  {t('dashboard.moreAll')} {debtRows.length - DASH_ROW_LIMIT} {t('dashboard.count')} · {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          )}

          {/* To'lovi olinmagan qabullar — kassada qarz sifatida yozilmagan pul */}
          {awaitingRows.length > 0 && (
            <Card className="p-6 rounded-[2rem] border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    {t('dashboard.unpaidTitleA')} <span className="text-amber-500">{t('dashboard.unpaidTitleB')}</span>
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    {isDoctor ? t('dashboard.unpaidDescDoctor') : t('dashboard.unpaidDesc')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {showFinance && awaitingSum > 0 && (
                    <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-black rounded-full whitespace-nowrap">
                      {awaitingSum.toLocaleString()} UZS
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-gray-400">{awaitingRows.length} {t('dashboard.count')}</span>
                </div>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {awaitingRows.slice(0, DASH_ROW_LIMIT).map(renderUnpaidRow)}
              </div>

              {awaitingRows.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => navigate('/finance')}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  {t('dashboard.moreAll')} {awaitingRows.length - DASH_ROW_LIMIT} {t('dashboard.count')} · {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      </div>

      {/* Hisobotlar — sahifa oxirida: bir nechta asosiy raqam va (shifokorda) grafiklar.
          Batafsil hisobot — Moliya → Hisobot. */}
      <DashReports
        periodLabel={periodLabel}
        items={reportItems}
        onOpenFull={canOpenFullReport ? () => navigate('/finance?tab=hisobot') : undefined}
      >
      {/* Grafiklar — faqat shifokorda (sababi yuqorida, isDoctor yonida) */}
      {isDoctor && (<>
        <TrendCharts appointments={filteredAppointments} transactions={filteredTransactions} showFinance={showFinance} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">
          <Card className="p-8 lg:col-span-2 rounded-[2rem]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">{t('auto.So\'nggi')} <span className="text-primary">{t('auto.Qabullar')}</span></h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colDateTime')}</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colPatient')}</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colDoctor')}</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colService')}</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('dashboard.colStatus')}</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('auto.Baho')}</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredAppointments.slice(0, 5).map(app => (
                    <tr key={app.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <td className="py-4 font-medium text-gray-900 dark:text-white">{app.date} {app.time}</td>
                      <td className="py-4 text-gray-600 dark:text-gray-300">{app.patientName}</td>
                      <td className="py-4 text-gray-500">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: doctors.find(d => d.id === app.doctorId)?.color || '#3B82F6' }} />
                          {app.doctorName}
                        </div>
                      </td>
                      <td className="py-4 text-gray-500">{app.type}</td>
                      <td className="py-4"><Badge status={app.status} /></td>
                      <td className="py-4">
                        {app.review ? (
                          <div className="flex items-center gap-0.5 text-yellow-500">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`w-3 h-3 ${i < app.review.rating ? 'fill-current' : 'text-gray-200'}`} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">{t('auto.Baholanmagan')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAppointments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-gray-500">{t('auto.Qabullar topilmadi')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-8 rounded-[2rem]">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">{t('dashboard.recentAppointments')}</h3>
            <div className="space-y-8 relative before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700">
              {(() => {
                // Combine recent activities from all sources
                const activities: Array<{ type: string; text: string; time: Date; icon: any; color: string }> = [];

                // Recent patients (last 5)
                patients.slice(-5).reverse().forEach(patient => {
                  const createdDate = new Date(patient.lastVisit);
                  activities.push({
                    type: 'patient',
                    text: `Yangi bemor ro'yxatga olindi: ${patient.lastName} ${patient.firstName}`,
                    time: createdDate,
                    icon: Users,
                    color: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  });
                });

                // Recent transactions (last 5) — moliya yashirilgan rolga ko'rsatilmaydi
                if (showFinance) filteredTransactions.slice(-5).reverse().forEach(tx => {
                  const txDate = new Date(tx.date);
                  activities.push({
                    type: 'transaction',
                    text: `To'lov qabul qilindi: ${tx.amount.toLocaleString()} UZS - ${tx.service}`,
                    time: txDate,
                    icon: DollarSign,
                    color: 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success'
                  });
                });

                // Recent completed appointments (last 5)
                filteredAppointments
                  .filter(a => a.status === 'Completed')
                  .slice(-5)
                  .reverse()
                  .forEach(appt => {
                    const apptDate = new Date(`${appt.date} ${appt.time}`);
                    activities.push({
                      type: 'appointment',
                      text: `${appt.doctorName} ${appt.type} yakunladi`,
                      time: apptDate,
                      icon: CheckCircle,
                      color: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                    });
                  });

                // Sort by time (most recent first) and take top 5
                const sortedActivities = activities
                  .sort((a, b) => b.time.getTime() - a.time.getTime())
                  .slice(0, 5);

                // Helper function to format time ago
                const getTimeAgo = (date: Date) => {
                  if (!date || isNaN(date.getTime())) return t('dashboard.recently');
                  const now = new Date();
                  const diffMs = now.getTime() - date.getTime();
                  if (diffMs < 0) return t('dashboard.justNow'); // Handle future dates gracefully
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);

                  if (diffMins < 1) return t('dashboard.justNow');
                  if (diffMins < 60) return `${diffMins} daq oldin`;
                  if (diffHours < 24) return `${diffHours} soat oldin`;
                  return `${diffDays} kun oldin`;
                };

                if (sortedActivities.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {t('auto.Hozircha faoliyat yo\'q')}
                    </div>
                  );
                }

                return sortedActivities.map((item, i) => (
                  <div key={i} className="flex gap-4 relative z-10">
                    <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${item.color} border-4 border-white dark:border-gray-800 shadow-sm transition-transform hover:scale-110`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.text}</p>
                      <p className="text-xs text-gray-500">{getTimeAgo(item.time)}</p>
                    </div>
                  </div>
                ));
              })()}
            </div >
          </Card >
        </div >

        <IntensityChart appointments={appointments} />
      </>)}
      </DashReports>

      {/* Qarz to'lash modali — qisman yoki to'liq */}
      {payingDebt && (() => {
        const debtTotal = payingDebt.amount;
        const entered = Math.min(Number(debtPayAmount) || 0, debtTotal);
        const remaining = debtTotal - entered;
        const serviceLabel = payingDebt.service?.includes('|') ? payingDebt.service.split('||')[0].split('|')[0] : (payingDebt.service || '—');
        return (
          <Modal isOpen={true} onClose={() => setPayingDebt(null)} title="💳 Qarzni to'lash" className="max-w-md">
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{payingDebt.patientName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{serviceLabel} · {payingDebt.date}</p>
                <p className="text-lg font-black text-red-500 mt-2 tabular-nums">{debtTotal.toLocaleString()} UZS</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">To'lanayotgan summa (UZS)</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setDebtPayAmount(String(Math.round(debtTotal / 2)))}
                      className="px-2 py-0.5 text-[10px] font-bold text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100"
                    >{t('dashboard.half')}</button>
                    <button
                      type="button"
                      onClick={() => setDebtPayAmount(String(debtTotal))}
                      className="px-2 py-0.5 text-[10px] font-bold text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100"
                    >{t('dashboard.seeAll')}</button>
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={debtTotal}
                  value={debtPayAmount}
                  onChange={e => setDebtPayAmount(e.target.value)}
                  onWheel={e => e.currentTarget.blur()}
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/30 dark:text-white tabular-nums"
                />
                {entered > 0 && remaining > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1.5">
                    Qoldiq qarz: {remaining.toLocaleString()} UZS (qarzdorlarda qoladi)
                  </p>
                )}
                {entered > 0 && remaining === 0 && (
                  <p className="text-xs text-success-600 dark:text-success font-medium mt-1.5">
                    {t('auto.Qarz to\'liq yopiladi')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('auto.To\'lov usuli')}</label>
                <div className="flex gap-2 flex-wrap">
                  {INCOMING_PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDebtPayMethod(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${debtPayMethod === m
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                    >
                      {getPaymentMethodLabel(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setPayingDebt(null)}>{t('auto.Bekor')}</Button>
                <button
                  disabled={debtSaving || entered <= 0}
                  onClick={handleDebtPayment}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-success hover:bg-success-700 disabled:bg-success/50 disabled:cursor-not-allowed transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  {debtSaving ? 'Saqlanmoqda...' : "To'lovni qabul qilish"}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
        </div>

      {waivingRow?.appointment && onAddTransaction && (
        <WaiveAppointmentModal
          isOpen
          onClose={() => setWaivingRow(null)}
          patientName={waivingRow.patientName}
          date={waivingRow.date}
          amount={waivingRow.amount}
          onConfirm={async reason => {
            await onAddTransaction(buildWaivedTransaction(waivingRow.appointment!, services, reason));
          }}
        />
      )}

      {/* Tezkor amal modallari */}
      {onAddPatient && (
        <AddPatientModal
          isOpen={isAddPatientOpen}
          onClose={() => setIsAddPatientOpen(false)}
          onAddPatient={onAddPatient}
          doctors={doctors}
          userRole={userRole}
          doctorId={doctorId}
          compact
          onCreated={(p) => onPatientClick?.(p.id)}
          patients={patients}
          onOpenExisting={id => onPatientClick?.(id)}
          initialValues={newPatientPrefill}
        />
      )}
      {onAddTransaction && (() => {
        const { total: presetAmount } = payingAppointment
          ? calculateAppointmentTotal(payingAppointment.notes || '', services)
          : { total: 0 };
        return (
          <QuickPaymentModal
            isOpen={isQuickPaymentOpen}
            onClose={() => { setIsQuickPaymentOpen(false); setPayingAppointment(null); }}
            patients={patients}
            doctors={doctors}
            services={services}
            clinicId={clinicId}
            onAddTransaction={onAddTransaction}
            presetPatientId={payingAppointment?.patientId}
            presetDoctorId={payingAppointment?.doctorId || (userRole === UserRole.DOCTOR ? doctorId : undefined)}
            presetService={payingAppointment?.type}
            presetAmount={presetAmount || undefined}
            presetDate={payingAppointment?.date}
            canChangeDate={perms.flag('money', 'backdate')}
            maxDiscountPercent={perms.limit('money', 'discount')}
          />
        );
      })()}
    </div>
  );
};
