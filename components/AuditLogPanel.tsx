import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, History, Loader2, Search } from 'lucide-react';
import { AuditLogEntry, Branch, Doctor } from '../types';
import { api } from '../services/api';
import { Card } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO } from '../utils/dateUtils';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import { AUDIT_ACTION, AUDIT_ENTITY, AUDIT_FIELD, AUDIT_ROLE, AUDIT_VALUE, auditLabel } from '../i18n/auditLabels';

/**
 * Sozlamalar → Jurnal: kim, qachon, nimani qo'shdi / o'zgartirdi / o'chirdi.
 * Yozuvlarni server o'zi yig'adi (backend/audit.ts) — bu yerda faqat ko'rish.
 * Faqat klinika egasiga ko'rinadi (backend ham shu rolni talab qiladi).
 */

type Period = 'today' | 'week' | 'month' | 'all';

const MONEY_FIELDS = new Set([
    'amount', 'price', 'cost', 'finalPrice', 'basePrice', 'totalAmount', 'totalPaid', 'fixedSalary',
    'countedCash', 'expectedCash', 'difference', 'openingCash', 'prepaymentAmount', 'discount',
]);
const ACTION_TONE: Record<string, string> = {
    create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    update: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    delete: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    bulk_delete: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    login: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayKey = (iso: string) => formatDateToISO(new Date(iso));
const ddmmyyyy = (ymd: string) => ymd.split('-').reverse().join('.');
const daysAgo = (n: number) => formatDateToISO(new Date(Date.now() - n * 86400000));

const inputCls = 'h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500/20';

export const AuditLogPanel: React.FC<{ clinicId: string; doctors: Doctor[]; branches?: Branch[] }> = ({ clinicId, doctors, branches = [] }) => {
    const { t, language } = useLanguage();
    const lang = (language === 'ru' ? 'ru' : 'uz') as 'uz' | 'ru';

    const [period, setPeriod] = useState<Period>('week');
    const [actor, setActor] = useState('');
    const [entity, setEntity] = useState('');
    const [action, setAction] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<AuditLogEntry[]>([]);
    const [nextBefore, setNextBefore] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [actors, setActors] = useState<{ name: string; role: string }[]>([]);
    const [open, setOpen] = useState<Set<string>>(new Set());

    useEffect(() => {
        api.auditLogs.actors(clinicId).then(setActors).catch(() => { });
    }, [clinicId]);

    // Qidiruv har harfda emas — yozib bo'lgach
    useEffect(() => {
        const id = setTimeout(() => setQuery(search.trim()), 400);
        return () => clearTimeout(id);
    }, [search]);

    const from = period === 'today' ? daysAgo(0) : period === 'week' ? daysAgo(6) : period === 'month' ? daysAgo(29) : undefined;

    const load = useCallback(async (before?: string) => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.auditLogs.list(clinicId, { from, actor, entity, action, q: query, before });
            setItems(prev => (before ? [...prev, ...res.items] : res.items));
            setNextBefore(res.nextBefore);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [clinicId, from, actor, entity, action, query]);

    useEffect(() => { void load(); }, [load]);

    const doctorName = useMemo(() => new Map(doctors.map(d => [d.id, `Dr. ${d.lastName} ${d.firstName}`.trim()])), [doctors]);
    const branchName = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);

    const fmtValue = (field: string, v: any): string => {
        if (v === null || v === undefined || v === '') return '—';
        if (field === 'accessControl') return t('audit.changed');
        if (field === 'doctorId') return doctorName.get(String(v)) || String(v);
        if (field === 'branchId') return branchName.get(String(v)) || String(v);
        if (typeof v === 'boolean') return auditLabel(AUDIT_VALUE, String(v), lang);
        if (typeof v === 'number' && MONEY_FIELDS.has(field)) return `${Math.round(v).toLocaleString('ru-RU')} so'm`;
        const s = String(v);
        if (AUDIT_VALUE[s]) return auditLabel(AUDIT_VALUE, s, lang);
        const pm = PAYMENT_METHODS.find(m => m.key === s);
        if (pm && (field === 'type' || field === 'method')) return pm.label;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) { const d = new Date(s); return `${ddmmyyyy(formatDateToISO(d))} ${hhmm(s)}`; }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ddmmyyyy(s);
        return s;
    };

    const toggle = (id: string) => setOpen(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Kunlar bo'yicha guruhlash (ro'yxat allaqachon yangidan eskiga)
    const groups = useMemo(() => {
        const out: { day: string; rows: AuditLogEntry[] }[] = [];
        for (const e of items) {
            const d = dayKey(e.createdAt);
            const last = out[out.length - 1];
            if (last && last.day === d) last.rows.push(e); else out.push({ day: d, rows: [e] });
        }
        return out;
    }, [items]);

    const entityOptions = useMemo(
        () => Object.keys(AUDIT_ENTITY).sort((a, b) => auditLabel(AUDIT_ENTITY, a, lang).localeCompare(auditLabel(AUDIT_ENTITY, b, lang))),
        [lang],
    );
    const today = daysAgo(0);
    const yesterday = daysAgo(1);

    const headline = (e: AuditLogEntry) => {
        // Kirishda belgining o'zi yetarli — matn takrorlanmasin
        if (e.action === 'login') return '';
        const what = auditLabel(AUDIT_ENTITY, e.entity, lang);
        if (e.action === 'bulk_delete') return `${what}: ${t('audit.bulkCount').replace('{n}', e.summary)}`;
        return e.summary ? `${what}: ${e.summary}` : what;
    };

    return (
        <Card className="p-6 space-y-5">
            <div className="flex items-start gap-3">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                    <History className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('audit.title')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('audit.desc')}</p>
                </div>
            </div>

            {/* Filtrlar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800/60">
                    {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setPeriod(p)}
                            className={`h-8 px-3 rounded-md text-xs font-bold transition-colors ${period === p ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                        >
                            {t(`audit.period.${p}`)}
                        </button>
                    ))}
                </div>
                <select value={actor} onChange={e => setActor(e.target.value)} className={inputCls} aria-label={t('audit.allStaff')}>
                    <option value="">{t('audit.allStaff')}</option>
                    {actors.map(a => <option key={a.name} value={a.name}>{a.name} · {auditLabel(AUDIT_ROLE, a.role, lang)}</option>)}
                </select>
                <select value={entity} onChange={e => setEntity(e.target.value)} className={inputCls} aria-label={t('audit.allSections')}>
                    <option value="">{t('audit.allSections')}</option>
                    {entityOptions.map(k => <option key={k} value={k}>{auditLabel(AUDIT_ENTITY, k, lang)}</option>)}
                </select>
                <select value={action} onChange={e => setAction(e.target.value)} className={inputCls} aria-label={t('audit.allActions')}>
                    <option value="">{t('audit.allActions')}</option>
                    {['create', 'update', 'delete', 'login'].map(k => <option key={k} value={k}>{auditLabel(AUDIT_ACTION, k, lang)}</option>)}
                </select>
                <label className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t('audit.search')}
                        className={`${inputCls} w-full pl-8`}
                    />
                </label>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{t('audit.loadError')}</p>}

            {!error && !loading && items.length === 0 && (
                <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t('audit.empty')}</p>
            )}

            <div className="space-y-5">
                {groups.map(g => (
                    <section key={g.day}>
                        <h4 className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-gray-400">
                            {g.day === today ? t('audit.today') : g.day === yesterday ? t('audit.yesterday') : ddmmyyyy(g.day)}
                        </h4>
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-100 dark:border-gray-800">
                            {g.rows.map(e => {
                                const changes = e.changes ? Object.entries(e.changes) : [];
                                const expandable = changes.length > 0;
                                const isOpen = open.has(e.id);
                                return (
                                    <li key={e.id} className="px-3 py-2.5">
                                        <button
                                            type="button"
                                            onClick={() => expandable && toggle(e.id)}
                                            aria-expanded={expandable ? isOpen : undefined}
                                            className={`w-full flex items-start gap-3 text-left ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
                                        >
                                            <span className="w-11 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-gray-500 dark:text-gray-400">{hhmm(e.createdAt)}</span>
                                            <span className="flex-1 min-w-0">
                                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${ACTION_TONE[e.action] || ACTION_TONE.login}`}>
                                                        {auditLabel(AUDIT_ACTION, e.action, lang)}
                                                    </span>
                                                    {headline(e) && <span className="text-sm font-semibold text-gray-900 dark:text-white break-words">{headline(e)}</span>}
                                                </span>
                                                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                                    {e.actorName} · {auditLabel(AUDIT_ROLE, e.actorRole, lang)}
                                                </span>
                                            </span>
                                            {expandable && <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                                        </button>
                                        {expandable && isOpen && (
                                            <dl className="mt-2 ml-14 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3 text-xs">
                                                {changes.map(([field, [oldV, newV]]) => (
                                                    <React.Fragment key={field}>
                                                        <dt className="font-semibold text-gray-500 dark:text-gray-400">{auditLabel(AUDIT_FIELD, field, lang)}</dt>
                                                        <dd className="text-gray-800 dark:text-gray-100 break-words">
                                                            {e.action === 'update' ? (
                                                                <>
                                                                    <span className="text-gray-400 line-through">{fmtValue(field, oldV)}</span>
                                                                    <span className="mx-1.5 text-gray-400">→</span>
                                                                    <span className="font-semibold">{fmtValue(field, newV)}</span>
                                                                </>
                                                            ) : fmtValue(field, newV)}
                                                        </dd>
                                                    </React.Fragment>
                                                ))}
                                            </dl>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>

            {loading && (
                <p className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> {t('audit.loading')}</p>
            )}
            {!loading && nextBefore && (
                <button
                    type="button"
                    onClick={() => void load(nextBefore)}
                    className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    {t('audit.more')}
                </button>
            )}
        </Card>
    );
};
