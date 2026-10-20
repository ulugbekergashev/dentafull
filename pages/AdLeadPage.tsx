import { useLanguage } from '../context/LanguageContext';
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { API_URL } from '../services/api';
import { getMetaTrack, initMetaPixel, MetaTrack, trackMetaCustomEvent, trackMetaEvent } from '../utils/metaPixel';
import { readSentLead, rememberSentLead } from '../utils/sentLead';
import { Logo } from '../components/Logo';
import { AudienceBadge, Field, inputClass, SuccessView } from './ad-lead-components/AdLeadParts';
import './ad-lead-components/ad-lead.css';

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
// Qisqa — telefonda logotip bilan bir qatorga sig'adi
const AUDIENCE_BADGE = 'Stomatologlar uchun';
// "Bepul ko'rsatib beramiz" forma sarlavhasida — bu yerda takrorlanmaydi
const SUB = 'Tish kartasi, qabullar va kassa — bitta dasturda.';
// "—" oldida bo'linmas probel: tire yolg'iz o'zi keyingi qatorga tushib qolmasin
const LEAD = 'Kompyuter dasturi —';
const COPY: Record<AdPlan, { lead: string; offer: string; sub: string }> = {
  lifetime: { lead: LEAD, offer: "bir marta to'lang, umrbod foydalaning", sub: SUB },
  monthly: { lead: LEAD, offer: 'qulay oylik obuna', sub: SUB },
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

  const form = (
    <form onSubmit={submit} className="space-y-3 sm:space-y-4" noValidate>
      <Field id="ad-name" label={t('auto.Ismingiz')} delay={260} error={errors.name ? 'Ismingizni yozing' : null}>
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

      <Field id="ad-clinic" label={t('auto.Klinika nomi')} delay={310} error={errors.clinic ? 'Klinikangiz nomini yozing' : null}>
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
        delay={360}
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
          className={`${inputClass(!!errors.phone)} tabular-nums tracking-wide`}
        />
      </Field>

      {status === 'error' && (
        <p className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          Yuborib bo'lmadi. Qaytadan urinib ko'ring yoki {OUR_PHONE} raqamiga qo'ng'iroq qiling.
        </p>
      )}

      {/* Kirish animatsiyasi o'ramda: tugmaning o'z transform'i (bosilganda kichrayish) unga to'qnashmasin */}
      <div className="al-rise pt-1" style={{ animationDelay: '410ms' }}>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="al-shine group relative overflow-hidden w-full px-3 min-h-[52px] rounded-xl
                     bg-primary-600 hover:bg-primary-700 text-white font-bold text-[15px] min-[380px]:text-base
                     leading-tight text-center
                     shadow-[0_1px_2px_rgba(15,23,42,0.08),0_8px_20px_-8px_rgba(37,99,235,0.55)]
                     hover:shadow-[0_1px_2px_rgba(15,23,42,0.08),0_12px_24px_-8px_rgba(37,99,235,0.6)]
                     active:scale-[0.97] disabled:opacity-70 disabled:cursor-wait
                     transition-[transform,background-color,box-shadow] duration-150 ease-out
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

      <p className="pt-1 text-center text-[13px] text-slate-500">
        Yoki o'zingiz qo'ng'iroq qiling:{' '}
        <a href={`tel:${OUR_PHONE.replace(/\s/g, '')}`} className="font-semibold text-slate-900 whitespace-nowrap tabular-nums hover:text-primary-600">
          {OUR_PHONE}
        </a>
      </p>
    </form>
  );

  // Kompyuterda: chapda sarlavha, o'ngda oq kartadagi forma. Telefon va planshetda bitta ustun:
  // logotip, sarlavha va karta bir xil kenglikda (max-w-md), chap chetlari bir chiziqda.
  const column = 'mx-auto w-full max-w-md lg:max-w-none';
  return (
    <div className="al-root relative min-h-screen overflow-hidden antialiased">
      <div aria-hidden="true" className="al-grid" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8 lg:px-12">
        <header className={`al-rise flex items-center justify-between gap-3 pt-5 sm:pt-7 ${column}`}>
          <Logo size="md" forceLight />
          {/* 320px li eski telefonda logotip yoniga sig'maydi */}
          <AudienceBadge text={AUDIENCE_BADGE} className="hidden min-[360px]:inline-flex" />
        </header>

        <main
          className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 pt-6 pb-10 sm:gap-8 sm:pt-10
                     lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:content-center lg:items-center lg:gap-16 lg:py-12"
        >
          <section className={`al-rise ${column}`} style={{ animationDelay: '60ms' }}>
            {/* "Kompyuter dasturi —" doim alohida qatorda, taklif uning ostida (marker har qator ostida) */}
            <h1 className="text-[28px] min-[375px]:text-[30px] sm:text-[44px] lg:text-[48px] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-900">
              <span className="block">{copy.lead}</span>
              <span className="block [text-wrap:balance]">
                <span className="al-mark">{copy.offer}</span>
              </span>
            </h1>
            <p className="mt-3 sm:mt-5 max-w-md text-[15px] sm:text-lg leading-relaxed text-slate-600 [text-wrap:pretty]">
              {copy.sub}
              <span className="sm:hidden"> Bepul ko'rsatib beramiz.</span>
            </p>
          </section>

          <section className={`al-rise al-card p-4 sm:p-7 lg:p-8 ${column} lg:max-w-[440px] lg:justify-self-end`} style={{ animationDelay: '160ms' }}>
            {status === 'success' ? (
              <SuccessView
                title={isRepeat ? `Arizangiz bizda bor${name.trim() ? `, ${name.trim()}` : ''}` : `Rahmat, ${name.trim()}!`}
                lead={isRepeat ? 'Qayta qoldirish shart emas —' : t('auto.Arizangiz qabul qilindi. Tez orada')}
                phone={formatPhone(digits)}
                isRepeat={isRepeat}
                ourPhone={OUR_PHONE}
                onStartOver={startOver}
              />
            ) : (
              <>
                {/* Telefonda bu gap sarlavha ostida turadi — joy tejaladi, tugma birinchi ekranda qoladi */}
                <div className="hidden sm:block mb-5">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Bepul ko'rsatib beramiz</h2>
                  <p className="mt-1 text-sm text-slate-500 [text-wrap:pretty]">Raqamingizni qoldiring — mutaxassisimiz o'zi qo'ng'iroq qiladi.</p>
                </div>
                {form}
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
