/**
 * "Ishni boshlash" — yangi klinikani ishga tayyorlash qadamlari: xizmat va narxlar, shifokorlar,
 * birinchi bemor, birinchi qabul, SMS. O'quv markazining tepasida, faqat yangi klinika rahbariga.
 *
 * Qadam "o'rganildi" deb emas, ma'lumot haqiqatan kiritilganda belgilanadi; bosilsa — shu ish
 * qilinadigan joy ochiladi.
 */
import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, ListChecks } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import { api } from '../../services/api';

export interface SetupCounts {
    services: number;
    doctors: number;
    patients: number;
    appointments: number;
}

/** Qadam bosilganda nima ochiladi. Berilmagan qadam ro'yxatda bo'lmaydi (masalan, yakka shifokor tarifida — shifokorlar) */
export interface SetupActions {
    services?: () => void;
    doctors?: () => void;
    patient?: () => void;
    appointment?: () => void;
    sms?: () => void;
}

export interface SetupInfo {
    clinicId: string;
    /** Butun klinika bo'yicha — tanlangan filialdan qat'i nazar */
    counts: SetupCounts;
    actions: SetupActions;
}

interface SetupStep {
    id: keyof SetupActions;
    done: boolean;
    n: number;
    go: () => void;
}

/** Klinika hali ishga tushmagan: asosiy qadamlardan (SMS — ixtiyoriy) biri bajarilmagan */
export const isNewClinic = ({ counts, actions }: Pick<SetupInfo, 'counts' | 'actions'>) =>
    counts.services === 0 || (!!actions.doctors && counts.doctors === 0) || counts.patients === 0 || counts.appointments === 0;

function useSetupSteps({ clinicId, counts, actions }: SetupInfo): SetupStep[] {
    const [smsConnected, setSmsConnected] = useState(false);
    const wantSms = !!actions.sms;

    useEffect(() => {
        if (!wantSms) return;
        let cancelled = false;
        api.sms.getSettings(clinicId)
            .then(s => { if (!cancelled) setSmsConnected(!!s?.isConnected); })
            .catch(() => { /* aniqlab bo'lmasa — ulanmagan deb ko'rsatiladi */ });
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

/** onGo — qator bosilganda (joy ochilishidan oldin): O'quv markazi yopiladi */
export const SetupSection: React.FC<SetupInfo & { onGo: () => void }> = ({ onGo, ...info }) => {
    const { t } = useLanguage();
    const steps = useSetupSteps(info);
    const nextId = steps.find(s => !s.done)?.id;

    return (
        <section className="rounded-2xl border border-primary-100 bg-primary-50/40 p-4 dark:border-primary-900/50 dark:bg-primary-900/10">
            <div className="mb-2 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
                    <ListChecks className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-extrabold text-gray-900 dark:text-white">{t('setup.title')}</h3>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">{t('setup.subtitle')}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black tabular-nums text-primary-700 ring-1 ring-primary-100 dark:bg-gray-900 dark:text-primary-300 dark:ring-primary-900/60">
                    {steps.filter(s => s.done).length} / {steps.length}
                </span>
            </div>
            <ol className="space-y-1">
                {steps.map((s, i) => {
                    const isNext = s.id === nextId;
                    return (
                        <li key={s.id}>
                            <button
                                type="button"
                                onClick={() => { onGo(); s.go(); }}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors sm:items-center ${isNext
                                    ? 'bg-white shadow-sm ring-1 ring-primary-200 hover:ring-primary-300 dark:bg-gray-900 dark:ring-primary-800'
                                    : 'hover:bg-white/70 dark:hover:bg-gray-900/50'}`}
                            >
                                {s.done ? (
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                    </span>
                                ) : (
                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black tabular-nums ${isNext
                                        ? 'bg-primary-600 text-white'
                                        : 'border border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}>
                                        {i + 1}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                                    <span className="block min-w-0 flex-1">
                                        <span className={`block text-sm ${s.done ? 'font-semibold text-gray-500 dark:text-gray-400' : 'font-bold text-gray-900 dark:text-white'}`}>
                                            {t(`setup.${s.id}.title` as TranslationKey)}
                                        </span>
                                        {isNext && (
                                            <span className="block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                                                {t(`setup.${s.id}.hint` as TranslationKey)}
                                            </span>
                                        )}
                                    </span>
                                    {s.done && (
                                        <span className="block shrink-0 text-xs font-semibold tabular-nums text-gray-400 dark:text-gray-500">
                                            {t(`setup.${s.id}.done` as TranslationKey).replace('{n}', String(s.n))}
                                        </span>
                                    )}
                                    {isNext && (
                                        <span className="mt-2 inline-flex h-8 shrink-0 items-center rounded-lg bg-primary-600 px-3 text-xs font-bold text-white shadow-sm sm:mt-0">
                                            {t(`setup.${s.id}.action` as TranslationKey)}
                                        </span>
                                    )}
                                </span>
                                {!isNext && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />}
                            </button>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
};
