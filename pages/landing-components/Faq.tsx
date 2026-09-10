import React, { useId, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown, Phone } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { LANDING_CONST } from "./content";
import { Section, SectionHeader, Reveal } from "./ui";

interface ItemProps {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
  idBase: string;
}

const Item: React.FC<ItemProps> = ({ q, a, open, onToggle, idBase }) => {
  const reduce = useReducedMotion();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden transition-colors hover:border-slate-300">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${idBase}-panel`}
          id={`${idBase}-btn`}
          className="w-full flex items-start justify-between gap-4 text-left px-5 py-4 min-h-[56px] cursor-pointer
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset"
        >
          <span className="text-sm sm:text-[15px] font-bold text-slate-800 leading-snug">{q}</span>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform duration-200 ${
              open ? "rotate-180 text-primary-600" : ""
            }`}
          />
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${idBase}-panel`}
            role="region"
            aria-labelledby={`${idBase}-btn`}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function Faq() {
  const { c } = useLandingCopy();
  const uid = useId().replace(/:/g, "");
  const [open, setOpen] = useState<number | null>(0);

  const items = c.faq.items;
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)];

  return (
    <Section id="faq" bg="white" border>
      <SectionHeader badge={c.faq.badge} title={c.faq.title} subtitle={c.faq.sub} className="mb-12" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 max-w-5xl mx-auto">
        {columns.map((col, ci) => (
          <div key={ci} className="space-y-3">
            {col.map((item, ii) => {
              const index = ci * half + ii;
              return (
                <Item
                  key={item.q}
                  q={item.q}
                  a={item.a}
                  idBase={`${uid}-${index}`}
                  open={open === index}
                  onToggle={() => setOpen(open === index ? null : index)}
                />
              );
            })}
          </div>
        ))}
      </div>

      <Reveal className="mt-10 flex justify-center">
        <a
          href={LANDING_CONST.phoneHref}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Phone className="w-4 h-4 text-primary-600" />
          {LANDING_CONST.phone}
        </a>
      </Reveal>
    </Section>
  );
}
