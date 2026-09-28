/** Qo'llanma uchun DOM yordamchilari: belgilangan elementni topish va ko'rinishini tekshirish */

export interface Box { x: number; y: number; w: number; h: number }

export const selectorOf = (target: string) => `[data-tour="${target}"]`;

export function isVisible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // Yopiq yon menyu yoki gorizontal siljigan joy ekrandan tashqarida turadi
    if (r.right <= 0 || r.left >= window.innerWidth) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
}

/** Ekranda ko'rinib turgan birinchi mos element (bir xil belgi telefon va kompyuter sarlavhasida bo'ladi) */
export function findTarget(target: string): HTMLElement | null {
    const list = document.querySelectorAll<HTMLElement>(selectorOf(target));
    for (const el of Array.from(list)) if (isVisible(el)) return el;
    return null;
}

export const rawBoxOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Elementni kesib turadigan ota-bloklar (overflow: auto/scroll/hidden) — oynaning scroll qismi, jadval va h.k. */
const clipCache = new WeakMap<Element, Element[]>();
function clippingAncestors(el: Element): Element[] {
    const cached = clipCache.get(el);
    if (cached) return cached;
    const list: Element[] = [];
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (st.overflowX !== 'visible' || st.overflowY !== 'visible') list.push(p);
    }
    clipCache.set(el, list);
    return list;
}

/**
 * Elementning ko'rinib turgan qismi: ichki scroll bloklar kesgan joy hisobga olinadi.
 * Masalan, oynadagi ro'yxat ostida qolgan tugma — halqa uning ustidagi boshqa tugmalarga chizilmasin.
 * Butunlay yashiringan bo'lsa — null.
 */
export function boxOf(el: Element): Box | null {
    const r = el.getBoundingClientRect();
    let top = r.top;
    let left = r.left;
    let bottom = r.bottom;
    let right = r.right;
    for (const p of clippingAncestors(el)) {
        const c = p.getBoundingClientRect();
        top = Math.max(top, c.top);
        left = Math.max(left, c.left);
        bottom = Math.min(bottom, c.bottom);
        right = Math.min(right, c.right);
    }
    if (bottom - top < 1 || right - left < 1) return null;
    return { x: left, y: top, w: right - left, h: bottom - top };
}

export const sameBox = (a: Box | null, b: Box | null) =>
    !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

/** Element to'liq ko'rinib turibdimi: yopishqoq sarlavha tagida ham, ichki scroll blok ortida ham emas */
function fullyInView(el: Element, topInset: number): boolean {
    const r = el.getBoundingClientRect();
    const visible = boxOf(el);
    const clipped = !visible || visible.h < r.height - 1 || visible.w < r.width - 1;
    return !clipped && r.top >= topInset && r.bottom <= window.innerHeight - 8 && r.left >= 0 && r.right <= window.innerWidth;
}

/**
 * Elementni ko'rinadigan joyga olib keladi (ichki scroll bloklar ham aylantiriladi).
 * Ekrandan baland element boshidan ko'rsatiladi, yopishqoq sarlavha tagida qolmasligi
 * uchun scroll-margin vaqtincha qo'yiladi. Gorizontal: faqat kerak bo'lsa (jadval yon tomonga siljib ketmasin).
 */
export function bringIntoView(el: HTMLElement, smooth: boolean): void {
    const header = window.innerWidth >= 1024 ? 120 : 72;
    if (fullyInView(el, header)) return;
    const tall = el.getBoundingClientRect().height > window.innerHeight - header - 40;
    const prev = el.style.scrollMarginTop;
    el.style.scrollMarginTop = `${header + 12}px`;
    el.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    el.style.scrollMarginTop = prev;
}

/** Foydalanuvchi hozir matn yozyaptimi — strelka tugmalarini qo'llanma olmasin */
export function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
