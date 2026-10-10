// Meta Pixel faqat reklama sahifalarida (/lifetime, /monthly) yuklanadi.
// CRM ichida hech qachon chaqirilmaydi — aks holda klinika sahifalari
// manzillari va sarlavhalari Meta'ga ketib qolardi.
// Pixel ID maxfiy emas (brauzerda baribir ko'rinadi). VITE_META_PIXEL_ID bilan almashtirish mumkin.
const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined) || '2295495467915150';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export const initMetaPixel = () => {
  if (!PIXEL_ID || typeof window === 'undefined' || window.fbq) return;

  // Meta'ning rasmiy snippeti, o'qiladigan ko'rinishda
  const fbq: any = function (...args: unknown[]) {
    fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
};

// Xuddi shu hodisani server ham Meta'ga yuboradi (backend/leadSignals.ts) — brauzerdagi
// piksel bloklangan bo'lsa ham signal yo'qolmaydi. eventId ikkalasida bir xil bo'lgani
// uchun Meta ularni bitta hodisa deb sanaydi.
const withId = (eventId?: string) => (eventId ? { eventID: eventId } : undefined);

/** Standart hodisa. Shaxsiy ma'lumot (ism, telefon) bu yerga hech qachon berilmaydi. */
export const trackMetaEvent = (event: 'Lead', params?: Record<string, string>, eventId?: string) => {
  if (!PIXEL_ID || !window.fbq) return;
  window.fbq('track', event, params, withId(eventId));
};

/**
 * Maxsus hodisalar — konversiya hisoblanmaydi:
 * CrmContact — bu odam bizda allaqachon bor. Ads Manager'da shu hodisa bo'yicha
 *              auditoriya reklamadan chiqarib tashlanadi, unga qayta pul sarflanmaydi.
 * NotClinic  — formada "klinikam yo'q" degan odam.
 */
export const trackMetaCustomEvent = (event: 'CrmContact' | 'NotClinic', eventId?: string) => {
  if (!PIXEL_ID || !window.fbq) return;
  window.fbq('trackCustom', event, {}, withId(eventId));
};

export interface MetaTrack {
  eventId: string;
  fbp: string | null;
  fbc: string | null;
  url: string;
}

const readCookie = (name: string): string | null => {
  try {
    const found = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
  } catch {
    // Buzuq cookie tufayli ariza yuborilmay qolmasin
    return null;
  }
};

const newEventId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

/**
 * Ariza bilan birga serverga ketadigan belgilar: Meta shular orqali lidni u bosgan
 * reklamaga bog'laydi. Pikselni yuklamaydi — faqat mavjud cookie va manzilni o'qiydi,
 * shuning uchun saytning asosiy sahifasida ham xavfsiz.
 */
export const getMetaTrack = (): MetaTrack => {
  const fbclid = new URLSearchParams(window.location.search).get('fbclid');
  return {
    eventId: newEventId(),
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null),
    url: `${window.location.origin}${window.location.pathname}`,
  };
};
