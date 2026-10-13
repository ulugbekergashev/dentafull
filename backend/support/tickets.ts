// ─── Murojaatlar va xabarlar ─────────────────────────────────────────────────
// Har bir savol — murojaat (SupportTicket), ichidagi har bir xabar —
// SupportMessage. Kelgan xabar javob berilguncha `pending` holatida turadi:
// server deploy paytida qayta ishga tushsa ham savol yo'qolmaydi, ishga
// tushganda navbatdan davom etadi (bot.ts).

import { categoryLabel, CategoryMode, SupportSettings } from './settings';
import { cut, safeJson } from './text';

export type TicketStatus = 'open' | 'waiting_operator' | 'human' | 'resolved' | 'closed';

/** Shuncha vaqt jim turgan murojaat davom ettirilmaydi — yangi savol yangi murojaat */
export const TICKET_IDLE_MS = 12 * 60 * 60 * 1000;
/** Operator javobini kutayotgan murojaat shuncha vaqt jim tursa — eskirgan hisoblanadi */
export const TICKET_STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** Mavzu avtomatga o'tishi uchun: shuncha qoralama tahrirsiz ketgan bo'lishi kerak */
export const AUTO_MIN_DRAFTS = 30;
export const AUTO_MIN_RATE = 0.95;
/** Hisobga faqat oxirgi qoralamalar olinadi: eski xatolar abadiy ushlab turmasin */
const AUTO_WINDOW = 50;

const ACTIVE: TicketStatus[] = ['open', 'waiting_operator', 'human'];

export interface NewMessage {
    ticketId?: string | null;
    chatId: string;
    direction: 'in' | 'out';
    author: 'user' | 'bot' | 'operator' | 'system';
    kind?: string;
    text?: string | null;
    fileId?: string | null;
    state?: string;
    tgMessageId?: number | null;
    opMessageId?: number | null;
    meta?: any;
}

/**
 * Meta JSON bo'lib qoladi: ilgari uzun matn 4000 belgida kesilib, JSON buzilar va
 * qoralamadagi tugmalar, kategoriya va takliflar jimgina yo'qolardi.
 */
const META_MAX = 4000;
const metaJson = (meta: any): string => {
    const full = JSON.stringify(meta);
    if (full.length <= META_MAX) return full;
    const lean = JSON.stringify({ ...meta, attachments: [], truncated: true });
    return lean.length <= META_MAX ? lean : JSON.stringify({ category: meta?.category, truncated: true });
};

/** Bu vaqtdan eski "processing" xabar — ishlov o'rtada uzilgan hisoblanadi */
export const PROCESSING_STALE_MS = 5 * 60 * 1000;

export const createTickets = (db: any) => {
    const api = {
        /** Davom etayotgan murojaat (bo'lmasa null) */
        async current(chatId: string): Promise<any | null> {
            const t = await db.supportTicket.findFirst({
                where: { chatId, status: { in: ACTIVE } },
                orderBy: { updatedAt: 'desc' },
            });
            if (!t) return null;
            const idle = Date.now() - new Date(t.updatedAt).getTime();
            if (t.status === 'open' && idle > TICKET_IDLE_MS) {
                // Jim qolgani "bot hal qildi" degani emas — statistikaga kirmaydi
                await api.close(t.id, 'idle');
                return null;
            }
            // Operatorda turgan murojaat javobsiz qolib ketgan: yangi savol eski
            // suhbatga yopishmasin. Hal qilinmagan deb yopiladi (bot ham, operator ham emas).
            if (t.status !== 'open' && idle > TICKET_STALE_MS) {
                await db.supportTicket.update({ where: { id: t.id }, data: { status: 'closed', resolvedBy: t.resolvedBy || 'nobody', closedAt: new Date() } });
                return null;
            }
            return t;
        },

        async ensure(chatId: string, clinicId: string | null, firstText: string): Promise<any> {
            return (await api.current(chatId)) || db.supportTicket.create({
                data: { chatId, clinicId, status: 'open', category: 'other', subject: cut(firstText, 160) },
            });
        },

        async get(id: string): Promise<any | null> {
            return db.supportTicket.findUnique({ where: { id } });
        },

        async update(id: string, data: any): Promise<any> {
            return db.supportTicket.update({ where: { id }, data });
        },

        /**
         * Murojaatni yopadi. `resolvedBy` — kim hal qilgani: operator biror marta
         * aralashgan bo'lsa (qoralamani tasdiqlagan yoki o'zi javob bergan) u
         * allaqachon 'operator' deb belgilangan; aks holda — bot o'zi yopgan.
         * "Sizsiz yopilgan murojaatlar ulushi" shu maydondan hisoblanadi.
         */
        async close(id: string, by: 'bot' | 'operator' | 'user' | 'idle', rating?: number): Promise<void> {
            const t = await api.get(id);
            if (!t || !ACTIVE.includes(t.status)) return;
            await db.supportTicket.update({
                where: { id },
                data: {
                    status: rating === 1 ? 'resolved' : 'closed',
                    resolvedBy: t.resolvedBy || (by === 'operator' ? 'operator' : by === 'idle' ? 'idle' : 'bot'),
                    closedAt: new Date(),
                    ...(rating ? { rating } : {}),
                },
            });
        },

        async addMessage(m: NewMessage): Promise<any> {
            const row = await db.supportMessage.create({
                data: {
                    ticketId: m.ticketId || null,
                    chatId: m.chatId,
                    direction: m.direction,
                    author: m.author,
                    kind: m.kind || 'text',
                    text: m.text ? cut(m.text, 8000) : null,
                    fileId: m.fileId || null,
                    state: m.state || 'done',
                    tgMessageId: m.tgMessageId ?? null,
                    opMessageId: m.opMessageId ?? null,
                    meta: m.meta ? metaJson(m.meta) : null,
                },
            });
            if (m.ticketId) {
                // Murojaat "tirik" ekanini bildiradi (TICKET_IDLE_MS shunga qaraydi)
                await db.supportTicket.updateMany({ where: { id: m.ticketId }, data: { updatedAt: new Date() } });
            }
            return row;
        },

        async setMessage(id: string, data: any): Promise<void> {
            await db.supportMessage.updateMany({ where: { id }, data });
        },

        /** Operator chatidagi xabar raqami bo'yicha — operator javobini murojaatga bog'lash uchun */
        async byOperatorMessage(opMessageId: number): Promise<any | null> {
            return db.supportMessage.findFirst({ where: { opMessageId }, orderBy: { createdAt: 'desc' } });
        },

        /** Model uchun suhbat tarixi (faqat matnli almashinuv, eskidan yangiga) */
        async history(ticketId: string, limit = 12): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
            const rows: any[] = await db.supportMessage.findMany({
                where: { ticketId, kind: { in: ['text', 'voice', 'photo', 'document'] }, state: 'done' },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
            return rows.reverse()
                .filter(r => r.text)
                .map(r => ({
                    role: r.author === 'user' ? 'user' as const : 'assistant' as const,
                    content: r.author === 'operator' ? `[Operator javobi] ${r.text}` : r.text,
                }));
        },

        /**
         * Shu chatning javob kutayotgan xabarlarini "ishlanmoqda" ga o'tkazib qaytaradi.
         * Avval UPDATE, keyin o'qish: ikki ishlovchi bir xabarni ikki marta olmaydi.
         */
        async claimInbound(chatId: string): Promise<any[]> {
            // Kutayotganlar + ishlov o'rtada uzilib qolgan (eskirgan) "processing" xabarlar
            const claimed = await db.supportMessage.updateMany({
                where: {
                    chatId, direction: 'in',
                    OR: [
                        { state: 'pending' },
                        { state: 'processing', createdAt: { lt: new Date(Date.now() - PROCESSING_STALE_MS) } },
                    ],
                },
                data: { state: 'processing' },
            });
            if (!claimed.count) return [];
            return db.supportMessage.findMany({
                where: { chatId, direction: 'in', state: 'processing' },
                orderBy: { createdAt: 'asc' },
            });
        },

        async finishInbound(ids: string[], ticketId: string | null, state: 'done' | 'failed' = 'done'): Promise<void> {
            if (!ids.length) return;
            await db.supportMessage.updateMany({ where: { id: { in: ids } }, data: { state, ...(ticketId ? { ticketId } : {}) } });
        },

        /** Xabarni murojaatga biriktiradi, lekin "processing" holatida qoldiradi (javob hali yo'q) */
        async attachInbound(ids: string[], ticketId: string): Promise<void> {
            if (!ids.length) return;
            await db.supportMessage.updateMany({ where: { id: { in: ids } }, data: { ticketId } });
        },

        /** Server qayta ishga tushganda: javobsiz qolgan chatlar */
        async chatsWithPending(): Promise<string[]> {
            // Yiqilish paytida "ishlanmoqda" da qolib ketganlarini navbatga qaytaramiz. Juda yangilari
            // (1 daqiqadan kam) tegilmaydi: deploy oralig'ida eski nusxa ularni hali ishlayotgan bo'lishi mumkin.
            await db.supportMessage.updateMany({
                where: { direction: 'in', state: 'processing', createdAt: { lt: new Date(Date.now() - 60_000) } },
                data: { state: 'pending' },
            });
            const rows: any[] = await db.supportMessage.findMany({
                where: { direction: 'in', state: { in: ['pending', 'processing'] } },
                select: { chatId: true },
            });
            return [...new Set(rows.map(r => r.chatId))];
        },

        /**
         * Shu mavzuda bot o'zi javob bera oladimi.
         * 'rule' — oxirgi qoralamalar natijasiga qarab: kamida AUTO_MIN_DRAFTS tasi
         * hal qilingan va ularning AUTO_MIN_RATE ulushi tahrirsiz yuborilgan bo'lsa.
         * Tahrirlangan yoki rad etilgan qoralama — bot xato qilgan degani.
         */
        async categoryStats(category: string): Promise<{ drafts: number; unedited: number; rate: number | null }> {
            // Kategoriya bo'yicha bazada filtrlanadi: boshqa mavzularning qoralamalari
            // oxirgi 400 tani to'ldirib, kichik mavzuning natijasini siqib chiqarmasin.
            const rows: any[] = await db.supportMessage.findMany({
                where: {
                    kind: 'draft', state: { in: ['sent', 'edited', 'rejected'] },
                    meta: { contains: `"category":"${category}"` },
                },
                orderBy: { createdAt: 'desc' },
                take: AUTO_WINDOW * 2,
            });
            const mine = rows.filter(r => safeJson<any>(r.meta, {}).category === category).slice(0, AUTO_WINDOW);
            const unedited = mine.filter(r => r.state === 'sent').length;
            return { drafts: mine.length, unedited, rate: mine.length ? unedited / mine.length : null };
        },

        async modeFor(category: string, settings: SupportSettings): Promise<'auto' | 'draft'> {
            if (settings.mode !== 'auto') return 'draft';
            const forced: CategoryMode = settings.categoryModes[category] || 'rule';
            if (forced !== 'rule') return forced;
            const s = await api.categoryStats(category);
            return s.drafts >= AUTO_MIN_DRAFTS && (s.rate ?? 0) >= AUTO_MIN_RATE ? 'auto' : 'draft';
        },

        /**
         * Eski suhbatlarni o'chiradi (kunlik cron): xabarlarda mijoz matni va ismlari bor,
         * ularni cheksiz saqlash ma'qul emas. Ochiq murojaatlarga tegilmaydi.
         */
        async prune(days = 180): Promise<void> {
            try {
                const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                const old: any[] = await db.supportTicket.findMany({
                    where: { status: { in: ['resolved', 'closed'] }, updatedAt: { lt: before } },
                    select: { id: true },
                    take: 500,
                });
                const ids = old.map(t => t.id);
                if (ids.length) {
                    await db.supportMessage.deleteMany({ where: { ticketId: { in: ids } } });
                    await db.supportTicket.deleteMany({ where: { id: { in: ids } } });
                }
                // Murojaatsiz qolgan eski xabarlar (tugagan jarayonlar)
                await db.supportMessage.deleteMany({ where: { ticketId: null, createdAt: { lt: before } } });
            } catch (e: any) {
                console.warn("[support] tozalab bo'lmadi:", e?.message);
            }
        },

        categoryLabel,
    };
    return api;
};

export type Tickets = ReturnType<typeof createTickets>;
