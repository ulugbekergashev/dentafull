// ─── Yordam botining Telegram ulanishi ───────────────────────────────────────
// Bu yerda faqat Telegram bilan gaplashish: xabarni qabul qilib flow/operator
// ga uzatish va ularning javobini yuborish. Mantiq yo'q.
//
// Klinika botlaridan (botManager.ts) o'rganilgan saboqlar:
//   • bot.catch — handler ichidagi ushlanmagan xato pollingni to'xtatmasin;
//   • launch yiqilsa (409, tarmoq) qayta ko'tariladi;
//   • handler ichida uzoq ish KUTILMAYDI: Telegraf keyingi xabarlarni
//     hozirgilari tugaguncha olmaydi, ya'ni bitta sekin javob hamma
//     foydalanuvchini kuttirardi. Xabar bazaga yoziladi, javob fonda tayyorlanadi;
//   • DISABLE_BOTS=1 da ishga tushmaydi (dasturchi kompyuteri prod bazaga
//     qarab turganda mijozlarning xabarini tortib olmasin).

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import type { Flow, InlineButton, Messenger, SendOpts } from './flow';
import type { Identity } from './identity';
import { isSuperAdmin } from './identity';
import type { Operator } from './operator';
import type { SettingsStore } from './settings';
import { BOT_PROFILE, BTN, T, menuAction } from './texts';
import { chunkText, detectLang } from './text';

const axios = require('axios');

const RELAUNCH_BASE_MS = 15_000;
const RELAUNCH_MAX_MS = 5 * 60_000;
const VOICE_MAX_SECONDS = 120;
const VOICE_PER_HOUR = 20;
/** Telegram "duration" ni mijoz o'zi aytadi — hajm esa serverdan keladi */
const VOICE_MAX_BYTES = 3 * 1024 * 1024;
const FILE_MAX_BYTES = 20 * 1024 * 1024;

export interface BotDeps {
    token: string;
    identity: Identity;
    settings: SettingsStore;
    flow: () => Flow;
    operator: () => Operator;
    /** Ovozni matnga aylantiradi (ai/speech.ts). Yo'q bo'lsa ovozli xabar qabul qilinmaydi. */
    stt?: (audio: Buffer, mimeType: string, lang: 'uz' | 'ru') => Promise<string>;
    onHealth?: (kind: 'bot_up' | 'bot_down' | 'bot_error', message: string) => void;
}

const tgOf = (from: any) => ({
    name: [from?.first_name, from?.last_name].filter(Boolean).join(' '),
    username: from?.username,
});

const inline = (buttons?: InlineButton[][]) => buttons?.length
    ? { inline_keyboard: buttons.map(row => row.map(b => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data || 'noop' }))) }
    : undefined;

const keyboard = (kind: 'menu' | 'contact', lang: 'uz' | 'ru' = 'uz') => {
    const b = BTN[lang];
    // Ulanmagan odamga ham menyu: operator va yangi savol ulanishsiz ishlaydi
    return kind === 'contact'
        ? { keyboard: [[{ text: b.contact, request_contact: true }], [{ text: b.operator }, { text: b.newQuestion }]], resize_keyboard: true, is_persistent: true }
        : { keyboard: [[{ text: b.pay }, { text: b.reset }], [{ text: b.operator }, { text: b.newQuestion }]], resize_keyboard: true, is_persistent: true };
};

export const createSupportBot = (deps: BotDeps) => {
    const options: any = { handlerTimeout: 30_000 };
    // Testlarda soxta Telegram serveri (tests/helpers/fakeTelegram.cjs)
    if (process.env.TELEGRAM_API_ROOT) options.telegram = { apiRoot: process.env.TELEGRAM_API_ROOT };
    const bot = new Telegraf(deps.token, options);
    let username: string | null = null;
    let stopped = false;

    const fail = (where: string, e: any) => console.error(`[support:bot] ${where}:`, e?.response?.description || e?.message || e);

    const messenger: Messenger = {
        async send(chatId, text, opts: SendOpts = {}) {
            const parts = chunkText(String(text || '').trim() || '…');
            let last: number | null = null;
            try {
                for (let i = 0; i < parts.length; i++) {
                    const isLast = i === parts.length - 1;
                    const markup = isLast ? (inline(opts.buttons) || (opts.keyboard ? keyboard(opts.keyboard, opts.lang) : undefined)) : undefined;
                    const sent = await bot.telegram.sendMessage(chatId, parts[i], {
                        ...(opts.html ? { parse_mode: 'HTML' as const } : {}),
                        ...(markup ? { reply_markup: markup as any } : {}),
                        ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}),
                        link_preview_options: { is_disabled: true },
                    } as any);
                    last = sent.message_id;
                }
                return last;
            } catch (e: any) {
                // 403 — foydalanuvchi botni to'xtatgan: endi unga o'zimiz yoza olmaymiz
                if (e?.response?.error_code === 403) await deps.identity.markBlocked(chatId).catch(() => { });
                fail('send', e);
                return null;
            }
        },
        async sendFile(chatId, kind, fileId, caption, opts: SendOpts = {}) {
            try {
                const extra: any = { caption, ...(inline(opts.buttons) ? { reply_markup: inline(opts.buttons) } : {}) };
                const sent = kind === 'photo'
                    ? await bot.telegram.sendPhoto(chatId, fileId, extra)
                    : await bot.telegram.sendDocument(chatId, fileId, extra);
                return sent.message_id;
            } catch (e: any) {
                fail('sendFile', e);
                return null;
            }
        },
        async editButtons(chatId, messageId, buttons) {
            await bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, (inline(buttons || undefined) || { inline_keyboard: [] }) as any);
        },
        async typing(chatId) {
            await bot.telegram.sendChatAction(chatId, 'typing').catch(() => { });
        },
    };

    const isOperatorChat = async (chatId: string) => (await deps.settings.operatorChat()) === chatId;

    /**
     * Operator guruhidagi har bir tugma va javob uchun: yuboruvchi DentaCRM jamoasi a'zosi bo'lishi shart
     * (ilova orqali super admin sifatida ulangan). Faqat chat raqami bo'yicha tekshirilsa guruhdagi
     * ISTALGAN a'zo to'lovni tasdiqlay va rahbar parolini bera olardi.
     */
    const isTeam = async (fromId: number | string | undefined): Promise<boolean> =>
        fromId !== undefined && isSuperAdmin(await deps.identity.getUser(String(fromId)));

    const voiceCounts = new Map<string, { count: number; resetAt: number }>();
    const voiceAllowed = (chatId: string): boolean => {
        const now = Date.now();
        const b = voiceCounts.get(chatId);
        if (!b || now > b.resetAt) {
            if (voiceCounts.size > 5000) voiceCounts.clear();
            voiceCounts.set(chatId, { count: 1, resetAt: now + 60 * 60 * 1000 });
            return true;
        }
        return ++b.count <= VOICE_PER_HOUR;
    };

    /** Handler ichida kutilmaydigan fon ishi — xatosi polling'ga chiqmaydi */
    const background = (where: string, work: () => Promise<any>) => { void work().catch(e => fail(where, e)); };

    const download = async (fileId: string): Promise<Buffer> => {
        const link = await bot.telegram.getFileLink(fileId);
        const res = await axios.get(String(link), { responseType: 'arraybuffer', timeout: 20_000, maxContentLength: FILE_MAX_BYTES });
        return Buffer.from(res.data);
    };

    bot.catch((err: any, ctx: any) => {
        fail(`handler (${ctx?.updateType || '?'})`, err);
        deps.onHealth?.('bot_error', String(err?.message || err).slice(0, 200));
    });

    bot.start(async ctx => {
        if (ctx.chat.type !== 'private') return;
        await deps.flow().onStart(String(ctx.chat.id), tgOf(ctx.from), ctx.payload || '');
    });

    // Shu chatni murojaatlar tushadigan joy qiladi (guruhda ham ishlaydi)
    bot.command('operator', async ctx => {
        const ok = await deps.operator().claimChat(String(ctx.chat.id), String(ctx.from.id));
        await ctx.reply(ok
            ? "✅ Murojaatlar endi shu chatga keladi. Mijozga javob berish uchun kartaga reply qiling."
            : "Bu buyruq faqat DentaCRM jamoasi uchun. Avval ilovadagi super admin panelidan «Telegramni ulash» tugmasini bosing.");
    });

    // "Menu" ro'yxatidagi buyruqlar pastdagi tugmalar bilan bir xil ishni qiladi
    for (const [command, action] of [['yangi', 'newQuestion'], ['tolov', 'pay'], ['parol', 'reset']] as const) {
        bot.command(command, async ctx => {
            if (ctx.chat.type !== 'private') return;
            await deps.flow().onMenu(String(ctx.chat.id), tgOf(ctx.from), action);
        });
    }

    bot.on(message('contact'), async ctx => {
        if (ctx.chat.type !== 'private') return;
        const c = ctx.message.contact;
        const own = !!c?.user_id && c.user_id === ctx.from.id;
        await deps.flow().onContact(String(ctx.chat.id), tgOf(ctx.from), c?.phone_number || '', own);
    });

    bot.on(message('text'), async ctx => {
        const chatId = String(ctx.chat.id);
        const text = ctx.message.text;

        if (await isOperatorChat(chatId)) {
            const replyTo = (ctx.message as any).reply_to_message?.message_id;
            if (!replyTo) return;
            if (!(await isTeam(ctx.from?.id))) return;
            const note = await deps.operator().onReply(chatId, replyTo, text, `${tgOf(ctx.from).name || 'Operator'} #${ctx.from.id}`);
            if (note) await messenger.send(chatId, note, { replyTo: ctx.message.message_id });
            return;
        }
        if (ctx.chat.type !== 'private') return;

        const action = menuAction(text);
        if (action) {
            background('menu', () => deps.flow().onMenu(chatId, tgOf(ctx.from), action));
            return;
        }
        await deps.flow().enqueue(chatId, tgOf(ctx.from), { kind: 'text', text, tgMessageId: ctx.message.message_id });
    });

    const onVoice = async (ctx: any, fileId: string, mime: string, duration: number, fileSize?: number) => {
        const chatId = String(ctx.chat.id);
        const user = await deps.identity.touch(chatId, tgOf(ctx.from));
        const t = T(user.lang);
        if (!deps.stt) { await messenger.send(chatId, t.voiceFailed, { lang: user.lang }); return; }
        if (duration > VOICE_MAX_SECONDS || (fileSize && fileSize > VOICE_MAX_BYTES)) { await messenger.send(chatId, t.voiceTooLong, { lang: user.lang }); return; }
        // Ovozni tanish pullik/limitli xizmat — bir chatdan soatiga cheklangan
        if (!voiceAllowed(chatId)) { await messenger.send(chatId, t.tooMany, { lang: user.lang }); return; }
        background('voice', async () => {
            void messenger.typing(chatId);
            let text = '';
            try {
                text = (await deps.stt!(await download(fileId), mime, user.lang)).trim();
            } catch (e: any) {
                fail('stt', e);
            }
            if (!text) { await messenger.send(chatId, t.voiceFailed, { lang: user.lang }); return; }
            // Tushunilgan matn qaytarib ko'rsatiladi: tanish xato bo'lsa foydalanuvchi darhol ko'radi
            await messenger.send(chatId, T(detectLang(text, user).lang).voiceHeard(text), { lang: user.lang });
            await deps.flow().enqueue(chatId, tgOf(ctx.from), { kind: 'voice', text, fileId, tgMessageId: ctx.message.message_id });
        });
    };

    bot.on(message('voice'), async ctx => {
        if (ctx.chat.type !== 'private') return;
        await onVoice(ctx, ctx.message.voice.file_id, ctx.message.voice.mime_type || 'audio/ogg', ctx.message.voice.duration, ctx.message.voice.file_size);
    });
    bot.on(message('audio'), async ctx => {
        if (ctx.chat.type !== 'private') return;
        await onVoice(ctx, ctx.message.audio.file_id, ctx.message.audio.mime_type || 'audio/mpeg', ctx.message.audio.duration, ctx.message.audio.file_size);
    });

    const onFile = async (ctx: any, kind: 'photo' | 'document', fileId: string) => {
        if (ctx.chat.type !== 'private') return;
        const chatId = String(ctx.chat.id);
        await deps.identity.touch(chatId, tgOf(ctx.from));
        background('file', async () => {
            // To'lov cheki kutilayotgan bo'lsa — bu chek
            if (await deps.flow().tryReceipt(chatId, kind, fileId)) return;
            await deps.flow().enqueue(chatId, tgOf(ctx.from), {
                kind, fileId, text: ctx.message.caption || '', tgMessageId: ctx.message.message_id,
            });
        });
    };

    bot.on(message('photo'), async ctx => {
        const sizes = ctx.message.photo;
        await onFile(ctx, 'photo', sizes[sizes.length - 1].file_id);
    });
    bot.on(message('document'), async ctx => {
        await onFile(ctx, 'document', ctx.message.document.file_id);
    });

    bot.on('callback_query', async ctx => {
        const q: any = ctx.callbackQuery;
        const data = String(q?.data || '');
        const msg = q?.message;
        if (!data || data === 'noop' || !msg) { await ctx.answerCbQuery().catch(() => { }); return; }
        const chatId = String(msg.chat.id);
        // Tugma bosilganini Telegramga darhol bildiramiz, ish fonda bajariladi
        if (await isOperatorChat(chatId)) {
            if (!(await isTeam(ctx.from?.id))) {
                await ctx.answerCbQuery('Bu tugma faqat DentaCRM jamoasi uchun', { show_alert: true }).catch(() => { });
                return;
            }
            // Kim tasdiqlagani jurnalda aniq bo'lsin: ism + Telegram raqami
            const name = `${tgOf(ctx.from).name || 'Operator'} #${ctx.from.id}`;
            // Maqola yozish modelni chaqiradi (sekin) — polling'ni ushlab turmasin
            if (data.startsWith('kb:')) {
                await ctx.answerCbQuery('Maqola tayyorlanmoqda…').catch(() => { });
                background('learn', () => deps.operator().onCallback(chatId, data, msg.message_id, name));
                return;
            }
            const toast = await deps.operator().onCallback(chatId, data, msg.message_id, name)
                .catch((e: any) => { fail('operator callback', e); return 'Xato yuz berdi'; });
            await ctx.answerCbQuery(toast || undefined).catch(() => { });
            return;
        }
        if (msg.chat.type !== 'private') { await ctx.answerCbQuery().catch(() => { }); return; }
        await ctx.answerCbQuery().catch(() => { });
        background('user callback', async () => {
            const toast = await deps.flow().onUserCallback(chatId, data, msg.message_id);
            if (toast) await messenger.send(chatId, toast);
        });
    });

    const launch = (attempt = 0) => {
        const startedAt = Date.now();
        bot.launch(() => {
            username = bot.botInfo?.username || null;
            console.log(`🤖 Yordam boti ishga tushdi: @${username}`);
            deps.onHealth?.('bot_up', `Yordam boti ishlayapti (@${username})`);
        }).catch((err: any) => {
            if (stopped) return;
            const code = err?.response?.error_code ?? err?.code;
            const reason = code === 401 ? "SUPPORT_BOT_TOKEN noto'g'ri"
                : code === 409 ? 'Shu token boshqa joyda ham ishlayapti'
                    : String(err?.response?.description || err?.message || err).slice(0, 200);
            console.error('❌ Yordam boti to\'xtadi:', reason);
            deps.onHealth?.('bot_down', reason);
            if (code === 401) return;
            const next = Date.now() - startedAt > RELAUNCH_MAX_MS ? 0 : attempt + 1;
            const timer = setTimeout(() => { if (!stopped) launch(next); }, Math.min(RELAUNCH_BASE_MS * 2 ** next, RELAUNCH_MAX_MS));
            timer.unref?.();
        });
    };

    return {
        messenger,
        username: () => username,
        async start(): Promise<void> {
            // Username launch'dan oldin ham kerak (ilovadagi havola) — alohida so'raymiz
            bot.telegram.getMe().then(me => { username = me.username || null; }).catch(e => fail('getMe', e));
            // Menyu va tavsif: o'zbekcha — asosiy, ruscha — rus tilidagi Telegram uchun
            for (const lang of ['uz', 'ru'] as const) {
                const p = BOT_PROFILE[lang];
                const extra = lang === 'ru' ? { language_code: 'ru' } : {};
                const tg: any = bot.telegram;
                tg.setMyCommands(p.commands, extra).catch((e: any) => fail('setMyCommands', e));
                tg.callApi('setMyDescription', { description: p.description, ...extra }).catch((e: any) => fail('setMyDescription', e));
                tg.callApi('setMyShortDescription', { short_description: p.shortDescription, ...extra }).catch((e: any) => fail('setMyShortDescription', e));
            }
            launch();
        },
        stop(): void {
            stopped = true;
            try { bot.stop(); } catch { /* ishga tushmagan bo'lishi mumkin */ }
        },
    };
};

export type SupportBot = ReturnType<typeof createSupportBot>;
