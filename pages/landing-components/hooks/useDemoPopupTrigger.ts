import { useEffect, useRef } from "react";

const SESSION_KEY = "lp_demo_popup_shown";
const SUBMITTED_KEY = "lp_demo_submitted";
const DELAY_MS = 25_000;
const SCROLL_RATIO = 0.5;
/** Foydalanuvchi biror maydonga yozayotgan bo'lsa shuncha kutamiz */
const TYPING_RETRY_MS = 10_000;

const safeGet = (store: Storage, key: string) => {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (store: Storage, key: string, value: string) => {
  try {
    store.setItem(key, value);
  } catch {
    /* private rejim — e'tiborsiz qoldiramiz */
  }
};

/** Popup shu sessiyada ko'rsatilganini belgilaydi (qo'lda ochishda ham chaqiriladi) */
export const markPopupShown = () => safeSet(sessionStorage, SESSION_KEY, "1");
/** Forma yuborilgan — popup boshqa hech qachon chiqmaydi */
export const markDemoSubmitted = () => safeSet(localStorage, SUBMITTED_KEY, "1");

/**
 * Demo so'rovi oynasini bir marta avtomatik ochadi: 25 soniyadan keyin
 * yoki sahifaning yarmiga yetilganda — qaysi biri oldin bo'lsa.
 *
 * Chiqmaydigan holatlar:
 *  - shu sessiyada allaqachon ko'rsatilgan (sessionStorage);
 *  - foydalanuvchi ilgari forma yuborgan (localStorage);
 *  - ayni damda biror maydonga yozilmoqda — bunda 10 soniya kechiktiriladi.
 */
export function useDemoPopupTrigger(open: () => void) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (safeGet(sessionStorage, SESSION_KEY) || safeGet(localStorage, SUBMITTED_KEY)) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const isTyping = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
    };

    const fire = () => {
      if (firedRef.current) return;
      if (isTyping()) {
        retry = setTimeout(fire, TYPING_RETRY_MS);
        return;
      }
      firedRef.current = true;
      cleanup();
      markPopupShown();
      open();
    };

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max >= SCROLL_RATIO) fire();
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (retry) clearTimeout(retry);
      window.removeEventListener("scroll", onScroll);
    };

    timer = setTimeout(fire, DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });

    return cleanup;
  }, [open]);
}
