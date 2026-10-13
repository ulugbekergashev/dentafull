import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, FileText, Image as ImageIcon, Loader2, MessageSquare, Mic, Phone, Send, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Card } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportMessage, SupportTicketUser } from '../../services/supportAdmin';
import { EmptyBlock, ErrorBlock, InlineError, LoadingBlock, Pill, formatDay, formatTime, useSupportQuery } from './supportUi';
import { useSupportLabels } from './supportLabels';

// ─── Murojaat suhbati ────────────────────────────────────────────────────────
// Mijoz chapda, bot va asoschi o'ngda. Qoralama (hali mijozga ketmagan javob)
// uzuq chiziqli ramkada, tizim qaydlari o'rtada kichik yozuv bo'lib turadi —
// mijoz aynan nimani ko'rgani bir qarashda bilinishi kerak.

const BUBBLE_BASE = 'max-w-[85%] sm:max-w-[75%] px-3.5 py-2 rounded-2xl text-sm';

const BUBBLE_TONE: Record<string, string> = {
    user: 'rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100',
    bot: 'rounded-br-md bg-primary-50 text-gray-900 border border-primary-100 dark:bg-primary-900/30 dark:text-gray-100 dark:border-primary-800/60',
    operator: 'rounded-br-md bg-primary-600 text-white',
    draft: 'rounded-br-md bg-amber-50 text-gray-900 border border-dashed border-amber-400 dark:bg-amber-900/20 dark:text-gray-100 dark:border-amber-500/70',
};

const telegramProfile = (username: string | null): string | null => {
    const name = (username || '').replace(/^@/, '');
    return /^[A-Za-z0-9_]{3,64}$/.test(name) ? `https://t.me/${name}` : null;
};

const phoneLink = (phone: string | null): string | null => {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 9 ? `tel:+${digits}` : null;
};

const UserFacts: React.FC<{ user: SupportTicketUser }> = ({ user }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const profile = telegramProfile(user.tgUsername);
    const phone = phoneLink(user.phone);
    const name = user.staffName || user.tgName;
    const role = labels.role(user.role);

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
            {(name || role) && (
                <span className="font-medium text-gray-800 dark:text-gray-100">{[name, role].filter(Boolean).join(' · ')}</span>
            )}
            {user.tgUsername && (
                profile ? (
                    <a href={profile} target="_blank" rel="noopener noreferrer" title={t('auto.Telegramda ochish')} className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline">
                        <Send className="w-3 h-3" /> @{user.tgUsername.replace(/^@/, '')}
                    </a>
                ) : (
                    <span>{user.tgUsername}</span>
                )
            )}
            {user.phone && (
                phone ? (
                    <a href={phone} className="inline-flex items-center gap-1 hover:underline"><Phone className="w-3 h-3" /> {user.phone}</a>
                ) : (
                    <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {user.phone}</span>
                )
            )}
            {user.verifiedVia ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> {t('auto.Kimligi tasdiqlangan')}
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="w-3.5 h-3.5" /> {t('auto.Kimligi tasdiqlanmagan')}
                </span>
            )}
        </div>
    );
};

const MessageBubble: React.FC<{ message: SupportMessage }> = ({ message }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();

    if (message.author === 'system') {
        return (
            <div className="flex justify-center">
                <span className="max-w-[90%] px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/60 text-center text-xs text-gray-500 dark:text-gray-400 break-words">
                    {message.text || '—'} · {formatTime(message.createdAt)}
                </span>
            </div>
        );
    }

    const isDraft = message.kind === 'draft';
    const isUser = message.author === 'user';
    const tone = isDraft ? BUBBLE_TONE.draft : BUBBLE_TONE[message.author] || BUBBLE_TONE.user;
    const isSolid = !isDraft && message.author === 'operator';

    const attachments: Record<string, { icon: LucideIcon; label: string }> = {
        voice: { icon: Mic, label: t('auto.Ovozli xabar') },
        photo: { icon: ImageIcon, label: t('auto.Rasm') },
        document: { icon: FileText, label: t('auto.Fayl') },
    };
    const attachment = attachments[message.kind];
    const AttachmentIcon = attachment?.icon;

    const authorLabel = isUser ? '' : message.author === 'operator' ? t('auto.Siz') : t('auto.Bot');
    const draftState = isDraft ? labels.draftState(message.state) : '';
    const caption = isDraft
        ? [t('auto.Qoralama'), draftState || t('auto.mijozga yuborilmagan')].join(' — ')
        : authorLabel;

    return (
        <div className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}>
            {caption && (
                <span className={`mb-0.5 px-1 text-[11px] font-medium ${isDraft ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400'}`}>{caption}</span>
            )}
            <div className={`${BUBBLE_BASE} ${tone} ${message.kind === 'card' ? 'border-l-4 border-l-primary-400' : ''}`}>
                {attachment && AttachmentIcon && (
                    <p className={`flex items-center gap-1.5 text-xs font-semibold ${isSolid ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'} ${message.text ? 'mb-1' : ''}`}>
                        <AttachmentIcon className="w-3.5 h-3.5" /> {attachment.label}
                    </p>
                )}
                {message.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>}
                {!message.text && !attachment && <p className="text-gray-400">—</p>}
            </div>
            <span className="mt-0.5 px-1 text-[11px] tabular-nums text-gray-400">{formatTime(message.createdAt)}</span>
        </div>
    );
};

export const SupportTicketChat: React.FC<{ ticketId: string; onBack: () => void; onChanged: () => void }> = ({ ticketId, onBack, onChanged }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const detail = useSupportQuery(signal => supportAdmin.ticket(ticketId, signal), [ticketId]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [closeError, setCloseError] = useState<unknown>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const messageCount = detail.data?.messages.length ?? 0;
    // Suhbat ochilganda oxirgi xabar ko'rinib turadi
    useEffect(() => {
        const box = scrollRef.current;
        if (box) box.scrollTop = box.scrollHeight;
    }, [messageCount]);

    const handleCloseTicket = async () => {
        setIsClosing(true);
        setCloseError(null);
        try {
            await supportAdmin.closeTicket(ticketId);
            setIsConfirming(false);
            detail.reload();
            onChanged();
        } catch (err) {
            setCloseError(err);
        } finally {
            setIsClosing(false);
        }
    };

    // Telefonda suhbat ro'yxat o'rnini egallaydi — qaytish tugmasi matnli.
    // Keng ekranda ro'yxat yonida turadi, shuning uchun kichik "x" yetarli.
    const mobileBack = (
        <button type="button" onClick={onBack} className="lg:hidden inline-flex items-center gap-1 text-sm font-semibold text-primary-600 dark:text-primary-400">
            <ChevronLeft className="w-4 h-4" /> {t("auto.Ro'yxatga qaytish")}
        </button>
    );
    const desktopBack = (
        <button
            type="button"
            onClick={onBack}
            aria-label={t("auto.Ro'yxatga qaytish")}
            title={t("auto.Ro'yxatga qaytish")}
            className="hidden lg:inline-flex shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
            <X className="w-4 h-4" />
        </button>
    );
    const backBar = <div className="p-3 flex justify-between lg:justify-end">{mobileBack}{desktopBack}</div>;

    if (detail.error) {
        return (
            <Card className="overflow-hidden">
                {backBar}
                <ErrorBlock error={detail.error} onRetry={detail.reload} />
            </Card>
        );
    }
    const data = detail.data;
    if (!data) {
        return (
            <Card className="overflow-hidden">
                {backBar}
                <LoadingBlock />
            </Card>
        );
    }

    const { ticket, user, messages } = data;
    const clinicName = user.clinicName || ticket.clinicName;
    const isClosed = ticket.status === 'closed';

    return (
        // Keng ekranda suhbat ro'yxat yonida yopishib turadi: pastdagi murojaat
        // bosilganda ham ko'rinadi (ilovaning yuqori paneli balandligi — 7rem).
        <Card className="overflow-hidden flex flex-col lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        {mobileBack}
                        <h4 className={`font-bold truncate ${clinicName ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                            {clinicName || t('auto.Klinika aniqlanmagan')}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2">
                            <Pill tone={labels.ticketStatusTone(ticket.status)}>{labels.ticketStatus(ticket.status)}</Pill>
                            {ticket.categoryLabel && <Pill>{ticket.categoryLabel}</Pill>}
                            {ticket.code && <span className="font-mono text-[11px] text-gray-400">{ticket.code}</span>}
                        </div>
                    </div>
                    {desktopBack}
                </div>
                <UserFacts user={user} />
                {ticket.subject && <p className="text-sm text-gray-700 dark:text-gray-200 break-words">{ticket.subject}</p>}
            </div>

            <div ref={scrollRef} className="flex-1 max-h-[60vh] lg:max-h-none min-h-[220px] overflow-y-auto p-4 space-y-3 bg-gray-50/60 dark:bg-gray-900/30">
                {messages.length === 0 ? (
                    <EmptyBlock icon={MessageSquare} title={t("auto.Bu murojaatda xabar yo'q")} className="py-8" />
                ) : (
                    messages.map((message, index) => {
                        const day = formatDay(message.createdAt);
                        const isNewDay = index === 0 || day !== formatDay(messages[index - 1].createdAt);
                        return (
                            <React.Fragment key={message.id}>
                                {isNewDay && (
                                    <div className="flex items-center gap-3 text-[11px] font-medium text-gray-400">
                                        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                        {day}
                                        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                    </div>
                                )}
                                <MessageBubble message={message} />
                            </React.Fragment>
                        );
                    })
                )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
                {isClosed ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('auto.Bu murojaat yopilgan')}</p>
                ) : isConfirming ? (
                    <>
                        <p className="text-sm text-gray-700 dark:text-gray-200">{t('auto.Murojaat yopilsinmi?')}</p>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)} disabled={isClosing}>
                                {t('common.cancel')}
                            </Button>
                            <Button variant="danger" size="sm" onClick={handleCloseTicket} disabled={isClosing}>
                                {isClosing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                                {t('auto.Ha, yopilsin')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{t("auto.Mijozga javob Telegramda yoziladi — bu yerda suhbatni faqat ko'rasiz")}</p>
                        <Button variant="secondary" size="sm" onClick={() => setIsConfirming(true)}>
                            {t('auto.Yopish')}
                        </Button>
                    </>
                )}
                <InlineError error={closeError} className="w-full" />
            </div>
        </Card>
    );
};
