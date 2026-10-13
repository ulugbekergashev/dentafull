import React from 'react';
import { BarChart3, BookOpen, LifeBuoy, MessagesSquare, ScrollText, Settings2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportUrl } from './supportUi';
import { SupportOverviewTab } from './SupportOverviewTab';
import { SupportTicketsTab } from './SupportTicketsTab';
import { SupportArticlesTab } from './SupportArticlesTab';
import { SupportSettingsTab } from './SupportSettingsTab';
import { SupportLogsTab } from './SupportLogsTab';

// ─── Superadmin → Yordam boti ────────────────────────────────────────────────
// DentaCRM mijozlariga Telegramda odam o'rniga javob beradigan botning
// boshqaruv ekrani. Faqat platforma egasi ko'radi (sotuvchiga ochilmaydi —
// buni pages/SuperAdminDashboard.tsx hal qiladi, server ham shu rolni talab qiladi).
//
// Ichki bo'lim manzilda turadi: /admin?tab=support&view=tickets

const VIEWS = ['stats', 'tickets', 'kb', 'settings', 'logs'] as const;
type ViewId = typeof VIEWS[number];

/** Ichki bo'lim almashganda oldingisining manzildagi holati tozalanadi */
const VIEW_SCOPED_PARAMS = { status: null, ticket: null, article: null };

const SupportPanel: React.FC = () => {
    const { t } = useLanguage();
    const url = useSupportUrl();

    const requested = url.get('view') as ViewId;
    const activeView: ViewId = VIEWS.includes(requested) ? requested : 'stats';

    const tabs: { id: ViewId; label: string; icon: LucideIcon }[] = [
        { id: 'stats', label: t("auto.Ko'rsatkichlar"), icon: BarChart3 },
        { id: 'tickets', label: t('auto.Murojaatlar'), icon: MessagesSquare },
        { id: 'kb', label: t('auto.Bilim bazasi'), icon: BookOpen },
        { id: 'settings', label: t('nav.settings'), icon: Settings2 },
        { id: 'logs', label: t('auto.Qaydlar'), icon: ScrollText },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <LifeBuoy className="w-5 h-5 text-primary-500" /> {t('auto.Yordam boti')}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t("auto.Mijozlarning Telegramdagi savollariga sizning o'rningizga javob beradi")}
                    </p>
                </div>

                {/* Ilovaning boshqa sahifalaridagi ichki tablar bilan bir xil ko'rinish (Moliya, Xodimlar) */}
                <div className="max-w-full overflow-x-auto no-scrollbar">
                    <div
                        className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-max"
                        role="tablist"
                        aria-label={t('auto.Yordam boti')}
                    >
                        {tabs.map(({ id, label, icon: Icon }) => {
                            const isActive = id === activeView;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => url.update({ ...VIEW_SCOPED_PARAMS, view: id === 'stats' ? null : id })}
                                    className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${isActive
                                        ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                                >
                                    <Icon className="w-4 h-4 hidden sm:block" /> {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div role="tabpanel">
                {activeView === 'stats' && <SupportOverviewTab />}
                {activeView === 'tickets' && <SupportTicketsTab />}
                {activeView === 'kb' && <SupportArticlesTab />}
                {activeView === 'settings' && <SupportSettingsTab />}
                {activeView === 'logs' && <SupportLogsTab />}
            </div>
        </div>
    );
};

export default SupportPanel;
