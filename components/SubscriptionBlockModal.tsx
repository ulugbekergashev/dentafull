
import React from 'react';
import { Lightbulb, Phone, Send } from 'lucide-react';
import { Button } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { openSupport, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from '../services/support';

interface SubscriptionBlockModalProps {
  isOpen: boolean;
}

export const SubscriptionBlockModal: React.FC<SubscriptionBlockModalProps> = ({ isOpen }) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" />
      
      <div className="relative w-full max-w-md transform rounded-3xl bg-white dark:bg-gray-900 shadow-2xl transition-all overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
        <div className="p-8 flex flex-col items-center text-center">
          {/* Icon Section */}
          <div className="mb-6">
            <div className="w-20 h-20 bg-yellow-50 dark:bg-yellow-900/20 rounded-full flex items-center justify-center animate-pulse">
              <Lightbulb className="w-12 h-12 text-yellow-500 fill-yellow-500/20" />
            </div>
          </div>

          {/* Title and Text */}
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {t('auto.Tizim bloklandi')}
          </h3>

          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            {t('auto.Sizning tarifingizning amal qilish muddati tugagan.')}
          </p>

          <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            {t('auto.Tizim funksiyalari vaqtincha cheklangan.')} <br />
            {t("auto.Davom ettirish uchun Telegram orqali yozing — to'lov chekini ham shu yerga yuborasiz.")}
          </p>

          {/* Asosiy amal: yordam boti. Xodim tizimga kirgan — bot qaysi klinika yozayotganini o'zi biladi */}
          <Button
            data-support="blocked"
            className="w-full h-14 text-base font-bold uppercase tracking-wider bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-lg shadow-primary-500/20 transition-all active:scale-95 mb-4"
            onClick={() => { void openSupport(); }}
          >
            <Send className="w-5 h-5 mr-2" />
            {t('auto.Telegram orqali yozish')}
          </Button>

          {/* Telegram ishlamasa — telefon */}
          <div className="mt-4 pt-6 border-t border-gray-100 dark:border-gray-800 w-full text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t("auto.Yoki qo'ng'iroq qiling:")}
            </p>
            <a
              href={SUPPORT_PHONE_HREF}
              className="inline-flex items-center text-primary-600 dark:text-primary-400 font-bold hover:underline gap-1.5"
            >
              <Phone className="w-4 h-4" />
              {SUPPORT_PHONE}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
