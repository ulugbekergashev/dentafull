import React from 'react';
import { Modal, Button } from './Common';
import { Users, CreditCard } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface UpgradePlanModalProps {
   isOpen: boolean;
   onClose: () => void;
   /**
    * doctorLimit — yangi shifokor qo'shishda tarif chekloviga yetildi.
    * plan — Sozlamalar → Tarif bo'limidan o'z xohishi bilan ochildi.
    */
   reason?: 'doctorLimit' | 'plan';
}

// Tarifni yangilash oynasi: menejer bilan bog'lanish ma'lumotlari.
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{limitReached ? 'Cheklovlarni olib tashlang!' : "Tarifni o'zgartirish"}</h3>
            <p className="text-gray-500 dark:text-gray-400 px-4">
               {limitReached
                  ? "Sizning tarifingiz bo'yicha yangi shifokor qo'sha olmaysiz. Iltimos, tarifingizni o'zgartirish uchun menejer bilan bog'laning!"
                  : "Tarifni yangilash yoki o'zgartirish uchun menejer bilan bog'laning."}
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2">
               <p className="font-bold text-gray-900 dark:text-white text-lg">+998 90 824 29 92</p>
               <a
                  href="https://t.me/ergashevulugbekk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-primary-500 hover:text-primary-600 font-medium"
               >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.44-.42-1.38-.88.03-.24.38-.49 1.03-.75 4.06-1.77 6.77-2.94 8.13-3.51 3.87-1.6 4.67-1.88 5.2-1.88.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.13-.03.23z" />
                  </svg>
                  t.me/ergashevulugbekk
               </a>
            </div>
            <div className="pt-2">
               <Button onClick={onClose}>Tushunarli</Button>
            </div>
         </div>
      </Modal>
   );
};
