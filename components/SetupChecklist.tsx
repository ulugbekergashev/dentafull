import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, ListChecks } from 'lucide-react';
import { Card, Modal } from './Common';
import { CollapseToggle, useCollapsed } from './CollapseToggle';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { api } from '../services/api';

/**
 * "Ishni boshlash" — klinikani ishga tayyorlash qadamlari: xizmat va narxlar, shifokorlar,
 * birinchi bemor, birinchi qabul, SMS. Qadam "o'rganildi" deb emas, ma'lumot haqiqatan
 * kiritilganda belgilanadi; bosilsa — shu ish qilinadigan joy ochiladi.
 *
 * Ikki joyda ko'rinadi:
 *  - SetupGuide — sarlavhadagi "Qo'llanma" tugmasi ochadigan oyna: har bir xodimga, istalgan
 *    sahifadan. Xodim faqat o'zi qila oladigan qadamlarni ko'radi.
 *  - SetupChecklist — bosh sahifadagi karta: faqat yangi klinika rahbariga, asosiy qadamlar
 *    tugaguncha (bo'sh klinikada nimadan boshlash o'zi ko'rinib tursin).
 */

export interface SetupCounts {
    services: number;
    doctors: number;
    patients: number;
    appointments: number;
}

/** Qadam bosilganda nima ochiladi. Berilmagan qadam ro'yxatda bo'lmaydi (ruxsat yo'q yoki tarifda kerak emas) */
export interface SetupActions {
    services?: () => void;
    doctors?: () => void;
    patient?: () => void;
    appointment?: () => void;
    sms?: () => void;
}

interface SetupStep {
    id: keyof SetupActions;
    done: boolean;
    n: number;
    go: () => void;
}

/** SMS ulanganmi — shu ochilishdagi oxirgi ma'lum holat: oyna qayta ochilganda qadam "bajarilmagan"dan sakrab o'tmasin */
const smsKnown = new Map<string, boolean>();

function useSetupSteps(clinicId: string, counts: SetupCounts, actions: SetupActions, active: boolean): SetupStep[] {
    const [smsConnected, setSmsConnected] = useState(() => smsKnown.get(clinicId) ?? false);
    const wantSms = active && !!actions.sms;

    useEffect(() => {
        if (!wantSms) return;
        let cancelled = false;
        api.sms.getSettings(clinicId)
            .then(s => {
                const connected = !!s?.isConnected;
                smsKnown.set(clinicId, connected);
                if (!cancelled) setSmsConnected(connected);
            })
            .catch(() => { /* aniqlab bo'lmasa — oxirgi ma'lum holat qoladi */ });
        return () => { cancelled = true; };
    }, [wantSms, clinicId]);

    const all: (Omit<SetupStep, 'go'> & { go?: () => void })[] = [
        { id: 'services', done: counts.services > 0, n: counts.services, go: actions.services },
        { id: 'doctors', done: counts.doctors > 0, n: counts.doctors, go: actions.doctors },
        { id: 'patient', done: counts.patients > 0, n: counts.patients, go: actions.patient },
        { id: 'appointment', done: counts.appointments > 0, n: counts.appointments, go: actions.appointment },
        { id: 'sms', done: smsConnected, n: 0, go: actions.sms },
    ];
    return all.filter((s): s is SetupStep => !!s.go);
}

const badgeCls = 'shrink-0 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-black tabular-nums';

/** Qadamlar ro'yxati. Birinchi bajarilmagan qadam ajratib ko'rsatiladi — izoh va tugma faqat unda */
const StepRows: React.FC<{ steps: SetupStep[]; onGo?: () => void }> = ({ steps, onGo }) => {
    const { t } = useLanguage();
    const nextId = steps.find(s => !s.done)?.id;
    return (
        <ol className="space-y-1">
            {steps.map((s, i) => {
                const title = t(`setup.${s.id}.title` as TranslationKey);
                const isNext = s.id === nextId;
                return (
                    <li key={s.id}>
                        <button
                            type="button"
                            onClick={() => { onGo?.(); s.go(); }}
                            className={`w-full flex items-start sm:items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isNext
                                ? 'bg-primary-50/70 hover:bg-primary-50 dark:bg-primary-900/20 dark:hover:bg-primary-900/30'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                        >
                            {s.done ? (
                                <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                </span>
                            ) : (
                                <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black tabular-nums ${isNext
                                    ? 'bg-primary-600 text-white'
                                    : 'border border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}>
                                    {i + 1}
                                </span>
                            )}
                            <span className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-3">
                                <span className="block flex-1 min-w-0">
                                    <span className={`block text-sm ${s.done ? 'font-semibold text-gray-500 dark:text-gray-400' : 'font-bold text-gray-900 dark:text-white'}`}>{title}</span>
                                    {isNext && (
                                        <span className="block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                                            {t(`setup.${s.id}.hint` as TranslationKey)}
                                        </span>
                                    )}
                                </span>
                                {s.done && (
                                    <span className="block shrink-0 text-xs font-semibold text-gray-400 dark:text-gray-500 tabular-nums">
                                        {t(`setup.${s.id}.done` as TranslationKey).replace('{n}', String(s.n))}
                                    </span>
                                )}
                                {isNext && (
                                    <span className="mt-2 sm:mt-0 shrink-0 inline-flex items-center h-8 px-3 rounded-lg bg-primary text-white text-xs font-bold shadow-sm">
                                        {t(`setup.${s.id}.action` as TranslationKey)}
                                    </span>
                                )}
                            </span>
                            {!isNext && <ChevronRight className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600" />}
                        </button>
                    </li>
                );
            })}
        </ol>
    );
};

interface SetupProps {
    clinicId: string;
    /** Butun klinika bo'yicha — tanlangan filialdan qat'i nazar */
    counts: SetupCounts;
    actions: SetupActions;
}

/** Sarlavhadagi "Qo'llanma" tugmasi ochadigan oyna */
export const SetupGuide: React.FC<SetupProps & { isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose, clinicId, counts, actions }) => {
    const { t } = useLanguage();
    const steps = useSetupSteps(clinicId, counts, actions, isOpen);
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('setup.guide')}>
            <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-gray-900 dark:text-white">{t('setup.title')}</p>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('setup.guideHint')}</p>
                </div>
                <span className={badgeCls}>{steps.filter(s => s.done).length} / {steps.length}</span>
            </div>
            <StepRows steps={steps} onGo={onClose} />
        </Modal>
    );
};

/** Bosh sahifadagi karta — yangi klinika rahbariga */
export const SetupChecklist: React.FC<SetupProps> = ({ clinicId, counts, actions }) => {
    const { t } = useLanguage();
    // Asosiy qadamlar (SMS — ixtiyoriy) tugagach karta yo'qoladi; ro'yxat "Qo'llanma"da qoladi
    const isNew = counts.services === 0 || (!!actions.doctors && counts.doctors === 0)
        || counts.patients === 0 || counts.appointments === 0;
    const steps = useSetupSteps(clinicId, counts, actions, isNew);
    const [collapsed, toggleCollapsed] = useCollapsed(`setup.${clinicId}`, false);
    if (!isNew) return null;

    return (
        <Card className="p-5 rounded-[2rem]">
            <div className={`flex items-center gap-3 ${collapsed ? '' : 'mb-3'}`}>
                <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    <ListChecks className="w-[18px] h-[18px]" />
                </span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-gray-900 dark:text-white truncate">{t('setup.title')}</h3>
                    {!collapsed && <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('setup.subtitle')}</p>}
                </div>
                <span className={badgeCls}>{steps.filter(s => s.done).length} / {steps.length}</span>
                <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
            </div>
            {!collapsed && <StepRows steps={steps} />}
        </Card>
    );
};
