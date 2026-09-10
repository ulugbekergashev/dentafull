import React from "react";
import { Send, MessageSquare, Share2, Landmark, Smartphone, Sparkles } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, GlassCard, RevealGroup, RevealItem } from "./ui";

/** Faqat kodda haqiqatan mavjud ulanishlar ko'rsatiladi. */
const ICONS: Record<string, { Icon: React.ElementType; bg: string; fg: string }> = {
  telegram: { Icon: Send, bg: "bg-sky-50", fg: "text-sky-600" },
  sms: { Icon: MessageSquare, bg: "bg-emerald-50", fg: "text-emerald-600" },
  leads: { Icon: Share2, bg: "bg-primary-50", fg: "text-primary-600" },
  dmed: { Icon: Landmark, bg: "bg-indigo-50", fg: "text-indigo-600" },
  pwa: { Icon: Smartphone, bg: "bg-amber-50", fg: "text-amber-600" },
  ai: { Icon: Sparkles, bg: "bg-violet-50", fg: "text-violet-600" },
};

export default function Integrations() {
  const { c } = useLandingCopy();

  return (
    <Section id="integrations" bg="slate" border>
      <SectionHeader
        badge={c.integrations.badge}
        title={c.integrations.title}
        subtitle={c.integrations.sub}
        className="mb-14"
      />

      <RevealGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {c.integrations.items.map((item) => {
          const { Icon, bg, fg } = ICONS[item.key] ?? ICONS.ai;
          return (
            <RevealItem key={item.key}>
              <GlassCard hover className="h-full p-6 flex flex-col gap-4">
                <div className={`w-12 h-12 ${bg} rounded-2xl flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${fg}`} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              </GlassCard>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </Section>
  );
}
