import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class BotManager {
    private bots: Map<string, Telegraf> = new Map();
    private botUsernames: Map<string, string> = new Map();

    constructor() {
        // Initialize bots for all clinics with tokens on startup
        this.loadBots();
    }

    private async loadBots() {
        try {
            const clinics = await prisma.clinic.findMany({
                where: { botToken: { not: null } }
            });

            for (const clinic of clinics) {
                if (clinic.botToken) {
                    await this.startBot(clinic.id, clinic.botToken);
                }
            }
            console.log(`🤖 Loaded ${this.bots.size} clinic bots.`);
        } catch (error) {
            console.error("Failed to load bots:", error);
        }
    }

    public async startBot(clinicId: string, token: string) {
        // Stop existing if any
        this.removeBot(clinicId);

        try {
            const bot = new Telegraf(token);

            // Fetch username immediately and cache it
            bot.telegram.getMe().then(me => {
                if (me.username) {
                    this.botUsernames.set(clinicId, me.username);
                }
            }).catch(e => {
                console.error(`Failed to fetch bot username for ${clinicId}:`, e.message);
            });

            // --- Bot Logic for PATIENTS ONLY ---

            // 1. Start Command (Patient Linking via Deep Link)
            bot.start(async (ctx) => {
                const payload = ctx.payload;
                const chatId = String(ctx.chat.id);

                if (payload) {
                    // Link patient via deep link
                    try {
                        const patient = await prisma.patient.findUnique({
                            where: { id: payload }
                        });

                        if (patient && patient.clinicId === clinicId) {
                            await prisma.patient.update({
                                where: { id: payload },
                                data: { telegramChatId: chatId }
                            });
                            ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSizning profilingiz muvaffaqiyatli ulandi.\n\nEndi siz klinikadan eslatmalar va xabarlar olasiz.`);
                        } else {
                            ctx.reply("❌ Bemor topilmadi yoki boshqa klinikaga tegishli.");
                        }
                    } catch (e) {
                        console.error("Bot start error:", e);
                        ctx.reply("❌ Xatolik.");
                    }
                } else {
                    // No payload - ask for phone number
                    ctx.reply("👋 Assalomu alaykum!\n\nKlinikamizning Telegram botiga xush kelibsiz.\n\nIltimos, telefon raqamingizni yuboring:", {
                        reply_markup: {
                            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                            resize_keyboard: true,
                            one_time_keyboard: true
                        }
                    });
                }
            });

            // 2. Contact Listener (Patient Linking via Phone)
            bot.on('contact', async (ctx) => {
                const contact = ctx.message.contact;
                const chatId = String(ctx.chat.id);
                if (!contact || !contact.phone_number) return;

                let phone = contact.phone_number.replace(/\s/g, ''); // Remove spaces
                const phoneWithoutPlus = phone.replace('+', '');

                try {
                    // Check Patient of THIS clinic ONLY
                    const patient = await prisma.patient.findFirst({
                        where: {
                            clinicId: clinicId,
                            OR: [
                                { phone: phone },
                                { phone: `+${phoneWithoutPlus}` },
                                { phone: phoneWithoutPlus }
                            ]
                        }
                    });

                    if (patient) {
                        await prisma.patient.update({
                            where: { id: patient.id },
                            data: { telegramChatId: chatId }
                        });
                        ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSizning profilingiz muvaffaqiyatli ulandi.\n\nEndi siz klinikadan eslatmalar va xabarlar olasiz.`);
                        return;
                    }

                    ctx.reply("❌ Kechirasiz, bu telefon raqam bizning tizimda topilmadi.\n\nIltimos, klinika administratori bilan bog'laning.");
                } catch (e) {
                    console.error("Contact error:", e);
                }
            });

            bot.launch().catch(err => console.error(`Bot launch failed for clinic ${clinicId}:`, err.message));
            this.bots.set(clinicId, bot);
            console.log(`✅ Bot started for clinic: ${clinicId}`);

        } catch (error) {
            console.error(`Failed to start bot for clinic ${clinicId}:`, error);
        }
    }

    public removeBot(clinicId: string) {
        const bot = this.bots.get(clinicId);
        if (bot) {
            try {
                bot.stop('Manual restart');
            } catch (e) {
                // Ignore stop errors
            }
            this.bots.delete(clinicId);
            this.botUsernames.delete(clinicId);
        }
    }

    public async notifyClinicUser(clinicId: string, chatId: string, message: string) {
        const bot = this.bots.get(clinicId);
        if (bot) {
            try {
                // Send message without inline keyboard (tel: URLs not supported by Telegram)
                await bot.telegram.sendMessage(chatId, message);
            } catch (e) {
                console.error(`Failed to send message in clinic ${clinicId}:`, e);
            }
        }
    }
    public async getBotUsername(clinicId: string): Promise<string | null> {
        // Return cached username if available
        if (this.botUsernames.has(clinicId)) {
            return this.botUsernames.get(clinicId)!;
        }

        const bot = this.bots.get(clinicId);
        if (bot) {
            try {
                const me = await bot.telegram.getMe();
                if (me.username) {
                    this.botUsernames.set(clinicId, me.username);
                    return me.username;
                }
            } catch (e) {
                console.error(`Failed to get bot username for clinic ${clinicId}:`, e);
            }
        }
        return null;
    }
}

export const botManager = new BotManager();
