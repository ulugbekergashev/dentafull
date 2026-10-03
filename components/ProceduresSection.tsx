import React, { useState, useEffect } from 'react';
import { Activity, Camera, CheckCircle2, Package, Trash2 } from 'lucide-react';
import { Button, Card, Badge } from '../components/Common';
import { Transaction, Service, ServiceCategory, VisitRequirements, InventoryItem, PendingMaterial } from '../types';
import { AddProcedureModal } from './AddProcedureModal';
import { MaterialList, MaterialPicker, mergeMaterials } from './MaterialPicker';
import { useLanguage } from '../context/LanguageContext';

interface ProcedureItem {
    id: string;
    serviceId: number;
    serviceName: string;
    toothNumber?: number;
    price: number;
    notes?: string;
}

/** Keyingi tashrif: davolash davomi (kunlar) yoki nazorat ko'rigi (oylar, kunlarda) */
export type NextVisitChoice = { kind: 'checkup' | 'treatment'; days: number };

/** Qabulni yakunlashda protseduralardan tashqari uzatiladiganlar */
export interface VisitCompletion {
    /** Tanlangan keyingi tashriflar (davolash davomi va/yoki nazorat), bo'sh bo'lishi mumkin */
    nextVisits: NextVisitChoice[];
    /** Ishlatilgan materiallar — ombordan shu paytda ayiriladi */
    materials: PendingMaterial[];
    /** Majburiy talab bajarilmay yakunlangan bo'lsa: nima yetishmadi va sababi (qabul izohiga yoziladi) */
    skip?: { missing: ('photo' | 'materials')[]; reason: string };
}

interface VisitWorkflowProps {
    services: Service[];
    categories: ServiceCategory[];
    doctors: any[];
    onCompleteVisit: (procedures: ProcedureItem[], total: number, extra: VisitCompletion) => Promise<void>;
    onProceduresChange?: (procedures: ProcedureItem[]) => void;
    initialProcedures?: ProcedureItem[];
    /** Ombor mahsulotlari — bo'sh bo'lsa material tanlash ko'rinmaydi */
    inventoryItems?: InventoryItem[];
    /** Qabulda tanlangan, hali ayirilmagan materiallar (sahifa yangilansa ham saqlanadi) */
    initialMaterials?: PendingMaterial[];
    onMaterialsChange?: (materials: PendingMaterial[]) => void;
    /** Qabulni yakunlash talablari (Sozlamalar → Xizmatlar). Bo'sh — hech narsa tekshirilmaydi */
    visitRequirements?: VisitRequirements;
    /** Bugun shu bemorga surat yuklanganmi / ombordan material yozilganmi */
    photoDone?: boolean;
    materialsDone?: boolean;
    /** Talab qilingan suratni shu yerdan yuklash. Berilmasa — ruxsat yo'q */
    onUploadPhoto?: () => void;
    /** Talab bajarilmasa ham sabab yozib yakunlash (klinika egasi) */
    canSkipRequirements?: boolean;
}

export const VisitWorkflow: React.FC<VisitWorkflowProps> = ({
    services = [],
    categories = [],
    doctors,
    onCompleteVisit,
    onProceduresChange,
    initialProcedures = [],
    inventoryItems = [],
    initialMaterials = [],
    onMaterialsChange,
    visitRequirements = {},
    photoDone = false,
    materialsDone = false,
    onUploadPhoto,
    canSkipRequirements = false,
}) => {
    const { t } = useLanguage();
    const [procedures, setProcedures] = useState<ProcedureItem[]>(initialProcedures);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Sync state if initialProcedures changes externally
    useEffect(() => {
        if (initialProcedures.length > 0 && procedures.length === 0) {
            setProcedures(initialProcedures);
        }
    }, [initialProcedures]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ishlatilgan materiallar: protsedura oynasida yoki shu yerda tanlanadi,
    // ombordan faqat qabul yakunlanganda ayiriladi
    const [materials, setMaterials] = useState<PendingMaterial[]>(initialMaterials);
    useEffect(() => {
        if (initialMaterials.length > 0 && materials.length === 0) setMaterials(initialMaterials);
    }, [initialMaterials]);
    const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
    const updateMaterials = (next: PendingMaterial[]) => { setMaterials(next); onMaterialsChange?.(next); };
    const canPickMaterials = inventoryItems.length > 0;

    // Keyingi tashrif — ikki mustaqil tanlov: "davolash davom etadi" (kunlar) va
    // "nazorat ko'rigi" (oylar). Masalan kanal davolash: 1 haftadan keyin davomi
    // va 6 oydan keyin nazorat — ikkalasi ham saqlanadi.
    // Xizmatda ko'rsatilgan nazorat muddati (Sozlamalar → Xizmatlar) avtomatik
    // taklif qilinadi — shifokor faqat tasdiqlaydi yoki o'zgartiradi.
    // Bir marta qo'lda o'zgartirilgach, ro'yxat yangilanganda qayta yozilmaydi.
    const [treatmentDays, setTreatmentDays] = useState<number | null>(null);
    const [checkupDays, setCheckupDays] = useState<number | null>(null);
    const [checkupTouched, setCheckupTouched] = useState(false);
    useEffect(() => {
        if (checkupTouched) return;
        const suggested = procedures
            .map(p => services.find(s => s.id === p.serviceId)?.recallMonths || 0)
            .reduce((max, m) => Math.max(max, m), 0);
        setCheckupDays(suggested > 0 ? suggested * 30 : null);
    }, [procedures, services, checkupTouched]);
    // Davolash davomi: tanlangan tugmani qayta bosish — bekor qiladi
    const toggleTreatment = (days: number) => setTreatmentDays(cur => (cur === days ? null : days));
    const chooseCheckup = (days: number | null) => { setCheckupTouched(true); setCheckupDays(days); };
    // Xizmat 1 oyni taklif qilgan bo'lsa, u ham tugma bo'lib ko'rinsin
    const checkupMonths = Array.from(new Set([3, 6, 12, ...(checkupDays ? [Math.round(checkupDays / 30)] : [])])).sort((a, b) => a - b);
    const nextVisits: NextVisitChoice[] = [
        ...(treatmentDays ? [{ kind: 'treatment' as const, days: treatmentDays }] : []),
        ...(checkupDays ? [{ kind: 'checkup' as const, days: checkupDays }] : []),
    ];
    const chipCls = (active: boolean) => `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${active
        ? 'bg-primary-600 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`;

    const handleAddProcedure = (procedure: Omit<ProcedureItem, 'id'>) => {
        const newProcedure: ProcedureItem = {
            ...procedure,
            id: Date.now().toString() + Math.random()
        };
        const updated = [...procedures, newProcedure];
        setProcedures(updated);
        onProceduresChange?.(updated);
    };

    const handleAddProcedures = (newProcedures: Omit<ProcedureItem, 'id'>[]) => {
        const proceduresWithIds = newProcedures.map(p => ({
            ...p,
            id: Date.now().toString() + Math.random()
        }));
        const updated = [...procedures, ...proceduresWithIds];
        setProcedures(updated);
        onProceduresChange?.(updated);
    };

    const handleRemoveProcedure = (id: string) => {
        const updated = procedures.filter(p => p.id !== id);
        setProcedures(updated);
        onProceduresChange?.(updated);
    };

    const total = procedures.reduce((sum, p) => sum + p.price, 0);

    // Majburiy talablar: qo'shilgan xizmatlardan birortasi rasm yoki material
    // talab qilsa — bajarilmaguncha "Qabulni yakunlash" yopiq turadi.
    const requiredBy = (key: 'photo' | 'materials') => Array.from(new Set(
        procedures.filter(p => visitRequirements[String(p.serviceId)]?.[key]).map(p => p.serviceName)
    ));
    const reqRows = ([
        { key: 'photo' as const, icon: Camera, label: t('patients.details.visitReq.photo'), services: requiredBy('photo'), done: photoDone, action: onUploadPhoto, actionLabel: t('patients.details.visitReq.uploadPhoto'), unavailable: false },
        { key: 'materials' as const, icon: Package, label: t('patients.details.visitReq.materials'), services: requiredBy('materials'), done: materialsDone || materials.length > 0, action: () => setMaterialPickerOpen(true), actionLabel: t('patients.details.visitReq.addMaterial'), unavailable: !canPickMaterials },
    ]).filter(r => r.services.length > 0);
    const missing = reqRows.filter(r => !r.done).map(r => r.key);
    const blocked = missing.length > 0;
    const [skipOpen, setSkipOpen] = useState(false);
    const [skipReason, setSkipReason] = useState('');
    useEffect(() => { if (!blocked) { setSkipOpen(false); setSkipReason(''); } }, [blocked]);

    const handleCompleteVisit = async () => {
        if (procedures.length === 0) {
            alert(t('patients.details.procedures.addProcedureReq'));
            return;
        }
        const skip = blocked ? { missing, reason: skipReason.trim() } : undefined;
        if (skip && (!canSkipRequirements || skip.reason.length < 3)) return;

        setIsSubmitting(true);
        try {
            await onCompleteVisit(procedures, total, { nextVisits, materials, skip });
        } catch (error) {
            console.error("Error completing visit:", error);
        } finally {
            setIsSubmitting(false);
        }
        // setProcedures([]); // Don't clear automatically, let user clear or handle via parent key reset
    };

    return (
        <>
            <Card className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Activity className="w-5 h-5" /> {t('patients.details.procedures.todayVisit')}
                    </h3>
                    <Button onClick={() => setIsModalOpen(true)} disabled={isSubmitting} className="px-5 py-2">
                        {t('patients.details.procedures.addProcedure')}
                    </Button>
                </div>

                {/* Procedures List */}
                <div className="space-y-2">
                    {procedures.length === 0 && (
                        <p className="py-3 text-sm text-gray-400 dark:text-gray-500">{t('patients.details.procedures.clickToAdd')}</p>
                    )}

                    {procedures.map(proc => (
                        <div key={proc.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    {proc.toothNumber && (
                                        <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-xs font-bold rounded">
                                            #{proc.toothNumber}
                                        </span>
                                    )}
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {proc.serviceName}
                                    </span>
                                </div>
                                {proc.notes && (
                                    <p className="text-xs text-gray-500 mt-1">{proc.notes}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-900 dark:text-white">
                                    {proc.price.toLocaleString()} UZS
                                </span>
                                <button
                                    onClick={() => handleRemoveProcedure(proc.id)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    disabled={isSubmitting}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Ishlatilgan materiallar — ombordan yakunlashda ayiriladi */}
                {canPickMaterials && (materials.length > 0 || materialPickerOpen || procedures.length > 0) && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                {t('patients.details.visitMaterials.title')}
                                {materials.length > 0 && <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">{t('patients.details.visitMaterials.hint')}</span>}
                            </p>
                            {!materialPickerOpen && (
                                <button type="button" onClick={() => setMaterialPickerOpen(true)} disabled={isSubmitting} className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400 shrink-0">
                                    {t('patients.details.visitMaterials.add')}
                                </button>
                            )}
                        </div>
                        {materials.length > 0 && (
                            <MaterialList materials={materials} disabled={isSubmitting} onRemove={id => updateMaterials(materials.filter(m => m.itemId !== id))} />
                        )}
                        {materialPickerOpen && (
                            <MaterialPicker
                                items={inventoryItems}
                                reserved={materials}
                                onAdd={m => { updateMaterials(mergeMaterials(materials, [m])); setMaterialPickerOpen(false); }}
                            />
                        )}
                    </div>
                )}

                {/* Total and Complete Button */}
                {procedures.length > 0 && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                                {t('patients.details.procedures.total')}
                            </span>
                            <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                                {total.toLocaleString()} UZS
                            </span>
                        </div>
                        {/* Keyingi tashrif — ikki qator: davolash davomi (kunlar) / nazorat ko'rigi (oylar) */}
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-40 text-sm text-gray-600 dark:text-gray-300">{t('patients.details.recall.treatment')}</span>
                                {[{ days: 3, label: `3 ${t('patients.details.recall.days')}` }, { days: 7, label: `1 ${t('patients.details.recall.week')}` }, { days: 14, label: `2 ${t('patients.details.recall.week')}` }].map(o => (
                                    <button key={o.days} type="button" onClick={() => toggleTreatment(o.days)} aria-pressed={treatmentDays === o.days} className={chipCls(treatmentDays === o.days)}>
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-40 text-sm text-gray-600 dark:text-gray-300">{t('patients.details.recall.checkup')}</span>
                                {checkupMonths.map(m => (
                                    <button key={m} type="button" onClick={() => chooseCheckup(m * 30)} aria-pressed={checkupDays === m * 30} className={chipCls(checkupDays === m * 30)}>
                                        {m} {t('patients.details.recall.months')}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => chooseCheckup(null)}
                                    aria-pressed={checkupDays === null}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${checkupDays === null
                                        ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                                >
                                    {t('patients.details.recall.none')}
                                </button>
                            </div>
                        </div>
                        {reqRows.length > 0 && (
                            <div className={`rounded-lg border p-3 space-y-2 ${blocked ? 'border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/10' : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-900/10'}`}>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('patients.details.visitReq.title')}</p>
                                {reqRows.map(r => (
                                    <div key={r.key} className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0 flex items-start gap-2">
                                            <r.icon className={`w-4 h-4 mt-0.5 shrink-0 ${r.done ? 'text-emerald-600' : 'text-amber-600'}`} />
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-800 dark:text-gray-100">{r.label}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.services.join(', ')}</p>
                                            </div>
                                        </div>
                                        {r.done ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                                <CheckCircle2 className="w-4 h-4" /> {t('patients.details.visitReq.done')}
                                            </span>
                                        ) : r.unavailable ? (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{t('patients.details.visitReq.noInventory')}</span>
                                        ) : r.action ? (
                                            <Button size="sm" variant="secondary" onClick={r.action} disabled={isSubmitting}>{r.actionLabel}</Button>
                                        ) : (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{t('patients.details.visitReq.noPermission')}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {blocked && skipOpen ? (
                            <div className="space-y-2">
                                <textarea
                                    value={skipReason}
                                    onChange={e => setSkipReason(e.target.value)}
                                    rows={2}
                                    maxLength={300}
                                    autoFocus
                                    placeholder={t('patients.details.visitReq.skipReason')}
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => { setSkipOpen(false); setSkipReason(''); }} disabled={isSubmitting}>{t('common.cancel')}</Button>
                                    <Button onClick={handleCompleteVisit} className="flex-1" disabled={isSubmitting || skipReason.trim().length < 3}>
                                        {isSubmitting ? t('patients.details.procedures.saving') : t('patients.details.visitReq.skipConfirm')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Button
                                    onClick={handleCompleteVisit}
                                    className="w-full"
                                    disabled={isSubmitting || blocked}
                                >
                                    {isSubmitting ? t('patients.details.procedures.saving') : t('patients.details.procedures.completeVisit')}
                                </Button>
                                {blocked && (
                                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                                        {t('patients.details.visitReq.blockedHint')}
                                        {canSkipRequirements && (
                                            <> · <button type="button" onClick={() => setSkipOpen(true)} className="font-semibold text-gray-600 underline hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">{t('patients.details.visitReq.skip')}</button></>
                                        )}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}
            </Card>

            <AddProcedureModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                services={services}
                categories={categories}
                onAddProcedures={handleAddProcedures}
                onAddProcedure={handleAddProcedure}
                inventoryItems={inventoryItems}
                reservedMaterials={materials}
                onAddMaterials={added => updateMaterials(mergeMaterials(materials, added))}
            />
        </>
    );
};

interface ProceduresSectionProps {
    transactions: Transaction[];
    doctors: any[];
    onAddProcedure: () => void;
    onViewAll: () => void;
}

export const ProceduresSection: React.FC<ProceduresSectionProps> = ({
    transactions,
    doctors,
    onAddProcedure,
    onViewAll
}) => {
    const { t } = useLanguage();
    
    // Get last 5 procedures
    const recentTransactions = [...transactions]
        .filter(t => t.status === 'Paid' || t.status === 'Pending')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

    return (
        <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-5 h-5" /> {t('patients.details.procedures.title')}
                </h3>
                <Button onClick={onAddProcedure} size="sm">
                    {t('patients.details.procedures.addBtn')}
                </Button>
            </div>

            <div className="space-y-3">
                {recentTransactions.length === 0 ? (
                    <p className="text-center py-4 text-gray-500 text-sm">{t('patients.details.procedures.notFound')}</p>
                ) : (
                    recentTransactions.map((tx) => (
                        <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="font-medium text-sm text-gray-900 dark:text-white">{tx.service}</p>
                                <p className="text-xs text-gray-500">{tx.date} • {tx.doctorName}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-sm text-gray-900 dark:text-white">
                                    {tx.amount.toLocaleString()} UZS
                                </p>
                                <Badge status={tx.status} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {transactions.length > 5 && (
                <button
                    onClick={onViewAll}
                    className="w-full text-center text-sm text-primary-600 dark:text-primary-400 hover:underline pt-2 border-t border-gray-100 dark:border-gray-700"
                >
                    {t('patients.details.procedures.viewAll')}
                </button>
            )}
        </Card>
    );
};
