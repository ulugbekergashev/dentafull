import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import { DentaAiMode } from '../pages/DentaAiMode';
import { UserRole } from '../types';

// ─── DentaAI paneli ───────────────────────────────────────────────────────────
//
// Ilgari AI Boshqaruv paneli ichidagi tab edi — ya'ni unga kirish uchun
// avval bosh sahifaga qaytish kerak edi. Shifokor esa Kalendar yoki Bemor
// kartasida turadi va aynan o'sha yerda savol beradi: "bu bemorning qarzi
// qancha?". Har safar sahifa almashtirish kontekstni yo'qotardi.
//
// Endi panel sarlavhadagi DAI tugmasidan yoki hot key bilan HAR QANDAY
// sahifa ustidan ochiladi. Ostidagi sahifa joyida qoladi — panel yopilgach
// foydalanuvchi o'sha yerda davom etadi.

interface Props {
    open: boolean;
    onClose: () => void;
    userRole: UserRole;
    /** Ochilishi bilan mikrofonni yoqish (hot key orqali kelganda). */
    autoVoice?: boolean;
}

export const AiOverlay: React.FC<Props> = ({ open, onClose, userRole, autoVoice }) => {
    const panelRef = useRef<HTMLDivElement>(null);

    // Panel ochiq turganda orqadagi sahifa suriladigan bo'lib qolmasin —
    // aks holda sichqoncha g'ildiragi ostidagi ro'yxatni suradi va bu
    // chalkashtiradi.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            // Esc panelni yopadi — lekin ovoz tinglanayotgan bo'lsa, undan
            // oldin DentaAiMode uni to'xtatadi va hodisani to'xtatib qoladi.
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[60] flex items-start justify-center
                               bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm
                               px-4 py-6 sm:py-10 overflow-y-auto"
                    onMouseDown={e => {
                        // Faqat fonning O'ZIGA bosilganda yopamiz. Panel ichida
                        // matn belgilab, sichqonchani tashqarida qo'yib yuborish
                        // odatiy hol — u panelni yopmasligi kerak.
                        if (e.target === e.currentTarget) onClose();
                    }}
                >
                    <motion.div
                        ref={panelRef}
                        initial={{ opacity: 0, y: 16, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.99 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-4xl rounded-3xl shadow-2xl
                                   bg-white dark:bg-[#0F1216]
                                   ring-1 ring-gray-200 dark:ring-white/[0.08]
                                   overflow-hidden"
                    >
                        {/* Sarlavha */}
                        <div className="flex items-center justify-between px-6 sm:px-8 py-4
                                        border-b border-gray-100 dark:border-white/[0.06]">
                            <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-xl grid place-items-center
                                                 bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </span>
                                <div>
                                    <div className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight">
                                        DentaAI
                                    </div>
                                    <div className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
                                        Klinikangiz ma'lumotlari asosida
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={onClose}
                                aria-label="Yopish"
                                className="w-9 h-9 grid place-items-center rounded-xl
                                           text-gray-400 dark:text-gray-500
                                           hover:bg-gray-100 dark:hover:bg-white/[0.06]
                                           hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            >
                                <X className="w-[18px] h-[18px]" />
                            </button>
                        </div>

                        {/* Mazmun */}
                        <div className="px-5 sm:px-8 pb-8 pt-2 max-h-[75vh] overflow-y-auto">
                            <DentaAiMode userRole={userRole} autoVoice={autoVoice} />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AiOverlay;
