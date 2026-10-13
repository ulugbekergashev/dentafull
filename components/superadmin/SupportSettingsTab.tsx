import React, { useState } from 'react';
import { CheckCircle, Loader2, PenLine, PowerOff, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Card, Input } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportCategory, SupportCategorySetting, SupportMode, SupportSettings } from '../../services/supportAdmin';
import { ChoiceButtons, ErrorBlock, InlineError, LoadingBlock, Switch, areaCls, fieldCls, hintCls, labelCls, useSupportQuery } from './supportUi';
import { useSupportLabels } from './supportLabels';

// ─── Yordam boti → Sozlamalar ────────────────────────────────────────────────
// Hamma o'zgarish bitta "Saqlash" bilan ketadi va serverga faqat o'zgargan
// maydonlar yuboriladi. Saqlash paneli pastga yopishib turadi — uzun sahifada
// o'zgartirib, saqlashni unutib ketmaslik uchun.

const MAX_TRUST_DAYS = 365;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

const MODE_ICON: Record<SupportMode, LucideIcon> = { off: PowerOff, draft: PenLine, auto: Zap };
const MODE_ICON_TONE: Record<SupportMode, string> = {
    off: 'text-red-600 dark:text-red-400',
    draft: 'text-amber-600 dark:text-amber-400',
    auto: 'text-emerald-600 dark:text-emerald-400',
};

const categoryMode = (settings: SupportSettings, id: string): SupportCategorySetting => settings.categoryModes[id] ?? 'rule';

/** Mavzular xaritasi kalitlar tartibiga qaramay solishtiriladi; yo'q yozuv — 'rule' */
const isSameValue = (key: keyof SupportSettings, draft: SupportSettings, saved: SupportSettings): boolean => {
    if (key !== 'categoryModes') return draft[key] === saved[key];
    const ids = new Set([...Object.keys(draft.categoryModes), ...Object.keys(saved.categoryModes)]);
    return Array.from(ids).every(id => categoryMode(draft, id) === categoryMode(saved, id));
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
    <Card className="p-5">
        <h4 className="font-bold text-gray-900 dark:text-white">{title}</h4>
        {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 max-w-2xl">{hint}</p>}
        <div className="mt-4">{children}</div>
    </Card>
);

const SettingsForm: React.FC<{ initial: SupportSettings; categories: SupportCategory[] }> = ({ initial, categories }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState(initial);
    const [isSaving, setIsSaving] = useState(false);
    const [isJustSaved, setIsJustSaved] = useState(false);
    const [error, setError] = useState<unknown>(null);

    const changedKeys = (Object.keys(draft) as (keyof SupportSettings)[]).filter(key => !isSameValue(key, draft, saved));
    const isDirty = changedKeys.length > 0;

    const change = (patch: Partial<SupportSettings>) => {
        setDraft(current => ({ ...current, ...patch }));
        setIsJustSaved(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const patch: Partial<SupportSettings> = Object.fromEntries(changedKeys.map(key => [key, draft[key]]));
            const result = await supportAdmin.saveSettings(patch);
            setSaved(result);
            setDraft(result);
            setIsJustSaved(true);
        } catch (err) {
            setError(err);
        } finally {
            setIsSaving(false);
        }
    };

    const modeOptions: { id: SupportMode; title: string; hint: string }[] = [
        { id: 'off', title: labels.mode('off'), hint: t('auto.Bot mijozlarga javob bermaydi.') },
        {
            id: 'draft',
            title: t('auto.Qoralama: har javobni men tasdiqlayman'),
            hint: t("auto.Bot javobni tayyorlab, avval sizga yuboradi. Siz tasdiqlagandan keyingina mijozga ketadi."),
        },
        {
            id: 'auto',
            title: labels.mode('auto'),
            hint: t("auto.Bot ishonch qozongan mavzularda o'zi javob beradi: mavzu bo'yicha 30 ta javobi tahrirsiz ketgach. Qolganini avval sizga yuboradi."),
        },
    ];

    const categoryOptions: { value: SupportCategorySetting; label: string }[] = [
        { value: 'rule', label: labels.categorySetting('rule') },
        { value: 'auto', label: labels.categorySetting('auto') },
        { value: 'draft', label: labels.categorySetting('draft') },
    ];

    return (
        <div className="space-y-4">
            <Section title={t('auto.Bot qanday ishlasin')}>
                <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={t('auto.Bot qanday ishlasin')}>
                    {modeOptions.map(option => {
                        const Icon = MODE_ICON[option.id];
                        const isSelected = draft.mode === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => change({ mode: option.id })}
                                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${isSelected
                                    ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/60 dark:bg-primary-900/20'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-700/40'}`}
                            >
                                <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${MODE_ICON_TONE[option.id]}`} />
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-gray-900 dark:text-white">{option.title}</span>
                                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{option.hint}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Section>

            <Section
                title={t("auto.Mavzular bo'yicha")}
                hint={t("auto.Ayrim mavzuni umumiy tartibdan chiqarish mumkin: masalan, to'lov haqidagi savollarga doim o'zingiz javob bering.")}
            >
                {categories.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("auto.Mavzular ro'yxati hali yo'q")}</p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {categories.map(category => (
                            <li key={category.id} className="py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{category.label}</span>
                                <ChoiceButtons
                                    value={categoryMode(draft, category.id)}
                                    options={categoryOptions}
                                    ariaLabel={category.label}
                                    onChange={setting => change({ categoryModes: { ...draft.categoryModes, [category.id]: setting } })}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            <Section
                title={t("auto.Mijoz qanday to'laydi")}
                hint={t("auto.Mijoz to'lov haqida so'raganda bot aynan shu matnni yuboradi: karta raqami, kimning nomiga va chekni qayerga yuborish.")}
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <label className={labelCls}>
                        {t("auto.O'zbekcha")}
                        <textarea value={draft.payInfoUz} onChange={event => change({ payInfoUz: event.target.value })} rows={6} className={`${areaCls} mt-1 font-normal`} />
                    </label>
                    <label className={labelCls}>
                        {t('auto.Ruscha')}
                        <textarea value={draft.payInfoRu} onChange={event => change({ payInfoRu: event.target.value })} rows={6} className={`${areaCls} mt-1 font-normal`} />
                    </label>
                </div>
            </Section>

            <Section title={t('auto.Chek yuborilsa klinika necha kunga avtomatik ochilsin')}>
                <div className="flex flex-wrap items-center gap-3">
                    <Input
                        type="number"
                        min={0}
                        max={MAX_TRUST_DAYS}
                        value={draft.trustDays}
                        onChange={event => change({ trustDays: Math.min(MAX_TRUST_DAYS, Math.max(0, Math.floor(Number(event.target.value) || 0))) })}
                        aria-label={t('auto.Chek yuborilsa klinika necha kunga avtomatik ochilsin')}
                        containerClassName="w-28"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{t('auto.kun')}</span>
                </div>
                <p className={hintCls}>
                    {draft.trustDays > 0
                        ? t("auto.Mijoz chek yuborishi bilan klinikasi {n} kunga ochiladi — to'lovni keyin o'zingiz tekshirasiz.").replace('{n}', String(draft.trustDays))
                        : t("auto.0 — o'chirilgan: klinika faqat siz to'lovni tasdiqlagandan keyin ochiladi.")}
                </p>
            </Section>

            <div className="grid gap-4 md:grid-cols-2">
                <Section title={t("auto.Bot o'zi yozadigan soatlar")} hint={t("auto.Ogohlantirishlar faqat shu oraliqda yuboriladi. Savolga javob istalgan vaqtda beriladi.")}>
                    {/* Yorliq maydondan oldin turadi: "22:00 dan" o'zbekchada to'g'ri, ruschada so'z tartibi buziladi */}
                    <div className="flex flex-wrap items-end gap-4">
                        <label className={labelCls}>
                            {t('auto.Boshlanishi')}
                            <select value={draft.quietFrom} onChange={event => change({ quietFrom: Number(event.target.value) })} className={`${fieldCls} mt-1 block font-normal`}>
                                {HOURS.map(hour => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                            </select>
                        </label>
                        <label className={labelCls}>
                            {t('auto.Tugashi')}
                            <select value={draft.quietTo} onChange={event => change({ quietTo: Number(event.target.value) })} className={`${fieldCls} mt-1 block font-normal`}>
                                {HOURS.map(hour => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                            </select>
                        </label>
                    </div>
                </Section>

                <Section title={t('auto.Oldindan ogohlantirish')}>
                    <div className="flex items-start gap-3">
                        <Switch checked={draft.proactive} onChange={isOn => change({ proactive: isOn })} label={t('auto.Oldindan ogohlantirish')} />
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {t("auto.Bot muammoni sezsa, mijoz so'rashini kutmasdan o'zi yozib ogohlantiradi.")}
                        </p>
                    </div>
                </Section>
            </div>

            <div className="sticky bottom-4 z-10">
                <Card className="p-3 pl-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                    <div className="min-w-0 text-sm">
                        {error ? (
                            <InlineError error={error} />
                        ) : isDirty ? (
                            <span className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                                <span className="h-2 w-2 rounded-full bg-amber-500" /> {t("auto.Saqlanmagan o'zgarishlar bor")}
                            </span>
                        ) : isJustSaved ? (
                            <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle className="w-4 h-4" /> {t('auto.Saqlandi')}
                            </span>
                        ) : (
                            <span className="text-gray-400">{t("auto.O'zgarish yo'q")}</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isDirty && (
                            <Button variant="secondary" onClick={() => { setDraft(saved); setError(null); }} disabled={isSaving}>
                                {t('common.cancel')}
                            </Button>
                        )}
                        <Button onClick={handleSave} disabled={!isDirty || isSaving}>
                            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isSaving ? t('auto.Saqlanmoqda...') : t('common.save')}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export const SupportSettingsTab: React.FC = () => {
    const bundle = useSupportQuery(signal => supportAdmin.settings(signal), []);

    if (bundle.error) return <Card><ErrorBlock error={bundle.error} onRetry={bundle.reload} /></Card>;
    if (!bundle.data) return <Card><LoadingBlock /></Card>;
    return <SettingsForm initial={bundle.data.settings} categories={bundle.data.categories} />;
};
