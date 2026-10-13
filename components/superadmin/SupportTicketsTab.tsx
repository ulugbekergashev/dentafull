import React, { useEffect, useState } from 'react';
import { Inbox, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, Card } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportTicket } from '../../services/supportAdmin';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pill, fieldCls, formatRecent, useSupportQuery, useSupportUrl } from './supportUi';
import { TICKET_STATUSES, ratingSign, useSupportLabels } from './supportLabels';
import { SupportTicketChat } from './SupportTicketChat';

// ─── Yordam boti → Murojaatlar ───────────────────────────────────────────────
// Chapda ro'yxat, o'ngda tanlangan suhbat. Telefonda suhbat ro'yxat o'rnini
// egallaydi. Holat filtri va ochiq murojaat manzilda turadi — Ko'rsatkichlardagi
// "Sizni kutmoqda" kartasi va javobsiz savollar shu yerga havola qiladi.

const SEARCH_DELAY_MS = 400;

const TicketRow: React.FC<{ ticket: SupportTicket; isSelected: boolean; onOpen: () => void }> = ({ ticket, isSelected, onOpen }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const rating = ratingSign(ticket.rating);
    const who = [ticket.userName, labels.role(ticket.role)].filter(Boolean).join(' · ');

    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${isSelected
                    ? 'bg-primary-50 dark:bg-primary-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}
            >
                <div className="flex items-baseline justify-between gap-3">
                    <span className={`min-w-0 truncate text-sm font-semibold ${ticket.clinicName ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                        {ticket.clinicName || t('auto.Klinika aniqlanmagan')}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-400">{formatRecent(ticket.updatedAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300 line-clamp-2 break-words">
                    {ticket.subject || ticket.lastText || '—'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Pill tone={labels.ticketStatusTone(ticket.status)}>{labels.ticketStatus(ticket.status)}</Pill>
                    {ticket.categoryLabel && <Pill>{ticket.categoryLabel}</Pill>}
                    {rating === 'up' && <ThumbsUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-label={t('auto.Javob yoqqan')} />}
                    {rating === 'down' && <ThumbsDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" aria-label={t('auto.Javob yoqmagan')} />}
                    {who && <span className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">{who}</span>}
                    {ticket.code && <span className="ml-auto font-mono text-[11px] text-gray-400">{ticket.code}</span>}
                </div>
            </button>
        </li>
    );
};

export const SupportTicketsTab: React.FC = () => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const url = useSupportUrl();
    const status = url.get('status');
    const ticketId = url.get('ticket');

    const [search, setSearch] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);

    // Qidiruv har harfda emas — yozib bo'lgach ketadi
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(search.trim());
            setPage(1);
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [search]);

    const tickets = useSupportQuery(
        signal => supportAdmin.tickets({ status, q: searchQuery, page }, signal),
        [status, searchQuery, page],
    );

    const handleStatus = (next: string) => {
        setPage(1);
        url.update({ status: next || null });
    };

    const list = tickets.data;
    const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
    const isFiltered = Boolean(status || searchQuery);

    return (
        <div className={ticketId ? 'grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start' : ''}>
            <Card className={`overflow-hidden ${ticketId ? 'hidden lg:block' : ''}`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="search"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t("auto.Klinika, ism yoki matn bo'yicha qidirish")}
                            aria-label={t("auto.Klinika, ism yoki matn bo'yicha qidirish")}
                            className={`${fieldCls} w-full pl-9`}
                        />
                    </div>
                    <select
                        value={status}
                        onChange={event => handleStatus(event.target.value)}
                        aria-label={t('auto.Holat')}
                        className={fieldCls}
                    >
                        <option value="">{t('auto.Barcha holatlar')}</option>
                        {TICKET_STATUSES.map(id => <option key={id} value={id}>{labels.ticketStatus(id)}</option>)}
                    </select>
                </div>

                {tickets.error ? (
                    <ErrorBlock error={tickets.error} onRetry={tickets.reload} />
                ) : !list ? (
                    <LoadingBlock />
                ) : list.items.length === 0 ? (
                    <EmptyBlock
                        icon={Inbox}
                        title={isFiltered ? t('auto.Bunday murojaat topilmadi') : t("auto.Hali murojaat yo'q")}
                        hint={isFiltered
                            ? t("auto.Qidiruv so'zini yoki holatni o'zgartirib ko'ring")
                            : t("auto.Mijoz botga yozishi bilan murojaat shu yerda paydo bo'ladi")}
                    />
                ) : (
                    <ul className={`divide-y divide-gray-100 dark:divide-gray-700 transition-opacity ${tickets.isLoading ? 'opacity-60' : ''}`}>
                        {list.items.map(ticket => (
                            <TicketRow
                                key={ticket.id}
                                ticket={ticket}
                                isSelected={ticket.id === ticketId}
                                onOpen={() => url.update({ ticket: ticket.id })}
                            />
                        ))}
                    </ul>
                )}

                {list && list.total > 0 && (
                    <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {t('auto.Jami: {n} ta · sahifa {p} / {t}')
                                .replace('{n}', String(list.total))
                                .replace('{p}', String(page))
                                .replace('{t}', String(totalPages))}
                        </div>
                        {totalPages > 1 && (
                            <div className="flex gap-2">
                                <Button variant="secondary" size="sm" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}>
                                    {t('auto.Ortga')}
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                                    {t('auto.Oldinga')}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {ticketId && (
                <SupportTicketChat
                    key={ticketId}
                    ticketId={ticketId}
                    onBack={() => url.update({ ticket: null })}
                    onChanged={tickets.reload}
                />
            )}
        </div>
    );
};
