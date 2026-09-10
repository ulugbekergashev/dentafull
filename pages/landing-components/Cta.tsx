import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { LogoMark } from "../../components/Logo";
import { useLandingCopy } from "./useLandingCopy";
import { Section, Reveal, PrimaryButton, SecondaryButton } from "./ui";

interface CtaProps {
  onOpenDemoModal: () => void;
}

export default function Cta({ onOpenDemoModal }: CtaProps) {
  const navigate = useNavigate();
  const { c } = useLandingCopy();

  return (
    <Section bg="mesh" border containerClassName="max-w-4xl text-center">
      <Reveal className="space-y-7">
        <LogoMark className="w-16 h-16 mx-auto" />

        <div className="space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight lp-balance">
            {c.cta.title}
          </h2>
          <p className="text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">{c.cta.sub}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-1">
          <PrimaryButton
            onClick={onOpenDemoModal}
            className="group text-base"
            icon={<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
          >
            {c.cta.primary}
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate("/login")} className="text-base">
            {c.cta.secondary}
          </SecondaryButton>
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3">
          {c.cta.trust.map((t) => (
            <li key={t} className="flex items-center gap-1.5 text-xs sm:text-[13px] text-slate-500 font-medium">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {t}
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}
