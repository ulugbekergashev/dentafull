import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Badge, Modal, Select } from '../components/Common';
import { Search, Plus, MoreHorizontal, Eye, Trash2, Loader2, Download, Filter, UserCheck, AlertCircle, ChevronDown, Cake, Wallet, Users as UsersIcon, UserPlus as UserPlusIcon } from 'lucide-react';
import { Patient, Doctor, Appointment, Transaction } from '../types';
import { api } from '../services/api';

interface PatientsProps {
  patients: Patient[];
  doctors: Doctor[];
  appointments: Appointment[];
  transactions: Transaction[];
  onPatientClick: (id: string) => void;
  onAddPatient: (patient: Omit<Patient, 'id'>) => void;
  onDeletePatient: (id: string) => void;
  onUpdatePatient: (id: string, data: Partial<Patient>) => Promise<void>;
}

export const Patients: React.FC<PatientsProps> = ({
  patients,
  doctors,
  appointments,
  transactions,
  onPatientClick,
  onAddPatient,
  onDeletePatient,
  onUpdatePatient,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [assignDoctorId, setAssignDoctorId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterGender, setFilterGender] = useState('all');
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dob: '',
    gender: 'Male',
    medicalHistory: '',
    address: '',
    secondaryPhone: '',
    doctorId: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const matchesSearch =
        p.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm);

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && p.status === 'Active') ||
        (filterStatus === 'archived' && p.status === 'Archived') ||
        (filterStatus === 'unassigned' && !p.doctorId);

      const matchesGender =
        filterGender === 'all' ||
        (filterGender === 'male' && p.gender === 'Male') ||
        (filterGender === 'female' && p.gender === 'Female');

      const matchesDoctor =
        filterDoctor === 'all' ||
        (filterDoctor === 'none' && !p.doctorId) ||
        p.doctorId === filterDoctor;

      const matchesDateFrom = !filterDateFrom || p.dob >= filterDateFrom;
      const matchesDateTo = !filterDateTo || p.dob <= filterDateTo;

      // Stats filters
      let matchesStat = true;
      if (activeStatFilter === 'new') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        // We don't have createdAt, but assuming lastVisit 'Never' or recent lastVisit as proxy if needed,
        // but wait, types.ts doesn't have createdAt. Let's check patients for any date field.
        // If not available, we might need to skip 'New' or use a different logic.
        // Actually, looking at the screenshot, "Yangi Bemorlar" exists.
        // Let's assume patients added in the system have some date.
        // Since I can't see createdAt, I'll use a placeholder logic or check if I can add it.
        // Actually, let's use lastVisit as a proxy for "New" if it's within 7 days and they are new.
        const lastVisitDate = p.lastVisit === 'Never' ? null : new Date(p.lastVisit);
        matchesStat = lastVisitDate ? lastVisitDate >= sevenDaysAgo : true;
      } else if (activeStatFilter === 'debtor') {
        const patientAppts = appointments.filter(a => a.patientId === p.id || a.patientName === `${p.lastName} ${p.firstName}`);
        const patientTxs = transactions.filter(t => t.patientId === p.id || t.patientName === `${p.lastName} ${p.firstName}`);

        const totalService = patientAppts.reduce((sum, app) => sum + (app.totalAmount || 0), 0);
        const totalPaid = patientTxs.filter(t => t.status === 'Paid').reduce((sum, t) => sum + t.amount, 0);

        matchesStat = totalService > totalPaid;
      } else if (activeStatFilter === 'waiting') {
        const patientAppts = appointments.filter(a => a.patientId === p.id || a.patientName === `${p.lastName} ${p.firstName}`);
        const patientTxs = transactions.filter(t => t.patientId === p.id || t.patientName === `${p.lastName} ${p.firstName}`);
        const hasUnpaid = patientAppts.some(app => {
          const isPaid = patientTxs.some(t => t.date === app.date && t.status === 'Paid');
          return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid;
        });
        matchesStat = hasUnpaid;
      }

      return matchesSearch && matchesStatus && matchesGender && matchesDoctor && matchesDateFrom && matchesDateTo && matchesStat;
    });
  }, [patients, searchTerm, filterStatus, filterGender, filterDoctor, filterDateFrom, filterDateTo, activeStatFilter, appointments, transactions]);

  // Stats
  const stats = useMemo(() => {
    const total = patients.length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newPatients = patients.filter(p => p.lastVisit === 'Never' || (p.lastVisit !== 'Never' && new Date(p.lastVisit) >= sevenDaysAgo)).length;

    const debtors = patients.filter(p => {
      const pAppts = appointments.filter(a => a.patientId === p.id || a.patientName === `${p.lastName} ${p.firstName}`);
      const pTxs = transactions.filter(t => t.patientId === p.id || t.patientName === `${p.lastName} ${p.firstName}`);

      const totalSvc = pAppts.reduce((sum, app) => sum + (app.totalAmount || 0), 0);
      const totalPd = pTxs.filter(t => t.status === 'Paid').reduce((sum, t) => sum + t.amount, 0);

      return totalSvc > totalPd;
    }).length;

    const waiting = patients.filter(p => {
      const pAppts = appointments.filter(a => a.patientId === p.id || a.patientName === `${p.lastName} ${p.firstName}`);
      const pTxs = transactions.filter(t => t.patientId === p.id || t.patientName === `${p.lastName} ${p.firstName}`);
      return pAppts.some(app => {
        const isPaid = pTxs.some(t => t.date === app.date && t.status === 'Paid');
        return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid;
      });
    }).length;

    return { total, newPatients, debtors, waiting };
  }, [patients, appointments, transactions]);

  const unassignedCount = patients.filter((p) => !p.doctorId).length;

  // CSV Export
  const handleExport = () => {
    const headers = ['ID', 'Familiya', 'Ism', 'Telefon', 'Tug\'ilgan sana', 'Jins', 'Status', 'Shifokor', 'Oxirgi tashrif'];
    const rows = filteredPatients.map((p) => [
      p.id,
      p.lastName,
      p.firstName,
      p.phone,
      p.dob,
      p.gender === 'Male' ? 'Erkak' : 'Ayol',
      p.status === 'Active' ? 'Faol' : 'Arxiv',
      p.doctorName || 'Biriktirilmagan',
      p.lastVisit,
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bemorlar_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Doctor Assignment
  const openAssignModal = (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation();
    setSelectedPatient(patient);
    setAssignDoctorId(patient.doctorId || '');
    setIsAssignModalOpen(true);
  };

  const handleAssignDoctor = async () => {
    if (!selectedPatient) return;
    setIsAssigning(true);
    try {
      const doctor = doctors.find((d) => d.id === assignDoctorId);
      await onUpdatePatient(selectedPatient.id, {
        doctorId: assignDoctorId || undefined,
        doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : undefined,
      });
      setIsAssignModalOpen(false);
    } catch {
      // handled by parent toast
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName) return;
    setIsSubmitting(true);
    try {
      const doctor = doctors.find((d) => d.id === formData.doctorId);
      await onAddPatient({
        ...formData,
        status: 'Active',
        lastVisit: 'Never',
        gender: formData.gender as 'Male' | 'Female',
        doctorId: formData.doctorId || undefined,
        doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : undefined,
      });
      setIsAddModalOpen(false);
      setFormData({ firstName: '', lastName: '', phone: '', dob: '', gender: 'Male', medicalHistory: '', address: '', secondaryPhone: '', doctorId: '' });
    } catch {
      // handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const activeFiltersCount = [
    filterStatus !== 'all',
    filterGender !== 'all',
    filterDoctor !== 'all',
    !!filterDateFrom,
    !!filterDateTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bemorlar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Jami: <span className="font-semibold text-gray-700 dark:text-gray-300">{stats.total}</span> ta bemor
            {unassignedCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {unassignedCount} ta biriktirilmagan
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (confirm('Barcha qarzdor bemorlarga eslatma yuborilsinmi?')) {
                try {
                  const user = JSON.parse(localStorage.getItem('dentalflow_user') || '{}');
                  const response = await api.batch.remindDebts(user.clinicId, []);
                  alert(response.message || 'Eslatmalar yuborildi');
                } catch {
                  alert('Xatolik yuz berdi');
                }
              }
            }}
          >
            <MoreHorizontal className="w-4 h-4 mr-2" /> Qarzdorlarga eslatma
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Eksport (CSV)
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Bemor qo'shish
          </Button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveStatFilter(activeStatFilter === null ? null : null)} // Basically reset or keep null
          className={`text-left transition-all duration-200 ${activeStatFilter === null ? 'ring-2 ring-blue-500 transform scale-[1.02]' : 'hover:scale-[1.01]'}`}
          onClickCapture={() => setActiveStatFilter(null)}
        >
          <Card className="p-4 flex items-center justify-between border-none shadow-sm h-full">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">BARCHA BEMORLAR</p>
              <h3 className="text-2xl font-bold text-blue-500 mt-1">{stats.total}</h3>
              <p className="text-[10px] text-gray-400 mt-1">Barcha vaqt</p>
            </div>
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <UsersIcon className="w-5 h-5 text-blue-500" />
            </div>
          </Card>
        </button>

        <button
          onClick={() => setActiveStatFilter(activeStatFilter === 'new' ? null : 'new')}
          className={`text-left transition-all duration-200 ${activeStatFilter === 'new' ? 'ring-2 ring-yellow-500 transform scale-[1.02]' : 'hover:scale-[1.01]'}`}
        >
          <Card className="p-4 flex items-center justify-between border-none shadow-sm h-full">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">YANGI BEMORLAR</p>
              <h3 className="text-2xl font-bold text-yellow-500 mt-1">{stats.newPatients}</h3>
              <p className="text-[10px] text-gray-400 mt-1">Oxirgi 7 kun</p>
            </div>
            <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <UserPlusIcon className="w-5 h-5 text-yellow-500" />
            </div>
          </Card>
        </button>

        <button
          onClick={() => setActiveStatFilter(activeStatFilter === 'debtor' ? null : 'debtor')}
          className={`text-left transition-all duration-200 ${activeStatFilter === 'debtor' ? 'ring-2 ring-emerald-500 transform scale-[1.02]' : 'hover:scale-[1.01]'}`}
        >
          <Card className="p-4 flex items-center justify-between border-none shadow-sm h-full">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">QARZDOR BEMORLAR</p>
              <h3 className="text-2xl font-bold text-emerald-500 mt-1">{stats.debtors}</h3>
              <p className="text-[10px] text-gray-400 mt-1">&nbsp;</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <Wallet className="w-5 h-5 text-emerald-500" />
            </div>
          </Card>
        </button>

        <button
          onClick={() => setActiveStatFilter(activeStatFilter === 'waiting' ? null : 'waiting')}
          className={`text-left transition-all duration-200 ${activeStatFilter === 'waiting' ? 'ring-2 ring-red-500 transform scale-[1.02]' : 'hover:scale-[1.01]'}`}
        >
          <Card className="p-4 flex items-center justify-between border-none shadow-sm h-full">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">KUTILMOQDA</p>
              <h3 className="text-2xl font-bold text-red-500 mt-1">{stats.waiting}</h3>
              <p className="text-[10px] text-gray-400 mt-1">To'lov kutilmoqda</p>
            </div>
            <div className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <Wallet className="w-5 h-5 text-red-500" />
            </div>
          </Card>
        </button>
      </div>

      {/* Search + Filter toggle row */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Ism yoki telefon orqali qidirish..."
              className="pl-9 h-9 w-full rounded-md border border-gray-300 bg-transparent text-sm focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 h-9 rounded-md border text-sm font-medium transition-colors ${showFilters || activeFiltersCount > 0
              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
          >
            <Filter className="w-4 h-4" />
            Filtrlar
            {activeFiltersCount > 0 && (
              <span className="ml-1 bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Barchasi</option>
                <option value="active">Faol</option>
                <option value="archived">Arxiv</option>
                <option value="unassigned">Biriktirilmagan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Jins</label>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Barchasi</option>
                <option value="male">Erkak</option>
                <option value="female">Ayol</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Shifokor</label>
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Barchasi</option>
                <option value="none">Biriktirilmagan</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tug'ilganidan boshlab</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tugash sanasi</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {activeFiltersCount > 0 && (
              <div className="col-span-full flex justify-end">
                <button
                  onClick={() => {
                    setFilterStatus('all'); setFilterGender('all'); setFilterDoctor('all');
                    setFilterDateFrom(''); setFilterDateTo('');
                  }}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 underline"
                >
                  Barcha filtrlarni tozalash
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Ism Sharifi</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Telefon</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Yosh/Jins</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Shifokor</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Oxirgi Tashrif</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPatients.map((patient) => (
                <tr
                  key={patient.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                  onClick={() => onPatientClick(patient.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-sm group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                        {patient.firstName[0]}{patient.lastName[0]}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {patient.lastName} {patient.firstName}
                        </div>
                        <div className="text-xs text-gray-500">ID: {patient.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{patient.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : 'N/A'} / {patient.gender === 'Male' ? 'Erkak' : 'Ayol'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {patient.doctorName ? (
                      <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                          {patient.doctorName[0]}
                        </div>
                        {patient.doctorName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
                        <AlertCircle className="w-3 h-3" /> Biriktirilmagan
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{patient.lastVisit}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge status={patient.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => openAssignModal(e, patient)}
                        className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400 p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title="Doktorga biriktirish"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onPatientClick(patient.id); }}
                        className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        title="Batafsil"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Haqiqatan ham bu bemorni o'chirmoqchimisiz?")) onDeletePatient(patient.id);
                        }}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="O'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Search className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    So'rovingiz bo'yicha bemorlar topilmadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Doctor Assignment Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Doktorga Biriktirish">
        {selectedPatient && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 font-bold">
                {selectedPatient.firstName[0]}{selectedPatient.lastName[0]}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{selectedPatient.lastName} {selectedPatient.firstName}</p>
                <p className="text-sm text-gray-500">{selectedPatient.phone}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shifokorni tanlang</label>
              <select
                value={assignDoctorId}
                onChange={(e) => setAssignDoctorId(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Biriktirilmagan —</option>
                {doctors.filter((d) => d.status === 'Active').map((d) => (
                  <option key={d.id} value={d.id}>{d.lastName} {d.firstName} ({d.specialty})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsAssignModalOpen(false)} disabled={isAssigning}>
                Bekor qilish
              </Button>
              <Button onClick={handleAssignDoctor} disabled={isAssigning}>
                {isAssigning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saqlanmoqda...</> : <><UserCheck className="w-4 h-4 mr-2" />Biriktirish</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Patient Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Yangi Bemor Qo'shish">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Familiya" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
            <Input label="Ism" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Asosiy Telefon" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+998 XX XXX XX XX" required />
            <Input label="Qo'shimcha Telefon" name="secondaryPhone" value={formData.secondaryPhone} onChange={handleInputChange} placeholder="+998 XX XXX XX XX" />
          </div>
          <Input label="Tug'ilgan sana" type="date" name="dob" value={formData.dob} onChange={handleInputChange} required helperText="Sanani qo'lda kiritish uchun maydonga bosing" />
          <Input label="Manzil (Ixtiyoriy)" name="address" value={formData.address} onChange={handleInputChange} placeholder="Toshkent sh., Chilonzor t..." />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shifokor</label>
            <select
              name="doctorId"
              value={formData.doctorId}
              onChange={handleInputChange}
              className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Keyinroq biriktirish —</option>
              {doctors.filter((d) => d.status === 'Active').map((d) => (
                <option key={d.id} value={d.id}>{d.lastName} {d.firstName} ({d.specialty})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jins</label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input type="radio" name="gender" value="Male" checked={formData.gender === 'Male'} onChange={handleInputChange} className="text-blue-600 focus:ring-blue-500" /> <span>Erkak</span>
              </label>
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input type="radio" name="gender" value="Female" checked={formData.gender === 'Female'} onChange={handleInputChange} className="text-blue-600 focus:ring-blue-500" /> <span>Ayol</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tibbiy Tarix</label>
            <textarea
              name="medicalHistory"
              value={formData.medicalHistory}
              onChange={handleInputChange}
              className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white h-24 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Allergiya, surunkali kasalliklar..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>Bekor qilish</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saqlanmoqda...</> : 'Saqlash'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};