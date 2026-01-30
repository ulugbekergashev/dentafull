import React from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export const InstallPWAButton = () => {
    const { isInstallable, install } = usePWAInstall();

    if (!isInstallable) {
        return null;
    }

    return (
        <button
            onClick={install}
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg transition-all duration-300 animate-fade-in"
        >
            <Download size={20} />
            <span>Ilovani o'rnatish</span>
        </button>
    );
};
