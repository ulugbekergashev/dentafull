import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, ListChecks } from 'lucide-react';
import { Card } from './Common';
import { CollapseToggle, useCollapsed } from './CollapseToggle';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { api } from '../services/api';

/**
 * "Ishni boshlash" — klinika rahbari uchun bosh sahifadagi ro'yxat.
 *
 * Yangi klinika bo'sh ochiladi: xizmat ham, shifokor ham yo'q. Ro'yxat nimadan
 * boshlashni ko'rsatadi va har bir qadamni kerakli joyga olib boradi. Qadam
 * "o'rganildi" deb emas, ma'lumot haqiqatan kiritilganda belgilanadi.
 *
 * Kimga chiqadi: bajarilmagan qadami bor har bir klinikaga — ishlab turganiga ham
 * (unda odatda faqat SMS qoladi). Hammasi bajarilgan bo'lsa yoki "Yopish"
 * bosilgan bo'lsa chiqmaydi (shu brauzerda eslab qolinadi).
 */

export interface SetupCounts {
    services: number;
    doctors: number;
    patients: number;
    appointments: number;
}

interface SetupChecklistProps {
    clinicId: string;
    /** Butun klinika bo'yicha — tanlangan filialdan qat'i nazar */
    counts: SetupCounts;
    /** Yakka shifokor tarifi: shifokor profili birinchi qabulda o'zi ochiladi */
    soloDoctor: boolean;
    onAddPatient: () => void;
    onBook: () => void;
}

const closedKey = (clinicId: string) => `dentacrm:setup:${clinicId}`;
/** SMS ulanganmi — oxirgi ma'lum holat: karta har ochilishda so'rov javobini kutib, kechikib chiqmasin */
const smsKey = (clinicId: string) => `dentacrm:setup-sms:${clinicId}`;

const read = (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* saqlanmasa — shu ochilishda ishlaydi */ }
};

export const SetupChecklist: React.FC<SetupChecklistProps> = ({ clinicId, counts, soloDoctor, onAddPatient, onBook }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [closed, setClosed] = useState(() => read(closedKey(clinicId)) === 'closed');
    /** null — hali noma'lum */
    const [smsConnected, setSmsConnected] = useState<boolean | null>(() => {
        const v = read(smsKey(clinicId));
        return v === null ? null : v === '1';
    });
    const [collapsedState, toggleCollapsed] = useCollapsed(`setup.${clinicId}`, false);

    const steps = [
        { id: 'services', done: counts.services > 0, n: counts.services, go: () => navigate('/settings?tab=services') },
        ...(soloDoctor ? [] : [{ id: 'doctors', done: counts.doctors > 0, n: counts.doctors, go: () => navigate('/doctors') }]),
        { id: 'patient', done: counts.patients > 0, n: counts.patients, go: onAddPatient },
        { id: 'appointment', done: counts.appointments > 0, n: counts.appointments, go: onBook },
        { id: 'sms', done: smsConnected === true, n: 0, go: () => navigate('/settings?tab=messaging') },
    ];
    // SMS — ixtiyoriy qadam: usiz ham klinika ishlaydi
    const coreDone = steps.every(s => s.done || s.id === 'sms');
    const allDone = coreDone && smsConnected === true;

    const close = () => {
        write(closedKey(clinicId), 'closed');
        setClosed(true);
    };

    useEffect(() => {
        if (closed) return;
        let cancelled = false;
        api.sms.getSettings(clinicId)
            .then(s => {
                if (cancelled) return;
                const connected = !!s?.isConnected;
                write(smsKey(clinicId), connected ? '1' : '0');
                setSmsConnected(connected);
            })
            // Aniqlab bo'lmasa — ulanmagan deb ko'rsatiladi
            .catch(() => { if (!cancelled) setSmsConnected(prev => prev ?? false); });
        return () => { cancelled = true; };
    }, [closed, clinicId]);

    // Hammasi bajarilgan klinikada ro'yxat kerak emas — qayta so'ralmaydi ham
    useEffect(() => {
        if (!closed && allDone) close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [closed, allDone]);

    if (closed || allDone) return null;
    // Ishlab turgan klinikada faqat SMS qoladi: holati ma'lum bo'lguncha kutamiz —
    // SMS ulangan klinikada karta lip etib chiqib, yo'qolmasin
    if (coreDone && smsConnected === null) return null;

    // Asosiy qadamlar tugagach yig'ish o'rniga "Yopish" chiqadi — yig'ilgan holda qolib ketmasin
    const collapsed = !coreDone && collapsedState;
    const doneCount = steps.filter(s => s.done).length;
    const nextId = steps.find(s => !s.done)?.id;

    return (
        <Card className="p-5 rounded-[2rem]">
            <div className={`flex items-center gap-3 ${collapsed ? '' : 'mb-3'}`}>
                <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    <ListChecks className="w-[18px] h-[18px]" />
                </span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-gray-900 dark:text-white truncate">{t('setup.title')}</h3>
                    {!collapsed && (
                        <p className="text-[13px] text-gray-500 dark:text-gray-400">{t(coreDone ? 'setup.subtitleLast' : 'setup.subtitle')}</p>
                    )}
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-black tabular-nums">
                    {doneCount} / {steps.length}
                </span>
                {coreDone ? (
                    <button
                        type="button"
                        onClick={close}
                        className="shrink-0 inline-flex items-center h-7 px-2.5 rounded-lg text-xs font-bold text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:text-gray-400 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 transition-colors"
                    >
                        {t('common.close')}
                    </button>
                ) : (
                    <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
                )}
            </div>

            {!collapsed && (
                <ol className="space-y-1">
                    {steps.map((s, i) => {
                        const title = t(`setup.${s.id}.title` as TranslationKey);
                        if (s.done) {
                            return (
                                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                                    <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                    </span>
                                    <span className="flex-1 min-w-0 text-sm font-semibold text-gray-500 dark:text-gray-400 truncate">{title}</span>
                                    <span className="shrink-0 text-xs font-semibold text-gray-400 dark:text-gray-500 tabular-nums">
                                        {t(`setup.${s.id}.done` as TranslationKey).replace('{n}', String(s.n))}
                                    </span>
                                </li>
                            );
                        }
                        const isNext = s.id === nextId;
                        return (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onClick={s.go}
                                    className={`w-full flex items-start sm:items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isNext
                                        ? 'bg-primary-50/70 hover:bg-primary-50 dark:bg-primary-900/20 dark:hover:bg-primary-900/30'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                                >
                                    <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black tabular-nums ${isNext
                                        ? 'bg-primary-600 text-white'
                                        : 'border border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}>
                                        {i + 1}
                                    </span>
                                    <span className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-3">
                                        <span className="block flex-1 min-w-0">
                                            <span className="block text-sm font-bold text-gray-900 dark:text-white">{title}</span>
                                            {isNext && (
                                                <span className="block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                                                    {t(`setup.${s.id}.hint` as TranslationKey)}
                                                </span>
                                            )}
                                        </span>
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
            )}
        </Card>
    );
};
