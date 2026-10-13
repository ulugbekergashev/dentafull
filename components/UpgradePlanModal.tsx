import React from 'react';
import { Modal, Button } from './Common';
import { Users, CreditCard, Send } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { openSupport, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from '../services/support';

interface UpgradePlanModalProps {
   isOpen: boolean;
   onClose: () => void;
   /**
    * doctorLimit — yangi shifokor qo'shishda tarif chekloviga yetildi.
    * plan — Sozlamalar → Tarif bo'limidan o'z xohishi bilan ochildi.
    */
   reason?: 'doctorLimit' | 'plan';
}

// Tarifni yangilash oynasi: yordam botiga yozish (to'lov cheki ham shu yerga yuboriladi) va telefon.
// Ilgari Sozlamalar ichida edi va sarlavhasi qo'shtirnoq ichida yozilgani uchun
// ekranda "{t('settings.services.upgrade')}" degan xom matn chiqib turardi.
export const UpgradePlanModal: React.FC<UpgradePlanModalProps> = ({ isOpen, onClose, reason = 'plan' }) => {
   const { t } = useLanguage();
   const limitReached = reason === 'doctorLimit';
   const Icon = limitReached ? Users : CreditCard;

   return (
      <Modal isOpen={isOpen} onClose={onClose} title={t('settings.services.upgrade')}>
         <div className="text-center py-4 space-y-4">
            <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
               <Icon className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{limitReached ? t('auto.Cheklovlarni olib tashlang!') : t("auto.Tarifni o'zgartirish")}</h3>
            <p className="text-gray-500 dark:text-gray-400 px-4">
               {limitReached
                  ? t("auto.Sizning tarifingizda yangi shifokor qo'shib bo'lmaydi. Tarifni o'zgartirish uchun Telegram orqali yozing.")
                  : t("auto.Tarifni yangilash yoki o'zgartirish uchun Telegram orqali yozing — to'lov chekini ham shu yerga yuborasiz.")}
            </p>
            {/* Asosiy amal: yordam boti (xodim tizimga kirgan — bot qaysi klinika yozayotganini o'zi biladi) */}
            <Button data-support="upgrade" className="w-full" onClick={() => { void openSupport(); }}>
               <Send className="w-4 h-4 mr-2" />
               {t('auto.Telegram orqali yozish')}
            </Button>
            {/* Telegram ishlamasa — telefon */}
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-1">
               <p className="text-sm text-gray-500 dark:text-gray-400">{t("auto.Yoki qo'ng'iroq qiling:")}</p>
               <a href={SUPPORT_PHONE_HREF} className="block font-bold text-gray-900 dark:text-white text-lg hover:underline">{SUPPORT_PHONE}</a>
            </div>
            <div className="pt-2">
               <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
            </div>
         </div>
      </Modal>
   );
};
