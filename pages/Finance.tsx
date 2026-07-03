
import React, { useState } from 'react';
import { Card, Button, Badge, Select, Modal, Input } from '../components/Common';
import { UserRole, Transaction, Appointment, Patient, Clinic, LabOrder } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, Filter, DollarSign, CreditCard, Wallet, X, TrendingDown, UserCheck, AlertOctagon, Calendar, Bot, Users, Clock, Printer, Plus, Banknote } from 'lucide-react';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { calculateTotalFinancials } from '../utils/financialCalculations';

import { ReceiptModal } from '../components/ReceiptModal';

interface FinanceProps {
  userRole: UserRole;
  transactions: Transaction[];
  appointments: Appointment[];
  services: { name: string; price: number; duration: number }[];
  patients: Patient[];
  onPatientClick: (id: string) => void;
  doctorId: string;
  doctors: Doctor[];
  currentClinic?: Clinic;
  labOrders?: LabOrder[];
  onAddTransaction?: (tx: Omit<Transaction, 'id'>) => Promise<void>;
}

import { Doctor, InstallmentPlan } from '../types';
import { getCurrentMonthRange } from '../utils/dateUtils';

export const Finance: React.FC<FinanceProps> = ({ userRole, transactions, appointments, services, patients, onPatientClick, doctorId, doctors, currentClinic, labOrders, onAddTransaction }) => {
  const [installments, setInstallments] = useState<InstallmentPlan[]>([]);
  const { t } = useLanguage();
  const isReceptionist = userRole === UserRole.RECEPTIONIST;
  const today = new Date().toISOString().split('T')[0];
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDebtorModalOpen, setIsDebtorModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('Barchasi');
  const [remindedDebtors, setRemindedDebtors] = useState<Set<string>>(new Set());
  const [selectedDebtorDoctorId, setSelectedDebtorDoctorId] = useState<string>('All');

  // Add Payment Modal State
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [isExpense, setIsExpense] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    patientId: '',
    doctorId: '',
    service: '',
    amount: '',
    type: 'Cash' as 'Cash' | 'Card' | 'Insurance' | 'Balance' | 'Expense',
    notes: '',
  });
  const [paymentLoading, setPaymentLoading] = useState(false);

  const handleAddPayment = async () => {
    if (!paymentForm.amount || (!isExpense && !paymentForm.patientId)) return;
    setPaymentLoading(true);
    try {
      const patient = patients.find(p => p.id === paymentForm.patientId);
      const doctor = doctors.find(d => d.id === paymentForm.doctorId);
      const clinicId = patients[0]?.clinicId || '';
      await onAddTransaction?.({
        patientName: isExpense ? (paymentForm.service || 'Xarajat') : (patient ? `${patient.lastName} ${patient.firstName}` : ''),
        date: today,
        amount: parseFloat(paymentForm.amount),
        type: isExpense ? 'Expense' : paymentForm.type,
        service: paymentForm.service || (isExpense ? 'Umumiy Xarajat' : 'To\'lov'),
        status: 'Paid',
        clinicId,
        patientId: isExpense ? undefined : paymentForm.patientId || undefined,
        doctorId: paymentForm.doctorId || undefined,
        doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : undefined,
      });
      setIsAddPaymentOpen(false);
      setPaymentForm({ patientId: '', doctorId: '', service: '', amount: '', type: 'Cash', notes: '' });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Date Range State
  const { startDate: defaultStart, endDate: defaultEnd } = getCurrentMonthRange();
  const [startDate, setStartDate] = useState(isReceptionist ? today : defaultStart);
  const [endDate, setEndDate] = useState(isReceptionist ? today : defaultEnd);

  const loadInstallments = async () => {
    if (isReceptionist || !patients.length) return;
    try {
      const clinicId = patients[0]?.clinicId;
      if (clinicId) {
        const data = await api.installments.getAll(clinicId);
        setInstallments(data);
      }
    } catch (err) {
      console.error('Failed to load installments:', err);
    }
  };

  React.useEffect(() => {
    loadInstallments();
  }, [patients]);

  // Filter data for doctors - only show their appointments and transactions
  const filteredAppointmentsByDoctor = userRole === UserRole.DOCTOR && doctorId
    ? appointments.filter(a => a.doctorId === doctorId)
    : appointments;

  const filteredTransactionsByDoctor = userRole === UserRole.DOCTOR && doctorId
    ? transactions.filter(t => {
      // Match transaction to doctor's appointments
      const matchingAppt = filteredAppointmentsByDoctor.find(a =>
        a.patientName === t.patientName && a.type === t.service
      );
      return matchingAppt !== undefined;
    })
    : transactions;

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

  const filteredTransactions = filteredTransactionsByDoctor.filter(t => {
    const matchesStatus = filterStatus === 'Barchasi' || t.status === filterStatus;
    const matchesDate = isDateInRange(t.date);
    return matchesStatus && matchesDate;
  });

  // Filter appointments for Lost Revenue calculation to match the selected timeframe
  const filteredAppointments = filteredAppointmentsByDoctor.filter(a => isDateInRange(a.date));

  // Calculate debtors from transactions (only Pending, not Overdue since it's not used)
  const debtTransactions = transactions.filter(t => t.status === 'Pending');
  const transactionDebt = debtTransactions.reduce((acc, t) => acc + t.amount, 0);

  // Installment debt
  const installmentDebt = (installments || []).reduce((acc, plan) => acc + ((plan?.totalAmount || 0) - (plan?.totalPaid || 0)), 0);
  const totalDebt = transactionDebt + installmentDebt;

  // Create a map of patientName -> patientId from patients list
  const patientIdMap = new Map<string, string>();
  patients.forEach(p => {
    patientIdMap.set(`${p.lastName} ${p.firstName}`, p.id);
    // Also map just first name or variations if needed, but for now exact match or partial
    patientIdMap.set(p.firstName, p.id); // Fallback
  });

  // Group debts by patient
  const debtorMap = new Map<string, { name: string; amount: number; date: string; patientId?: string }>();
  debtTransactions.forEach(t => {
    const existing = debtorMap.get(t.patientName);
    if (existing) {
      existing.amount += t.amount;
      // Keep the earliest date
      if (new Date(t.date) < new Date(existing.date)) {
        existing.date = t.date;
      }
    } else {
      debtorMap.set(t.patientName, {
        name: t.patientName,
        amount: t.amount,
        date: t.date,
        patientId: patientIdMap.get(t.patientName) || patients.find(p => `${p.lastName} ${p.firstName}` === t.patientName)?.id
      });
    }
  });

  const installmentDebtMap = new Map<string, number>();
  installments.forEach(plan => {
    const patient = patients.find(p => p.id === plan.patientId);
    if (patient) {
      const name = `${patient.lastName} ${patient.firstName}`;
      installmentDebtMap.set(name, (installmentDebtMap.get(name) || 0) + (plan.totalAmount - plan.totalPaid));
    }
  });

  debtorMap.forEach((debtor, name) => {
    debtor.amount += installmentDebtMap.get(name) || 0;
  });

  // Upcoming Installments for current month
  const { startDate: monthStart, endDate: monthEnd } = getCurrentMonthRange();
  const upcomingItems = installments.flatMap(p => p.items || [])
    .filter(item => item.status === 'Pending' && item.expectedDate >= monthStart && item.expectedDate <= monthEnd);
  const upcomingInstallmentAmount = upcomingItems.reduce((acc, item) => acc + item.amount, 0);

  const DEBTORS = Array.from(debtorMap.values())
    .map((d, index) => {
      const debtDate = new Date(d.date);
      const isValidDate = !isNaN(debtDate.getTime());
      const daysDiff = isValidDate
        ? Math.floor((new Date().getTime() - debtDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const patient = patients.find(p => p.id === d.patientId);

      return {
        id: d.patientId || `debtor-${index}`,
        name: d.name,
        amount: d.amount,
        phone: patient?.phone || '',
        days: Math.max(0, daysDiff),
        patientId: d.patientId,
        doctorId: patient?.doctorId || null
      };
    })
    .filter(d => d.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const filteredDebtors = DEBTORS.filter(d => {
    if (selectedDebtorDoctorId === 'All') return true;
    return d.doctorId === selectedDebtorDoctorId;
  });

  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptTransaction, setReceiptTransaction] = useState<Transaction | null>(null);

  const PAYMENT_METHOD_DATA = [
    { name: 'Naqd', value: filteredTransactions.filter(t => t.type === 'Cash').length, color: '#10B981' },
    { name: 'Karta', value: filteredTransactions.filter(t => t.type === 'Card').length, color: '#3B82F6' },
    { name: 'Sug\'urta', value: filteredTransactions.filter(t => t.type === 'Insurance').length, color: '#8B5CF6' },
  ];

  const totalRevenue = filteredTransactions.reduce((acc, t) => acc + (t.type !== 'Expense' ? t.amount : 0), 0);

  // --- Financial Breakdown Logic ---
  // Use shared utility function for consistent calculations
  const { doctorSalaries, inventoryCosts } = calculateTotalFinancials(
    filteredTransactions,
    doctors,
    services
  );

  // Calculate actual technician costs from lab orders
  const filteredLabOrders = (labOrders || []).filter(o => o.status !== 'Cancelled' && isDateInRange(o.orderedAt));
  const technicianCosts = filteredLabOrders.reduce((sum, o) => sum + (o.price || 0), 0);
  const netProfit = totalRevenue - technicianCosts - doctorSalaries - inventoryCosts;

  // --- Lost Revenue Logic ---
  const noShowAppointments = filteredAppointments.filter(a => a.status === 'No-Show');

  // Calculate estimated loss based on service prices
  const lostRevenue = noShowAppointments.reduce((sum, app) => {
    const service = services.find(s => s.name === app.type);
    // Fallback price if service name doesn't match perfectly (e.g. 100,000 for standard consultation)
    const price = service ? service.price : 100000;
    return sum + price;
  }, 0);

  // Calculate "Recovered" patients (No-Show but came back later)
  const recoveredPatientIds = new Set();
  noShowAppointments.forEach(nsApp => {
    const hasReturned = appointments.some(a =>
      a.patientId === nsApp.patientId &&
      (a.status === 'Completed' || a.status === 'Confirmed') &&
      new Date(a.date) > new Date(nsApp.date)
    );
    if (hasReturned) recoveredPatientIds.add(nsApp.patientId);
  });

  const uniqueNoShowPatients = new Set(noShowAppointments.map(a => a.patientId)).size;
  const recoveredCount = recoveredPatientIds.size;
  const lostCustomersCount = uniqueNoShowPatients - recoveredCount;

  const handleExport = () => {
    // Comprehensive Financial Report with 20+ metrics
    const now = new Date();
    const reportDate = now.toLocaleDateString('uz-UZ');
    const reportTime = now.toLocaleTimeString('uz-UZ');

    // Calculate all metrics
    const totalTransactions = filteredTransactions.length;
    const paidTransactions = filteredTransactions.filter(t => t.status === 'Paid');
    const pendingTransactions = filteredTransactions.filter(t => t.status === 'Pending');
    const overdueTransactions = filteredTransactions.filter(t => t.status === 'Overdue');

    const cashPayments = filteredTransactions.filter(t => t.type === 'Cash');
    const cardPayments = filteredTransactions.filter(t => t.type === 'Card');
    const insurancePayments = filteredTransactions.filter(t => t.type === 'Insurance');

    const cashRevenue = cashPayments.reduce((sum, t) => sum + t.amount, 0);
    const cardRevenue = cardPayments.reduce((sum, t) => sum + t.amount, 0);
    const insuranceRevenue = insurancePayments.reduce((sum, t) => sum + t.amount, 0);

    const paidRevenue = paidTransactions.reduce((sum, t) => sum + t.amount, 0);
    const pendingRevenue = pendingTransactions.reduce((sum, t) => sum + t.amount, 0);
    const overdueRevenue = overdueTransactions.reduce((sum, t) => sum + t.amount, 0);

    const avgTransactionAmount = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const avgPaidAmount = paidTransactions.length > 0 ? paidRevenue / paidTransactions.length : 0;

    // Service breakdown
    const serviceRevenue = new Map<string, number>();
    filteredTransactions.forEach(t => {
      serviceRevenue.set(t.service, (serviceRevenue.get(t.service) || 0) + t.amount);
    });
    const topService = Array.from(serviceRevenue.entries()).sort((a, b) => b[1] - a[1])[0];

    // Patient analysis
    const uniquePatients = new Set(filteredTransactions.map(t => t.patientName)).size;
    const avgRevenuePerPatient = uniquePatients > 0 ? totalRevenue / uniquePatients : 0;

    // Build CSV content
    let csvContent = "MOLIYA HISOBOTI\n";
    csvContent += `Sana: ${reportDate}\n`;
    csvContent += `Vaqt: ${reportTime}\n`;
    csvContent += `Davr: ${startDate || 'Boshlanish'} - ${endDate || 'Tugash'}\n`;
    csvContent += "\n";

    // Summary Metrics
    csvContent += "UMUMIY KO'RSATKICHLAR\n";
    csvContent += "Ko'rsatkich,Qiymat\n";
    csvContent += `1. Jami Daromad,${totalRevenue.toLocaleString()} UZS\n`;
    csvContent += `2. To'langan Daromad,${paidRevenue.toLocaleString()} UZS\n`;
    csvContent += `3. Kutilayotgan To'lovlar,${pendingRevenue.toLocaleString()} UZS\n`;
    csvContent += `4. Qarzdorlik,${overdueRevenue.toLocaleString()} UZS\n`;
    csvContent += `5. Jami Tranzaksiyalar,${totalTransactions} ta\n`;
    csvContent += `6. To'langan Tranzaksiyalar,${paidTransactions.length} ta\n`;
    csvContent += `7. Kutilayotgan Tranzaksiyalar,${pendingTransactions.length} ta\n`;
    csvContent += `8. Qarzdor Tranzaksiyalar,${overdueTransactions.length} ta\n`;
    csvContent += `9. O'rtacha Chek,${Math.round(avgTransactionAmount).toLocaleString()} UZS\n`;
    csvContent += `10. O'rtacha To'langan Chek,${Math.round(avgPaidAmount).toLocaleString()} UZS\n`;
    csvContent += "\n";

    // Payment Methods
    csvContent += "TO'LOV USULLARI\n";
    csvContent += "Usul,Soni,Summa\n";
    csvContent += `Naqd,${cashPayments.length} ta,${cashRevenue.toLocaleString()} UZS\n`;
    csvContent += `Karta,${cardPayments.length} ta,${cardRevenue.toLocaleString()} UZS\n`;
    csvContent += `Sug'urta,${insurancePayments.length} ta,${insuranceRevenue.toLocaleString()} UZS\n`;
    csvContent += "\n";

    // Patient Metrics
    csvContent += "BEMOR STATISTIKASI\n";
    csvContent += "Ko'rsatkich,Qiymat\n";
    csvContent += `11. Unikal Bemorlar,${uniquePatients} ta\n`;
    csvContent += `12. Bemor Boshiga O'rtacha Daromad,${Math.round(avgRevenuePerPatient).toLocaleString()} UZS\n`;
    csvContent += `13. Jami Qarzdorlar,${DEBTORS.length} ta\n`;
    csvContent += `14. Jami Qarzdorlik,${totalDebt.toLocaleString()} UZS\n`;
    csvContent += "\n";

    // Loss Analysis
    csvContent += "YO'QOTISHLAR TAHLILI\n";
    csvContent += "Ko'rsatkich,Qiymat\n";
    csvContent += `15. Yo'qotilgan Daromad (No-Show),${lostRevenue.toLocaleString()} UZS\n`;
    csvContent += `16. Kelmagan Qabullar,${noShowAppointments.length} ta\n`;
    csvContent += `17. Kelmagan Unikal Bemorlar,${uniqueNoShowPatients} ta\n`;
    csvContent += `18. Qaytarilgan Mijozlar,${recoveredCount} ta\n`;
    csvContent += `19. Yo'qotilgan Mijozlar,${lostCustomersCount} ta\n`;
    csvContent += `20. Qaytarish Darajasi,${uniqueNoShowPatients > 0 ? Math.round((recoveredCount / uniqueNoShowPatients) * 100) : 0}%\n`;
    csvContent += "\n";

    // Top Service
    csvContent += "ENG DAROMADLI XIZMAT\n";
    csvContent += `Xizmat,Daromad\n`;
    csvContent += `${topService ? topService[0] : 'N/A'},${topService ? topService[1].toLocaleString() : 0} UZS\n`;
    csvContent += "\n";

    // Detailed Transactions
    csvContent += "BATAFSIL TRANZAKSIYALAR\n";
    csvContent += "Sana,Bemor,Xizmat,To'lov Usuli,Summa,Status\n";
    filteredTransactions.forEach(t => {
      csvContent += `${t.date},${t.patientName},${t.service},${t.type},${t.amount},${t.status}\n`;
    });
    csvContent += "\n";

    // Debtors List
    csvContent += "QARZDORLAR RO'YXATI\n";
    csvContent += "Bemor,Summa,Kechikkan Kunlar\n";
    DEBTORS.forEach(d => {
      csvContent += `${d.name},${d.amount.toLocaleString()} UZS,${d.days} kun\n`;
    });

    // Create and download file
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `moliya_hisoboti_${reportDate.replace(/\//g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('finance.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isReceptionist ? t('finance.todayIncome') : t('finance.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quick payment/expense buttons */}
          {onAddTransaction && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsExpense(false); setIsAddPaymentOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                To'lov Qo'shish
              </button>
              <button
                onClick={() => { setIsExpense(true); setIsAddPaymentOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <Banknote className="w-3.5 h-3.5" />
                Xarajat
              </button>
            </div>
          )}

          {!isReceptionist && (
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-end">
              <div className="w-full sm:w-40">
                <Input
                  type="date"
                  label={t('finance.startDate')}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-40">
                <Input
                  type="date"
                  label={t('finance.endDate')}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button variant="secondary" onClick={handleExport} className="h-10 mt-6 sm:mt-0"><Download className="w-4 h-4 mr-2" /> {t('finance.exportCsv')}</Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 p-6 text-white shadow-lg shadow-blue-500/25">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-white/20 rounded-lg"><DollarSign className="w-4 h-4" /></div>
              <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">{isReceptionist ? t('finance.todayIncomeCard') : t('finance.totalIncome')}</p>
            </div>
            <h3 className="text-3xl font-black">{totalRevenue.toLocaleString()}</h3>
            <p className="text-blue-200 text-xs font-medium mt-0.5">UZS</p>
            <div className="mt-4 flex items-center text-xs text-blue-200 font-medium">
              <Calendar className="w-3.5 h-3.5 mr-1" />
              {isReceptionist ? today : (startDate || endDate ? t('finance.selectedPeriod') : t('finance.allTime'))}
            </div>
          </div>
        </div>
        {!isReceptionist && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-red-500 p-6 text-white shadow-lg shadow-orange-500/25">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-white/20 rounded-lg"><Wallet className="w-4 h-4" /></div>
                <p className="text-orange-100 text-xs font-semibold uppercase tracking-wider">{t('finance.debt')}</p>
              </div>
              <h3 className="text-3xl font-black">{totalDebt.toLocaleString()}</h3>
              <p className="text-orange-200 text-xs font-medium mt-0.5">UZS</p>
              <div className="mt-4 text-xs text-orange-200 font-medium">{DEBTORS.length} ta qarzdor bemor</div>
            </div>
          </div>
        )}
        {!isReceptionist && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-purple-600 to-purple-700 p-6 text-white shadow-lg shadow-purple-500/25">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-white/20 rounded-lg"><Clock className="w-4 h-4" /></div>
                <p className="text-purple-100 text-xs font-semibold uppercase tracking-wider">Bo'lib to'lash</p>
              </div>
              <h3 className="text-3xl font-black">{upcomingInstallmentAmount.toLocaleString()}</h3>
              <p className="text-purple-200 text-xs font-medium mt-0.5">UZS</p>
              <div className="mt-4 text-xs text-purple-200 font-medium">Shu oy kutilmoqda</div>
            </div>
          </div>
        )}
        {!isReceptionist && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-6 text-white shadow-lg shadow-emerald-500/25">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-white/20 rounded-lg"><CreditCard className="w-4 h-4" /></div>
                <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wider">{t('finance.avgCheck')}</p>
              </div>
              <h3 className="text-3xl font-black">
                {filteredTransactions.length ? Math.round(totalRevenue / filteredTransactions.length).toLocaleString() : 0}
              </h3>
              <p className="text-emerald-200 text-xs font-medium mt-0.5">UZS</p>
              <div className="mt-4 text-xs text-emerald-200 font-medium">{filteredTransactions.length} ta tranzaksiya</div>
            </div>
          </div>
        )}
      </div>

      {/* Financial Breakdown, Loss Analysis, Charts, Transactions, Debtors - hidden for receptionist */}
      {!isReceptionist && (<>
        {/* Financial Breakdown Cards */}
        <div className="mt-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600 rounded" />
            Xarajatlar va Foyda
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-xl">
                  <DollarSign className="w-5 h-5 text-red-500" />
                </div>
                <span className="text-[10px] font-bold text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">Chiqim</span>
              </div>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{t('finance.techCosts')}</p>
              <h3 className="text-xl font-black text-gray-900 dark:text-white mt-0.5">{technicianCosts.toLocaleString()}</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">UZS</p>
            </Card>

            <Card className="p-5 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                  <Wallet className="w-5 h-5 text-orange-500" />
                </div>
                <span className="text-[10px] font-bold text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">Chiqim</span>
              </div>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Ombor Xarajatlari</p>
              <h3 className="text-xl font-black text-gray-900 dark:text-white mt-0.5">{inventoryCosts.toLocaleString()}</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">UZS</p>
            </Card>

            <Card className="p-5 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <span className="text-[10px] font-bold text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">Maosh</span>
              </div>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{t('finance.doctorSalary')}</p>
              <h3 className="text-xl font-black text-gray-900 dark:text-white mt-0.5">{doctorSalaries.toLocaleString()}</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">UZS</p>
            </Card>

            <Card className={`p-5 hover:shadow-md transition-shadow ${netProfit >= 0 ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20' : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-xl ${netProfit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  <TrendingDown className={`w-5 h-5 rotate-180 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${netProfit >= 0 ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' : 'text-red-500 bg-red-100 dark:bg-red-900/30'}`}>
                  {netProfit >= 0 ? 'Foyda' : 'Zarar'}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('finance.netProfit')}</p>
              <h3 className={`text-xl font-black mt-0.5 ${netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{netProfit.toLocaleString()}</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">UZS</p>
            </Card>
          </div>
        </div>

        {/* Loss Analysis Section */}
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-2 flex items-center gap-2">
          <span className="w-6 h-0.5 bg-gray-300 dark:bg-gray-600 rounded" />
          {t('finance.lossAnalysis')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Financial Loss */}
          <Card className="p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('finance.lostRevenue')}</p>
                <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{lostRevenue.toLocaleString()} UZS</h3>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500">{t('finance.lossDesc')}</p>
          </Card>

          {/* Missed Appointments Count */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('finance.totalNoShow')}</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{noShowAppointments.length} ta</h3>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full">
                <AlertOctagon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
              </div>
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <span className="font-semibold text-gray-700 dark:text-gray-300">{uniqueNoShowPatients}</span> {t('finance.uniqueNoShow')}
            </div>
          </Card>

          {/* Recovered Patients */}
          <Card className="p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('finance.recoveredPatients')}</p>
                <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{recoveredCount} ta</h3>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                <UserCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {t('finance.recoveredDesc')}
              <span className="block mt-1 text-red-500 font-medium">{t('finance.lostCustomers')}: {lostCustomersCount} ta</span>
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <Card className="p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">{t('finance.paymentMethods')}</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PAYMENT_METHOD_DATA} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                    {PAYMENT_METHOD_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Debtors List (Mini) */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('finance.debtors')}</h3>
            <div className="space-y-4">
              {DEBTORS.slice(0, 2).map((d, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{d.name}</p>
                    <p className="text-xs text-red-500 font-medium">{d.days} {t('finance.daysLate')}</p>
                  </div>
                  <span className="font-bold text-gray-900 dark:text-white">{d.amount.toLocaleString()}</span>
                </div>
              ))}
              <Button variant="ghost" className="w-full text-sm mt-2" onClick={() => setIsDebtorModalOpen(true)}>{t('finance.viewAll')}</Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Bo'lib to'lash rejalari</h3>
                <p className="text-sm text-gray-500">{installments.filter(p => p.status === 'Active').length} ta faol shartnoma</p>
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-4">
              {installments.filter(p => p.status === 'Active').slice(0, 3).map(plan => (
                <div key={plan.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{plan.patient?.lastName} {plan.patient?.firstName}</p>
                    <p className="text-xs text-gray-500">{plan.service}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{(plan.totalAmount - plan.totalPaid).toLocaleString()} UZS</p>
                    <p className="text-[10px] text-gray-500">Qoldiq</p>
                  </div>
                </div>
              ))}
              <Button variant="ghost" className="w-full text-sm mt-2" onClick={() => setIsInstallmentModalOpen(true)}>{t('finance.viewAll')}</Button>
            </div>
          </Card>
        </div>

        {/* Transaction Table */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('finance.transactions')}</h3>
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                <Filter className="w-4 h-4 mr-2" /> {filterStatus}
              </Button>
              {isFilterOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                  {['Barchasi', 'Paid', 'Pending', 'Overdue'].map(status => (
                    <button
                      key={status}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => { setFilterStatus(status); setIsFilterOpen(false); }}
                    >
                      {status === 'Paid' ? 'To\'langan' : status === 'Pending' ? 'Kutilmoqda' : status === 'Overdue' ? 'Qarzdor' : status}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.date')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.patient')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.doctor')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.service')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.method')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.amount')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t('finance.table.status')}</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700 dark:text-gray-300">
                {filteredTransactions.map(t => (
                  <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4">{t.date}</td>
                    <td className="px-6 py-4 font-medium">{t.patientName}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{t.doctorName || '-'}</td>
                    <td className="px-6 py-4">{t.service}</td>
                    <td className="px-6 py-4">{t.type}</td>
                    <td className="px-6 py-4 font-medium">{t.amount.toLocaleString()} UZS</td>
                    <td className="px-6 py-4"><Badge status={t.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <Button size="sm" variant="secondary" onClick={() => { setReceiptTransaction(t); setIsReceiptModalOpen(true); }} title="Chek chiqarish">
                        <Printer className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Tranzaksiyalar topilmadi.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Installment Modal */}
        <Modal isOpen={isInstallmentModalOpen} onClose={() => setIsInstallmentModalOpen(false)} title="Bo'lib to'lash rejalari">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            {installments.map(plan => (
              <div key={plan.id} className="p-4 border border-gray-100 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-800/30">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-lg">
                      {plan.patient?.lastName} {plan.patient?.firstName}
                    </h4>
                    <p className="text-sm text-gray-500 italic">{plan.service}</p>
                  </div>
                  <Badge status={plan.status === 'Active' ? 'pending' : 'completed'} />
                </div>
                <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-100 dark:border-gray-800 text-center">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Jami</p>
                    <p className="font-bold text-sm">{plan.totalAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase text-green-600">To'landi</p>
                    <p className="font-bold text-sm text-green-600">{plan.totalPaid.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase text-red-600">Qoldiq</p>
                    <p className="font-bold text-sm text-red-600">{(plan.totalAmount - plan.totalPaid).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => {
                    setIsInstallmentModalOpen(false);
                    if (plan.patientId) onPatientClick(plan.patientId);
                  }}>Profilga o'tish</Button>
                </div>
              </div>
            ))}
            {installments.length === 0 && (
              <div className="text-center py-8 text-gray-500">Hech qanday reja topilmadi.</div>
            )}
          </div>
        </Modal>

        {/* Debtors Modal */}
        <Modal isOpen={isDebtorModalOpen} onClose={() => setIsDebtorModalOpen(false)} title="Qarzdorlar Ro'yxati">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                {t('finance.debtorsModal.filterByDoctor')}
              </label>
              <select
                value={selectedDebtorDoctorId}
                onChange={(e) => setSelectedDebtorDoctorId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-750 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
              >
                <option value="All">{t('finance.debtorsModal.allDoctors')}</option>
                {doctors.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.lastName} {doc.firstName} ({doc.specialty})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end text-right sm:mt-4">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{t('finance.debtorsModal.filteredDebt')}</span>
              <span className="text-lg font-black text-red-600">
                {filteredDebtors.reduce((sum, d) => sum + d.amount, 0).toLocaleString()} UZS
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {filteredDebtors.length} {t('finance.debtorsModal.debtorsCount')}
              </span>
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <Button onClick={async () => {
              if (!confirm('Barcha qarzdorlarga eslatma yuborilsinmi?')) return;
              try {
                const getAuthData = () => {
                  const local = localStorage.getItem('dentalflow_auth');
                  if (local) return JSON.parse(local);
                  const session = sessionStorage.getItem('dentalflow_auth');
                  if (session) return JSON.parse(session);
                  return null;
                };

                const auth = getAuthData();
                if (!auth || !auth.clinicId) {
                  alert('Klinika ma\'lumotlari topilmadi. Iltimos, qayta kiring.');
                  return;
                }
                const response = await api.batch.remindDebts(auth.clinicId, filteredDebtors.map(d => ({ name: d.name, amount: d.amount })));
                alert(response.message || 'Eslatmalar yuborildi');
              } catch (e) {
                alert('Xatolik yuz berdi');
              }
            }}>
              <Bot className="w-4 h-4 mr-2" />
              Barchasiga Eslatish
            </Button>
          </div>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {filteredDebtors.map(d => (
              <div key={d.id} className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
                <div>
                  <button
                    onClick={() => {
                      setIsDebtorModalOpen(false);
                      if (d.patientId) onPatientClick(d.patientId);
                    }}
                    className="font-bold text-gray-900 dark:text-white hover:text-blue-600 hover:underline text-left"
                  >
                    {d.name}
                  </button>
                  <p className="text-sm text-gray-500">{d.phone}</p>
                  {d.doctorId && (
                    <p className="text-xs text-gray-400 mt-1 font-semibold">
                      Shifokor: {doctors.find(doc => doc.id === d.doctorId) ? `${doctors.find(doc => doc.id === d.doctorId)?.lastName} ${doctors.find(doc => doc.id === d.doctorId)?.firstName[0]}.` : '-'}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-red-600">{d.amount.toLocaleString()} UZS</p>
                  <p className="text-xs text-red-500 font-medium">{d.days} kun kechikkan</p>
                  {d.patientId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className={`mt-2 ${remindedDebtors.has(d.patientId) ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                      disabled={remindedDebtors.has(d.patientId)}
                      onClick={async () => {
                        try {
                          await api.patients.remindDebt(d.patientId!, d.amount);
                          setRemindedDebtors(prev => new Set(prev).add(d.patientId!));
                          alert('Eslatma yuborildi!');
                        } catch (e) {
                          alert('Xatolik: Bemor botga ulanmagan bo\'lishi mumkin');
                        }
                      }}
                    >
                      <Bot className="w-3 h-3 mr-1" />
                      {remindedDebtors.has(d.patientId) ? 'Eslatildi' : 'Eslatish'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {filteredDebtors.length === 0 && (
              <div className="text-center py-8 text-gray-500 font-medium bg-gray-50 dark:bg-gray-800/25 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                Ushbu shifokorga biriktirilgan qarzdorlar yo'q.
              </div>
            )}
          </div>
        </Modal>
      </>)}

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        transaction={receiptTransaction}
        clinic={currentClinic}
      />

      {/* Add Payment / Expense Quick Modal */}
      <Modal
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        title={isExpense ? '➕ Xarajat Qo\'shish' : '💰 To\'lov Qo\'shish'}
      >
        <div className="space-y-4">
          {!isExpense && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Bemor *</label>
              <select
                value={paymentForm.patientId}
                onChange={e => setPaymentForm(f => ({ ...f, patientId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
              >
                <option value="">Bemorni tanlang...</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.lastName} {p.firstName} — {p.phone}</option>
                ))}
              </select>
            </div>
          )}

          {!isExpense && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Shifokor</label>
              <select
                value={paymentForm.doctorId}
                onChange={e => setPaymentForm(f => ({ ...f, doctorId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
              >
                <option value="">Shifokorni tanlang (ixtiyoriy)</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.lastName} {d.firstName} — {d.specialty}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              {isExpense ? 'Xarajat nomi' : 'Xizmat nomi'}
            </label>
            <input
              type="text"
              placeholder={isExpense ? 'Masalan: Ijara, kommunal...' : 'Masalan: Protez, davolash...'}
              value={paymentForm.service}
              onChange={e => setPaymentForm(f => ({ ...f, service: e.target.value }))}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Summa (UZS) *</label>
            <input
              type="number"
              placeholder="0"
              value={paymentForm.amount}
              onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white placeholder-gray-400"
            />
          </div>

          {!isExpense && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">To'lov usuli</label>
              <div className="flex gap-2 flex-wrap">
                {(['Cash', 'Card', 'Insurance', 'Balance'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setPaymentForm(f => ({ ...f, type }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${paymentForm.type === type
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                  >
                    {type === 'Cash' ? 'Naqd' : type === 'Card' ? 'Karta' : type === 'Insurance' ? 'Sug\'urta' : 'Balans'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsAddPaymentOpen(false)}
            >
              Bekor
            </Button>
            <button
              disabled={paymentLoading || !paymentForm.amount || (!isExpense && !paymentForm.patientId)}
              onClick={handleAddPayment}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all ${isExpense
                  ? 'bg-red-500 hover:bg-red-600 disabled:bg-red-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
                } disabled:cursor-not-allowed`}
            >
              {paymentLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                isExpense ? <Banknote className="w-4 h-4" /> : <Plus className="w-4 h-4" />
              )}
              {isExpense ? 'Xarajat Saqlash' : 'To\'lovni Saqlash'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
