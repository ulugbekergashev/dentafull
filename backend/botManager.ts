import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class BotManager {
    private bots: Map<string, Telegraf> = new Map(); // token -> Telegraf
    private usageCount: Map<string, number> = new Map(); // token -> count of clinics
    private botUsernames: Map<string, string> = new Map(); // token -> username

    constructor() {
        // Start loading bots without blocking the main thread or crashing
        this.loadBots().catch(err => {
            console.error("⚠️ Initial bot loading failed (likely DB issue). Server starting without bots.", err.message);
        });
    }

    private async loadBots() {
        while (true) {
            try {
                console.log('Attempting to load bots from database...');
                const clinics = await prisma.clinic.findMany({
                    where: { botToken: { not: null } }
                });

                for (const clinic of clinics) {
                    if (clinic.botToken) {
                        await this.startBot(clinic.id, clinic.botToken);
                    }
                }
                console.log(`🤖 Loaded ${this.bots.size} unique bot instances.`);
                break; // If successful, exit the retry loop
            } catch (error: any) {
                console.error("❌ Failed to load bots (retrying in 30s):", error.message);
                await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds before retry
            }
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

            // 1. Start Command
            bot.start(async (ctx) => {
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

                            // Check if also owner
                            const ownerClinic = await prisma.clinic.findFirst({
                                where: { telegramChatId: chatId, botToken: token }
                            });

                            const keyboard = ownerClinic
                                ? [[{ text: "📊 Kunlik hisobot" }]]
                                : [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]];

                            ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSizning profilingiz muvaffaqiyatli ulandi.\n\nEndi siz ${patient.clinic.name}dan eslatmalar va xabarlar olasiz.`, {
                                reply_markup: {
                                    keyboard,
                                    resize_keyboard: true
                                }
                            });
                        } else {
                            ctx.reply("❌ Bemor topilmadi.");
                        }
                    } catch (e) {
                        console.error("Bot start error:", e);
                        ctx.reply("❌ Xatolik.");
                    }
                } else {
                    // Check if user is already linked as owner
                    const clinicAsOwner = await prisma.clinic.findFirst({
                        where: { telegramChatId: chatId, botToken: token }
                    });

                    if (clinicAsOwner) {
                        return ctx.reply(`👋 Assalomu alaykum, ${clinicAsOwner.adminName}!\n\nSiz ${clinicAsOwner.name} egasi sifatida ulandingiz. Hisobot olish uchun quyidagi tugmani bosing yoki /report komandasini yuboring.`, {
                            reply_markup: {
                                keyboard: [[{ text: "📊 Kunlik hisobot" }]],
                                resize_keyboard: true
                            }
                        });
                    }

                    // Check if already linked as a doctor
                    const doctorLinked = await prisma.doctor.findFirst({
                        where: { telegramChatId: chatId, clinic: { botToken: token } },
                        include: { clinic: true }
                    });

                    if (doctorLinked) {
                        return ctx.reply(`👋 Assalomu alaykum, Dr. ${doctorLinked.firstName} ${doctorLinked.lastName}!\n\nSiz ${doctorLinked.clinic.name} klinikasiga ulangansiz. Bugungi qabullaringizni ko'rish uchun quyidagi tugmani bosing.`, {
                            reply_markup: {
                                keyboard: [[{ text: "📅 Bugungi qabullarim" }]],
                                resize_keyboard: true
                            }
                        });
                    }

                    ctx.reply("👋 Assalomu alaykum!\n\nKlinika botiga xush kelibsiz.\n\nIltimos, telefon raqamingizni yuboring:", {
                        reply_markup: {
                            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                            resize_keyboard: true,
                            one_time_keyboard: false
                        }
                    });
                }
            });

            // 2. Report Command (for clinic owner)
            bot.command('report', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const clinic = await prisma.clinic.findFirst({
                    where: { telegramChatId: chatId, botToken: token }
                });

                if (!clinic) {
                    return ctx.reply("❌ Siz klinika egasi sifatida ulanmagansiz. Iltimos, avval ro'yxatdan o'ting.");
                }

                const report = await this.generateDailyReport(clinic.id);
                ctx.reply(report, { parse_mode: 'Markdown' });
            });

            // 3. Listen for "📊 Kunlik hisobot" button (clinic owner)
            bot.hears('📊 Kunlik hisobot', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const clinic = await prisma.clinic.findFirst({
                    where: { telegramChatId: chatId, botToken: token }
                });

                if (clinic) {
                    const report = await this.generateDailyReport(clinic.id);
                    ctx.reply(report, { parse_mode: 'Markdown' });
                }
            });

            // 4. Listen for "📅 Bugungi qabullarim" button (doctor)
            bot.hears('📅 Bugungi qabullarim', async (ctx) => {
                const chatId = String(ctx.chat.id);

                const doctor = await prisma.doctor.findFirst({
                    where: {
                        telegramChatId: chatId,
                        clinic: { botToken: token }
                    },
                    include: { clinic: true }
                });

                if (doctor) {
                    const schedule = await this.generateDoctorSchedule(doctor.id, doctor.clinic.id);
                    ctx.reply(schedule, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("❌ Siz shifokor sifatida ulanmagansiz. Iltimos, telefon raqamingizni yuboring.", {
                        reply_markup: {
                            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                            resize_keyboard: true
                        }
                    });
                }
            });

            // 5. Contact Listener
            bot.on('contact', async (ctx) => {
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

                    // --- CHECK: Clinic Owner ---
                    for (const clinic of clinics) {
                        if ((clinic as any).ownerPhone) {
                            const ownerPhone = (clinic as any).ownerPhone.replace(/\s/g, '').replace('+', '');
                            if (ownerPhone === phone) {
                                await prisma.clinic.update({
                                    where: { id: clinic.id },
                                    data: { telegramChatId: chatId }
                                } as any);
                                ctx.reply(`✅ Xush kelibsiz, ${clinic.adminName}!\n\nSiz ${clinic.name} egasi sifatida muvaffaqiyatli ulandingiz. Endi siz har kuni hisobotlarni olasiz.`, {
                                    reply_markup: {
                                        keyboard: [[{ text: "📊 Kunlik hisobot" }]],
                                        resize_keyboard: true
                                    }
                                });
                                foundAny = true;
                            }
                        }
                    }

                    if (foundAny) return;

                    // --- CHECK: Doctor ---
                    const cleanPhone = phone.slice(-9); // last 9 digits for matching
                    const doctors = await prisma.doctor.findMany({
                        where: {
                            clinic: { botToken: token }
                        },
                        include: { clinic: true }
                    });

                    for (const doctor of doctors) {
                        const doctorPhone = doctor.phone.replace(/\s/g, '').replace('+', '');
                        if (doctorPhone.slice(-9) === cleanPhone) {
                            // Check unique constraint before updating
                            // Clear any existing doctor with this chatId in same clinic
                            await prisma.doctor.updateMany({
                                where: {
                                    telegramChatId: chatId,
                                    clinicId: doctor.clinicId,
                                    NOT: { id: doctor.id }
                                },
                                data: { telegramChatId: null }
                            });

                            await prisma.doctor.update({
                                where: { id: doctor.id },
                                data: { telegramChatId: chatId }
                            });

                            const schedule = await this.generateDoctorSchedule(doctor.id, doctor.clinicId);

                            ctx.reply(`✅ Xush kelibsiz, Dr. ${doctor.firstName} ${doctor.lastName}!\n\nSiz ${doctor.clinic.name} klinikasiga muvaffaqiyatli ulandi. Endi har kuni ertalab soat 8:00 da bugungi qabullaringiz haqida xabar olasiz. 🏥`, {
                                reply_markup: {
                                    keyboard: [[{ text: "📅 Bugungi qabullarim" }]],
                                    resize_keyboard: true
                                }
                            });

                            // Send today's schedule immediately
                            if (schedule !== null) {
                                ctx.reply(schedule, { parse_mode: 'Markdown' });
                            }

                            foundAny = true;
                            break;
                        }
                    }

                    if (foundAny) return;

                    // --- CHECK: Patient ---
                    const patients = await prisma.patient.findMany({
                        where: {
                            phone: { contains: cleanPhone },
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

            // 6. Rating Action Handler
            bot.action(/^rate_(\d+)_([\w-]+)$/, async (ctx) => {
                const rating = parseInt(ctx.match[1]);
                const appointmentId = ctx.match[2];
                if (!ctx.chat) return;

                try {
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

    /**
     * Send morning schedule to ALL doctors across ALL clinics that have a bot and telegram-linked doctors
     */
    public async sendDoctorMorningSchedules() {
        try {
            console.log('🏥 Running doctor morning schedule job...');

            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Tashkent',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            const todayDateString = formatter.format(new Date());

            // Find all doctors with telegramChatId and clinic with botToken
            const doctors = await prisma.doctor.findMany({
                where: {
                    telegramChatId: { not: null },
                    status: 'Active',
                    clinic: { botToken: { not: null }, status: 'Active' }
                },
                include: { clinic: true }
            });

            console.log(`Found ${doctors.length} telegram-linked doctors to notify.`);
            let sentCount = 0;

            for (const doctor of doctors) {
                if (!doctor.telegramChatId || !doctor.clinic.botToken) continue;

                const bot = this.bots.get(doctor.clinic.botToken);
                if (!bot) continue;

                try {
                    const schedule = await this.generateDoctorSchedule(doctor.id, doctor.clinicId);
                    await bot.telegram.sendMessage(doctor.telegramChatId, schedule, { parse_mode: 'Markdown' });
                    sentCount++;
                    console.log(`✅ Morning schedule sent to Dr. ${doctor.firstName} ${doctor.lastName}`);
                } catch (e: any) {
                    console.error(`Failed to send morning schedule to Dr. ${doctor.firstName}:`, e.message);
                }
            }

            console.log(`🏥 Doctor morning schedule job done. Sent to ${sentCount} doctors.`);
        } catch (error) {
            console.error('❌ Doctor morning schedule job error:', error);
        }
    }

    /**
     * Generate today's appointment schedule for a specific doctor
     */
    public async generateDoctorSchedule(doctorId: string, clinicId: string): Promise<string> {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tashkent',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayDateString = formatter.format(new Date());

        const doctor = await prisma.doctor.findUnique({
            where: { id: doctorId },
            include: { clinic: true }
        });

        const appointments = await prisma.appointment.findMany({
            where: {
                doctorId: doctorId,
                clinicId: clinicId,
                date: todayDateString,
                status: { notIn: ['Cancelled'] }
            },
            orderBy: { time: 'asc' }
        });

        const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Shifokor';
        const clinicName = doctor?.clinic?.name || 'Klinika';

        if (appointments.length === 0) {
            return `📅 *BUGUNGI JADVALINGIZ* (${todayDateString})\n\n` +
                `👨‍⚕️ ${doctorName} — ${clinicName}\n\n` +
                `✅ Bugun qabulingiz yo'q. Dam oling! 😊`;
        }

        let message = `📅 *BUGUNGI JADVALINGIZ* (${todayDateString})\n\n` +
            `👨‍⚕️ ${doctorName} — ${clinicName}\n` +
            `📊 Jami: *${appointments.length} ta qabul*\n\n`;

        appointments.forEach((appt, index) => {
            const statusEmoji =
                appt.status === 'Completed' ? '✅' :
                appt.status === 'No-Show' ? '❌' :
                appt.status === 'Confirmed' ? '🟢' : '🕐';

            message += `${index + 1}. ${statusEmoji} *${appt.time}* — ${appt.patientName}\n`;
            message += `   📋 ${appt.type}\n`;
            if (appt.notes) message += `   📝 ${appt.notes.substring(0, 50)}${appt.notes.length > 50 ? '...' : ''}\n`;
            message += `\n`;
        });

        message += `\nXayrli kun deb tilaymiz! 🌟`;
        return message;
    }

    public async generateDailyReport(clinicId: string): Promise<string> {
        // Use Tashkent timezone for date string
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tashkent',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayDateString = formatter.format(new Date());

        // Start of today in Tashkent as a UTC Date for Prisma
        const startOfTashkentToday = new Date(todayDateString + 'T00:00:00+05:00');

        // 1. Count new patients created today
        const newPatientsCount = await prisma.patient.count({
            where: {
                clinicId: clinicId,
                createdAt: {
                    gte: startOfTashkentToday
                }
            } as any
        });

        // 2. Sum revenue from paid transactions today
        const dailyRevenue = await prisma.transaction.aggregate({
            where: {
                clinicId: clinicId,
                status: 'Paid',
                date: todayDateString
            },
            _sum: {
                amount: true
            }
        });

        // 3. Count total appointments today
        const appointmentsCount = await prisma.appointment.count({
            where: {
                clinicId: clinicId,
                date: todayDateString,
                status: { not: 'Cancelled' }
            }
        });

        const totalRevenue = dailyRevenue._sum.amount || 0;

        return `📊 *KUNLIK HISOBOT* (${todayDateString})\n\n` +
            `👤 *Yangi bemorlar:* ${newPatientsCount}\n` +
            `📅 *Qabullar soni:* ${appointmentsCount}\n` +
            `💰 *Jami tushum:* ${totalRevenue.toLocaleString()} so'm\n\n` +
            `Xizmatingiz barakali bo'lsin! 😊`;
    }
}

export const botManager = new BotManager();
