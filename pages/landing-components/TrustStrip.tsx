import React from "react";
import { useLandingCopy } from "./useLandingCopy";
import { Marquee, Reveal } from "./ui";

/** Hero ostidagi ingichka ishonch bandi: klinikalar soni va nomlari. */
export default function TrustStrip() {
  const { c } = useLandingCopy();

  return (
    <section className="py-10 bg-white border-y border-slate-200/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="space-y-5" y={16}>
          <p className="text-center text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest">
            {c.trust.title}
          </p>
          <Marquee items={c.trust.clinics} />
        </Reveal>
      </div>
    </section>
  );
}
