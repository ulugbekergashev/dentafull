import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { UserRole } from '../types';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

export interface BottomNavItem {
    id: string;
    labelKey: string;
    icon: React.ElementType;
}

interface BottomNavProps {
    userRole: UserRole;
    /**
     * Yon menyudagi ro'yxatning o'zi — rol, ruxsatlar va moliya ko'rinishi
     * bo'yicha App'da allaqachon filtrlangan. Ilgari bu yerda alohida, qo'lda
     * yozilgan ro'yxat bor edi: nomlari boshqacha ("Bosh Paneli") va tarjimasiz.
     */
    items: BottomNavItem[];
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
}

// Telefonda eng ko'p ochiladigan bo'limlar pastki qatorga birinchi chiqadi.
// Qolganlari yon menyudagi tartibida, "Barchasi" ortida.
const MOBILE_PRIORITY = ['dashboard', 'patients', 'calendar', 'finance'];

const pathOf = (id: string) => (id === 'dashboard' ? '/' : `/${id}`);

export const BottomNav: React.FC<BottomNavProps> = ({ userRole, items, isSidebarOpen, setIsSidebarOpen }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLanguage();

    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.SALES_AGENT || items.length === 0) return null;

    const rank = (id: string) => {
        const index = MOBILE_PRIORITY.indexOf(id);
        return index === -1 ? MOBILE_PRIORITY.length : index;
    };
    // sort barqaror: ustuvor bo'lmaganlar yon menyudagi tartibini saqlaydi
    const ordered = [...items].sort((a, b) => rank(a.id) - rank(b.id));

    // 5 tagacha bo'lsa hammasi ko'rinadi, ko'p bo'lsa birinchi 4 tasi va "Barchasi"
    const showMore = ordered.length > 5;
    const visibleItems = showMore ? ordered.slice(0, 4) : ordered;

    const isActive = (id: string) => {
        if (id === 'dashboard') return location.pathname === '/';
        const path = pathOf(id);
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
    };

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 px-2 pb-safe-area-inset-bottom">
            <div className="flex justify-around items-center h-16">
                {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.id);

                    return (
                        <button
                            key={item.id}
                            onClick={() => navigate(pathOf(item.id))}
                            className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 relative ${active
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${active ? 'bg-primary-50 dark:bg-primary-900/30 scale-110' : ''}`}>
                                <Icon className={`w-5 h-5 ${active ? 'fill-current' : ''}`} />
                            </div>
                            <span className="text-[10px] font-medium mt-1 truncate max-w-full px-1">{t(item.labelKey as TranslationKey)}</span>
                            {active && (
                                <div className="absolute bottom-1 w-1 h-1 bg-primary-600 dark:bg-primary-400 rounded-full" />
                            )}
                        </button>
                    );
                })}

                {showMore && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${isSidebarOpen
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all duration-300 ${isSidebarOpen ? 'bg-primary-50 dark:bg-primary-900/30 scale-110' : ''}`}>
                            <MoreHorizontal className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium mt-1">{t('nav.more')}</span>
                    </button>
                )}
            </div>
        </nav>
    );
};
