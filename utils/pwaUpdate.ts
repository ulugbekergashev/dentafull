/**
 * PWA yangilanishini foydalanuvchiga yetkazish.
 *
 * Muammo: vite-plugin-pwa yaratadigan registerSW.js faqat service worker'ni
 * ro'yxatdan o'tkazadi. Yangi versiya fonda yuklanadi va boshqaruvni oladi
 * (skipWaiting + clientsClaim), lekin ochiq sahifa ESKI JavaScript bilan
 * ishlashda davom etadi. Natijada foydalanuvchi har doim bitta yangilanish
 * orqada qoladi va "hech narsa o'zgarmadi" deb o'ylaydi.
 *
 * Yechim: yangi service worker boshqaruvni olganda sahifani bir marta
 * qayta yuklaymiz. Bundan tashqari uzoq ochiq turgan oynalar uchun
 * vaqti-vaqti bilan yangilanish tekshiriladi.
 */

const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // 30 daqiqa

export function setupPwaAutoUpdate() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Birinchi o'rnatishda controller yo'q — u paytdagi controllerchange
    // yangilanish emas, oddiy o'rnatish. Faqat allaqachon boshqaruvchi
    // bo'lgan holatda qayta yuklaymiz.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        window.location.reload();
    });

    navigator.serviceWorker.ready
        .then(registration => {
            const check = () => registration.update().catch(() => { });

            // Oyna qayta faollashganda — kassir ertalab ochganda darrov yangilansin
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') check();
            });

            // Kun bo'yi ochiq turadigan oynalar uchun
            setInterval(check, UPDATE_CHECK_INTERVAL);
        })
        .catch(() => { });
}
