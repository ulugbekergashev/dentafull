import React from "react";
import { Reveal } from "./Reveal";

interface SectionHeaderProps {
  badge?: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
}

/** Bo'lim sarlavhasi: kichik yorliq + h2 + izoh. Barcha bo'limlarda bir xil ritm. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  badge,
  title,
  subtitle,
  align = "center",
  className = "",
}) => (
  <Reveal
    className={`${align === "center" ? "text-center mx-auto max-w-3xl" : "text-left max-w-3xl"} space-y-4 ${className}`}
  >
    {badge && (
      <span className="inline-block px-3.5 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-[11px] sm:text-xs font-bold text-primary-700 uppercase tracking-widest">
        {badge}
      </span>
    )}
    <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1] font-extrabold text-slate-900 tracking-tight lp-balance">
      {title}
    </h2>
    {subtitle && <p className="text-base sm:text-lg text-slate-600 leading-relaxed">{subtitle}</p>}
  </Reveal>
);
