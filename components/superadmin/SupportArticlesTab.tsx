import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Button, Card, Modal } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportArticle } from '../../services/supportAdmin';
import { EmptyBlock, ErrorBlock, InlineError, LoadingBlock, Pill, Switch, fieldCls, useSupportQuery, useSupportUrl } from './supportUi';
import { ARTICLE_MODULES, useSupportLabels } from './supportLabels';
import { SupportArticleForm, toArticleInput } from './SupportArticleForm';

// ─── Yordam boti → Bilim bazasi ──────────────────────────────────────────────
// Bot javobni shu maqolalardan oladi. Ochiq maqola manzilda turadi
// (`article=<kod>` yoki `article=new`) — Ko'rsatkichlardagi "eng ko'p
// ishlatilgan maqolalar" shu yerga havola qiladi.

const SEARCH_DELAY_MS = 400;
const NEW_ARTICLE = 'new';

const ArticleRow: React.FC<{
    article: SupportArticle;
    isBusy: boolean;
    onOpen: () => void;
    onToggle: (isActive: boolean) => void;
}> = ({ article, isBusy, onOpen, onToggle }) => {
    const { t, language } = useLanguage();
    const labels = useSupportLabels();
    const title = language === 'ru' ? article.titleRu || article.titleUz : article.titleUz || article.titleRu;
    const isMissingRu = !article.titleRu.trim() || !article.bodyRu.trim();
    const isMissingUz = !article.titleUz.trim() || !article.bodyUz.trim();

    return (
        <li className={`flex items-center gap-3 px-4 py-3 ${article.active ? '' : 'bg-gray-50/70 dark:bg-gray-900/20'}`}>
            <button
                type="button"
                onClick={onOpen}
                className="flex-1 min-w-0 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
                <span className={`block truncate text-sm font-semibold ${article.active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                    {title || article.id}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Pill tone="blue">{labels.module(article.module)}</Pill>
                    <Pill tone={article.source === 'learned' ? 'violet' : 'gray'}>
                        {article.source === 'learned' ? t("auto.Bot o'rgangan") : t("auto.Boshlang'ich")}
                    </Pill>
                    {!article.active && <Pill tone="red">{t("auto.O'chirib qo'yilgan")}</Pill>}
                    {isMissingRu && <Pill tone="amber">{t("auto.Ruschasi yo'q")}</Pill>}
                    {isMissingUz && <Pill tone="amber">{t("auto.O'zbekchasi yo'q")}</Pill>}
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        {article.uses > 0 ? t('auto.{n} marta ishlatilgan').replace('{n}', String(article.uses)) : t('auto.hali ishlatilmagan')}
                    </span>
                </span>
            </button>
            <Switch
                checked={article.active}
                onChange={onToggle}
                disabled={isBusy}
                label={article.active ? t('auto.Bot bu maqoladan foydalanadi') : t('auto.Bot bu maqoladan foydalanmaydi')}
            />
        </li>
    );
};

export const SupportArticlesTab: React.FC = () => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const url = useSupportUrl();
    const openId = url.get('article');

    const [search, setSearch] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [moduleId, setModuleId] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toggleError, setToggleError] = useState<unknown>(null);

    useEffect(() => {
        const timer = setTimeout(() => setSearchQuery(search.trim()), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [search]);

    const articles = useSupportQuery(
        signal => supportAdmin.articles({ q: searchQuery, module: moduleId }, signal),
        [searchQuery, moduleId],
    );
    const items = articles.data;

    // Server ro'yxatida notanish bo'lim bo'lsa, u ham filtrda ko'rinadi
    const moduleIds = Array.from(new Set([...ARTICLE_MODULES, ...(items || []).map(article => article.module)]));

    const handleToggle = async (article: SupportArticle, isActive: boolean) => {
        setBusyId(article.id);
        setToggleError(null);
        try {
            if (isActive) await supportAdmin.saveArticle(article.id, { ...toArticleInput(article), active: true });
            else await supportAdmin.disableArticle(article.id);
            articles.reload();
        } catch (err) {
            setToggleError(err);
        } finally {
            setBusyId(null);
        }
    };

    const closeEditor = () => url.update({ article: null });
    const isCreating = openId === NEW_ARTICLE;
    const openArticle = openId && !isCreating ? (items || []).find(article => article.id === openId) || null : null;
    const isFiltered = Boolean(searchQuery || moduleId);

    return (
        <div className="space-y-4">
            <Card className="overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="search"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t("auto.Sarlavha yoki kalit so'z bo'yicha qidirish")}
                            aria-label={t("auto.Sarlavha yoki kalit so'z bo'yicha qidirish")}
                            className={`${fieldCls} w-full pl-9`}
                        />
                    </div>
                    <select value={moduleId} onChange={event => setModuleId(event.target.value)} aria-label={t("auto.Bo'lim")} className={fieldCls}>
                        <option value="">{t("auto.Barcha bo'limlar")}</option>
                        {moduleIds.map(id => <option key={id} value={id}>{labels.module(id)}</option>)}
                    </select>
                    <Button onClick={() => url.update({ article: NEW_ARTICLE })}>
                        <Plus className="w-4 h-4 mr-2" /> {t('auto.Yangi maqola')}
                    </Button>
                </div>

                <InlineError error={toggleError} className="px-4 pt-3" />

                {articles.error ? (
                    <ErrorBlock error={articles.error} onRetry={articles.reload} />
                ) : !items ? (
                    <LoadingBlock />
                ) : items.length === 0 ? (
                    <EmptyBlock
                        icon={BookOpen}
                        title={isFiltered ? t('auto.Bunday maqola topilmadi') : t("auto.Bilim bazasi bo'sh")}
                        hint={isFiltered
                            ? t("auto.Qidiruv so'zini yoki bo'limni o'zgartirib ko'ring")
                            : t("auto.Bot javobni shu yerdagi maqolalardan oladi. Birinchi maqolani qo'shing.")}
                    />
                ) : (
                    <ul className={`divide-y divide-gray-100 dark:divide-gray-700 transition-opacity ${articles.isLoading ? 'opacity-60' : ''}`}>
                        {items.map(article => (
                            <ArticleRow
                                key={article.id}
                                article={article}
                                isBusy={busyId === article.id}
                                onOpen={() => url.update({ article: article.id })}
                                onToggle={isActive => handleToggle(article, isActive)}
                            />
                        ))}
                    </ul>
                )}

                {items && items.length > 0 && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                        {t('auto.Jami: {n} ta maqola').replace('{n}', String(items.length))}
                    </div>
                )}
            </Card>

            <Modal
                isOpen={Boolean(openId)}
                onClose={closeEditor}
                title={isCreating ? t('auto.Yangi maqola') : t('auto.Maqolani tahrirlash')}
                className="max-w-5xl"
            >
                {isCreating || openArticle ? (
                    <SupportArticleForm
                        key={openId}
                        article={openArticle}
                        onCancel={closeEditor}
                        onSaved={() => { closeEditor(); articles.reload(); }}
                    />
                ) : articles.error ? (
                    <ErrorBlock error={articles.error} onRetry={articles.reload} />
                ) : !items ? (
                    <LoadingBlock />
                ) : (
                    <EmptyBlock
                        icon={BookOpen}
                        title={t('auto.Bu maqola topilmadi')}
                        hint={t("auto.U o'chirilgan yoki hozirgi qidiruvga tushmagan bo'lishi mumkin")}
                    >
                        <Button variant="secondary" size="sm" className="mt-2" onClick={closeEditor}>{t('auto.Yopish')}</Button>
                    </EmptyBlock>
                )}
            </Modal>
        </div>
    );
};
