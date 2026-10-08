// Ariza qoldirgan odamni brauzer eslab qoladi. U reklamani yana bosib kelsa,
// /lifetime va /monthly bo'sh forma o'rniga "arizangiz bizda bor" oynasini
// ko'rsatadi va Meta'ga RepeatLead belgisini yuboradi — shu belgi bo'yicha
// odam reklama auditoriyasidan o'zi chiqib ketadi. Saytdagi oddiy forma ham
// shu yerga yozadi, chunki u Meta Pixel'ni yuklamaydi.
const SENT_KEY = 'dentacrm_ad_lead_sent';
const SENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface SentLead {
  name: string;
  digits: string;
  at: number;
}

// Ilova ichidagi brauzerlarda (Instagram, Telegram) xotira yopiq bo'lishi mumkin —
// u holda sahifa shunchaki oddiy forma bo'lib ishlayveradi.
export const readSentLead = (): SentLead | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(SENT_KEY) || 'null');
    const isFresh = saved && typeof saved.at === 'number' && Date.now() - saved.at < SENT_TTL_MS;
    return isFresh && /^\d{9}$/.test(saved.digits) ? { name: String(saved.name || ''), digits: saved.digits, at: saved.at } : null;
  } catch {
    return null;
  }
};

/** digits — +998 dan keyingi 9 ta raqam */
export const rememberSentLead = (name: string, digits: string): void => {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ name, digits, at: Date.now() }));
  } catch {
    /* xotira yopiq — eslab qolinmaydi, ariza baribir yuborildi */
  }
};
