import React, { useCallback, useEffect, useState } from 'react';
import './landing-components/landing.css';

import Navbar from './landing-components/Navbar';
import Hero from './landing-components/Hero';
import TrustStrip from './landing-components/TrustStrip';
import ProductShowcase from './landing-components/ProductShowcase';
import Features from './landing-components/Features';
import DashboardDemo from './landing-components/DashboardDemo';
import ToothMapDemo from './landing-components/ToothMapDemo';
import AiAssistantWidget from './landing-components/AiAssistantWidget';
import HowItWorks from './landing-components/HowItWorks';
import RoiCalculator from './landing-components/RoiCalculator';
import Comparison from './landing-components/Comparison';
import Integrations from './landing-components/Integrations';
import Pricing from './landing-components/Pricing';
import Testimonials from './landing-components/Testimonials';
import Faq from './landing-components/Faq';
import Cta from './landing-components/Cta';
import Footer from './landing-components/Footer';
import StickyMobileCta from './landing-components/StickyMobileCta';
import DemoRequestModal from './landing-components/DemoRequestModal';

import { useLandingCopy } from './landing-components/useLandingCopy';
import { useDemoPopupTrigger, markPopupShown } from './landing-components/hooks/useDemoPopupTrigger';

export const LandingPage: React.FC = () => {
  const { c, lang } = useLandingCopy();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  /** Qo'lda ochilganda ham avtomatik popup boshqa chiqmaydi */
  const openDemoModal = useCallback(() => {
    markPopupShown();
    setIsDemoModalOpen(true);
  }, []);

  useDemoPopupTrigger(() => setIsDemoModalOpen(true));

  // Sahifa sarlavhasi va til atributi tanlangan tilga ergashadi.
  // Landingdan chiqilganda oldingi holat qaytariladi.
  useEffect(() => {
    const prevTitle = document.title;
    const prevLang = document.documentElement.lang;

    document.title = c.meta.title;
    document.documentElement.lang = lang;

    return () => {
      document.title = prevTitle;
      document.documentElement.lang = prevLang;
    };
  }, [c.meta.title, lang]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, []);

  return (
    <div
      id="lp-root"
      className="min-h-screen bg-white text-slate-800 font-sans antialiased overflow-x-hidden
                 selection:bg-primary-500/20 selection:text-primary-900 pb-20 lg:pb-0"
    >
      <Navbar onOpenDemoModal={openDemoModal} scrollToSection={scrollToSection} />

      <main>
        <Hero onOpenDemoModal={openDemoModal} scrollToSection={scrollToSection} />
        <TrustStrip />
        <ProductShowcase />
        <Features />
        <DashboardDemo />
        <ToothMapDemo />
        <AiAssistantWidget />
        <HowItWorks onOpenDemoModal={openDemoModal} />
        <RoiCalculator />
        <Comparison />
        <Integrations />
        <Pricing onOpenDemoModal={openDemoModal} />
        <Testimonials />
        <Faq />
        <Cta onOpenDemoModal={openDemoModal} />
      </main>

      <Footer scrollToSection={scrollToSection} />

      <StickyMobileCta onOpenDemoModal={openDemoModal} hidden={isDemoModalOpen} />

      <DemoRequestModal isOpen={isDemoModalOpen} onClose={() => setIsDemoModalOpen(false)} />
    </div>
  );
};

export default LandingPage;
