import React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";

/**
 * Skroll paytida bir marta ishlaydigan "paydo bo'lish" animatsiyasi.
 *
 * `prefers-reduced-motion` yoqilgan bo'lsa element darhol to'liq
 * ko'rinadi — hech qanday siljish yoki shaffoflik o'zgarishi bo'lmaydi.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Sekundlarda kechikish (ketma-ket chiqarish uchun) */
  delay?: number;
  /** Boshlang'ich siljish, px */
  y?: number;
}

export const Reveal: React.FC<RevealProps> = ({ children, className, delay = 0, y = 24 }) => {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
};

/** Ichidagi `RevealItem` larni ketma-ket chiqaradi (masalan, karta to'ri) */
export const RevealGroup: React.FC<{ children: React.ReactNode; className?: string; stagger?: number }> = ({
  children,
  className,
  stagger = 0.07,
}) => {
  const reduce = useReducedMotion();

  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : stagger } },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial={reduce ? false : "hidden"}
      whileInView={reduce ? undefined : "show"}
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </motion.div>
  );
};

export const RevealItem: React.FC<{ children: React.ReactNode; className?: string; y?: number }> = ({
  children,
  className,
  y = 20,
}) => {
  const reduce = useReducedMotion();

  const variants: Variants = {
    hidden: { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  };

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
};
