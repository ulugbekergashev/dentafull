import React from "react";
import type { Language } from "../../../context/LanguageContext";

interface LanguageToggleProps {
  lang: Language;
  setLang: (l: Language) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}

const OPTIONS: { id: Language; label: string }[] = [
  { id: "uz", label: "UZ" },
  { id: "ru", label: "RU" },
];

/** UZ | RU almashtirgichi. Tanlov `app_language` da saqlanadi. */
export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  lang,
  setLang,
  label,
  size = "md",
  className = "",
}) => {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs min-h-[44px]";

  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 border border-slate-200 ${className}`}
    >
      {OPTIONS.map((o) => {
        const on = lang === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setLang(o.id)}
            aria-pressed={on}
            className={`${pad} rounded-[10px] font-bold tracking-wide transition-all cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                on ? "bg-white text-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
