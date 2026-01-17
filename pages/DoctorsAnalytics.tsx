import React, { useMemo, useState } from 'react';
import { Doctor, Appointment, Service, Transaction } from '../types';
import { Card } from '../components/Common';
import { DollarSign, Calendar, Award, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

interface DoctorsAnalyticsProps {
    doctors: Doctor[];
    appointments: Appointment[];
    services: Service[];
    transactions: Transaction[];
}

type DateRange = 'month' | '3months' | '6months' | 'year' | 'all' | 'custom';

export const DoctorsAnalytics: React.FC<DoctorsAnalyticsProps> = ({ doctors, appointments, services, transactions }) => {
    const [dateRange, setDateRange] = useState<DateRange>('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Filter appointments by date range
    const filteredAppointments = useMemo(() => {
        if (dateRange === 'all') return appointments;

        const now = new Date();
        let startDate = new Date();
        let endDate = now;

        if (dateRange === 'custom') {
            if (!customStartDate || !customEndDate) return appointments;
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else {
            switch (dateRange) {
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case '3months':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6months':
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
        }

        return appointments.filter(appt => {
            const apptDate = new Date(appt.date);
            return apptDate >= startDate && apptDate <= endDate;
        });
    }, [appointments, dateRange, customStartDate, customEndDate]);

    // Filter transactions by date range
    const filteredTransactions = useMemo(() => {
        if (dateRange === 'all') return transactions;

        const now = new Date();
        let startDate = new Date();
        let endDate = now;

        if (dateRange === 'custom') {
            if (!customStartDate || !customEndDate) return transactions;
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else {
            switch (dateRange) {
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case '3months':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6months':
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
        }

        return transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= startDate && txDate <= endDate;
        });
    }, [transactions, dateRange, customStartDate, customEndDate]);

    // Calculate Metrics
    const analyticsData = useMemo(() => {
        return doctors.map(doctor => {
            const doctorAppts = filteredAppointments.filter(a => a.doctorId === doctor.id);
            const completedAppts = doctorAppts.filter(a => a.status === 'Completed');

            // Revenue Calculation - Use doctorId directly if available (new transactions)
            // Fallback to appointment matching for old transactions without doctorId
            const doctorTransactions = filteredTransactions.filter(tx => {
                // If transaction has doctorId, use it directly (preferred method)
                if (tx.doctorId) {
                    return tx.doctorId === doctor.id;
                }

                // Check by name (like in Finance.tsx)
                const docName = `${doctor.lastName} ${doctor.firstName}`.toLowerCase().trim();
                const txDocName = (tx.doctorName || '').toLowerCase().trim();
                if (txDocName && (docName === txDocName || docName.includes(txDocName) || txDocName.includes(docName))) {
                    return true;
                }

                // Fallback: Match transaction to doctor's appointments by patient name and service
                // (for backward compatibility with old transactions)
                const matchingAppt = doctorAppts.find(appt =>
                    appt.patientName === tx.patientName && appt.type === tx.service
                );
                return matchingAppt !== undefined;
            });

            // Calculate metrics
            let grossRevenue = 0; // Total money from patients
            let totalNetRevenue = 0; // After technician costs
            let doctorSalary = 0; // Doctor's share

            // Check if doctor has a percentage set
            const hasPercentage = doctor.percentage && doctor.percentage > 0;

            doctorTransactions.forEach(tx => {
                grossRevenue += tx.amount;

                // Find service to get cost
                // Normalize names for better matching
                const txService = tx.service.trim().toLowerCase();
                const service = services.find(s => s.name.trim().toLowerCase() === txService);

                const servicePrice = service?.price || tx.amount; // Fallback
                const serviceCost = service?.cost || 0;

                // Calculate proportional cost
                const ratio = servicePrice > 0 ? Math.min(tx.amount / servicePrice, 1) : 1;
                const allocatedCost = serviceCost * ratio;

                const netRevenue = tx.amount - allocatedCost;
                totalNetRevenue += netRevenue;

                if (hasPercentage) {
                    // New Formula: (Price - Cost) * Percentage
                    const percentage = doctor.percentage || 0;
                    // Ensure non-negative salary
                    doctorSalary += Math.max(0, netRevenue * (percentage / 100));
                } else {
                    // If no percentage set, assume 0 salary (Clinic Profit)
                    // This aligns with Finance.tsx logic
                    doctorSalary += 0;
                }
            });

            // Unique Patients
            const uniquePatients = new Set(doctorAppts.map(a => a.patientId)).size;

            // Top Service
            const serviceCounts: Record<string, number> = {};
            completedAppts.forEach(appt => {
                serviceCounts[appt.type] = (serviceCounts[appt.type] || 0) + 1;
            });

            let topService = '-';
            let maxCount = 0;
            Object.entries(serviceCounts).forEach(([name, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    topService = name;
                }
            });

            // Average revenue per appointment
            const avgRevenue = doctorTransactions.length > 0
                ? grossRevenue / doctorTransactions.length
                : 0;

            // Day of week analysis
            const dayCount: Record<number, number> = {};
            doctorAppts.forEach(appt => {
                const day = new Date(appt.date).getDay();
                dayCount[day] = (dayCount[day] || 0) + 1;
            });
            const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
            const dayNames = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
            const busiestDayName = busiestDay ? dayNames[parseInt(busiestDay[0])] : '-';

            return {
                ...doctor,
                totalAppts: doctorAppts.length,
                completedAppts: completedAppts.length,
                uniquePatients,
                revenue: grossRevenue, // For charts/sorting (Total generated)
                salary: doctorSalary, // Actual doctor pay
                netRevenue: totalNetRevenue, // Profit for clinic context
                topService,
                topServiceCount: maxCount,
                avgRevenue,
                busiestDay: busiestDayName,
                name: `Dr. ${doctor.lastName}` // For charts
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }, [doctors, filteredAppointments, filteredTransactions]);

    const totalRevenue = analyticsData.reduce((sum, d) => sum + d.revenue, 0);
    const totalAppointments = analyticsData.reduce((sum, d) => sum + d.totalAppts, 0);
    const totalPatients = analyticsData.reduce((sum, d) => sum + d.uniquePatients, 0);
    const topPerformer = analyticsData.length > 0 ? analyticsData[0] : null;

    const dateRangeOptions = [
        { value: 'month' as DateRange, label: 'Bu Oy' },
        { value: '3months' as DateRange, label: 'Oxirgi 3 Oy' },
        { value: '6months' as DateRange, label: 'Oxirgi 6 Oy' },
        { value: 'year' as DateRange, label: 'Bu Yil' },
        { value: 'custom' as DateRange, label: 'Maxsus' },
        { value: 'all' as DateRange, label: 'Barchasi' },
    ];

    const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header with Date Range Filter */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shifokorlar Statistikasi</h1>

                <div className="flex gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                            Boshlanish sanasi
                        </label>
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => {
                                setCustomStartDate(e.target.value);
                                setDateRange('custom');
                            }}
                            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="дд.мм.гггг"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                            Tugash sanasi
                        </label>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => {
                                setCustomEndDate(e.target.value);
                                setDateRange('custom');
                            }}
                            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="дд.мм.гггг"
                        />
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-none">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-blue-100 text-sm font-medium mb-1">Jami Tushum</p>
                            <h3 className="text-3xl font-bold">{totalRevenue.toLocaleString()} UZS</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                            <DollarSign className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Jami Qabullar</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{totalAppointments}</h3>
                        </div>
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                            <Calendar className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Jami Bemorlar</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{totalPatients}</h3>
                        </div>
                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                            <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Eng Faol</p>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate max-w-[180px]">
                                {topPerformer ? `Dr. ${topPerformer.lastName}` : '-'}
                            </h3>
                            <p className="text-xs text-green-500 font-medium mt-1">
                                {topPerformer ? `${topPerformer.revenue.toLocaleString()} UZS` : ''}
                            </p>
                        </div>
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                            <Award className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Comparison Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Tushum Taqqoslash</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                            <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={80} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => `${value.toLocaleString()} UZS`}
                            />
                            <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                                {analyticsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Appointments Comparison Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Qabullar Taqqoslash</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                            />
                            <Legend />
                            <Bar dataKey="totalAppts" name="Jami" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="completedAppts" name="Yakunlangan" fill="#10b981" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Completion Rate Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Samaradorlik Foizi</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData.map(d => ({
                            ...d,
                            completionRate: d.totalAppts > 0 ? Math.round((d.completedAppts / d.totalAppts) * 100) : 0
                        }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => `${value}%`}
                            />
                            <Bar dataKey="completionRate" name="Samaradorlik" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                                {analyticsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Average Revenue Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">O'rtacha Tushum (Qabul)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => `${value.toLocaleString()} UZS`}
                            />
                            <Bar dataKey="avgRevenue" name="O'rtacha" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Detailed Table */}
            <Card className="overflow-hidden bg-white dark:bg-gray-800">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Batafsil Ko'rsatkichlar</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium">Shifokor</th>
                                <th className="p-4 font-medium">Mutaxassislik</th>
                                <th className="p-4 font-medium text-center">Bemorlar</th>
                                <th className="p-4 font-medium text-center">Qabullar</th>
                                <th className="p-4 font-medium">Top Xizmat</th>
                                <th className="p-4 font-medium text-right">Jami Tushum</th>
                                <th className="p-4 font-medium text-right">Shifokor Ulushi</th>
                                <th className="p-4 font-medium text-right">O'rtacha</th>
                                <th className="p-4 font-medium text-center">Eng Band Kun</th>
                                <th className="p-4 font-medium text-center">Samaradorlik</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {analyticsData.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                                                {doc.firstName[0]}{doc.lastName[0]}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">Dr. {doc.firstName} {doc.lastName}</p>
                                                <p className="text-xs text-gray-500">{doc.phone}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300 text-sm">{doc.specialty}</td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                            {doc.uniquePatients}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center text-gray-900 dark:text-white font-medium text-sm">
                                        {doc.completedAppts} <span className="text-gray-400 text-xs font-normal">/ {doc.totalAppts}</span>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm text-gray-900 dark:text-white">{doc.topService}</div>
                                        <div className="text-xs text-gray-500">{doc.topServiceCount} marta</div>
                                    </td>
                                    <td className="p-4 text-right font-bold text-gray-900 dark:text-white">
                                        {doc.revenue.toLocaleString()} UZS
                                    </td>
                                    <td className="p-4 text-right font-bold text-green-600 dark:text-green-400">
                                        {doc.salary.toLocaleString()} UZS
                                    </td>
                                    <td className="p-4 text-right text-sm text-gray-700 dark:text-gray-300">
                                        {Math.round(doc.avgRevenue).toLocaleString()} UZS
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                            {doc.busiestDay}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all"
                                                    style={{ width: `${doc.totalAppts > 0 ? (doc.completedAppts / doc.totalAppts) * 100 : 0}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs text-gray-500 min-w-[35px]">
                                                {doc.totalAppts > 0 ? Math.round((doc.completedAppts / doc.totalAppts) * 100) : 0}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {analyticsData.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-gray-500">
                                        Hozircha ma'lumot yo'q
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
