import React, { useState } from 'react';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { Modal, Button, Select, Input } from './Common';
import { TeethChart } from './TeethChart';
import { Service, ServiceCategory } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface ProcedureItem {
    id: string;
    serviceId: number;
    serviceName: string;
    toothNumber?: number;
    price: number;
    notes?: string;
}

interface AddProcedureModalProps {
    isOpen: boolean;
    onClose: () => void;
    services?: Service[];
    categories?: ServiceCategory[];
    onAddProcedure: (procedure: Omit<ProcedureItem, 'id'>) => void; // Legacy support
    onAddProcedures?: (procedures: Omit<ProcedureItem, 'id'>[]) => void; // New batch support
}

export const AddProcedureModal: React.FC<AddProcedureModalProps> = ({
    isOpen,
    onClose,
    services = [],
    categories = [],
    onAddProcedure,
    onAddProcedures
}) => {
    const { t } = useLanguage();

    // Draft Queue State
    const [queue, setQueue] = useState<Omit<ProcedureItem, 'id'>[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

    // Tanlov: bir nechta tish va bir nechta xizmat birdaniga.
    // Ro'yxatga har bir tish × har bir xizmat alohida qator bo'lib tushadi —
    // saqlash mantig'i o'zgarmaydi, u avvalgidek bitta tish + bitta xizmatli
    // qatorlarni oladi. Tish tanlanmasa — "Umumiy" (tishsiz) qator.
    const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
    const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
    // Har bir tanlangan xizmatning narxi alohida tahrirlanadi
    const [prices, setPrices] = useState<Record<number, string>>({});
    const [notes, setNotes] = useState<string>('');

    const toggleTooth = (tooth: number) => {
        setSelectedTeeth(prev => (prev.includes(tooth) ? prev.filter(n => n !== tooth) : [...prev, tooth].sort((a, b) => a - b)));
    };

    const toggleService = (service: Service) => {
        if (selectedServiceIds.includes(service.id)) {
            setSelectedServiceIds(prev => prev.filter(id => id !== service.id));
            setPrices(prev => {
                const next = { ...prev };
                delete next[service.id];
                return next;
            });
        } else {
            setSelectedServiceIds(prev => [...prev, service.id]);
            setPrices(prev => ({ ...prev, [service.id]: service.price.toString() }));
        }
    };

    const teethForItems: (number | undefined)[] = selectedTeeth.length > 0 ? selectedTeeth : [undefined];
    const itemsToAdd = selectedServiceIds.length * teethForItems.length;

    const addToQueue = () => {
        if (selectedServiceIds.length === 0) {
            alert(t('patients.details.alerts.selectServiceReq'));
            return;
        }

        const chosen = selectedServiceIds
            .map(id => services.find(s => s.id === id))
            .filter((s): s is Service => !!s);

        const newItems: Omit<ProcedureItem, 'id'>[] = [];
        for (const tooth of teethForItems) {
            for (const service of chosen) {
                newItems.push({
                    serviceId: service.id,
                    serviceName: service.name,
                    toothNumber: tooth,
                    price: parseFloat(prices[service.id]) || 0,
                    notes: notes || undefined
                });
            }
        }

        setQueue(prev => [...prev, ...newItems]);

        // Xizmatlar tozalanadi, tishlar esa qoladi — xuddi shu tishlarga
        // keyingi xizmatni tez qo'shish uchun
        setSelectedServiceIds([]);
        setPrices({});
        setNotes('');
    };

    const removeFromQueue = (index: number) => {
        const newQueue = [...queue];
        newQueue.splice(index, 1);
        setQueue(newQueue);
    };

    const handleSaveAll = () => {
        if (queue.length === 0) {
            alert(t('patients.details.alerts.listEmpty'));
            return;
        }

        if (onAddProcedures) {
            onAddProcedures(queue);
        } else {
            // Fallback for legacy
            queue.forEach(p => onAddProcedure(p));
        }

        handleClose();
    };

    const handleClose = () => {
        setQueue([]);
        setSelectedTeeth([]);
        setSelectedCategoryId('');
        setSelectedServiceIds([]);
        setPrices({});
        setNotes('');
        onClose();
    };

    if (!isOpen) return null;

    const visibleServices = (services || []).filter(s => !selectedCategoryId || (s as any).categoryId === selectedCategoryId);
    const teethLabel = selectedTeeth.length > 0
        ? selectedTeeth.map(n => `#${n}`).join(', ')
        : t('patients.details.modals.common');

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={t('patients.details.modals.addProcedureTitle')} className="max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-6 min-h-[60vh] lg:h-[80vh]">

                {/* Left Side: Teeth Chart */}
                <div className="lg:w-1/2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 sm:p-4 overflow-hidden min-h-[400px]">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-500 uppercase mb-4 sticky top-0 bg-gray-50 dark:bg-gray-800 z-10 py-2">
                        1. {t('patients.details.modals.stepSelectTooth')}
                    </h4>
                    <div className="origin-top-left" style={{ transform: 'scale(0.52)', width: '192%' }}>
                        <TeethChart
                            initialData={[]}
                            onToothClick={toggleTooth}
                            selectedTeeth={selectedTeeth}
                        />
                    </div>
                    <div className="mt-2 text-center">
                        <p className="text-sm text-gray-500 flex flex-wrap items-center justify-center gap-1.5">
                            <span>{t('patients.details.modals.selectedTooth')}</span>
                            {selectedTeeth.length > 0
                                ? selectedTeeth.map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => toggleTooth(n)}
                                        title="×"
                                        className="font-bold text-primary-600 px-2 py-0.5 bg-primary-100 rounded-md hover:bg-primary-200"
                                    >
                                        #{n}
                                    </button>
                                ))
                                : <span>{t('patients.details.modals.common')}</span>}
                        </p>
                    </div>
                </div>

                {/* Right Side: Actions & Queue */}
                <div className="lg:w-1/2 flex flex-col h-auto lg:h-full">

                    {/* Input Area */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 shadow-sm mb-4 shrink-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-500 uppercase mb-4 flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate">2. {t('patients.details.modals.stepAddService')} ({teethLabel})</span>
                            {selectedTeeth.length > 0 && <button onClick={() => setSelectedTeeth([])} className="text-xs text-primary-500 hover:underline shrink-0">{t('patients.details.modals.switchToCommon')}</button>}
                        </h4>

                        <div className="space-y-4">
                            {categories && categories.length > 0 && (
                                <Select
                                    label={t('patients.details.modals.category')}
                                    value={selectedCategoryId}
                                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                                >
                                    <option value="">{t('patients.details.modals.allCategories')}</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </Select>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('patients.details.modals.service')}
                                    {selectedServiceIds.length > 0 && <span className="ml-1 text-primary-600">({selectedServiceIds.length})</span>}
                                </label>
                                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                    {visibleServices.length === 0 ? (
                                        <p className="p-3 text-sm text-gray-400">{t('patients.details.modals.selectService')}</p>
                                    ) : visibleServices.map(service => {
                                        const checked = selectedServiceIds.includes(service.id);
                                        return (
                                            <div key={service.id} className={`flex items-center gap-3 px-3 py-2 ${checked ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''}`}>
                                                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleService(service)}
                                                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                    />
                                                    <span className="text-sm text-gray-900 dark:text-white truncate">{service.name}</span>
                                                </label>
                                                {checked ? (
                                                    <input
                                                        type="number"
                                                        value={prices[service.id] ?? ''}
                                                        onChange={(e) => setPrices(prev => ({ ...prev, [service.id]: e.target.value }))}
                                                        aria-label={`${t('patients.details.modals.price')}: ${service.name}`}
                                                        className="w-28 h-8 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-500 whitespace-nowrap">{service.price.toLocaleString()} UZS</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('patients.details.modals.notes')}</label>
                                <Input
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder={`${t('patients.details.modals.notes')}...`}
                                />
                            </div>

                            <Button onClick={addToQueue} className="w-full" disabled={selectedServiceIds.length === 0}>
                                <Plus className="w-4 h-4 mr-2" /> {t('patients.details.modals.addToList')}{itemsToAdd > 1 ? ` (${itemsToAdd})` : ''}
                            </Button>
                        </div>
                    </div>

                    {/* Queue List */}
                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 overflow-hidden flex flex-col">
                        <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center justify-between">
                            <span>{t('patients.details.modals.totalList')} ({queue.length})</span>
                            <span className="text-primary-600 font-bold">
                                {queue.reduce((sum, item) => sum + item.price, 0).toLocaleString()} UZS
                            </span>
                        </h4>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {queue.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm dashed border-2 border-gray-200 rounded-lg">
                                    <Plus className="w-8 h-8 mb-2 opacity-20" />
                                    <p>{t('patients.details.modals.nothingAdded')}</p>
                                </div>
                            ) : (
                                queue.map((item, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3 rounded-lg flex justify-between items-center shadow-sm group">
                                        <div className="flex items-center gap-3">
                                            {item.toothNumber ? (
                                                <span className="w-8 h-8 flex items-center justify-center bg-primary-100 text-primary-700 text-xs font-bold rounded-lg shrink-0">
                                                    #{item.toothNumber}
                                                </span>
                                            ) : (
                                                <span className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-600 text-xs font-bold rounded-lg shrink-0">
                                                    {t('patients.details.modals.common').substring(0, 2)}
                                                </span>
                                            )}
                                            <div>
                                                <p className="font-medium text-sm text-gray-900 dark:text-white line-clamp-1">{item.serviceName}</p>
                                                <p className="text-xs text-gray-500">{item.price.toLocaleString()} UZS</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeFromQueue(idx)}
                                            className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                            <Button variant="secondary" onClick={handleClose} className="flex-1">
                                {t('common.cancel')}
                            </Button>
                            <Button onClick={handleSaveAll} className="flex-[2]" disabled={queue.length === 0}>
                                <ArrowRight className="w-4 h-4 mr-2" /> {t('patients.details.modals.saveAndFinish')}
                            </Button>
                        </div>
                    </div>

                </div>
            </div>
        </Modal>
    );
};
