import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { api, PaymeQuote } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

type Props = {
  /** Sarlavha matni (masalan, bloklangan oynada boshqacha) */
  title?: string;
  /** Panel ko'rinsa-ko'rinmasligini ota komponent biladi (Telegram yo'lini pastga surish uchun) */
  onAvailable?: (available: boolean) => void;
};

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Qaysi muddat oldindan tanlanadi: 3 oy — oylikdan kam bezovta qiladi, yillikdek og'ir emas */
const DEFAULT_MONTHS = 3;

// Obunani saytning o'zida Payme orqali to'lash: muddat tanlanadi → checkout.paycom.uz →
// to'lov o'tgach server muddatni o'zi uzaytiradi (backend/payme). Onlayn to'lov yoqilmagan
// bo'lsa (yoki narx belgilanmagan) panel umuman ko'rinmaydi — eski Telegram yo'li qoladi.
export function PaymePayPanel({ title, onAvailable }: Props) {
  const { t, language } = useLanguage();
  const [quote, setQuote] = useState<PaymeQuote | null>(null);
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.payme.quote()
      .then(q => {
        if (!alive) return;
        setQuote(q && q.options.length ? q : null);
        onAvailable?.(!!q && q.options.length > 0);
      })
      .catch(() => { if (alive) onAvailable?.(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- narx bir marta olinadi
  }, []);

  if (!quote) return null;

  const selected = quote.options.find(o => o.months === months) || quote.options[0];

  const handlePay = async () => {
    setError('');
    setIsRedirecting(true);
    try {
      const returnUrl = `${window.location.origin}/settings?tab=plan`;
      const order = await api.payme.createOrder(selected.months, returnUrl, language === 'ru' ? 'ru' : 'uz');
      window.location.href = order.url;
    } catch (e: any) {
      setIsRedirecting(false);
      const detail = typeof e?.message === 'string' && !e.message.startsWith('API request failed') ? e.message : '';
      setError(detail ? `${t("auto.To'lovni boshlab bo'lmadi")}: ${detail}` : t("auto.To'lovni boshlab bo'lmadi"));
    }
  };

  return (
    <div className="w-full text-left">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
        {title || t("auto.Necha oyga to'laysiz?")}
      </p>

      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t("auto.Necha oyga to'laysiz?")}>
        {quote.options.map(o => {
          const isActive = o.months === selected.months;
          return (
            <button
              key={o.months}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={isRedirecting}
              onClick={() => setMonths(o.months)}
              className={`relative rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                isActive
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 shadow-md shadow-cyan-500/15 -translate-y-0.5'
                  : 'border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700 hover:-translate-y-0.5'
              }`}
            >
              <span className={`block text-sm font-bold ${isActive ? 'text-cyan-700 dark:text-cyan-300' : 'text-gray-900 dark:text-white'}`}>
                {t('auto.{n} oy').replace('{n}', String(o.months))}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 tabular-nums mt-0.5">
                {fmt(o.amount)} {t("auto.so'm")}
              </span>
              <span
                className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                  isActive ? 'bg-cyan-500 scale-100' : 'bg-transparent scale-0'
                }`}
              />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={isRedirecting}
        className="group relative mt-4 w-full overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-3.5 font-bold text-white shadow-lg shadow-cyan-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/30 active:scale-[0.98] disabled:opacity-80"
      >
        {/* Yaltiroq chiziq — tugma ustida sekin o'tib turadi */}
        <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-white/25 transition-transform duration-700 group-hover:translate-x-[450%]" />
        <span className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1 whitespace-nowrap">
          {isRedirecting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("auto.To'lov sahifasi ochilmoqda...")}
            </>
          ) : (
            <>
              {t("auto.Payme orqali to'lash")}
              <span className="rounded-lg bg-white/20 px-2 py-0.5 text-sm tabular-nums">
                {fmt(selected.amount)} {t("auto.so'm")}
              </span>
            </>
          )}
        </span>
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-500" />
        {t("auto.Uzcard yoki Humo karta bilan. To'lovdan keyin muddat o'zi uzayadi.")}
      </p>
    </div>
  );
}
