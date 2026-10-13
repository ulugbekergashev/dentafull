// ─── Operator tomoni ─────────────────────────────────────────────────────────
// Operator alohida panel ochmaydi — hammasi Telegram'dagi operator chatida
// (guruh yoki shaxsiy). Bot u yerga "karta" yuboradi:
//
//   qoralama  — savol + botning tayyor javobi → [Yuborish] / [O'zim yozaman]
//   uzatilgan — bot hal qila olmagan savol → kartaga reply qilib javob beriladi
//   to'lov    — chek rasmi → [+1 oy] [+3 oy] [+1 yil] [Rad]
//   parol     — telefon orqali ulangan rahbar parol so'radi → [Berish] / [Rad]
//
// Kartaga yozilgan reply mijozga boradi. Qaysi karta qaysi murojaatga
// tegishli ekani SupportMessage.opMessageId orqali topiladi — server qayta
// ishga tushsa ham bog'lanish saqlanadi.

import type { Actions } from './actions';
import type { AiDeps, BrainResult } from './brain';
import type { Billing } from './billing';
import type { Flow, InlineButton, Messenger, OperatorPort } from './flow';
import type { Identity, SupportUserRow } from './identity';
import { isSuperAdmin } from './identity';
import type { Kb } from './kb';
import type { SettingsStore } from './settings';
import { categoryLabel } from './settings';
import { T, roleLabel } from './texts';
import { cut, ddmmyyyy, esc, ticketCode } from './text';
import type { Tickets } from './tickets';

export interface OperatorDeps {
    db: any;
    identity: Identity;
    tickets: Tickets;
    kb: Kb;
    actions: Actions;
    billing: Billing;
    settings: SettingsStore;
    messenger: Messenger;
    flow: () => Flow;
    ai?: AiDeps & { chat?: (messages: any[], opts?: any) => Promise<string> };
}

const TOOL_LABEL: Record<string, string> = {
    open_article: 'bilim bazasi',
    check_subscription: 'obuna',
    check_messaging: 'SMS va bot holati',
    check_automation: 'avtomatik xabarlar',
    explain_permission: 'ruxsatlar',
    check_login: 'kirish urinishlari',
    recent_changes: 'jurnal',
    setup_progress: 'sozlash holati',
    system_status: 'xatolar qaydi',
    request_password_reset: "parol so'rovi",
    start_payment: "to'lov",
};

const FLAG_LABEL: Record<string, string> = {
    unknown_path: "javobda ilovada yo'q bo'lim nomi bor",
    ungrounded: "javob bilim bazasi yoki tekshiruvga tayanmagan",
};

const MONTH_BUTTONS: [number, string][] = [[1, '+1 oy'], [3, '+3 oy'], [12, '+1 yil']];
const done = (label: string): InlineButton[][] => [[{ text: label, data: 'noop' }]];

export const createOperator = (deps: OperatorDeps) => {
    const { db, identity, tickets, kb, actions, billing, settings, messenger } = deps;

    const header = async (ticket: any, user: SupportUserRow, mark: string): Promise<string> => {
        const clinic = user.clinicId
            ? (await db.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true } }).catch(() => null))?.name
            : null;
        const who = [
            esc(user.staffName || user.tgName || 'Noma\'lum'),
            user.role ? `(${roleLabel(user.role)}${user.verifiedVia === 'phone' ? ', telefon orqali' : ''})` : '(ulanmagan)',
            user.tgUsername ? '@' + esc(user.tgUsername) : '',
            user.phone ? esc(user.phone) : '',
        ].filter(Boolean).join(' ');
        return `${mark} <b>${ticketCode(ticket.id)}</b>${clinic ? ' · <b>' + esc(clinic) + '</b>' : ''}\n👤 ${who}`;
    };

    /** Kartani operator chatiga yuboradi va javoblar shu murojaatga bog'lanishi uchun yozib qo'yadi */
    const post = async (ticketId: string | null, chatIdOfUser: string, html: string, buttons: InlineButton[][] | undefined, attachTo?: string): Promise<number | null> => {
        const chat = await settings.operatorChat();
        if (!chat) return null;
        const sent = await messenger.send(chat, html, { html: true, buttons });
        if (!sent) return null;
        if (attachTo) await tickets.setMessage(attachTo, { opMessageId: sent });
        else {
            await tickets.addMessage({
                ticketId, chatId: chatIdOfUser, direction: 'out', author: 'system', kind: 'card', opMessageId: sent,
            });
        }
        return sent;
    };

    const forwardFiles = async (ticket: any, user: SupportUserRow, files: { kind: 'photo' | 'document'; fileId: string }[]) => {
        const chat = await settings.operatorChat();
        if (!chat) return;
        for (const f of files.slice(0, 5)) {
            const sent = await messenger.sendFile(chat, f.kind, f.fileId, `${ticketCode(ticket.id)} — mijoz yuborgan fayl`);
            if (sent) {
                await tickets.addMessage({ ticketId: ticket.id, chatId: user.chatId, direction: 'out', author: 'system', kind: 'card', opMessageId: sent });
            }
        }
    };

    const port: OperatorPort = {
        async draftCard(ticket, user, question, draft, result: BrainResult) {
            const checked = [...new Set(result.toolCalls.map(c => TOOL_LABEL[c.name] || c.name))];
            const warnings = result.flags.map(f => FLAG_LABEL[f]).filter(Boolean);
            const html = [
                await header(ticket, user, '📝'),
                `📂 ${esc(categoryLabel(result.category))}`,
                `\n<b>Savol:</b>\n${esc(cut(question, 900))}`,
                checked.length ? `\n<b>Bot ko'rib chiqdi:</b> ${esc(checked.join(', '))}` : '',
                `\n<b>Tayyor javob:</b>\n${esc(cut([result.reply, ...result.attachments].join('\n\n'), 2200))}`,
                warnings.length ? `\n⚠️ ${esc(warnings.join('; '))}` : '',
                `\n<i>Boshqacha javob bermoqchi bo'lsangiz — shu xabarga reply qiling.</i>`,
            ].filter(Boolean).join('\n');
            const sent = await post(ticket.id, user.chatId, html, [
                [{ text: '✅ Yuborish', data: `sd:${draft.id}` }, { text: "✍️ O'zim yozaman", data: `rj:${draft.id}` }],
            ], draft.id);
            return !!sent;
        },

        async escalationCard(ticket, user, question, why, summary, files) {
            const html = [
                await header(ticket, user, '🔴'),
                `<b>Operator kerak:</b> ${esc(cut(why, 300))}`,
                `\n<b>Savol:</b>\n${esc(cut(question, 900))}`,
                summary && summary !== question ? `\n<b>Xulosa:</b>\n${esc(cut(summary, 1500))}` : '',
                `\n<i>Javob berish uchun shu xabarga reply qiling.</i>`,
            ].filter(Boolean).join('\n');
            const sent = await post(ticket.id, user.chatId, html, [[{ text: '✅ Yopish', data: `cl:${ticket.id}` }]]);
            if (sent) await forwardFiles(ticket, user, files);
            return !!sent;
        },

        async relay(ticket, user, text, files) {
            const html = `${await header(ticket, user, '➕')}\n\n${esc(cut(text || '[fayl]', 2500))}`;
            const sent = await post(ticket.id, user.chatId, html, [[{ text: '✅ Yopish', data: `cl:${ticket.id}` }]]);
            if (sent) await forwardFiles(ticket, user, files);
            return !!sent;
        },

        async ownerResetCard(action, user, clinicName) {
            const html = [
                `🔑 <b>Rahbar paroli</b> · <b>${esc(clinicName)}</b>`,
                `👤 ${esc(user.tgName || '')} ${user.tgUsername ? '@' + esc(user.tgUsername) : ''} · ${esc(user.phone || '')}`,
                `\nTelegram raqami CRM dagi rahbar raqami bilan mos keldi. Yangi parol so'rayapti.`,
                `<i>Shubha bo'lsa — avval qo'ng'iroq qilib tekshiring.</i>`,
            ].join('\n');
            const sent = await post(action.ticketId || null, user.chatId, html, [
                [{ text: '✅ Yangi parol berish', data: `pw:${action.id}` }, { text: '❌ Rad etish', data: `px:${action.id}` }],
            ]);
            return !!sent;
        },

        async receiptCard(action, user, kind, fileId) {
            const chat = await settings.operatorChat();
            if (!chat || !user.clinicId) return false;
            const c = await db.clinic.findUnique({
                where: { id: user.clinicId },
                select: { name: true, expiryDate: true, planId: true, customPrice: true, status: true },
            });
            const plan = c ? await db.subscriptionPlan.findUnique({ where: { id: c.planId } }).catch(() => null) : null;
            const price = c?.customPrice ?? plan?.price;
            const caption = cut([
                `💳 To'lov cheki · ${c?.name || ''}`,
                `Tarif: ${plan?.name || c?.planId || '?'}${price ? ` · ${Math.round(price).toLocaleString('ru-RU')} so'm/oy` : ''}`,
                `Muddat: ${ddmmyyyy(c?.expiryDate)}${c?.status && c.status !== 'Active' ? ` · ⚠️ KLINIKA HOLATI: ${c.status} (tasdiqlash bloklashni bekor qilmaydi)` : ''}`,
                `Yubordi: ${user.staffName || user.tgName || ''} (${roleLabel(user.role)}${user.verifiedVia === 'phone' ? ', telefon orqali' : ''})`,
            ].join('\n'), 1000);
            const sent = await messenger.sendFile(chat, kind, fileId, caption, {
                buttons: [
                    MONTH_BUTTONS.map(([m, label]) => ({ text: label, data: `py:${action.id}:${m}` })),
                    [{ text: '❌ Rad etish', data: `pn:${action.id}` }],
                ],
            });
            if (sent) {
                await tickets.addMessage({ ticketId: action.ticketId || null, chatId: user.chatId, direction: 'out', author: 'system', kind: 'card', opMessageId: sent });
            }
            return !!sent;
        },
    };

    const isOperatorChat = async (chatId: string) => (await settings.operatorChat()) === chatId;

    const api = {
        ...port,

        /** /operator — shu chatni murojaatlar tushadigan joy qiladi. Faqat DentaCRM jamoasi (super admin sifatida ulangan). */
        async claimChat(chatId: string, fromChatId: string): Promise<boolean> {
            const who = await identity.getUser(fromChatId);
            if (!isSuperAdmin(who)) return false;
            await settings.setOperatorChat(chatId);
            return true;
        },

        /** Operator kartaga reply qildi — javob mijozga boradi. @returns operatorga ko'rsatiladigan bildirish */
        async onReply(chatId: string, replyToMessageId: number, text: string, operatorName: string): Promise<string | null> {
            if (!(await isOperatorChat(chatId))) return null;
            const card = await tickets.byOperatorMessage(replyToMessageId);
            if (!card) return null;
            const user = await identity.getUser(card.chatId);
            if (!user) return "Foydalanuvchi topilmadi.";

            const sent = await messenger.send(user.chatId, text, { lang: user.lang, keyboard: user.role ? 'menu' : 'contact' });
            if (!sent) return "❗️ Yetkazib bo'lmadi: foydalanuvchi botni to'xtatgan.";

            const ticket = card.ticketId ? await tickets.get(card.ticketId) : null;
            if (ticket) {
                // Operator o'zi yozdi — demak botning qoralamasi yaramadi
                await db.supportMessage.updateMany({
                    where: { ticketId: ticket.id, kind: 'draft', state: 'pending' },
                    data: { state: 'edited' },
                });
                await tickets.update(ticket.id, {
                    status: 'human', resolvedBy: 'operator',
                    ...(ticket.firstReplyAt ? {} : { firstReplyAt: new Date() }),
                });
            }
            await tickets.addMessage({
                ticketId: card.ticketId || null, chatId: user.chatId, direction: 'out', author: 'operator',
                text, tgMessageId: sent, meta: { operator: operatorName },
            });
            return '✓ Yetkazildi';
        },

        /** Operator chatidagi tugma bosildi. @returns tugma ostidagi qisqa bildirish */
        async onCallback(chatId: string, data: string, messageId: number, operatorName: string): Promise<string> {
            if (!(await isOperatorChat(chatId))) return '';
            const [kind, id, extra] = data.split(':');
            const mark = (label: string) => messenger.editButtons(chatId, messageId, done(label)).catch(() => { });

            if (kind === 'sd') {
                // Murojaat yopilgan bo'lsa eskirgan javob yuborilmaydi (va murojaat qayta ochilmaydi)
                const pre = await db.supportMessage.findUnique({ where: { id } });
                const preTicket = pre?.ticketId ? await tickets.get(pre.ticketId) : null;
                if (preTicket && !['open', 'waiting_operator', 'human'].includes(preTicket.status)) {
                    await db.supportMessage.updateMany({ where: { id, state: 'pending' }, data: { state: 'superseded' } });
                    await mark('Murojaat yopilgan');
                    return 'Murojaat allaqachon yopilgan';
                }
                const claimed = await db.supportMessage.updateMany({
                    where: { id, kind: 'draft', state: 'pending' }, data: { state: 'sent' },
                });
                if (claimed.count !== 1) { await mark('Allaqachon hal qilingan'); return 'Allaqachon hal qilingan'; }
                const draft = await db.supportMessage.findUnique({ where: { id } });
                const user = await identity.getUser(draft.chatId);
                const ticket = draft.ticketId ? await tickets.get(draft.ticketId) : null;
                if (!user || !ticket) return 'Murojaat topilmadi';
                await tickets.update(ticket.id, { resolvedBy: 'operator' });
                const delivered = await deps.flow().deliver(user, ticket, deps.flow().payloadFromDraft(draft), 'bot');
                if (!delivered) {
                    // Yetib bormadi (foydalanuvchi botni to'xtatgan): qoralama "yuborilgan" hisoblanmasin
                    await db.supportMessage.updateMany({ where: { id }, data: { state: 'pending' } });
                    return "Yetkazib bo'lmadi: mijoz botni to'xtatgan";
                }
                await mark(`✅ Yuborildi · ${cut(operatorName, 20)}`);
                return 'Yuborildi';
            }

            if (kind === 'rj') {
                const claimed = await db.supportMessage.updateMany({
                    where: { id, kind: 'draft', state: 'pending' }, data: { state: 'rejected' },
                });
                if (claimed.count !== 1) return 'Allaqachon hal qilingan';
                const draft = await db.supportMessage.findUnique({ where: { id } });
                if (draft?.ticketId) await tickets.update(draft.ticketId, { status: 'human', resolvedBy: 'operator' });
                await messenger.editButtons(chatId, messageId, draft?.ticketId ? [[{ text: '✅ Yopish', data: `cl:${draft.ticketId}` }]] : null).catch(() => { });
                return 'Javobni shu xabarga reply qilib yozing';
            }

            if (kind === 'cl') {
                await tickets.close(id, 'operator');
                await messenger.editButtons(chatId, messageId, [[{ text: '📚 Javobni bilim bazasiga qo\'shish', data: `kb:${id}` }]]).catch(() => { });
                return 'Yopildi';
            }

            if (kind === 'kb') {
                const article = await api.learn(id).catch((e: any) => { console.error('[support] learn:', e?.message); return null; });
                await mark(article ? '📚 Qoralama maqola saqlandi' : 'Qo\'shib bo\'lmadi');
                if (article) {
                    await messenger.send(chatId, `📚 Yangi maqola (hali o'chiq): <b>${esc(article.titleUz)}</b>\n\n${esc(cut(article.bodyUz, 900))}\n\n<i>Mijoz ma'lumoti qolmaganini tekshirib, yoqing: panel → Yordam xizmati → Bilim bazasi (${esc(article.id)})</i>`, { html: true });
                }
                return article ? "Qo'shildi" : 'Operator javobi topilmadi';
            }

            if (kind === 'py' || kind === 'pn') {
                const action = await actions.get(id);
                if (!action || action.kind !== 'subscription_extend') return 'Topilmadi';
                const requester = await identity.getUser(action.chatId);
                if (kind === 'pn') {
                    if (!(await actions.reject(id, operatorName))) return 'Allaqachon hal qilingan';
                    await mark(`❌ Rad etildi · ${cut(operatorName, 20)}`);
                    if (requester) await messenger.send(requester.chatId, T(requester.lang).payRejected, { lang: requester.lang });
                    return 'Rad etildi';
                }
                // Kartada ko'rsatilgan klinika (so'ragan odamning klinikasi) va uzaytiriladigan klinika bir xil bo'lsin
                if (!requester || requester.clinicId !== action.clinicId) {
                    return "So'ragan odam boshqa klinikaga ulangan — chekni rad eting va qayta yuborishni so'rang";
                }
                const claimed = await actions.claim(id, operatorName);
                if (!claimed) return 'Allaqachon hal qilingan';
                try {
                    const r = await billing.extend(claimed.clinicId, Number(extra), { receiptFileId: claimed.args.fileId, approvedBy: operatorName });
                    await actions.finish(id, true, r.toExpiry);
                    await mark(`✅ ${ddmmyyyy(r.toExpiry)} gacha · ${cut(operatorName, 20)}`);
                    if (requester) await messenger.send(requester.chatId, T(requester.lang).payApproved(ddmmyyyy(r.toExpiry)), { lang: requester.lang });
                    return `Uzaytirildi: ${ddmmyyyy(r.toExpiry)}`;
                } catch (e: any) {
                    // Tasdiqlash qayta bosilishi mumkin: so'rov "failed" bo'lib o'lib qolmasin
                    await actions.release(id, e?.message);
                    return cut(`Xato: ${e?.message} — qayta bosing`, 180);
                }
            }

            if (kind === 'pw' || kind === 'px') {
                const action = await actions.get(id);
                if (!action || action.kind !== 'owner_password_reset' || action.approver !== 'operator') return 'Topilmadi';
                const requester = await identity.getUser(action.chatId);
                if (kind === 'px') {
                    if (!(await actions.reject(id, operatorName))) return 'Allaqachon hal qilingan';
                    await mark(`❌ Rad etildi · ${cut(operatorName, 20)}`);
                    if (requester) await messenger.send(requester.chatId, T(requester.lang).resetRejected, { lang: requester.lang });
                    return 'Rad etildi';
                }
                // So'ragan odam hali ham shu klinikaning rahbari sifatida ulangan bo'lishi shart
                if (!requester || requester.role !== 'CLINIC_ADMIN' || requester.clinicId !== action.clinicId) return "So'ragan odam endi rahbar sifatida ulanmagan";
                const claimed = await actions.claim(id, operatorName);
                if (!claimed) return 'Allaqachon hal qilingan';
                const ok = await deps.flow().finishReset(claimed, requester, () =>
                    actions.prepareOwnerReset(claimed.clinicId, `${requester.tgName || requester.chatId}, tasdiqladi: ${operatorName}`, requester.chatId));
                await mark(ok ? `✅ Parol berildi · ${cut(operatorName, 20)}` : 'Xato');
                return ok ? 'Yangi parol mijozga yuborildi' : 'Xato yuz berdi';
            }
            return '';
        },

        /**
         * Yopilgan murojaatdan maqola yasaydi: mijoz savoli + operator javobi.
         * Shu savol keyingi safar operatorga kelmasligi uchun.
         */
        async learn(ticketId: string): Promise<any | null> {
            const rows: any[] = await db.supportMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } });
            const question = rows.filter(r => r.author === 'user' && r.text).map(r => r.text).join('\n').trim();
            const answer = rows.filter(r => r.author === 'operator' && r.text).map(r => r.text).join('\n').trim();
            if (!question || !answer) return null;

            let parsed: { titleUz: string; titleRu: string; bodyUz: string; bodyRu: string; keywords: string[] } | null = null;
            if (deps.ai?.chat && deps.ai.isConfigured()) {
                const raw = await deps.ai.chat([
                    {
                        role: 'system',
                        content: "Sen DentaCRM yordam xizmati uchun bilim bazasi maqolasini yozasan. Mijoz savoli va operator javobidan UMUMIY maqola tuz: " +
                            "shaxsiy ma'lumotlarni (ism, telefon, klinika nomi, summa) olib tashla, faqat operator javobidagi faktlarni ishlat, o'zingdan qo'shma. " +
                            "Aynan shu shaklda, har bandni yangi qatordan boshlab yoz:\nUZ SARLAVHA: ...\nRU SARLAVHA: ...\nUZ MATN: ...\nRU MATN: ...\nKALIT: so'z, so'z, ...",
                    },
                    { role: 'user', content: `MIJOZ SAVOLI:\n${cut(question, 1500)}\n\nOPERATOR JAVOBI:\n${cut(answer, 2500)}` },
                ], { label: 'support:learn', task: 'cheap', maxTokens: 900 }).catch(() => '');
                parsed = parseLearned(raw);
            }
            const article = parsed || {
                titleUz: cut(question.split('\n')[0], 120), titleRu: cut(question.split('\n')[0], 120),
                bodyUz: answer, bodyRu: answer, keywords: [],
            };
            const ticket = await tickets.get(ticketId);
            const id = `learned.${ticketCode(ticketId).slice(1).toLowerCase()}`;
            // Mijoz matnidan yasalgani uchun TEKSHIRUVSIZ yoqilmaydi: unda shaxsiy ma'lumot yoki
            // boshqa mijozning ko'rsatmasi bo'lishi mumkin va maqola barcha foydalanuvchilarga ko'rinadi.
            return kb.save(id, { ...article, module: ticket?.category || 'general', roles: '*', active: false }, 'learned');
        },
    };
    return api;
};

/** Model javobini bo'laklarga ajratadi (yuqoridagi "UZ SARLAVHA: ..." shakli) */
export const parseLearned = (raw: string): { titleUz: string; titleRu: string; bodyUz: string; bodyRu: string; keywords: string[] } | null => {
    const grab = (label: string): string => {
        const m = String(raw || '').match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:UZ SARLAVHA|RU SARLAVHA|UZ MATN|RU MATN|KALIT):|$)`, 'i'));
        return m ? m[1].trim() : '';
    };
    const titleUz = grab('UZ SARLAVHA');
    const bodyUz = grab('UZ MATN');
    if (!titleUz || !bodyUz) return null;
    return {
        titleUz, titleRu: grab('RU SARLAVHA') || titleUz, bodyUz, bodyRu: grab('RU MATN') || bodyUz,
        keywords: grab('KALIT').split(',').map(s => s.trim()).filter(Boolean).slice(0, 15),
    };
};

export type Operator = ReturnType<typeof createOperator>;
