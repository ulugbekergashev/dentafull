import React, { useEffect, useState } from "react";
import { ImageOff, Signal, Wifi, BatteryFull } from "lucide-react";
import { useLandingCopy } from "../useLandingCopy";

/** Skrinshotlar `public/landing/` da; `?v=` keshni yangilash uchun */
const SHOT_VERSION = "1";

/**
 * Ekran rasmi manzili. Ruscha sahifada ruscha interfeysli nusxa
 * (`<nom>.ru.webp`) olinadi; u topilmasa o'zbekchasiga qaytiladi.
 */
export const shotUrl = (name: string, lang?: string) =>
  `/landing/${name}${lang === "ru" ? ".ru" : ""}.webp?v=${SHOT_VERSION}`;

const Placeholder: React.FC<{ ratio: string }> = ({ ratio }) => (
  <div className={`w-full ${ratio} bg-slate-100 flex flex-col items-center justify-center gap-2 text-slate-400`}>
    <ImageOff className="w-6 h-6" />
    <span className="text-[11px] font-medium">Ekran rasmi topilmadi</span>
  </div>
);

/** Rasm manzilini boshqaradi: ruscha nusxa → o'zbekcha nusxa → placeholder */
function useShotSrc(image: string) {
  const { lang } = useLandingCopy();
  const [src, setSrc] = useState(() => shotUrl(image, lang));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(shotUrl(image, lang));
    setFailed(false);
  }, [image, lang]);

  const onError = () => {
    const fallback = shotUrl(image);
    if (src !== fallback) setSrc(fallback);
    else setFailed(true);
  };

  return { src, failed, onError };
}

interface FrameProps {
  /** `public/landing/<image>.webp` dagi fayl nomi */
  image: string;
  alt: string;
  /** Hero uchun: rasm darhol yuklansin */
  priority?: boolean;
  urlBar?: string;
  className?: string;
}

/**
 * Brauzer oynasi ramkasi ichidagi mahsulot skrinshoti.
 * Rasm yuklanmasa (hali tayyorlanmagan bo'lsa) — bo'sh joy o'rniga
 * neytral placeholder ko'rsatiladi, layout siljimaydi.
 */
export const BrowserFrame: React.FC<FrameProps> = ({
  image,
  alt,
  priority = false,
  urlBar = "app.dentacrm.uz",
  className = "",
}) => {
  const { src, failed, onError } = useShotSrc(image);

  return (
    <div
      className={`rounded-2xl overflow-hidden bg-white ring-1 ring-slate-900/5 border border-slate-200
                  shadow-2xl shadow-slate-300/50 ${className}`}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/80">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="flex-1 mx-2 px-3 py-1 rounded-md bg-white border border-slate-200 text-[10px] sm:text-[11px] text-slate-400 font-mono text-center truncate">
          {urlBar}
        </span>
      </div>

      {failed ? (
        <Placeholder ratio="aspect-[16/10]" />
      ) : (
        <img
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onError={onError}
          className="block w-full h-auto aspect-[16/10] object-cover object-top bg-slate-50"
        />
      )}
    </div>
  );
};

/**
 * Telefon ramkasi.
 *
 * Skrinshot brauzer oynasidan olinadi, ya'ni unda telefonning status
 * qatori (soat, aloqa, batareya) bo'lmaydi. Ilgari ramka shunchaki qora
 * to'rtburchak edi va telefonga o'xshamasdi — shuning uchun status qatori,
 * yuqoridagi kesma va pastdagi chiziqcha ramkaning o'zida chiziladi.
 */
export const PhoneFrame: React.FC<{ image: string; alt: string; className?: string }> = ({
  image,
  alt,
  className = "",
}) => {
  const { src, failed, onError } = useShotSrc(image);

  return (
    <div
      className={`rounded-[1.9rem] bg-slate-900 p-[3px] shadow-2xl shadow-slate-400/40 ring-1 ring-slate-900/10 ${className}`}
    >
      <div className="relative rounded-[1.7rem] overflow-hidden bg-white">
        {/* Status qatori */}
        <div className="relative flex items-center justify-between px-2.5 pt-[5px] pb-[3px] bg-white">
          <span className="text-[7px] font-bold text-slate-900 leading-none">9:41</span>
          {/* Yuqoridagi kesma */}
          <span
            className="absolute left-1/2 -translate-x-1/2 top-[3px] h-[8px] w-[30%] rounded-full bg-slate-900"
            aria-hidden="true"
          />
          <span className="flex items-center gap-[2px] text-slate-900" aria-hidden="true">
            <Signal className="w-[7px] h-[7px]" strokeWidth={3} />
            <Wifi className="w-[7px] h-[7px]" strokeWidth={3} />
            <BatteryFull className="w-[9px] h-[9px]" strokeWidth={2.5} />
          </span>
        </div>

        {failed ? (
          <Placeholder ratio="aspect-[390/844]" />
        ) : (
          <img
            src={src}
            alt={alt}
            width={780}
            height={1688}
            loading="lazy"
            decoding="async"
            onError={onError}
            className="block w-full h-auto aspect-[390/844] object-cover object-top bg-slate-50"
          />
        )}

        {/* Pastdagi boshqaruv chiziqchasi */}
        <span
          className="absolute bottom-[4px] left-1/2 -translate-x-1/2 h-[3px] w-1/3 rounded-full bg-slate-900/45"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
