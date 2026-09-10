import React from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Send, Instagram, Mail, Clock, MapPin } from "lucide-react";
import { LogoMark } from "../../components/Logo";
import { useLandingCopy } from "./useLandingCopy";
import { LANDING_CONST } from "./content";
import { LanguageToggle } from "./ui";

interface FooterProps {
  scrollToSection: (id: string) => void;
}

export default function Footer({ scrollToSection }: FooterProps) {
  const navigate = useNavigate();
  const { c, lang, setLang } = useLandingCopy();

  const linkCls = "text-slate-500 hover:text-primary-600 transition-colors cursor-pointer text-left";

  /** Bo'sh bo'lgan aloqa kanallari umuman chizilmaydi */
  const channels = [
    LANDING_CONST.telegram && {
      key: "tg",
      Icon: Send,
      label: c.footer.telegram,
      href: LANDING_CONST.telegram,
      external: true,
    },
    LANDING_CONST.instagram && {
      key: "ig",
      Icon: Instagram,
      label: c.footer.instagram,
      href: LANDING_CONST.instagram,
      external: true,
    },
    LANDING_CONST.email && {
      key: "mail",
      Icon: Mail,
      label: LANDING_CONST.email,
      href: `mailto:${LANDING_CONST.email}`,
      external: false,
    },
  ].filter(Boolean) as { key: string; Icon: React.ElementType; label: string; href: string; external: boolean }[];

  return (
    <footer className="bg-white border-t border-slate-200 pt-16 pb-10 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brend */}
          <div className="md:col-span-4 space-y-4">
            <div className="flex items-center gap-2">
              <LogoMark className="w-9 h-9" />
              <span className="text-lg font-extrabold text-slate-900">
                Denta<span className="text-primary-600">CRM</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm">{c.footer.desc}</p>
            <LanguageToggle lang={lang} setLang={setLang} label={c.nav.langLabel} size="sm" />
          </div>

          {/* Mahsulot */}
          <nav className="md:col-span-3 space-y-4" aria-label={c.footer.product}>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{c.footer.product}</h2>
            <ul className="space-y-2.5 text-xs">
              {c.nav.links.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(l.id);
                    }}
                    className={linkCls}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Kompaniya */}
          <nav className="md:col-span-2 space-y-4" aria-label={c.footer.company}>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{c.footer.company}</h2>
            <ul className="space-y-2.5 text-xs">
              <li>
                <a href="/privacy" className={linkCls}>
                  {c.footer.privacy}
                </a>
              </li>
              <li>
                <button onClick={() => navigate("/login")} className={linkCls}>
                  {c.footer.login}
                </button>
              </li>
            </ul>
          </nav>

          {/* Aloqa */}
          <div className="md:col-span-3 space-y-4">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{c.footer.contact}</h2>
            <ul className="space-y-3 text-xs">
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-primary-600 shrink-0" />
                <a
                  href={LANDING_CONST.phoneHref}
                  className="text-slate-700 hover:text-primary-600 font-semibold font-mono transition-colors"
                >
                  {LANDING_CONST.phone}
                </a>
              </li>
              {channels.map(({ key, Icon, label, href, external }) => (
                <li key={key} className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-primary-600 shrink-0" />
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="text-slate-600 hover:text-primary-600 font-medium transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
              {LANDING_CONST.workHours && (
                <li className="flex items-center gap-2.5 text-slate-500">
                  <Clock className="w-4 h-4 text-primary-600 shrink-0" />
                  {LANDING_CONST.workHours}
                </li>
              )}
              {LANDING_CONST.address && (
                <li className="flex items-start gap-2.5 text-slate-500">
                  <MapPin className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
                  {LANDING_CONST.address}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <p>{c.footer.rights}</p>
          <button onClick={() => navigate("/login")} className="text-primary-600 hover:underline cursor-pointer">
            {c.footer.login}
          </button>
        </div>
      </div>
    </footer>
  );
}
