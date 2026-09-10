import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Phone, ArrowRight } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { LANDING_CONST } from "./content";

interface StickyMobileCtaProps {
  onOpenDemoModal: () => void;
  /** Modal ochiq bo'lsa panel yashiriladi */
  hidden?: boolean;
}

/** Mobil ekranda pastdagi doimiy harakat paneli. Skroll boshlangach chiqadi. */
export default function StickyMobileCta({ onOpenDemoModal, hidden = false }: StickyMobileCtaProps) {
  const { c } = useLandingCopy();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && !hidden && (
        <motion.div
          initial={{ y: 90 }}
          animate={{ y: 0 }}
          exit={{ y: 90 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 lp-glass border-t border-slate-200 px-3 pt-2.5 pb-2.5 pb-safe-area-inset-bottom"
        >
          <div className="flex items-center gap-2.5">
            <a
              href={LANDING_CONST.phoneHref}
              className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm"
            >
              <Phone className="w-4 h-4 text-primary-600" />
              {c.sticky.call}
            </a>
            <button
              onClick={onOpenDemoModal}
              className="flex-[1.4] flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary-600 text-white font-bold text-sm shadow-lg shadow-primary-500/25 active:scale-[0.98] transition-transform cursor-pointer"
            >
              {c.sticky.trial}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
