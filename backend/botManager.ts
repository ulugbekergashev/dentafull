import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class BotManager {
    private bots: Map<string, Telegraf> = new Map(); // token -> Telegraf
    private usageCount: Map<string, number> = new Map(); // token -> count of clinics
    private botUsernames: Map<string, string> = new Map(); // token -> username

    constructor() {
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
            console.log(`🤖 Loaded ${this.bots.size} unique bot instances.`);
        } catch (error) {
            console.error("Failed to load bots:", error);
        }
    }

    public async startBot(clinicId: string, token: string) {
        // Increment usage count
        const currentCount = this.usageCount.get(token) || 0;
        this.usageCount.set(token, currentCount + 1);

        // If bot already exists for this token, just return
        if (this.bots.has(token)) {
            console.log(`ℹ️ Bot for token already running. Added clinic ${clinicId} to shared instance.`);
            return;
        }

        try {
            const bot = new Telegraf(token);

            // Fetch username immediately and cache it
            bot.telegram.getMe().then(me => {
                if (me.username) {
                    this.botUsernames.set(token, me.username);
                }
            }).catch(e => {
                console.error(`Failed to fetch bot username for token:`, e.message);
            });

            // Global Message Handler for Debugging
            bot.on('message', async (ctx, next) => {
                console.log(`[BOT_DEBUG] Received message in bot ${this.botUsernames.get(token) || token.substring(0, 10)} from ${ctx.from?.id}`);
                const clinics = await prisma.clinic.findMany({ where: { botToken: token }, select: { name: true } });
                const clinicNames = clinics.map(c => c.name).join(', ');

                if (ctx.message && 'text' in ctx.message && ctx.message.text === '/whoami') {
                    return ctx.reply(`🤖 Bot: ${this.botUsernames.get(token) || 'Noma\'lum'}\n🏥 Klinikalar: ${clinicNames || 'Hech qanday'}\n🔑 Token (oxiri): ...${token.slice(-5)}`);
                }
                return next();
            });

            // 1. Start Command
            bot.start(async (ctx) => {
                console.log(`[BOT_DEBUG] /start command from ${ctx.from?.id}`);
                const payload = ctx.payload;
                const chatId = String(ctx.chat.id);

                if (payload) {
                    try {
                        const patient = await prisma.patient.findUnique({
                            where: { id: payload },
                            include: { clinic: true }
                        });

                        if (patient) {
                            await prisma.patient.update({
                                where: { id: payload },
                                data: { telegramChatId: chatId }
                            });
                            ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSizning profilingiz muvaffaqiyatli ulandi.\n\nEndi siz ${patient.clinic.name}dan eslatmalar va xabarlar olasiz.`);
                        } else {
                            ctx.reply("❌ Bemor topilmadi.");
                        }
                    } catch (e) {
                        console.error("Bot start error:", e);
                        ctx.reply("❌ Xatolik.");
                    }
                } else {
                    ctx.reply("👋 Assalomu alaykum!\n\nKlinika botiga xush kelibsiz.\n\nIltimos, telefon raqamingizni yuboring:", {
                        reply_markup: {
                            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                            resize_keyboard: true,
                            one_time_keyboard: true
                        }
                    });
                }
            });

            // 2. Contact Listener
            bot.on('contact', async (ctx) => {
                console.log(`[BOT_DEBUG] Contact received from ${ctx.from?.id}`);
                const contact = ctx.message.contact;
                const chatId = String(ctx.chat.id);
                if (!contact || !contact.phone_number) return;

                let phone = contact.phone_number.replace(/\s/g, '').replace('+', '');

                try {
                    // Check if owner of ANY clinic using this token
                    const clinics = await prisma.clinic.findMany({
                        where: { botToken: token }
                    });

                    let foundAny = false;

                    for (const clinic of clinics) {
                        if ((clinic as any).ownerPhone) {
                            const ownerPhone = (clinic as any).ownerPhone.replace(/\s/g, '').replace('+', '');
                            if (ownerPhone === phone) {
                                await prisma.clinic.update({
                                    where: { id: clinic.id },
                                    data: { telegramChatId: chatId }
                                } as any);
                                ctx.reply(`✅ Xush kelibsiz, ${clinic.adminName}!\n\nSiz ${clinic.name} egasi sifatida muvaffaqiyatli ulandingiz. Endi siz har kuni hisobotlarni olasiz.`);
                                foundAny = true;
                            }
                        }
                    }

                    // Also check for patients across these clinics
                    const patients = await prisma.patient.findMany({
                        where: {
                            phone: { contains: phone.slice(-9) },
                            clinic: { botToken: token }
                        },
                        include: { clinic: true }
                    });

                    for (const patient of patients) {
                        await prisma.patient.update({
                            where: { id: patient.id },
                            data: { telegramChatId: chatId }
                        });
                        ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSiz ${patient.clinic.name} bemori sifatida muvaffaqiyatli ulandingiz.`);
                        foundAny = true;
                    }

                    if (!foundAny) {
                        ctx.reply("❌ Kechirasiz, sizning telefon raqamingiz tizimda topilmadi. Iltimos, klinika bilan bog'laning.");
                    }
                } catch (e) {
                    console.error("Contact handler error:", e);
                    ctx.reply("❌ Xatolik yuz berdi.");
                }
            });

            // 3. Rating Action Handler
            bot.action(/^rate_(\d+)_([\w-]+)$/, async (ctx) => {
                const rating = parseInt(ctx.match[1]);
                const appointmentId = ctx.match[2];
                if (!ctx.chat) return;

                try {
                    // Update review if exists, or create new
                    await prisma.review.upsert({
                        where: { appointmentId: appointmentId },
                        update: { rating: rating },
                        create: {
                            appointmentId: appointmentId,
                            rating: rating
                        }
                    });

                    const stars = "⭐".repeat(rating);
                    await ctx.editMessageText(`✅ Bahoingiz uchun rahmat!\n\nSiz bizni ${rating} ball (${stars}) bilan baholadingiz. Kelajakda xizmatlarimizni yanada yaxshilashda davom etamiz.`);
                    await ctx.answerCbQuery("Rahmat!");
                } catch (e) {
                    console.error("Rating save error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi.");
                }
            });

            bot.launch().catch(err => console.error(`Bot launch failed for token ${token.substring(0, 5)}:`, err.message));
            this.bots.set(token, bot);
            console.log(`✅ Bot instance started for token: ${token.substring(0, 10)}...`);

        } catch (error: any) {
            console.error(`Failed to start bot for token ${token.substring(0, 5)}:`, error.message);
        }
    }

    public async removeBot(clinicId: string) {
        // Since we use tokens, we need the token associated with this clinicId
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return;

        const token = clinic.botToken;
        const count = this.usageCount.get(token) || 0;

        if (count <= 1) {
            const bot = this.bots.get(token);
            if (bot) {
                try {
                    await bot.stop();
                } catch (e) { }
                this.bots.delete(token);
                this.usageCount.delete(token);
                this.botUsernames.delete(token);
                console.log(`🛑 Bot instance stopped for token: ${token.substring(0, 10)}...`);
            }
        } else {
            this.usageCount.set(token, count - 1);
            console.log(`ℹ️ Bot instance remains active for other clinics. Clinic ${clinicId} association removed.`);
        }
    }

    public async notifyClinicUser(clinicId: string, chatId: string, message: string, patientId?: string, type: string = 'Manual') {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return;

        const bot = this.bots.get(clinic.botToken);
        if (bot) {
            try {
                await bot.telegram.sendMessage(chatId, message);
                await prisma.telegramLog.create({
                    data: { clinicId, patientId, type, status: 'Sent', message }
                });
            } catch (e: any) {
                console.error(`Failed to send message in clinic ${clinicId}:`, e);
                await prisma.telegramLog.create({
                    data: { clinicId, patientId, type, status: 'Failed', message, error: e.message }
                });
            }
        }
    }

    public async sendRatingRequest(clinicId: string, chatId: string, appointmentId: string, patientName: string, patientId?: string) {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return;

        const bot = this.bots.get(clinic.botToken);
        const message = `🌟 Assalomu alaykum, ${patientName}!\n\nBugun klinikamamizdan foydalanganingiz uchun rahmat. Iltimos, xizmat ko'rsatish sifatini 5 ballik tizimda baholang. Bu bizga yanada yaxshiroq bo'lishimizga yordam beradi.`;

        if (bot) {
            try {
                await bot.telegram.sendMessage(chatId, message, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "⭐ 1", callback_data: `rate_1_${appointmentId}` },
                            { text: "⭐ 2", callback_data: `rate_2_${appointmentId}` },
                            { text: "⭐ 3", callback_data: `rate_3_${appointmentId}` },
                            { text: "⭐ 4", callback_data: `rate_4_${appointmentId}` },
                            { text: "⭐ 5", callback_data: `rate_5_${appointmentId}` }
                        ]]
                    }
                });
                await prisma.telegramLog.create({
                    data: { clinicId, patientId, type: 'Rating', status: 'Sent', message: 'Rating Request sent' }
                });
            } catch (e: any) {
                console.error(`Failed to send rating request in clinic ${clinicId}:`, e);
                await prisma.telegramLog.create({
                    data: { clinicId, patientId, type: 'Rating', status: 'Failed', message: 'Rating Request failed', error: e.message }
                });
            }
        }
    }

    public async getBotUsername(clinicId: string): Promise<string | null> {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return null;
        return this.botUsernames.get(clinic.botToken) || null;
    }
}

export const botManager = new BotManager();
