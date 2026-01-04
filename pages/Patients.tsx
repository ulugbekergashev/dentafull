import React, { useState } from 'react';
import { Card, Button, Input, Badge, Modal, Select } from '../components/Common';
import { Search, Plus, MoreHorizontal, Eye, Trash2 } from 'lucide-react';
import { Patient } from '../types';
import { api } from '../services/api';

interface PatientsProps {
  patients: Patient[];
  onPatientClick: (id: string) => void;
  onAddPatient: (patient: Omit<Patient, 'id'>) => void;
  onDeletePatient: (id: string) => void;
}

export const Patients: React.FC<PatientsProps> = ({ patients, onPatientClick, onAddPatient, onDeletePatient }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Barcha statuslar');

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dob: '',
    gender: 'Male',
    medicalHistory: '',
    address: ''
  });

  const filteredPatients = patients.filter(p => {
    const matchesSearch =
      p.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm);
    const matchesStatus = filterStatus === 'Barcha statuslar' || p.status === (filterStatus === 'Faol' ? 'Active' : 'Archived'); // Simple mapping for demo
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName) return;

    onAddPatient({
      ...formData,
      status: 'Active',
      lastVisit: 'Never',
      gender: formData.gender as 'Male' | 'Female'
    });

    setIsAddModalOpen(false);
    setFormData({
      firstName: '',
      lastName: '',
      phone: '',
      dob: '',
      gender: 'Male',
      medicalHistory: '',
      address: ''
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bemorlar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Bemorlar ro'yxati va tarixi</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (confirm('Barcha qarzdor bemorlarga eslatma yuborilsinmi?')) {
                try {
                  const user = JSON.parse(localStorage.getItem('dentalflow_user') || '{}');
                  const response = await api.batch.remindDebts(user.clinicId, []);
                  alert(response.message || 'Eslatmalar yuborildi');
                } catch (e) {
                  alert('Xatolik yuz berdi');
                }
              }
            }}
          >
            <MoreHorizontal className="w-4 h-4 mr-2" /> Qarzdorlarga eslatma
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Bemor qo'shish
          </Button>
        </div>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 flex flex-col sm:flex-row gap-4">
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
        <div className="w-48">
          <Select
            options={[
              { value: 'Barcha statuslar', label: 'Barcha statuslar' },
              { value: 'Faol', label: 'Faol' },
              { value: 'Arxiv', label: 'Arxiv' }
            ]}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
        </div>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{patient.lastVisit}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge status={patient.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onPatientClick(patient.id); }}
                        className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="Batafsil"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Haqiqatan ham bu bemorni o\'chirmoqchimisiz?')) onDeletePatient(patient.id);
                        }}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1"
                        title="O'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">So'rovingiz bo'yicha bemorlar topilmadi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Patient Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Yangi Bemor Qo'shish">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Familiya" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
            <Input label="Ism" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Telefon" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+998 XX XXX XX XX" required />
            <Input
              label="Tug'ilgan sana"
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleInputChange}
              required
              helperText="Sanani qo'lda kiritish uchun maydonga bosing"
            />
          </div>
          <Input label="Manzil (Ixtiyoriy)" name="address" value={formData.address} onChange={handleInputChange} placeholder="Toshkent sh., Chilonzor t..." />
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
            ></textarea>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit">Saqlash</Button>
          </div>
        </form>
      </Modal>
    </div >
  );
};