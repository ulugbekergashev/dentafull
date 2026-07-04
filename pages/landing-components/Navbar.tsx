import React, { useState, useEffect } from "react";
import { Menu, X, Phone } from "lucide-react";

interface NavbarProps {
  onOpenDemoModal: () => void;
  scrollToSection: (id: string) => void;
}

const NAV_LINKS = [
  { label: "Imkoniyatlar",    id: "features" },
  { label: "Demo",            id: "demo-dashboard" },
  { label: "Tish Xaritasi",  id: "tooth-map" },
  { label: "Kalkulyator",     id: "calculator" },
  { label: "Tariflar",        id: "pricing" },
];

export default function Navbar({ onOpenDemoModal, scrollToSection }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navTextClass = isScrolled ? "text-slate-600 hover:text-primary-600" : "text-slate-700 hover:text-primary-600";

  return (
    <nav
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/95 backdrop-blur-md border-b border-slate-200 py-3 shadow-sm"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6">

          {/* Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer group shrink-0"
            onClick={() => scrollToSection("hero")}
          >
            <img
              src="/logo-icon.png"
              alt="DentaCRM"
              className="w-9 h-9 object-contain group-hover:scale-105 transition-transform"
            />
            <div>
              <span className={`text-lg font-bold tracking-tight transition-colors ${isScrolled ? "text-primary-900" : "text-slate-900"}`}>
                Denta<span className="text-primary-600">CRM</span>
              </span>
              <span className="text-slate-400 font-mono text-[8px] block tracking-widest -mt-1">.uz</span>
            </div>
          </div>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-6 flex-1 justify-center">
            {NAV_LINKS.map(link => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className={`text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${navTextClass}`}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Right side: phone + login */}
          <div className="hidden lg:flex items-center gap-4 shrink-0">
            <a
              href="tel:+998908242992"
              className={`text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${navTextClass}`}
            >
              <Phone className="w-3.5 h-3.5 text-primary-600 shrink-0" />
              +998 90 824 29 92
            </a>
            <button
              onClick={() => window.location.href = '/login'}
              className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-all shadow-md shadow-primary-500/15 active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Tizimga Kirish →
            </button>
          </div>

          {/* Mobile: phone icon + burger */}
          <div className="flex lg:hidden items-center gap-2">
            <a
              href="tel:+998908242992"
              className="p-2 rounded-xl bg-slate-100 text-primary-600 hover:bg-slate-200 transition-colors"
            >
              <Phone className="w-4 h-4" />
            </a>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-6 space-y-1 shadow-lg">
          {NAV_LINKS.map(link => (
            <button
              key={link.id}
              onClick={() => { scrollToSection(link.id); setMobileMenuOpen(false); }}
              className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-primary-600 transition-colors"
            >
              {link.label}
            </button>
          ))}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <a
              href="tel:+998908242992"
              className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700"
            >
              <Phone className="w-4 h-4 text-primary-600" />
              +998 90 824 29 92
            </a>
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full text-center py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-all cursor-pointer"
            >
              Tizimga Kirish →
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
