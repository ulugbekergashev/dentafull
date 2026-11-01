import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Button } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../services/api';
import { DEV_TASK_PRODUCTS, DEV_TASK_STATUSES, DevTask, DevTaskProduct, DevTaskStatus } from '../../utils/devTasks';
import { devTaskLabels, DevTaskLabels } from './devTaskLabels';
import { DevTaskForm } from './DevTaskForm';

// ─── Superadmin / sotuvchi → "Vazifalar" ─────────────────────────────────────
// Sotuvchi klinikadan eshitgan so'rovni yozadi (matn + rasm), superadmin ko'radi
// va holatini o'zgartiradi. Ikki bo'lim: Denta7 (bulut) va DentaLocal (oflayn).
// Bo'lim manzilda turadi: ?tab=tasks&product=dentalocal

const STATUS_TONE: Record<DevTaskStatus, string> = {
    New: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    InProgress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const formatWhen = (iso: string, language: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface TaskCardProps {
    task: DevTask;
    L: DevTaskLabels;
    language: string;
    isAdmin: boolean;
    onStatus: (task: DevTask, status: DevTaskStatus) => void;
    onRemove: (task: DevTask) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, L, language, isAdmin, onStatus, onRemove }) => {
    const canRemove = isAdmin || task.status === 'New';
    return (
        <article className={`rounded-xl border bg-white dark:bg-gray-800 p-4 ${task.status === 'Done' ? 'border-gray-200 dark:border-gray-700 opacity-75' : 'border-gray-200 dark:border-gray-700'}`}>
            <header className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[task.status]}`}>{L.status[task.status]}</span>
                {task.clinicName && <span className="font-medium text-gray-700 dark:text-gray-200">{task.clinicName}</span>}
                <span>· {L.author}: {task.authorName}</span>
                <span>· {formatWhen(task.createdAt, language)}</span>
                {canRemove && (
                    <button
                        type="button"
                        onClick={() => onRemove(task)}
                        className="ml-auto rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        aria-label={L.remove}
                        title={L.remove}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                )}
            </header>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100">{task.text}</p>
            {task.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {task.photos.map(url => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-primary-400">
                            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </a>
                    ))}
                </div>
            )}
            {isAdmin && (
                <div className="mt-3 inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
                    {DEV_TASK_STATUSES.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => s !== task.status && onStatus(task, s)}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${s === task.status ? STATUS_TONE[s] : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                        >
                            {L.status[s]}
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
};

const DevTasksPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const { language } = useLanguage();
    const L = devTaskLabels(language);
    const [params, setParams] = useSearchParams();
    const product: DevTaskProduct = params.get('product') === 'dentalocal' ? 'dentalocal' : 'denta7';
    const [tasks, setTasks] = useState<DevTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [onlyOpen, setOnlyOpen] = useState(true);

    useEffect(() => {
        let alive = true;
        api.devTasks.list()
            .then(list => { if (alive) setTasks(list); })
            .catch(() => { if (alive) setError(L.loadError); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- bir marta yuklanadi
    }, []);

    const openCount = (p: DevTaskProduct) => tasks.filter(t => t.product === p && t.status !== 'Done').length;
    const visible = useMemo(() => tasks
        .filter(t => t.product === product && (!onlyOpen || t.status !== 'Done')),
        [tasks, product, onlyOpen]);

    const selectProduct = (p: DevTaskProduct) => {
        const next = new URLSearchParams(params);
        next.set('product', p);
        setParams(next, { replace: true });
        setShowForm(false);
    };

    const changeStatus = async (task: DevTask, status: DevTaskStatus) => {
        const before = tasks;
        setTasks(list => list.map(t => (t.id === task.id ? { ...t, status } : t)));
        try {
            await api.devTasks.setStatus(task.id, status);
        } catch (e) {
            setTasks(before);
            setError(e instanceof Error ? e.message : L.loadError);
        }
    };

    const removeTask = async (task: DevTask) => {
        if (!window.confirm(L.confirmRemove)) return;
        try {
            await api.devTasks.remove(task.id);
            setTasks(list => list.filter(t => t.id !== task.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : L.loadError);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                        <ClipboardList className="h-5 w-5 text-primary-500" /> {L.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{isAdmin ? L.subAdmin : L.subSales}</p>
                </div>
                {!showForm && (
                    <Button onClick={() => setShowForm(true)}>
                        <Plus className="mr-1 h-4 w-4" /> {L.add}
                    </Button>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                    {DEV_TASK_PRODUCTS.map(p => {
                        const active = p.id === product;
                        const count = openCount(p.id);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => selectProduct(p.id)}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
                            >
                                {p.label}
                                {count > 0 && <span className="rounded-full bg-primary-600 px-1.5 text-xs text-white tabular-nums">{count}</span>}
                            </button>
                        );
                    })}
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 text-xs">
                    {[true, false].map(open => (
                        <button
                            key={String(open)}
                            type="button"
                            onClick={() => setOnlyOpen(open)}
                            className={`rounded-md px-3 py-1 font-medium ${onlyOpen === open ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            {open ? L.open : L.all}
                        </button>
                    ))}
                </div>
            </div>

            {showForm && (
                <DevTaskForm
                    key={product}
                    product={product}
                    L={L}
                    onCancel={() => setShowForm(false)}
                    onSaved={task => { setTasks(list => [task, ...list]); setShowForm(false); }}
                />
            )}

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {loading && <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{L.loading}</p>}
            {!loading && visible.length === 0 && !showForm && (
                <p className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{L.empty}</p>
            )}
            <div className="space-y-3">
                {visible.map(task => (
                    <TaskCard key={task.id} task={task} L={L} language={language} isAdmin={isAdmin} onStatus={changeStatus} onRemove={removeTask} />
                ))}
            </div>
        </div>
    );
};

export default DevTasksPanel;
