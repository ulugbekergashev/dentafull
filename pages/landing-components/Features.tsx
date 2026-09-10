import React from "react";
import {
  FolderHeart,
  CalendarCheck,
  BellRing,
  MessageSquareCode,
  Wallet,
  Layers,
  KanbanSquare,
  FlaskConical,
} from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, GlassCard, RevealGroup, RevealItem } from "./ui";

/** Matn `content.ts` da; bu yerda faqat vizual xarita (ikonka + rang). */
const STYLE: Record<string, { Icon: React.ElementType; bg: string; fg: string }> = {
  card: { Icon: FolderHeart, bg: "bg-primary-50", fg: "text-primary-600" },
  calendar: { Icon: CalendarCheck, bg: "bg-teal-50", fg: "text-teal-600" },
  sms: { Icon: BellRing, bg: "bg-purple-50", fg: "text-purple-600" },
  telegram: { Icon: MessageSquareCode, bg: "bg-sky-50", fg: "text-sky-600" },
  finance: { Icon: Wallet, bg: "bg-emerald-50", fg: "text-emerald-600" },
  stock: { Icon: Layers, bg: "bg-amber-50", fg: "text-amber-600" },
  leads: { Icon: KanbanSquare, bg: "bg-rose-50", fg: "text-rose-600" },
  lab: { Icon: FlaskConical, bg: "bg-indigo-50", fg: "text-indigo-600" },
};

export default function Features() {
  const { c } = useLandingCopy();

  return (
    <Section id="features" bg="white" border>
      <SectionHeader badge={c.features.badge} title={c.features.title} subtitle={c.features.sub} className="mb-14" />

      <RevealGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" stagger={0.05}>
        {c.features.items.map((f) => {
          const { Icon, bg, fg } = STYLE[f.key] ?? STYLE.card;
          return (
            <RevealItem key={f.key}>
              <GlassCard hover className="group h-full p-6 flex flex-col gap-4">
                <div
                  className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}
                >
                  <Icon className={`w-5 h-5 ${fg}`} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-[15px] font-bold text-slate-900 leading-snug">{f.title}</h3>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{f.desc}</p>
                </div>
              </GlassCard>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </Section>
  );
}
