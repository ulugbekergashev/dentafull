import { useLanguage } from '../context/LanguageContext';
import React, { useEffect, useState } from 'react';
import { CheckCircle, Phone, User, AlertCircle, Loader2, ShieldCheck, Clock, Headphones } from 'lucide-react';
import { API_URL } from '../services/api';
import { Logo } from '../components/Logo';
import { initMetaPixel, trackMetaEvent } from '../utils/metaPixel';

export type AdPlan = 'lifetime' | 'monthly';

interface AdLeadPageProps {
  plan: AdPlan;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

// Reklamadan keladigan qisqa forma: faqat ism va telefon.
// Narxlar ataylab ko'rsatilmaydi — tafsilotni sotuvchi qo'ng'iroqda aytadi.
const COPY: Record<AdPlan, { badge: string; title: string; sub: string }> = {
  lifetime: {
    badge: 'Bir martalik to\'lov',
    title: 'DentaCRM — bir marta to\'lang, umrbod foydalaning',
    sub: 'Ism va raqamingizni qoldiring, mutaxassisimiz qo\'ng\'iroq qilib barcha shartlarni tushuntiradi.',
  },
  monthly: {
    badge: 'Oylik obuna',
    title: 'DentaCRM — klinikangiz uchun qulay oylik obuna',
    sub: 'Ism va raqamingizni qoldiring, mutaxassisimiz qo\'ng\'iroq qilib barcha shartlarni tushuntiradi.',
  },
};

const toDigits = (raw: string) => {

  let d = raw.replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  return d.slice(0, 9);
};

const formatPhone = (d: string) => {
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return `+998${parts.length ? ' ' + parts.join(' ') : ' '}`;
};

/** Manba: ad-lifetime yoki ad-monthly, havolada utm_campaign bo'lsa oxiriga qo'shiladi */
const buildSource = (plan: AdPlan) => {
  const campaign = new URLSearchParams(window.location.search).get('utm_campaign');
  const base = `ad-${plan}`;
  return (campaign ? `${base}-${campaign.replace(/[^\w-]/g, '')}` : base).slice(0, 40);
};

const FIELD =
  'w-full bg-slate-50 border-2 border-slate-100 focus:border-primary-500 focus:bg-white rounded-2xl ' +
  'px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 outline-none transition-all';

export default function AdLeadPage({ plan }: AdLeadPageProps) {
  const { t } = useLanguage();

  const copy = COPY[plan];
  const [name, setName] = useState('');
  const [digits, setDigits] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [phoneError, setPhoneError] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    initMetaPixel();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.length !== 9) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStatus('loading');

    try {
      const res = await fetch(`${API_URL}/public/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: `+998${digits}`, source: buildSource(plan) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data && data.success === false) throw new Error(data.message || 'rejected');

      trackMetaEvent('Lead', { content_name: plan });
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-white flex flex-col items-center px-4 py-8">
      <Logo size="md" forceLight />

      <div className="w-full max-w-md mt-8 bg-white rounded-3xl shadow-xl shadow-primary-900/10 border border-slate-100 p-6 sm:p-8">
        {status === 'success' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Rahmat, {name.trim()}!</h1>
            <p className="text-base text-slate-500 leading-relaxed">
              {t('auto.Arizangiz qabul qilindi. Tez orada')} <span className="font-bold text-slate-700 whitespace-nowrap">{formatPhone(digits)}</span> raqamiga qo'ng'iroq qilamiz.
            </p>
          </div>
        ) : (
          <>
            <span className="inline-block text-[11px] font-black text-primary-700 bg-primary-50 uppercase tracking-[0.15em] px-3 py-1 rounded-full">
              {copy.badge}
            </span>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">{copy.title}</h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{copy.sub}</p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="ad-name" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <User className="w-4 h-4 text-primary-500" /> {t('auto.Ismingiz')}
                </label>
                <input
                  id="ad-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Masalan: Aziz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ad-phone" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Phone className="w-4 h-4 text-primary-500" /> {t('auto.Telefon raqamingiz')}
                </label>
                <input
                  id="ad-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  aria-invalid={phoneError}
                  value={formatPhone(digits)}
                  onChange={(e) => {
                    setDigits(toDigits(e.target.value));
                    if (phoneError) setPhoneError(false);
                  }}
                  className={`${FIELD} font-mono ${phoneError ? 'border-red-300 focus:border-red-500' : ''}`}
                />
                {phoneError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Raqamni to'liq kiriting: +998 va 9 ta raqam
                  </p>
                )}
              </div>

              {status === 'error' && (
                <p className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  Yuborib bo'lmadi. Qaytadan urinib ko'ring yoki +998 90 824 29 92 raqamiga qo'ng'iroq qiling.
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !name.trim()}
                className="w-full py-4 min-h-[52px] rounded-2xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed
                           text-white font-extrabold text-base transition-all active:scale-[0.98] shadow-xl shadow-primary-500/25
                           flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> {t('auto.Yuborilmoqda...')}
                  </>
                ) : (
                  'Qo\'ng\'iroq qilishingizni kutaman'
                )}
              </button>
            </form>

            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: Clock, text: 'O\'rnatish 1 kun' },
                { icon: Headphones, text: 'O\'qitish bepul' },
                { icon: ShieldCheck, text: 'Ma\'lumot xavfsiz' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex flex-col items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <Icon className="w-4 h-4 text-primary-500" />
                  {text}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
