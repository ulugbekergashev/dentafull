// Yordam botining HTTP yo'llari: ilova (Yordam tugmasi, xato qaydi, parol
// almashtirish) va super admin paneli (Support bo'limi).

import { PasswordChangeError, changeOwnPassword } from '../passwordChange';
import type { Diag } from '../diag';
import { createAdmin } from './admin';
import type { Support } from './index';
import { ARTICLE_ID_RE } from './kb';
import { CATEGORIES } from './settings';

export interface RouteDeps {
    support: Support;
    db: any;
    diag: Diag;
    authenticateToken: any;
    requireRole: (...roles: string[]) => any;
    /** true — chegaradan oshmagan (server.ts dagi xotiradagi hisoblagich) */
    rateLimit: (key: string, limit: number, windowMs: number) => boolean;
    /** Token bo'lsa foydalanuvchini qaytaradi, bo'lmasa yoki yaroqsiz bo'lsa — null */
    optionalUser: (req: any) => any | null;
}

const HOUR = 60 * 60 * 1000;
const userKey = (u: any) => u?.doctorId || u?.receptionistId || u?.technicianId || u?.salesAgentId || u?.clinicId || u?.role || 'anon';
const clientIp = (req: any): string =>
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
const str = (v: any, max: number): string => String(v ?? '').slice(0, max);

export const registerSupportRoutes = (app: any, deps: RouteDeps): void => {
    const { support, db, diag, authenticateToken, requireRole, rateLimit } = deps;
    const admin = createAdmin({ db, tickets: support.tickets, kb: support.kb, settings: support.settings });
    const superOnly = [authenticateToken, requireRole('SUPER_ADMIN')];

    const guard = (handler: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
        try {
            await handler(req, res);
        } catch (e: any) {
            console.error(`[support:api] ${req.method} ${req.path}:`, e?.message);
            res.status(500).json({ success: false, error: 'Xatolik yuz berdi' });
        }
    };

    // ── Ilova ───────────────────────────────────────────────────────────────

    // Bot yoqilganmi. null bo'lsa ilova eski yordam havolalarini ko'rsatadi.
    app.get('/api/support/info', (_req: any, res: any) => {
        res.json({ success: true, botUsername: support.botUsername() });
    });

    // Tizimga kirgan foydalanuvchi uchun bir martalik Telegram havolasi:
    // bot uni ochgan odamni aynan shu foydalanuvchi deb taniydi.
    app.post('/api/support/link', authenticateToken, guard(async (req, res) => {
        const username = support.botUsername();
        if (!username) return res.status(503).json({ success: false, error: 'Yordam boti hozircha yoqilmagan' });
        if (!rateLimit(`support-link:${userKey(req.user)}`, 20, HOUR)) {
            return res.status(429).json({ success: false, error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." });
        }
        const code = await support.identity.createLinkCode(req.user);
        res.json({ success: true, url: `https://t.me/${username}?start=${code}` });
    }));

    // Brauzerdagi xatolar (utils/errorReporter.ts). Token ixtiyoriy: login
    // sahifasidagi xato ham kelsin. Hech qachon xato qaytarmaydi.
    app.post('/api/client-errors', (req: any, res: any) => {
        res.status(204).end();
        try {
            // Umumiy chegara: IP sarlavhasi (X-Forwarded-For) mijoz tomonidan yoziladi, shuning
            // uchun IP bo'yicha chegara bitta o'zi yetmaydi — butun endpoint uchun soatiga tavan ham bor
            if (!rateLimit('client-error:global', 600, HOUR)) return;
            if (!rateLimit(`client-error:${clientIp(req)}`, 60, HOUR)) return;
            const b = req.body || {};
            const message = str(b.message, 500).trim();
            if (!message) return;
            const user = deps.optionalUser(req);
            const source = ['error', 'rejection', 'boundary'].includes(b.source) ? b.source : 'error';
            // Tokensiz (yoki yaroqsiz tokenli) so'rov bitta umumiy qatorga yig'iladi: tasodifiy matnlar
            // bilan jadvalni to'ldirib bo'lmaydi. Tizimga kirgan foydalanuvchining xatosi esa o'z klinikasiga yoziladi.
            const known = !!user?.clinicId;
            void diag.recordDaily({
                clinicId: known ? user.clinicId : null,
                kind: 'client_error',
                // Manzildan so'rov qismi (id, token) olib tashlanadi
                subject: known ? (str(b.route, 200).split('?')[0] || null) : 'kirishdan oldin',
                message: known ? message : 'Tizimga kirmagan foydalanuvchi sahifasida xato',
                meta: known
                    ? { stack: str(b.stack, 1500), source, build: str(b.build, 40), role: user?.role || null, ua: str(req.headers['user-agent'], 200) }
                    : { source, build: str(b.build, 40) },
            });
        } catch { /* qayd — ikkilamchi */ }
    });

    app.post('/api/auth/change-password', authenticateToken, guard(async (req, res) => {
        if (!rateLimit(`change-password:${userKey(req.user)}`, 10, HOUR)) {
            return res.status(429).json({ success: false, error: "Juda ko'p urinish. Bir soatdan keyin qayta urinib ko'ring." });
        }
        try {
            await changeOwnPassword(db, req.user, req.body?.currentPassword, req.body?.newPassword);
            res.json({ success: true });
        } catch (e: any) {
            if (e instanceof PasswordChangeError) return res.status(400).json({ success: false, error: e.message });
            throw e;
        }
    }));

    // ── Super admin: Support bo'limi ────────────────────────────────────────

    app.get('/api/admin/support/overview', ...superOnly, guard(async (req, res) => {
        const data = await admin.overview(Number(req.query.days) || 30);
        res.json({ success: true, configured: support.configured(), botUsername: support.botUsername(), ...data });
    }));

    app.get('/api/admin/support/tickets', ...superOnly, guard(async (req, res) => {
        const status = ['open', 'waiting_operator', 'human', 'resolved', 'closed'].includes(String(req.query.status)) ? String(req.query.status) : undefined;
        res.json({ success: true, ...(await admin.ticketList({ status, query: str(req.query.q, 100), page: Number(req.query.page) })) });
    }));

    app.get('/api/admin/support/tickets/:id', ...superOnly, guard(async (req, res) => {
        const data = await admin.ticketDetail(req.params.id);
        if (!data) return res.status(404).json({ success: false, error: 'Murojaat topilmadi' });
        res.json({ success: true, ...data });
    }));

    app.post('/api/admin/support/tickets/:id/close', ...superOnly, guard(async (req, res) => {
        await support.tickets.close(req.params.id, 'operator');
        res.json({ success: true });
    }));

    app.get('/api/admin/support/articles', ...superOnly, guard(async (req, res) => {
        res.json({ success: true, items: await support.kb.list({ query: str(req.query.q, 100), module: str(req.query.module, 40) || undefined }) });
    }));

    app.put('/api/admin/support/articles/:id', ...superOnly, guard(async (req, res) => {
        const id = String(req.params.id);
        if (!ARTICLE_ID_RE.test(id)) return res.status(400).json({ success: false, error: "Maqola nomi faqat kichik lotin harflari, raqam, nuqta va chiziqchadan iborat bo'lsin (masalan: sms.balans)" });
        try {
            const b = req.body || {};
            const roles = b.roles === '*' || !b.roles ? '*' : (Array.isArray(b.roles) ? b.roles : String(b.roles).split(',')).map((r: any) => String(r).trim()).filter(Boolean);
            const article = await support.kb.save(id, {
                module: b.module, roles, titleUz: b.titleUz, titleRu: b.titleRu, bodyUz: b.bodyUz, bodyRu: b.bodyRu,
                keywords: Array.isArray(b.keywords) ? b.keywords : String(b.keywords || '').split(',').map(k => k.trim()).filter(Boolean),
                paths: Array.isArray(b.paths) ? b.paths : [], guideId: b.guideId || null,
                active: b.active === undefined ? undefined : !!b.active,
            }, 'learned');
            res.json({ success: true, article });
        } catch (e: any) {
            res.status(400).json({ success: false, error: e?.message || "Saqlab bo'lmadi" });
        }
    }));

    app.delete('/api/admin/support/articles/:id', ...superOnly, guard(async (req, res) => {
        await support.kb.setActive(String(req.params.id), false);
        res.json({ success: true });
    }));

    app.get('/api/admin/support/settings', ...superOnly, guard(async (_req, res) => {
        res.json({ success: true, settings: await support.settings.get(), categories: CATEGORIES });
    }));

    app.put('/api/admin/support/settings', ...superOnly, guard(async (req, res) => {
        res.json({ success: true, settings: await support.settings.set(req.body || {}) });
    }));

    app.get('/api/admin/support/payments', ...superOnly, guard(async (req, res) => {
        res.json({ success: true, items: await admin.payments(str(req.query.clinicId, 60) || undefined) });
    }));

    app.get('/api/admin/support/diag', ...superOnly, guard(async (req, res) => {
        res.json({
            success: true,
            items: await admin.diagList({ clinicId: str(req.query.clinicId, 60) || undefined, kind: str(req.query.kind, 40) || undefined, days: Number(req.query.days) }),
        });
    }));
};
