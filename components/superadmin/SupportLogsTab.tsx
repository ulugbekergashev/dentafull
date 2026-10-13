import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, Receipt } from 'lucide-react';
import { Card } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { supportAdmin } from '../../services/supportAdmin';
import type { SupportDiagEvent, SupportPayment } from '../../services/supportAdmin';
import { ChoiceButtons, EmptyBlock, ErrorBlock, LoadingBlock, Pill, fieldCls, formatDay, formatWhen, useSupportQuery } from './supportUi';
import { DIAG_KINDS, useSupportLabels } from './supportLabels';

// ─── Yordam boti → Qaydlar ───────────────────────────────────────────────────
// Ikki ro'yxat: klinikalarda qayd etilgan nosozliklar va obuna to'lovlari.
// Klinika filtri ikkalasiga birdek ta'sir qiladi — "shu klinikada nima bo'ldi?"
// degan savolga bitta tanlov bilan javob olinadi.

const PERIODS = [1, 7, 30];
const LONG_MESSAGE_LENGTH = 160;

type ClinicNames = Record<string, string>;

/** Yangi ko'ringan klinikalarni ro'yxatga qo'shadi; o'zgarish bo'lmasa o'sha obyektni qaytaradi */
const withClinics = (known: ClinicNames, rows: { clinicId: string | null; clinicName: string | null }[]): ClinicNames => {
    const fresh = rows.filter(row => row.clinicId && row.clinicName && known[row.clinicId] !== row.clinicName);
    if (fresh.length === 0) return known;
    return fresh.reduce<ClinicNames>((next, row) => ({ ...next, [row.clinicId as string]: row.clinicName as string }), known);
};

const DiagRow: React.FC<{ event: SupportDiagEvent }> = ({ event }) => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const [isExpanded, setIsExpanded] = useState(false);
    const message = event.message || '';
    const isLong = message.length > LONG_MESSAGE_LENGTH;

    return (
        <li className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Pill tone={labels.diagTone(event.kind)}>{labels.diagKind(event.kind)}</Pill>
                <span className={`min-w-0 truncate text-sm font-semibold ${event.clinicName ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                    {event.clinicName || t('auto.Klinika aniqlanmagan')}
                </span>
                <span className="ml-auto text-xs tabular-nums text-gray-400 whitespace-nowrap">{formatWhen(event.createdAt)}</span>
            </div>
            {event.subject && <p className="mt-1 text-sm text-gray-700 dark:text-gray-200 break-words">{event.subject}</p>}
            {message && (
                <p className={`mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words ${isLong && !isExpanded ? 'line-clamp-2' : ''}`}>
                    {message}
                </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-400">
                {event.count > 1 && (
                    <span className="tabular-nums">
                        {t('auto.{n} marta takrorlangan, oxirgisi {d}')
                            .replace('{n}', String(event.count))
                            .replace('{d}', formatWhen(event.lastAt || event.createdAt))}
                    </span>
                )}
                {isLong && (
                    <button type="button" onClick={() => setIsExpanded(current => !current)} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                        {isExpanded ? t('auto.Qisqartirish') : t("auto.To'liq ko'rsatish")}
                    </button>
                )}
            </div>
        </li>
    );
};

const PaymentRow: React.FC<{ payment: SupportPayment }> = ({ payment }) => {
    const { t } = useLanguage();
    const term = payment.months
        ? t('auto.{n} oy').replace('{n}', String(payment.months))
        : payment.days
            ? t('auto.{n} kun').replace('{n}', String(payment.days))
            : '—';

    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
            <td className="p-3 text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatWhen(payment.createdAt)}</td>
            <td className="p-3 font-medium text-gray-900 dark:text-white">{payment.clinicName || '—'}</td>
            <td className="p-3">
                <Pill tone={payment.kind === 'trust' ? 'amber' : 'green'}>
                    {payment.kind === 'trust' ? t("auto.Chek bo'yicha ochilgan") : t("auto.To'lov")}
                </Pill>
            </td>
            <td className="p-3">
                <div className="font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">{term}</div>
                {(payment.fromExpiry || payment.toExpiry) && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDay(payment.fromExpiry)} <ArrowRight className="w-3 h-3" /> {formatDay(payment.toExpiry)}
                    </div>
                )}
            </td>
            <td className="p-3 text-right font-bold tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                {payment.amount === null ? '—' : `${payment.amount.toLocaleString('ru-RU')} UZS`}
            </td>
            <td className="p-3 text-gray-600 dark:text-gray-300">{payment.approvedBy || '—'}</td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 break-words max-w-xs">{payment.note || ''}</td>
        </tr>
    );
};

export const SupportLogsTab: React.FC = () => {
    const { t } = useLanguage();
    const labels = useSupportLabels();
    const [clinicId, setClinicId] = useState('');
    const [kind, setKind] = useState('');
    const [days, setDays] = useState(7);
    const [clinics, setClinics] = useState<ClinicNames>({});

    const diag = useSupportQuery(signal => supportAdmin.diag({ clinicId, kind, days }, signal), [clinicId, kind, days]);
    const payments = useSupportQuery(signal => supportAdmin.payments({ clinicId }, signal), [clinicId]);

    // Klinikalar ro'yxatini server alohida bermaydi — u kelgan yozuvlardan yig'iladi.
    // Filtr qo'yilganda javobda bitta klinika qoladi, shuning uchun avval
    // ko'ringanlar esda saqlanadi (aks holda tanlovdan boshqalari yo'qolardi).
    useEffect(() => {
        setClinics(known => withClinics(known, [...(diag.data || []), ...(payments.data || [])]));
    }, [diag.data, payments.data]);

    const clinicOptions = Object.entries<string>(clinics).sort((a, b) => a[1].localeCompare(b[1]));

    return (
        <div className="space-y-4">
            <Card className="p-4 flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="support-logs-clinic">{t('auto.Klinika')}</label>
                <select id="support-logs-clinic" value={clinicId} onChange={event => setClinicId(event.target.value)} className={`${fieldCls} min-w-[220px] max-w-full`}>
                    <option value="">{t('auto.Barcha klinikalar')}</option>
                    {clinicOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("auto.Tanlov quyidagi ikkala ro'yxatga ta'sir qiladi")}</p>
            </Card>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-white">{t('auto.Nosozliklar')}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t("auto.Klinikalarda nima ishlamay qolgani: bot to'xtashi, kira olmaslik, yuborilmagan xabarlar, xatolar")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <select value={kind} onChange={event => setKind(event.target.value)} aria-label={t('auto.Nosozlik turi')} className={fieldCls}>
                            <option value="">{t('auto.Barcha turlar')}</option>
                            {DIAG_KINDS.map(id => <option key={id} value={id}>{labels.diagKind(id)}</option>)}
                        </select>
                        <ChoiceButtons
                            value={days}
                            onChange={setDays}
                            ariaLabel={t('auto.Davr')}
                            options={PERIODS.map(period => ({ value: period, label: t('auto.{n} kun').replace('{n}', String(period)) }))}
                        />
                    </div>
                </div>
                {diag.error ? (
                    <ErrorBlock error={diag.error} onRetry={diag.reload} />
                ) : !diag.data ? (
                    <LoadingBlock />
                ) : diag.data.length === 0 ? (
                    <EmptyBlock
                        icon={Activity}
                        title={t('auto.Bu davrda nosozlik qayd etilmagan')}
                        hint={clinicId || kind ? t("auto.Filtrni o'zgartirib yoki davrni uzaytirib ko'ring") : undefined}
                    />
                ) : (
                    <ul className={`divide-y divide-gray-100 dark:divide-gray-700 transition-opacity ${diag.isLoading ? 'opacity-60' : ''}`}>
                        {diag.data.map(event => <DiagRow key={event.id} event={event} />)}
                    </ul>
                )}
            </Card>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="font-bold text-gray-900 dark:text-white">{t("auto.Obuna to'lovlari")}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("auto.Tasdiqlangan to'lovlar va chek bo'yicha vaqtincha ochilgan klinikalar")}</p>
                </div>
                {payments.error ? (
                    <ErrorBlock error={payments.error} onRetry={payments.reload} />
                ) : !payments.data ? (
                    <LoadingBlock />
                ) : payments.data.length === 0 ? (
                    <EmptyBlock icon={Receipt} title={t("auto.Hali to'lov qayd etilmagan")} />
                ) : (
                    <div className={`overflow-x-auto transition-opacity ${payments.isLoading ? 'opacity-60' : ''}`}>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Sana')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Klinika')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Turi')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Muddat')}</th>
                                    <th className="p-3 font-medium text-gray-500 text-right">{t('auto.Summa')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Tasdiqlagan')}</th>
                                    <th className="p-3 font-medium text-gray-500">{t('auto.Izoh')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {payments.data.map(payment => <PaymentRow key={payment.id} payment={payment} />)}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};
