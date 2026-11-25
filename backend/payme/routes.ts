// ─── Payme: HTTP yo'llari ────────────────────────────────────────────────────
//   POST /api/payme              — Payme serveri (Merchant API, JSON-RPC)
//   GET  /api/payme/quote        — ilova: onlayn to'lov yoqilganmi va narxlar
//   POST /api/payme/orders       — ilova: buyurtma yaratib, to'lov havolasini oladi

import express from 'express';
import { PaymeMerchant, UNPARSABLE_BODY } from './merchant';
import { PaymeOrderError, PaymeOrders } from './orders';

export const PAYME_RPC_PATH = '/api/payme';

// Payme bu manzilga to'lov bo'lganda ham, bekor qilinganda ham qaytaradi —
// shuning uchun "to'landi" degan belgi qo'yilmaydi, Tarif bo'limi haqiqiy muddatni ko'rsatadi.
const DEFAULT_RETURN = 'https://dentacrm.uz/settings?tab=plan';

/**
 * To'lovdan keyin qaytish manzili faqat o'zimizning saytga bo'lishi mumkin:
 * aks holda bizning havolamiz orqali odamni begona saytga yuborish mumkin bo'lardi.
 */
export const safeReturnUrl = (raw: unknown): string => {
    try {
        const u = new URL(String(raw || ''));
        const host = u.hostname.toLowerCase();
        const ours = host === 'dentacrm.uz' || host.endsWith('.dentacrm.uz') || host === 'dentafull.vercel.app';
        const local = host === 'localhost' && u.protocol === 'http:';
        if ((ours && u.protocol === 'https:') || local) return u.toString();
    } catch { /* noto'g'ri manzil */ }
    return DEFAULT_RETURN;
};

export interface PaymeRouteDeps {
    merchant: PaymeMerchant;
    orders: PaymeOrders;
    authenticateToken: express.RequestHandler;
}

export const registerPaymeRoutes = (app: express.Express, deps: PaymeRouteDeps) => {
    const { merchant, orders, authenticateToken } = deps;

    // Payme "text/json" yuboradi — umumiy express.json() buni o'qimaydi, shuning uchun
    // server.ts bu yo'lni umumiy JSON o'quvchidan chetlab o'tkazadi va bu yerda xom matn olinadi.
    const rawBody = express.text({ type: () => true, limit: '64kb' });
    app.all(PAYME_RPC_PATH, (req, res) => {
        // Tana o'qilmasa (juda katta, noma'lum kodirovka) ham Payme HTML emas, JSON-RPC xato oladi
        rawBody(req, res, async (parseError?: unknown) => {
            const reply = await merchant.handle({
                httpMethod: req.method,
                authorization: req.headers['authorization'],
                body: parseError ? UNPARSABLE_BODY : req.body,
            });
            res.status(200).json(reply);
        });
    });

    const clinicOf = (req: any): string | null => {
        const u = req.user;
        return u && u.role !== 'SUPER_ADMIN' && u.clinicId ? String(u.clinicId) : null;
    };

    app.get('/api/payme/quote', authenticateToken, async (req: any, res) => {
        try {
            const clinicId = clinicOf(req);
            if (!clinicId) return res.json({ success: true, data: null });
            res.json({ success: true, data: await orders.quote(clinicId) });
        } catch (e: any) {
            if (e instanceof PaymeOrderError) return res.status(e.status).json({ success: false, error: e.message });
            console.error('[payme] narxni olib bo\'lmadi:', e?.message);
            res.status(500).json({ success: false, error: "Narxni olib bo'lmadi" });
        }
    });

    app.post('/api/payme/orders', authenticateToken, async (req: any, res) => {
        try {
            const clinicId = clinicOf(req);
            if (!clinicId) return res.status(403).json({ success: false, error: "Ruxsat yo'q" });
            const order = await orders.create({
                clinicId,
                months: Number(req.body?.months),
                createdBy: req.user?.name ? String(req.user.name) : null,
                returnUrl: safeReturnUrl(req.body?.returnUrl),
                lang: req.body?.lang === 'ru' ? 'ru' : 'uz',
            });
            res.json({ success: true, data: order });
        } catch (e: any) {
            if (e instanceof PaymeOrderError) return res.status(e.status).json({ success: false, error: e.message });
            console.error('[payme] buyurtma yaratib bo\'lmadi:', e?.message);
            res.status(500).json({ success: false, error: "To'lovni boshlab bo'lmadi" });
        }
    });
};
