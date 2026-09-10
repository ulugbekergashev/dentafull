import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Sichqoncha ustiga kelganda ko'tarilish effekti */
  hover?: boolean;
}

/** Shishasimon fon + yumshoq soya. Landingdagi asosiy karta uslubi. */
export const GlassCard: React.FC<GlassCardProps> = ({ children, className = "", hover = false }) => (
  <div
    className={`lp-glass rounded-2xl ${
      hover ? "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary-500/10" : ""
    } ${className}`}
  >
    {children}
  </div>
);
