import React from 'react';
import { ArrowRight, BookOpen, CheckCircle, HelpCircle, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Card } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import type { SupportCategoryRow, SupportOverview } from '../../services/supportAdmin';
import { EmptyBlock, Pill, formatWhen, percent, useSupportUrl } from './supportUi';

// ─── Ko'rsatkichlar: raqamlar, mavzular, maqolalar, javobsiz savollar ────────

/** 45 soniya · 12 daqiqa · 2 soat 5 daqiqa */
function useDuration() {
    const { t } = useLanguage();
    return (seconds: number): string => {
        if (seconds < 60) return t('auto.{n} soniya').replace('{n}', String(Math.round(seconds)));
        if (seconds < 3600) return t('auto.{n} daqiqa').replace('{n}', String(Math.round(seconds / 60)));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return t('auto.{h} soat {m} daqiqa').replace('{h}', String(hours)).replace('{m}', String(minutes));
    };
}

const CategoryRow: React.FC<{ row: SupportCategoryRow }> = ({ row }) => {
    const { t } = useLanguage();
    const accepted = row.acceptRate === null ? null : percent(row.acceptRate);
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td className="p-3 font-medium text-gray-900 dark:text-white">{row.label}</td>
            <td className="p-3 text-right font-bold tabular-nums text-gray-900 dark:text-white">{row.total}</td>
            <td className="p-3">
                <Pill tone={row.mode === 'auto' ? 'green' : 'amber'}>
                    {row.mode === 'auto' ? t("auto.Bot o'zi javob beradi") : t('auto.Siz tasdiqlaysiz')}
                </Pill>
                {row.setting !== 'rule' && (
                    <span className="ml-2 text-xs text-gray-400">{t("auto.qo'lda belgilangan")}</span>
                )}
            </td>
            <td className="p-3">
                {accepted === null ? (
                    <span className="text-xs text-gray-400">{t("auto.hali qoralama bo'lmagan")}</span>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-24 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full ${accepted >= 80 ? 'bg-emerald-500' : accepted >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${accepted}%` }}
                            />
                        </div>
                        <span className="w-10 text-sm font-bold tabular-nums text-gray-900 dark:text-white">{accepted}%</span>
                        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                            {t('auto.{a} / {b} ta qoralama').replace('{a}', String(row.unedited)).replace('{b}', String(row.drafts))}
                        </span>
                    </div>
                )}
            </td>
        </tr>
    );
};

export const SupportOverviewStats: React.FC<{ data: SupportOverview; days: number }> = ({ data, days }) => {
    const { t } = useLanguage();
    const url = useSupportUrl();
    const duration = useDuration();
    const { stats } = data;

    const autoShare = percent(stats.autoRate);
    const rated = stats.positive + stats.negative;
    const likedShare = rated > 0 ? Math.round((stats.positive / rated) * 100) : 0;
    const hasTickets = stats.tickets > 0;
    const hasWaiting = stats.waiting > 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Asosiy raqam: bot asoschining qancha ishini o'z zimmasiga oldi */}
                <Card className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-none">
                    <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                            <p className="text-indigo-100 font-medium">{t('auto.Sizsiz hal qilingan')}</p>
                            <h3 className="text-4xl font-bold mt-2 tabular-nums">{hasTickets ? `${autoShare}%` : '—'}</h3>
                        </div>
                        <div className="p-3 bg-white/10 rounded-full backdrop-blur-sm shrink-0">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                    </div>
                    <div className="mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full rounded-full bg-white" style={{ width: `${hasTickets ? autoShare : 0}%` }} />
                    </div>
                    <p className="text-xs text-indigo-100 mt-3">
                        {t("auto.{a} tasini bot o'zi yopdi, {b} tasiga siz javob berdingiz")
                            .replace('{a}', String(stats.botResolved))
                            .replace('{b}', String(stats.humanResolved))}
                    </p>
                </Card>

                <Card className="p-6">
                    <p className="text-gray-500 dark:text-gray-400 font-medium">{t('auto.Murojaatlar')}</p>
                    <h3 className="text-3xl font-bold mt-2 text-gray-900 dark:text-white tabular-nums">{stats.tickets}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {t('auto.oxirgi {n} kunda').replace('{n}', String(days))}
                        {' · '}
                        {t('auto.hozir ochiq: {n}').replace('{n}', String(stats.open))}
                    </p>
                </Card>

                {/* Karta — tugma: bosilsa, javob kutayotgan murojaatlar ro'yxati ochiladi */}
                <button
                    type="button"
                    onClick={() => url.update({ view: 'tickets', status: 'waiting_operator', ticket: null })}
                    className={`group flex flex-col justify-start p-6 text-left bg-white dark:bg-gray-800 rounded-2xl border shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${hasWaiting
                        ? 'border-amber-300 dark:border-amber-600/60'
                        : 'border-gray-200 dark:border-gray-700'}`}
                >
                    <span className="block text-gray-500 dark:text-gray-400 font-medium">{t('auto.Sizni kutmoqda')}</span>
                    <span className={`block text-3xl font-bold mt-2 tabular-nums ${hasWaiting ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {stats.waiting}
                    </span>
                    <span className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                        {hasWaiting ? t("auto.Javobingizni kutayotgan murojaatlarni ko'rish") : t("auto.Hozir javobingizni kutayotgan murojaat yo'q")}
                        {hasWaiting && <ArrowRight className="w-3 h-3" />}
                    </span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('auto.Mijozlar bahosi')}</p>
                    <div className="mt-2 flex items-end gap-5">
                        <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                            <ThumbsUp className="w-5 h-5" /> {stats.positive}
                        </span>
                        <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                            <ThumbsDown className="w-5 h-5" /> {stats.negative}
                        </span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        {rated > 0 && <div className="h-full rounded-full bg-emerald-500" style={{ width: `${likedShare}%` }} />}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        {rated > 0
                            ? t('auto.Baho berganlarning {n}% iga javob yoqqan').replace('{n}', String(likedShare))
                            : t('auto.Hali hech kim baho bermagan')}
                    </p>
                </Card>

                <Card className="p-5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('auto.Birinchi javobgacha')}</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-primary-600 dark:text-primary-400">
                        {hasTickets ? duration(stats.avgFirstReplySec) : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">{t("auto.Mijoz yozganidan birinchi javob kelguncha o'rtacha shuncha vaqt o'tadi")}</p>
                </Card>
            </div>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h4 className="font-bold text-gray-900 dark:text-white">{t("auto.Mavzular bo'yicha")}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
                            {t("auto.Bot yozgan qoralamani tuzatmasdan yuborsangiz, demak u bu mavzuni yaxshi biladi. Ulushi yuqori mavzuni botning o'ziga ishonib topshirsa bo'ladi.")}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => url.update({ view: 'settings' })}
                        className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap"
                    >
                        {t("auto.Sozlamalarda o'zgartirish")}
                    </button>
                </div>
                {data.byCategory.length === 0 ? (
                    <EmptyBlock icon={HelpCircle} title={t("auto.Bu davrda murojaat bo'lmagan")} className="py-8" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Mavzu')}</th>
                                    <th className="p-3 font-medium text-gray-500 text-right">{t('auto.Murojaatlar')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Kim javob beradi')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Tuzatmasdan yuborilgan')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {data.byCategory.map(row => <CategoryRow key={row.category} row={row} />)}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-bold text-gray-900 dark:text-white">{t("auto.Eng ko'p ishlatilgan maqolalar")}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t("auto.Bot javob berishda shulardan ko'p foydalangan")}</p>
                    </div>
                    {data.topArticles.length === 0 ? (
                        <EmptyBlock icon={BookOpen} title={t('auto.Bot hali birorta maqoladan foydalanmagan')} className="py-8" />
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                            {data.topArticles.map(article => (
                                <li key={article.id}>
                                    <button
                                        type="button"
                                        onClick={() => url.update({ view: 'kb', article: article.id })}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800/50"
                                    >
                                        <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-gray-100">{article.title}</span>
                                        <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                            {t('auto.{n} marta').replace('{n}', String(article.uses))}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card className="overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="font-bold text-gray-900 dark:text-white">{t('auto.Bot javob bera olmagan savollar')}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t("auto.Shu mavzularda bilim bazasiga maqola qo'shsangiz, keyingi safar bot o'zi javob beradi")}</p>
                    </div>
                    {data.unanswered.length === 0 ? (
                        <EmptyBlock icon={CheckCircle} title={t("auto.Javobsiz qolgan savol yo'q")} className="py-8" />
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                            {data.unanswered.map((question, index) => (
                                <li key={`${question.ticketId}-${index}`}>
                                    <button
                                        type="button"
                                        onClick={() => url.update({ view: 'tickets', ticket: question.ticketId, status: null })}
                                        disabled={!question.ticketId}
                                        title={t('auto.Suhbatni ochish')}
                                        className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800/50"
                                    >
                                        <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-100 line-clamp-2 break-words">{question.text}</span>
                                        <span className="text-xs text-gray-400 whitespace-nowrap pt-0.5">{formatWhen(question.createdAt)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    );
};
