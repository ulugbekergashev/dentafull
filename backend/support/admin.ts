// Super admin panelidagi Support bo'limi uchun ma'lumot: ko'rsatkichlar,
// murojaatlar ro'yxati va suhbat. Faqat o'qiydi.

import type { Kb } from './kb';
import { CATEGORIES, categoryLabel, SettingsStore } from './settings';
import { cut, ticketCode } from './text';
import type { Tickets } from './tickets';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TICKETS_PAGE = 30;

export interface AdminDeps {
    db: any;
    tickets: Tickets;
    kb: Kb;
    settings: SettingsStore;
}

export const createAdmin = ({ db, tickets, kb, settings }: AdminDeps) => {
    const clinicNames = async (ids: (string | null | undefined)[]): Promise<Map<string, string>> => {
        const unique = [...new Set(ids.filter(Boolean))] as string[];
        if (!unique.length) return new Map();
        const rows: any[] = await db.clinic.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
        return new Map(rows.map(r => [r.id, r.name]));
    };

    const usersByChat = async (chatIds: string[]): Promise<Map<string, any>> => {
        const unique = [...new Set(chatIds)];
        if (!unique.length) return new Map();
        const rows: any[] = await db.supportUser.findMany({ where: { chatId: { in: unique } } });
        return new Map(rows.map(r => [r.chatId, r]));
    };

    return {
        async overview(days: number) {
            const since = new Date(Date.now() - Math.min(365, Math.max(1, days)) * DAY_MS);
            const all: any[] = await db.supportTicket.findMany({ where: { createdAt: { gte: since } } });
            const finished = all.filter(t => t.status === 'resolved' || t.status === 'closed');
            const botResolved = finished.filter(t => t.resolvedBy === 'bot').length;
            const humanResolved = finished.filter(t => t.resolvedBy === 'operator').length;
            const replied = all.filter(t => t.firstReplyAt);
            const avgFirstReplySec = replied.length
                ? Math.round(replied.reduce((s, t) => s + (new Date(t.firstReplyAt).getTime() - new Date(t.createdAt).getTime()), 0) / replied.length / 1000)
                : null;

            const s = await settings.get();
            const byCategory = [];
            for (const c of CATEGORIES) {
                const total = all.filter(t => t.category === c.id).length;
                const st = await tickets.categoryStats(c.id);
                if (!total && !st.drafts) continue;
                byCategory.push({
                    category: c.id, label: c.label, total,
                    drafts: st.drafts, unedited: st.unedited, acceptRate: st.rate,
                    mode: await tickets.modeFor(c.id, s),
                    setting: s.categoryModes[c.id] || 'rule',
                });
            }

            const articles = await kb.list();
            const topArticles = articles.filter(a => a.uses > 0).sort((a, b) => b.uses - a.uses).slice(0, 10)
                .map(a => ({ id: a.id, title: a.titleUz, uses: a.uses }));

            // Bot hal qila olmay operatorga uzatgan savollar — bilim bazasini shular bilan to'ldirish kerak
            const escalations: any[] = await db.supportMessage.findMany({
                where: { direction: 'out', author: 'system', kind: 'card', createdAt: { gte: since } },
                orderBy: { createdAt: 'desc' },
                take: 200,
                select: { ticketId: true },
            });
            const escalatedIds = [...new Set(escalations.map(e => e.ticketId).filter(Boolean))].slice(0, 15) as string[];
            const unanswered = all.filter(t => escalatedIds.includes(t.id))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map(t => ({ text: t.subject || '', createdAt: t.createdAt, ticketId: t.id }));

            return {
                mode: s.mode,
                operatorLinked: !!(await settings.operatorChat()),
                stats: {
                    tickets: all.length,
                    botResolved, humanResolved,
                    open: all.filter(t => t.status === 'open').length,
                    waiting: all.filter(t => t.status === 'waiting_operator' || t.status === 'human').length,
                    autoRate: botResolved + humanResolved ? botResolved / (botResolved + humanResolved) : 0,
                    positive: all.filter(t => t.rating === 1).length,
                    negative: all.filter(t => t.rating === -1).length,
                    avgFirstReplySec,
                },
                byCategory, topArticles, unanswered,
            };
        },

        async ticketList(q: { status?: string; query?: string; page?: number }) {
            const page = Math.max(1, Math.round(Number(q.page) || 1));
            const needle = String(q.query || '').trim().toLowerCase();
            const where = q.status ? { status: q.status } : undefined;
            let rows: any[] = await db.supportTicket.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 1000 });
            const users = await usersByChat(rows.map(r => r.chatId));
            const clinics = await clinicNames(rows.map(r => r.clinicId));
            if (needle) {
                rows = rows.filter(r => {
                    const u = users.get(r.chatId);
                    return [r.subject, ticketCode(r.id), u?.staffName, u?.tgName, u?.tgUsername, clinics.get(r.clinicId)]
                        .some(v => String(v || '').toLowerCase().includes(needle));
                });
            }
            const slice = rows.slice((page - 1) * TICKETS_PAGE, page * TICKETS_PAGE);
            const items = [];
            for (const r of slice) {
                const u = users.get(r.chatId);
                const last = await db.supportMessage.findFirst({
                    where: { ticketId: r.id, kind: { in: ['text', 'voice', 'photo', 'document'] } },
                    orderBy: { createdAt: 'desc' }, select: { text: true },
                });
                items.push({
                    id: r.id, code: ticketCode(r.id), clinicId: r.clinicId, clinicName: clinics.get(r.clinicId) || null,
                    userName: u?.staffName || u?.tgName || null, role: u?.role || null,
                    category: r.category, categoryLabel: categoryLabel(r.category), status: r.status,
                    subject: r.subject, rating: r.rating, resolvedBy: r.resolvedBy,
                    createdAt: r.createdAt, updatedAt: r.updatedAt, lastText: cut(last?.text || '', 200),
                });
            }
            return { total: rows.length, pageSize: TICKETS_PAGE, items };
        },

        async ticketDetail(id: string) {
            const ticket = await db.supportTicket.findUnique({ where: { id } });
            if (!ticket) return null;
            const u = await db.supportUser.findUnique({ where: { chatId: ticket.chatId } });
            const clinics = await clinicNames([ticket.clinicId, u?.clinicId]);
            const messages: any[] = await db.supportMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } });
            return {
                ticket: { ...ticket, code: ticketCode(ticket.id), categoryLabel: categoryLabel(ticket.category), clinicName: clinics.get(ticket.clinicId) || null },
                user: u ? {
                    chatId: u.chatId, tgName: u.tgName, tgUsername: u.tgUsername, phone: u.phone,
                    clinicName: clinics.get(u.clinicId) || null, role: u.role, staffName: u.staffName, verifiedVia: u.verifiedVia,
                } : null,
                // Operator chatiga yuborilgan kartalar suhbatning bir qismi emas — matni ham yo'q
                messages: messages.filter(m => m.kind !== 'card').map(m => ({
                    id: m.id, direction: m.direction, author: m.author, kind: m.kind, text: m.text, state: m.state, createdAt: m.createdAt,
                })),
            };
        },

        async diagList(q: { clinicId?: string; kind?: string; days?: number }) {
            const since = new Date(Date.now() - Math.min(30, Math.max(1, Number(q.days) || 7)) * DAY_MS);
            const rows: any[] = await db.diagEvent.findMany({
                where: {
                    lastAt: { gte: since },
                    ...(q.clinicId ? { clinicId: q.clinicId } : {}),
                    ...(q.kind ? { kind: q.kind } : { kind: { not: 'proactive' } }),
                },
                orderBy: { lastAt: 'desc' },
                take: 300,
            });
            const clinics = await clinicNames(rows.map(r => r.clinicId));
            return rows.map(r => ({
                id: r.id, clinicId: r.clinicId, clinicName: clinics.get(r.clinicId) || null,
                kind: r.kind, subject: r.subject, message: r.message, count: r.count, createdAt: r.createdAt, lastAt: r.lastAt,
            }));
        },

        async payments(clinicId?: string) {
            const rows: any[] = await db.subscriptionPayment.findMany({
                where: clinicId ? { clinicId } : undefined, orderBy: { createdAt: 'desc' }, take: 200,
            });
            const clinics = await clinicNames(rows.map(r => r.clinicId));
            return rows.map(r => ({
                id: r.id, clinicId: r.clinicId, clinicName: clinics.get(r.clinicId) || null, kind: r.kind,
                months: r.months, days: r.days, amount: r.amount, fromExpiry: r.fromExpiry, toExpiry: r.toExpiry,
                approvedBy: r.approvedBy, note: r.note, createdAt: r.createdAt,
            }));
        },
    };
};

export type Admin = ReturnType<typeof createAdmin>;
