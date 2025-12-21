
import React, { useState } from 'react';
import { Card, Button, Badge, Select, Modal, Input } from '../components/Common';
import { UserRole, Transaction, Appointment, Patient } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, Filter, DollarSign, CreditCard, Wallet, X, TrendingDown, UserCheck, AlertOctagon, Calendar, Bot } from 'lucide-react';
import { api } from '../services/api';

interface FinanceProps {
  userRole: UserRole;
  transactions: Transaction[];
  appointments: Appointment[];
  services: { name: string; price: number; duration: number }[];
  patients: Patient[];
  onPatientClick: (id: string) => void;
  doctorId: string;
}

export const Finance: React.FC<FinanceProps> = ({ userRole, transactions, appointments, services, patients, onPatientClick, doctorId }) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDebtorModalOpen, setIsDebtorModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('Barchasi');
  const [remindedDebtors, setRemindedDebtors] = useState<Set<string>>(new Set());

  // Date Range State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  // Calculate debtors from transactions
  const debtTransactions = transactions.filter(t => t.status === 'Pending' || t.status === 'Overdue');
  const totalDebt = debtTransactions.reduce((acc, t) => acc + t.amount, 0);

  // Create a map of patientName -> patientId from patients list
  const patientIdMap = new Map<string, string>();
  patients.forEach(p => {
    patientIdMap.set(`${p.firstName} ${p.lastName}`, p.id);
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
        patientId: patientIdMap.get(t.patientName) || patients.find(p => `${p.firstName} ${p.lastName}` === t.patientName)?.id
      });
    }
  });

  const DEBTORS = Array.from(debtorMap.values())
    .map((d, index) => ({
      id: index + 1,
      name: d.name,
      amount: d.amount,
      days: Math.floor((new Date().getTime() - new Date(d.date).getTime()) / (1000 * 60 * 60 * 24)),
      phone: '+998 90 XXX XX XX',
      patientId: d.patientId
    }))
    .sort((a, b) => b.amount - a.amount);

  const PAYMENT_METHOD_DATA = [
    { name: 'Naqd', value: filteredTransactions.filter(t => t.type === 'Cash').length, color: '#10B981' },
    { name: 'Karta', value: filteredTransactions.filter(t => t.type === 'Card').length, color: '#3B82F6' },
    { name: 'Sug\'urta', value: filteredTransactions.filter(t => t.type === 'Insurance').length, color: '#8B5CF6' },
  ];

  const totalRevenue = filteredTransactions.reduce((acc, t) => acc + t.amount, 0);

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Moliya</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Daromad, xarajatlar va yo'qotishlar tahlili</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-end">
          <div className="w-full sm:w-40">
            <Input
              type="date"
              label="Boshlash sanasi"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-full sm:w-40">
            <Input
              type="date"
              label="Tugash sanasi"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9"
            />
          </div>
          <Button variant="secondary" onClick={handleExport} className="h-10 mt-6 sm:mt-0"><Download className="w-4 h-4 mr-2" /> CSV</Button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-none">
          <p className="text-blue-100 text-sm font-medium">Jami Daromad</p>
          <h3 className="text-3xl font-bold mt-2">{totalRevenue.toLocaleString()} UZS</h3>
          <div className="mt-4 flex items-center text-sm text-blue-100">
            <Calendar className="w-4 h-4 mr-1" />
            {startDate || endDate ? 'Tanlangan davr uchun' : 'Barcha vaqt uchun'}
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-full">
              <Wallet className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Qarzdorlik</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{totalDebt.toLocaleString()} UZS</h3>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
              <CreditCard className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">O'rtacha Chek</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredTransactions.length ? Math.round(totalRevenue / filteredTransactions.length).toLocaleString() : 0} UZS
              </h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Loss Analysis Section */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white pt-4">Yo'qotishlar Tahlili (No-Shows)</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Financial Loss */}
        <Card className="p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Yo'qotilgan Daromad</p>
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{lostRevenue.toLocaleString()} UZS</h3>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
              <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Tanlangan davrda bemor kelmaganligi sababli yo'qotish.</p>
        </Card>

        {/* Missed Appointments Count */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Jami "Kelmadi"</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{noShowAppointments.length} ta</h3>
            </div>
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full">
              <AlertOctagon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </div>
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{uniqueNoShowPatients}</span> ta unikal bemor
          </div>
        </Card>

        {/* Recovered Patients */}
        <Card className="p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Qaytarilgan Mijozlar</p>
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{recoveredCount} ta</h3>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <UserCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            "Kelmadi" bo'lgan, lekin keyinchalik qaytib kelgan bemorlar.
            <span className="block mt-1 text-red-500 font-medium">Yo'qotilganlar: {lostCustomersCount} ta</span>
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">To'lov Usullari</h3>
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Qarzdorlar</h3>
          <div className="space-y-4">
            {DEBTORS.slice(0, 2).map((d, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{d.name}</p>
                  <p className="text-xs text-red-500 font-medium">{d.days} kun kechikkan</p>
                </div>
                <span className="font-bold text-gray-900 dark:text-white">{d.amount.toLocaleString()}</span>
              </div>
            ))}
            <Button variant="ghost" className="w-full text-sm mt-2" onClick={() => setIsDebtorModalOpen(true)}>Barchasini ko'rish</Button>
          </div>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900 dark:text-white">Tranzaksiyalar</h3>
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
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sana</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Bemor</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Xizmat</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Usul</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Summa</th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700 dark:text-gray-300">
              {filteredTransactions.map(t => (
                <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4">{t.date}</td>
                  <td className="px-6 py-4 font-medium">{t.patientName}</td>
                  <td className="px-6 py-4">{t.service}</td>
                  <td className="px-6 py-4">{t.type}</td>
                  <td className="px-6 py-4 font-medium">{t.amount.toLocaleString()} UZS</td>
                  <td className="px-6 py-4"><Badge status={t.status} /></td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Tranzaksiyalar topilmadi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Debtors Modal */}
      <Modal isOpen={isDebtorModalOpen} onClose={() => setIsDebtorModalOpen(false)} title="Qarzdorlar Ro'yxati">
        <div className="space-y-4">
          {DEBTORS.map(d => (
            <div key={d.id} className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
              <div>
                <button
                  onClick={() => d.patientId && onPatientClick(d.patientId)}
                  className="font-bold text-gray-900 dark:text-white hover:text-blue-600 hover:underline text-left"
                >
                  {d.name}
                </button>
                <p className="text-sm text-gray-500">{d.phone}</p>
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
        </div>
      </Modal>
    </div>
  );
};
