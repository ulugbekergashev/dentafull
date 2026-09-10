import React, { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

interface CountUpProps {
  value: number;
  suffix?: string;
  /** Raqamni til qoidasi bo'yicha formatlash */
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}

/**
 * Ekranga kirganda 0 dan berilgan qiymatgacha sanaydi.
 * Harakat kamaytirilgan bo'lsa yakuniy qiymat darhol ko'rsatiladi.
 */
export const CountUp: React.FC<CountUpProps> = ({
  value,
  suffix = "",
  format,
  className = "",
  duration = 1.1,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {format ? format(shown) : shown}
      {suffix}
    </span>
  );
};
