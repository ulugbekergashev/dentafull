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

/** Standart hodisa. Shaxsiy ma'lumot (ism, telefon) bu yerga hech qachon berilmaydi. */
export const trackMetaEvent = (event: 'Lead', params?: Record<string, string>) => {
  if (!PIXEL_ID || !window.fbq) return;
  window.fbq('track', event, params);
};
