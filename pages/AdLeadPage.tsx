import { useLanguage } from '../context/LanguageContext';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Phone, User, AlertCircle, Loader2, Building2, ArrowRight, LucideIcon } from 'lucide-react';
import { API_URL } from '../services/api';
import { Logo } from '../components/Logo';
import { getMetaTrack, initMetaPixel, MetaTrack, trackMetaCustomEvent, trackMetaEvent } from '../utils/metaPixel';
import { readSentLead, rememberSentLead } from '../utils/sentLead';
import './ad-lead.css';

export type AdPlan = 'lifetime' | 'monthly';

interface AdLeadPageProps {
  plan: AdPlan;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

// Reklamadan keladigan qisqa forma: ism, klinika nomi va telefon — telefonning birinchi
// ekraniga maydonlar ham, tugma ham sig'ishi shart.
// Narxlar ataylab ko'rsatilmaydi — tafsilotni sotuvchi qo'ng'iroqda aytadi.
// Matn nima sotilayotganini aniq aytishi shart: "bir marta to'lang", "shartlarni
// tushuntiramiz" kabi gaplarni ko'rib, buni kredit deb o'ylab ariza qoldirishardi.
// "Dastur" so'zining o'zi ham ikki ma'noli (kredit dasturi), shuning uchun "kompyuter dasturi".
// Sarlavha qisqa: "klinika uchun"ni nishon va "Klinika nomi" maydoni aytib turibdi.
// Qisqa — telefonda bir qatorga sig'adi va forma pastga surilmaydi
const AUDIENCE_BADGE = 'Stomatologlar uchun';
const SUB = "Tish kartasi, qabullar va kassa — bitta dasturda. Bepul ko'rsatib beramiz.";
const COPY: Record<AdPlan, { lead: string; offer: string; sub: string }> = {
  lifetime: { lead: 'Kompyuter dasturi —', offer: "bir marta to'lang, umrbod foydalaning", sub: SUB },
  monthly: { lead: 'Kompyuter dasturi —', offer: 'qulay oylik obuna', sub: SUB },
};

type FieldName = 'name' | 'clinic' | 'phone';
const FIELD_ORDER: FieldName[] = ['name', 'clinic', 'phone'];

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

const OUR_PHONE = '+998 90 824 29 92';

const inputClass = (hasError: boolean) =>
  'w-full bg-slate-50 border-2 focus:bg-white focus:ring-4 rounded-2xl pl-11 pr-4 py-3 text-base ' +
  'text-slate-800 placeholder:text-slate-300 outline-none transition-all ' +
  (hasError
    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
    : 'border-slate-100 hover:border-slate-200 focus:border-primary-500 focus:ring-primary-500/10');

interface FieldProps {
  id: string;
  label: string;
  icon: LucideIcon;
  error: string | null;
  delay: number;
  children: React.ReactNode;
}

/** Yorliq, maydon ichidagi belgi va xato matni — uchala maydon bir xil ko'rinadi */
const Field = ({ id, label, icon: Icon, error, delay, children }: FieldProps) => (
  <div className="space-y-1 al-rise" style={{ animationDelay: `${delay}ms` }}>
    <label htmlFor={id} className="block text-[13px] font-bold text-slate-700">
      {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-primary-500 pointer-events-none" />
      {children}
    </div>
    {error && (
      <p className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
      </p>
    )}
  </div>
);

export default function AdLeadPage({ plan }: AdLeadPageProps) {
  const { t } = useLanguage();

  const copy = COPY[plan];
  const [sentBefore] = useState(readSentLead);
  const [name, setName] = useState(sentBefore?.name ?? '');
  const [clinic, setClinic] = useState('');
  const [digits, setDigits] = useState(sentBefore?.digits ?? '');
  const [status, setStatus] = useState<Status>(sentBefore ? 'success' : 'idle');
  // Ariza oldin qoldirilgan: shu qurilmadan yoki shu raqamdan
  const [isRepeat, setIsRepeat] = useState(!!sentBefore);
  const [errors, setErrors] = useState<Partial<Record<FieldName, boolean>>>({});
  const clearError = (field: FieldName) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: false }));
  };
  // Bitta ariza uchun bitta belgi: xatodan keyin qayta yuborilsa ham Meta uni bir marta sanaydi
  const track = useRef<MetaTrack | null>(null);
  const lostResponse = useRef(false);
  const returnMarked = useRef(false);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    initMetaPixel();
    // Ariza qoldirgan odam reklamani yana bosib keldi — Meta uni reklamadan chiqarishi uchun belgi
    if (sentBefore && !returnMarked.current) {
      returnMarked.current = true;
      trackMetaCustomEvent('CrmContact');
    }
  }, []);

  const startOver = () => {
    setName('');
    setClinic('');
    setDigits('');
    setErrors({});
    setIsRepeat(false);
    setStatus('idle');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Tugma hech qachon o'chirilmaydi: bosilganda nima yetishmayotgani aytiladi
    const found = { name: !name.trim(), clinic: !clinic.trim(), phone: digits.length !== 9 };
    const firstMissing = FIELD_ORDER.find((field) => found[field]);
    setErrors(found);
    if (firstMissing) {
      document.getElementById(`ad-${firstMissing}`)?.focus();
      return;
    }

    setStatus('loading');
    track.current = track.current || getMetaTrack();
    const { eventId } = track.current;
    let gotResponse = false;

    try {
      const res = await fetch(`${API_URL}/public/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          clinicName: clinic.trim(),
          phone: `+998${digits}`,
          source: buildSource(plan),
          track: track.current,
        }),
      });
      gotResponse = true;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data && data.success === false) throw new Error(data.message || 'rejected');
      track.current = null;

      // Kim bo'lishidan qat'i nazar — bu odam endi bizda bor, unga reklama qayta ko'rsatilmasin
      trackMetaCustomEvent('CrmContact', `${eventId}-c`);

      // Lead — reklama kampaniyasi ("saytdan lid") shu hodisaga yoqiladi, shuning uchun u ariza
      // qoldirilgan zahoti ketishi shart. Qayta ariza lid emas. Server ham xuddi shu belgi bilan
      // yuboradi (backend/leadSignals.ts) — Meta ikki marta sanamaydi.
      const repeat = !!data?.repeat;
      // Oldingi urinish serverda saqlanib, javobi yo'lda yo'qolgan bo'lsa, bu "takror" aslida o'sha yangi lid.
      if (!repeat || lostResponse.current) trackMetaEvent('Lead', { content_name: plan }, eventId);
      lostResponse.current = false;
      rememberSentLead(name.trim(), digits);
      setIsRepeat(repeat);
      setStatus('success');
    } catch {
      if (!gotResponse) lostResponse.current = true;
      setStatus('error');
    }
  };

  return (
    <div className="al-page relative min-h-screen overflow-hidden flex flex-col items-center px-4 pt-4 sm:pt-8 pb-10">
      <div aria-hidden="true" className="al-blob al-blob-a" />
      <div aria-hidden="true" className="al-blob al-blob-b" />

      <div className="relative al-rise">
        <Logo size="md" forceLight />
      </div>

      <div className="relative w-full max-w-md mt-4 sm:mt-6 al-card al-rise" style={{ animationDelay: '60ms' }}>
        <div className="bg-white rounded-[27px] p-5 sm:p-8">
        {status === 'success' ? (
          <div className="text-center py-6 space-y-4">
            <div className="al-pop w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200 shadow-lg shadow-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              {isRepeat ? `Arizangiz bizda bor${name.trim() ? `, ${name.trim()}` : ''}` : `Rahmat, ${name.trim()}!`}
            </h1>
            <p className="text-base text-slate-500 leading-relaxed">
              {isRepeat ? 'Qayta qoldirish shart emas —' : t('auto.Arizangiz qabul qilindi. Tez orada')}{' '}
              <span className="font-bold text-slate-700 whitespace-nowrap">{formatPhone(digits)}</span> raqamiga{isRepeat ? ' albatta' : ''} qo'ng'iroq qilamiz.
            </p>

            {/* Raqamimiz ko'z oldida tursin: "nomeringiz esimdan chiqdi" deb qayta ariza qoldirishmasin */}
            <div className="rounded-2xl bg-primary-50 border border-primary-100 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-600">Kutishni xohlamasangiz, o'zingiz qo'ng'iroq qiling</p>
              <a
                href={`tel:${OUR_PHONE.replace(/\s/g, '')}`}
                className="w-full py-3.5 min-h-[52px] rounded-2xl bg-gradient-to-r from-primary-600 to-sky-500 hover:brightness-110 text-white font-extrabold text-lg
                           shadow-lg shadow-primary-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Phone className="w-5 h-5" /> {OUR_PHONE}
              </a>
              <p className="text-xs text-slate-500">Bu raqamni saqlab qo'ying.</p>
            </div>

            {isRepeat && (
              <button type="button" onClick={startOver} className="text-sm font-semibold text-slate-400 hover:text-primary-600 underline underline-offset-4">
                Boshqa raqam qoldirish
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="al-rise" style={{ animationDelay: '120ms' }}>
              <span className="inline-flex items-center gap-2 text-[11px] font-black text-primary-700 bg-primary-50 ring-1 ring-primary-100 uppercase tracking-[0.15em] px-3 py-1 rounded-full">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-primary-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-primary-500" />
                </span>
                {AUDIENCE_BADGE}
              </span>
              <h1 className="mt-3 text-[26px] sm:text-[32px] font-extrabold text-slate-900 leading-[1.15] tracking-tight">
                {copy.lead} <span className="al-accent block [text-wrap:balance]">{copy.offer}</span>
              </h1>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{copy.sub}</p>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
              <Field id="ad-name" label={t('auto.Ismingiz')} icon={User} delay={180} error={errors.name ? 'Ismingizni yozing' : null}>
                <input
                  id="ad-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Masalan: Aziz"
                  aria-invalid={!!errors.name}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearError('name');
                  }}
                  className={inputClass(!!errors.name)}
                />
              </Field>

              <Field id="ad-clinic" label={t('auto.Klinika nomi')} icon={Building2} delay={230} error={errors.clinic ? 'Klinikangiz nomini yozing' : null}>
                <input
                  id="ad-clinic"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="Masalan: Tabassum Dent"
                  aria-invalid={!!errors.clinic}
                  value={clinic}
                  onChange={(e) => {
                    setClinic(e.target.value);
                    clearError('clinic');
                  }}
                  className={inputClass(!!errors.clinic)}
                />
              </Field>

              <Field
                id="ad-phone"
                label={t('auto.Telefon raqamingiz')}
                icon={Phone}
                delay={280}
                error={errors.phone ? "Raqamni to'liq kiriting: +998 va 9 ta raqam" : null}
              >
                <input
                  id="ad-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  aria-invalid={!!errors.phone}
                  value={formatPhone(digits)}
                  onChange={(e) => {
                    setDigits(toDigits(e.target.value));
                    clearError('phone');
                  }}
                  className={`${inputClass(!!errors.phone)} font-mono`}
                />
              </Field>

              {status === 'error' && (
                <p className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  Yuborib bo'lmadi. Qaytadan urinib ko'ring yoki {OUR_PHONE} raqamiga qo'ng'iroq qiling.
                </p>
              )}

              {/* Kirish animatsiyasi o'ramda: tugmaning o'z transform'i (bosilganda kichrayish) unga to'qnashmasin */}
              <div className="al-rise" style={{ animationDelay: '330ms' }}>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="al-shine group relative overflow-hidden w-full px-3 py-4 min-h-[56px] rounded-2xl
                             bg-gradient-to-r from-primary-600 via-primary-500 to-sky-500 text-white font-extrabold
                             text-[15px] min-[380px]:text-base leading-tight text-center
                             shadow-xl shadow-primary-500/30 hover:shadow-2xl hover:shadow-primary-500/40 hover:brightness-110
                             active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait transition-all
                             flex items-center justify-center gap-2"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> {t('auto.Yuborilmoqda...')}
                    </>
                  ) : (
                    <>
                      Qo'ng'iroq qilishingizni kutaman
                      {/* Tor telefonda strelka yozuvni chetga siqib qo'ymasin */}
                      <ArrowRight className="hidden min-[380px]:block w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
