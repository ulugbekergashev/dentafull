import React, { useEffect, useState } from 'react';
import { Building2, TrendingUp, CheckCircle, Clock, LogOut, Plus, X, Lock, CreditCard, Calendar, ArrowRight, RefreshCw, Search } from 'lucide-react';
import { Card, Button, Input, Badge, Modal, Select } from '../components/Common';
import { api } from '../services/api';

interface SalesClinic {
  id: string;
  name: string;
  adminName: string;
  username: string;
  phone: string;
  status: string;
  subscriptionStartDate: string;
  expiryDate: string;
  subscriptionType: string;
  planId: string;
  plan?: { id: string; name: string; price: number };
}

interface Plan {
  id: string;
  name: string;
  price: number;
  maxDoctors: number;
}

interface SalesDashboardProps {
  agentName: string;
  onLogout: () => void;
}

const getDaysRemaining = (expiryDate: string) => {
  if (!expiryDate) return 0;
  const expiry = new Date(expiryDate);
  const today = new Date();
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

/* ── Yangi klinika modal (superadmin stili) ──────────────────── */
const EMPTY_FORM = {
  name: '', adminName: '', username: '', password: '', phone: '',
  planId: '', useCustomPrice: false, customPrice: 0, doctorCount: 1,
  subscriptionType: 'Trial' as 'Paid' | 'Trial',
};

function AddClinicModal({ plans, onClose, onSuccess }: { plans: Plan[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, planId: plans.length > 0 ? plans[0].id : '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setForm(f => ({ ...f, password: pass }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.planId) { setError('Tarif tanlang'); return; }
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const expDate = new Date();
      if (form.subscriptionType === 'Trial') expDate.setDate(expDate.getDate() + 7);
      else expDate.setMonth(expDate.getMonth() + 1);
      const expiryDate = expDate.toISOString().split('T')[0];

      await (api.clinics.create as any)({
        name: form.name.trim(),
        adminName: form.adminName.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim(),
        planId: form.planId,
        status: 'Active',
        subscriptionType: form.subscriptionType,
        subscriptionStartDate: today,
        expiryDate,
        customPrice: form.useCustomPrice ? form.customPrice : null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Yangi Klinika Qo'shish">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg px-4 py-2.5">{error}</div>}

        <Input label="Klinika Nomi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Admin ismi" value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} required />
          <Input label="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4" /> Kirish Ma'lumotlari
          </h4>
          <Input label="Login" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
          <div className="flex items-end gap-2">
            <Input label="Parol" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required className="flex-1" />
            <Button type="button" variant="secondary" onClick={generatePassword} className="mb-[1px]">Generatsiya</Button>
          </div>
        </div>

        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-4">
          <h4 className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Tarif va Obuna
          </h4>

          <div className="flex gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="subType" checked={form.subscriptionType === 'Paid'} onChange={() => setForm({ ...form, subscriptionType: 'Paid' })} className="text-blue-600" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">To'liq</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="subType" checked={form.subscriptionType === 'Trial'} onChange={() => setForm({ ...form, subscriptionType: 'Trial' })} className="text-blue-600" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Sinov davri (Trial)</span>
            </label>
          </div>

          <Select
            label="Tarif Rejasi"
            options={plans.map(p => ({ value: p.id, label: `${p.name} - ${p.price.toLocaleString()} UZS` }))}
            value={form.planId}
            onChange={e => setForm({ ...form, planId: e.target.value })}
          />

          <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <input type="checkbox" id="useCustomPrice" checked={form.useCustomPrice} onChange={e => setForm({ ...form, useCustomPrice: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded cursor-pointer" />
            <label htmlFor="useCustomPrice" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex-1">Maxsus narx belgilash</label>
          </div>

          {form.useCustomPrice && (
            <Input label="Maxsus oylik to'lov summasi" type="number" value={form.customPrice}
              onChange={e => setForm({ ...form, customPrice: parseInt(e.target.value) || 0 })} required placeholder="Masalan: 800000" />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {loading ? 'Yaratilmoqda...' : 'Yaratish'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Klinika detail modal (read-only) ─────────────────────────── */
function ClinicDetailModal({ clinic, plans, onClose }: { clinic: SalesClinic; plans: Plan[]; onClose: () => void }) {
  const daysLeft = getDaysRemaining(clinic.expiryDate);
  const isExpired = daysLeft <= 0;
  const isExpiring = daysLeft <= 3 && daysLeft > 0;
  const plan = plans.find(p => p.id === clinic.planId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Klinika ma'lumotlari</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{clinic.name}</h3>
              <p className="text-gray-500 text-sm">@{clinic.username}</p>
              <p className="text-gray-500 text-sm">{clinic.phone}</p>
              <p className="text-gray-400 text-xs mt-0.5">Admin: {clinic.adminName}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge status={clinic.status === 'Active' ? 'active' : 'blocked'} />
              {clinic.subscriptionType === 'Trial' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">TRIAL</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Tarif</p>
              <p className="font-bold text-gray-900 dark:text-white">{plan?.name || '—'}</p>
            </div>
            <div className={`rounded-xl p-3 ${isExpired ? 'bg-red-50 dark:bg-red-900/20' : isExpiring ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
              <p className="text-xs text-gray-400 mb-1">Muddat</p>
              <p className={`font-bold ${isExpired ? 'text-red-600' : isExpiring ? 'text-orange-600' : 'text-green-600'}`}>
                {isExpired ? 'Tugagan' : `${daysLeft} kun qoldi`}
              </p>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs">{clinic.subscriptionStartDate} <ArrowRight className="inline w-3 h-3 mx-0.5" /> {clinic.expiryDate}</span>
            </div>
          </div>

          <Button variant="secondary" onClick={onClose} className="w-full">Yopish</Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main SalesDashboard ─────────────────────────────────────── */
export const SalesDashboard: React.FC<SalesDashboardProps> = ({ agentName, onLogout }) => {
  const [clinics, setClinics] = useState<SalesClinic[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<SalesClinic | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clins, plns] = await Promise.all([api.sales.myClinics(), api.plans.getAll()]);
      setClinics(clins || []);
      setPlans(plns || []);
    } catch (e: any) {
      setError(e.message || 'Ma\'lumotlarni yuklab bo\'lmadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Filter + pagination
  const filtered = clinics.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(q) || c.adminName.toLowerCase().includes(q) || c.phone.includes(q);
    if (!matchSearch) return false;
    const d = getDaysRemaining(c.expiryDate);
    if (filterStatus === 'Active') return c.status === 'Active';
    if (filterStatus === 'Trial') return c.subscriptionType === 'Trial';
    if (filterStatus === 'Expiring') return d <= 3 && d > 0;
    if (filterStatus === 'Expired') return d <= 0;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    total:   clinics.length,
    active:  clinics.filter(c => c.status === 'Active').length,
    trial:   clinics.filter(c => c.subscriptionType === 'Trial').length,
    thisMonth: clinics.filter(c => c.subscriptionStartDate?.startsWith(new Date().toISOString().slice(0, 7))).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <img src="/logo-icon.png" alt="DentaCRM" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="text-lg font-bold text-blue-600">DentaCRM</span>
            <p className="text-[11px] text-gray-400 -mt-0.5">Sotuvchi paneli</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">{agentName}</p>
            <p className="text-[11px] text-gray-400">Sotuvchi</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">{agentName.charAt(0).toUpperCase()}</div>
          <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Chiqish</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Jami klinikalar', value: stats.total,     icon: Building2,   color: 'bg-blue-50 text-blue-600' },
            { label: 'Faol',            value: stats.active,    icon: CheckCircle, color: 'bg-green-50 text-green-600' },
            { label: 'Sinov rejimi',    value: stats.trial,     icon: Clock,       color: 'bg-indigo-50 text-indigo-600' },
            { label: 'Bu oyda',         value: `+${stats.thisMonth}`, icon: TrendingUp, color: 'bg-violet-50 text-violet-600' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex flex-col gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Clinics Table — same as SuperAdmin */}
        <Card className="p-6">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Mening klinikalarim</h3>
            <div className="flex flex-1 w-full md:w-auto gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Klinika yoki admin ismi..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-9 w-full"
                />
              </div>
              <select
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              >
                <option value="All">Barchasi ({clinics.length})</option>
                <option value="Active">Faol ({stats.active})</option>
                <option value="Trial">Sinov ({stats.trial})</option>
                <option value="Expiring">Tugayotgan</option>
                <option value="Expired">Muddati tugagan</option>
              </select>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" /> Yangi klinika
              </Button>
              <button onClick={loadData} className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer border border-gray-200 dark:border-gray-600">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {error ? (
            <div className="py-12 text-center text-red-500 text-sm">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="p-4 font-medium text-gray-500">Klinika</th>
                    <th className="p-4 font-medium text-gray-500">Tarif</th>
                    <th className="p-4 font-medium text-gray-500">Muddat</th>
                    <th className="p-4 font-medium text-gray-500">Status</th>
                    <th className="p-4 font-medium text-gray-500 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                      Yuklanmoqda...
                    </td></tr>
                  ) : paginated.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center">
                      <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-500 text-sm font-medium">Klinikalar topilmadi</p>
                      {clinics.length === 0 && (
                        <button onClick={() => setShowAddModal(true)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer">
                          <Plus className="w-4 h-4" /> Birinchi klinikani qo'shish
                        </button>
                      )}
                    </td></tr>
                  ) : paginated.map(clinic => {
                    const daysLeft = getDaysRemaining(clinic.expiryDate);
                    const isExpiring = daysLeft <= 3 && daysLeft > 0;
                    const isExpired = daysLeft <= 0;
                    return (
                      <tr key={clinic.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group" onClick={() => setSelectedClinic(clinic)}>
                        <td className="p-4">
                          <div className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">{clinic.name}</div>
                          <div className="text-xs text-gray-500">{clinic.adminName}</div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 rounded-md text-xs font-bold uppercase bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                            {plans.find(p => p.id === clinic.planId)?.name || '—'}
                          </span>
                          {clinic.subscriptionType === 'Trial' && (
                            <span className="ml-2 px-2 py-1 rounded-md text-xs font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">TRIAL</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-700 dark:text-gray-300 text-xs">
                              {clinic.subscriptionStartDate} <ArrowRight className="inline w-3 h-3 mx-1" /> {clinic.expiryDate}
                            </span>
                          </div>
                          <div className={`text-xs mt-1 font-medium ${isExpired ? 'text-red-500' : isExpiring ? 'text-orange-500' : 'text-green-500'}`}>
                            {isExpired ? 'Muddati tugagan' : `${daysLeft} kun qoldi`}
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge status={clinic.status === 'Active' ? 'active' : 'blocked'} />
                        </td>
                        <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="secondary" onClick={() => setSelectedClinic(clinic)}>Ko'rish</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="text-sm text-gray-500">Jami: {filtered.length} ta klinika (Sahifa {currentPage} / {totalPages})</div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Ortga</Button>
                <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Oldinga</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {showAddModal && <AddClinicModal plans={plans} onClose={() => setShowAddModal(false)} onSuccess={loadData} />}
      {selectedClinic && <ClinicDetailModal clinic={selectedClinic} plans={plans} onClose={() => setSelectedClinic(null)} />}
    </div>
  );
};
