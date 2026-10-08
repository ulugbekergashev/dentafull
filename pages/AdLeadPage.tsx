import { useLanguage } from '../context/LanguageContext';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Phone, User, AlertCircle, Loader2, ShieldCheck, Clock, Headphones, Building2, Stethoscope } from 'lucide-react';
import { API_URL } from '../services/api';
import { Logo } from '../components/Logo';
import { getMetaTrack, initMetaPixel, MetaTrack, trackMetaCustomEvent, trackMetaEvent } from '../utils/metaPixel';
import { readSentLead, rememberSentLead } from '../utils/sentLead';

export type AdPlan = 'lifetime' | 'monthly';

interface AdLeadPageProps {
  plan: AdPlan;
}

type Status = 'idle' | 'loading' | 'success' | 'notClinic' | 'error';

// Reklamadan keladigan qisqa forma: ism, telefon va bitta bosiladigan savol.
// Narxlar ataylab ko'rsatilmaydi — tafsilotni sotuvchi qo'ng'iroqda aytadi.
// Sarlavha kim uchun ekanini birinchi so'zdan aytadi: "bir marta to'lang" degan
// gapni ko'rib, buni kredit yoki boshqa xizmat deb o'ylab ariza qoldirishardi.
const COPY: Record<AdPlan, { badge: string; title: string; sub: string }> = {
  lifetime: {
    badge: 'Bir martalik to\'lov',
    title: 'Stomatologiya klinikangiz uchun dastur — bir marta to\'lang, umrbod foydalaning',
    sub: 'DentaCRM: bemorlar kartasi, qabullar va kassa bitta joyda. Raqamingizni qoldiring — mutaxassisimiz qo\'ng\'iroq qilib barcha shartlarni tushuntiradi.',
  },
  monthly: {
    badge: 'Oylik obuna',
    title: 'Stomatologiya klinikangiz uchun dastur — qulay oylik obuna',
    sub: 'DentaCRM: bemorlar kartasi, qabullar va kassa bitta joyda. Raqamingizni qoldiring — mutaxassisimiz qo\'ng\'iroq qilib barcha shartlarni tushuntiradi.',
  },
};

// Bitta bosish bilan javob beriladigan savol. Ikki ishni qiladi: adashib kirgan odam
// bu tish davolash joyi emasligini tushunadi, sotuvchi esa klinika hajmini oldindan biladi.
// Qiymatlar backend/server.ts dagi AD_FORM_DOCTORS / AD_FORM_NO_CLINIC bilan bir xil.
const NO_CLINIC = 'none';
const DOCTOR_OPTIONS: { value: string; label: string }[] = [
  { value: '1-2', label: '1–2' },
  { value: '3-5', label: '3–5' },
  { value: '6+', label: '6 va ko\'p' },
  { value: NO_CLINIC, label: 'Klinikam yo\'q' },
];

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

const FIELD =
  'w-full bg-slate-50 border-2 border-slate-100 focus:border-primary-500 focus:bg-white rounded-2xl ' +
  'px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 outline-none transition-all';

export default function AdLeadPage({ plan }: AdLeadPageProps) {
  const { t } = useLanguage();

  const copy = COPY[plan];
  const [sentBefore] = useState(readSentLead);
  const [name, setName] = useState(sentBefore?.name ?? '');
  const [digits, setDigits] = useState(sentBefore?.digits ?? '');
  const [status, setStatus] = useState<Status>(sentBefore ? 'success' : 'idle');
  // Ariza oldin qoldirilgan: shu qurilmadan yoki shu raqamdan
  const [isRepeat, setIsRepeat] = useState(!!sentBefore);
  const [phoneError, setPhoneError] = useState(false);
  const [doctors, setDoctors] = useState('');
  const [doctorsError, setDoctorsError] = useState(false);
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
    setDigits('');
    setDoctors('');
    setIsRepeat(false);
    setStatus('idle');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isPhoneOk = digits.length === 9;
    setPhoneError(!isPhoneOk);
    setDoctorsError(!doctors);
    if (!isPhoneOk || !doctors) return;

    setStatus('loading');
    track.current = track.current || getMetaTrack();
    const { eventId } = track.current;
    let gotResponse = false;

    try {
      const res = await fetch(`${API_URL}/public/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: `+998${digits}`, source: buildSource(plan), doctors, track: track.current }),
      });
      gotResponse = true;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data && data.success === false) throw new Error(data.message || 'rejected');
      track.current = null;

      // Kim bo'lishidan qat'i nazar — bu odam endi bizda bor, unga reklama qayta ko'rsatilmasin
      trackMetaCustomEvent('CrmContact', `${eventId}-c`);

      if (doctors === NO_CLINIC) {
        trackMetaCustomEvent('NotClinic', `${eventId}-n`);
        setStatus('notClinic');
        return;
      }

      // Lead faqat yangi, klinikasi bor odam uchun ketadi: Meta aynan shunday odamlarni
      // qidirishni o'rganadi. Qayta ariza lid emas.
      const repeat = !!data?.repeat;
      // Oldingi urinish serverda saqlanib, javobi yo'lda yo'qolgan bo'lsa, bu "takror"
      // aslida o'sha yangi lid. Belgi bir xil — Meta uni ikki marta sanamaydi.
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
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-white flex flex-col items-center px-4 py-8">
      <Logo size="md" forceLight />

      <div className="w-full max-w-md mt-8 bg-white rounded-3xl shadow-xl shadow-primary-900/10 border border-slate-100 p-6 sm:p-8">
        {status === 'notClinic' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-slate-50 border-2 border-slate-100 flex items-center justify-center mx-auto">
              <Building2 className="w-10 h-10 text-slate-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">DentaCRM — stomatologiya klinikalari uchun dastur</h1>
            <p className="text-base text-slate-500 leading-relaxed">
              Bu yerda tish davolanmaydi va qabulga yozilmaydi. Dastur klinika egalari va shifokorlarga bemorlar, qabullar va kassani yuritish uchun kerak.
            </p>
            <p className="text-sm text-slate-500">
              Klinika ochmoqchi bo'lsangiz, qo'ng'iroq qiling:{' '}
              <a href={`tel:${OUR_PHONE.replace(/\s/g, '')}`} className="font-bold text-primary-600 whitespace-nowrap">{OUR_PHONE}</a>
            </p>
            <button type="button" onClick={startOver} className="text-sm font-semibold text-slate-400 hover:text-primary-600 underline underline-offset-4">
              Adashib bosdim, formaga qaytish
            </button>
          </div>
        ) : status === 'success' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto">
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
                className="w-full py-3.5 min-h-[52px] rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-extrabold text-lg
                           transition-all active:scale-[0.98] flex items-center justify-center gap-2 whitespace-nowrap"
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
            <span className="inline-block text-[11px] font-black text-primary-700 bg-primary-50 uppercase tracking-[0.15em] px-3 py-1 rounded-full">
              {copy.badge}
            </span>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">{copy.title}</h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{copy.sub}</p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <fieldset className="space-y-1.5">
                <legend className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-1.5">
                  <Stethoscope className="w-4 h-4 text-primary-500" /> Klinikangizda nechta shifokor ishlaydi?
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {DOCTOR_OPTIONS.map((option) => {
                    const isSelected = doctors === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setDoctors(option.value);
                          setDoctorsError(false);
                        }}
                        className={`min-h-[48px] px-3 rounded-2xl border-2 text-sm font-bold transition-all active:scale-[0.98] ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : doctorsError
                              ? 'border-red-200 bg-slate-50 text-slate-600'
                              : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-primary-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {doctorsError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Bittasini tanlang
                  </p>
                )}
              </fieldset>

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
                  Yuborib bo'lmadi. Qaytadan urinib ko'ring yoki {OUR_PHONE} raqamiga qo'ng'iroq qiling.
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
