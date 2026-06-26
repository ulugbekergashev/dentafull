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
import { Phone, X, CheckCircle } from 'lucide-react';

/* ── 20-soniyalik lead popup ─────────────────────────────────── */
function LeadPopup({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('+998 ');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length < 9) return;
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name || 'Anonim', clinicName: '-', phone, city: '', source: 'popup', doctorsCount: 1 }),
      });
    } catch {}
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-md z-10 rounded-3xl overflow-hidden shadow-2xl shadow-blue-900/20">

        {/* Header — gradient bg */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-8 pt-8 pb-10 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-white/5" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-sm">D</div>
              <span className="text-white/80 text-xs font-semibold tracking-widest uppercase">DentaCRM</span>
            </div>
            <h3 className="text-2xl font-extrabold text-white leading-tight">
              Klinikangizni bepul<br />sinab ko'ring
            </h3>
            <p className="text-blue-100 text-sm mt-2 leading-relaxed">
              Raqamingizni qoldiring — 15 daqiqada mutaxassisimiz siz bilan bog'lanadi.
            </p>

            {/* Trust badges */}
            <div className="flex items-center gap-3 mt-4">
              {['7 kun bepul', 'Kartasiz', 'O\'rnatib beramiz'].map(b => (
                <span key={b} className="text-[10px] font-bold text-white/70 bg-white/10 px-2 py-1 rounded-full">✓ {b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Body — white */}
        <div className="bg-white px-8 py-6">
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Ismingiz</label>
                <input
                  type="text"
                  placeholder="Ism-sharifingiz"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Telefon raqam <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                  <input
                    type="text"
                    required
                    placeholder="+998 90 824 29 92"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 font-mono placeholder:text-gray-400 outline-none transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm tracking-wide transition-all active:scale-95 cursor-pointer shadow-lg shadow-blue-500/25 mt-1"
              >
                Qo'ng'iroq so'rash →
              </button>
              <p className="text-[10px] text-gray-400 text-center">Spam yubormaymiz · Istalgan vaqt bekor qilish mumkin</p>
            </form>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h4 className="text-lg font-extrabold text-gray-900">Muvaffaqiyatli!</h4>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  <span className="font-bold text-gray-700">{phone}</span> raqamiga<br />15 daqiqa ichida aloqaga chiqamiz.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 cursor-pointer transition-colors"
              >
                Yopish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isLeadPopupOpen, setIsLeadPopupOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsLeadPopupOpen(true);
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
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-2xl mx-auto shadow-xl shadow-blue-500/20">D</div>
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
                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base">D</div>
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

      {isLeadPopupOpen && <LeadPopup onClose={() => setIsLeadPopupOpen(false)} />}
    </div>
  );
};
