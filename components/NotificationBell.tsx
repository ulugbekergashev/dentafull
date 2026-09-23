import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Wallet, CalendarPlus, CalendarX, Clock, PhoneCall,
  FlaskConical, Target, Star, Package, CreditCard, Check, Trash2, ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { StaffNotification } from '../types';
import { useLanguage } from '../context/LanguageContext';

/**
 * Sarlavhadagi qo'ng'iroq.
 *
 * Lenta serverdan keladi va har xodimniki alohida (backend/notifications.ts),
 * shuning uchun bu yerda "kimga ko'rinadi" degan mantiq yo'q — faqat ko'rsatish.
 *
 * IKKI XIL SO'ROV: yopiq turganda faqat o'qilmaganlar SONI olinadi, ro'yxat esa
 * ochilganda. Kun bo'yi ochiq turgan oyna butun ro'yxatni yarim daqiqada bir
 * tortib yurmasligi kerak.
 *
 * O'QILDI QILISH: ochilgani yozuvni o'qilgan qilmaydi. Har bir yozuv — hal
 * qilinmagan ish; u bosilganda yoki "Hammasi o'qildi" bosilganda yopiladi.
 * Ochilishning o'zi belgini o'chirsa, ro'yxatga bir marta ko'z tashlaganingda
 * hammasi yo'qoladi va ish esdan chiqadi.
 */

/** Hodisa turi → belgi va rang. Noma'lum tur ham chiroyli ko'rinadi. */
const LOOK: Record<string, { Icon: any; cls: string }> = {
  payment_to_cashier: { Icon: Wallet, cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
  money_uncollected: { Icon: Wallet, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
  debt_created: { Icon: Wallet, cls: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' },
  bot_appointment: { Icon: CalendarPlus, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400' },
  appointment_cancelled: { Icon: CalendarX, cls: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' },
  appointment_moved: { Icon: Clock, cls: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' },
  recall_due: { Icon: PhoneCall, cls: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400' },
  lab_order_ready: { Icon: FlaskConical, cls: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400' },
  new_lead: { Icon: Target, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400' },
  new_review: { Icon: Star, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
  low_stock: { Icon: Package, cls: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400' },
  subscription_expiring: { Icon: CreditCard, cls: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' },
};
const DEFAULT_LOOK = { Icon: Bell, cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300' };

interface Props {
  /** Shu rolga ochiq bo'limlar (App dagi visibleNavigation id lari). */
  allowedModules: string[];
}

export const NotificationBell: React.FC<Props> = ({ allowedModules }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const { count } = await api.notifications.getUnreadCount();
      setCount(count);
    } catch {
      // Jim: internet uzilganda qo'ng'iroq xato ko'rsatib turishi kerak emas
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.notifications.getAll();
      setItems(list);
      setCount(list.filter(n => !n.read).length);
    } catch {
      // Jim
    } finally {
      setLoading(false);
    }
  }, []);

  // Yopiq turganda faqat raqam. Oyna fokusga qaytganda ham tekshiriladi:
  // odam boshqa ishdan qaytganda eng birinchi shu raqamga qaraydi.
  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, 30000);
    const onFocus = () => loadCount();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [loadCount]);

  useEffect(() => {
    if (!open) return;
    loadItems();
    const id = setInterval(loadItems, 30000);
    return () => clearInterval(id);
  }, [open, loadItems]);

  // Tashqariga bosilsa yoki Esc bosilsa yopiladi
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  /**
   * Yozuv qayerga olib boradi. Bo'lim shu rolga yopiq bo'lsa manzil yo'q —
   * bosilganda "ruxsat yo'q" sahifasiga otib yuborishdan ko'ra, bosilmaydigan
   * qator qolgani tushunarli.
   */
  const targetOf = (n: StaffNotification): string | null => {
    if (!n.link) return null;
    const moduleId = n.link.split('?')[0].split('/')[1] || 'dashboard';
    return allowedModules.includes(moduleId) ? n.link : null;
  };

  const openItem = async (n: StaffNotification) => {
    const target = targetOf(n);
    if (!n.read) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setCount(c => Math.max(0, c - 1));
      api.notifications.markRead(n.id).catch(() => {});
    }
    if (target) { setOpen(false); navigate(target); }
  };

  const markAll = async () => {
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    setCount(0);
    api.notifications.markAllRead().catch(() => {});
  };

  const clearAll = async () => {
    setItems([]);
    setCount(0);
    api.notifications.clear().catch(() => {});
  };

  const ago = (iso: string) => {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return t('notif.justNow');
    if (min < 60) return `${min} ${t('notif.minutesAgo')}`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} ${t('notif.hoursAgo')}`;
    if (hours < 48) return t('notif.yesterday');
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const unread = useMemo(() => items.filter(n => !n.read), [items]);
  const read = useMemo(() => items.filter(n => n.read), [items]);

  const row = (n: StaffNotification) => {
    const { Icon, cls } = LOOK[n.type] || DEFAULT_LOOK;
    const target = targetOf(n);
    return (
      <button
        key={n.id}
        onClick={() => openItem(n)}
        className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-0
                    ${n.read ? 'hover:bg-gray-50 dark:hover:bg-gray-700/30' : 'bg-primary-50/40 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}
      >
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm leading-snug ${n.read ? 'text-gray-600 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
            {n.title}
          </span>
          {n.body && (
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</span>
          )}
          <span className="block text-[11px] text-gray-400 mt-1">{ago(n.createdAt)}</span>
        </span>
        {target && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-2.5" />}
      </button>
    );
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('notif.title')}
        className="relative p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center
                           text-[10px] font-bold text-white bg-rose-500 rounded-full ring-2 ring-white dark:ring-gray-800">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Telefonda panel qo'ng'iroqqa emas, ekranga bog'lanadi: qo'ng'iroq
          o'ng chetda emas (yonida menyu tugmasi bor), shuning uchun unga
          tiralgan 360px lik panel chap chetdan chiqib ketardi. */}
      {open && (
        <div className="fixed left-3 right-3 top-[72px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]
                        bg-white dark:bg-gray-800
                        rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50
                        animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="font-semibold text-sm text-gray-900 dark:text-white">{t('notif.title')}</span>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  onClick={markAll}
                  title={t('notif.markAllRead')}
                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={clearAll}
                  title={t('notif.clear')}
                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {loading ? '…' : t('notif.empty')}
                </p>
                {!loading && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">{t('notif.emptyHint')}</p>
                )}
              </div>
            ) : (
              <>
                {unread.length > 0 && (
                  <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 dark:bg-gray-900/40">
                    {t('notif.new')}
                  </div>
                )}
                {unread.map(row)}
                {read.length > 0 && (
                  <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 dark:bg-gray-900/40">
                    {t('notif.earlier')}
                  </div>
                )}
                {read.map(row)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
