import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, Badge, Input, Modal, Button } from '../components/Common';
import { StatCard } from '../components/StatCard';
import {
  Users, Calendar, DollarSign, TrendingUp, TrendingDown,
  CheckCircle, Clock, AlertCircle, Plus, ChevronRight, Star, ArrowLeft,
  Zap, FlaskConical, CreditCard, UserPlus, UserCheck, XCircle, CalendarClock, Bot, Phone
} from 'lucide-react';
import { TrendCharts, IntensityChart } from '../components/AppointmentCharts';
import { Patient, Appointment, Transaction, UserRole, Doctor, Lead, LabOrder, Clinic, Service, PaymentMethod, Recall } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { getCurrentMonthRange } from '../utils/dateUtils';
import { transactionBelongsToDoctor, calculateAppointmentTotal, isAppointmentPaid } from '../utils/financialCalculations';
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
  showFinance?: boolean; // Ruxsatlar: pul ko'rsatkichlari (KPI, tushum grafigi, qarzdorlar)
  onPatientClick?: (id: string) => void;
  onUpdateAppointment?: (id: string, data: Partial<Appointment>) => Promise<void>;
  onUpdateTransaction?: (id: string, data: Partial<Transaction>) => Promise<void>;
  onAddPatient?: (data: Omit<Patient, 'id' | 'clinicId'>) => Promise<Patient | void>;
  onAddTransaction?: (tx: Omit<Transaction, 'id'>) => Promise<any>;
  onAddAppointment?: (appt: Omit<Appointment, 'id'>) => Promise<any>;
  addToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

// Dashboard ro'yxatlarida ko'rsatiladigan qatorlar soni. Qolgani "Hammasi" ortida —
// dashboard umumiy holatni ko'rsatadi, to'liq ro'yxat o'z sahifasida.
const DASH_ROW_LIMIT = 4;

// Kartalar soniga qarab ustunlar — qatorda bo'sh katak qolmasin
const STAT_GRID_COLS: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  6: 'lg:grid-cols-3 xl:grid-cols-6',
};

export const Dashboard: React.FC<DashboardProps> = ({ patients, appointments, transactions, reviews, userRole, doctorId, doctors, leads, labOrders = [], services = [], currentClinic, clinicId = '', showFinance = true, onPatientClick, onUpdateAppointment, onUpdateTransaction, onAddPatient, onAddTransaction, onAddAppointment }) => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
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
  const today = new Date().toISOString().split('T')[0];
  const { startDate: defaultStart, endDate: defaultEnd } = getCurrentMonthRange();
  const [startDate, setStartDate] = useState(isReceptionist ? today : defaultStart);
  const [endDate, setEndDate] = useState(isReceptionist ? today : defaultEnd);

  // Filter data for doctors - only show their appointments and transactions
  const filteredAppointmentsByDoctor = useMemo(() => {
    if (userRole === UserRole.DOCTOR && doctorId) {
      return appointments.filter(a => a.doctorId === doctorId);
    }
    return appointments;
  }, [appointments, userRole, doctorId]);

  const filteredTransactionsByDoctor = useMemo(() => {
    if (userRole === UserRole.DOCTOR && doctorId) {
      // Qat'iy atributsiya: doctorId yoki aniq ism tengligi (taxminiy moslashtirish yo'q)
      const doctor = doctors.find(d => d.id === doctorId);
      return transactions.filter(t => {
        if (t.doctorId) return t.doctorId === doctorId;
        return doctor ? transactionBelongsToDoctor(t, doctor) : false;
      });
    }
    return transactions;
  }, [transactions, doctors, userRole, doctorId]);

  // --- Filter Logic ---
  const isDateInRange = (dateStr: string) => {
    if (!startDate && !endDate) return true;
    const itemDate = new Date(dateStr);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (start && itemDate < start) return false;
    if (end && itemDate > end) return false;
    return true;
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
    const base = userRole === UserRole.DOCTOR && doctorId
      ? appointments.filter(a => a.doctorId === doctorId)
      : appointments;
    return base
      .filter(a => a.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, today, userRole, doctorId]);

  // Overdue lab orders (by patient name)
  const overdueLabPatients = useMemo(() => {
    return new Set(
      labOrders
        .filter(o => ['Pending', 'In-Progress'].includes(o.status) && o.deadline < today)
        .map(o => o.patientName)
    );
  }, [labOrders, today]);

  // Tanlangan davrda yakunlangan, lekin hali to'lanmagan qabullar — ресепшн шу ердан бирдан ёпиши учун
  const unpaidCompleted = useMemo(() => {
    return filteredAppointments
      .filter(app =>
        (app.status === 'Completed' || app.status === 'Checked-In') && !isAppointmentPaid(app, transactions)
      )
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [filteredAppointments, transactions]);

  // Kutilayotgan to'lovlar (qarzdorlar) — Pending/Overdue tranzaksiyalar, davr filtridan qat'i nazar
  const pendingDebts = useMemo(() => {
    return filteredTransactionsByDoctor
      .filter(t => t.status === 'Pending' || t.status === 'Overdue')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactionsByDoctor]);

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
    () => (doctorId ? dueRecalls.filter(r => r.doctorId === doctorId) : dueRecalls),
    [dueRecalls, doctorId]);
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

  const hasMoneyCards = (showFinance && pendingDebts.length > 0) || unpaidCompleted.length > 0;
  // O'ng ustunda nazorat ro'yxati ham turadi
  const hasSideCards = hasMoneyCards || visibleRecalls.length > 0;

  const pendingDebtsTotal = useMemo(() =>
    pendingDebts.reduce((acc, t) => acc + t.amount, 0)
    , [pendingDebts]);

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
    unpaidCompleted: unpaidCompleted.length,
  }), [todayAppointments, filteredAppointments, totalRevenue, newLeadsCount, pendingDebts, pendingRevenue, totalPatients, avgCheck, unpaidCompleted]);

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
        {!isReceptionist && (
          <div className="flex items-center gap-1 p-1.5 pl-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-1.5">{t('dashboard.period')}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 p-0 px-1 cursor-pointer w-[118px]"
            />
            <span className="text-gray-300 dark:text-gray-600 select-none">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 p-0 px-1 cursor-pointer w-[118px]"
            />
          </div>
        )}

          {/* Quick Actions — dashboarddan turib bajariladi */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAddPatient ? setIsAddPatientOpen(true) : navigate('/patients')}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t('dashboard.quickPatient')}
            </button>
            <button
              onClick={() => navigate('/calendar')}
              className="flex items-center gap-1.5 px-3 py-2 bg-info hover:bg-info-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5" />
              {t('dashboard.quickAppointment')}
            </button>
            {!isReceptionist && (
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

      {/* UMUMIY */}
        <div className="space-y-6">
          {/* Olib tashlangan takrorlar: "Jami bemorlar" Bemorlar sahifasida,
              "O'rtacha chek" Hisobotda bor. Shifokorda ular qoladi. */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${STAT_GRID_COLS[(isDoctor ? 3 : 2) + (showFinance ? (isDoctor ? 3 : 2) : 0)]}`}>
        {isDoctor && (
        <StatCard
          label={t('dashboard.totalPatients')} value={totalPatients.toLocaleString()} icon={Users} color="primary"
          subtitle={<span className="flex items-center"><span className="font-bold text-success-600 bg-success-50 dark:bg-success-900/30 px-1.5 py-0.5 rounded-full">+{activePatients}</span><span className="ml-1.5">{t('dashboard.active')}</span></span>}
        />
        )}
        <StatCard
          label={t('dashboard.todayAppointments')} value={periodAppointmentsCount} icon={Calendar} color="info"
          subtitle={pendingAppointments > 0 ? `${pendingAppointments} ${t('dashboard.pending')}` : t('dashboard.allOk')}
        />
        <StatCard
          label={t('dashboard.newLeads')} value={newLeadsCount} icon={Star} color="warning"
          subtitle={t('dashboard.fromAds')}
        />
        {showFinance && (<>
          {isDoctor && (
          <StatCard
            label={t('dashboard.avgCheck')} value={avgCheck.toLocaleString()} unit="UZS" icon={TrendingUp} color="success"
            subtitle={t('dashboard.perPatient')}
          />
          )}
          <StatCard
            label={t('dashboard.pending')} value={pendingRevenue.toLocaleString()} unit="UZS" icon={Clock} color="warning"
            subtitle={t('dashboard.unpaid')}
          />
          <StatCard
            label={t('dashboard.todayRevenue')} value={totalRevenue.toLocaleString()} unit="UZS" icon={DollarSign} color="success" variant="gradient"
            subtitle={isReceptionist ? t('dashboard.todayLabel') : t('dashboard.selectedPeriod')}
          />
        </>)}
      </div>

      {/* Kunning ikki savoli yonma-yon: bugun kim keladi va qancha pul
          yig'ilmagan. Nisbat 8/4 — jadvalda yettita ustun bor, u tor joyda
          gorizontal siljishga tushib qoladi; o'ngdagi ro'yxatlar esa
          oddiy va tor kenglikda ham bemalol o'qiladi. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

      {/* Bugungi Qabullar */}
      <Card className={`p-6 rounded-[2rem] ${hasSideCards ? 'xl:col-span-8' : 'xl:col-span-12'}`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              {t('dashboard.todayTitleA')} <span className="text-primary">{t('dashboard.todayTitleB')}</span>
            </h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              {new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-black rounded-full">
              {todayAppointments.length} {t('dashboard.count')}
            </span>
            <button
              onClick={() => navigate('/calendar')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
            >
              {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {todayAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Calendar className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">{t('dashboard.noAppointmentsToday')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {todayAppointments.slice(0, DASH_ROW_LIMIT).map(app => {
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
                            {app.status !== 'Checked-In' && (
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

            {todayAppointments.length > DASH_ROW_LIMIT && (
              <button
                onClick={() => navigate('/calendar')}
                className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
              >
                {t('dashboard.moreAll')} {todayAppointments.length - DASH_ROW_LIMIT} {t('dashboard.count')} · {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
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

          {/* Qarzdorlar — qarzga yozilgan, yopilmagan to'lovlar */}
          {showFinance && pendingDebts.length > 0 && (
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
                  <span className="px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-black rounded-full whitespace-nowrap">
                    {pendingDebtsTotal.toLocaleString()} UZS
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">{pendingDebts.length} {t('dashboard.count')}</span>
                </div>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {pendingDebts.slice(0, DASH_ROW_LIMIT).map(tx => {
                  const patient = patients.find(p => p.id === tx.patientId)
                    || patients.find(p => `${p.lastName} ${p.firstName}` === tx.patientName);
                  const serviceLabel = tx.service?.includes('|') ? tx.service.split('||')[0].split('|')[0] : (tx.service || '—');
                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-3 group">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
                          className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {tx.patientName}
                        </button>
                        <p className="text-[11px] text-gray-400 truncate">{String(tx.date).slice(0, 10)} · {serviceLabel}</p>
                      </div>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
                        {tx.amount.toLocaleString()}
                      </span>
                      {onUpdateTransaction && (
                        <button
                          onClick={() => openDebtPayment(tx)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-success hover:bg-success-700 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> {t('auto.To\'lov')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {pendingDebts.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => navigate('/finance')}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  {t('dashboard.moreAll')} {pendingDebts.length - DASH_ROW_LIMIT} {t('dashboard.count')} · {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          )}

          {/* To'lovni kutayotgan qabullar — protsedura yakunlangan, to'lov olinmagan */}
          {unpaidCompleted.length > 0 && (
            <Card className="p-6 rounded-[2rem] border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    {t('dashboard.unpaidTitleA')} <span className="text-amber-500">{t('dashboard.unpaidTitleB')}</span>
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    {t('dashboard.unpaidDesc')}
                  </p>
                </div>
                <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-black rounded-full flex-shrink-0">
                  {unpaidCompleted.length} {t('dashboard.count')}
                </span>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {unpaidCompleted.slice(0, DASH_ROW_LIMIT).map(app => {
                  const patient = patients.find(p => p.id === app.patientId);
                  const doctorColor = doctors.find(d => d.id === app.doctorId)?.color || '#3B82F6';
                  const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                  const serviceLabel = breakdown ? breakdown.split('||')[0].split('|')[0] : app.type;
                  return (
                    <div key={app.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
                          className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {app.patientName}
                        </button>
                        <p className="flex items-center gap-1.5 text-[11px] text-gray-400 truncate">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: doctorColor }} />
                          <span className="truncate">{app.date} · {serviceLabel}</span>
                        </p>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                        {total > 0 ? total.toLocaleString() : '—'}
                      </span>
                      {onAddTransaction && (
                        <button
                          onClick={() => openPaymentForAppointment(app)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-success hover:bg-success-700 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> {t('auto.Yopish')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {unpaidCompleted.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => navigate('/finance')}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  {t('dashboard.moreAll')} {unpaidCompleted.length - DASH_ROW_LIMIT} {t('dashboard.count')} · {t('dashboard.seeAll')} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      </div>

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
          />
        );
      })()}
    </div>
  );
};
