import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportArticle, SupportArticleInput } from '../../services/supportAdmin';
import { InlineError, Switch, areaCls, fieldCls, hintCls, labelCls } from './supportUi';
import { ARTICLE_GUIDES, ARTICLE_MODULES, ARTICLE_PATHS, ARTICLE_ROLES, useSupportLabels } from './supportLabels';

// ─── Bilim bazasi maqolasi: tahrirlash va yangi maqola ───────────────────────
// Ikkala til yonma-yon turadi — tarjima asl matn bilan solishtirib yoziladi.
// Yangi maqolaning kodi (`bo'lim.qisqa-nom`) sarlavhadan o'zi yasaladi: asoschi
// uni o'ylab topishi shart emas, lekin xohlasa tuzatadi.

const ARTICLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const SLUG_MAX_LENGTH = 48;

const EMPTY_INPUT: SupportArticleInput = {
    module: 'general',
    roles: ['*'],
    titleUz: '',
    titleRu: '',
    bodyUz: '',
    bodyRu: '',
    keywords: [],
    paths: [],
    guideId: null,
    active: true,
};

/** Maqoladan faqat serverga yuboriladigan maydonlarni oladi */
export const toArticleInput = (article: SupportArticle): SupportArticleInput => ({
    module: article.module,
    roles: article.roles,
    titleUz: article.titleUz,
    titleRu: article.titleRu,
    bodyUz: article.bodyUz,
    bodyRu: article.bodyRu,
    keywords: article.keywords,
    paths: article.paths,
    guideId: article.guideId,
    active: article.active,
});

/** "Qarzni qanday yozaman?" → "qarzni-qanday-yozaman" */
const slugify = (title: string): string =>
    title
        .toLowerCase()
        .replace(/[`'ʻʼ‘’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_MAX_LENGTH)
        .replace(/-+$/, '');

const splitKeywords = (value: string): string[] =>
    Array.from(new Set(value.split(/[,\n]/).map(word => word.trim()).filter(Boolean)));

const toggleItem = (items: string[], item: string): string[] =>
    items.includes(item) ? items.filter(current => current !== item) : [...items, item];

const chipCls = (isOn: boolean): string =>
    `px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${isOn
        ? 'bg-primary-600 border-primary-600 text-white'
        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`;

export const SupportArticleForm: React.FC<{
    /** null — yangi maqola */
    article: SupportArticle | null;
    onSaved: () => void;
    onCancel: () => void;
}> = ({ article, onSaved, onCancel }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const isNew = article === null;

    const [draft, setDraft] = useState<SupportArticleInput>(() => (article ? toArticleInput(article) : EMPTY_INPUT));
    const [keywordsText, setKeywordsText] = useState(() => (article ? article.keywords.join(', ') : ''));
    const [customId, setCustomId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<unknown>(null);

    const change = (patch: Partial<SupportArticleInput>) => setDraft(current => ({ ...current, ...patch }));

    const slug = slugify(draft.titleUz);
    const generatedId = slug ? `${draft.module}.${slug}` : '';
    const articleId = article ? article.id : (customId ?? generatedId).trim();

    const isForEveryone = draft.roles.includes('*');
    // Serverdagi maqolada bu ro'yxatda yo'q bo'lim yoki qo'llanma bo'lsa — yo'qolmasin
    const moduleIds = Array.from(new Set([...ARTICLE_MODULES, draft.module]));
    const pathIds = Array.from(new Set([...ARTICLE_PATHS.map(path => path.id), ...draft.paths]));
    const guideIds = Array.from(new Set([...ARTICLE_GUIDES.map(guide => guide.id), ...(draft.guideId ? [draft.guideId] : [])]));

    const validate = (): string | null => {
        if (!draft.titleUz.trim() || !draft.bodyUz.trim()) return t("auto.O'zbekcha sarlavha va javob matnini yozing");
        if (!isForEveryone && draft.roles.length === 0) return t("auto.Maqola kimga ko'rsatilishini tanlang");
        if (isNew && !ARTICLE_ID_PATTERN.test(articleId)) {
            return t("auto.Kod faqat kichik lotin harflari, raqam va chiziqchadan iborat bo'lib, o'rtasida nuqta bo'lishi kerak. Masalan: finance.qarz-yozish");
        }
        return null;
    };

    const handleSave = async () => {
        const problem = validate();
        if (problem) { setError(problem); return; }

        setIsSaving(true);
        setError(null);
        try {
            if (isNew) {
                // Server kodi bor maqolani so'roqsiz ustidan yozadi — avval tekshiramiz
                const existing = await supportAdmin.articles({});
                if (existing.some(item => item.id === articleId)) {
                    setError(t("auto.Bunday kodli maqola allaqachon bor. Kodni yoki sarlavhani o'zgartiring."));
                    return;
                }
            }
            await supportAdmin.saveArticle(articleId, {
                ...draft,
                titleUz: draft.titleUz.trim(),
                titleRu: draft.titleRu.trim(),
                bodyUz: draft.bodyUz.trim(),
                bodyRu: draft.bodyRu.trim(),
                keywords: splitKeywords(keywordsText),
            });
            onSaved();
        } catch (err) {
            setError(err);
        } finally {
            setIsSaving(false);
        }
    };

    const languageColumn = (
        heading: string,
        titleValue: string,
        bodyValue: string,
        onTitle: (value: string) => void,
        onBody: (value: string) => void,
    ) => (
        <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{heading}</p>
            <div>
                <label className={labelCls}>
                    {t('auto.Sarlavha')}
                    <input type="text" value={titleValue} onChange={event => onTitle(event.target.value)} className={`${fieldCls} mt-1 w-full font-normal`} />
                </label>
            </div>
            <div>
                <label className={labelCls}>
                    {t('auto.Javob matni')}
                    <textarea value={bodyValue} onChange={event => onBody(event.target.value)} rows={10} className={`${areaCls} mt-1 font-normal`} />
                </label>
            </div>
        </div>
    );

    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className={labelCls}>
                        {t("auto.Bo'lim")}
                        <select value={draft.module} onChange={event => change({ module: event.target.value })} className={`${fieldCls} mt-1 w-full font-normal`}>
                            {moduleIds.map(id => <option key={id} value={id}>{labels.module(id)}</option>)}
                        </select>
                    </label>
                </div>
                <div>
                    <label className={labelCls}>
                        {t('auto.Maqola kodi')}
                        <input
                            type="text"
                            value={articleId}
                            readOnly={!isNew}
                            onChange={event => setCustomId(event.target.value.toLowerCase())}
                            placeholder="finance.qarz-yozish"
                            spellCheck={false}
                            className={`${fieldCls} mt-1 w-full font-mono font-normal ${isNew ? '' : 'opacity-60 cursor-not-allowed'}`}
                        />
                    </label>
                    <p className={hintCls}>
                        {isNew
                            ? t("auto.Sarlavhadan o'zi yasaladi. Saqlangandan keyin o'zgarmaydi.")
                            : t("auto.Kod o'zgarmaydi — bot maqolani shu nom bilan taniydi.")}
                    </p>
                </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                {languageColumn(
                    t("auto.O'zbekcha"),
                    draft.titleUz,
                    draft.bodyUz,
                    value => change({ titleUz: value }),
                    value => change({ bodyUz: value }),
                )}
                {languageColumn(
                    t('auto.Ruscha'),
                    draft.titleRu,
                    draft.bodyRu,
                    value => change({ titleRu: value }),
                    value => change({ bodyRu: value }),
                )}
            </div>
            <p className={hintCls}>{t("auto.Oddiy matn yozing. Qadamlarni «1. ...», «2. ...» ko'rinishida tartiblang — bot uni mijozga shundayligicha yuboradi.")}</p>

            <div>
                <label className={labelCls}>
                    {t("auto.Kalit so'zlar")}
                    <textarea value={keywordsText} onChange={event => setKeywordsText(event.target.value)} rows={2} className={`${areaCls} mt-1 font-normal`} />
                </label>
                <p className={hintCls}>{t("auto.Odamlar shu mavzuni qanday so'rashi: boshqacha aytilishi, xato yozilishi, ruscha so'zlar. Vergul bilan ajrating.")}</p>
            </div>

            <fieldset>
                <legend className={labelCls}>{t("auto.Kimga ko'rsatiladi")}</legend>
                <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={isForEveryone} onClick={() => change({ roles: ['*'] })} className={chipCls(isForEveryone)}>
                        {t('auto.Hammaga')}
                    </button>
                    {ARTICLE_ROLES.map(role => {
                        const isOn = !isForEveryone && draft.roles.includes(role);
                        return (
                            <button
                                key={role}
                                type="button"
                                aria-pressed={isOn}
                                onClick={() => change({ roles: toggleItem(isForEveryone ? [] : draft.roles, role) })}
                                className={chipCls(isOn)}
                            >
                                {labels.role(role)}
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <fieldset>
                <legend className={labelCls}>{t('auto.Javob ostidagi tugmalar')}</legend>
                <div className="flex flex-wrap gap-2">
                    {pathIds.map(id => {
                        const isOn = draft.paths.includes(id);
                        return (
                            <button key={id} type="button" aria-pressed={isOn} onClick={() => change({ paths: toggleItem(draft.paths, id) })} className={chipCls(isOn)}>
                                {labels.path(id)}
                            </button>
                        );
                    })}
                </div>
                <p className={hintCls}>{t("auto.Tanlangan bo'limlar javob tagida tugma bo'lib chiqadi — mijoz bosib, ilovaning o'sha joyiga o'tadi.")}</p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className={labelCls}>
                        {t("auto.Ilovadagi qo'llanma")}
                        <select value={draft.guideId || ''} onChange={event => change({ guideId: event.target.value || null })} className={`${fieldCls} mt-1 w-full font-normal`}>
                            <option value="">{t("auto.Qo'llanmasiz")}</option>
                            {guideIds.map(id => <option key={id} value={id}>{labels.guide(id)}</option>)}
                        </select>
                    </label>
                    <p className={hintCls}>{t("auto.Tanlansa, javobga ilova ichida qadam-baqadam ko'rsatadigan qo'llanma havolasi qo'shiladi.")}</p>
                </div>
                <div className="flex items-start gap-3 sm:pt-6">
                    <Switch checked={draft.active} onChange={isActive => change({ active: isActive })} label={t('auto.Maqola yoqilgan')} />
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('auto.Maqola yoqilgan')}</p>
                        <p className={hintCls}>{t("auto.O'chirilgan maqoladan bot foydalanmaydi, lekin u ro'yxatda qoladi.")}</p>
                    </div>
                </div>
            </div>

            <InlineError error={error} />

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <Button variant="secondary" onClick={onCancel} disabled={isSaving}>{t('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isSaving ? t('auto.Saqlanmoqda...') : t('common.save')}
                </Button>
            </div>
        </div>
    );
};
