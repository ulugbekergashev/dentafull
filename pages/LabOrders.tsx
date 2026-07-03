import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FlaskConical, Plus, Search, Clock, CheckCircle, Package, Truck, X, Edit2, Trash2, AlertCircle, ChevronDown, User, Stethoscope, Calendar } from 'lucide-react';
import { LabTechnician, LabOrder, Patient } from '../types';
import { api } from '../services/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'Pending':     { label: 'Kutilmoqda',    color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',   icon: Clock },
  'In-Progress': { label: 'Ishlayapti',    color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400',        icon: FlaskConical },
  'Ready':       { label: 'Tayyor',        color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
  'Delivered':   { label: 'Topshirildi',   color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  'Cancelled':   { label: 'Bekor qilindi', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',             icon: X },
};

const ORDER_TYPES = ['Koronka', 'Ko\'chma protez', 'Qo\'zg\'almas protez', 'Veneer', 'Implant ustama', 'Breket', 'Kappaterapiya', 'Reteyner', 'Boshqa'];
const MATERIALS   = ['Metallkeramika', 'Zirkoniya', 'E-max (Litiy disilkat)', 'Akrilik', 'Metal', 'Kompozit', 'Boshqa'];

interface Props {
  clinicId: string;
  labTechnicians: LabTechnician[];
  labOrders: LabOrder[];
  setLabOrders: (orders: LabOrder[]) => void;
  doctors: any[];
  patients?: Patient[];
}

const emptyForm = {
  patientName: '', doctorName: '', technicianId: '', orderType: '', material: '',
  toothNumbers: '', deadline: '', price: '', priority: 'Normal' as const,
  clinicianNotes: '', notes: '', status: 'Pending',
};

export const LabOrders: React.FC<Props> = ({ clinicId, labTechnicians, labOrders, setLabOrders, doctors, patients = [] }) => {
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTech, setFilterTech]   = useState<string>('all');
  const [showModal, setShowModal]     = useState(false);
  const [editingOrder, setEditingOrder] = useState<LabOrder | null>(null);
  const [form, setForm]               = useState({ ...emptyForm });
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // Patient autocomplete state
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientRef.current && !patientRef.current.contains(e.target as Node)) {
        setShowPatientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredPatients = patientSearch.length >= 1
    ? patients.filter(p =>
        `${p.lastName} ${p.firstName}`.toLowerCase().includes(patientSearch.toLowerCase()) ||
        p.phone.includes(patientSearch)
      ).slice(0, 8)
    : [];

  const activeTechs = labTechnicians.filter(t => t.status === 'Active');

  const filtered = labOrders.filter(o => {
    const matchSearch = !search || o.patientName.toLowerCase().includes(search.toLowerCase()) || o.technicianName.toLowerCase().includes(search.toLowerCase()) || o.orderType.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    const matchTech   = filterTech === 'all' || o.technicianId === filterTech;
    return matchSearch && matchStatus && matchTech;
  });

  const stats = {
    pending:    labOrders.filter(o => o.status === 'Pending').length,
    inProgress: labOrders.filter(o => o.status === 'In-Progress').length,
    ready:      labOrders.filter(o => o.status === 'Ready').length,
    overdue:    labOrders.filter(o => ['Pending','In-Progress'].includes(o.status) && o.deadline < new Date().toISOString().split('T')[0]).length,
  };

  const openAdd = () => { setEditingOrder(null); setForm({ ...emptyForm }); setPatientSearch(''); setShowPatientDropdown(false); setError(''); setShowModal(true); };
  const openEdit = (o: LabOrder) => {
    setEditingOrder(o);
    setForm({ patientName: o.patientName, doctorName: o.doctorName, technicianId: o.technicianId, orderType: o.orderType, material: o.material||'', toothNumbers: o.toothNumbers||'', deadline: o.deadline, price: String(o.price||0), priority: o.priority, clinicianNotes: o.clinicianNotes||'', notes: o.notes||'', status: o.status });
    setError(''); setShowModal(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.patientName.trim() || !form.technicianId || !form.orderType || !form.deadline) {
      setError("Bemor ismi, texnik, buyurtma turi va muddatini to'ldiring");
      return;
    }
    setSaving(true); setError('');
    try {
      const tech = activeTechs.find(t => t.id === form.technicianId);
      const payload = { ...form, technicianName: tech ? `${tech.lastName} ${tech.firstName}` : '', clinicId };
      if (editingOrder) {
        const updated = await api.labOrders.update(editingOrder.id, payload);
        setLabOrders(labOrders.map(o => o.id === editingOrder.id ? { ...o, ...updated } : o));
      } else {
        const created = await api.labOrders.create(payload);
        setLabOrders([created, ...labOrders]);
      }
      setShowModal(false);
    } catch (e: any) { setError(e.message || 'Xatolik yuz berdi'); }
    finally { setSaving(false); }
  }, [form, editingOrder, clinicId, activeTechs, labOrders, setLabOrders]);

  const handleStatusChange = async (order: LabOrder, newStatus: string) => {
    try {
      const updated = await api.labOrders.update(order.id, { status: newStatus });
      setLabOrders(labOrders.map(o => o.id === order.id ? { ...o, ...updated } : o));
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu buyurtmani o\'chirishni tasdiqlaysizmi?')) return;
    try {
      await api.labOrders.delete(id);
      setLabOrders(labOrders.filter(o => o.id !== id));
    } catch {}
  };

  const isOverdue = (o: LabOrder) => ['Pending','In-Progress'].includes(o.status) && o.deadline < new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            Laboratoriya Buyurtmalari
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Dental texnik buyurtmalarini boshqaring</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium shadow-md hover:shadow-lg active:scale-95 transition-all">
          <Plus className="w-4 h-4" /> Buyurtma qo'shish
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Kutilmoqda',  value: stats.pending,    color: 'from-amber-400 to-orange-500',  icon: Clock },
          { label: 'Ishlayapti',  value: stats.inProgress, color: 'from-blue-500 to-indigo-600',   icon: FlaskConical },
          { label: 'Tayyor',      value: stats.ready,      color: 'from-emerald-400 to-green-500', icon: CheckCircle },
          { label: 'Muddati o\'tgan', value: stats.overdue, color: 'from-red-400 to-rose-500',    icon: AlertCircle },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3 shadow-md`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bemor yoki texnik..." className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="all">Barcha holat</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterTech} onChange={e => setFilterTech(e.target.value)} className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="all">Barcha texnik</option>
          {activeTechs.map(t => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {activeTechs.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 text-center">
          <FlaskConical className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-semibold text-amber-800 dark:text-amber-400">Texniklar qo'shilmagan</p>
          <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">Buyurtma yaratish uchun avval Sozlamalar → Texniklar bo'limida texnik qo'shing.</p>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-3">
        {filtered.length === 0 && activeTechs.length > 0 && (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Buyurtmalar topilmadi</p>
          </div>
        )}
        {filtered.map(order => {
          const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG['Pending'];
          const StatusIcon = sc.icon;
          const overdue = isOverdue(order);
          return (
            <div key={order.id} className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm transition-all hover:shadow-md ${overdue ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{order.orderType}</span>
                      {order.priority === 'Urgent' && <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold rounded-full border border-red-200">🔴 Shoshilinch</span>}
                      {overdue && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">Muddati o'tgan!</span>}
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border flex items-center gap-1 ${sc.color}`}>
                        <StatusIcon className="w-3 h-3" />{sc.label}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{order.patientName}</span></div>
                      <div className="flex items-center gap-1.5"><Stethoscope className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{order.doctorName || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{order.technicianName}</span></div>
                      <div className={`flex items-center gap-1.5 ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}><Calendar className="w-3.5 h-3.5 shrink-0" /><span>Muddat: {order.deadline}</span></div>
                    </div>
                    {order.material && <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">Material: {order.material}{order.toothNumbers ? ` · Tishlar: ${order.toothNumbers}` : ''}</div>}
                    {order.clinicianNotes && <div className="mt-1 text-xs text-gray-500 italic">"{order.clinicianNotes}"</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Quick status change */}
                    {order.status === 'Pending' && (
                      <button onClick={() => handleStatusChange(order, 'In-Progress')} className="px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Boshlash</button>
                    )}
                    {order.status === 'In-Progress' && (
                      <button onClick={() => handleStatusChange(order, 'Ready')} className="px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium">Tayyor</button>
                    )}
                    {order.status === 'Ready' && (
                      <button onClick={() => handleStatusChange(order, 'Delivered')} className="px-2.5 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium">Topshirish</button>
                    )}
                    <button onClick={() => openEdit(order)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(order.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{editingOrder ? 'Buyurtmani tahrirlash' : 'Yangi buyurtma'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2" ref={patientRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bemor ismi *</label>
                  <div className="relative">
                    {form.patientName && !patientSearch ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 border border-teal-400 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-600 rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {form.patientName[0]}
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">{form.patientName}</span>
                        <button
                          type="button"
                          onClick={() => { setForm(f => ({ ...f, patientName: '' })); setPatientSearch(''); }}
                          className="text-gray-400 hover:text-gray-600 text-xs px-1"
                        >✕</button>
                      </div>
                    ) : (
                      <input
                        value={patientSearch}
                        onChange={e => {
                          setPatientSearch(e.target.value);
                          setForm(f => ({ ...f, patientName: '' }));
                          setShowPatientDropdown(true);
                        }}
                        onFocus={() => { if (patientSearch) setShowPatientDropdown(true); }}
                        placeholder="Bemor ismi yoki telefoni bilan qidiring..."
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        autoFocus={!form.patientName}
                      />
                    )}
                    {showPatientDropdown && filteredPatients.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                        {filteredPatients.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              const fullName = `${p.lastName} ${p.firstName}`;
                              setForm(f => ({ ...f, patientName: fullName }));
                              setPatientSearch('');
                              setShowPatientDropdown(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-left transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-700 dark:text-teal-300 text-xs font-bold flex-shrink-0">
                              {p.firstName[0]}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.lastName} {p.firstName}</p>
                              <p className="text-xs text-gray-400">{p.phone}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shifokor</label>
                  <select value={form.doctorName} onChange={e => setForm(f => ({...f, doctorName: e.target.value}))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">— Tanlang —</option>
                    {doctors.map(d => <option key={d.id} value={`Dr. ${d.lastName} ${d.firstName}`}>{d.lastName} {d.firstName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Texnik *</label>
                  <select value={form.technicianId} onChange={e => setForm(f => ({...f, technicianId: e.target.value}))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">— Tanlang —</option>
                    {activeTechs.map(t => <option key={t.id} value={t.id}>{t.lastName} {t.firstName} ({t.specialty})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buyurtma turi *</label>
                  <select value={form.orderType} onChange={e => setForm(f => ({...f, orderType: e.target.value}))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">— Tanlang —</option>
                    {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Material</label>
                  <select value={form.material} onChange={e => setForm(f => ({...f, material: e.target.value}))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">— Tanlang —</option>
                    {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tish raqamlari</label>
                  <input value={form.toothNumbers} onChange={e => setForm(f => ({...f, toothNumbers: e.target.value}))} placeholder="14, 15, 16" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Muddat (deadline) *</label>
                  <input type="date" value={form.deadline} onChange={e => setForm(f => ({...f, deadline: e.target.value}))} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Narx (UZS)</label>
                  <input type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ustuvorlik</label>
                  <div className="flex gap-2">
                    {(['Normal', 'Urgent'] as const).map(p => (
                      <button key={p} type="button" onClick={() => setForm(f => ({...f, priority: p}))} className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${form.priority === p ? (p === 'Urgent' ? 'bg-red-600 text-white border-red-600' : 'bg-teal-600 text-white border-teal-600') : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                        {p === 'Normal' ? 'Oddiy' : '🔴 Shoshilinch'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buyurtma holati</label>
                  <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value as any}))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shifokordan izoh</label>
                  <textarea value={form.clinicianNotes} onChange={e => setForm(f => ({...f, clinicianNotes: e.target.value}))} rows={2} placeholder="Texnikka maxsus ko'rsatmalar..." className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Bekor</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors">
                {saving ? 'Saqlanmoqda...' : editingOrder ? 'Saqlash' : 'Yaratish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
