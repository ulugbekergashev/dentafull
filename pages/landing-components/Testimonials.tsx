import React from "react";
import { Star, Quote, MapPin } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, GlassCard, RevealGroup, RevealItem } from "./ui";

export default function Testimonials() {
  const { c } = useLandingCopy();

  return (
    <Section id="testimonials" bg="white" border>
      <SectionHeader badge={c.testimonials.badge} title={c.testimonials.title} className="mb-12" />

      <RevealGroup className="grid grid-cols-1 sm:grid-cols-3 gap-5" stagger={0.08}>
        {c.testimonials.items.map((rev) => (
          <RevealItem key={rev.name}>
            <GlassCard hover className="h-full p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5" aria-label="5 / 5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <Quote className="w-5 h-5 text-slate-200" aria-hidden="true" />
                </div>
                <blockquote className="text-sm text-slate-700 leading-relaxed">{rev.quote}</blockquote>
              </div>

              <figcaption className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-200/70">
                <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white font-extrabold text-xs shrink-0">
                  {rev.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">{rev.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{rev.role}</p>
                  <span className="flex items-center gap-1 text-[11px] text-primary-600 font-bold mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {rev.city}
                  </span>
                </div>
              </figcaption>
            </GlassCard>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
