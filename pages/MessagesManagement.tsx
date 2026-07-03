import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button } from '../components/Common';
import { Patient, Doctor, Appointment, Transaction, Clinic, MessageTemplate, AutomationRule, MessageLog, MessageChannel, AutomationTrigger } from '../types';
import { api } from '../services/api';
import {
    MessageSquare, Clock, Send, CalendarDays, Plus, X, Pencil, Trash2,
    AlertTriangle, Eye, Users, RefreshCw, CheckCircle2, XCircle, Smartphone
} from 'lucide-react';

interface MessagesManagementProps {
    clinicId: string;
    currentClinic?: Clinic;
    patients: Patient[];
    doctors: Doctor[];
    appointments: Appointment[];
    transactions: Transaction[];
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

// Shablon o'zgaruvchilari (backend processTemplate bilan mos)
const TEMPLATE_VARS: { token: string; label: string }[] = [
    { token: '{bemor_ismi}', label: '+ Bemor ismi' },
    { token: '{bemor_familyasi}', label: '+ Familya' },
    { token: '{sana}', label: '+ Sana' },
    { token: '{vaqt}', label: '+ Vaqt' },
    { token: '{klinika_nomi}', label: '+ Klinika nomi' },
    { token: '{shifokor_ismi}', label: '+ Shifokor ismi' },
    { token: '{qarz}', label: '+ Qarz miqdori' },
];

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
    before_appointment: '⏰ Qabuldan oldin',
    birthday: "🎂 Tug'ilgan kun",
    no_show: '❗ Kelmagan bemor',
};

const HOUR_OPTIONS = [1, 2, 3, 6, 12, 24];

const SOURCE_LABELS: Record<string, string> = {
    manual: "Qo'lda yuborildi",
    bulk: "Qo'lda yuborildi",
    auto: 'Avtomatik',
    debt: 'Qarz eslatma',
    birthday: "Tug'ilgan kun",
    noshow: 'Kelmagan bemor',
    retry: 'Qayta yuborish',
};

const inputCls = "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white placeholder-gray-400";
const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

// Bemor tug'ilgan kunini MM-DD ga keltirish
function dobToMonthDay(dob?: string): string {
    if (!dob) return '';
    if (dob.includes('-')) {
        const parts = dob.split('-');
        if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
    } else if (dob.includes('.')) {
        const parts = dob.split('.');
        if (parts.length >= 2) return `${parts[1]}-${parts[0]}`;
    }
    return '';
}

export const MessagesManagement: React.FC<MessagesManagementProps> = ({
    clinicId, currentClinic, patients, doctors, transactions, addToast
}) => {
    const [activeTab, setActiveTab] = useState<'templates' | 'auto' | 'manual' | 'history'>('templates');

    // ── Ma'lumotlar ──
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [logs, setLogs] = useState<MessageLog[]>([]);
    const [logStats, setLogStats] = useState({ total: 0, sent: 0, failed: 0 });
    const [smsConnected, setSmsConnected] = useState(false);

    useEffect(() => {
        if (!clinicId) return;
        api.messageTemplates.getAll(clinicId).then(setTemplates).catch(() => { });
        api.automationRules.getAll(clinicId).then(setRules).catch(() => { });
        api.sms.getSettings(clinicId).then((s: any) => setSmsConnected(!!s.isConnected)).catch(() => { });
        loadLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clinicId]);

    const loadLogs = () => {
        if (!clinicId) return;
        api.messages.getLogs(clinicId).then(res => {
            setLogs(res.logs || []);
            setLogStats(res.stats || { total: 0, sent: 0, failed: 0 });
        }).catch(() => { });
    };

    const telegramConnected = !!currentClinic?.botToken;

    // ── Shablonlar tab ──
    const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
    const [templateForm, setTemplateForm] = useState({ name: '', text: '' });
    const [templateSaving, setTemplateSaving] = useState(false);

    const openTemplateForm = (tpl?: MessageTemplate) => {
        setEditingTemplate(tpl || null);
        setTemplateForm({ name: tpl?.name || '', text: tpl?.text || '' });
        setIsTemplateFormOpen(true);
    };

    const handleSaveTemplate = async () => {
        if (!templateForm.name.trim() || !templateForm.text.trim()) return;
        setTemplateSaving(true);
        try {
            if (editingTemplate) {
                const updated = await api.messageTemplates.update(editingTemplate.id, templateForm);
                setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? updated : t));
                addToast('success', 'Shablon yangilandi.');
            } else {
                const created = await api.messageTemplates.create({ ...templateForm, clinicId });
                setTemplates(prev => [created, ...prev]);
                addToast('success', "Shablon qo'shildi.");
            }
            setIsTemplateFormOpen(false);
            setEditingTemplate(null);
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        } finally {
            setTemplateSaving(false);
        }
    };

    const handleDeleteTemplate = async (tpl: MessageTemplate) => {
        if (!confirm(`"${tpl.name}" shablonini o'chirishni tasdiqlaysizmi?`)) return;
        try {
            await api.messageTemplates.delete(tpl.id);
            setTemplates(prev => prev.filter(t => t.id !== tpl.id));
            addToast('info', "Shablon o'chirildi.");
        } catch (e: any) {
            addToast('error', e.message || "Shablon avtomatik qoidada ishlatilmoqda bo'lishi mumkin");
        }
    };

    // ── Avtomatik tab ──
    const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
    const [ruleForm, setRuleForm] = useState({
        name: '',
        templateId: '',
        trigger: 'before_appointment' as AutomationTrigger,
        hoursBefore: 2,
        channel: 'sms' as MessageChannel,
        doctorId: '',
    });
    const [ruleSaving, setRuleSaving] = useState(false);

    const handleSaveRule = async () => {
        if (!ruleForm.name.trim() || !ruleForm.templateId) return;
        setRuleSaving(true);
        try {
            const created = await api.automationRules.create({
                name: ruleForm.name,
                templateId: ruleForm.templateId,
                trigger: ruleForm.trigger,
                hoursBefore: ruleForm.trigger === 'before_appointment' ? ruleForm.hoursBefore : null,
                channel: ruleForm.channel,
                doctorId: ruleForm.doctorId || null,
                active: true,
                clinicId,
            });
            setRules(prev => [created, ...prev]);
            setIsRuleFormOpen(false);
            setRuleForm({ name: '', templateId: '', trigger: 'before_appointment', hoursBefore: 2, channel: 'sms', doctorId: '' });
            addToast('success', "Qoida qo'shildi.");
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        } finally {
            setRuleSaving(false);
        }
    };

    const handleToggleRule = async (rule: AutomationRule) => {
        try {
            const updated = await api.automationRules.update(rule.id, { active: !rule.active });
            setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        }
    };

    const handleDeleteRule = async (rule: AutomationRule) => {
        if (!confirm(`"${rule.name}" qoidasini o'chirishni tasdiqlaysizmi?`)) return;
        try {
            await api.automationRules.delete(rule.id);
            setRules(prev => prev.filter(r => r.id !== rule.id));
            addToast('info', "Qoida o'chirildi.");
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        }
    };

    // ── Qo'lda tab ──
    const [manualChannel, setManualChannel] = useState<'sms' | 'telegram'>('sms');
    const [audienceDoctorId, setAudienceDoctorId] = useState('All');
    const [audienceStatus, setAudienceStatus] = useState<'Active' | 'All'>('Active');
    const [audienceInactive, setAudienceInactive] = useState<'none' | '1' | '3' | '6'>('none');
    const [quickFilter, setQuickFilter] = useState<'none' | 'debtors' | 'birthday_today' | 'birthday_month'>('none');
    const [manualMessage, setManualMessage] = useState('');
    const [manualSending, setManualSending] = useState(false);

    // Qarzdorlar: Pending tranzaksiyalari bor bemorlar
    const debtorIds = useMemo(() => {
        const ids = new Set<string>();
        transactions.forEach(t => {
            if (t.status === 'Pending' && t.patientId) ids.add(t.patientId);
        });
        return ids;
    }, [transactions]);

    const recipients = useMemo(() => {
        const now = new Date();
        const todayMonthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const thisMonth = String(now.getMonth() + 1).padStart(2, '0');

        return patients.filter(p => {
            // Kanal bo'yicha yetib borish imkoni
            if (manualChannel === 'sms' && !p.phone) return false;
            if (manualChannel === 'telegram' && !p.telegramChatId) return false;

            if (audienceStatus === 'Active' && p.status !== 'Active') return false;
            if (audienceDoctorId !== 'All' && p.doctorId !== audienceDoctorId) return false;

            if (audienceInactive !== 'none') {
                const months = parseInt(audienceInactive);
                const cutoff = new Date();
                cutoff.setMonth(cutoff.getMonth() - months);
                if (p.lastVisit) {
                    const lastVisit = new Date(p.lastVisit);
                    if (!isNaN(lastVisit.getTime()) && lastVisit > cutoff) return false;
                }
            }

            if (quickFilter === 'debtors' && !debtorIds.has(p.id)) return false;
            if (quickFilter === 'birthday_today' && dobToMonthDay(p.dob) !== todayMonthDay) return false;
            if (quickFilter === 'birthday_month' && !dobToMonthDay(p.dob).startsWith(`${thisMonth}-`)) return false;

            return true;
        });
    }, [patients, manualChannel, audienceStatus, audienceDoctorId, audienceInactive, quickFilter, debtorIds]);

    const handleManualSend = async () => {
        if (!manualMessage.trim() || recipients.length === 0) return;
        if (!confirm(`${recipients.length} ta bemorga ${manualChannel === 'sms' ? 'SMS' : 'Telegram'} xabar yuborilsinmi?`)) return;
        setManualSending(true);
        try {
            const result = await api.messages.sendBulk(clinicId, recipients.map(r => r.id), manualMessage, manualChannel);
            if (result.failed > 0) {
                addToast('info', `Yuborildi: ${result.sent} ta, xato: ${result.failed} ta. Tarix bo'limida ko'ring.`);
            } else {
                addToast('success', `${result.sent} ta xabar muvaffaqiyatli yuborildi!`);
            }
            setManualMessage('');
            loadLogs();
            setActiveTab('history');
        } catch (e: any) {
            addToast('error', e.message || 'Yuborishda xatolik yuz berdi');
        } finally {
            setManualSending(false);
        }
    };

    // ── Tarix tab ──
    const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
    const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
    const [retrying, setRetrying] = useState(false);

    const filteredLogs = useMemo(() => {
        if (historyFilter === 'sent') return logs.filter(l => l.status === 'Sent');
        if (historyFilter === 'failed') return logs.filter(l => l.status === 'Failed');
        return logs;
    }, [logs, historyFilter]);

    const failedLogs = useMemo(() => logs.filter(l => l.status === 'Failed'), [logs]);

    const toggleLogSelection = (id: string) => {
        setSelectedLogIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleRetry = async (ids: string[]) => {
        if (ids.length === 0) return;
        setRetrying(true);
        try {
            const result = await api.messages.retry(clinicId, ids);
            addToast(result.success > 0 ? 'success' : 'info', `Qayta yuborildi: ${result.success} ta muvaffaqiyatli, ${result.failed} ta xato.`);
            setSelectedLogIds(new Set());
            loadLogs();
        } catch (e: any) {
            addToast('error', e.message || 'Qayta yuborishda xatolik');
        } finally {
            setRetrying(false);
        }
    };

    const formatLogDate = (iso: string) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    // O'zgaruvchi tugmalari (shablon va qo'lda xabar uchun)
    const VarButtons: React.FC<{ onInsert: (token: string) => void }> = ({ onInsert }) => (
        <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARS.map(v => (
                <button
                    key={v.token}
                    type="button"
                    onClick={() => onInsert(v.token)}
                    className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                    {v.label}
                </button>
            ))}
        </div>
    );

    const TABS = [
        { id: 'templates' as const, label: 'Shablonlar', icon: MessageSquare },
        { id: 'auto' as const, label: 'Avtomatik', icon: Clock },
        { id: 'manual' as const, label: "Qo'lda", icon: Send },
        { id: 'history' as const, label: 'Tarix', icon: CalendarDays },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Xabarlar</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Avtomatik va qo'lda SMS/Telegram xabar yuborish boshqaruvi</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ═══ SHABLONLAR ═══ */}
            {activeTab === 'templates' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-1.5">
                            {TEMPLATE_VARS.map(v => (
                                <span key={v.token} className="px-2 py-0.5 text-xs font-mono text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md bg-white dark:bg-gray-800">
                                    {v.token}
                                </span>
                            ))}
                        </div>
                        <Button onClick={() => openTemplateForm()}>
                            <Plus className="w-4 h-4 mr-1" /> Yangi shablon
                        </Button>
                    </div>

                    {isTemplateFormOpen && (
                        <Card className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {editingTemplate ? 'Shablonni tahrirlash' : 'Yangi shablon'}
                                </h3>
                                <button onClick={() => { setIsTemplateFormOpen(false); setEditingTemplate(null); }} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Shablon nomi"
                                value={templateForm.name}
                                onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                                className={inputCls}
                            />
                            <textarea
                                placeholder="Xabar matni. Masalan: Hurmatli {bemor_ismi}, qabulingiz {sana} kuni {vaqt} da."
                                value={templateForm.text}
                                onChange={e => setTemplateForm(f => ({ ...f, text: e.target.value }))}
                                rows={4}
                                className={inputCls}
                            />
                            <VarButtons onInsert={token => setTemplateForm(f => ({ ...f, text: f.text + token }))} />
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="secondary" onClick={() => { setIsTemplateFormOpen(false); setEditingTemplate(null); }}>Bekor</Button>
                                <Button onClick={handleSaveTemplate} disabled={templateSaving || !templateForm.name.trim() || !templateForm.text.trim()}>
                                    {templateSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    <div className="space-y-3">
                        {templates.map(tpl => (
                            <Card key={tpl.id} className="p-5 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h4 className="font-bold text-gray-900 dark:text-white">{tpl.name}</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap break-words">{tpl.text}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openTemplateForm(tpl)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Tahrirlash">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteTemplate(tpl)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="O'chirish">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </Card>
                        ))}
                        {templates.length === 0 && !isTemplateFormOpen && (
                            <Card className="p-10 text-center text-gray-500">
                                Hozircha shablonlar yo'q. "Yangi shablon" tugmasi bilan birinchisini yarating.
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ AVTOMATIK ═══ */}
            {activeTab === 'auto' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <Button onClick={() => setIsRuleFormOpen(true)}>
                            <Plus className="w-4 h-4 mr-1" /> Yangi qoida
                        </Button>
                    </div>

                    {isRuleFormOpen && (
                        <Card className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Yangi qoida</h3>
                                <button onClick={() => setIsRuleFormOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Qoida nomi</label>
                                    <input
                                        type="text"
                                        placeholder="Masalan: Qabuldan 2 soat oldin eslatma"
                                        value={ruleForm.name}
                                        onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Shablon</label>
                                    <select
                                        value={ruleForm.templateId}
                                        onChange={e => setRuleForm(f => ({ ...f, templateId: e.target.value }))}
                                        className={inputCls}
                                    >
                                        <option value="">— Shablon tanlang —</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Trigger turi</label>
                                    <select
                                        value={ruleForm.trigger}
                                        onChange={e => setRuleForm(f => ({ ...f, trigger: e.target.value as AutomationTrigger }))}
                                        className={inputCls}
                                    >
                                        {(Object.keys(TRIGGER_LABELS) as AutomationTrigger[]).map(tr => (
                                            <option key={tr} value={tr}>{TRIGGER_LABELS[tr]}</option>
                                        ))}
                                    </select>
                                </div>
                                {ruleForm.trigger === 'before_appointment' && (
                                    <div>
                                        <label className={labelCls}>Necha soat oldin</label>
                                        <select
                                            value={ruleForm.hoursBefore}
                                            onChange={e => setRuleForm(f => ({ ...f, hoursBefore: parseInt(e.target.value) }))}
                                            className={inputCls}
                                        >
                                            {HOUR_OPTIONS.map(h => (
                                                <option key={h} value={h}>{h} soat</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>Yuborish kanali</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {([['sms', '📱 SMS'], ['telegram', '✈️ Telegram'], ['both', 'Ikkalasi']] as [MessageChannel, string][]).map(([ch, lbl]) => (
                                        <button
                                            key={ch}
                                            type="button"
                                            onClick={() => setRuleForm(f => ({ ...f, channel: ch }))}
                                            className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${ruleForm.channel === ch
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Shifokor filtri (ixtiyoriy)</label>
                                <select
                                    value={ruleForm.doctorId}
                                    onChange={e => setRuleForm(f => ({ ...f, doctorId: e.target.value }))}
                                    className={inputCls}
                                >
                                    <option value="">Barcha shifokorlar</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="secondary" onClick={() => setIsRuleFormOpen(false)}>Bekor</Button>
                                <Button onClick={handleSaveRule} disabled={ruleSaving || !ruleForm.name.trim() || !ruleForm.templateId}>
                                    {ruleSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    <div className="space-y-3">
                        {rules.map(rule => {
                            const tpl = templates.find(t => t.id === rule.templateId);
                            const doctor = rule.doctorId ? doctors.find(d => d.id === rule.doctorId) : null;
                            return (
                                <Card key={rule.id} className={`p-5 flex items-center justify-between gap-4 ${!rule.active ? 'opacity-60' : ''}`}>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-white">{rule.name}</h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {TRIGGER_LABELS[rule.trigger]}
                                            {rule.trigger === 'before_appointment' && rule.hoursBefore ? ` · ${rule.hoursBefore} soat oldin` : ''}
                                            {' · '}{rule.channel === 'sms' ? 'SMS' : rule.channel === 'telegram' ? 'Telegram' : 'SMS + Telegram'}
                                            {tpl ? ` · Shablon: ${tpl.name}` : ''}
                                            {doctor ? ` · ${doctor.lastName} ${doctor.firstName}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleToggleRule(rule)}
                                            className={`relative w-11 h-6 rounded-full transition-colors ${rule.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                            title={rule.active ? "O'chirish" : 'Yoqish'}
                                        >
                                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${rule.active ? 'left-[22px]' : 'left-0.5'}`} />
                                        </button>
                                        <button onClick={() => handleDeleteRule(rule)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="O'chirish">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </Card>
                            );
                        })}
                        {rules.length === 0 && !isRuleFormOpen && (
                            <Card className="p-10 text-center text-gray-500">
                                Avtomatik qoidalar yo'q. "Yangi qoida" tugmasi bilan yarating — masalan, qabuldan 2 soat oldin eslatma.
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ QO'LDA ═══ */}
            {activeTab === 'manual' && (
                <div className="space-y-4">
                    {/* Kanal tanlash */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setManualChannel('sms')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border transition-all ${manualChannel === 'sms'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}
                        >
                            <Smartphone className="w-4 h-4" /> SMS {!smsConnected && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button
                            onClick={() => setManualChannel('telegram')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border transition-all ${manualChannel === 'telegram'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}
                        >
                            ✈️ Telegram {!telegramConnected && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        </button>
                    </div>

                    {manualChannel === 'sms' && !smsConnected && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Eskiz SMS ulanmagan. <strong>Sozlamalar → SMS va Telegram</strong> bo'limida login va parolni kiriting.</span>
                        </div>
                    )}
                    {manualChannel === 'telegram' && !telegramConnected && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Telegram bot ulanmagan. <strong>Sozlamalar → SMS va Telegram</strong> bo'limida bot tokenini kiriting.</span>
                        </div>
                    )}

                    {/* Auditoriya */}
                    <Card className="p-6 space-y-4">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-gray-400" /> Kimga yuborish?
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className={labelCls}>Shifokor bo'yicha</label>
                                <select value={audienceDoctorId} onChange={e => setAudienceDoctorId(e.target.value)} className={inputCls}>
                                    <option value="All">Barcha shifokorlar</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Bemorlar</label>
                                <select value={audienceStatus} onChange={e => setAudienceStatus(e.target.value as any)} className={inputCls}>
                                    <option value="Active">Faol bemorlar</option>
                                    <option value="All">Barcha bemorlar</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Uzoq kelmagan</label>
                                <select value={audienceInactive} onChange={e => setAudienceInactive(e.target.value as any)} className={inputCls}>
                                    <option value="none">Filtr yo'q</option>
                                    <option value="1">1 oydan ko'p</option>
                                    <option value="3">3 oydan ko'p</option>
                                    <option value="6">6 oydan ko'p</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([
                                ['debtors', '⏰ Qarzdorlar'],
                                ['birthday_today', "🎁 Bugun tug'ilgan kun"],
                                ['birthday_month', "🎁 Bu oy tug'ilgan kunlari"],
                            ] as const).map(([key, lbl]) => (
                                <button
                                    key={key}
                                    onClick={() => setQuickFilter(f => f === key ? 'none' : key)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${quickFilter === key
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}
                                >
                                    {lbl}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-xl text-sm">
                            <Eye className="w-4 h-4 text-blue-600 shrink-0" />
                            <span className="text-blue-700 dark:text-blue-400">
                                <strong>{recipients.length} ta bemor</strong>
                                {' '}({manualChannel === 'sms' ? '📱 telefon raqami bor' : '✈️ Telegramga ulangan'})
                                {recipients.length > 0 && (
                                    <span className="text-blue-600/70 dark:text-blue-400/70">
                                        {' — '}
                                        {recipients.slice(0, 3).map(r => `${r.firstName} ${r.lastName}`).join(', ')}
                                        {recipients.length > 3 ? ` va yana ${recipients.length - 3} ta` : ''}
                                    </span>
                                )}
                            </span>
                        </div>
                    </Card>

                    {/* Xabar matni */}
                    <Card className="p-6 space-y-4">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-gray-400" /> Xabar matni
                        </h3>
                        {templates.length > 0 && (
                            <div>
                                <p className="text-xs text-gray-500 mb-2">Shablondan foydalanish:</p>
                                <div className="flex flex-wrap gap-2">
                                    {templates.map(tpl => (
                                        <button
                                            key={tpl.id}
                                            onClick={() => setManualMessage(tpl.text)}
                                            className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 transition-colors bg-white dark:bg-gray-800"
                                        >
                                            {tpl.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <textarea
                            placeholder="Xabar matni..."
                            value={manualMessage}
                            onChange={e => setManualMessage(e.target.value)}
                            rows={5}
                            className={inputCls}
                        />
                        <VarButtons onInsert={token => setManualMessage(m => m + token)} />
                        <button
                            disabled={manualSending || !manualMessage.trim() || recipients.length === 0}
                            onClick={handleManualSend}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-white transition-all bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                        >
                            {manualSending ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {recipients.length} ta bemorga {manualChannel === 'sms' ? 'SMS' : 'Telegram xabar'} yuborish
                        </button>
                    </Card>
                </div>
            )}

            {/* ═══ TARIX ═══ */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <Card className="p-5 text-center">
                            <h3 className="text-3xl font-black text-gray-900 dark:text-white">{logStats.total}</h3>
                            <p className="text-sm text-gray-500 mt-1">Jami yuborilgan</p>
                        </Card>
                        <Card className="p-5 text-center border border-emerald-100 dark:border-emerald-900/40">
                            <h3 className="text-3xl font-black text-emerald-600">{logStats.sent}</h3>
                            <p className="text-sm text-gray-500 mt-1">Muvaffaqiyatli</p>
                        </Card>
                        <Card className="p-5 text-center border border-red-100 dark:border-red-900/40">
                            <h3 className="text-3xl font-black text-red-600">{logStats.failed}</h3>
                            <p className="text-sm text-gray-500 mt-1">Xato</p>
                        </Card>
                    </div>

                    {/* Xatolar banneri */}
                    {failedLogs.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                            <div className="flex items-center gap-2 text-sm">
                                <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                                <div>
                                    <p className="font-bold text-red-700 dark:text-red-400">{failedLogs.length} ta xato xabar</p>
                                    <p className="text-red-600/80 dark:text-red-400/80 text-xs">Qayta yuborish uchun tanlang yoki hammasini qayta yuboring</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedLogIds(new Set(failedLogs.map(l => l.id)))}
                                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Hammasini tanlash
                            </button>
                        </div>
                    )}

                    {/* Tanlangan xatolarni qayta yuborish */}
                    {selectedLogIds.size > 0 && (
                        <button
                            disabled={retrying}
                            onClick={() => handleRetry(Array.from(selectedLogIds))}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-all"
                        >
                            {retrying ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                            Tanlanganlarni qayta yuborish ({selectedLogIds.size})
                        </button>
                    )}

                    {/* Filtr + ro'yxat */}
                    <Card className="overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-1">
                                {([
                                    ['all', 'Barchasi'],
                                    ['sent', `Yuborildi (${logStats.sent})`],
                                    ['failed', `Xato (${logStats.failed})`],
                                ] as const).map(([key, lbl]) => (
                                    <button
                                        key={key}
                                        onClick={() => setHistoryFilter(key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyFilter === key
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                    >
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                            <button onClick={loadLogs} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700">
                                <RefreshCw className="w-3.5 h-3.5" /> Yangilash
                            </button>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[60vh] overflow-y-auto">
                            {filteredLogs.map(log => {
                                const name = log.patient ? `${log.patient.firstName} ${log.patient.lastName}` : (log.recipient || '-');
                                const contact = log.recipient || log.patient?.phone || '';
                                const isFailed = log.status === 'Failed';
                                return (
                                    <div key={log.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        {isFailed && (
                                            <input
                                                type="checkbox"
                                                checked={selectedLogIds.has(log.id)}
                                                onChange={() => toggleLogSelection(log.id)}
                                                className="mt-1.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                            />
                                        )}
                                        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${isFailed ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-gray-900 dark:text-white text-sm">{name}</span>
                                                {contact && <span className="text-xs text-gray-400">{contact}</span>}
                                                <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md">
                                                    {log.channel === 'sms' ? 'SMS' : 'Telegram'} ({SOURCE_LABELS[log.source] || log.source})
                                                </span>
                                                {isFailed ? (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-red-50 dark:bg-red-900/20 text-red-600 rounded-md">
                                                        <XCircle className="w-3 h-3" /> Xato
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-md">
                                                        <CheckCircle2 className="w-3 h-3" /> Yuborildi
                                                    </span>
                                                )}
                                            </div>
                                            {log.message && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{log.message}</p>}
                                            {isFailed && log.error && <p className="text-xs text-red-500 mt-0.5">{log.error}</p>}
                                        </div>
                                        <span className="text-xs text-gray-400 shrink-0">{formatLogDate(log.sentAt)}</span>
                                    </div>
                                );
                            })}
                            {filteredLogs.length === 0 && (
                                <div className="px-4 py-10 text-center text-gray-500 text-sm">Xabarlar tarixi bo'sh.</div>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
