import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Menu, X, Phone } from "lucide-react";
import { LogoMark } from "../../components/Logo";
import { useLandingCopy } from "./useLandingCopy";
import { LANDING_CONST } from "./content";
import { LanguageToggle } from "./ui";

interface NavbarProps {
  onOpenDemoModal: () => void;
  scrollToSection: (id: string) => void;
}

export default function Navbar({ onOpenDemoModal, scrollToSection }: NavbarProps) {
  const navigate = useNavigate();
  const { c, lang, setLang } = useLandingCopy();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Mobil menyu ochiq bo'lsa Escape uni yopadi
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  const linkClass = "text-sm font-semibold text-slate-600 hover:text-primary-600 transition-colors whitespace-nowrap";

  return (
    <nav
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled || mobileMenuOpen
          ? "bg-white/90 backdrop-blur-md border-b border-slate-200 py-2.5 shadow-sm"
          : "bg-transparent py-4"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          {/* Logotip */}
          <a
            href="#hero"
            onClick={go("hero")}
            className="flex items-center gap-2 cursor-pointer group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg"
          >
            <LogoMark className="w-9 h-9 group-hover:scale-105 transition-transform" />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              Denta<span className="text-primary-600">CRM</span>
            </span>
          </a>

          {/* Bo'limlar — kompyuterda */}
          <div className="hidden lg:flex items-center gap-6 flex-1 justify-center">
            {c.nav.links.map((link) => (
              <a key={link.id} href={`#${link.id}`} onClick={go(link.id)} className={linkClass}>
                {link.label}
              </a>
            ))}
          </div>

          {/* O'ng tomon */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <a href={LANDING_CONST.phoneHref} className={`${linkClass} flex items-center gap-1.5`}>
              <Phone className="w-3.5 h-3.5 text-primary-600 shrink-0" />
              {LANDING_CONST.phone}
            </a>
            <LanguageToggle lang={lang} setLang={setLang} label={c.nav.langLabel} size="sm" />
            <button
              onClick={() => navigate("/login")}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm
                         transition-all shadow-md shadow-primary-500/20 active:scale-95 cursor-pointer whitespace-nowrap
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              {c.nav.login}
            </button>
          </div>

          {/* Mobil boshqaruv */}
          <div className="flex lg:hidden items-center gap-2">
            <LanguageToggle lang={lang} setLang={setLang} label={c.nav.langLabel} size="sm" />
            <a
              href={LANDING_CONST.phoneHref}
              aria-label={LANDING_CONST.phone}
              className="p-2.5 rounded-xl bg-slate-100 text-primary-600 hover:bg-slate-200 transition-colors"
            >
              <Phone className="w-4 h-4" />
            </a>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? c.nav.menuClose : c.nav.menuOpen}
              className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobil menyu */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="lg:hidden overflow-hidden bg-white border-b border-slate-200 shadow-lg"
          >
            <div className="px-4 pt-2 pb-6 space-y-1">
              {c.nav.links.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={go(link.id)}
                  className="flex items-center w-full min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-primary-600 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <a
                  href={LANDING_CONST.phoneHref}
                  className="flex items-center gap-2 min-h-[44px] px-3 py-2.5 text-sm font-semibold text-slate-700"
                >
                  <Phone className="w-4 h-4 text-primary-600" />
                  {LANDING_CONST.phone}
                </a>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenDemoModal();
                  }}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm transition-all cursor-pointer"
                >
                  {c.hero.ctaPrimary}
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="w-full min-h-[44px] py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm transition-all cursor-pointer"
                >
                  {c.nav.login}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
