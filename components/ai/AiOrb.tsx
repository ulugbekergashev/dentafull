import React from 'react';

// ─── DentaAI belgisi ──────────────────────────────────────────────────────────
//
// Ilgari AI ning belgisi har joyda uchraydigan "✨" ikonkasi edi va u
// ilovadagi boshqa tugmalardan ajralmasdi. Endi o'z belgisi bor: aylanib
// turuvchi yorug' shar ichida tish. Holati ham shu belgida ko'rinadi —
// o'ylayotganda tezlashadi va "nafas oladi", tinglayotganda to'lqin tarqatadi.
// Ya'ni foydalanuvchi AI nima qilayotganini matn o'qimasdan ko'radi.

export type OrbState = 'idle' | 'thinking' | 'listening';

// Animatsiyalar bitta <style> da. Tailwind CDN'da o'z keyframes yozib
// bo'lmaydi, har bir komponentga alohida <style> esa takrorlanardi.
const CSS = `
.dai-orb{position:relative;display:inline-grid;place-items:center;border-radius:9999px;overflow:hidden;isolation:isolate;flex-shrink:0;
  box-shadow:0 6px 16px -6px rgba(79,70,229,.6),inset 0 0 0 1px rgba(255,255,255,.28)}
.dai-orb::before{content:"";position:absolute;inset:-45%;z-index:-2;
  background:conic-gradient(from 0deg,#22d3ee,#3b82f6,#6366f1,#8b5cf6,#22d3ee);animation:dai-spin 9s linear infinite}
.dai-orb::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;
  background:radial-gradient(circle at 30% 22%,rgba(255,255,255,.55),transparent 48%)}
.dai-orb[data-state="thinking"]{animation:dai-breathe 1.3s ease-in-out infinite}
.dai-orb[data-state="thinking"]::before{animation-duration:1.3s}
.dai-rings{position:relative;display:inline-grid;place-items:center;flex-shrink:0}
.dai-rings[data-state="listening"]::before,.dai-rings[data-state="listening"]::after{content:"";position:absolute;inset:0;border-radius:9999px;
  border:2px solid rgba(244,63,94,.55);animation:dai-ring 1.6s ease-out infinite}
.dai-rings[data-state="listening"]::after{animation-delay:.8s}
.dai-edge{position:absolute;left:0;top:0;bottom:0;width:2px;
  background:linear-gradient(180deg,transparent 0%,#22d3ee 30%,#6366f1 50%,#8b5cf6 70%,transparent 100%);
  background-size:100% 220%;animation:dai-flow 1.4s linear infinite}
.dai-wave{display:inline-flex;align-items:center;gap:2px;height:16px}
.dai-wave i{display:block;width:3px;height:4px;border-radius:2px;background:currentColor;animation:dai-wave 1s ease-in-out infinite}
.dai-wave i:nth-child(2){animation-delay:.12s}.dai-wave i:nth-child(3){animation-delay:.24s}
.dai-wave i:nth-child(4){animation-delay:.36s}.dai-wave i:nth-child(5){animation-delay:.48s}
.dai-shine{background:linear-gradient(90deg,currentColor 0%,rgba(148,163,184,.55) 50%,currentColor 100%);background-size:200% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;animation:dai-shine 1.8s linear infinite}
.dai-scroll{scrollbar-width:thin}
@keyframes dai-spin{to{transform:rotate(360deg)}}
@keyframes dai-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes dai-ring{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.9);opacity:0}}
@keyframes dai-flow{from{background-position:0 110%}to{background-position:0 -110%}}
@keyframes dai-wave{0%,100%{height:4px}50%{height:15px}}
@keyframes dai-shine{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.dai-orb,.dai-orb::before,.dai-rings::before,.dai-rings::after,.dai-edge,.dai-wave i,.dai-shine{animation:none!important}}
`;

let injected = false;
/** Uslublarni bir marta, birinchi chizilishda qo'shadi. */
export function ensureAiStyles(): void {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    if (document.getElementById('dai-styles')) return;
    const el = document.createElement('style');
    el.id = 'dai-styles';
    el.textContent = CSS;
    document.head.appendChild(el);
}

/** Tish belgisi — oq, shar ichida. */
export const ToothGlyph: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path
            fill="currentColor"
            d="M7.6 3.2C5.2 3.2 3.7 5.1 3.7 7.6c0 2.2.9 3.6 1.6 5.3.6 1.5.8 3.2 1.1 5 .3 1.9.9 3.4 2.1 3.4 1.4 0 1.7-1.6 2-3.2.3-1.4.7-2.6 1.5-2.6s1.2 1.2 1.5 2.6c.3 1.6.6 3.2 2 3.2 1.2 0 1.8-1.5 2.1-3.4.3-1.8.5-3.5 1.1-5 .7-1.7 1.6-3.1 1.6-5.3 0-2.5-1.5-4.4-3.9-4.4-1.8 0-2.9.8-4.4.8s-2.6-.8-4.4-.8Z"
        />
    </svg>
);

interface Props {
    size?: number;
    state?: OrbState;
    className?: string;
}

export const AiOrb: React.FC<Props> = ({ size = 28, state = 'idle', className = '' }) => {
    ensureAiStyles();
    return (
        <span className={`dai-rings ${className}`} data-state={state} style={{ width: size, height: size }}>
            <span className="dai-orb text-white" data-state={state} style={{ width: size, height: size }}>
                <ToothGlyph size={Math.round(size * 0.56)} className="drop-shadow-[0_1px_1px_rgba(30,27,75,.35)]" />
            </span>
        </span>
    );
};

export default AiOrb;
