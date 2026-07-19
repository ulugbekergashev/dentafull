// PREVENT SERVER CRASH ON STARTUP
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});

import express from 'express';
const app = express();
const PORT = process.env.PORT || 3001;

// IMMEDIATE HEALTH CHECK
app.get('/health', (req, res) => res.status(200).send('OK - v1.0.2'));
app.get('/test-fb', (req, res) => res.status(200).send('FB-TEST-OK'));
app.get('/', (req, res) => res.status(200).send('Dental CRM Backend is UP! - v1.0.2'));

// Google Edge TTS Proxy Endpoint
app.get('/api/tts', async (req: any, res: any) => {
    try {
        const { text, lang } = req.query;
        if (!text) {
            return res.status(400).send('Text is required');
        }
        
        let voice = 'uz-UZ-MadinaNeural'; // Default
        const cleanLang = String(lang || 'uz').toLowerCase();
        if (cleanLang === 'ru') {
            voice = 'ru-RU-SvetlanaNeural';
        } else if (cleanLang === 'en') {
            voice = 'en-US-AriaNeural';
        }
        
        console.log(`[TTS] Synthesizing "${text.substring(0, 30)}..." using voice=${voice}`);
        
        const { EdgeTTS } = require('@andresaya/edge-tts');
        const tts = new EdgeTTS();
        await tts.synthesize(text, voice);
        const buffer = tts.toBuffer();
        
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length
        });
        res.send(buffer);
    } catch (err: any) {
        console.error('[TTS] proxy error:', err.message);
        res.status(500).send('TTS failed');
    }
});

// Load everything else
const cron = require('node-cron');
const { botManager } = require('./botManager');
const { smsService } = require('./smsService');
const { dmedService } = require('./dmedService');
const cors = require('cors');
const axios = require('axios');
const { prisma } = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer
// Configure Multer with structured folder hierarchy for multi-tenant safety
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req: any, file: any) => {
        // Multi-tenant xavfsizlik: oddiy rol uchun clinicId tokendan olinadi.
        // (authenticateToken multer'dan oldin ishlaydi, shu sababli req.user mavjud.)
        const user = req.user;
        const clinicId = (user && user.role !== 'SUPER_ADMIN' && user.clinicId)
            ? user.clinicId
            : (req.query?.clinicId || req.body?.clinicId || 'general');
        const patientId = req.query?.patientId || req.body?.patientId || 'unknown';
        return {
            folder: `denta7/clinics/${clinicId}/patients/${patientId}`,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`
        };
    }
});

const upload = multer({ storage: storage });
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('🔥 KRITIK: JWT_SECRET muhit o\'zgaruvchisi o\'rnatilmagan! Server xavfsiz ishlay olmaydi.');
    process.exit(1);
}


// Standard CORS Middleware
const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:3005',
            'https://dentafull-production.up.railway.app',
            'https://dentafull.vercel.app',
            'https://dentacrm.uz',
            'http://dentacrm.uz',
            'https://www.dentacrm.uz',
            'http://www.dentacrm.uz'
        ];
        
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin) || origin.endsWith('.dentacrm.uz')) {
            callback(null, true);
        } else {
            console.warn('⚠️ CORS Blocked Origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// Pre-flight handling is integrated into app.use(cors())

app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
    res.send('Dental CRM Backend is running!');
});



const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const isDev = process.env.NODE_ENV === 'development';

    if (!token) {
        return res.status(401).json({ error: 'Token topilmadi (Unauthorized)' });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
            if (isDev) console.log('❌ Token verification failed:', err.message);
            return res.status(403).json({ error: 'Token yaroqsiz (Forbidden)' });
        }
        (req as any).user = user;
        // Multi-tenant himoya: oddiy rol uchun body'dagi clinicId majburan o'z klinikasiga tenglashtiriladi.
        // Bu boshqa klinika nomidan yozuv yaratish/o'zgartirishni bloklaydi. SUPER_ADMIN bundan mustasno.
        if (user?.role !== 'SUPER_ADMIN' && user?.clinicId && req.body && typeof req.body === 'object' && 'clinicId' in req.body) {
            (req.body as any).clinicId = user.clinicId;
        }
        next();
    });
};

// ─── Xavfsizlik yordamchilari (multi-tenant izolyatsiya) ──────────────────────
// Klinikaga bog'liq endpointlar uchun "samarali clinicId"ni aniqlaydi.
// Oddiy rollar: clinicId tokendan olinadi (mijoz yuborgan qiymat e'tiborga olinmaydi).
// SUPER_ADMIN: mijoz yuborgan clinicId'ga ishonadi (u barcha klinikalarni boshqaradi).
const getScopedClinicId = (req: any): string | null => {
    const u = (req as any).user;
    if (u?.role === 'SUPER_ADMIN') {
        return (req.query?.clinicId || req.body?.clinicId || null) as string | null;
    }
    return (u?.clinicId || null) as string | null;
};

// Faqat ko'rsatilgan rollar uchun ruxsat beruvchi middleware.
const requireRole = (...roles: string[]) => {
    return (req: any, res: any, next: any) => {
        if (!roles.includes((req as any).user?.role)) {
            return res.status(403).json({ error: 'Ruxsat yo\'q' });
        }
        next();
    };
};

// :id bo'yicha mutatsiyadan oldin yozuv egaligini tekshiradi.
// SUPER_ADMIN o'tib ketadi; aks holda record.clinicId === user.clinicId bo'lishi shart.
// Bazaviy modellar uchun (Patient, Appointment, ... — clinicId to'g'ridan-to'g'ri saqlanadi).
const assertOwnership = async (req: any, res: any, model: string, id: string): Promise<boolean> => {
    const u = (req as any).user;
    if (u?.role === 'SUPER_ADMIN') return true;
    try {
        const rec = await (prisma as any)[model].findUnique({ where: { id } });
        if (!rec) {
            res.status(404).json({ error: 'Topilmadi' });
            return false;
        }
        if (rec.clinicId !== u?.clinicId) {
            res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
            return false;
        }
        return true;
    } catch (e: any) {
        res.status(500).json({ error: 'Egalik tekshiruvida xatolik' });
        return false;
    }
};

// Bemorga bog'liq resurslar uchun (photo, teeth, diagnosis) — bemor orqali clinicId tekshiriladi.
const assertPatientOwnership = async (req: any, res: any, patientId: string): Promise<boolean> => {
    const u = (req as any).user;
    if (u?.role === 'SUPER_ADMIN') return true;
    try {
        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient) {
            res.status(404).json({ error: 'Bemor topilmadi' });
            return false;
        }
        if (patient.clinicId !== u?.clinicId) {
            res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
            return false;
        }
        return true;
    } catch (e: any) {
        res.status(500).json({ error: 'Egalik tekshiruvida xatolik' });
        return false;
    }
};

// Klinika sozlamasi endpointlari uchun: SUPER_ADMIN yoki o'z klinikasi bo'lishi shart.
const canAccessClinic = (req: any, clinicId: string): boolean => {
    const u = (req as any).user;
    if (u?.role === 'SUPER_ADMIN') return true;
    return u?.clinicId === clinicId;
};

// ─── Markaziy (yagona) xabar yuborish funksiyasi ─────────────────────────────
// Barcha kanallar (Telegram/SMS) shu yerdan o'tadi va yagona TelegramLog tarixiga yoziladi.
type UnifiedSendOpts = {
    channel: 'sms' | 'telegram' | 'both' | 'auto'; // 'auto' = clinic.notificationMode bo'yicha
    source?: string;   // 'manual' | 'auto' | 'debt' | 'birthday' | 'noshow' | 'bulk' | 'retry'...
    ruleId?: string;   // AutomationRule dedupe uchun
    refId?: string;    // masalan appointmentId
    type?: string;     // TelegramLog.type (eski maydon)
    replyMarkup?: any;
};

async function sendUnified(
    clinic: any,
    patient: { firstName: string; lastName?: string; telegramChatId?: string | null; phone?: string | null; id?: string | null },
    message: string,
    opts: UnifiedSendOpts
): Promise<{ success: boolean; error?: string }> {
    const mode = clinic.notificationMode || 'telegram_only';
    let channel = opts.channel;
    if (channel === 'auto') {
        channel = mode === 'sms_only' ? 'sms' : mode === 'both' ? 'both' : 'telegram';
    }
    const patientName = `${patient.firstName} ${patient.lastName || ''}`.trim();
    const logExtra = { source: opts.source || 'manual', ruleId: opts.ruleId, refId: opts.refId };
    const logType = opts.type || 'Manual';

    let attempted = false;
    let anySuccess = false;
    let lastError: string | undefined;

    // Telegram
    if ((channel === 'telegram' || channel === 'both') && clinic.botToken && patient.telegramChatId) {
        attempted = true;
        const result = await botManager.notifyClinicUser(clinic.id, patient.telegramChatId, message, patient.id || undefined, logType, opts.replyMarkup, logExtra);
        if (result.success) anySuccess = true; else lastError = result.error;
        console.log(`[Notification] Telegram ${result.success ? 'sent' : 'FAILED'} → ${patientName}`);
    }

    // SMS
    if ((channel === 'sms' || channel === 'both') && clinic.eskizEmail && patient.phone) {
        attempted = true;
        try {
            const result = await smsService.sendSms(clinic.id, patient.phone, message);
            await prisma.telegramLog.create({
                data: {
                    clinicId: clinic.id,
                    patientId: patient.id || null,
                    type: logType,
                    status: result.success ? 'Sent' : 'Failed',
                    message,
                    error: result.success ? null : (result.error || 'SMS yuborilmadi'),
                    channel: 'sms',
                    source: logExtra.source,
                    ruleId: logExtra.ruleId || null,
                    refId: logExtra.refId || null,
                    recipient: patient.phone,
                }
            }).catch((err: any) => console.error('SMS log error:', err));
            if (result.success) anySuccess = true; else lastError = result.error;
            console.log(`[Notification] SMS ${result.success ? 'sent' : 'FAILED'} → ${patientName}`);
        } catch (e: any) {
            lastError = e.message;
            console.error(`[Notification] SMS exception for ${patientName}:`, e.message);
        }
    }

    // Hech qaysi kanal urinilmagan bo'lsa — sababi bilan Failed log yoziladi (tarixda ko'rinishi uchun)
    if (!attempted) {
        const reason = channel === 'sms'
            ? (!clinic.eskizEmail ? 'Eskiz SMS ulanmagan' : 'Bemorda telefon raqami yo\'q')
            : channel === 'telegram'
                ? (!clinic.botToken ? 'Telegram bot sozlanmagan' : 'Bemor botga ulanmagan')
                : 'Aloqa kanali mavjud emas';
        await prisma.telegramLog.create({
            data: {
                clinicId: clinic.id,
                patientId: patient.id || null,
                type: logType,
                status: 'Failed',
                message,
                error: reason,
                channel: channel === 'both' ? 'telegram' : channel,
                source: logExtra.source,
                ruleId: logExtra.ruleId || null,
                refId: logExtra.refId || null,
                recipient: patient.phone || patient.telegramChatId || null,
            }
        }).catch((err: any) => console.error('Skip log error:', err));
        return { success: false, error: reason };
    }

    return { success: anySuccess, error: anySuccess ? undefined : lastError };
}

// Eski nom bilan moslik: notificationMode bo'yicha yuboradi
async function sendNotification(
    clinic: any,
    patient: { firstName: string; lastName?: string; telegramChatId?: string | null; phone?: string | null; id?: string | null },
    message: string,
    replyMarkup?: any
): Promise<void> {
    await sendUnified(clinic, patient, message, { channel: 'auto', replyMarkup });
}
// ──────────────────────────────────────────────────────────────────────────────

// Bot Logs
app.get('/api/clinics/:id/bot-logs', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const logs = await prisma.telegramLog.findMany({
            where: { clinicId: req.params.id },
            include: { patient: true },
            orderBy: { sentAt: 'desc' },
            take: 100
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bot logs' });
    }
});

// ─── SMS Settings Endpoints ───────────────────────────────────────────────────

// GET SMS settings (credentials masked)
app.get('/api/clinics/:id/sms-settings', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id } }) as any;
        if (!clinic) return res.status(404).json({ error: 'Klinika topilmadi' });
        res.json({
            notificationMode: clinic.notificationMode || 'telegram_only',
            eskizEmail: clinic.eskizEmail || '',
            eskizNick: clinic.eskizNick || '4546',
            hasPassword: !!clinic.eskizPassword,
            isConnected: !!clinic.eskizToken,
            eskizTokenExpiry: clinic.eskizTokenExpiry || null
        });
    } catch (error) {
        res.status(500).json({ error: 'SMS sozlamalarini olishda xatolik' });
    }
});

// PUT SMS settings (save credentials + mode)
app.put('/api/clinics/:id/sms-settings', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { notificationMode, eskizEmail, eskizPassword, eskizNick } = req.body;
        const clinicId = req.params.id;

        const updateData: any = {};
        if (notificationMode) updateData.notificationMode = notificationMode;
        if (eskizNick) updateData.eskizNick = eskizNick;
        if (eskizEmail !== undefined) updateData.eskizEmail = eskizEmail;
        if (eskizPassword) {
            updateData.eskizPassword = eskizPassword;
            // Invalidate old token so it gets refreshed on next use
            updateData.eskizToken = null;
            updateData.eskizTokenExpiry = null;
        }

        // If credentials provided, validate them immediately
        if (eskizEmail && eskizPassword) {
            const validation = await smsService.validateCredentials(eskizEmail, eskizPassword);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error || 'Eskiz login yoki parol noto\'g\'ri' });
            }
            // Pre-fetch token and save
            await (prisma.clinic as any).update({ where: { id: clinicId }, data: updateData });
            await smsService.refreshToken(clinicId, eskizEmail, eskizPassword);
        } else {
            await (prisma.clinic as any).update({ where: { id: clinicId }, data: updateData });
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('SMS settings save error:', error);
        res.status(500).json({ error: 'SMS sozlamalarini saqlashda xatolik' });
    }
});

// POST SMS balance check
app.get('/api/clinics/:id/sms-balance', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const result = await smsService.getBalance(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Balansni olishda xatolik' });
    }
});

// POST Test SMS
app.post('/api/clinics/:id/sms-test', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Telefon raqam kiritilsin' });

        // Eskiz strictly enforces these exact strings for test/unverified accounts
        const message = `Bu Eskiz dan test`;

        const result = await smsService.sendSms(req.params.id, phone, message);
        if (result.success) {
            res.json({ success: true, message: 'Test SMS muvaffaqiyatli yuborildi' });
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (error: any) {
        res.status(500).json({ error: 'Test SMS yuborishda xatolik: ' + error.message });
    }
});

// ─── Xabarlar: Shablonlar / Avto qoidalar / Bulk yuborish / Tarix ───────────

const AUTOMATION_TRIGGERS = ['before_appointment', 'birthday', 'no_show'];
const MESSAGE_CHANNELS = ['sms', 'telegram', 'both'];

// Templates CRUD
app.get('/api/message-templates', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const templates = await prisma.messageTemplate.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: 'Shablonlarni olishda xatolik' });
    }
});

// Shablon matnini Eskiz moderatsiyasiga yuborib, natijani baza yozuviga qo'shadi.
// Klinikada Eskiz ulanmagan bo'lsa jim o'tkazib yuboradi (eskizStatus null qoladi).
const submitTemplateToEskizModeration = async (templateId: string, clinicId: string, text: string) => {
    try {
        const { eskizTemplateId, eskizStatus } = await smsService.submitAndSyncTemplate(clinicId, text);
        if (eskizStatus === null && eskizTemplateId === null) return; // Eskiz ulanmagan — jim o'tkazamiz
        await prisma.messageTemplate.update({
            where: { id: templateId },
            data: { eskizTemplateId, eskizStatus, eskizSubmittedAt: new Date() }
        });
    } catch (err) {
        console.error('[MessageTemplate] Eskiz moderatsiyaga yuborishda xatolik:', err);
    }
};

app.post('/api/message-templates', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const { name, text } = req.body;
        if (!name || !text) return res.status(400).json({ error: 'Nomi va matni kiritilishi shart' });
        let template = await prisma.messageTemplate.create({
            data: { name, text, clinicId: clinicId as string }
        });

        // Shablonni darhol Eskiz moderatsiyasiga yuboramiz (javobni kutib, holatini saqlaymiz)
        await submitTemplateToEskizModeration(template.id, clinicId as string, text);
        template = await prisma.messageTemplate.findUnique({ where: { id: template.id } }) as any;

        res.json(template);
    } catch (error) {
        res.status(500).json({ error: 'Shablonni saqlashda xatolik' });
    }
});

app.put('/api/message-templates/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'messageTemplate', req.params.id))) return;
        const { name, text } = req.body;
        const existing = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
        let template = await prisma.messageTemplate.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(text !== undefined && { text }),
            }
        });

        // Matn o'zgargan bo'lsa — Eskiz'da eski shablon endi mos kelmaydi, qayta yuboramiz
        if (text !== undefined && text !== existing?.text) {
            await submitTemplateToEskizModeration(template.id, template.clinicId, text);
            template = await prisma.messageTemplate.findUnique({ where: { id: template.id } }) as any;
        }

        res.json(template);
    } catch (error) {
        res.status(500).json({ error: 'Shablonni yangilashda xatolik' });
    }
});

// Shablonning Eskiz'dagi moderatsiya holatini qayta yuborishsiz yangilaydi (faqat status tekshiruvi)
app.post('/api/message-templates/:id/sync-eskiz-status', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'messageTemplate', req.params.id))) return;
        const existing = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Shablon topilmadi' });

        const { templates, error } = await smsService.getTemplates(existing.clinicId);
        if (error) return res.status(400).json({ error });

        const match = [...templates].reverse().find((t: any) => t.original_text === existing.text || t.template === existing.text);
        const template = await prisma.messageTemplate.update({
            where: { id: req.params.id },
            data: match
                ? { eskizTemplateId: match.id, eskizStatus: match.status }
                : { eskizStatus: 'not_found' }
        });
        res.json(template);
    } catch (error) {
        res.status(500).json({ error: 'Holatni tekshirishda xatolik' });
    }
});

app.delete('/api/message-templates/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'messageTemplate', req.params.id))) return;
        const usedByRules = await prisma.automationRule.count({ where: { templateId: req.params.id } });
        if (usedByRules > 0) {
            return res.status(400).json({ error: 'Bu shablon avtomatik qoidada ishlatilmoqda. Avval qoidani o\'chiring.' });
        }
        await prisma.messageTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Shablonni o\'chirishda xatolik' });
    }
});

// Automation rules CRUD
app.get('/api/automation-rules', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const rules = await prisma.automationRule.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { createdAt: 'desc' }
        });
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: 'Qoidalarni olishda xatolik' });
    }
});

app.post('/api/automation-rules', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const { name, templateId, trigger, hoursBefore, channel, doctorId } = req.body;
        if (!name || !templateId) return res.status(400).json({ error: 'Qoida nomi va shablon tanlanishi shart' });
        if (!AUTOMATION_TRIGGERS.includes(trigger)) return res.status(400).json({ error: 'Noto\'g\'ri trigger turi' });
        if (!MESSAGE_CHANNELS.includes(channel)) return res.status(400).json({ error: 'Noto\'g\'ri kanal' });
        const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
        if (!template || template.clinicId !== clinicId) return res.status(400).json({ error: 'Shablon topilmadi' });

        const rule = await prisma.automationRule.create({
            data: {
                name,
                templateId,
                trigger,
                hoursBefore: trigger === 'before_appointment' ? (parseInt(hoursBefore) || 2) : null,
                channel,
                doctorId: doctorId || null,
                clinicId: clinicId as string,
            }
        });
        res.json(rule);
    } catch (error) {
        console.error('Automation rule create error:', error);
        res.status(500).json({ error: 'Qoidani saqlashda xatolik' });
    }
});

app.put('/api/automation-rules/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'automationRule', req.params.id))) return;
        const { name, templateId, trigger, hoursBefore, channel, doctorId, active } = req.body;
        if (trigger !== undefined && !AUTOMATION_TRIGGERS.includes(trigger)) return res.status(400).json({ error: 'Noto\'g\'ri trigger turi' });
        if (channel !== undefined && !MESSAGE_CHANNELS.includes(channel)) return res.status(400).json({ error: 'Noto\'g\'ri kanal' });
        const rule = await prisma.automationRule.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(templateId !== undefined && { templateId }),
                ...(trigger !== undefined && { trigger }),
                ...(hoursBefore !== undefined && { hoursBefore: parseInt(hoursBefore) || null }),
                ...(channel !== undefined && { channel }),
                ...(doctorId !== undefined && { doctorId: doctorId || null }),
                ...(active !== undefined && { active: !!active }),
            }
        });
        res.json(rule);
    } catch (error) {
        res.status(500).json({ error: 'Qoidani yangilashda xatolik' });
    }
});

app.delete('/api/automation-rules/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'automationRule', req.params.id))) return;
        await prisma.automationRule.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Qoidani o\'chirishda xatolik' });
    }
});

// Qo'lda bulk yuborish: tanlangan bemorlarga shaxsiylashtirilgan xabar
app.post('/api/messages/send-bulk', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const { patientIds, message, channel } = req.body;
        if (!Array.isArray(patientIds) || patientIds.length === 0) return res.status(400).json({ error: 'Bemorlar tanlanmagan' });
        if (!message || !message.trim()) return res.status(400).json({ error: 'Xabar matni bo\'sh' });
        if (!MESSAGE_CHANNELS.includes(channel)) return res.status(400).json({ error: 'Noto\'g\'ri kanal' });

        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId as string } });
        if (!clinic) return res.status(404).json({ error: 'Klinika topilmadi' });

        const patients = await prisma.patient.findMany({
            where: { id: { in: patientIds }, clinicId: clinicId as string }
        });

        // {qarz} uchun: Pending tranzaksiyalar + faol bo'lib to'lash qoldiqlari
        const pendingTx = await prisma.transaction.findMany({
            where: { clinicId: clinicId as string, status: 'Pending', patientId: { in: patientIds } },
            select: { patientId: true, amount: true }
        });
        const activePlans = await prisma.installmentPlan.findMany({
            where: { clinicId: clinicId as string, status: 'Active', patientId: { in: patientIds } },
            select: { patientId: true, totalAmount: true, totalPaid: true }
        });
        const debtMap = new Map<string, number>();
        pendingTx.forEach((t: any) => { if (t.patientId) debtMap.set(t.patientId, (debtMap.get(t.patientId) || 0) + t.amount); });
        activePlans.forEach((p: any) => debtMap.set(p.patientId, (debtMap.get(p.patientId) || 0) + Math.max(0, p.totalAmount - p.totalPaid)));

        const todayStr = new Date().toISOString().split('T')[0];
        let sent = 0;
        let failed = 0;
        const details: any[] = [];

        for (const patient of patients) {
            const personalized = processTemplate(message, {
                patientName: `${patient.firstName} ${patient.lastName}`,
                firstName: patient.firstName,
                lastName: patient.lastName,
                date: todayStr,
                clinicName: clinic.name,
                amount: debtMap.get(patient.id) || 0,
            });
            const result = await sendUnified(clinic, patient, personalized, { channel, source: 'bulk', type: 'Bulk' });
            if (result.success) sent++; else failed++;
            details.push({ patientId: patient.id, name: `${patient.firstName} ${patient.lastName}`, success: result.success, error: result.error });
        }

        res.json({ total: patients.length, sent, failed, details });
    } catch (error: any) {
        console.error('Bulk send error:', error);
        res.status(500).json({ error: 'Xabarlarni yuborishda xatolik' });
    }
});

// Yagona tarix (Telegram + SMS) + statistika
app.get('/api/messages/logs', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
        const [logs, total, sentCount, failedCount] = await Promise.all([
            prisma.telegramLog.findMany({
                where: { clinicId: clinicId as string },
                include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } } },
                orderBy: { sentAt: 'desc' },
                take: limit
            }),
            prisma.telegramLog.count({ where: { clinicId: clinicId as string } }),
            prisma.telegramLog.count({ where: { clinicId: clinicId as string, status: 'Sent' } }),
            prisma.telegramLog.count({ where: { clinicId: clinicId as string, status: 'Failed' } }),
        ]);
        res.json({ logs, stats: { total, sent: sentCount, failed: failedCount } });
    } catch (error) {
        res.status(500).json({ error: 'Tarixni olishda xatolik' });
    }
});

// Xato xabarlarni qayta yuborish
app.post('/api/messages/retry', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const { logIds } = req.body;
        if (!Array.isArray(logIds) || logIds.length === 0) return res.status(400).json({ error: 'Loglar tanlanmagan' });

        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId as string } });
        if (!clinic) return res.status(404).json({ error: 'Klinika topilmadi' });

        const logs = await prisma.telegramLog.findMany({
            where: { id: { in: logIds }, clinicId: clinicId as string, status: 'Failed' },
            include: { patient: true }
        });

        let success = 0;
        let failed = 0;
        for (const log of logs) {
            if (!log.patient || !log.message) { failed++; continue; }
            const channel = (log.channel === 'sms' ? 'sms' : 'telegram') as 'sms' | 'telegram';
            const result = await sendUnified(clinic, log.patient, log.message, { channel, source: 'retry', type: log.type });
            if (result.success) success++; else failed++;
        }
        res.json({ retried: logs.length, success, failed });
    } catch (error) {
        console.error('Retry error:', error);
        res.status(500).json({ error: 'Qayta yuborishda xatolik' });
    }
});

// ──────────────────────────────────────────────────────────────────────────────

// Patient Reviews
app.get('/api/clinics/:id/reviews', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const reviews = await prisma.review.findMany({
            where: {
                appointment: { clinicId: req.params.id }
            },
            include: {
                appointment: {
                    include: { patient: true, doctor: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// --- Authentication ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Login va parol kiritilishi shart' });
        }

        const cleanUsername = String(username).trim();
        const cleanPassword = String(password).trim();

        let userPayload = null;
        let responseData = null;

        // Check for super admin (uses env variables with fallback)
        const superAdminUsername = process.env.SUPERADMIN_USERNAME;
        const superAdminPassword = process.env.SUPERADMIN_PASSWORD;

        if (superAdminUsername && superAdminPassword && cleanUsername === superAdminUsername && cleanPassword === superAdminPassword) {
            userPayload = { role: 'SUPER_ADMIN', name: 'Ulugbek (Super Admin)' };
            responseData = {
                success: true,
                role: 'SUPER_ADMIN',
                name: 'Ulugbek (Super Admin)'
            };
        } else {
            if (!superAdminUsername || !superAdminPassword) {
                console.warn('⚠️ WARNING: Superadmin credentials are not configured in .env file!');
            }
            // Helper function to verify and seamlessly upgrade passwords
            const verifyAndUpgradePassword = async (user: any, modelName: string, idField: string = 'id') => {
                let isValid = false;
                if (!user.password) return false;

                // Check if it's already a bcrypt hash (starts with $2a$, $2b$, $2y$)
                if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
                    isValid = await bcrypt.compare(cleanPassword, user.password);
                } else {
                    // Legacy plaintext check
                    if (user.password === cleanPassword) {
                        isValid = true;
                        // Seamless upgrade: hash the plaintext password and save it
                        try {
                            const salt = await bcrypt.genSalt(10);
                            const hashedPassword = await bcrypt.hash(cleanPassword, salt);
                            await (prisma[modelName] as any).update({
                                where: { [idField]: user[idField] },
                                data: { password: hashedPassword }
                            });
                            console.log(`Seamlessly upgraded password mapping for ${modelName} ${user.username}`);
                        } catch (e) {
                            console.error(`Failed to upgrade password for ${modelName} ${user.username}`, e);
                        }
                    }
                }
                return isValid;
            };

            // Check for clinic admin in database
            const clinic = await prisma.clinic.findUnique({
                where: { username: cleanUsername },
                include: { plan: true }
            });

            if (clinic && await verifyAndUpgradePassword(clinic, 'clinic')) {
                if (clinic.status !== 'Active') {
                    return res.status(403).json({
                        success: false,
                        error: 'Klinika bloklangan yoki kutilmoqda'
                    });
                }
                userPayload = { role: 'CLINIC_ADMIN', name: clinic.adminName, clinicId: clinic.id };
                responseData = {
                    success: true,
                    role: 'CLINIC_ADMIN',
                    name: clinic.adminName,
                    clinicId: clinic.id,
                    clinicName: clinic.name,
                    botUsername: clinic.botToken ? (await botManager.getBotUsername(clinic.id)) : null
                };
            } else {
                // Check for doctor
                const doctor = await prisma.doctor.findUnique({
                    where: { username: cleanUsername },
                    include: { clinic: true }
                });

                if (doctor && await verifyAndUpgradePassword(doctor, 'doctor')) {
                    if (doctor.status !== 'Active') {
                        return res.status(403).json({ success: false, error: 'Shifokor bloklangan' });
                    }
                    if (doctor.clinic && doctor.clinic.status === 'Deleted') {
                        return res.status(403).json({ success: false, error: 'Klinika tizimdan o\'chirilgan' });
                    }
                    userPayload = { role: 'DOCTOR', name: `${doctor.firstName} ${doctor.lastName}`, clinicId: doctor.clinicId, doctorId: doctor.id };
                    responseData = {
                        success: true,
                        role: 'DOCTOR',
                        name: `${doctor.firstName} ${doctor.lastName}`,
                        clinicId: doctor.clinicId,
                        doctorId: doctor.id
                    };
                } else {
                    // Check for receptionist
                    const receptionist = await prisma.receptionist.findUnique({
                        where: { username: cleanUsername },
                        include: { clinic: true }
                    });

                    if (receptionist && await verifyAndUpgradePassword(receptionist, 'receptionist')) {
                        if (receptionist.status !== 'Active') {
                            return res.status(403).json({ success: false, error: 'Resepshn bloklangan' });
                        }
                        if (receptionist.clinic && receptionist.clinic.status === 'Deleted') {
                            return res.status(403).json({ success: false, error: 'Klinika tizimdan o\'chirilgan' });
                        }
                        userPayload = { role: 'RECEPTIONIST', name: `${receptionist.firstName} ${receptionist.lastName}`, clinicId: receptionist.clinicId, receptionistId: receptionist.id };
                        responseData = {
                            success: true,
                            role: 'RECEPTIONIST',
                            name: `${receptionist.firstName} ${receptionist.lastName}`,
                            clinicId: receptionist.clinicId,
                            receptionistId: receptionist.id
                        };
                    }

                    if (!userPayload) {
                        // Check for lab technician
                        const labTech = await (prisma as any).labTechnician.findUnique({
                            where: { username: cleanUsername },
                            include: { clinic: true }
                        });

                        if (labTech && labTech.password && await verifyAndUpgradePassword(labTech, 'labTechnician')) {
                            if (labTech.status !== 'Active') {
                                return res.status(403).json({ success: false, error: 'Lab texnik akkaunti faol emas' });
                            }
                            userPayload = { role: 'LAB_TECHNICIAN', name: `${labTech.firstName} ${labTech.lastName}`, clinicId: labTech.clinicId, technicianId: labTech.id };
                            responseData = {
                                success: true,
                                role: 'LAB_TECHNICIAN',
                                name: `${labTech.firstName} ${labTech.lastName}`,
                                clinicId: labTech.clinicId,
                                technicianId: labTech.id
                            };
                        }
                    }

                    if (!userPayload) {
                        // Check for sales agent
                        const salesAgent = await prisma.salesAgent.findUnique({
                            where: { username: cleanUsername.toLowerCase() }
                        });

                        if (salesAgent && await verifyAndUpgradePassword(salesAgent, 'salesAgent')) {
                            if (salesAgent.status !== 'Active') {
                                return res.status(403).json({ success: false, error: 'Sotuvchi akkaunti faol emas' });
                            }
                            userPayload = { role: 'SALES_AGENT', name: salesAgent.name, salesAgentId: salesAgent.id };
                            responseData = {
                                success: true,
                                role: 'SALES_AGENT',
                                name: salesAgent.name,
                                salesAgentId: salesAgent.id
                            };
                        }
                    }
                }
            }
        }

        if (userPayload && responseData) {
            const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '30d' });
            return res.json({ ...responseData, token });
        }

        // Invalid credentials
        return res.status(401).json({
            success: false,
            error: 'Login yoki parol noto\'g\'ri'
        });
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Tizimga kirishda xatolik yuz berdi',
            details: error.message // Added for debugging
        });
    }
});

// --- Patients ---
app.get('/api/patients', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const user = (req as any).user;
        const whereClause: any = { clinicId: clinicId as string };
        if (user?.role === 'DOCTOR' && user?.doctorId) {
            whereClause.doctorId = user.doctorId;
        }

        const patients = await prisma.patient.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }, // Eng yangi bemorlar birinchi (id UUID bo'lgani uchun vaqt tartibini bermaydi)
            include: { doctor: { select: { firstName: true, lastName: true } } }
        });
        // doctorName frontend uchun hisoblab beriladi (bazada bunday maydon yo'q)
        res.json(patients.map(({ doctor, ...p }: any) => ({
            ...p,
            doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : null
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
});

app.post('/api/patients', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, phone, clinicId, dob, gender, medicalHistory, pinfl, address, secondaryPhone } = req.body;

        // 1. Validate required fields
        if (!firstName || !lastName || !phone) {
            return res.status(400).json({ error: 'Ism, familiya va telefon raqam kiritilishi shart.' });
        }

        if (!clinicId) {
            return res.status(400).json({ error: 'Klinika aniqlanmadi (Tizim xatoligi). Iltimos, sahifani yangilab qayta urining.' });
        }

        // 2. Validate format (optional but recommended)
        // Basic phone validation could go here

        // 3. Create Patient
        const user = (req as any).user;
        let assignedDoctorId = req.body.doctorId || null;
        if (user?.role === 'DOCTOR' && user?.doctorId) {
            assignedDoctorId = user.doctorId;
        }

        const patient = await prisma.patient.create({
            data: {
                firstName,
                lastName,
                phone,
                clinicId,
                dob: dob || '',
                gender: gender || 'Male',
                medicalHistory: medicalHistory || '',
                status: 'Active',
                lastVisit: 'Never',
                doctorId: assignedDoctorId,
                pinfl: pinfl || '',
                address: address || null,
                secondaryPhone: secondaryPhone || null
            }
        });
        res.json(patient);
    } catch (error: any) {
        console.error('Patient creation error:', error);

        // Handle specific Prisma errors
        if (error.code === 'P2002') {
            // Unique constraint violation (e.g. if we had unique phone per clinic)
            return res.status(400).json({ error: 'Ushbu ma\'lumotga ega bemor allaqachon mavjud.' });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({ error: 'Bog\'liq ma\'lumotlar (klinika) topilmadi.' });
        }

        res.status(500).json({ error: 'Bemor yaratishda xatolik yuz berdi: ' + (error.message || 'Noma\'lum xatolik') });
    }
});

app.get('/api/patients/:id', authenticateToken, async (req, res) => {
    try {
        const patient = await prisma.patient.findUnique({
            where: { id: req.params.id }
        });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        // Egalik: boshqa klinika bemorini ko'rishni bloklash
        if ((req as any).user?.role !== 'SUPER_ADMIN' && patient.clinicId !== (req as any).user?.clinicId) {
            return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        }
        res.json(patient);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch patient' });
    }
});

app.put('/api/patients/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'patient', req.params.id))) return;
        const { firstName, lastName, phone, dob, lastVisit, status, gender, medicalHistory, address, telegramChatId, secondaryPhone, clinicId, avatarUrl, portraitUrl, doctorId, pinfl } = req.body;
        const updateData: any = {};
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (phone !== undefined) updateData.phone = phone;
        if (dob !== undefined) updateData.dob = dob;
        if (lastVisit !== undefined) updateData.lastVisit = lastVisit;
        if (status !== undefined) updateData.status = status;
        if (gender !== undefined) updateData.gender = gender;
        if (medicalHistory !== undefined) updateData.medicalHistory = medicalHistory;
        if (address !== undefined) updateData.address = address;
        if (telegramChatId !== undefined) updateData.telegramChatId = telegramChatId;
        if (secondaryPhone !== undefined) updateData.secondaryPhone = secondaryPhone;
        if (clinicId !== undefined) updateData.clinicId = clinicId;
        if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
        if (portraitUrl !== undefined) updateData.portraitUrl = portraitUrl;
        if (doctorId !== undefined) updateData.doctorId = doctorId === "" ? null : doctorId;
        if (pinfl !== undefined) updateData.pinfl = pinfl;

        const patient = await prisma.patient.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.json(patient);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update patient' });
    }
});

app.delete('/api/patients/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'patient', req.params.id))) return;
        await prisma.patient.update({
            where: { id: req.params.id },
            data: { status: 'Archived' }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete patient' });
    }
});

// --- Appointments ---
app.get('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const appointments = await prisma.appointment.findMany({
            where: { clinicId: clinicId as string },
            include: { review: true },
            orderBy: { date: 'asc' }
        });
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const { patientId, date, time, notes, clinicId } = req.body;

        // 1. Check for existing appointment for this patient on this date
        // This prevents creating duplicate appointments due to frontend race conditions or network lag
        const existingAppointment = await prisma.appointment.findFirst({
            where: {
                patientId: patientId,
                date: date,
                status: { not: 'Cancelled' } // Only check active appointments
            }
        });

        if (existingAppointment) {
            console.log(`⚠️ Prevented duplicate appointment creation for patient ${patientId} on ${date}. Merging instead.`);

            // Check if notes already contain the new information to avoid appending duplicates
            const currentNotes = existingAppointment.notes || '';
            let newNotes = currentNotes;

            // If the incoming notes (e.g., procedures) are not already in the current notes, append them
            if (notes && !currentNotes.includes(notes)) {
                const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                newNotes = currentNotes ? `${currentNotes}\n\nQo'shimcha (${timestamp}):\n${notes}` : notes;

                // Update the existing appointment
                const updatedAppointment = await prisma.appointment.update({
                    where: { id: existingAppointment.id },
                    data: {
                        notes: newNotes,
                        // Optionally update status if needed, but 'Completed' usually stays 'Completed'
                    }
                });
                return res.json(updatedAppointment);
            }

            // If notes are identical/contained, just return the existing one without changes
            return res.json(existingAppointment);
        }

        // 2. If no existing appointment, create a new one
        const { patientName, doctorId, doctorName, type, duration, status, reminderSent } = req.body;
        const appointment = await prisma.appointment.create({
            data: {
                patientId: patientId,
                patientName,
                doctorId,
                doctorName,
                type,
                date: date,
                time: time,
                duration,
                status,
                reminderSent,
                notes: notes,
                clinicId: clinicId
            }
        });
        res.json(appointment);
    } catch (error) {
        console.error('Failed to create appointment:', error);
        res.status(500).json({ error: 'Failed to create appointment' });
    }
});

app.put('/api/appointments/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'appointment', req.params.id))) return;
        // Sanitize body to only include valid Appointment fields
        const { patientId, patientName, doctorId, doctorName, type, date, time, duration, status, reminderSent, notes, clinicId } = req.body;
        const updateData: any = {};
        if (patientId !== undefined) updateData.patientId = patientId;
        if (patientName !== undefined) updateData.patientName = patientName;
        if (doctorId !== undefined) updateData.doctorId = doctorId;
        if (doctorName !== undefined) updateData.doctorName = doctorName;
        if (type !== undefined) updateData.type = type;
        if (date !== undefined) updateData.date = date;
        if (time !== undefined) updateData.time = time;
        if (duration !== undefined) updateData.duration = duration;
        if (status !== undefined) updateData.status = status;
        if (reminderSent !== undefined) updateData.reminderSent = reminderSent;
        if (notes !== undefined) updateData.notes = notes;
        if (clinicId !== undefined) updateData.clinicId = clinicId;

        // Update appointment and fetch necessary data for notification
        const appointment = await prisma.appointment.update({
            where: { id: req.params.id },
            data: updateData,
            include: {
                patient: {
                    include: { clinic: true }
                }
            }
        });

        // Check if status changed to 'No-Show' and send notification
        if (status === 'No-Show') {
            const clinic = appointment.patient.clinic as any;
            const message = `❗️ Siz ${appointment.date} soat ${appointment.time} dagi qabulga kelmadingiz.\n\nIltimos, klinika bilan bog'lanib keyingi qabul vaqtini aniqlang!\n\n📞 Telefon: ${clinic.phone}`;

            // Unified notification sender
            await sendUnified(clinic, appointment.patient, message, { channel: 'auto', source: 'noshow', refId: appointment.id, type: 'NoShow' });
        }

        // Check if status changed to 'Completed' and send rating request after 1 hour
        if (status === 'Completed' && appointment.patient.telegramChatId && appointment.patient.clinic.botToken) {
            const patientName = appointment.patient.firstName;
            const clinicId = appointment.patient.clinicId;
            const chatId = appointment.patient.telegramChatId;
            const appointmentId = appointment.id;

            console.log(`🕒 Scheduling rating request for ${patientName} in 1 hour.`);

            // 1 hour = 3600000 ms
            setTimeout(async () => {
                try {
                    await botManager.sendRatingRequest(clinicId, chatId, appointmentId, patientName);
                    console.log(`✅ Rating request sent to ${patientName} after 1 hour.`);
                } catch (err) {
                    console.error('Failed to send delayed rating request:', err);
                }
            }, 3600000);
        }

        res.json(appointment);
    } catch (error) {
        console.error('Update appointment error:', error);
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.delete('/api/appointments/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'appointment', req.params.id))) return;
        await prisma.appointment.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});

// Manual Appointment Reminder
app.post('/api/appointments/:id/remind', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'appointment', req.params.id))) return;
        const appointment = await prisma.appointment.findUnique({
            where: { id: req.params.id },
            include: { patient: { include: { clinic: true } }, doctor: true }
        });

        if (!appointment || !appointment.patient) {
            return res.status(404).json({ error: 'Appointment or patient not found' });
        }

        const clinic = appointment.patient.clinic as any;

        // Message details
        const date = new Date(appointment.date).toLocaleDateString('uz-UZ');
        const time = appointment.time;
        const doctorName = appointment.doctor ? `${appointment.doctor.firstName} ${appointment.doctor.lastName}` : 'Shifokor';
        const message = `🔔 Eslatma!\n\nHurmatli ${appointment.patient.firstName},\nSizning ${date} kuni soat ${time} da ${doctorName} qabuliga yozilganingizni eslatamiz.\n\nIltimos, kechikmasdan keling!`;

        await sendUnified(clinic, appointment.patient, message, { channel: 'auto', source: 'manual', refId: appointment.id, type: 'Reminder' });

        res.json({ success: true });
    } catch (error) {
        console.error('Reminder error:', error);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
});

// Manual Debt Reminder
app.post('/api/patients/:id/remind-debt', authenticateToken, async (req, res) => {
    try {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const { amount } = req.body;
        const patient = await prisma.patient.findUnique({
            where: { id: req.params.id },
            include: { clinic: true }
        });

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        const clinic = patient.clinic as any;

        const debtMessage = amount
            ? `sizning ${amount.toLocaleString()} so'm qarzdorligingiz mavjud.`
            : `sizning qarzdorligingiz mavjud.`;

        const message = `💰 To'lov eslatmasi!\n\nHurmatli ${patient.firstName}, ${debtMessage}\n\nIltimos, to'lovni amalga oshiring.`;

        await sendUnified(clinic, patient, message, { channel: 'auto', source: 'debt', type: 'DebtReminder' });

        res.json({ success: true });
    } catch (error) {
        console.error('Debt reminder error:', error);
        res.status(500).json({ error: 'Failed to send debt reminder' });
    }
});

// Manual Custom Message
app.post('/api/patients/:id/send-message', authenticateToken, async (req, res) => {
    try {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const { message } = req.body;
        const patient = await prisma.patient.findUnique({
            where: { id: req.params.id },
            include: { clinic: true }
        });

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        if (!message) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        const clinic = patient.clinic as any;
        const mode = clinic.notificationMode || 'telegram_only';
        const hasTelegram = !!clinic.botToken && !!patient.telegramChatId;
        const hasSms = (mode === 'sms_only' || mode === 'both') && !!clinic.eskizEmail && !!patient.phone;

        if (!hasTelegram && !hasSms) {
            return res.status(400).json({ error: 'Bemor bilan bog\'lanish imkoni yo\'q (Telegram ham, SMS ham ulangan emas)' });
        }

        await sendNotification(clinic, patient, message);

        res.json({ success: true });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// --- Transactions ---
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const transactions = await prisma.transaction.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { date: 'desc' }
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const transaction = await prisma.transaction.create({
            data: req.body
        });

        // Only Avans deposits and Balance-type payments affect the advance balance
        if (req.body.patientId) {
            const amount = parseFloat(req.body.amount) || 0;
            let balanceChange = 0;

            if (req.body.service === 'Avans' && req.body.status === 'Paid') {
                // Avans deposit: increase balance
                balanceChange = amount;
            } else if (req.body.type === 'Balance' && req.body.status === 'Paid') {
                // Payment from balance: decrease balance
                balanceChange = -amount;
            }
            // Regular Cash/Card payments do NOT affect the advance balance

            if (balanceChange !== 0) {
                await prisma.patient.update({
                    where: { id: req.body.patientId },
                    data: { balance: { increment: balanceChange } }
                }).catch((err: any) => console.error('Failed to update patient balance:', err));
            }
        }

        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'transaction', req.params.id))) return;
        const oldTx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!oldTx) return res.status(404).json({ error: 'Transaction not found' });

        const transaction = await prisma.transaction.update({
            where: { id: req.params.id },
            data: req.body
        });

        // Update patient balance if patientId is linked
        // Only Avans deposits and Balance-type payments affect the advance balance
        if (transaction.patientId) {
            const calculateBalanceContribution = (tx: any) => {
                if (tx.service === 'Avans' && tx.status === 'Paid') return tx.amount;
                if (tx.type === 'Balance' && tx.status === 'Paid') return -tx.amount;
                return 0; // Regular payments don't affect balance
            };

            const oldContribution = calculateBalanceContribution(oldTx);
            const newContribution = calculateBalanceContribution(transaction);
            const adjustment = newContribution - oldContribution;

            if (adjustment !== 0) {
                await prisma.patient.update({
                    where: { id: transaction.patientId },
                    data: { balance: { increment: adjustment } }
                }).catch((err: any) => console.error('Failed to adjust patient balance:', err));
            }
        }

        res.json(transaction);
    } catch (error) {
        console.error('Transaction update error:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'transaction', req.params.id))) return;
        const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        // Reverse balance contribution
        // Reverse balance: only for Avans deposits and Balance-type payments
        if (transaction.patientId) {
            let contribution = 0;
            if (transaction.service === 'Avans' && transaction.status === 'Paid') contribution = transaction.amount;
            else if (transaction.type === 'Balance' && transaction.status === 'Paid') contribution = -transaction.amount;

            if (contribution !== 0) {
                await prisma.patient.update({
                    where: { id: transaction.patientId },
                    data: { balance: { increment: -contribution } }
                }).catch((err: any) => console.error('Failed to reverse patient balance on delete:', err));
            }
        }

        await prisma.transaction.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Transaction delete error:', error);
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
});

// --- Expenses (Xarajatlar) ---
const EXPENSE_CATEGORIES = ['DoctorShare', 'Salary', 'Rent', 'Utilities', 'Inventory', 'Lab', 'Other'];

app.get('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const expenses = await prisma.expense.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { date: 'desc' }
        });
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const { date, amount, category, title, method, note, doctorId, receptionistId } = req.body;
        if (!EXPENSE_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: 'Noto\'g\'ri kategoriya' });
        }
        if (category === 'DoctorShare' && !doctorId) {
            return res.status(400).json({ error: 'Shifokor ulushi uchun shifokor tanlanishi shart' });
        }
        const parsedAmount = parseFloat(amount);
        if (!parsedAmount || parsedAmount <= 0) {
            return res.status(400).json({ error: 'Summa noto\'g\'ri' });
        }

        const expense = await prisma.expense.create({
            data: {
                date: date || new Date().toISOString().split('T')[0],
                amount: parsedAmount,
                category,
                title: title || 'Xarajat',
                method: method || null,
                note: note || null,
                doctorId: doctorId || null,
                receptionistId: receptionistId || null,
                clinicId: clinicId as string,
            }
        });
        res.json(expense);
    } catch (error) {
        console.error('Expense create error:', error);
        res.status(500).json({ error: 'Failed to create expense' });
    }
});

app.put('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'expense', req.params.id))) return;

        const { date, amount, category, title, method, note, doctorId, receptionistId } = req.body;
        if (category && !EXPENSE_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: 'Noto\'g\'ri kategoriya' });
        }

        const expense = await prisma.expense.update({
            where: { id: req.params.id },
            data: {
                ...(date !== undefined && { date }),
                ...(amount !== undefined && { amount: parseFloat(amount) || 0 }),
                ...(category !== undefined && { category }),
                ...(title !== undefined && { title }),
                ...(method !== undefined && { method: method || null }),
                ...(note !== undefined && { note: note || null }),
                ...(doctorId !== undefined && { doctorId: doctorId || null }),
                ...(receptionistId !== undefined && { receptionistId: receptionistId || null }),
            }
        });
        res.json(expense);
    } catch (error) {
        console.error('Expense update error:', error);
        res.status(500).json({ error: 'Failed to update expense' });
    }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'expense', req.params.id))) return;
        await prisma.expense.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Expense delete error:', error);
        res.status(500).json({ error: 'Failed to delete expense' });
    }
});

// --- Installments ---
app.get('/api/installments', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        const { patientId } = req.query;
        if (!clinicId && !patientId) return res.status(400).json({ error: 'clinicId or patientId required' });

        const where: any = {};
        if (clinicId) where.clinicId = clinicId as string;
        if (patientId) where.patientId = patientId as string;
        
        const plans = await prisma.installmentPlan.findMany({
            where,
            include: { items: true, patient: true, doctor: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(plans);
    } catch (error) {
        console.error('Fetch installments error:', error);
        res.status(500).json({ error: 'Failed to fetch installments' });
    }
});

app.post('/api/installments', authenticateToken, async (req, res) => {
    try {
        const { patientId, clinicId, doctorId, service, totalAmount, totalPaid, startDate, endDate, status, items } = req.body;
        
        const plan = await prisma.installmentPlan.create({
            data: {
                patientId, clinicId, doctorId, service, totalAmount, totalPaid, startDate, endDate, status,
                items: {
                    create: items.map((item: any) => ({
                        expectedDate: item.expectedDate,
                        amount: item.amount,
                        status: item.status || 'Pending'
                    }))
                }
            },
            include: { items: true, patient: true, doctor: true }
        });
        
        res.json(plan);
    } catch (error) {
        console.error('Create installment error:', error);
        res.status(500).json({ error: 'Failed to create installment' });
    }
});

app.post('/api/installments/:id/pay', authenticateToken, async (req, res) => {
    try {
        const itemId = req.params.id;
        const { date, paymentMethod } = req.body;
        
        const item = await prisma.installmentItem.findUnique({ where: { id: itemId }, include: { plan: { include: { patient: true, doctor: true } } } });
        if (!item) return res.status(404).json({ error: 'Installment item not found' });
        // Egalik: bo'lib to'lash rejasi klinikasi tekshiriladi
        if ((req as any).user?.role !== 'SUPER_ADMIN' && item.plan?.clinicId !== (req as any).user?.clinicId) {
            return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        }
        if (item.status === 'Paid') return res.status(400).json({ error: 'Already paid' });
        
        const updatedItem = await prisma.installmentItem.update({
            where: { id: itemId },
            data: { status: 'Paid', paidDate: date }
        });
        
        const updatedPlan = await prisma.installmentPlan.update({
            where: { id: item.planId },
            data: { totalPaid: { increment: item.amount } }
        });
        
        const remainingItems = await prisma.installmentItem.count({ where: { planId: item.planId, status: 'Pending' } });
        if (remainingItems === 0) {
            await prisma.installmentPlan.update({ where: { id: item.planId }, data: { status: 'Completed' } });
        }
        
        const transaction = await prisma.transaction.create({
            data: {
                patientId: item.plan.patientId,
                patientName: `${item.plan.patient.lastName} ${item.plan.patient.firstName}`,
                clinicId: item.plan.clinicId,
                doctorId: item.plan.doctorId,
                doctorName: item.plan.doctor ? `${item.plan.doctor.lastName} ${item.plan.doctor.firstName}` : '',
                amount: item.amount,
                date: date,
                service: `Bo'lib to'lash (${item.plan.service})`,
                type: paymentMethod || 'Cash',
                status: 'Paid',
            }
        });
        
        await prisma.installmentItem.update({
            where: { id: itemId },
            data: { transactionId: transaction.id }
        });
        
        res.json({ success: true, item: updatedItem, transaction });
    } catch (error) {
        console.error('Pay installment error:', error);
        res.status(500).json({ error: 'Failed to pay installment' });
    }
});

app.delete('/api/installments/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'installmentPlan', req.params.id))) return;
        await prisma.installmentPlan.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete installment error:', error);
        res.status(500).json({ error: 'Failed to delete installment plan' });
    }
});

// --- Recalculate all patient balances (one-time fix) ---
app.post('/api/admin/recalculate-balances', authenticateToken, async (req, res) => {
    try {
        // Oddiy rol faqat o'z klinikasi bemorlarini qayta hisoblaydi; SUPER_ADMIN — barchasini
        const u = (req as any).user;
        const patientWhere = u?.role === 'SUPER_ADMIN' ? {} : { clinicId: u?.clinicId };
        const patients = await prisma.patient.findMany({ where: patientWhere, select: { id: true } });
        let fixed = 0;

        for (const patient of patients) {
            const transactions = await prisma.transaction.findMany({
                where: { patientId: patient.id }
            });

            let correctBalance = 0;
            for (const tx of transactions) {
                if (tx.service === 'Avans' && tx.status === 'Paid') {
                    correctBalance += tx.amount;
                } else if (tx.type === 'Balance' && tx.status === 'Paid') {
                    correctBalance -= tx.amount;
                }
            }

            await prisma.patient.update({
                where: { id: patient.id },
                data: { balance: correctBalance }
            });
            fixed++;
        }

        res.json({ success: true, patientsFixed: fixed });
    } catch (error) {
        console.error('Recalculate balances error:', error);
        res.status(500).json({ error: 'Failed to recalculate balances' });
    }
});

// --- Doctors ---
app.get('/api/doctors', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const doctors = await prisma.doctor.findMany({
            where: {
                clinicId: clinicId as string,
                status: { not: 'Deleted' }
            }
        });
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch doctors' });
    }
});

app.post('/api/doctors', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, specialty, phone, email, status, clinicId, username, password, percentage, salaryType, fixedSalary } = req.body;

        // Check subscription limit
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            include: { plan: true }
        });

        if (!clinic) {
            return res.status(404).json({ error: 'Klinika topilmadi' });
        }

        const currentDoctorCount = await prisma.doctor.count({
            where: {
                clinicId,
                status: { not: 'Deleted' }
            }
        });

        const planMaxDoctors = clinic.plan?.maxDoctors || 10;
        const planName = clinic.plan?.name || 'Standart';

        if (currentDoctorCount >= planMaxDoctors) {
            return res.status(403).json({
                error: `Sizning "${planName}" tarifingizda maksimal ${planMaxDoctors} ta shifokor qo'shish mumkin. Limitga yetdingiz. Tarifni o'zgartirish uchun biz bilan bog'laning.`
            });
        }

        if (username) {
            const existing = await prisma.doctor.findUnique({ where: { username } });
            if (existing) {
                return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
            }
        }

        let passwordData = password;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            passwordData = await bcrypt.hash(password, salt);
        }
        const data: any = {
            firstName, lastName, specialty, phone, status, clinicId, username, password: passwordData,
            percentage: percentage || 0,
            salaryType: salaryType || 'none',
            fixedSalary: fixedSalary ? Number(fixedSalary) : 0
        };
        if (email) data.email = email;

        const newDoctor = await prisma.doctor.create({ data });
        res.json(newDoctor);
    } catch (error: any) {
        console.error('Doctor creation error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
        }
        res.status(500).json({ error: error.message || 'Failed to create doctor' });
    }
});

app.put('/api/doctors/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'doctor', req.params.id))) return;
        const { username } = req.body;
        if (username) {
            const existing = await prisma.doctor.findUnique({ where: { username } });
            if (existing && existing.id !== req.params.id) {
                return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
            }
        }
        // Sanitize body to only include valid Doctor fields
        const { firstName, lastName, specialty, phone, email, status, password, percentage, salaryType, fixedSalary, secondaryPhone, color, clinicId, startHour, endHour } = req.body;
        const updateData: any = {};
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (specialty !== undefined) updateData.specialty = specialty;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (status !== undefined) updateData.status = status;
        if (username !== undefined) updateData.username = username;
        if (percentage !== undefined) updateData.percentage = percentage;
        if (salaryType !== undefined) updateData.salaryType = salaryType;
        if (fixedSalary !== undefined) updateData.fixedSalary = Number(fixedSalary) || 0;
        if (secondaryPhone !== undefined) updateData.secondaryPhone = secondaryPhone;
        if (color !== undefined) updateData.color = color;
        if (clinicId !== undefined) updateData.clinicId = clinicId;
        if (startHour !== undefined) updateData.startHour = startHour === null ? null : Number(startHour);
        if (endHour !== undefined) updateData.endHour = endHour === null ? null : Number(endHour);

        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }
        
        const doctor = await prisma.doctor.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.json(doctor);
    } catch (error: any) {
        console.error('Doctor update error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
        }
        res.status(500).json({ error: error.message || 'Failed to update doctor' });
    }
});

app.delete('/api/doctors/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'doctor', req.params.id))) return;
        await prisma.doctor.update({
            where: { id: req.params.id },
            data: { status: 'Deleted' }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Doctor delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete doctor' });
    }
});

// --- Receptionists ---
app.get('/api/receptionists', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const receptionists = await prisma.receptionist.findMany({
            where: {
                clinicId: clinicId as string,
                status: { not: 'Deleted' }
            }
        });
        res.json(receptionists);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch receptionists' });
    }
});

app.post('/api/receptionists', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, phone, username, password, clinicId } = req.body;

        if (!firstName || !lastName || !username || !password) {
            return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
        }

        if (username) {
            const existing = await prisma.receptionist.findUnique({ where: { username } });
            if (existing) {
                return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
            }
        }

        let passwordData = password;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            passwordData = await bcrypt.hash(password, salt);
        }
        const data: any = {
            firstName, lastName, phone, username, password: passwordData, clinicId,
            status: 'Active'
        };

        const newReceptionist = await prisma.receptionist.create({ data });
        res.json(newReceptionist);
    } catch (error: any) {
        console.error('Receptionist creation error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
        }
        res.status(500).json({ error: error.message || 'Failed to create receptionist' });
    }
});

app.put('/api/receptionists/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'receptionist', req.params.id))) return;
        const { username } = req.body;
        if (username) {
            const existing = await prisma.receptionist.findUnique({ where: { username } });
            if (existing && existing.id !== req.params.id) {
                return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
            }
        }
        const updateData = { ...req.body };
        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        }
        const receptionist = await prisma.receptionist.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.json(receptionist);
    } catch (error: any) {
        console.error('Receptionist update error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
        }
        res.status(500).json({ error: error.message || 'Failed to update receptionist' });
    }
});

app.delete('/api/receptionists/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'receptionist', req.params.id))) return;
        await prisma.receptionist.update({
            where: { id: req.params.id },
            data: { status: 'Deleted' }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Receptionist delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete receptionist' });
    }
});

// ============================================================
// --- Lab Technicians ---
// ============================================================

app.get('/api/lab-technicians', authenticateToken, async (req: any, res: any) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const technicians = await (prisma as any).labTechnician.findMany({
            where: { clinicId: clinicId as string, status: { not: 'Deleted' } },
            orderBy: { lastName: 'asc' }
        });
        res.json(technicians);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch lab technicians' });
    }
});

app.post('/api/lab-technicians', authenticateToken, async (req: any, res: any) => {
    try {
        const { firstName, lastName, specialty, phone, clinicId, username, password } = req.body;
        if (!firstName || !lastName || !phone || !clinicId) {
            return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
        }
        if (username) {
            const existing = await (prisma as any).labTechnician.findUnique({ where: { username } });
            if (existing) return res.status(400).json({ error: 'Bu login allaqachon band.' });
        }
        const data: any = { firstName, lastName, specialty: specialty || 'Umumiy', phone, clinicId, status: 'Active' };
        if (username) data.username = username;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            data.password = await bcrypt.hash(password, salt);
        }
        const technician = await (prisma as any).labTechnician.create({ data });
        res.json(technician);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create lab technician' });
    }
});

app.put('/api/lab-technicians/:id', authenticateToken, async (req: any, res: any) => {
    try {
        if (!(await assertOwnership(req, res, 'labTechnician', req.params.id))) return;
        const { firstName, lastName, specialty, phone, status, username, password } = req.body;
        if (username) {
            const existing = await (prisma as any).labTechnician.findUnique({ where: { username } });
            if (existing && existing.id !== req.params.id) {
                return res.status(400).json({ error: 'Bu login allaqachon band.' });
            }
        }
        const data: any = {};
        if (firstName !== undefined) data.firstName = firstName;
        if (lastName !== undefined) data.lastName = lastName;
        if (specialty !== undefined) data.specialty = specialty;
        if (phone !== undefined) data.phone = phone;
        if (status !== undefined) data.status = status;
        if (username !== undefined) data.username = username || null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            data.password = await bcrypt.hash(password, salt);
        }
        const technician = await (prisma as any).labTechnician.update({ where: { id: req.params.id }, data });
        res.json(technician);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update lab technician' });
    }
});

app.delete('/api/lab-technicians/:id', authenticateToken, async (req: any, res: any) => {
    try {
        if (!(await assertOwnership(req, res, 'labTechnician', req.params.id))) return;
        await (prisma as any).labTechnician.update({
            where: { id: req.params.id },
            data: { status: 'Deleted' }
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to delete lab technician' });
    }
});

// ============================================================
// --- Lab Orders ---
// ============================================================

app.get('/api/lab-orders', authenticateToken, async (req: any, res: any) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
        const user = (req as any).user;
        const where: any = { clinicId: clinicId as string };
        if (user?.role === 'LAB_TECHNICIAN' && user?.technicianId) {
            where.technicianId = user.technicianId;
        }
        const orders = await (prisma as any).labOrder.findMany({
            where,
            orderBy: { orderedAt: 'desc' }
        });
        res.json(orders);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch lab orders' });
    }
});

app.post('/api/lab-orders', authenticateToken, async (req: any, res: any) => {
    try {
        const { patientName, doctorName, technicianId, technicianName, clinicId, orderType, material, toothNumbers, notes, deadline, price, priority, clinicianNotes } = req.body;
        if (!patientName || !technicianId || !clinicId || !orderType || !deadline) {
            return res.status(400).json({ error: 'Majburiy maydonlar to\'ldirilmagan' });
        }
        const order = await (prisma as any).labOrder.create({
            data: {
                patientName,
                doctorName: doctorName || '',
                technicianId,
                technicianName: technicianName || '',
                clinicId,
                orderType,
                material: material || null,
                toothNumbers: toothNumbers || null,
                notes: notes || null,
                deadline,
                price: parseFloat(price) || 0,
                priority: priority || 'Normal',
                clinicianNotes: clinicianNotes || null,
                status: 'Pending'
            }
        });

        res.json(order);
    } catch (error: any) {
        console.error('Lab order create error:', error);
        res.status(500).json({ error: error.message || 'Failed to create lab order' });
    }
});

// Lab buyurtma "Delivered" bo'lganda avtomatik Laboratoriya xarajatini sinxronlaydi:
// yetkazilgan + narx>0 → expense yaratiladi/yangilanadi; aks holda bog'langan expense o'chiriladi.
const syncLabOrderExpense = async (order: any) => {
    try {
        const existing = await prisma.expense.findUnique({ where: { labOrderId: order.id } });
        if (order.status === 'Delivered' && (order.price || 0) > 0) {
            const title = `Lab: ${order.patientName} — ${order.orderType}`;
            const date = (order.deliveredAt ? new Date(order.deliveredAt) : new Date()).toISOString().split('T')[0];
            if (existing) {
                if (existing.amount !== order.price || existing.title !== title) {
                    await prisma.expense.update({
                        where: { id: existing.id },
                        data: { amount: order.price, title }
                    });
                }
            } else {
                await prisma.expense.create({
                    data: {
                        date,
                        amount: order.price,
                        category: 'Lab',
                        title,
                        clinicId: order.clinicId,
                        labOrderId: order.id,
                    }
                });
            }
        } else if (existing) {
            await prisma.expense.delete({ where: { id: existing.id } });
        }
    } catch (err: any) {
        console.error('Lab expense sync error:', err);
    }
};

app.put('/api/lab-orders/:id', authenticateToken, async (req: any, res: any) => {
    try {
        if (!(await assertOwnership(req, res, 'labOrder', req.params.id))) return;
        const updateData: any = { ...req.body };
        // If status is being set to 'Delivered', set deliveredAt
        if (updateData.status === 'Delivered' && !updateData.deliveredAt) {
            updateData.deliveredAt = new Date();
        }
        const order = await (prisma as any).labOrder.update({
            where: { id: req.params.id },
            data: updateData
        });
        await syncLabOrderExpense(order);
        res.json(order);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update lab order' });
    }
});

app.delete('/api/lab-orders/:id', authenticateToken, async (req: any, res: any) => {
    try {
        if (!(await assertOwnership(req, res, 'labOrder', req.params.id))) return;
        await prisma.expense.deleteMany({ where: { labOrderId: req.params.id } });
        await (prisma as any).labOrder.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to delete lab order' });
    }
});

// --- Inventory Log Delete ---
app.delete('/api/inventory/logs/:id', authenticateToken, async (req, res) => {
    try {
        const log = await (prisma as any).inventoryLog.findUnique({
            where: { id: req.params.id }
        });
        if (!log) {
            return res.status(404).json({ error: 'Log not found' });
        }
        // Egalik: log tegishli ombor mahsuloti orqali klinikaga tekshiriladi
        if (!(await assertOwnership(req, res, 'inventoryItem', log.itemId))) return;
        // Reverse the stock change: if log.change was negative (OUT), adding it back restores stock
        await (prisma as any).inventoryItem.update({
            where: { id: log.itemId },
            data: { quantity: { increment: -log.change } }
        });
        await (prisma as any).inventoryLog.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete inventory log error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete inventory log' });
    }
});

// --- Service Categories ---
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }
        const categories = await prisma.serviceCategory.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { name: 'asc' }
        });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
        const category = await prisma.serviceCategory.create({
            data: req.body
        });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create category' });
    }
});

app.put('/api/categories/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'serviceCategory', req.params.id))) return;
        const category = await prisma.serviceCategory.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update category' });
    }
});

app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'serviceCategory', req.params.id))) return;
        await prisma.serviceCategory.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// --- Services ---
app.get('/api/services', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const services = await prisma.service.findMany({
            where: { clinicId: clinicId as string },
            include: { category: true }
        });
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

app.post('/api/services', authenticateToken, async (req, res) => {
    try {
        const service = await prisma.service.create({
            data: req.body
        });
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create service' });
    }
});

app.put('/api/services/:id', authenticateToken, async (req, res) => {
    try {
        // Egalik tekshiruvi (Service id butun son)
        const u = (req as any).user;
        if (u?.role !== 'SUPER_ADMIN') {
            const existing = await prisma.service.findUnique({ where: { id: parseInt(req.params.id) } });
            if (!existing) return res.status(404).json({ error: 'Topilmadi' });
            if (existing.clinicId !== u?.clinicId) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        }
        const service = await prisma.service.update({
            where: { id: parseInt(req.params.id) },
            data: req.body
        });
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update service' });
    }
});

app.delete('/api/services/:id', authenticateToken, async (req, res) => {
    try {
        const u = (req as any).user;
        if (u?.role !== 'SUPER_ADMIN') {
            const existing = await prisma.service.findUnique({ where: { id: parseInt(req.params.id) } });
            if (!existing) return res.status(404).json({ error: 'Topilmadi' });
            if (existing.clinicId !== u?.clinicId) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        }
        await prisma.service.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete service' });
    }
});

// --- Super Admin: Clinics & Plans ---

// --- Public demo request (landing page, no auth) ---
app.post('/api/public/demo-request', async (req, res) => {
    try {
        const { name, clinicName, phone, city, doctorsCount, source } = req.body;
        const id = require('crypto').randomUUID();
        await prisma.$executeRawUnsafe(
            `INSERT INTO "DemoRequest" ("id","name","clinicName","phone","city","doctorsCount","source","status","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,'New',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            id, name || 'Noma\'lum', clinicName || null, phone || '', city || null,
            doctorsCount ? parseInt(doctorsCount) : null, source || 'landing'
        );
        res.json({ success: true, id });
    } catch (error) {
        console.error('Demo request error:', error);
        res.status(500).json({ error: 'Failed to save demo request' });
    }
});

app.get('/api/admin/demo-requests', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "DemoRequest" ORDER BY "createdAt" DESC`);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch demo requests' });
    }
});

app.put('/api/admin/demo-requests/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const { status, notes } = req.body;
        await prisma.$executeRawUnsafe(
            `UPDATE "DemoRequest" SET "status"=$1,"notes"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3`,
            status, notes ?? null, req.params.id
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update demo request' });
    }
});

app.delete('/api/admin/demo-requests/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM "DemoRequest" WHERE "id"=$1`, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete demo request' });
    }
});

// --- Leads ---
app.get('/api/leads', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const leads = await prisma.lead.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { createdAt: 'desc' }
        });
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

app.post('/api/leads', authenticateToken, async (req, res) => {
    try {
        const lead = await prisma.lead.create({
            data: req.body
        });
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create lead' });
    }
});

app.put('/api/leads/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'lead', req.params.id))) return;
        const lead = await prisma.lead.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update lead' });
    }
});

app.delete('/api/leads/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'lead', req.params.id))) return;
        await prisma.lead.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});

app.get('/api/clinics', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const clinics = await prisma.clinic.findMany({
            where: {
                status: { not: 'Deleted' }
            },
            include: { plan: true }
        });
        // Parol hashlarini javobdan olib tashlaymiz
        const clinicsSafe = clinics.map((c: any) => { const { password, ...rest } = c; return rest; });
        res.json(clinicsSafe);
    } catch (error: any) {
        console.error('Failed to fetch clinics:', error);
        res.status(500).json({ error: 'Failed to fetch clinics', details: error.message });
    }
});

app.get('/api/clinics/:id', authenticateToken, async (req, res) => {
    try {
        const clinicId = req.params.id;
        // Faqat SUPER_ADMIN yoki o'z klinikasini so'ragan foydalanuvchi ko'ra oladi
        if (!canAccessClinic(req, clinicId)) {
            return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        }
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            include: { plan: true }
        });
        if (!clinic) {
            return res.status(404).json({ error: 'Klinika topilmadi' });
        }
        // Parol hashini javobdan olib tashlaymiz (UI'ga kerak emas)
        const { password, ...clinicSafe } = clinic as any;
        res.json(clinicSafe);
    } catch (error: any) {
        console.error('Failed to fetch clinic by ID:', error);
        res.status(500).json({ error: 'Failed to fetch clinic details', details: error.message });
    }
});

app.post('/api/clinics', authenticateToken, requireRole('SUPER_ADMIN', 'SALES_AGENT'), async (req, res) => {
    try {
        const { name, adminName, username, password, phone, planId, status, subscriptionStartDate, expiryDate, monthlyRevenue, customPrice } = req.body;

        let passwordData = password ? password.trim() : '';
        if (passwordData) {
            const salt = await bcrypt.genSalt(10);
            passwordData = await bcrypt.hash(passwordData, salt);
        }

        const user = (req as any).user;
        let salesAgentId = null;
        if (user && user.role === 'SALES_AGENT') {
            salesAgentId = user.salesAgentId;
        }

        const clinic = await prisma.clinic.create({
            data: {
                name,
                adminName,
                username: username.trim(),
                password: passwordData,
                phone,
                planId,
                status,
                subscriptionStartDate,
                expiryDate,
                monthlyRevenue,
                customPrice: customPrice !== undefined ? Number(customPrice) : null,
                subscriptionType: req.body.subscriptionType || 'Paid',
                salesAgentId: salesAgentId
            }
        });
        res.json(clinic);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create clinic' });
    }
});

app.put('/api/clinics/:id', authenticateToken, requireRole('SUPER_ADMIN', 'SALES_AGENT'), async (req, res) => {
    try {
        const user = (req as any).user;
        let updateData = { ...req.body };

        if (user.role === 'SALES_AGENT') {
            const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id } });
            if (!clinic) return res.status(404).json({ error: 'Klinika topilmadi' });
            if (clinic.salesAgentId !== user.salesAgentId) {
                return res.status(403).json({ error: 'Bu klinika sizga biriktirilmagan' });
            }
            // Sotuvchi faqat obuna bilan bog'liq maydonlarni o'zgartira oladi
            const { status, expiryDate, planId, subscriptionType, customPrice } = updateData;
            updateData = { status, expiryDate, planId, subscriptionType, customPrice };
        }

        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        }
        if (updateData.customPrice !== undefined) {
            updateData.customPrice = updateData.customPrice !== null ? Number(updateData.customPrice) : null;
        }
        const clinic = await prisma.clinic.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.json(clinic);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update clinic' });
    }
});

app.delete('/api/clinics/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const clinicId = req.params.id;

        // Soft Delete: Just mark the clinic as Deleted without losing any related data
        await prisma.clinic.update({
            where: { id: clinicId },
            data: { status: 'Deleted' }
        });

        // Stop the bot if it was running
        try {
            botManager.removeBot(clinicId);
        } catch (botError) {
            console.warn('Failed to stop bot during clinic deletion:', botError);
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Clinic delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete clinic' });
    }
});

app.get('/api/plans', authenticateToken, async (req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany();
        const parsedPlans = plans.map((p: any) => {
            // ...
            try {
                return {
                    ...p,
                    features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features
                };
            } catch (parseError) {
                console.error(`❌ Failed to parse features for plan ${p.id} (${p.name}):`, parseError);
                return {
                    ...p,
                    features: [] // Return empty features on error instead of crashing
                };
            }
        });
        res.json(parsedPlans);
    } catch (error: any) {
        console.error('❌ Failed to fetch plans:', error);
        res.status(500).json({
            error: 'Failed to fetch plans',
            details: error.message
        });
    }
});

app.put('/api/plans/:id', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.features) {
            data.features = JSON.stringify(data.features);
        }
        const plan = await prisma.subscriptionPlan.update({
            where: { id: req.params.id },
            data: data
        });
        res.json({ ...plan, features: JSON.parse(plan.features) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

// --- DMED Integration ---
app.post('/api/clinics/:id/dmed-settings', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { dmedEnabled, dmedApiKey, dmedApiSecret, dmedClinicId } = req.body;
        const clinic = await prisma.clinic.update({
            where: { id: req.params.id },
            data: { dmedEnabled, dmedApiKey, dmedApiSecret, dmedClinicId }
        });
        res.json(clinic);
    } catch (error) {
        res.status(500).json({ error: 'DMED sozlamalarini saqlashda xatolik' });
    }
});

app.post('/api/clinics/:id/dmed-test', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { dmedApiKey, dmedApiSecret } = req.body;
        const result = await dmedService.validateCredentials(dmedApiKey, dmedApiSecret);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Ulanishni tekshirishda xatolik' });
    }
});

app.get('/api/patients/lookup/:pinfl', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId talab qilinadi' });
        const result = await dmedService.findPatientByPinfl(clinicId as string, req.params.pinfl);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Bemor ma\'lumotlarini olishda xatolik' });
    }
});

// Manual sync Visit to DMED
app.post('/api/visits/:id/dmed-sync', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        await dmedService.syncEncounter(clinicId, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'DMEDga yuborishda xatolik' });
    }
});

// --- Umumiy sozlamalar (klinika admini o'z klinikasini yangilaydi) ---
// PUT /api/clinics/:id faqat SUPER_ADMIN/SALES_AGENT uchun, shuning uchun
// klinika admini uchun xavfsiz maydonlargina ruxsat etilgan alohida endpoint.
app.put('/api/clinics/:id/general', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { name, address, phone, email, ownerPhone, startHour, endHour, enableReceipts } = req.body;
        const clinic = await prisma.clinic.update({
            where: { id: req.params.id },
            data: {
                name: name !== undefined ? name : undefined,
                address: address !== undefined ? (address || null) : undefined,
                phone: phone !== undefined ? phone : undefined,
                email: email !== undefined ? (email || null) : undefined,
                ownerPhone: ownerPhone !== undefined ? (ownerPhone || null) : undefined,
                startHour: startHour !== undefined ? Number(startHour) : undefined,
                endHour: endHour !== undefined ? Number(endHour) : undefined,
                enableReceipts: enableReceipts !== undefined ? !!enableReceipts : undefined
            }
        });
        res.json(clinic);
    } catch (error: any) {
        console.error('General settings update error:', error);
        res.status(500).json({ error: 'Umumiy sozlamalarni saqlashda xatolik' });
    }
});

// --- Bot Settings ---
app.put('/api/clinics/:id/settings', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { botToken, ownerPhone } = req.body;
        const clinicId = req.params.id;

        // Update clinic with new bot token and owner phone
        const clinic = await prisma.clinic.update({
            where: { id: clinicId },
            data: {
                botToken: botToken !== undefined ? (botToken || null) : undefined,
                ownerPhone: ownerPhone !== undefined ? (ownerPhone || null) : undefined
            } as any
        });

        // Restart bot ONLY if token is provided or explicitly cleared
        if (botToken !== undefined) {
            if (botToken) {
                botManager.startBot(clinicId, botToken);
            } else {
                botManager.removeBot(clinicId);
            }
        }

        res.json({ success: true, clinic });
    } catch (error: any) {
        console.error('Bot settings update error:', error);
        res.status(500).json({ error: error.message || 'Failed to update bot settings' });
    }
});

// --- Prepayment Settings ---
app.get('/api/clinics/:id/prepayment-settings', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id } });
        if (!clinic) return res.status(404).json({ error: 'Klinika topilmadi' });
        res.json({
            prepaymentEnabled: (clinic as any).prepaymentEnabled ?? false,
            prepaymentCardNumber: (clinic as any).prepaymentCardNumber || '',
            prepaymentAmount: (clinic as any).prepaymentAmount ?? 0,
        });
    } catch (error) {
        res.status(500).json({ error: 'Oldindan to\'lov sozlamalarini olishda xatolik' });
    }
});

app.put('/api/clinics/:id/prepayment-settings', authenticateToken, async (req, res) => {
    try {
        if (!canAccessClinic(req, req.params.id)) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        const { prepaymentEnabled, prepaymentCardNumber, prepaymentAmount } = req.body;
        const clinic = await prisma.clinic.update({
            where: { id: req.params.id },
            data: {
                prepaymentEnabled: prepaymentEnabled ?? false,
                prepaymentCardNumber: prepaymentCardNumber || null,
                prepaymentAmount: prepaymentAmount ? Number(prepaymentAmount) : null,
            } as any
        });
        res.json({ success: true, clinic });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Oldindan to\'lov sozlamalarini saqlashda xatolik' });
    }
});

// Get bot username for clinic (public endpoint - no auth needed)
app.get('/api/clinics/:id/bot-username', async (req, res) => {
    try {
        const clinicId = req.params.id;
        console.log(`Requesting bot username for clinic: ${clinicId}`);
        const username = await botManager.getBotUsername(clinicId);
        console.log(`Found username: ${username}`);
        res.json({ botUsername: username });
    } catch (error: any) {
        console.error('Get bot username error:', error);
        res.status(500).json({ error: error.message || 'Failed to get bot username' });
    }
});

// --- ICD-10 & Diagnoses ---
app.get('/api/icd10', authenticateToken, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json([]);
        }

        const codes = await prisma.iCD10Code.findMany({
            where: {
                OR: [
                    { code: { contains: query as string } },
                    { name: { contains: query as string } },
                    { category: { contains: query as string } }
                ]
            },
            take: 50
        });
        res.json(codes);
    } catch (error) {
        console.error('ICD-10 search error:', error);
        res.status(500).json({ error: 'Failed to search ICD-10 codes' });
    }
});

app.post('/api/diagnoses', authenticateToken, async (req, res) => {
    try {
        const { patientId, code, date, notes, status, clinicId } = req.body;
        if (!(await assertPatientOwnership(req, res, patientId))) return;

        const diagnosis = await prisma.patientDiagnosis.create({
            data: {
                patient: { connect: { id: patientId } },
                clinic: { connect: { id: clinicId } },
                date,
                notes,
                status,
                icd10: {
                    connectOrCreate: {
                        where: { code: code },
                        create: {
                            code: code,
                            name: req.body.name || code,
                            description: req.body.description || ''
                        }
                    }
                }
            },
            include: { icd10: true }
        });
        res.json(diagnosis);
    } catch (error) {
        console.error('Create diagnosis error:', error);
        res.status(500).json({ error: 'Failed to create diagnosis' });
    }
});

app.get('/api/diagnoses', authenticateToken, async (req, res) => {
    try {
        const { patientId } = req.query;
        if (!patientId) {
            return res.status(400).json({ error: 'patientId is required' });
        }
        if (!(await assertPatientOwnership(req, res, patientId as string))) return;

        const diagnoses = await prisma.patientDiagnosis.findMany({
            where: { patientId: patientId as string },
            include: { icd10: true },
            orderBy: { date: 'desc' }
        });
        res.json(diagnoses);
    } catch (error) {
        console.error('Get diagnoses error:', error);
        res.status(500).json({ error: 'Failed to fetch diagnoses' });
    }
});

app.delete('/api/diagnoses/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'patientDiagnosis', req.params.id))) return;
        await prisma.patientDiagnosis.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete diagnosis error:', error);
        res.status(500).json({ error: 'Failed to delete diagnosis' });
    }
});

// --- Patient Photos ---
app.post('/api/patients/:id/photos', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const { description, category } = req.body;
        const patientId = req.params.id;

        const photo = await prisma.patientPhoto.create({
            data: {
                patientId,
                url: (req.file as any).path, // Cloudinary URL
                description,
                category: category || 'Other'
            }
        });

        res.json(photo);
    } catch (error: any) {
        console.error('Upload photo error:', error);
        res.status(500).json({
            error: 'Failed to upload photo',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Avatar upload
app.post('/api/patients/:id/avatar', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const patientId = req.params.id;
        const url = (req.file as any).path;

        const patient = await prisma.patient.update({
            where: { id: patientId },
            data: { avatarUrl: url }
        });

        res.json({ success: true, url, patient });
    } catch (error: any) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ 
            error: 'Failed to upload avatar',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Portrait upload
app.post('/api/patients/:id/portrait', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const patientId = req.params.id;
        const url = (req.file as any).path;

        const patient = await prisma.patient.update({
            where: { id: patientId },
            data: { portraitUrl: url }
        });

        res.json({ success: true, url, patient });
    } catch (error: any) {
        console.error('Portrait upload error:', error);
        res.status(500).json({ 
            error: 'Failed to upload portrait',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.get('/api/patients/:id/photos', authenticateToken, async (req, res) => {
    try {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const photos = await prisma.patientPhoto.findMany({
            where: { patientId: req.params.id },
            orderBy: { date: 'desc' }
        });
        res.json(photos);
    } catch (error: any) {
        console.error('Get photos error:', error);
        res.status(500).json({
            error: 'Failed to fetch photos',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
    try {
        const photo = await prisma.patientPhoto.findUnique({
            where: { id: req.params.id }
        });

        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        // Egalik: surat tegishli bemor orqali klinikaga tekshiriladi
        if (!(await assertPatientOwnership(req, res, photo.patientId))) return;

        // Delete from Cloudinary
        if (photo.url.includes('cloudinary')) {
            const publicId = photo.url.split('/').pop()?.split('.')[0];
            if (publicId) {
                await cloudinary.uploader.destroy(`patient-photos/${publicId}`);
            }
        }

        await prisma.patientPhoto.delete({
            where: { id: req.params.id }
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete photo error:', error);
        res.status(500).json({
            error: 'Failed to delete photo',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// --- Tooth Data ---
app.get('/api/patients/:id/teeth', authenticateToken, async (req, res) => {
    try {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const teeth = await prisma.toothData.findMany({
            where: { patientId: req.params.id }
        });

        // Parse conditions JSON
        const parsedTeeth = teeth.map((t: any) => ({
            ...t,
            conditions: JSON.parse(t.conditions)
        }));

        res.json(parsedTeeth);
    } catch (error) {
        console.error('Get teeth error:', error);
        res.status(500).json({ error: 'Failed to fetch tooth data' });
    }
});

app.post('/api/patients/:id/teeth', authenticateToken, async (req, res) => {
    try {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const patientId = req.params.id;
        const { number, conditions, notes } = req.body;

        // Upsert tooth data
        const tooth = await prisma.toothData.upsert({
            where: {
                patientId_number: {
                    patientId,
                    number
                }
            },
            update: {
                conditions: JSON.stringify(conditions),
                notes
            },
            create: {
                patientId,
                number,
                conditions: JSON.stringify(conditions),
                notes
            }
        });

        res.json({
            ...tooth,
            conditions: JSON.parse(tooth.conditions)
        });
    } catch (error) {
        console.error('Save tooth error:', error);
        res.status(500).json({ error: 'Failed to save tooth data' });
    }
});


// --- Facebook Integration ---
const FB_APP_ID = process.env.FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FB_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/api/facebook/callback';

// Unified Facebook config check
app.get('/api/facebook/config-check', authenticateToken, (req, res) => {
    res.json({
        isConfigured: !!process.env.FACEBOOK_APP_ID && !!process.env.FACEBOOK_APP_SECRET,
        appId: process.env.FACEBOOK_APP_ID ? `${process.env.FACEBOOK_APP_ID.substring(0, 4)}...` : null,
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/api/facebook/callback'
    });
});

app.post('/api/facebook/save-config', authenticateToken, async (req, res) => {
    const { appId, appSecret } = req.body;
    if (!appId || !appSecret) return res.status(400).json({ error: 'appId and appSecret are required' });

    try {
        // Update process.env for current session
        process.env.FACEBOOK_APP_ID = appId;
        process.env.FACEBOOK_APP_SECRET = appSecret;
        
        // Also try to update .env file if it exists
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            const updateOrAdd = (key: string, value: string) => {
                const regex = new RegExp(`^${key}=.*`, 'm');
                if (regex.test(envContent)) {
                    envContent = envContent.replace(regex, `${key}=${value}`);
                } else {
                    envContent += `\n${key}=${value}`;
                }
            };

            updateOrAdd('FACEBOOK_APP_ID', appId);
            updateOrAdd('FACEBOOK_APP_SECRET', appSecret);
            fs.writeFileSync(envPath, envContent);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Save FB config error:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

app.get('/api/facebook/auth-url', authenticateToken, (req, res) => {
    const clinicId = getScopedClinicId(req);
    if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });

    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/api/facebook/callback';

    if (!appId) {
        return res.status(500).json({ error: 'Facebook App ID topilmadi. Iltimos, .env faylida FACEBOOK_APP_ID ni kiriting.' });
    }

    // Updated scopes to include business management and profile for better visibility
    const scopes = ['pages_show_list', 'leads_retrieval', 'pages_read_engagement', 'pages_manage_metadata', 'public_profile', 'business_management'];
    const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join(',')}&state=${clinicId}`;

    res.json({ url });
});

app.get('/api/facebook/callback', async (req, res) => {
    const { code, state: clinicId } = req.query;

    if (!code) {
        return res.status(400).send('Facebook authorization failed: No code provided');
    }

    try {
        // 1. Exchange code for user access token
        const tokenRes = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
            params: {
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                redirect_uri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/api/facebook/callback',
                code
            }
        });

        const userAccessToken = tokenRes.data.access_token;
        console.log('✅ FB Token Exchange Success. Token starts with:', userAccessToken.substring(0, 10));

        // 2. Save user token temporarily (or update clinic)
        await prisma.clinic.update({
            where: { id: clinicId as string },
            data: { facebookUserAccessToken: userAccessToken }
        });

        // 3. Return script to notify opener and close popup
        res.send(`
            <html>
                <body style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background: #f3f4f6;">
                    <div style="text-align: center; padding: 20px; background: white; border-radius: 12px; shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <p style="color: #111827; font-weight: 600;">Muvaffaqiyatli ulandi!</p>
                        <p style="color: #6b7280; font-size: 14px;">Oyna avtomatik yopilmoqda...</p>
                    </div>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({ type: 'FB_CONNECTED' }, '*');
                        }
                        setTimeout(() => window.close(), 1000);
                    </script>
                </body>
            </html>
        `);
    } catch (error: any) {
        console.error('FB Callback error:', error.response?.data || error.message);
        res.status(500).send('Failed to connect Facebook');
    }
});

app.get('/api/facebook/pages', authenticateToken, async (req, res) => {
    const clinicId = getScopedClinicId(req);
    if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });

    try {
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId as string }
        });

        if (!clinic || !clinic.facebookUserAccessToken) {
            return res.status(404).json({ error: 'Facebook not connected' });
        }

        const pagesRes = await axios.get(`https://graph.facebook.com/v18.0/me/accounts`, {
            params: { access_token: clinic.facebookUserAccessToken }
        });

        console.log(`📊 FB Pages Response for Clinic ${clinicId}:`, {
            count: pagesRes.data.data?.length || 0,
            pages: pagesRes.data.data?.map((p: any) => ({ name: p.name, id: p.id, tasks: p.tasks }))
        });

        res.json(pagesRes.data.data);
    } catch (error: any) {
        console.error('Fetch FB Pages error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch Facebook pages' });
    }
});

app.post('/api/facebook/select-page', authenticateToken, async (req, res) => {
    const { pageId, pageAccessToken, pageName } = req.body;
    const clinicId = getScopedClinicId(req);

    if (!clinicId || !pageId || !pageAccessToken) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Update Database
        await prisma.clinic.update({
            where: { id: clinicId },
            data: {
                facebookPageId: pageId,
                facebookPageAccessToken: pageAccessToken,
                facebookPageName: pageName
            }
        });

        // 2. Automatically subscribe the App to the Page's Leadgen events
        // This avoids the user having to manually add the app to the page in Meta settings
        try {
            console.log(`🔗 Attempting to subscribe App to FB Page ${pageId}...`);
            await axios.post(`https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`, null, {
                params: {
                    access_token: pageAccessToken,
                    subscribed_fields: 'leadgen'
                }
            });
            console.log(`✅ App successfully subscribed to Page ${pageId}`);
        } catch (subError: any) {
            console.error('⚠️ FB Page Subscription warning:', subError.response?.data || subError.message);
            // We don't fail the whole request if subscription fails, 
            // as it might be already subscribed or handled manually
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Select FB Page error:', error);
        res.status(500).json({ error: 'Failed to save selected page' });
    }
});

app.post('/api/facebook/disconnect', authenticateToken, async (req, res) => {
    const clinicId = getScopedClinicId(req);
    if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });

    try {
        await prisma.clinic.update({
            where: { id: clinicId },
            data: {
                facebookPageId: null,
                facebookPageAccessToken: null,
                facebookUserAccessToken: null,
                facebookPageName: null
            }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Disconnect FB error:', error);
        res.status(500).json({ error: 'Failed to disconnect Facebook' });
    }
});

// --- Facebook Leads Webhook ---
const FB_WEBHOOK_VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'denta_leads_secret';

// 1. Webhook Verification (GET)
app.get('/api/facebook/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === FB_WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ FB Webhook verified');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Lead Processing (POST)
app.post('/api/facebook/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry: any) => {
            entry.changes.forEach(async (change: any) => {
                if (change.field === 'leadgen') {
                    const { leadgen_id, page_id } = change.value;
                    console.log(`📩 New FB Lead Notification: ID ${leadgen_id} for Page ${page_id}`);
                    
                    try {
                        // Find clinic
                        const clinic = await prisma.clinic.findFirst({
                            where: { facebookPageId: page_id }
                        });

                        if (!clinic || !clinic.facebookPageAccessToken) {
                            console.error(`❌ Clinic not found for FB Page ${page_id}`);
                            return;
                        }

                        // Fetch Lead Details
                        let leadData;
                        if (clinic.facebookPageAccessToken === 'test_token') {
                            leadData = {
                                field_data: [
                                    { name: 'full_name', values: ['Test FB User'] },
                                    { name: 'phone_number', values: ['+998901234567'] }
                                ]
                            };
                        } else {
                            const leadRes = await axios.get(`https://graph.facebook.com/v18.0/${leadgen_id}`, {
                                params: { access_token: clinic.facebookPageAccessToken }
                            });
                            leadData = leadRes.data;
                        }

                        const fieldData: any = {};
                        const additionalQAs: string[] = [];
                        leadData.field_data.forEach((f: any) => {
                            const name = f.name;
                            const value = f.values && f.values.length > 0 ? f.values[0] : '';
                            fieldData[name] = value;
                            if (name !== 'full_name' && name !== 'phone_number') {
                                const readableName = name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                                additionalQAs.push(`${readableName}: ${value}`);
                            }
                        });

                        let notesText = `FB Lead ID: ${leadgen_id}`;
                        if (additionalQAs.length > 0) {
                            notesText += `\n\nSavollar va Javoblar:\n` + additionalQAs.join('\n');
                        }

                        // Create Lead in CRM
                        await prisma.lead.create({
                            data: {
                                name: fieldData.full_name || 'Facebook User',
                                phone: fieldData.phone_number || 'N/A',
                                source: 'Facebook',
                                service: clinic.facebookPageName || 'Facebook Lead',
                                notes: notesText,
                                clinicId: clinic.id,
                                status: 'New'
                            }
                        });

                        console.log(`✅ FB Lead saved: ${fieldData.full_name}`);
                    } catch (err: any) {
                        console.error('❌ Error processing FB lead:', err.response?.data || err.message);
                    }
                }
            });
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// --- Inventory Management ---
app.get('/api/inventory', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const items = await prisma.inventoryItem.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { name: 'asc' }
        });
        res.json(items);
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory items' });
    }
});

// Inventory Analytics - Get material usage within date range
app.get('/api/inventory/analytics', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        const { startDate, endDate } = req.query;
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        // Build where clause
        const where: any = {
            item: { clinicId: clinicId as string },
            type: 'OUT' // Only count outgoing usage
        };

        // Add date filtering if provided
        if (startDate && endDate) {
            where.date = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string)
            };
        }

        // Get all OUT logs grouped by item
        const logs = await prisma.inventoryLog.findMany({
            where,
            include: {
                item: true
            },
            orderBy: { date: 'desc' }
        });

        // Group by item and calculate totals
        const analytics = logs.reduce((acc: any, log: any) => {
            const itemId = log.itemId;
            if (!acc[itemId]) {
                acc[itemId] = {
                    itemId,
                    itemName: log.item.name,
                    unit: log.item.unit,
                    totalUsed: 0,
                    usageCount: 0
                };
            }
            acc[itemId].totalUsed += Math.abs(log.change);
            acc[itemId].usageCount += 1;
            return acc;
        }, {});

        res.json(Object.values(analytics));
    } catch (error) {
        console.error('Get inventory analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory analytics' });
    }
});

app.post('/api/inventory', authenticateToken, async (req, res) => {
    try {
        const { name, unit, quantity, minQuantity, clinicId, initialCost } = req.body;

        const item = await prisma.inventoryItem.create({
            data: {
                name,
                unit,
                quantity: parseFloat(quantity) || 0,
                minQuantity: parseFloat(minQuantity) || 0,
                clinicId
            }
        });

        // Boshlang'ich zaxira narxi kiritilgan bo'lsa — Ombor xarajati yoziladi
        const cost = parseFloat(initialCost) || 0;
        if (cost > 0) {
            await prisma.expense.create({
                data: {
                    date: new Date().toISOString().split('T')[0],
                    amount: cost,
                    category: 'Inventory',
                    title: `Ombor: ${item.name}`,
                    clinicId,
                    inventoryItemId: item.id,
                }
            }).catch((err: any) => console.error('Inventory initial expense error:', err));
        }

        res.json(item);
    } catch (error) {
        console.error('Create inventory item error:', error);
        res.status(500).json({ error: 'Failed to create inventory item' });
    }
});

app.put('/api/inventory/:id/stock', authenticateToken, async (req, res) => {
    try {
        const { change, type, note, userName, patientId, cost } = req.body;
        const itemId = req.params.id;

        // Get current item
        const currentItem = await prisma.inventoryItem.findUnique({
            where: { id: itemId }
        });

        if (!currentItem) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Egalik tekshiruvi
        if ((req as any).user?.role !== 'SUPER_ADMIN' && currentItem.clinicId !== (req as any).user?.clinicId) {
            return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
        }

        // Calculate new quantity
        const changeAmount = parseFloat(change);
        const actualChange = type === 'OUT' ? -Math.abs(changeAmount) : Math.abs(changeAmount);
        const newQuantity = currentItem.quantity + actualChange;

        if (newQuantity < 0) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        const parsedCost = parseFloat(cost) || 0;

        // Update item and create log in a transaction
        const [updatedItem] = await prisma.$transaction([
            prisma.inventoryItem.update({
                where: { id: itemId },
                data: { quantity: newQuantity }
            }),
            prisma.inventoryLog.create({
                data: {
                    itemId,
                    change: actualChange,
                    type,
                    note,
                    userName,
                    patientId: patientId || null,
                    cost: parsedCost > 0 ? parsedCost : null
                }
            })
        ]);

        // Kirim (IN) narx bilan bo'lsa — Ombor xarajati yoziladi
        if (type === 'IN' && parsedCost > 0) {
            await prisma.expense.create({
                data: {
                    date: new Date().toISOString().split('T')[0],
                    amount: parsedCost,
                    category: 'Inventory',
                    title: `Ombor: ${currentItem.name}`,
                    note: note || null,
                    clinicId: currentItem.clinicId,
                    inventoryItemId: itemId,
                }
            }).catch((err: any) => console.error('Inventory expense error:', err));
        }

        res.json(updatedItem);
    } catch (error: any) {
        console.error('Update inventory stock error:', error);
        res.status(500).json({ error: error.message || 'Failed to update stock' });
    }
});

app.get('/api/inventory/logs', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);
        const { patientId } = req.query;

        if (!clinicId) {
            return res.status(400).json({ error: 'Clinic ID is required' });
        }

        const where: any = {
            item: {
                clinicId: clinicId as string
            }
        };

        if (patientId) {
            where.patientId = patientId as string;
        }

        const logs = await prisma.inventoryLog.findMany({
            where,
            include: {
                item: true,
                patient: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: {
                date: 'desc'
            }
        });

        res.json(logs);
    } catch (error) {
        console.error('Get inventory logs error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory logs' });
    }
});

app.delete('/api/inventory/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await assertOwnership(req, res, 'inventoryItem', req.params.id))) return;
        // Delete logs first, then item (cascade should handle this but being explicit)
        await prisma.inventoryLog.deleteMany({
            where: { itemId: req.params.id }
        });

        await prisma.inventoryItem.delete({
            where: { id: req.params.id }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete inventory item error:', error);
        res.status(500).json({ error: 'Failed to delete inventory item' });
    }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        details: err.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ============================================
// AUTOMATED REMINDER SYSTEM
// ============================================

// ─── Avtomatika dvigateli (AutomationRule asosida) ───────────────────────────
// Toshkent vaqti (UTC+5, DST yo'q): qabul sanasi/vaqti klinika devor soatida saqlanadi.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const tashkentNowMs = () => Date.now() + TASHKENT_OFFSET_MS;
const tashkentDateStr = (offsetDays = 0) =>
    new Date(Date.now() + TASHKENT_OFFSET_MS + offsetDays * 86400000).toISOString().split('T')[0];

// Bemor tug'ilgan kunini MM-DD ga keltirish (YYYY-MM-DD yoki DD.MM.YYYY formatlari)
function dobToMonthDay(dob: string): string {
    if (!dob) return '';
    if (dob.includes('-')) {
        const parts = dob.split('-');
        if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
    } else if (dob.includes('.')) {
        const parts = dob.split('.');
        if (parts.length >= 2) return `${parts[1]}-${parts[0]}`;
    }
    return '';
}

async function loadRulesWithClinics(trigger: string) {
    const rules = await prisma.automationRule.findMany({
        where: { active: true, trigger },
        include: { template: true }
    });
    if (rules.length === 0) return { rules, clinicMap: new Map<string, any>() };
    const clinicIds = [...new Set(rules.map((r: any) => r.clinicId))];
    const clinics = await prisma.clinic.findMany({ where: { id: { in: clinicIds } } });
    return { rules, clinicMap: new Map<string, any>(clinics.map((c: any) => [c.id, c])) };
}

// Har 10 daqiqada: "Qabuldan N soat oldin" qoidalari
async function processBeforeAppointmentRules() {
    try {
        const { rules, clinicMap } = await loadRulesWithClinics('before_appointment');
        if (rules.length === 0) return;

        const todayStr = tashkentDateStr(0);
        const tomorrowStr = tashkentDateStr(1);
        const nowMs = tashkentNowMs();

        for (const rule of rules) {
            const clinic = clinicMap.get(rule.clinicId);
            if (!clinic) continue;
            const hours = rule.hoursBefore || 2;

            const appointments = await prisma.appointment.findMany({
                where: {
                    clinicId: rule.clinicId,
                    date: { in: [todayStr, tomorrowStr] },
                    status: { in: ['Confirmed', 'Pending'] },
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
                include: { patient: true, doctor: true }
            });

            for (const appt of appointments) {
                const apptMs = Date.parse(`${appt.date}T${appt.time}:00Z`);
                if (isNaN(apptMs)) continue;
                const sendFromMs = apptMs - hours * 3600000;
                // Yuborish oynasi: (qabul - N soat) dan qabul vaqtigacha
                if (nowMs < sendFromMs || nowMs >= apptMs) continue;

                // Dedupe: shu qoida shu qabulga allaqachon yuborilgan (yoki urinilgan)
                const existing = await prisma.telegramLog.findFirst({ where: { ruleId: rule.id, refId: appt.id } });
                if (existing) continue;

                const message = processTemplate(rule.template.text, {
                    patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
                    firstName: appt.patient.firstName,
                    lastName: appt.patient.lastName,
                    date: appt.date,
                    time: appt.time,
                    clinicName: clinic.name,
                    doctorName: `${appt.doctor.firstName} ${appt.doctor.lastName}`,
                });

                await sendUnified(clinic, appt.patient, message, {
                    channel: rule.channel as any, source: 'auto', ruleId: rule.id, refId: appt.id, type: 'AutoReminder'
                });
                await prisma.appointment.update({ where: { id: appt.id }, data: { reminderSent: true } }).catch(() => { });
            }
        }
    } catch (error) {
        console.error('❌ before_appointment rule engine error:', error);
    }
}

// Har kuni 09:00: tug'ilgan kun qoidalari
async function processBirthdayRules() {
    try {
        const { rules, clinicMap } = await loadRulesWithClinics('birthday');
        if (rules.length === 0) return;

        const now = new Date(tashkentNowMs());
        const todayMonthDay = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
        const year = now.getUTCFullYear();
        const todayStr = tashkentDateStr(0);

        for (const rule of rules) {
            const clinic = clinicMap.get(rule.clinicId);
            if (!clinic) continue;

            const patients = await prisma.patient.findMany({
                where: { clinicId: rule.clinicId, status: 'Active' }
            });

            for (const patient of patients) {
                if (dobToMonthDay(patient.dob) !== todayMonthDay) continue;

                const refId = `${patient.id}:${year}`;
                const existing = await prisma.telegramLog.findFirst({ where: { ruleId: rule.id, refId } });
                if (existing) continue;

                const message = processTemplate(rule.template.text, {
                    patientName: `${patient.firstName} ${patient.lastName}`,
                    firstName: patient.firstName,
                    lastName: patient.lastName,
                    date: todayStr,
                    clinicName: clinic.name,
                });

                await sendUnified(clinic, patient, message, {
                    channel: rule.channel as any, source: 'birthday', ruleId: rule.id, refId, type: 'Birthday'
                });
            }
        }
    } catch (error) {
        console.error('❌ birthday rule engine error:', error);
    }
}

// Har kuni 20:00: kelmagan bemorlar qoidalari
async function processNoShowRules() {
    try {
        const { rules, clinicMap } = await loadRulesWithClinics('no_show');
        if (rules.length === 0) return;

        const todayStr = tashkentDateStr(0);

        for (const rule of rules) {
            const clinic = clinicMap.get(rule.clinicId);
            if (!clinic) continue;

            const appointments = await prisma.appointment.findMany({
                where: {
                    clinicId: rule.clinicId,
                    date: todayStr,
                    status: 'No-Show',
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
                include: { patient: true, doctor: true }
            });

            for (const appt of appointments) {
                const existing = await prisma.telegramLog.findFirst({ where: { ruleId: rule.id, refId: appt.id } });
                if (existing) continue;

                const message = processTemplate(rule.template.text, {
                    patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
                    firstName: appt.patient.firstName,
                    lastName: appt.patient.lastName,
                    date: appt.date,
                    time: appt.time,
                    clinicName: clinic.name,
                    doctorName: `${appt.doctor.firstName} ${appt.doctor.lastName}`,
                });

                const replyMarkup = {
                    inline_keyboard: [[{ text: "📅 Qabulga yozilish", callback_data: "start_booking" }]]
                };

                await sendUnified(clinic, appt.patient, message, {
                    channel: rule.channel as any, source: 'noshow', ruleId: rule.id, refId: appt.id, type: 'NoShow', replyMarkup
                });
            }
        }
    } catch (error) {
        console.error('❌ no_show rule engine error:', error);
    }
}

/**
 * Helper function: Send appointment reminders 24 hours in advance
 */
/**
 * Helper to process SMS templates with dynamic variables
 */
function processTemplate(template: string, data: { [key: string]: any }) {
    let result = template;
    const placeholders: { [key: string]: string } = {
        // Yangi (Xabarlar moduli) o'zgaruvchilar
        '{bemor_ismi}': data.firstName || data.patientName || '',
        '{bemor_familyasi}': data.lastName || '',
        '{sana}': data.date || '',
        '{vaqt}': data.time || '',
        '{klinika_nomi}': data.clinicName || '',
        '{shifokor_ismi}': data.doctorName || '',
        '{qarz}': data.amount !== undefined ? Number(data.amount).toLocaleString() : '',
        // Eski tokenlar (moslik uchun)
        '{BEMOR}': data.patientName || '',
        '{VAQT}': data.time || '',
        '{SANA}': data.date || '',
        '{MIQDOR}': data.amount !== undefined ? Number(data.amount).toLocaleString() : '',
        '{KLINIKA}': data.clinicName || '',
        '{DOKTOR}': data.doctorName || ''
    };

    Object.keys(placeholders).forEach(key => {
        result = result.split(key).join(placeholders[key]);
    });
    return result;
}

async function sendAppointmentReminders(clinicId?: string, customMessage?: string) {
    try {
        console.log(`🔔 Running appointment reminder job${clinicId ? ` for clinic ${clinicId}` : ''}...`);

        // Get tomorrow's date in YYYY-MM-DD format (database standard)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowFormatted = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

        console.log(`Checking appointments for date: ${tomorrowFormatted}`);

        // Find all appointments for tomorrow with confirmed/pending status
        const whereClause: any = {
            date: tomorrowFormatted,
            status: { in: ['Confirmed', 'Pending'] }
        };

        if (clinicId) {
            whereClause.patient = { clinicId: clinicId };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                patient: {
                    include: {
                        clinic: true
                    }
                },
                doctor: true
            }
        });

        console.log(`Found ${appointments.length} appointments for tomorrow.`);

        let sentCount = 0;
        let withTelegramCount = 0;

        for (const appointment of appointments) {
            const clinic = appointment.patient.clinic as any;
            const doctorName = `${appointment.doctor.firstName} ${appointment.doctor.lastName}`;
            
            let message = '';
            if (customMessage) {
                message = processTemplate(customMessage, {
                    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
                    time: appointment.time,
                    date: appointment.date,
                    clinicName: clinic.name,
                    doctorName: doctorName
                });
            } else {
                message = `🔔 Eslatma!\n\nHurmatli ${appointment.patient.firstName}, sizning ertaga ${appointment.date} kuni soat ${appointment.time} da ${doctorName} qabuliga yozilganingizni eslatamiz.\n\nIltimos, kechikmasdan keling!`;
            }

            try {
                await sendUnified(clinic, appointment.patient, message, { channel: 'auto', source: 'bulk', refId: appointment.id, type: 'Reminder' });

                // Mark as reminded
                await prisma.appointment.update({
                    where: { id: appointment.id },
                    data: { reminderSent: true }
                });

                sentCount++;
                if (clinic.botToken && appointment.patient.telegramChatId) withTelegramCount++;
            } catch (e) {
                console.error(`Failed to notify ${appointment.patient.firstName}:`, e);
            }
        }

        console.log(`🔔 Appointment reminder job completed. Sent ${sentCount} reminders.`);
        return {
            date: tomorrowFormatted,
            found: appointments.length,
            withTelegram: withTelegramCount,
            sent: sentCount
        };
    } catch (error) {
        console.error('❌ Appointment reminder job error:', error);
        return { date: '', found: 0, withTelegram: 0, sent: 0, error: error };
    }
}

console.log('✅ Automated reminder cron jobs initialized');

// Tug'ilgan kun qoidalari - har kuni 09:00
cron.schedule('0 9 * * *', () => {
    console.log('⏰ Cron: Birthday rules job triggered');
    processBirthdayRules();
}, {
    timezone: "Asia/Tashkent"
});

// Kelmagan bemorlar qoidalari - har kuni 20:00
cron.schedule('0 20 * * *', () => {
    console.log('⏰ Cron: No-show rules job triggered');
    processNoShowRules();
}, {
    timezone: "Asia/Tashkent"
});

// Daily Clinic Reports - Every day at 10:00 PM (22:00)
cron.schedule('0 22 * * *', () => {
    console.log('⏰ Cron: Daily clinic report job triggered');
    sendDailyClinicReports();
}, {
    timezone: "Asia/Tashkent"
});

// Doctor Morning Schedules - Every day at 8:00 AM
cron.schedule('0 8 * * *', () => {
    console.log('⏰ Cron: Doctor morning schedule job triggered');
    botManager.sendDoctorMorningSchedules();
}, {
    timezone: "Asia/Tashkent"
});

// "Qabuldan oldin" qoidalari - har 10 daqiqada
cron.schedule('*/10 * * * *', () => {
    processBeforeAppointmentRules();
}, {
    timezone: "Asia/Tashkent"
});

/**
 * Helper function: Send daily summary reports to clinic owners
 */
async function sendDailyClinicReports() {
    try {
        console.log('📊 Running daily clinic report job...');

        const today = new Date();
        const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Start of today for patient creation check
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Get all clinics with Telegram connected
        const clinics = await prisma.clinic.findMany({
            where: {
                telegramChatId: { not: null },
                status: 'Active'
            }
        });

        console.log(`Processing reports for ${clinics.length} clinics...`);

        for (const clinic of clinics) {
            const message = await botManager.generateDailyReport(clinic.id);

            try {
                // Use botManager to notify clinical user (owner)
                await botManager.notifyClinicUser(clinic.id, clinic.telegramChatId!, message);
                console.log(`✅ Daily report sent to ${clinic.name} (${clinic.adminName})`);
            } catch (err) {
                console.error(`Failed to send daily report to clinic ${clinic.id}:`, err);
            }
        }

        console.log('📊 Daily clinic report job completed.');
    } catch (error) {
        console.error('❌ Daily clinic report job error:', error);
    }
}

// ============================================
// BATCH NOTIFICATION ENDPOINTS
// ============================================

// Batch: Send reminders for tomorrow's appointments
app.post('/api/batch/remind-appointments', authenticateToken, async (req, res) => {
    try {
        const { clinicId, message } = req.body;
        console.log(`🔔 Manual trigger: Sending appointment reminders for clinic ${clinicId || 'ALL'}...`);

        const result = await sendAppointmentReminders(clinicId, message);

        res.json({
            success: true,
            count: result.sent,
            message: `${result.date} sanasi uchun ${result.found} ta qabul topildi. ${result.sent} ta xabar yuborildi.`
        });
    } catch (error: any) {
        console.error('Batch appointment reminder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Batch: Send debt reminders
// Batch: Send debt reminders
// Batch: Send debt reminders
app.post('/api/batch/remind-debts', authenticateToken, async (req, res) => {
    try {
        const { clinicId, debtors } = req.body; // Accept debtors list from frontend

        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        console.log(`💰 Manual trigger: Sending debt reminders for clinic ${clinicId}...`);

        let debtorList = debtors;

        // Fallback: If no debtors provided, try to find them in DB (legacy behavior)
        if (!debtorList || debtorList.length === 0) {
            console.log('⚠️ No debtors provided from frontend, falling back to DB query...');
            // DEBUG: Check all transactions first
            const allTransactions = await prisma.transaction.findMany({
                where: { clinicId: clinicId as string },
                select: { patientName: true, status: true, amount: true }
            });
            console.log(`📊 DEBUG: Total transactions for clinic: ${allTransactions.length}`);

            // 1. Find all pending (unpaid) transactions for this clinic
            const overdueTransactions = await prisma.transaction.findMany({
                where: {
                    clinicId: clinicId as string,
                    status: 'Pending'
                },
                select: { patientName: true, amount: true }
            });

            // Group by name
            const debtorMap = new Map();
            overdueTransactions.forEach((t: any) => {
                const existing = debtorMap.get(t.patientName);
                if (existing) {
                    existing.amount += t.amount;
                } else {
                    debtorMap.set(t.patientName, { name: t.patientName, amount: t.amount });
                }
            });
            debtorList = Array.from(debtorMap.values());
        }

        if (debtorList.length === 0) {
            console.log(`📊 DEBUG: No debtors found.`);
            return res.json({ success: true, count: 0, message: 'Qarzdorliklar topilmadi' });
        }

        console.log(`Found ${debtorList.length} debtors to process.`);

        // Fetch all patients with Telegram for this clinic (for in-memory matching)
        const patients = await prisma.patient.findMany({
            where: {
                clinicId: clinicId as string
            }
        });

        console.log(`Loaded ${patients.length} patients for matching.`);

        let sentCount = 0;
        let foundPatientsCount = 0;
        const details: string[] = [];

        // Match and send
        for (const debtor of debtorList) {
            const name = debtor.name;
            const amount = debtor.amount;
            const cleanName = name.toLowerCase().trim();

            // Find patient in memory
            const patient = patients.find((p: any) => {
                const pFirst = p.firstName.toLowerCase();
                const pLast = p.lastName.toLowerCase();
                const pFull1 = `${pFirst} ${pLast}`;
                const pFull2 = `${pLast} ${pFirst}`;

                return pFull1.includes(cleanName) || pFull2.includes(cleanName) ||
                    (cleanName.includes(pFirst) && cleanName.includes(pLast));
            });

            if (patient) {
                // Determine if we can send a notification to this patient
                const fullClinic = await prisma.clinic.findUnique({where: {id: clinicId}}) as any;
                if(!fullClinic) continue;
                
                foundPatientsCount++;

                let messageText = '';
                const template = req.body.message;

                if (template) {
                    messageText = processTemplate(template, {
                        patientName: `${patient.lastName} ${patient.firstName}`,
                        amount: amount,
                        clinicName: fullClinic?.name || 'Denta CRM'
                    });
                } else {
                    messageText = `💰 Hurmatli ${patient.firstName}, sizning klinikada ${amount.toLocaleString()} UZS miqdorida to'lanmagan qarzingiz mavjud.\n\nIltimos, to'lovni amalga oshiring.`;
                }

                try {
                    await sendUnified(fullClinic, patient, messageText, { channel: 'auto', source: 'debt', type: 'DebtReminder' });
                    sentCount++;
                    details.push(`Sent: ${patient.firstName} ${patient.lastName}`);
                } catch (e) {
                    console.error(`Failed to send to ${patient.firstName}:`, e);
                    details.push(`Failed: ${patient.firstName} ${patient.lastName}`);
                }
            } else {
                console.log(`⚠️ Could not find patient record for debtor name: "${name}"`);
                details.push(`Not found: ${name}`);
            }
        }

        res.json({
            success: true,
            count: sentCount,
            foundDebtors: debtorList.length,
            foundPatients: foundPatientsCount,
            message: `${debtorList.length} ta qarzdor ro'yxatda. ${foundPatientsCount} ta bemor bazadan aniqlandi. ${sentCount} ta xabar yuborildi.`
        });
    } catch (error: any) {
        console.error('Batch debt reminder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DEBUG ENDPOINT
// ============================================

app.get('/api/debug/transactions', authenticateToken, async (req, res) => {
    try {
        const clinicId = getScopedClinicId(req);

        const allTransactions = await prisma.transaction.findMany({
            where: clinicId ? { clinicId: clinicId as string } : {},
            select: {
                id: true,
                patientName: true,
                status: true,
                amount: true,
                date: true
            }
        });

        const byStatus: Record<string, number> = {};
        allTransactions.forEach((t: any) => {
            byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        });

        const pendingOrOverdue = allTransactions.filter((t: any) =>
            t.status === 'Pending' || t.status === 'Overdue'
        );

        res.json({
            total: allTransactions.length,
            byStatus,
            pendingOrOverdueCount: pendingOrOverdue.length,
            pendingOrOverdue: pendingOrOverdue.map((t: any) => ({
                name: t.patientName,
                amount: t.amount,
                status: t.status,
                date: t.date
            }))
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// TEST ENDPOINTS (for manual testing)
// ============================================

app.post('/api/test/send-birthday-reminders', authenticateToken, async (req, res) => {
    try {
        await processBirthdayRules();
        res.json({ success: true, message: 'Birthday rules processed' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test/send-appointment-reminders', authenticateToken, async (req, res) => {
    try {
        await sendAppointmentReminders();
        res.json({ success: true, message: 'Appointment reminders sent' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test/process-before-appointment-rules', authenticateToken, async (req, res) => {
    try {
        await processBeforeAppointmentRules();
        res.json({ success: true, message: 'Before-appointment rules processed' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test/send-noshow-followups', authenticateToken, async (req, res) => {
    try {
        await processNoShowRules();
        res.json({ success: true, message: 'No-show rules processed' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test/send-daily-reports', authenticateToken, async (req, res) => {
    try {
        await sendDailyClinicReports();
        res.json({ success: true, message: 'Daily reports triggered' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test/send-doctor-schedules', authenticateToken, async (req, res) => {
    try {
        await botManager.sendDoctorMorningSchedules();
        res.json({ success: true, message: 'Doctor morning schedules sent' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// SALES AGENT & SUPER ADMIN ENDPOINTS
// ============================================

// Get own clinics (for sales agent)
app.get('/api/sales/clinics', authenticateToken, async (req, res) => {
    try {
        const user = (req as any).user;
        if (!user || user.role !== 'SALES_AGENT') {
            return res.status(403).json({ error: 'Ruxsat berilmadi' });
        }

        const clinics = await prisma.clinic.findMany({
            where: {
                salesAgentId: user.salesAgentId,
                status: { not: 'Deleted' }
            },
            include: { plan: true }
        });
        res.json(clinics);
    } catch (error: any) {
        res.status(500).json({ error: 'Klinikalarni yuklashda xatolik: ' + error.message });
    }
});

// Create new sales agent (Super Admin only)
app.post('/api/superadmin/sales', authenticateToken, async (req, res) => {
    try {
        const user = (req as any).user;
        if (!user || user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Ruxsat berilmadi (Faqat Super Admin)' });
        }

        const { name, username, password, phone } = req.body;
        if (!name || !username || !password || !phone) {
            return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password.trim(), salt);

        const agent = await prisma.salesAgent.create({
            data: {
                name,
                username: username.trim().toLowerCase(),
                password: hashedPassword,
                phone,
                status: 'Active'
            }
        });

        res.json({
            success: true,
            agent: {
                id: agent.id,
                name: agent.name,
                username: agent.username,
                phone: agent.phone
            }
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Ushbu login band qilingan. Boshqasini tanlang.' });
        }
        res.status(500).json({ error: 'Sotuvchini yaratishda xatolik: ' + error.message });
    }
});

// List all sales agents and their stats (Super Admin only)
app.get('/api/superadmin/sales', authenticateToken, async (req, res) => {
    try {
        const user = (req as any).user;
        if (!user || user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Ruxsat berilmadi' });
        }

        const agents = await prisma.salesAgent.findMany({
            include: {
                clinics: {
                    where: { status: { not: 'Deleted' } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = agents.map((a: any) => ({
            id: a.id,
            name: a.name,
            username: a.username,
            phone: a.phone,
            status: a.status,
            clinicCount: a.clinics.length,
            createdAt: a.createdAt
        }));

        res.json(formatted);
    } catch (error: any) {
        res.status(500).json({ error: 'Sotuvchilarni yuklashda xatolik: ' + error.message });
    }
});

// ============================================
// START SERVER
// ============================================

async function runStartupMigrations() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "prepaymentEnabled" BOOLEAN NOT NULL DEFAULT false`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "prepaymentCardNumber" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "prepaymentAmount" DOUBLE PRECISION`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "startHour" INTEGER`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "endHour" INTEGER`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "LabTechnician" ADD COLUMN IF NOT EXISTS "username" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "LabTechnician" ADD COLUMN IF NOT EXISTS "password" TEXT`);
        await prisma.$executeRawUnsafe(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'LabTechnician_username_key'
                ) THEN
                    ALTER TABLE "LabTechnician" ADD CONSTRAINT "LabTechnician_username_key" UNIQUE ("username");
                END IF;
            END $$
        `);
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "DemoRequest" (
                "id"           TEXT NOT NULL PRIMARY KEY,
                "name"         TEXT NOT NULL,
                "clinicName"   TEXT,
                "phone"        TEXT NOT NULL,
                "city"         TEXT,
                "doctorsCount" INTEGER,
                "source"       TEXT,
                "status"       TEXT NOT NULL DEFAULT 'New',
                "notes"        TEXT,
                "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Startup migrations applied successfully');
    } catch (err: any) {
        console.error('⚠️ Startup migration warning:', err.message);
    }
}

console.log('🚀 Server is initializing...');
runStartupMigrations().then(() => {
    app.listen(PORT, () => {
        console.log(`✅ Server successfully started on port ${PORT}`);
    });
});
