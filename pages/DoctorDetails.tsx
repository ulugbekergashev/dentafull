import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Doctor, Appointment, Transaction, Patient, Service } from '../types';
import { Card, Button, Badge } from '../components/Common';
import { ArrowLeft, Phone, Mail, Award, Calendar, DollarSign, Users, Star } from 'lucide-react';
import { calculateDoctorSalary } from '../utils/financialCalculations';
import { getCurrentMonthRange } from '../utils/dateUtils';

interface DoctorDetailsProps {
    doctors: Doctor[];
    appointments: Appointment[];
    transactions: Transaction[];
    patients: Patient[];
    services: Service[];
    onBack: () => void;
    onPatientClick: (id: string) => void;
}

export const DoctorDetails: React.FC<DoctorDetailsProps> = ({
    doctors,
    appointments,
    transactions,
    patients,
    services,
    onBack,
    onPatientClick
}) => {
    const { doctorId } = useParams<{ doctorId: string }>();
    const [activeTab, setActiveTab] = useState<'appointments' | 'upcoming_appointments' | 'transactions' | 'patients'>('upcoming_appointments');
    const doctor = doctors.find(d => d.id === doctorId);

    // Time filters for stats
    const { startDate, endDate } = getCurrentMonthRange();

    // Filter doctor's specific data
    const doctorAppts = useMemo(() => appointments.filter(a => a.doctorId === doctorId), [appointments, doctorId]);

    const upcomingAppts = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today
        return doctorAppts.filter(a => {
            const apptDate = new Date(a.date);
            return apptDate >= now && a.status !== 'Completed' && a.status !== 'Cancelled';
        });
    }, [doctorAppts]);

    const pastAppts = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return doctorAppts.filter(a => {
            const apptDate = new Date(a.date);
            return apptDate < now || a.status === 'Completed' || a.status === 'Cancelled';
        });
    }, [doctorAppts]);

    const doctorPatients = useMemo(() => patients.filter(p => p.doctorId === doctorId), [patients, doctorId]);

    const doctorTransactions = useMemo(() => {
        if (!doctor) return [];

        return transactions.filter(tx => {
            if (tx.doctorId) return tx.doctorId === doctorId;

            const docName = `${doctor.lastName} ${doctor.firstName}`.toLowerCase().trim();
            const txDocName = (tx.doctorName || '').toLowerCase().trim();
            if (txDocName && (docName === txDocName || docName.includes(txDocName) || txDocName.includes(docName))) {
                return true;
            }

            const matchingAppt = doctorAppts.find(appt => appt.patientName === tx.patientName && appt.type === tx.service);
            return matchingAppt !== undefined;
        });
    }, [transactions, doctor, doctorId, doctorAppts]);


    // Current Month Stats (for the header cards)
    const currentMonthStats = useMemo(() => {
        if (!doctor) return { gross: 0, net: 0, salary: 0, apptCount: 0, uniquePatients: 0 };

        const monthStart = new Date(startDate);
        const monthEnd = new Date(endDate);

        const monthTx = doctorTransactions.filter(tx => {
            const d = new Date(tx.date);
            return d >= monthStart && d <= monthEnd;
        });

        const monthAppts = doctorAppts.filter(a => {
            const d = new Date(a.date);
            return d >= monthStart && d <= monthEnd;
        });

        const financial = calculateDoctorSalary(monthTx, doctor, services);
        const uniquePats = new Set(monthAppts.map(a => a.patientId)).size;

        return {
            gross: financial.grossRevenue,
            net: financial.netRevenue,
            salary: financial.doctorSalary,
            apptCount: monthAppts.length,
            uniquePatients: uniquePats
        };
    }, [doctor, doctorTransactions, doctorAppts, startDate, endDate, services]);

    if (!doctor) {
        return (
            <div className="flex flex-col items-center justify-center h-96">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Shifokor topilmadi</h2>
                <Button onClick={onBack}>Ortga qaytish</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
            {/* Header and Back Button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        Dr. {doctor.lastName} {doctor.firstName}
                        <span className={`text-xs px-2.5 py-1 rounded-full border ${doctor.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                            }`}>
                            {doctor.status === 'Active' ? 'Faol' : 'Ta\'tilda'}
                        </span>
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{doctor.specialty} • {doctor.percentage || 0}% ulush</p>
                </div>
            </div>

            {/* Profile Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contact info card */}
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">Aloqa ma'lumotlari</h3>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm">
                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Phone className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-xs">Asosiy Telefon</p>
                                <p className="font-medium text-gray-900 dark:text-white">{doctor.phone}</p>
                            </div>
                        </div>
                        {doctor.secondaryPhone && (
                            <div className="flex items-center gap-3 text-sm">
                                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <Phone className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">Qo'shimcha Telefon</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{doctor.secondaryPhone}</p>
                                </div>
                            </div>
                        )}
                        {doctor.email && (
                            <div className="flex items-center gap-3 text-sm">
                                <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">Elektron pochta</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{doctor.email}</p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-3 text-sm">
                            <div className="w-8 h-8 rounded-full bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                                <Award className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-xs">Mutaxassislik</p>
                                <p className="font-medium text-gray-900 dark:text-white">{doctor.specialty}</p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Current Month Stats */}
                <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Shu oy qabullar</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentMonthStats.apptCount}</p>
                    </Card>

                    <Card className="p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <Users className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Unikal bemorlar</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentMonthStats.uniquePatients}</p>
                    </Card>

                    <Card className="p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <DollarSign className="w-4 h-4 text-green-500" />
                            <span className="text-xs font-medium uppercase tracking-wider">Tushum (Oy)</span>
                        </div>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{currentMonthStats.gross.toLocaleString()} UZS</p>
                    </Card>

                    <Card className="p-4 flex flex-col justify-center bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">Oy maoshi</span>
                        </div>
                        <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{currentMonthStats.salary.toLocaleString()} UZS</p>
                    </Card>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('upcoming_appointments')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'upcoming_appointments'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        Kelgusi Qabullar ({upcomingAppts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('appointments')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'appointments'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        Qabullar Tarixi ({pastAppts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'transactions'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        Tranzaksiyalar ({doctorTransactions.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('patients')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'patients'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        Bemorlari ({doctorPatients.length})
                    </button>
                </nav>
            </div>

            {/* Tab Content */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'patients' ? 'Ism familiyasi' : 'Sana'}
                                </th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'patients' ? 'Telefon' : 'Bemor'}
                                </th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'patients' ? 'So\'nggi tashrif' : 'Xizmat turi'}
                                </th>
                                {(activeTab === 'appointments' || activeTab === 'upcoming_appointments') && (
                                    <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                )}
                                {activeTab === 'patients' && (
                                    <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Status</th>
                                )}
                                {activeTab === 'transactions' && (
                                    <>
                                        <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Summa</th>
                                        <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">To'lov turi</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {(activeTab === 'appointments' || activeTab === 'upcoming_appointments') ? (
                                (activeTab === 'appointments' ? pastAppts : upcomingAppts)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(appt => (
                                        <tr key={appt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{appt.date}</div>
                                                <div className="text-xs text-gray-500">{appt.time} ({appt.duration} daq)</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => onPatientClick(appt.patientId)}
                                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                                                >
                                                    {appt.patientName}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{appt.type}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><Badge status={appt.status} /></td>
                                        </tr>
                                    ))
                            ) : activeTab === 'patients' ? (
                                doctorPatients.sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime()).map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => onPatientClick(p.id)}
                                                className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                                            >
                                                {p.lastName} {p.firstName}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {p.phone}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                                }`}>
                                                {p.status === 'Active' ? 'Faol' : 'Arxiv'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                doctorTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (
                                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {new Date(tx.date).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {tx.patientName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{tx.service}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white text-right">
                                            {tx.amount.toLocaleString()} UZS
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tx.type === 'Cash' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                tx.type === 'Card' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                                }`}>
                                                {tx.type === 'Cash' ? 'Naqd' : tx.type === 'Card' ? 'Karta' : 'Sug\'urta'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {((activeTab === 'appointments' && pastAppts.length === 0) ||
                                (activeTab === 'upcoming_appointments' && upcomingAppts.length === 0) ||
                                (activeTab === 'transactions' && doctorTransactions.length === 0) ||
                                (activeTab === 'patients' && doctorPatients.length === 0)) && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            Hech narsa topilmadi.
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
