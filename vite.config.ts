import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'logo.svg'],
        manifestFilename: 'manifest.json',
        manifest: {
          name: 'DentaCRM',
          short_name: 'DentaCRM',
          description: 'Dental Clinic Management System',
          theme_color: '#2563EB',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    // DIQQAT: bu yerga AI provayder kalitlarini QO'YMANG.
    // `define` qiymatlari frontend bundle'ga to'g'ridan-to'g'ri yoziladi va
    // dist/ ni ochgan har qanday odam ularni o'qiy oladi. Barcha AI so'rovlari
    // backend'dagi /api/ai/* orqali o'tadi — kalit faqat serverda qoladi.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
