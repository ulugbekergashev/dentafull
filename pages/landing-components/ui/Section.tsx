import React from "react";

type Bg = "white" | "slate" | "mesh";

const BG: Record<Bg, string> = {
  white: "bg-white",
  slate: "bg-slate-50",
  mesh: "lp-mesh",
};

interface SectionProps {
  id?: string;
  bg?: Bg;
  /** Yuqori/pastki chegara chizig'i */
  border?: boolean;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}

/** Landing bo'limlari uchun yagona tashqi qobiq: fon, vertikal bo'shliq, konteyner */
export const Section: React.FC<SectionProps> = ({
  id,
  bg = "white",
  border = false,
  className = "",
  containerClassName = "",
  children,
}) => (
  <section
    id={id}
    className={`relative py-20 sm:py-24 lg:py-28 ${BG[bg]} ${border ? "border-t border-slate-200/70" : ""} ${className}`}
  >
    <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${containerClassName}`}>{children}</div>
  </section>
);
