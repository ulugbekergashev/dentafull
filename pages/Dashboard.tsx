import React, { useState, useMemo } from 'react';
import { Card, Badge, Input } from '../components/Common';
import {
  Users, Calendar, DollarSign, TrendingUp, TrendingDown,
  CheckCircle, Clock, AlertCircle, Plus, ChevronRight, Star
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Patient, Appointment, Transaction, UserRole, Doctor } from '../types';

import { getCurrentMonthRange } from '../utils/dateUtils';

interface DashboardProps {
  patients: Patient[];
  appointments: Appointment[];
  transactions: Transaction[];
  reviews: any[];
  userRole: UserRole;
  doctorId?: string;
  doctors: Doctor[];
}

export const Dashboard: React.FC<DashboardProps> = ({ patients, appointments, transactions, reviews, userRole, doctorId, doctors }) => {
  const isReceptionist = userRole === UserRole.RECEPTIONIST;
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
      // Filter transactions based on doctorId if available, or fall back to appointment matching
      return transactions.filter(t => {
        if (t.doctorId) {
          return t.doctorId === doctorId;
        }
        // Fallback: Match transaction to appointment by patient name and service
        const matchingAppt = filteredAppointmentsByDoctor.find(a =>
          a.patientName === t.patientName && a.type === t.service
        );
        return matchingAppt !== undefined;
      });
    }
    return transactions;
  }, [transactions, filteredAppointmentsByDoctor, userRole, doctorId]);

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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Dashboard <span className="text-blue-600">Overview</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
            {userRole === UserRole.DOCTOR ? 'Shaxsiy statistika va natijalar' : isReceptionist ? 'Bugungi kunlik hisobot' : 'Klinika faoliyati bo\'yicha tahliliy hisobot'}
          </p>
        </div>

        {!isReceptionist && (
          <div className="flex items-center gap-3 p-1.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-2 px-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 p-0 cursor-pointer w-32"
              />
            </div>
            <div className="w-px h-8 bg-gray-100 dark:bg-gray-700" />
            <div className="flex items-center gap-2 px-3">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 p-0 cursor-pointer w-32"
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {userRole === UserRole.CLINIC_ADMIN && !isReceptionist && (
          <div className="relative group overflow-hidden bg-white dark:bg-gray-800 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:translate-y-[-4px]">
            <div className="absolute top-0 right-0 p-6 opacity-10 text-blue-600 transition-transform duration-500 group-hover:scale-110">
              <Users className="w-20 h-20" />
            </div>
            <div className="relative z-10">
              <div className="p-3 w-fit bg-blue-50 dark:bg-blue-900/30 rounded-2xl">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="mt-8">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">JAMI BEMORLAR</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <h3 className="text-3xl font-black text-gray-900 dark:text-white">{totalPatients.toLocaleString()}</h3>
                </div>
                <div className="mt-4 flex items-center text-xs">
                  <span className="flex items-center font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                    <TrendingUp className="w-3 h-3 mr-1" /> +{activePatients}
                  </span>
                  <span className="text-gray-500 ml-2 font-medium">faol bemorlar</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="relative group overflow-hidden bg-white dark:bg-gray-800 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:translate-y-[-4px]">
          <div className="absolute top-0 right-0 p-6 opacity-10 text-purple-600 transition-transform duration-500 group-hover:scale-110">
            <Calendar className="w-20 h-20" />
          </div>
          <div className="relative z-10">
            <div className="p-3 w-fit bg-purple-50 dark:bg-purple-900/30 rounded-2xl">
              <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-8">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {userRole === UserRole.DOCTOR ? 'MENING QABULLARIM' : 'QABULLAR'}
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-black text-gray-900 dark:text-white">{periodAppointmentsCount}</h3>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">
                  {startDate || endDate ? 'Tanlangan davrda' : 'Jami'}
                </span>
                {pendingAppointments > 0 && (
                  <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-full text-[10px] font-bold uppercase tracking-tight flex items-center border border-amber-100 dark:border-amber-800/50">
                    {pendingAppointments} KUTILMOQDA
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative group overflow-hidden bg-emerald-600 p-6 rounded-[2rem] border-none shadow-lg shadow-emerald-500/20 hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 hover:translate-y-[-4px]">
          <div className="absolute top-0 right-0 p-6 opacity-20 text-white transition-transform duration-500 group-hover:scale-110">
            <DollarSign className="w-20 h-20" />
          </div>
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div className="p-3 w-fit bg-white/20 rounded-2xl backdrop-blur-md">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div className="mt-8">
              <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.2em]">DAROMAD</p>
              <div className="mt-1">
                <h3 className="text-2xl font-black text-white">{totalRevenue.toLocaleString()} <span className="text-sm font-bold opacity-80">UZS</span></h3>
              </div>
              <p className="mt-4 text-[11px] font-bold text-emerald-100/80">
                {isReceptionist ? today : (startDate || endDate ? 'Tanlangan davr uchun' : 'Barcha vaqt uchun')}
              </p>
            </div>
          </div>
        </div>

        {!isReceptionist && (
          <div className="relative group overflow-hidden bg-white dark:bg-gray-800 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:translate-y-[-4px]">
            <div className="absolute top-0 right-0 p-6 opacity-10 text-indigo-600 transition-transform duration-500 group-hover:scale-110">
              <CheckCircle className="w-20 h-20" />
            </div>
            <div className="relative z-10">
              <div className="p-3 w-fit bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl">
                <CheckCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="mt-8">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">SAMARADORLIK</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <h3 className="text-3xl font-black text-gray-900 dark:text-white">
                    {periodAppointmentsCount > 0
                      ? `${Math.round((filteredAppointments.filter(a => a.status === 'Completed').length / periodAppointmentsCount) * 100)}% `
                      : '0%'
                    }
                  </h3>
                </div>
                <div className="mt-4 text-xs font-medium text-gray-500">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">{filteredAppointments.filter(a => a.status === 'Completed').length}</span>{" "}
                  ta yakunlangan qabul
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts Row - hidden for receptionist */}
      {!isReceptionist && (<>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <Card className="p-8 lg:col-span-2 rounded-[2rem]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">
                Moliyaviy <span className="text-blue-600">Oqim</span>
              </h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Daromad
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Qabullar
                </div>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAppts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" dark:stroke="#374151" strokeOpacity={0.4} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} 
                    dy={10} 
                  />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', borderRadius: '16px', border: 'none', color: '#fff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ color: '#9CA3AF', marginBottom: '0.5rem', fontWeight: 'bold' }}
                  />
                  <Area 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#3B82F6" 
                    strokeWidth={4} 
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                    activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Area 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="appointments" 
                    stroke="#10B981" 
                    strokeWidth={4} 
                    fillOpacity={1} 
                    fill="url(#colorAppts)" 
                    activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {trendData.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm font-medium">
                  Ma'lumotlar mavjud emas
                </div>
              )}
            </div>
          </Card>

          {/* Service Distribution */}
          <Card className="p-8 rounded-[2rem]">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">Mutaxassislik</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={SERVICE_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {SERVICE_DATA.map((entry, index) => (
                      <Cell key={`cell - ${index} `} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle" 
                    formatter={(value) => <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{value}</span>}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', borderRadius: '16px', border: 'none', color: '#fff' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">
          <Card className="p-8 lg:col-span-2 rounded-[2rem]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">Qabullar <span className="text-purple-600">Tasmasi</span></h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sana/Vaqt</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Bemor</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Shifokor</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Baho</th>
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
                          <span className="text-xs text-gray-400">Baholanmagan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAppointments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-gray-500">Qabullar topilmadi</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-8 rounded-[2rem]">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">So'nggi <span className="text-emerald-600">Faoliyat</span></h3>
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
                    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  });
                });

                // Recent transactions (last 5)
                filteredTransactions.slice(-5).reverse().forEach(tx => {
                  const txDate = new Date(tx.date);
                  activities.push({
                    type: 'transaction',
                    text: `To'lov qabul qilindi: ${tx.amount.toLocaleString()} UZS - ${tx.service}`,
                    time: txDate,
                    icon: DollarSign,
                    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
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
                      color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                    });
                  });

                // Sort by time (most recent first) and take top 5
                const sortedActivities = activities
                  .sort((a, b) => b.time.getTime() - a.time.getTime())
                  .slice(0, 5);

                // Helper function to format time ago
                const getTimeAgo = (date: Date) => {
                  const now = new Date();
                  const diffMs = now.getTime() - date.getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);

                  if (diffMins < 1) return 'Hozirgina';
                  if (diffMins < 60) return `${diffMins} daq oldin`;
                  if (diffHours < 24) return `${diffHours} soat oldin`;
                  return `${diffDays} kun oldin`;
                };

                if (sortedActivities.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Hozircha faoliyat yo'q
                    </div>
                  );
                }

                return sortedActivities.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.color}`}>
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
      </>)}
    </div>
  );
};
