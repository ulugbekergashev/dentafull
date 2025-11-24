import React, { useState, useMemo } from 'react';
import { Card, Badge, Input } from '../components/Common';
import {
  Users, Calendar, DollarSign, TrendingUp,
  AlertCircle, CheckCircle, Clock
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Patient, Appointment, Transaction } from '../types';

interface DashboardProps {
  patients: Patient[];
  appointments: Appointment[];
  transactions: Transaction[];
}

export const Dashboard: React.FC<DashboardProps> = ({ patients, appointments, transactions }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  // Filter Data
  const filteredAppointments = useMemo(() => appointments.filter(a => isDateInRange(a.date)), [appointments, startDate, endDate]);
  const filteredTransactions = useMemo(() => transactions.filter(t => isDateInRange(t.date)), [transactions, startDate, endDate]);

  // Stats Calculation
  const totalPatients = patients.length; // Patient count usually stays total DB count
  const activePatients = patients.filter(p => p.status === 'Active').length;

  const periodAppointmentsCount = filteredAppointments.length;
  const pendingAppointments = filteredAppointments.filter(a => a.status === 'Pending').length;

  const totalRevenue = filteredTransactions.reduce((acc, t) => acc + t.amount, 0);

  // Dynamic Service Data from Appointments
  const SERVICE_DATA = useMemo(() => {
    const serviceCount = new Map<string, number>();

    filteredAppointments.forEach(app => {
      const count = serviceCount.get(app.type) || 0;
      serviceCount.set(app.type, count + 1);
    });

    const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

    return Array.from(serviceCount.entries())
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAppointments]);

  // Dynamic Chart Data Aggregation
  const trendData = useMemo(() => {
    const dataMap = new Map<string, { revenue: number, appointments: number }>();

    // Aggregate Transactions
    filteredTransactions.forEach(t => {
      const current = dataMap.get(t.date) || { revenue: 0, appointments: 0 };
      dataMap.set(t.date, { ...current, revenue: current.revenue + t.amount });
    });

    // Aggregate Appointments
    filteredAppointments.forEach(a => {
      const current = dataMap.get(a.date) || { revenue: 0, appointments: 0 };
      dataMap.set(a.date, { ...current, appointments: current.appointments + 1 });
    });

    // Convert to Array & Sort
    const result = Array.from(dataMap.entries())
      .map(([date, data]) => ({ name: date, ...data }))
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());

    // If no data, return empty or a placeholder
    return result.length > 0 ? result : [];
  }, [filteredTransactions, filteredAppointments]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Boshqaruv Paneli</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Klinika faoliyati bo'yicha umumiy hisobot</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            containerClassName="w-full sm:w-40"
            className="cursor-pointer"
            placeholder="Boshlash"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            containerClassName="w-full sm:w-40"
            className="cursor-pointer"
            placeholder="Tugash"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Jami Bemorlar</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalPatients.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-full">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 flex items-center font-medium">
              <TrendingUp className="w-4 h-4 mr-1" /> +{activePatients}
            </span>
            <span className="text-gray-500 ml-2">faol bemorlar</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Qabullar</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{periodAppointmentsCount}</h3>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-full">
              <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            {startDate || endDate ? (
              <span className="text-gray-500 text-xs">Tanlangan davr uchun</span>
            ) : (
              <span className="text-gray-500 text-xs">Jami vaqt davomida</span>
            )}
            {pendingAppointments > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium flex items-center">
                <AlertCircle className="w-3 h-3 mr-1" /> {pendingAppointments} Kutilmoqda
              </span>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Jami Daromad</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalRevenue.toLocaleString()} UZS</h3>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-full">
              <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            {startDate || endDate ? (
              <span className="text-gray-500 text-xs">Tanlangan davr uchun</span>
            ) : (
              <span className="text-gray-500 text-xs">Jami vaqt davomida</span>
            )}
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Daromad va Qabullar Statistikasi
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#9CA3AF" strokeOpacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: 'none', color: '#fff', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#9CA3AF', marginBottom: '0.5rem' }}
                />
                <Line yAxisId="left" name="Daromad" type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                <Line yAxisId="right" name="Qabullar" type="monotone" dataKey="appointments" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
            {trendData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                Tanlangan davr uchun ma'lumot yo'q
              </div>
            )}
          </div>
        </Card>

        {/* Service Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Muolajalar Turi Bo'yicha</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SERVICE_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {SERVICE_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: 'none', color: '#fff', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Activity & List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Qabullar Ro'yxati (Tanlangan davr)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">Sana/Vaqt</th>
                  <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">Bemor</th>
                  <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">Shifokor</th>
                  <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">Turi</th>
                  <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredAppointments.slice(0, 5).map(app => (
                  <tr key={app.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <td className="py-4 font-medium text-gray-900 dark:text-white">{app.date} {app.time}</td>
                    <td className="py-4 text-gray-600 dark:text-gray-300">{app.patientName}</td>
                    <td className="py-4 text-gray-500">{app.doctorName}</td>
                    <td className="py-4 text-gray-500">{app.type}</td>
                    <td className="py-4"><Badge status={app.status} /></td>
                  </tr>
                ))}
                {filteredAppointments.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-4 text-gray-500">Qabullar topilmadi</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">So'nggi Faoliyat</h3>
          <div className="space-y-6">
            {[
              { icon: Users, color: 'bg-blue-100 text-blue-600', text: 'Yangi bemor ro\'yxatga olindi', time: '10 daq oldin' },
              { icon: DollarSign, color: 'bg-green-100 text-green-600', text: 'To\'lov qabul qilindi: 150,000 UZS', time: '45 daq oldin' },
              { icon: CheckCircle, color: 'bg-purple-100 text-purple-600', text: 'Dr. Sobirov kanal davolashni yakunladi', time: '1 soat oldin' },
              { icon: Clock, color: 'bg-yellow-100 text-yellow-600', text: 'Qabul vaqti o\'zgartirildi', time: '2 soat oldin' },
            ].map((item, i) => (
              <div key={i} className="flex gap-3">
                <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.text}</p>
                  <p className="text-xs text-gray-500">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
