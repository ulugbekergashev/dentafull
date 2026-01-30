import { useState, useEffect } from 'react';

// Make deferredPrompt global and capture it IMMEDIATELY
let deferredPrompt: any = null;

// Add listener immediately when this file is imported
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e: any) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        console.log('PWA Install Prompt captured (Global Listener)');

        // Dispatch a custom event to notify components
        window.dispatchEvent(new Event('pwa-installable'));
    });
}

export function usePWAInstall() {
    const [isInstallable, setIsInstallable] = useState(!!deferredPrompt);

    useEffect(() => {
        // Check initial state
        if (deferredPrompt) {
            setIsInstallable(true);
        }

        // Listen for our custom event
        const handleInstallable = () => {
            setIsInstallable(true);
        };

        window.addEventListener('pwa-installable', handleInstallable);
        // Also listen for the original event heavily just in case
        const handleOriginal = (e: any) => {
            e.preventDefault();
            deferredPrompt = e;
            setIsInstallable(true);
        };
        window.addEventListener('beforeinstallprompt', handleOriginal);

        return () => {
            window.removeEventListener('pwa-installable', handleInstallable);
            window.removeEventListener('beforeinstallprompt', handleOriginal);
        };
    }, []);

    const install = async () => {
        if (!deferredPrompt) {
            console.log('No deferred prompt available');
            return;
        }

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }

        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        setIsInstallable(false);
    };

    return { isInstallable, install };
}
