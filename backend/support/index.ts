// ─── Yordam boti: yig'ish nuqtasi ────────────────────────────────────────────
// Barcha qismlarni bir-biriga ulaydi. server.ts faqat shu faylni biladi:
//
//   const support = createSupport({ db: prisma, diag, ai, ... });
//   await support.start();          // migratsiyalardan KEYIN
//
// SUPPORT_BOT_TOKEN qo'yilmagan bo'lsa bot ishga tushmaydi va hech narsa
// o'zgarmaydi: API yo'llari "bot yoqilmagan" deb javob beradi, ilova eski
// yordam havolalarini ko'rsataveradi.

import type { Diag } from '../diag';
import { createActions } from './actions';
import { createBilling } from './billing';
import { createSupportBot, SupportBot } from './bot';
import { AiDeps, createBrain } from './brain';
import { createFlow, Messenger } from './flow';
import { createIdentity } from './identity';
import { createKb } from './kb';
import type { SeedArticle } from './kbTypes';
import { createOperator } from './operator';
import { createProactive } from './proactive';
import { createSettings } from './settings';
import { createTickets } from './tickets';
import { createTools, ToolDeps } from './tools';

export interface SupportDeps {
    db: any;
    diag: Diag;
    ai: AiDeps & { chat?: (messages: any[], opts?: any) => Promise<string> };
    logAi?: (entry: any) => Promise<any>;
    withActor: <T>(actor: { name: string; role: string; clinicId: string | null }, fn: () => Promise<T>) => Promise<T>;
    smsBalance?: ToolDeps['smsBalance'];
    triggers?: ToolDeps['triggers'];
    health?: ToolDeps['health'];
    stt?: (audio: Buffer, mimeType: string, lang: 'uz' | 'ru') => Promise<string>;
    seed?: SeedArticle[];
    /** Testlar uchun: tayyor messenger (Telegram o'rniga) */
    messenger?: Messenger;
    debounceMs?: number;
}

/** Bot yoqilmaganda: hech kimga hech narsa yuborilmaydi */
const silentMessenger: Messenger = {
    send: async () => null,
    sendFile: async () => null,
    editButtons: async () => { },
    typing: async () => { },
};

export const createSupport = (deps: SupportDeps) => {
    const { db, diag } = deps;
    const token = String(process.env.SUPPORT_BOT_TOKEN || '').trim();
    const botsDisabled = process.env.DISABLE_BOTS === '1';

    const settings = createSettings(db);
    const identity = createIdentity(db);
    const tickets = createTickets(db);
    const kb = createKb(db);
    const actions = createActions({ db, withActor: deps.withActor });
    const billing = createBilling({ db, withActor: deps.withActor });
    const tools = createTools({ db, diag, smsBalance: deps.smsBalance, triggers: deps.triggers, health: deps.health });
    const brain = createBrain({ ai: deps.ai, kb, tools });

    // flow ↔ operator ↔ bot bir-birini chaqiradi — kech bog'lash (funksiya orqali)
    const hub: { flow?: any; operator?: any } = {};
    let bot: SupportBot | null = null;
    // DISABLE_BOTS=1 da bot umuman yaratilmaydi: cron yoki API orqali ham
    // haqiqiy mijozlarga xabar ketib qolmasin.
    if (token && !botsDisabled && !deps.messenger) {
        bot = createSupportBot({
            token, identity, settings, stt: deps.stt,
            flow: () => hub.flow, operator: () => hub.operator,
            onHealth: (kind, message) => { void diag.recordDaily({ kind, subject: 'support_bot', message }); },
        });
    }
    const messenger: Messenger = deps.messenger || bot?.messenger || silentMessenger;

    const flow = createFlow({
        db, identity, tickets, brain, actions, billing, settings, messenger,
        operator: () => hub.operator, logAi: deps.logAi, debounceMs: deps.debounceMs,
        // Operator chatiga xabar yetmasa panelda ko'rinsin (guruh o'zgargan, bot chiqarilgan va h.k.)
        onOperatorUnreachable: (what) => {
            void diag.recordDaily({
                kind: 'bot_error', subject: 'support_operator',
                message: `Operator chatiga xabar yetmadi (${what}). Operator guruhida /operator ni qayta yuboring.`,
            });
        },
    });
    const operator = createOperator({ db, identity, tickets, kb, actions, billing, settings, messenger, flow: () => flow, ai: deps.ai });
    // Haqiqiy bot (yoki sinov messengeri) bo'lmasa ogohlantirishlar umuman yuborilmaydi
    const proactive = createProactive({ db, diag, identity, settings, messenger, enabled: () => !!bot || !!deps.messenger });
    hub.flow = flow;
    hub.operator = operator;

    let started = false;

    return {
        settings, identity, tickets, kb, actions, billing, tools, brain, flow, operator, proactive,

        /** Bot yoqilganmi (token bor) */
        configured: (): boolean => !!token,
        botUsername: (): string | null => bot?.username() || null,

        /**
         * Migratsiyalardan keyin chaqiriladi: bilim bazasini yangilaydi, botni
         * ishga tushiradi va deploydan oldin javobsiz qolgan savollarni davom ettiradi.
         * Hech qachon xato tashlamaydi — yordam boti ishlamasa ham CRM ishlashi shart.
         */
        async start(): Promise<void> {
            if (started) return;
            started = true;
            try {
                if (deps.seed?.length) {
                    const r = await kb.syncSeed(deps.seed);
                    console.log(`📚 Bilim bazasi: ${r.upserted} ta maqola${r.retired ? `, ${r.retired} tasi olib tashlandi` : ''}`);
                }
            } catch (e: any) {
                console.error('[support] bilim bazasini yangilab bo\'lmadi:', e?.message);
            }
            if (!token) {
                console.log('ℹ️  SUPPORT_BOT_TOKEN yo\'q — yordam boti ishga tushmaydi.');
                return;
            }
            if (botsDisabled) {
                console.log('⏸️  DISABLE_BOTS=1 — yordam boti ishga tushmaydi.');
                return;
            }
            try {
                await bot?.start();
                const resumed = await flow.resume();
                if (resumed) console.log(`[support] javobsiz qolgan ${resumed} ta suhbat davom ettirilmoqda`);
            } catch (e: any) {
                console.error('[support] botni ishga tushirib bo\'lmadi:', e?.message);
            }
        },

        stop(): void {
            bot?.stop();
        },
    };
};

export type Support = ReturnType<typeof createSupport>;
