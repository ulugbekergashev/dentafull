import React, { useState, useEffect } from 'react';
import { Activity, Trash2 } from 'lucide-react';
import { Button, Card, Badge } from '../components/Common';
import { Transaction, Service, ServiceCategory } from '../types';
import { AddProcedureModal } from './AddProcedureModal';
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

interface VisitWorkflowProps {
    services: Service[];
    categories: ServiceCategory[];
    doctors: any[];
    onCompleteVisit: (procedures: ProcedureItem[], total: number, nextVisit: NextVisitChoice | null) => Promise<void>;
    onProceduresChange?: (procedures: ProcedureItem[]) => void;
    initialProcedures?: ProcedureItem[];
}

export const VisitWorkflow: React.FC<VisitWorkflowProps> = ({
    services = [],
    categories = [],
    doctors,
    onCompleteVisit,
    onProceduresChange,
    initialProcedures = []
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

    // Keyingi tashrif: "davolash davom etadi" (kunlar) yoki "nazorat ko'rigi" (oylar).
    // Xizmatda ko'rsatilgan nazorat muddati (Sozlamalar → Xizmatlar) avtomatik
    // taklif qilinadi — shifokor faqat tasdiqlaydi yoki o'zgartiradi.
    // Bir marta qo'lda o'zgartirilgach, ro'yxat yangilanganda qayta yozilmaydi.
    const [nextVisit, setNextVisit] = useState<NextVisitChoice | null>(null);
    const [recallTouched, setRecallTouched] = useState(false);
    useEffect(() => {
        if (recallTouched) return;
        const suggested = procedures
            .map(p => services.find(s => s.id === p.serviceId)?.recallMonths || 0)
            .reduce((max, m) => Math.max(max, m), 0);
        setNextVisit(suggested > 0 ? { kind: 'checkup', days: suggested * 30 } : null);
    }, [procedures, services, recallTouched]);
    const chooseNext = (choice: NextVisitChoice | null) => { setRecallTouched(true); setNextVisit(choice); };
    const isChosen = (kind: NextVisitChoice['kind'], days: number) => nextVisit?.kind === kind && nextVisit.days === days;
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

    const handleCompleteVisit = async () => {
        if (procedures.length === 0) {
            alert(t('patients.details.procedures.addProcedureReq'));
            return;
        }

        setIsSubmitting(true);
        try {
            await onCompleteVisit(procedures, total, nextVisit);
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
                                    <button key={o.days} type="button" onClick={() => chooseNext({ kind: 'treatment', days: o.days })} className={chipCls(isChosen('treatment', o.days))}>
                                        {o.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-40 text-sm text-gray-600 dark:text-gray-300">{t('patients.details.recall.checkup')}</span>
                                {[3, 6, 12].map(m => (
                                    <button key={m} type="button" onClick={() => chooseNext({ kind: 'checkup', days: m * 30 })} className={chipCls(isChosen('checkup', m * 30))}>
                                        {m} {t('patients.details.recall.months')}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => chooseNext(null)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${nextVisit === null
                                        ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                                >
                                    {t('patients.details.recall.none')}
                                </button>
                            </div>
                        </div>
                        <Button
                            onClick={handleCompleteVisit}
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? t('patients.details.procedures.saving') : t('patients.details.procedures.completeVisit')}
                        </Button>
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
