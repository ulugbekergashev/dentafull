import React from "react";

interface MarqueeProps {
  items: string[];
  className?: string;
}

/**
 * Cheksiz oqadigan matn qatori. Elementlar kam bo'lsa (6 tadan oz)
 * oqim ma'nosiz ko'rinadi — bunday holda oddiy markazlashgan qator chiziladi.
 */
export const Marquee: React.FC<MarqueeProps> = ({ items, className = "" }) => {
  const chip = (text: string, key: string) => (
    <span
      key={key}
      className="shrink-0 px-4 py-2 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-600 shadow-sm"
    >
      {text}
    </span>
  );

  if (items.length < 6) {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
        {items.map((t, i) => chip(t, `${t}-${i}`))}
      </div>
    );
  }

  return (
    <div className={`lp-marquee-wrap lp-fade-x overflow-hidden ${className}`}>
      <div className="lp-marquee flex w-max gap-3">
        {items.map((t, i) => chip(t, `a-${i}`))}
        <span className="flex gap-3" aria-hidden="true">
          {items.map((t, i) => chip(t, `b-${i}`))}
        </span>
      </div>
    </div>
  );
};
