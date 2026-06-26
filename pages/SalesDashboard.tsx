import React, { useEffect, useState } from 'react';
import { Building2, TrendingUp, CheckCircle, Clock, LogOut, RefreshCw, Plus, X, User, Lock, Phone as PhoneIcon, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

interface SalesClinic {
  id: string;
  name: string;
  adminName: string;
  phone: string;
  status: string;
  createdAt: string;
  expiryDate?: string;
  plan?: { name: string };
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Active:  { label: 'Faol',       color: 'bg-green-100 text-green-700' },
  Trial:   { label: 'Sinov',      color: 'bg-blue-100 text-blue-700' },
  Blocked: { label: 'Bloklangan', color: 'bg-red-100 text-red-700' },
  Pending: { label: 'Kutilmoqda', color: 'bg-yellow-100 text-yellow-700' },
};

const EMPTY_FORM = {
  name: '', adminName: '', username: '', password: '', phone: '+998 ', planId: '',
};

function AddClinicModal({ plans, onClose, onSuccess }: {
  plans: Plan[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.planId) { setError('Tarif tanlang'); return; }
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await (api.clinics.create as any)({
        name: form.name.trim(),
        adminName: form.adminName.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim(),
        planId: form.planId,
        status: 'Pending' as any,
        subscriptionType: 'Trial',
        subscriptionStartDate: today,
        expiryDate: expiry,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-gray-50 border-2 border-gray-100 focus:border-blue-500 focus:bg-white rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder:text-gray-300 outline-none transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg z-10 bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-7 pt-7 pb-8 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-10 -left-4 w-28 h-28 rounded-full bg-white/5" />
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="relative z-10 space-y-1">
            <p className="text-blue-200 text-[11px] font-bold uppercase tracking-widest">DentaCRM · Sotuvchi</p>
            <h2 className="text-xl font-extrabold text-white">Yangi klinika ro'yxatdan o'tkazish</h2>
            <p className="text-blue-100/70 text-xs">7 kunlik bepul sinov davri avtomatik boshlanadi</p>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-500" /> Klinika nomi
              </label>
              <input required value={form.name} onChange={set('name')} placeholder="Masalan: Asal Dental" className={inputCls} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-500" /> Admin ismi
              </label>
              <input required value={form.adminName} onChange={set('adminName')} placeholder="Masalan: Aziz Karimov" className={inputCls} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-500" /> Login
              </label>
              <input required value={form.username} onChange={set('username')} placeholder="azizkarimov" className={inputCls} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-blue-500" /> Parol
              </label>
              <div className="relative">
                <input
                  required
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Kuchli parol"
                  className={inputCls + ' pr-10'}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <PhoneIcon className="w-3.5 h-3.5 text-blue-500" /> Telefon
              </label>
              <input required value={form.phone} onChange={set('phone')} placeholder="+998 90 000 00 00" className={inputCls + ' font-mono'} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tarif</label>
              <select required value={form.planId} onChange={set('planId')}
                className={inputCls + ' cursor-pointer'}>
                <option value="">Tanlang...</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.maxDoctors} shifokor
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-extrabold text-sm tracking-wide transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-blue-500/20 mt-2 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {loading ? 'Yaratilmoqda...' : 'Klinikani ro\'yxatdan o\'tkazish'}
          </button>
          <p className="text-[11px] text-gray-400 text-center">Login va parol klinikaga beriladi — tizimga kirish uchun</p>
        </form>
      </div>
    </div>
  );
}

export const SalesDashboard: React.FC<SalesDashboardProps> = ({ agentName, onLogout }) => {
  const [clinics, setClinics] = useState<SalesClinic[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clins, plns] = await Promise.all([
        api.sales.myClinics(),
        api.plans.getAll(),
      ]);
      setClinics(clins || []);
      setPlans(plns || []);
    } catch (e: any) {
      setError(e.message || 'Ma\'lumotlarni yuklab bo\'lmadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const stats = {
    total:  clinics.length,
    active: clinics.filter(c => c.status === 'Active').length,
    trial:  clinics.filter(c => c.status === 'Trial').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
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
            <p className="text-sm font-semibold text-gray-800">{agentName}</p>
            <p className="text-[11px] text-gray-400">Sotuvchi</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {agentName.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Chiqish</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Stats + CTA */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Jami klinikalar', value: stats.total,  icon: Building2,   color: 'bg-blue-50 text-blue-600' },
            { label: 'Faol',            value: stats.active, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
            { label: 'Sinov rejimi',    value: stats.trial,  icon: Clock,       color: 'bg-indigo-50 text-indigo-600' },
            { label: 'Bu oyda',         value: `+${clinics.filter(c => c.createdAt?.startsWith(new Date().toISOString().slice(0,7))).length}`, icon: TrendingUp, color: 'bg-violet-50 text-violet-600' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Clinics Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Mening klinikalarim</h2>
            <div className="flex items-center gap-2">
              <button onClick={loadData}
                className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all cursor-pointer shadow-sm shadow-blue-500/20"
              >
                <Plus className="w-4 h-4" />
                Yangi klinika
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
              <p className="text-sm">Yuklanmoqda...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-red-500">
              <p className="text-sm">{error}</p>
              <button onClick={loadData} className="mt-3 text-xs text-blue-600 hover:underline cursor-pointer">Qayta urinish</button>
            </div>
          ) : clinics.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Hali klinikalar yo'q</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">Birinchi klinikangizni hoziroq ro'yxatdan o'tkazing</p>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" /> Yangi klinika qo'shish
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    <th className="px-6 py-3 text-left">#</th>
                    <th className="px-6 py-3 text-left">Klinika</th>
                    <th className="px-6 py-3 text-left">Admin</th>
                    <th className="px-6 py-3 text-left">Telefon</th>
                    <th className="px-6 py-3 text-left">Tarif</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Tugash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clinics.map((c, i) => {
                    const st = STATUS_LABELS[c.status] || { label: c.status, color: 'bg-gray-100 text-gray-600' };
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-gray-900">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{c.adminName}</td>
                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">{c.phone}</td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-semibold text-gray-700">{c.plan?.name || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-400 text-xs font-mono">{c.expiryDate || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <AddClinicModal
          plans={plans}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
