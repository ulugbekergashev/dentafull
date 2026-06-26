/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './landing-components/Navbar';
import Hero from './landing-components/Hero';
import Features from './landing-components/Features';
import DashboardDemo from './landing-components/DashboardDemo';
import ToothMapDemo from './landing-components/ToothMapDemo';
import RoiCalculator from './landing-components/RoiCalculator';
import Pricing from './landing-components/Pricing';
import Testimonials from './landing-components/Testimonials';
import DemoRequestModal from './landing-components/DemoRequestModal';
import { Phone } from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsDemoModalOpen(true);
    }, 20000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-500/20 selection:text-blue-900 antialiased overflow-x-hidden">

      <Navbar
        onOpenDemoModal={() => setIsDemoModalOpen(true)}
        scrollToSection={scrollToSection}
      />

      <Hero
        onOpenDemoModal={() => setIsDemoModalOpen(true)}
        scrollToSection={scrollToSection}
      />

      <DashboardDemo />
      <Features />
      <ToothMapDemo />
      <RoiCalculator />
      <Pricing onOpenDemoModal={() => setIsDemoModalOpen(true)} />
      <Testimonials />

      {/* CTA */}
      <section className="py-24 bg-gradient-to-tr from-blue-50 via-white to-slate-100 relative border-t border-slate-200 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
          <img src="/logo-icon.png" alt="DentaCRM" className="w-16 h-16 object-contain mx-auto" />
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Klinikangizni Ertagayoq Avtomatlashtiring</h2>
            <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              DentaCRM tizimini ishga tushirish uchun atigi 1 kun kifoya. Biz ma'lumotlaringizni to'liq ko'chirib, xodimlaringizni bepul o'qitib beramiz.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setIsDemoModalOpen(true)}
              className="px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base tracking-wider transition-all active:scale-95 shadow-lg shadow-blue-500/20 cursor-pointer"
            >
              7 KUNLIK BEPUL TRIAL OLISH
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm sm:text-base transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Tizimga kirish →
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 pt-4 font-mono">
            <span>✓ Kredit kartasiz ro'yxatdan o'tish</span>
            <span>✓ HIPAA xavfsizlik standarti</span>
            <span>✓ Istalgan vaqtda to'xtatish kafolati</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 pt-16 pb-12 text-slate-600 text-xs text-left relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-4 space-y-4">
              <div className="flex items-center space-x-2">
                <img src="/logo-icon.png" alt="DentaCRM" className="w-9 h-9 object-contain" />
                <span className="text-lg font-bold text-slate-900">Denta<span className="text-blue-600">CRM</span></span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Stomatologiya klinikalari uchun zamonaviy SaaS boshqaruv tizimi. Bemorlar, qabullar, moliya va Telegram bot — hammasi bitta tizimda.
              </p>
            </div>
            <div className="md:col-span-3 space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Sahifalar</h4>
              <ul className="space-y-2 text-[11px]">
                {[['features','Imkoniyatlar'],['demo-dashboard','Interaktiv Demo'],['tooth-map','Tish Xaritasi'],['calculator','ROI Kalkulyator'],['pricing','Tariflar']].map(([id,label]) => (
                  <li key={id}><button onClick={() => scrollToSection(id)} className="hover:text-blue-600 transition-colors cursor-pointer text-left">{label}</button></li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-5 space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Aloqa</h4>
              <ul className="space-y-3 text-[11px] text-slate-500">
                <li className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-blue-600 shrink-0" />
                  <a href="tel:+998908242992" className="text-slate-700 hover:text-blue-600 font-semibold font-mono transition-colors">+998 90 824 29 92</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 gap-4">
            <p>© 2026 DentaCRM.uz — Barcha huquqlar himoyalangan.</p>
            <button onClick={() => navigate('/login')} className="text-blue-600 hover:underline cursor-pointer">Tizimga kirish →</button>
          </div>
        </div>
      </footer>

      <DemoRequestModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />

    </div>
  );
};
