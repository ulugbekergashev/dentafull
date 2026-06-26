import React, { useEffect, useState } from 'react';
import { Building2, TrendingUp, CheckCircle, Clock, LogOut, RefreshCw } from 'lucide-react';
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

interface SalesDashboardProps {
  agentName: string;
  onLogout: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Active:  { label: 'Faol',     color: 'bg-green-100 text-green-700' },
  Trial:   { label: 'Sinov',    color: 'bg-blue-100 text-blue-700' },
  Blocked: { label: 'Bloklangan', color: 'bg-red-100 text-red-700' },
  Pending: { label: 'Kutilmoqda', color: 'bg-yellow-100 text-yellow-700' },
};

export const SalesDashboard: React.FC<SalesDashboardProps> = ({ agentName, onLogout }) => {
  const [clinics, setClinics] = useState<SalesClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClinics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.sales.myClinics();
      setClinics(data || []);
    } catch (e: any) {
      setError(e.message || 'Ma\'lumotlarni yuklab bo\'lmadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClinics(); }, []);

  const stats = {
    total:   clinics.length,
    active:  clinics.filter(c => c.status === 'Active').length,
    trial:   clinics.filter(c => c.status === 'Trial').length,
    blocked: clinics.filter(c => c.status === 'Blocked').length,
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Jami klinikalar', value: stats.total,   icon: Building2,   color: 'bg-blue-50 text-blue-600' },
            { label: 'Faol',            value: stats.active,  icon: CheckCircle, color: 'bg-green-50 text-green-600' },
            { label: 'Sinov rejimi',    value: stats.trial,   icon: Clock,       color: 'bg-indigo-50 text-indigo-600' },
            { label: 'O\'sish',         value: `+${stats.total}`, icon: TrendingUp, color: 'bg-violet-50 text-violet-600' },
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
            <button
              onClick={loadClinics}
              className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
              <p className="text-sm">Yuklanmoqda...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-red-500">
              <p className="text-sm">{error}</p>
              <button onClick={loadClinics} className="mt-3 text-xs text-blue-600 hover:underline cursor-pointer">Qayta urinish</button>
            </div>
          ) : clinics.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Hali klinikalar yo'q</p>
              <p className="text-xs mt-1">Superadmin orqali klinikalar qo'shilganda bu yerda ko'rinadi</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-6 py-3 text-left">#</th>
                    <th className="px-6 py-3 text-left">Klinika nomi</th>
                    <th className="px-6 py-3 text-left">Admin</th>
                    <th className="px-6 py-3 text-left">Telefon</th>
                    <th className="px-6 py-3 text-left">Tarif</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Tugash sanasi</th>
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
                        <td className="px-6 py-4 text-gray-600 font-mono text-xs">{c.phone}</td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-semibold text-gray-700">{c.plan?.name || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs font-mono">
                          {c.expiryDate || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
