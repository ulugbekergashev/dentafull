import React, { useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2, ArrowRight, ChevronDown, X } from 'lucide-react';
import { Modal, Button, Select, Input } from './Common';
import { TeethChart } from './TeethChart';
import { InventoryItem, PendingMaterial, Service, ServiceCategory } from '../types';
import { MaterialList, MaterialPicker, mergeMaterials } from './MaterialPicker';
import { useLanguage } from '../context/LanguageContext';

interface ProcedureItem {
    id: string;
    serviceId: number;
    serviceName: string;
    toothNumber?: number;
    /** Bitta narxli ish bir nechta tishga qilingan bo'lsa — hamma tishlar (toothNumber — birinchisi) */
    teeth?: number[];
    price: number;
    notes?: string;
}

/**
 * Tish kartasi o'z o'lchamida chiziladi (tish kattaligi ekran kengligiga bog'liq).
 * Bu oynada unga ajratilgan joy torroq — kartani shu joyga to'liq sig'adigan
 * qilib kichraytiramiz. Ilgari qat'iy 52% edi va keng ekranda ham tishlar mayda
 * ko'rinardi. Kattalashtirilmaydi (1 dan oshmaydi) — tishlar xiralashmasin.
 */
const FitChart: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState<{ width: number; scale: number; height: number } | null>(null);

    useLayoutEffect(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;
        const padX = (el: HTMLElement) => { const st = getComputedStyle(el); return parseFloat(st.paddingLeft) + parseFloat(st.paddingRight); };
        const measure = () => {
            const scroller = inner.querySelector<HTMLElement>('[data-chart-scroll]');
            const row = inner.querySelector<HTMLElement>('[data-chart-row]');
            const first = row?.firstElementChild as HTMLElement | null;
            const last = row?.lastElementChild as HTMLElement | null;
            if (!scroller || !row || !first || !last) return;
            // offset* o'lchamlari transform'dan qat'i nazar asl (masshtabsiz) qiymat
            const teeth = last.offsetLeft + last.offsetWidth - first.offsetLeft;
            const chrome = inner.offsetWidth - scroller.clientWidth + padX(scroller) + padX(row);
            const natural = Math.ceil(teeth + chrome) + 2;
            const available = outer.clientWidth;
            const scale = Math.min(1, available / natural);
            const width = scale < 1 ? natural : available;
            const height = Math.ceil(inner.offsetHeight * scale);
            setFit(prev => (prev && prev.width === width && Math.abs(prev.scale - scale) < 0.001 && prev.height === height ? prev : { width, scale, height }));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(outer);
        ro.observe(inner);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={outerRef} style={fit ? { height: fit.height } : undefined}>
            <div
                ref={innerRef}
                className="origin-top-left"
                style={fit ? { width: fit.width, transform: `scale(${fit.scale})` } : { visibility: 'hidden' }}
            >
                {children}
            </div>
        </div>
    );
};

interface AddProcedureModalProps {
    isOpen: boolean;
    onClose: () => void;
    services?: Service[];
    categories?: ServiceCategory[];
    onAddProcedure: (procedure: Omit<ProcedureItem, 'id'>) => void; // Legacy support
    onAddProcedures?: (procedures: Omit<ProcedureItem, 'id'>[]) => void; // New batch support
    /** Ombordagi mahsulotlar. Bo'sh bo'lsa (klinika Ombor yuritmaydi) material bo'limi ko'rinmaydi */
    inventoryItems?: InventoryItem[];
    /** Tanlangan materiallar — qabulga qo'shiladi, ombordan yakunlashda ayiriladi */
    onAddMaterials?: (materials: PendingMaterial[]) => void;
    /** Qabulda allaqachon tanlangan materiallar — omborda qolgan miqdor hisobi uchun */
    reservedMaterials?: PendingMaterial[];
}

export const AddProcedureModal: React.FC<AddProcedureModalProps> = ({
    isOpen,
    onClose,
    services = [],
    categories = [],
    onAddProcedure,
    onAddProcedures,
    inventoryItems = [],
    onAddMaterials,
    reservedMaterials = [],
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
    // Bir nechta tish tanlanganda narx qanday qo'llanadi:
    //   'each' — har bir tishga alohida qator va alohida narx (implant: 3 tish = 3 ta narx);
    //   'once' — hamma tishga bitta qator, bitta narx (konsultatsiya, tozalash).
    // Boshlang'ich qiymat xizmat sozlamasidan (Sozlamalar → Xizmatlar) olinadi, shifokor shu yerda o'zgartira oladi.
    const [priceModes, setPriceModes] = useState<Record<number, 'each' | 'once'>>({});
    const [notes, setNotes] = useState<string>('');
    /** Xizmatlar ro'yxati ochiqmi. Yopiq holatda faqat tanlanganlar ko'rinadi. */
    const [servicesOpen, setServicesOpen] = useState(false);
    // Ishlatilgan materiallar: protsedura bilan birga tanlanadi (ombordan hali ayirilmaydi)
    const [matQueue, setMatQueue] = useState<PendingMaterial[]>([]);
    const showMaterials = !!onAddMaterials && inventoryItems.length > 0;

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
            setPriceModes(prev => {
                const next = { ...prev };
                delete next[service.id];
                return next;
            });
        } else {
            setSelectedServiceIds(prev => [...prev, service.id]);
            setPrices(prev => ({ ...prev, [service.id]: service.price.toString() }));
            setPriceModes(prev => ({ ...prev, [service.id]: service.onePrice ? 'once' : 'each' }));
        }
    };

    const teethForItems: (number | undefined)[] = selectedTeeth.length > 0 ? selectedTeeth : [undefined];
    // Narx rejimi faqat 2 va undan ko'p tish tanlanganda ma'noga ega
    const multiTeeth = selectedTeeth.length > 1;
    const isOnce = (serviceId: number) => multiTeeth && priceModes[serviceId] === 'once';
    const itemsToAdd = selectedServiceIds.reduce((sum, id) => sum + (isOnce(id) ? 1 : teethForItems.length), 0);

    const addToQueue = () => {
        if (selectedServiceIds.length === 0) {
            alert(t('patients.details.alerts.selectServiceReq'));
            return;
        }

        const chosen = selectedServiceIds
            .map(id => services.find(s => s.id === id))
            .filter((s): s is Service => !!s);

        const newItems: Omit<ProcedureItem, 'id'>[] = [];
        // Bitta narxli xizmatlar: hamma tishga bitta qator
        for (const service of chosen) {
            if (!isOnce(service.id)) continue;
            newItems.push({
                serviceId: service.id,
                serviceName: service.name,
                toothNumber: selectedTeeth[0],
                teeth: [...selectedTeeth],
                price: parseFloat(prices[service.id]) || 0,
                notes: notes || undefined
            });
        }
        for (const tooth of teethForItems) {
            for (const service of chosen) {
                if (isOnce(service.id)) continue;
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
        setPriceModes({});
        setNotes('');
    };

    const removeFromQueue = (index: number) => {
        const newQueue = [...queue];
        newQueue.splice(index, 1);
        setQueue(newQueue);
    };

    const handleSaveAll = () => {
        if (queue.length === 0 && matQueue.length === 0) {
            alert(t('patients.details.alerts.listEmpty'));
            return;
        }

        if (queue.length > 0) {
            if (onAddProcedures) {
                onAddProcedures(queue);
            } else {
                // Fallback for legacy
                queue.forEach(p => onAddProcedure(p));
            }
        }
        if (matQueue.length > 0) onAddMaterials?.(matQueue);

        handleClose();
    };

    const handleClose = () => {
        setQueue([]);
        setSelectedTeeth([]);
        setSelectedCategoryId('');
        setSelectedServiceIds([]);
        setPrices({});
        setPriceModes({});
        setNotes('');
        setMatQueue([]);
        onClose();
    };

    if (!isOpen) return null;

    const visibleServices = (services || []).filter(s => !selectedCategoryId || (s as any).categoryId === selectedCategoryId);
    const teethLabel = selectedTeeth.length > 0
        ? selectedTeeth.map(n => `#${n}`).join(', ')
        : t('patients.details.modals.common');

    // Tanlangan xizmat ostidagi qator: bir nechta tish tanlangan bo'lsa narx har tishgami yoki bir marta
    const priceModeLine = (service: Service) => {
        if (!multiTeeth) return null;
        const mode = priceModes[service.id] || 'each';
        const price = parseFloat(prices[service.id]) || 0;
        const sum = mode === 'once' ? price : price * selectedTeeth.length;
        const btn = (value: 'each' | 'once', label: string) => (
            <button
                type="button"
                onClick={() => setPriceModes(prev => ({ ...prev, [service.id]: value }))}
                aria-pressed={mode === value}
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${mode === value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'}`}
            >
                {label}
            </button>
        );
        return (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {btn('each', t('patients.details.modals.priceEach'))}
                {btn('once', t('patients.details.modals.priceOnce').replace('{n}', String(selectedTeeth.length)))}
                <span className="ml-auto text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
                    {mode === 'each' ? `${selectedTeeth.length} × ${price.toLocaleString()} = ` : '= '}{sum.toLocaleString()} UZS
                </span>
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={t('patients.details.modals.addProcedureTitle')} className="max-w-6xl lg:max-w-[1400px] 2xl:max-w-[1680px]">
            {/* Balandlik oynaga sig'adi (oyna 90vh, sarlavha va chetlar ~7.5rem) — oynaning o'zi aylanmaydi.
                Ilgari 80vh edi: past ekranda oyna ham, ichidagi ikki blok ham alohida aylanib, uchta
                ingichka aylantirish chizig'i chiqardi. Endi kompyuterda bitta — o'ng ustunda. */}
            <div className="flex flex-col lg:flex-row gap-6 min-h-[60vh] lg:h-[calc(90vh-7.5rem)]" data-tour="proc-modal">

                {/* Left Side: Teeth Chart */}
                <div className="lg:w-3/5 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 sm:p-4 overflow-hidden lg:min-h-[400px]" data-tour="proc-teeth">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-500 uppercase mb-4 sticky top-0 bg-gray-50 dark:bg-gray-800 z-10 py-2">
                        1. {t('patients.details.modals.stepSelectTooth')}
                    </h4>
                    <FitChart>
                        <TeethChart
                            initialData={[]}
                            onToothClick={toggleTooth}
                            selectedTeeth={selectedTeeth}
                        />
                    </FitChart>
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
                <div className="lg:w-2/5 flex flex-col h-auto lg:h-full min-h-0">

                  {/* Bitta aylanadigan qism: xizmat tanlash + ro'yxat. Tugmalar pastda doim ko'rinib turadi. */}
                  <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-2 space-y-4">

                    {/* Input Area */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 shadow-sm">
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

                            <div data-tour="proc-service">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('patients.details.modals.service')}
                                    {selectedServiceIds.length > 0 && <span className="ml-1 text-primary-600">({selectedServiceIds.length})</span>}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setServicesOpen(v => !v)}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:border-primary-400 transition-colors"
                                >
                                    <span className="truncate text-left">
                                        {selectedServiceIds.length === 0
                                            ? t('patients.details.modals.selectService')
                                            : t('auto.{n} ta tanlandi').replace('{n}', String(selectedServiceIds.length))}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${servicesOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Yopiq holatda ham tanlanganlar va narxlari ko'rinib turadi */}
                                {!servicesOpen && selectedServiceIds.length > 0 && (
                                    <div className="mt-2 space-y-1.5">
                                        {visibleServices.filter(sv => selectedServiceIds.includes(sv.id)).map(service => (
                                            <div key={service.id} className="px-3 py-1.5 rounded-lg bg-primary-50/60 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50">
                                              <div className="flex items-center gap-2">
                                                <span className="flex-1 min-w-0 truncate text-sm text-gray-900 dark:text-white">{service.name}</span>
                                                <input
                                                    type="number"
                                                    value={prices[service.id] ?? ''}
                                                    onChange={(e) => setPrices(prev => ({ ...prev, [service.id]: e.target.value }))}
                                                    aria-label={`${t('patients.details.modals.price')}: ${service.name}`}
                                                    className="w-28 h-8 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                                                />
                                                <button type="button" onClick={() => toggleService(service)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                                                    <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                              {priceModeLine(service)}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {servicesOpen && (
                                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                    {visibleServices.length === 0 ? (
                                        <p className="p-3 text-sm text-gray-400">{t('patients.details.modals.selectService')}</p>
                                    ) : visibleServices.map(service => {
                                        const checked = selectedServiceIds.includes(service.id);
                                        return (
                                            <div key={service.id} className={`px-3 py-2 ${checked ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''}`}>
                                              <div className="flex items-center gap-3">
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
                                              {checked && priceModeLine(service)}
                                            </div>
                                        );
                                    })}
                                </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('patients.details.modals.notes')}</label>
                                <Input
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder={`${t('patients.details.modals.notes')}...`}
                                />
                            </div>

                            <Button onClick={addToQueue} className="w-full" disabled={selectedServiceIds.length === 0} data-tour="proc-add-list">
                                <Plus className="w-4 h-4 mr-2" /> {t('patients.details.modals.addToList')}{itemsToAdd > 1 ? ` (${itemsToAdd})` : ''}
                            </Button>
                        </div>

                        {showMaterials && (
                            <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <h4 className="text-xs sm:text-sm font-bold text-gray-500 uppercase mb-3">
                                    3. {t('patients.details.modals.stepMaterials')}
                                </h4>
                                <MaterialPicker
                                    items={inventoryItems}
                                    reserved={[...reservedMaterials, ...matQueue]}
                                    onAdd={m => setMatQueue(prev => mergeMaterials(prev, [m]))}
                                />
                            </div>
                        )}
                    </div>

                    {/* Queue List */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center justify-between">
                            <span>{t('patients.details.modals.totalList')} ({queue.length})</span>
                            <span className="text-primary-600 font-bold">
                                {queue.reduce((sum, item) => sum + item.price, 0).toLocaleString()} UZS
                            </span>
                        </h4>

                        <div className="space-y-2">
                            {queue.length === 0 && matQueue.length === 0 ? (
                                <div className="py-8 flex flex-col items-center justify-center text-gray-400 text-sm dashed border-2 border-gray-200 dark:border-gray-700 rounded-lg">
                                    <Plus className="w-8 h-8 mb-2 opacity-20" />
                                    <p>{t('patients.details.modals.nothingAdded')}</p>
                                </div>
                            ) : (
                                queue.map((item, idx) => (
                                    <div key={idx} data-tour="proc-queue-item" className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3 rounded-lg flex justify-between items-center shadow-sm group">
                                        <div className="flex items-center gap-3">
                                            {item.teeth && item.teeth.length > 1 ? (
                                                <span className="h-8 px-2 flex items-center justify-center bg-primary-100 text-primary-700 text-xs font-bold rounded-lg shrink-0 whitespace-nowrap">
                                                    {t('patients.details.modals.teethCount').replace('{n}', String(item.teeth.length))}
                                                </span>
                                            ) : item.toothNumber ? (
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
                                                <p className="text-xs text-gray-500">
                                                    {item.teeth && item.teeth.length > 1 ? `${item.teeth.map(n => `#${n}`).join(', ')} · ` : ''}{item.price.toLocaleString()} UZS
                                                </p>
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
                            {matQueue.length > 0 && (
                                <div className="pt-2">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1.5">{t('patients.details.visitMaterials.title')}</p>
                                    <MaterialList materials={matQueue} onRemove={id => setMatQueue(prev => prev.filter(m => m.itemId !== id))} />
                                </div>
                            )}
                        </div>
                    </div>

                  </div>

                    {/* Footer Actions — aylanmaydi, doim ko'rinadi */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 shrink-0">
                        <Button variant="secondary" onClick={handleClose} className="flex-1">
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleSaveAll} className="flex-[2]" disabled={queue.length === 0 && matQueue.length === 0} data-tour="proc-save">
                            <ArrowRight className="w-4 h-4 mr-2" /> {t('patients.details.modals.saveAndFinish')}
                        </Button>
                    </div>

                </div>
            </div>
        </Modal>
    );
};
