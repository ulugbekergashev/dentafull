import React, { useEffect, useState } from 'react';
import { Bot, ExternalLink, Loader2, PowerOff, RefreshCw, Send } from 'lucide-react';
import { Button, Card } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportMode } from '../../services/supportAdmin';
import { ChoiceButtons, ErrorBlock, InlineError, LoadingBlock, Pill, useSupportQuery, useSupportUrl } from './supportUi';
import type { PillTone } from './supportUi';
import { useSupportLabels } from './supportLabels';
import { SupportOverviewStats } from './SupportOverviewStats';

// ─── Yordam boti → Ko'rsatkichlar ────────────────────────────────────────────
// Uch holat:
//   1. Bot yoqilmagan (serverda token yo'q) — nima qilish kerakligi yoziladi.
//   2. Bot ishlayapti, lekin asoschining Telegrami ulanmagan — ulash tugmasi.
//   3. Hammasi joyida — raqamlar.

const PERIODS = [7, 30, 90];

const MODE_TONE: Record<SupportMode, PillTone> = { off: 'red', draft: 'amber', auto: 'green' };

/** Faqat Telegram havolasi ochiladi: server boshqa manzil qaytarsa, unga o'tilmaydi */
const telegramUrl = (raw: string): string | null => {
    try {
        const parsed = new URL(raw);
        const isTelegram = parsed.protocol === 'https:' && ['t.me', 'telegram.me'].includes(parsed.hostname);
        return isTelegram ? parsed.toString() : null;
    } catch {
        return null;
    }
};

const botLink = (username: string | null): string | null => {
    const name = (username || '').replace(/^@/, '');
    return /^[A-Za-z0-9_]{3,64}$/.test(name) ? `https://t.me/${name}` : null;
};

const NotConfigured: React.FC<{ onRecheck: () => void; isChecking: boolean }> = ({ onRecheck, isChecking }) => {
    const { t } = useLanguage();
    const steps = [
        t("auto.Telegramda @BotFather ga yozing, /newbot buyrug'i bilan yangi bot oching va u bergan tokenni nusxalab oling."),
        t("auto.Tokenni serverdagi SUPPORT_BOT_TOKEN o'zgaruvchisiga yozing (Railway → Variables)."),
        t("auto.Serverni qayta ishga tushiring va shu sahifada «Qayta tekshirish»ni bosing."),
    ];
    return (
        <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0">
                    <PowerOff className="w-6 h-6 text-gray-500 dark:text-gray-300" />
                </div>
                <div className="min-w-0">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">{t('auto.Bot hali yoqilmagan')}</h4>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
                        {t("auto.Hozir mijozlar botga yoza olmaydi va bu yerda ko'rsatadigan raqam ham yo'q. Yoqish uchun uch qadam:")}
                    </p>
                    <ol className="mt-4 space-y-3 max-w-2xl">
                        {steps.map((step, index) => (
                            <li key={step} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30 text-xs font-bold text-primary-700 dark:text-primary-300">
                                    {index + 1}
                                </span>
                                <span className="pt-0.5">{step}</span>
                            </li>
                        ))}
                    </ol>
                    <Button variant="secondary" className="mt-5" onClick={onRecheck} disabled={isChecking}>
                        {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        {t('auto.Qayta tekshirish')}
                    </Button>
                </div>
            </div>
        </Card>
    );
};

const LinkOperator: React.FC<{ onRecheck: () => void }> = ({ onRecheck }) => {
    const { t } = useLanguage();
    const [isLinking, setIsLinking] = useState(false);
    const [link, setLink] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);

    // Asoschi Telegramga o'tib, ulab qaytganda sahifa o'zi yangilanadi
    useEffect(() => {
        const handleVisible = () => { if (!document.hidden) onRecheck(); };
        document.addEventListener('visibilitychange', handleVisible);
        return () => document.removeEventListener('visibilitychange', handleVisible);
    }, [onRecheck]);

    const handleLink = async () => {
        setIsLinking(true);
        setError(null);
        try {
            const safe = telegramUrl(await supportAdmin.operatorLink());
            if (!safe) {
                setError(t("auto.Server Telegram havolasini bermadi. Qayta urinib ko'ring."));
                return;
            }
            setLink(safe);
            window.open(safe, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err);
        } finally {
            setIsLinking(false);
        }
    };

    return (
        <Card className="p-6 border-amber-300 dark:border-amber-600/60 bg-amber-50/60 dark:bg-amber-900/10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/40 self-start shrink-0">
                    <Send className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">{t('auto.Telegramingiz ulanmagan')}</h4>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200 max-w-2xl">
                        {t("auto.Bot ishlayapti, lekin o'zi javob bera olmagan savolni kimga yuborishni bilmaydi. Telegramingizni ulang — bunday savollar sizga kela boshlaydi.")}
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
                        {t("auto.Ulagandan keyin mijozlar savoli kelib turishi kerak bo'lgan guruhda (yoki bot bilan shaxsiy yozishmada) /operator deb yozing.")}
                    </p>
                    {link && (
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                            {t('auto.Telegram ochilmadimi?')}{' '}
                            <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                            >
                                {t('auto.Telegramda ochish')} <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </p>
                    )}
                    <InlineError error={error} className="mt-3" />
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch shrink-0">
                    <Button onClick={handleLink} disabled={isLinking}>
                        {isLinking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        {t('auto.Telegramni ulash')}
                    </Button>
                    {link && (
                        <Button variant="secondary" onClick={onRecheck}>
                            <RefreshCw className="w-4 h-4 mr-2" /> {t('auto.Qayta tekshirish')}
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
};

export const SupportOverviewTab: React.FC = () => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const url = useSupportUrl();
    const [days, setDays] = useState(30);
    const overview = useSupportQuery(signal => supportAdmin.overview(days, signal), [days]);

    if (overview.error) return <Card><ErrorBlock error={overview.error} onRetry={overview.reload} /></Card>;
    const data = overview.data;
    if (!data) return <Card><LoadingBlock /></Card>;
    if (!data.configured) return <NotConfigured onRecheck={overview.reload} isChecking={overview.isLoading} />;

    const botUrl = botLink(data.botUsername);
    const hasNumbers = data.operatorLinked || data.stats.tickets > 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Bot className="w-4 h-4 text-gray-400" />
                    {data.botUsername && (
                        botUrl ? (
                            <a href={botUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-800 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 hover:underline">
                                @{data.botUsername.replace(/^@/, '')}
                            </a>
                        ) : (
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{data.botUsername}</span>
                        )
                    )}
                    <Pill tone={MODE_TONE[data.mode]}>{labels.mode(data.mode)}</Pill>
                    {data.mode === 'off' && (
                        <span className="text-gray-600 dark:text-gray-300">
                            {t('auto.Bot hozir mijozlarga javob bermayapti.')}{' '}
                            <button type="button" onClick={() => url.update({ view: 'settings' })} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                                {t('auto.Sozlamalarda yoqish')}
                            </button>
                        </span>
                    )}
                </div>
                {hasNumbers && (
                    <div className="sm:ml-auto">
                        <ChoiceButtons
                            value={days}
                            onChange={setDays}
                            ariaLabel={t('auto.Davr')}
                            options={PERIODS.map(period => ({ value: period, label: t('auto.{n} kun').replace('{n}', String(period)) }))}
                        />
                    </div>
                )}
            </div>

            {!data.operatorLinked && <LinkOperator onRecheck={overview.reload} />}

            {hasNumbers && (
                <div className={overview.isLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                    <SupportOverviewStats data={data} days={days} />
                </div>
            )}
        </div>
    );
};
