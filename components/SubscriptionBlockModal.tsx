
import React from 'react';
import { Lightbulb, ExternalLink } from 'lucide-react';
import { Button } from './Common';

interface SubscriptionBlockModalProps {
  isOpen: boolean;
}

export const SubscriptionBlockModal: React.FC<SubscriptionBlockModalProps> = ({ isOpen }) => {
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
            Tizim bloklandi
          </h3>
          
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            Sizning tarifingizning amal qilish muddati tugagan.
          </p>
          
          <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            Tizim funksiyalari vaqtincha cheklangan. <br />
            Iltimos, foydalanishni davom ettirish uchun menejer bilan bog'laning.
          </p>

          {/* Action Button - Replaced with primary contact button */}
          <Button 
            className="w-full h-14 text-base font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 mb-4"
            onClick={() => window.open('https://t.me/dentacrm', '_blank')}
          >
            MENEJER BILAN BOG'LANISH
          </Button>

          {/* Footer / Support */}
          <div className="mt-4 pt-6 border-t border-gray-100 dark:border-gray-800 w-full text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Batafsil ma'lumot olish uchun:
            </p>
            <a 
              href="https://t.me/dentacrm" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 font-bold hover:underline gap-1 uppercase text-xs"
            >
              DENTACRM ADMIN
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
