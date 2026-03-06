import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, DollarSign, Activity, Package, Settings, MoreHorizontal } from 'lucide-react';
import { UserRole } from '../types';

interface BottomNavProps {
    userRole: UserRole;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ userRole, isSidebarOpen, setIsSidebarOpen }) => {
    const navigate = useNavigate();
    const location = useLocation();

    if (userRole === UserRole.SUPER_ADMIN) return null;

    // Full list of available items for clinic roles
    const allItems = [
        { id: 'dashboard', path: '/', label: 'Bosh Paneli', icon: LayoutDashboard, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
        { id: 'patients', path: '/patients', label: 'Bemorlar', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
        { id: 'calendar', path: '/calendar', label: 'Kalendar', icon: Calendar, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
        { id: 'finance', path: '/finance', label: 'Moliya', icon: DollarSign, roles: [UserRole.CLINIC_ADMIN] },
        { id: 'doctors', path: '/doctors', label: 'Shifokorlar', icon: Activity, roles: [UserRole.CLINIC_ADMIN] },
        { id: 'inventory', path: '/inventory', label: 'Ombor', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
        { id: 'settings', path: '/settings', label: 'Sozlamalar', icon: Settings, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    ];

    // Filter items based on role
    const allowedItems = allItems.filter(item => item.roles.includes(userRole));

    // If items <= 5, show all. If > 5, show first 4 and a "More" button.
    const showMore = allowedItems.length > 5;
    const visibleItems = showMore ? allowedItems.slice(0, 4) : allowedItems;

    const isActive = (item: typeof allItems[0]) => {
        if (item.id === 'dashboard') return location.pathname === '/';
        if (item.id === 'patients') return location.pathname.startsWith('/patients');
        return location.pathname === item.path;
    };

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 px-2 pb-safe-area-inset-bottom">
            <div className="flex justify-around items-center h-16">
                {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);

                    return (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 relative ${active
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${active ? 'bg-blue-50 dark:bg-blue-900/30 scale-110' : ''}`}>
                                <Icon className={`w-5 h-5 ${active ? 'fill-current' : ''}`} />
                            </div>
                            <span className="text-[10px] font-medium mt-1 truncate max-w-full px-1">{item.label}</span>
                            {active && (
                                <div className="absolute bottom-1 w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full" />
                            )}
                        </button>
                    );
                })}

                {showMore && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${isSidebarOpen
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all duration-300 ${isSidebarOpen ? 'bg-blue-50 dark:bg-blue-900/30 scale-110' : ''}`}>
                            <MoreHorizontal className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium mt-1">Barchasi</span>
                    </button>
                )}
            </div>
        </nav>
    );
};
