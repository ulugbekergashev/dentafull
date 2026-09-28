/**
 * Yengil konfetti (qo'shimcha kutubxonasiz): ikki "to'p" pastki burchaklardan
 * yuqoriga otadi, bo'laklar aylanib, sekin tushadi va 3 soniyada yo'qoladi.
 * Harakatni kamaytirish yoqilgan bo'lsa (prefers-reduced-motion) — hech narsa qilmaydi.
 */
const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#facc15'];

interface Piece {
    x: number; y: number; vx: number; vy: number;
    rot: number; vr: number; size: number; color: string; round: boolean; wobble: number;
}

export function burstConfetti(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1200';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    document.body.appendChild(canvas);

    const pieces: Piece[] = [];
    // Chap to'p o'ngga, o'ng to'p chapga — yuqoriga, tikdan 15–55° og'ib otadi
    const cannon = (x: number, dir: 1 | -1, n: number) => {
        for (let i = 0; i < n; i++) {
            const tilt = (15 + Math.random() * 40) * (Math.PI / 180);
            const speed = 11 + Math.random() * 9 + H / 160;
            pieces.push({
                x, y: H + 8,
                vx: Math.sin(tilt) * speed * dir,
                vy: -Math.cos(tilt) * speed,
                rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
                size: 6 + Math.random() * 6,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                round: Math.random() < 0.3,
                wobble: Math.random() * Math.PI * 2,
            });
        }
    };
    const n = Math.round(Math.min(90, Math.max(50, W / 12)));
    cannon(0, 1, n);
    cannon(W, -1, n);

    const start = performance.now();
    const DURATION = 3000;
    let frame = 0;
    const draw = (now: number) => {
        const t = now - start;
        ctx.clearRect(0, 0, W, H);
        const fade = t > DURATION - 800 ? Math.max(0, (DURATION - t) / 800) : 1;
        for (const p of pieces) {
            p.vy += 0.32;
            p.vx *= 0.985;
            p.vy *= 0.985;
            p.wobble += 0.12;
            p.x += p.vx + Math.sin(p.wobble) * 0.6;
            p.y += p.vy;
            p.rot += p.vr;
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            if (p.round) {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Aylanayotgan qog'oz: kengligi sinus bilan o'zgaradi
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.wobble)) + 1);
            }
            ctx.restore();
        }
        if (t < DURATION) frame = requestAnimationFrame(draw);
        else canvas.remove();
    };
    frame = requestAnimationFrame(draw);
    // Sahifa yashirilsa ham kanvas qolib ketmasin
    window.setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, DURATION + 500);
}
