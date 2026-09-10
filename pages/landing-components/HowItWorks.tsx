import React from "react";
import { ArrowRight } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, GlassCard, RevealGroup, RevealItem, Reveal, PrimaryButton } from "./ui";

interface HowItWorksProps {
  onOpenDemoModal: () => void;
}

/** 3 qadamli boshlash yo'li: so'rov → o'rnatish → o'qitish. */
export default function HowItWorks({ onOpenDemoModal }: HowItWorksProps) {
  const { c } = useLandingCopy();

  return (
    <Section id="how" bg="slate" border>
      <SectionHeader badge={c.how.badge} title={c.how.title} subtitle={c.how.sub} className="mb-14" />

      <div className="relative">
        {/* Qadamlarni bog'lovchi chiziq — faqat keng ekranda */}
        <div
          className="hidden lg:block absolute top-[3.25rem] left-[16%] right-[16%] border-t-2 border-dashed border-primary-200"
          aria-hidden="true"
        />

        <RevealGroup className="relative grid grid-cols-1 md:grid-cols-3 gap-6" stagger={0.1}>
          {c.how.steps.map((step, i) => (
            <RevealItem key={step.title}>
              <GlassCard hover className="h-full p-6 sm:p-7 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-600 text-white flex items-center justify-center text-xl font-extrabold shadow-lg shadow-primary-500/25">
                  {i + 1}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
              </GlassCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>

      <Reveal className="mt-12 flex justify-center">
        <PrimaryButton onClick={onOpenDemoModal} icon={<ArrowRight className="w-5 h-5" />}>
          {c.how.cta}
        </PrimaryButton>
      </Reveal>
    </Section>
  );
}
