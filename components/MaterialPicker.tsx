import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { InventoryItem, PendingMaterial } from '../types';
import { useLanguage } from '../context/LanguageContext';

/** Bir xil material ikki marta qo'shilsa — bitta qatorda soni qo'shiladi */
export const mergeMaterials = (list: PendingMaterial[], add: PendingMaterial[]): PendingMaterial[] => {
    const out = list.map(m => ({ ...m }));
    for (const a of add) {
        const same = out.find(m => m.itemId === a.itemId);
        if (same) same.quantity = Math.round((same.quantity + a.quantity) * 1000) / 1000;
        else out.push({ ...a });
    }
    return out;
};

interface MaterialPickerProps {
    items: InventoryItem[];
    onAdd: (m: PendingMaterial) => void;
    /** Allaqachon tanlangan (hali ayirilmagan) miqdor — omborda qolgani shunga kamayadi */
    reserved?: PendingMaterial[];
}

/** Ombordan material tanlash: mahsulot + soni + "Qo'shish". Ombordan hozir ayirmaydi. */
export const MaterialPicker: React.FC<MaterialPickerProps> = ({ items, onAdd, reserved = [] }) => {
    const { t } = useLanguage();
    const [itemId, setItemId] = useState('');
    const [qty, setQty] = useState('1');
    const left = (item: InventoryItem) => item.quantity - reserved.filter(r => r.itemId === item.id).reduce((s, r) => s + r.quantity, 0);
    const item = items.find(i => i.id === itemId);
    const amount = Number(qty.replace(',', '.'));
    const tooMuch = !!item && amount > left(item);
    const valid = !!item && Number.isFinite(amount) && amount > 0 && !tooMuch;

    const add = () => {
        if (!item || !valid) return;
        onAdd({ itemId: item.id, name: item.name, unit: item.unit, quantity: amount });
        setItemId('');
        setQty('1');
    };

    return (
        <div>
            <div className="flex gap-2">
                <select
                    value={itemId}
                    onChange={e => setItemId(e.target.value)}
                    aria-label={t('patients.details.modals.selectMaterial')}
                    className="flex-1 min-w-0 h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                    <option value="">{t('patients.details.modals.selectMaterial')}</option>
                    {items.map(i => (
                        <option key={i.id} value={i.id} disabled={left(i) <= 0}>
                            {i.name} ({left(i)} {i.unit} {t('patients.details.modals.available')})
                        </option>
                    ))}
                </select>
                <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                    aria-label={t('patients.details.materialPicker.qty')}
                    className={`w-20 h-10 rounded-lg border bg-white dark:bg-gray-800 px-2 text-sm text-right text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 ${tooMuch ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
                />
                <button
                    type="button"
                    onClick={add}
                    disabled={!valid}
                    title={t('patients.details.materialPicker.add')}
                    className="h-10 px-3 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white inline-flex items-center gap-1"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('patients.details.materialPicker.add')}</span>
                </button>
            </div>
            {tooMuch && item && (
                <p className="mt-1 text-xs text-red-500" role="alert">
                    {t('patients.details.materialPicker.notEnough')}: {left(item)} {item.unit}
                </p>
            )}
        </div>
    );
};

/** Tanlangan materiallar ro'yxati (o'chirish tugmasi bilan) */
export const MaterialList: React.FC<{ materials: PendingMaterial[]; onRemove?: (itemId: string) => void; disabled?: boolean }> = ({ materials, onRemove, disabled }) => (
    <div className="space-y-1.5">
        {materials.map(m => (
            <div key={m.itemId} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 text-sm">
                <span className="min-w-0 truncate text-gray-900 dark:text-white">{m.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-gray-500 dark:text-gray-400">{m.quantity} {m.unit}</span>
                    {onRemove && (
                        <button type="button" onClick={() => onRemove(m.itemId)} disabled={disabled} className="p-1 text-gray-400 hover:text-red-500 rounded disabled:opacity-40">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </span>
            </div>
        ))}
    </div>
);
