import React from 'react';
import { AlertCircle, Check, Phone } from 'lucide-react';

// Reklama sahifasining ko'rinish qismlari. Holat va yuborish mantig'i AdLeadPage.tsx da.

/** Kimlar uchunligi: oq "tabletka", yashil nuqta. Ko'rinishi (hidden/inline-flex) chaqiruvchida */
export const AudienceBadge = ({ text, className }: { text: string; className: string }) => (
  <span
    className={`items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700
                whitespace-nowrap ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${className}`}
  >
    <span className="relative flex w-1.5 h-1.5">
      <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
      <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
    </span>
    {text}
  </span>
);

interface FieldProps {
  id: string;
  label: string;
  error: string | null;
  delay: number;
  children: React.ReactNode;
}

/** Yorliq maydon ustida — oddiy va tanish ko'rinish */
export const Field = ({ id, label, error, delay, children }: FieldProps) => (
  <div className="al-rise space-y-1.5" style={{ animationDelay: `${delay}ms` }}>
    <label htmlFor={id} className="block text-[13px] font-medium text-slate-600">
      {label}
    </label>
    {children}
    {error && (
      <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
      </p>
    )}
  </div>
);

export const inputClass = (hasError: boolean) =>
  'al-input block w-full h-11 sm:h-12 rounded-xl border px-3.5 text-base text-slate-900 outline-none ' +
  'transition-[border-color,background-color,box-shadow] duration-150 ease-out ' +
  'placeholder:text-slate-400 focus:bg-white focus:ring-4 ' +
  (hasError
    ? 'border-rose-300 bg-rose-50/60 focus:border-rose-500 focus:ring-rose-500/15'
    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 focus:border-primary-500 focus:ring-primary-500/15');

interface SuccessViewProps {
  title: string;
  lead: string;
  phone: string;
  isRepeat: boolean;
  ourPhone: string;
  onStartOver: () => void;
}

/** Ariza qabul qilingan ekran — yashil belgi to'lqin bilan chiqadi, raqamimiz ko'z oldida */
export const SuccessView = ({ title, lead, phone, isRepeat, ourPhone, onStartOver }: SuccessViewProps) => (
  <div className="text-center py-2 sm:py-3 space-y-4">
    <div className="relative mx-auto w-16 h-16">
      <span aria-hidden="true" className="al-ripple absolute inset-0 rounded-full bg-emerald-400/30" />
      <div className="al-pop relative w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(16,185,129,0.7)]">
        <Check className="w-8 h-8 text-white" strokeWidth={3} />
      </div>
    </div>
    <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">{title}</h2>
    <p className="text-[15px] text-slate-500 leading-relaxed [text-wrap:pretty]">
      {lead} <span className="font-semibold text-slate-900 whitespace-nowrap">{phone}</span> raqamiga
      {isRepeat ? ' albatta' : ''} qo'ng'iroq qilamiz.
    </p>

    {/* Raqamimiz ko'z oldida tursin: "nomeringiz esimdan chiqdi" deb qayta ariza qoldirishmasin */}
    <div className="rounded-2xl bg-slate-50 p-4 space-y-3 ring-1 ring-slate-200/70">
      <p className="text-sm text-slate-600">Kutishni xohlamasangiz, o'zingiz qo'ng'iroq qiling</p>
      <a
        href={`tel:${ourPhone.replace(/\s/g, '')}`}
        className="w-full min-h-[52px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-lg
                   shadow-[0_1px_2px_rgba(15,23,42,0.08),0_8px_20px_-8px_rgba(37,99,235,0.55)]
                   transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]
                   flex items-center justify-center gap-2 whitespace-nowrap tabular-nums"
      >
        <Phone className="w-5 h-5" /> {ourPhone}
      </a>
      <p className="text-xs text-slate-500">Bu raqamni saqlab qo'ying.</p>
    </div>

    {isRepeat && (
      <button
        type="button"
        onClick={onStartOver}
        className="text-sm font-medium text-slate-500 hover:text-primary-600 underline underline-offset-4"
      >
        Boshqa raqam qoldirish
      </button>
    )}
  </div>
);
