import React from "react";

type Common = {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  /** Berilsa <a>, aks holda <button> render qilinadi */
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  full?: boolean;
  "aria-label"?: string;
};

const BASE =
  "inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl font-bold transition-all " +
  "active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100";

function render(styles: string, p: Common) {
  const cls = `${BASE} ${styles} ${p.full ? "w-full" : ""} ${p.className ?? ""}`;
  const inner = (
    <>
      {p.children}
      {p.icon}
    </>
  );

  if (p.href) {
    return (
      <a href={p.href} target={p.target} rel={p.rel} className={cls} aria-label={p["aria-label"]} onClick={p.onClick}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type={p.type ?? "button"}
      onClick={p.onClick}
      disabled={p.disabled}
      className={cls}
      aria-label={p["aria-label"]}
    >
      {inner}
    </button>
  );
}

/** Asosiy harakat: to'q ko'k tugma */
export const PrimaryButton: React.FC<Common> = (p) =>
  render(
    "px-6 sm:px-7 py-3.5 bg-primary-600 hover:bg-primary-700 text-white text-sm sm:text-base shadow-lg shadow-primary-500/20",
    p
  );

/** Ikkilamchi harakat: oq fon, chegara */
export const SecondaryButton: React.FC<Common> = (p) =>
  render(
    "px-6 sm:px-7 py-3.5 bg-white hover:bg-slate-50 text-slate-700 text-sm sm:text-base border border-slate-200 hover:border-slate-300 shadow-sm",
    p
  );
