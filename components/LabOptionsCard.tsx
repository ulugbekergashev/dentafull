import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, FlaskConical, Plus, RotateCcw, X } from 'lucide-react';
import { Button, Card } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';
import { cleanLabList, DEFAULT_MATERIALS, DEFAULT_ORDER_TYPES, LAB_ITEM_MAX_LEN, LAB_LIST_MAX_ITEMS } from '../utils/labOptions';

/**
 * Sozlamalar → Xizmatlar va narxlar: laboratoriya buyurtmasidagi "Buyurtma turi" va
 * "Material" ro'yxatlarini klinika o'zi tuzadi — nom qo'shadi, o'zgartiradi, o'chiradi
 * va tartibini almashtiradi (klinika so'rovi: "o'zim taxlab chiqaman").
 */

interface ListEditorProps {
    title: string;
    items: string[];
    onChange: (items: string[]) => void;
    disabled: boolean;
}

const ListEditor: React.FC<ListEditorProps> = ({ title, items, onChange, disabled }) => {
    const { t } = useLanguage();
    const [draft, setDraft] = useState('');
    const full = items.length >= LAB_LIST_MAX_ITEMS;

    const add = () => {
        const name = draft.trim();
        if (!name || full) return;
        // Bir xil nom ikki marta tushmasin — bor bo'lsa, maydon tozalanadi xolos
        if (!items.some(x => x.trim().toLowerCase() === name.toLowerCase())) onChange([...items, name]);
        setDraft('');
    };
    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    const rename = (i: number, value: string) => onChange(items.map((x, k) => (k === i ? value.slice(0, LAB_ITEM_MAX_LEN) : x)));
    const remove = (i: number) => onChange(items.filter((_, k) => k !== i));

    const iconBtn = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200';

    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
                <span className="text-xs tabular-nums text-gray-400">{items.length}</span>
            </div>
            <ol className="space-y-1.5">
                {items.map((item, i) => (
                    <li key={i} className="group flex items-center gap-1.5">
                        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-gray-400">{i + 1}.</span>
                        <input
                            value={item}
                            onChange={e => rename(i, e.target.value)}
                            disabled={disabled}
                            aria-label={`${title} ${i + 1}`}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        {!disabled && (
                            <>
                                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title={t('settings.labLists.up')} aria-label={t('settings.labLists.up')} className={iconBtn}>
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title={t('settings.labLists.down')} aria-label={t('settings.labLists.down')} className={iconBtn}>
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => remove(i)} title={t('common.delete')} aria-label={t('common.delete')} className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-900/30`}>
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </li>
                ))}
            </ol>
            {!disabled && (
                <div className="mt-2 flex items-center gap-1.5 pl-[1.625rem]">
                    <input
                        value={draft}
                        onChange={e => setDraft(e.target.value.slice(0, LAB_ITEM_MAX_LEN))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                        placeholder={t('settings.labLists.newName')}
                        disabled={full}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-dashed border-gray-300 bg-transparent px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-solid focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:text-white"
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={add} disabled={!draft.trim() || full}>
                        <Plus className="mr-1 h-4 w-4" /> {t('common.add')}
                    </Button>
                </div>
            )}
        </div>
    );
};

interface LabOptionsCardProps {
    clinicId: string;
    canEdit: boolean;
}

export const LabOptionsCard: React.FC<LabOptionsCardProps> = ({ clinicId, canEdit }) => {
    const { t } = useLanguage();
    const [orderTypes, setOrderTypes] = useState<string[]>(DEFAULT_ORDER_TYPES);
    const [materials, setMaterials] = useState<string[]>(DEFAULT_MATERIALS);
    // Serverdagi holat — "Saqlash" faqat o'zgarish bo'lsa yonadi
    const [saved, setSaved] = useState<{ orderTypes: string[]; materials: string[] }>({ orderTypes: DEFAULT_ORDER_TYPES, materials: DEFAULT_MATERIALS });
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    useEffect(() => {
        let alive = true;
        api.labOptions.get(clinicId).then(o => {
            if (!alive) return;
            const next = { orderTypes: o.orderTypes ?? DEFAULT_ORDER_TYPES, materials: o.materials ?? DEFAULT_MATERIALS };
            setOrderTypes(next.orderTypes);
            setMaterials(next.materials);
            setSaved(next);
        }).catch(() => { /* standart ro'yxat ko'rinadi */ });
        return () => { alive = false; };
    }, [clinicId]);

    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    const dirty = !same(orderTypes, saved.orderTypes) || !same(materials, saved.materials);
    const isDefault = same(cleanLabList(orderTypes), DEFAULT_ORDER_TYPES) && same(cleanLabList(materials), DEFAULT_MATERIALS);

    const edit = (setter: (v: string[]) => void) => (v: string[]) => { setter(v); setStatus('idle'); };

    const save = async () => {
        // Bo'sh qolgan ro'yxat standartga qaytadi — oynada tanlashga hech narsa qolmasligi uchun
        const types = cleanLabList(orderTypes);
        const mats = cleanLabList(materials);
        setStatus('saving');
        try {
            const res = await api.labOptions.save(clinicId, {
                orderTypes: types.length > 0 && !same(types, DEFAULT_ORDER_TYPES) ? types : null,
                materials: mats.length > 0 && !same(mats, DEFAULT_MATERIALS) ? mats : null,
            });
            const next = { orderTypes: res.orderTypes ?? DEFAULT_ORDER_TYPES, materials: res.materials ?? DEFAULT_MATERIALS };
            setOrderTypes(next.orderTypes);
            setMaterials(next.materials);
            setSaved(next);
            setStatus('saved');
        } catch {
            setStatus('error');
        }
    };

    const resetToDefault = () => {
        if (!window.confirm(t('settings.labLists.resetConfirm'))) return;
        setOrderTypes(DEFAULT_ORDER_TYPES);
        setMaterials(DEFAULT_MATERIALS);
        setStatus('idle');
    };

    return (
        <Card className="p-6">
            <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                    <FlaskConical className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.labLists.title')}</h3>
                    <p className="text-sm text-gray-500">{t('settings.labLists.subtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <ListEditor title={t('settings.labLists.orderTypes')} items={orderTypes} onChange={edit(setOrderTypes)} disabled={!canEdit} />
                <ListEditor title={t('auto.Material')} items={materials} onChange={edit(setMaterials)} disabled={!canEdit} />
            </div>

            {canEdit && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
                    <button
                        type="button"
                        onClick={resetToDefault}
                        disabled={isDefault}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <RotateCcw className="h-4 w-4" /> {t('settings.labLists.reset')}
                    </button>
                    <div className="flex items-center gap-3">
                        {status === 'saved' && !dirty && (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                <Check className="h-4 w-4" /> {t('settings.labLists.saved')}
                            </span>
                        )}
                        {status === 'error' && <span className="text-sm font-medium text-red-600 dark:text-red-400">{t('settings.labLists.saveError')}</span>}
                        <Button type="button" onClick={save} disabled={!dirty || status === 'saving'}>
                            {status === 'saving' ? t('settings.labLists.saving') : t('common.save')}
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
};
