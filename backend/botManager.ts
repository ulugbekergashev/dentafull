import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { prisma } from './db';
import * as notif from './notifications';
import { buildReportScreen, parseReportCallback, reportCallback } from './botReports';
import { tashkentDateStr } from './triggers';

/**
 * Menyu tugmalari. Menyu har doim pastda turadi (is_persistent) va har bir
 * rolga o'ziniki: rahbar — hisobot, shifokor — o'z jadvali, resepshn —
 * klinika jadvali va kassa, bemor — yozilish va hisobi. Bir odam bir nechta
 * rolda bo'lsa, tugmalar birlashadi.
 */
const BTN = {
    report: '📊 Hisobot',
    clinicToday: '📋 Bugungi qabullar',
    clinicTomorrow: '📆 Ertangi qabullar',
    cash: '💰 Bugungi kassa holati',
    myToday: '📅 Bugungi qabullarim',
    myTomorrow: '📆 Ertangi qabullarim',
    book: '📅 Qabulga yozilish',
    nextAppt: '⏰ Keyingi qabulim',
    history: '📋 Davolanish tarixim',
    account: '💳 Mening hisobim',
} as const;
/** Eski menyudagi tugma — foydalanuvchilarda hali turgan bo'lishi mumkin */
const LEGACY_REPORT_BTN = '📊 Kunlik hisobot';

class BotManager {
    private bots: Map<string, Telegraf> = new Map(); // token -> Telegraf
    private usageCount: Map<string, number> = new Map(); // token -> count of clinics
    private botUsernames: Map<string, string> = new Map(); // token -> username
    private pendingPayments: Map<string, { appointmentId: string; clinicId: string }> = new Map(); // chatId -> payment info

    constructor() {
        // DISABLE_BOTS=1 — botlar ishga tushirilmaydi.
        //
        // NEGA KERAK: server mahalliy mashinada ko'tarilganda ham barcha
        // klinikalarning HAQIQIY Telegram botlari ulanadi. Telegram esa
        // bitta botga kelgan xabarni faqat BITTA tinglovchiga beradi —
        // ya'ni dasturchi kompyuteridagi server mijozlarning xabarlarini
        // productiondan tortib oladi va ularga javob bermaydi.
        //
        // Bu jimgina yuz beradi: loglarda "Bot instance started" deb
        // yoziladi, xolos. Productionda bu o'zgaruvchi o'rnatilmaydi.
        if (process.env.DISABLE_BOTS === '1') {
            console.log('⏸️  DISABLE_BOTS=1 — Telegram botlari ishga tushmaydi.');
            return;
        }

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

    /** Shu chatdagi odam shu botda kim: rahbar, shifokor, resepshn, bemor (bir nechtasi bo'lishi mumkin) */
    private async rolesFor(chatId: string, token: string) {
        const [owner, doctor, receptionist, patient] = await Promise.all([
            prisma.clinic.findFirst({ where: { telegramChatId: chatId, botToken: token } }),
            prisma.doctor.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } }, include: { clinic: true } }),
            prisma.receptionist.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } }, include: { clinic: true } }),
            prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } }, include: { clinic: true } }),
        ]);
        return { owner, doctor, receptionist, patient };
    }

    /** Rolga mos doimiy menyu. Hech kim bo'lmasa — telefon raqam so'raladi */
    private menuMarkup(r: { owner: any; doctor: any; receptionist: any; patient: any }) {
        const rows: string[][] = [];
        if (r.owner) rows.push([BTN.report], [BTN.clinicToday, BTN.clinicTomorrow], [BTN.cash]);
        else if (r.receptionist) rows.push([BTN.clinicToday, BTN.clinicTomorrow], [BTN.cash]);
        if (r.doctor) rows.push([BTN.myToday, BTN.myTomorrow]);
        if (r.patient) rows.push([BTN.book, BTN.nextAppt], [BTN.history, BTN.account]);
        if (!rows.length) {
            return {
                keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
                resize_keyboard: true,
                is_persistent: true,
            };
        }
        return { keyboard: rows.map(row => row.map(text => ({ text }))), resize_keyboard: true, is_persistent: true };
    }

    /** Rahbar uchun hisobot ekrani (yangi xabar yoki tugma bosilganda o'sha xabarni almashtirish) */
    private async showReport(ctx: any, clinic: { id: string; name: string }, data: string, edit: boolean) {
        const parsed = parseReportCallback(data) || { p: 'd0' as const, s: 'sum' as const, b: '' };
        const screen = await buildReportScreen(clinic, parsed.p, parsed.s, parsed.b);
        const extra = { parse_mode: 'HTML' as const, reply_markup: { inline_keyboard: screen.keyboard } };
        if (edit) {
            // Bir xil ekranni qayta bosish — Telegram "not modified" xatosi beradi, bu normal
            await ctx.editMessageText(screen.text, extra).catch((e: any) => {
                if (!String(e?.message || '').includes('not modified')) throw e;
            });
        } else {
            await ctx.reply(screen.text, extra);
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

                            ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSizning profilingiz muvaffaqiyatli ulandi.\n\nEndi siz ${patient.clinic.name}dan eslatmalar va xabarlar olasiz.`, {
                                reply_markup: this.menuMarkup(await this.rolesFor(chatId, token))
                            });
                        } else {
                            ctx.reply("❌ Bemor topilmadi.");
                        }
                    } catch (e) {
                        console.error("Bot start error:", e);
                        ctx.reply("❌ Xatolik.");
                    }
                } else {
                    const roles = await this.rolesFor(chatId, token);
                    const name = roles.owner?.adminName
                        || (roles.doctor ? `Dr. ${roles.doctor.firstName} ${roles.doctor.lastName}` : '')
                        || roles.receptionist?.firstName || roles.patient?.firstName;
                    if (name) {
                        return ctx.reply(`👋 Assalomu alaykum, ${name}!\n\nKerakli bo'limni pastdagi menyudan tanlang.`, {
                            reply_markup: this.menuMarkup(roles)
                        });
                    }

                    ctx.reply("👋 Assalomu alaykum!\n\nKlinika botiga xush kelibsiz.\n\nIltimos, telefon raqamingizni yuboring:", {
                        reply_markup: this.menuMarkup(roles)
                    });
                }
            });

            // 2. Menyu — har doim qaytarib beriladi (kimdir yopib qo'ygan bo'lsa ham)
            bot.command('menu', async (ctx) => {
                const roles = await this.rolesFor(String(ctx.chat.id), token);
                ctx.reply('📋 Menyu', { reply_markup: this.menuMarkup(roles) });
            });

            // 3. Hisobot — faqat rahbar (klinika egasi) uchun.
            // "📊 Kunlik hisobot" — eski menyudagi tugma, foydalanuvchilarda hali turgan bo'lishi mumkin.
            const openReport = async (ctx: any) => {
                const chatId = String(ctx.chat.id);
                const clinic = await prisma.clinic.findFirst({ where: { telegramChatId: chatId, botToken: token } });
                if (!clinic) {
                    return ctx.reply("📊 Hisobot faqat klinika rahbari uchun.", {
                        reply_markup: this.menuMarkup(await this.rolesFor(chatId, token))
                    });
                }
                await this.showReport(ctx, clinic, reportCallback('d0', 'sum'), false);
            };
            bot.command(['hisobot', 'report'], openReport);
            bot.hears([BTN.report, LEGACY_REPORT_BTN], openReport);

            // Hisobot ichidagi tugmalar: davr, bo'lim, filial. Har safar rahbar ekani qayta tekshiriladi.
            bot.action(/^rp:/, async (ctx: any) => {
                const chatId = String(ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id || '');
                const clinic = chatId ? await prisma.clinic.findFirst({ where: { telegramChatId: chatId, botToken: token } }) : null;
                if (!clinic) return ctx.answerCbQuery("Hisobot faqat klinika rahbari uchun.");
                await ctx.answerCbQuery().catch(() => { });
                try {
                    await this.showReport(ctx, clinic, ctx.callbackQuery.data, true);
                } catch (e: any) {
                    console.error('Bot hisobot xatosi:', e?.message || e);
                }
            });

            // 4. Shifokor: bugungi / ertangi jadvali
            const doctorSchedule = (offsetDays: number) => async (ctx: any) => {
                const chatId = String(ctx.chat.id);
                const roles = await this.rolesFor(chatId, token);
                if (!roles.doctor) {
                    return ctx.reply("❌ Siz shifokor sifatida ulanmagansiz. Iltimos, telefon raqamingizni yuboring.", {
                        reply_markup: this.menuMarkup(roles)
                    });
                }
                const schedule = await this.generateDoctorSchedule(roles.doctor.id, roles.doctor.clinic.id, tashkentDateStr(offsetDays));
                ctx.reply(schedule, { parse_mode: 'Markdown', reply_markup: this.menuMarkup(roles) });
            };
            bot.hears(BTN.myToday, doctorSchedule(0));
            bot.hears(BTN.myTomorrow, doctorSchedule(1));

            // 4.1 Klinika jadvali va kassa — resepshn va rahbar
            const staffClinicId = async (chatId: string) => {
                const roles = await this.rolesFor(chatId, token);
                return { roles, clinicId: roles.owner?.id || roles.receptionist?.clinicId || null };
            };
            const clinicSchedule = (offsetDays: number) => async (ctx: any) => {
                const { roles, clinicId } = await staffClinicId(String(ctx.chat.id));
                if (!clinicId) return ctx.reply("❌ Kechirasiz, huquqingiz yo'q.", { reply_markup: this.menuMarkup(roles) });
                const schedule = await this.generateClinicSchedule(clinicId, tashkentDateStr(offsetDays));
                ctx.reply(schedule, { parse_mode: 'Markdown', reply_markup: this.menuMarkup(roles) });
            };
            bot.hears(BTN.clinicToday, clinicSchedule(0));
            bot.hears(BTN.clinicTomorrow, clinicSchedule(1));

            bot.hears(BTN.cash, async (ctx) => {
                const { roles, clinicId } = await staffClinicId(String(ctx.chat.id));
                if (!clinicId) return ctx.reply("❌ Kechirasiz, huquqingiz yo'q.", { reply_markup: this.menuMarkup(roles) });
                const cashReport = await this.generateClinicCashReport(clinicId);
                ctx.reply(cashReport, { parse_mode: 'HTML', reply_markup: this.menuMarkup(roles) });
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
                        if (clinic.ownerPhone) {
                            // Oxirgi 9 raqam: "+998 90 123-45-67" va "901234567" bir xil hisoblanadi
                            const ownerPhone = clinic.ownerPhone.replace(/\D/g, '').slice(-9);
                            if (ownerPhone.length === 9 && ownerPhone === phone.replace(/\D/g, '').slice(-9)) {
                                await prisma.clinic.update({
                                    where: { id: clinic.id },
                                    data: { telegramChatId: chatId }
                                } as any);
                                ctx.reply(`✅ Xush kelibsiz, ${clinic.adminName}!\n\nSiz ${clinic.name} egasi sifatida muvaffaqiyatli ulandingiz. Kunlik hisobot har kuni ${clinic.dailyReportEnabled ? `soat ${clinic.dailyReportTime} da` : '(hozir o\'chirilgan)'} keladi — vaqtini CRM Sozlamalaridan o'zgartirish mumkin. Istalgan payt esa "📊 Hisobot" tugmasini bosing.`, {
                                    reply_markup: this.menuMarkup(await this.rolesFor(chatId, token))
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

                            await ctx.reply(`✅ Xush kelibsiz, Dr. ${doctor.firstName} ${doctor.lastName}!\n\nSiz ${doctor.clinic.name} klinikasiga muvaffaqiyatli ulandi. Endi har kuni ertalab soat 8:00 da bugungi qabullaringiz haqida xabar olasiz. 🏥`, {
                                reply_markup: this.menuMarkup(await this.rolesFor(chatId, token))
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

                    // --- CHECK: Receptionist ---
                    const receptionists = await prisma.receptionist.findMany({
                        where: {
                            clinic: { botToken: token }
                        },
                        include: { clinic: true }
                    });

                    for (const rec of receptionists) {
                        const recPhone = rec.phone.replace(/\s/g, '').replace('+', '');
                        if (recPhone.slice(-9) === cleanPhone) {
                            await prisma.receptionist.updateMany({
                                where: {
                                    telegramChatId: chatId,
                                    clinicId: rec.clinicId,
                                    NOT: { id: rec.id }
                                },
                                data: { telegramChatId: null }
                            });

                            await prisma.receptionist.update({
                                where: { id: rec.id },
                                data: { telegramChatId: chatId }
                            });

                            ctx.reply(`✅ Xush kelibsiz, ${rec.firstName}!\n\nSiz ${rec.clinic.name} qabulxona xodimi sifatida muvaffaqiyatli ulandingiz.`, {
                                reply_markup: this.menuMarkup(await this.rolesFor(chatId, token))
                            });
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
                        ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSiz ${patient.clinic.name} bemori sifatida muvaffaqiyatli ulandingiz.`, {
                            reply_markup: this.menuMarkup(await this.rolesFor(chatId, token))
                        });
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

            // --- PATIENT MENU HANDLERS ---
            bot.hears('⏰ Keyingi qabulim', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const patient = await prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } } });
                if (!patient) return;

                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                const nextAppt = await prisma.appointment.findFirst({
                    where: {
                        patientId: patient.id,
                        date: { gte: todayStr },
                        status: { in: ['Confirmed', 'Pending'] }
                    },
                    orderBy: [
                        { date: 'asc' },
                        { time: 'asc' }
                    ]
                });

                if (nextAppt) {
                    ctx.reply(`📅 *Sizning navbatdagi qabulingiz:*\n\n👨‍⚕️ Shifokor: ${nextAppt.doctorName}\n📆 Sana: ${nextAppt.date}\n⏰ Vaqt: ${nextAppt.time}`, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("Sizda rejalashtirilgan qabullar yo'q. Yangi qabulga yozilish uchun '📅 Qabulga yozilish' tugmasidan foydalaning.");
                }
            });

            bot.hears('📋 Davolanish tarixim', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const patient = await prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } } });
                if (!patient) return;

                const history = await prisma.appointment.findMany({
                    where: {
                        patientId: patient.id,
                        status: 'Completed'
                    },
                    orderBy: { date: 'desc' },
                    take: 5
                });

                if (history.length > 0) {
                    let msg = `📋 *So'nggi tashriflaringiz:*\n\n`;
                    history.forEach((appt, idx) => {
                        msg += `${idx + 1}. ${appt.date} — ${appt.type} (${appt.doctorName})\n`;
                    });
                    ctx.reply(msg, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("Sizning davolanish tarixingiz bo'sh. Hali klinikamizda to'liq qabulda bo'lmagansiz.");
                }
            });

            bot.hears('💳 Mening hisobim', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const patient = await prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } } });
                if (!patient) return;

                const debts = await prisma.transaction.findMany({
                    where: {
                        patientId: patient.id,
                        status: 'Pending'
                    }
                });

                const totalDebt = debts.reduce((sum, t) => sum + t.amount, 0);

                if (totalDebt > 0) {
                    let msg = `💳 *Sizning to'lanmagan qarzingiz: ${totalDebt.toLocaleString()} UZS*\n\n`;
                    debts.forEach((t, idx) => {
                        msg += `• ${t.date}: ${t.service} - ${t.amount.toLocaleString()} UZS\n`;
                    });
                    ctx.reply(msg, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("💳 Sizda to'lanmagan qarzdorlik yo'q. Barcha xizmatlar uchun to'lov qilingan! Rahmat 😊");
                }
            });

            // --- BOOKING WIZARD START ---
            
            const startBookingFlow = async (ctx: any) => {
                const chatId = String(ctx.chat ? ctx.chat.id : (ctx.callbackQuery ? ctx.callbackQuery.message.chat.id : ''));
                if (!chatId) return;

                const patient = await prisma.patient.findFirst({
                    where: { telegramChatId: chatId, clinic: { botToken: token } },
                    include: { clinic: true }
                });
                
                if (!patient) {
                    const msg = "❌ Siz bemor sifatida ulanmagansiz. Iltimos, /start buyrug'ini bering yoki raqamingizni yuboring.";
                    return ctx.callbackQuery ? ctx.answerCbQuery(msg, {show_alert: true}) : ctx.reply(msg);
                }

                const doctors = await prisma.doctor.findMany({
                    where: { clinicId: patient.clinicId, status: 'Active' }
                });

                if (doctors.length === 0) {
                    const msg = "Hozircha shifokorlar topilmadi.";
                    return ctx.callbackQuery ? ctx.answerCbQuery(msg, {show_alert: true}) : ctx.reply(msg);
                }

                const buttons = doctors.map(d => ([{ text: `👨‍⚕️ Dr. ${d.firstName} ${d.lastName}`, callback_data: `bdc_${d.id}` }]));
                
                const text = "🩺 Qaysi shifokor qabuliga yozilmoqchisiz?";
                const opts = { reply_markup: { inline_keyboard: buttons } };
                
                if (ctx.callbackQuery) {
                    await ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts));
                } else {
                    await ctx.reply(text, opts);
                }
            };

            bot.hears('📅 Qabulga yozilish', startBookingFlow);
            bot.action('start_booking', startBookingFlow);

            bot.action(/^bdc_([^_]+)$/, async (ctx) => {
                const doctorId = ctx.match[1];
                const dateButtons = [];
                const today = new Date();
                
                for(let i=0; i<7; i++) {
                    const d = new Date(today);
                    d.setDate(today.getDate() + i);
                    
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${yyyy}-${mm}-${dd}`;
                    
                    const display = i === 0 ? "Bugun" : i === 1 ? "Ertaga" : `${dd}.${mm}.${yyyy}`;
                    
                    dateButtons.push([{ text: `📅 ${display}`, callback_data: `bdt_${doctorId}_${dateStr}` }]);
                }

                ctx.editMessageText("🗓 Qaysi kunga yozilmoqchisiz?", {
                    reply_markup: { inline_keyboard: dateButtons }
                });
            });

            bot.action(/^bdt_([^_]+)_(.+)$/, async (ctx) => {
                const doctorId = ctx.match[1];
                const dateStr = ctx.match[2];
                
                const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { clinic: true } });
                if (!doctor) return ctx.answerCbQuery("Shifokor topilmadi");

                // Bekor qilingan va "Kelmadi" qabul shifokor vaqtini band qilmaydi
                const appointments = await prisma.appointment.findMany({
                    where: { doctorId, date: dateStr, status: { notIn: ['Cancelled', 'No-Show'] } }
                });

                const startHour = (doctor as any).startHour ?? doctor.clinic.startHour ?? 8;
                const endHour = (doctor as any).endHour ?? doctor.clinic.endHour ?? 20;
                
                const availableSlots: string[] = [];
                for(let h = startHour; h < endHour; h++) {
                    for(let m of [0, 30]) {
                        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        const slotStartMins = h * 60 + m;
                        
                        let isOverlap = false;
                        for(const appt of appointments) {
                            const [ah, am] = appt.time.split(':').map(Number);
                            const apptStartMins = ah * 60 + am;
                            const apptEndMins = apptStartMins + (appt.duration || 30);
                            
                            if (slotStartMins >= apptStartMins && slotStartMins < apptEndMins) {
                                isOverlap = true;
                                break;
                            }
                        }
                        
                        const today = new Date();
                        const yyyy = today.getFullYear();
                        const mm = String(today.getMonth() + 1).padStart(2, '0');
                        const dd = String(today.getDate()).padStart(2, '0');
                        if (dateStr === `${yyyy}-${mm}-${dd}`) {
                            const currentMins = today.getHours() * 60 + today.getMinutes();
                            if (slotStartMins <= currentMins) {
                                isOverlap = true;
                            }
                        }

                        if (!isOverlap) {
                            availableSlots.push(timeStr);
                        }
                    }
                }

                if (availableSlots.length === 0) {
                    return ctx.editMessageText("❌ Bu kunda bo'sh vaqtlar qolmagan. Boshqa kunni tanlang.");
                }

                const buttons = [];
                for(let i=0; i < availableSlots.length; i+=3) {
                    const row = [];
                    for(let j=0; j<3 && i+j < availableSlots.length; j++) {
                        const t = availableSlots[i+j];
                        row.push({ text: t, callback_data: `btm_${doctorId}_${dateStr}_${t}` });
                    }
                    buttons.push(row);
                }

                ctx.editMessageText(`🗓 ${dateStr} sanasi uchun bo'sh vaqtlarni tanlang:`, {
                    reply_markup: { inline_keyboard: buttons }
                });
            });

            bot.action(/^btm_([^_]+)_([^_]+)_(.+)$/, async (ctx) => {
                if (!ctx.chat) return;
                const doctorId = ctx.match[1];
                const dateStr = ctx.match[2];
                const timeStr = ctx.match[3];
                const chatId = String(ctx.chat.id);

                const patient = await prisma.patient.findFirst({
                    where: { telegramChatId: chatId, clinic: { botToken: token } },
                    include: { clinic: true }
                });
                
                if (!patient) return ctx.answerCbQuery("Siz tizimda topilmadingiz.");

                const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
                if (!doctor) return ctx.answerCbQuery("Shifokor topilmadi.");

                const overlapping = await prisma.appointment.findMany({
                    where: { doctorId, date: dateStr, status: { notIn: ['Cancelled', 'No-Show'] } }
                });
                
                const [h, m] = timeStr.split(':').map(Number);
                const slotStartMins = h * 60 + m;
                let isOverlap = false;
                for(const appt of overlapping) {
                    const [ah, am] = appt.time.split(':').map(Number);
                    const apptStartMins = ah * 60 + am;
                    const apptEndMins = apptStartMins + (appt.duration || 30);
                    if (slotStartMins >= apptStartMins && slotStartMins < apptEndMins) {
                        isOverlap = true;
                        break;
                    }
                }
                
                if (isOverlap) {
                    return ctx.editMessageText("❌ Kechirasiz, bu vaqt allaqachon band qilindi. Boshqa vaqt tanlang.");
                }

                const clinic = patient.clinic as any;
                const prepaymentEnabled = clinic?.prepaymentEnabled ?? false;
                const prepaymentCard = clinic?.prepaymentCardNumber || '';
                const prepaymentAmount = clinic?.prepaymentAmount ?? 0;

                try {
                    const newAppointment = await prisma.appointment.create({
                        data: {
                            patientId: patient.id,
                            patientName: `${patient.firstName} ${patient.lastName}`,
                            doctorId: doctor.id,
                            doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
                            clinicId: patient.clinicId,
                            date: dateStr,
                            time: timeStr,
                            duration: 30,
                            status: prepaymentEnabled ? 'Pending' : 'Confirmed',
                            type: 'Konsultatsiya',
                            notes: prepaymentEnabled ? 'Telegram bot orqali yozildi (to\'lov kutilmoqda)' : 'Telegram bot orqali yozildi',
                            // Bot pastda chatda o'zi tasdiqlaydi — "Qabulga yozilganda"
                            // avtomatikasi ikkinchi xabar (yoki pullik SMS) yubormasin
                            bookedAt: null,
                        }
                    });

                    // Bemor o'zi yozildi — jadvalda kutilmagan odam paydo bo'lmasin
                    await notif.botAppointment(newAppointment);

                    if (prepaymentEnabled && prepaymentCard && prepaymentAmount > 0) {
                        this.pendingPayments.set(chatId, { appointmentId: newAppointment.id, clinicId: patient.clinicId });
                        await ctx.editMessageText(
                            `📋 Qabulingiz vaqtincha band qilindi.\n\n` +
                            `👨‍⚕️ Shifokor: Dr. ${doctor.firstName} ${doctor.lastName}\n` +
                            `📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}\n\n` +
                            `💳 *Oldindan to'lov talab etiladi!*\n\n` +
                            `To'lov miqdori: *${prepaymentAmount.toLocaleString()} so'm*\n` +
                            `Karta raqami: \`${prepaymentCard}\`\n\n` +
                            `Iltimos, yuqoridagi kartaga to'lov qiling va chekni (rasm yoki fayl sifatida) shu yerga yuboring. ` +
                            `Admin tekshirgach, qabulingiz tasdiqlanadi.`,
                            { parse_mode: 'Markdown' }
                        );
                    } else {
                        await ctx.editMessageText(`✅ Muvaffaqiyatli yozildingiz!\n\n👨‍⚕️ Shifokor: Dr. ${doctor.firstName} ${doctor.lastName}\n📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}\n\nKlinikada kutib qolamiz.`);
                        if (doctor.telegramChatId) {
                            const msg = `🔔 *YANGI QABUL (Telegram bot orqali)*\n\n👤 Bemor: ${patient.firstName} ${patient.lastName}\n📱 Telefon: ${patient.phone}\n📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}`;
                            await bot.telegram.sendMessage(doctor.telegramChatId, msg, { parse_mode: 'Markdown' }).catch(() => {});
                        }
                    }

                } catch(e: any) {
                    if (e.code === 'P2002') {
                        return ctx.editMessageText("❌ Sizda bu kunga allaqachon qabul mavjud. Boshqa kunni tanlang.");
                    }
                    console.error("Booking error:", e);
                    ctx.editMessageText("❌ Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
                }
            });

            // --- BOOKING WIZARD END ---

            // 7. Payment Receipt Handler (photo or document)
            const handlePaymentReceipt = async (ctx: any, fileId: string, isPhoto: boolean) => {
                if (!ctx.chat) return;
                const chatId = String(ctx.chat.id);
                const pending = this.pendingPayments.get(chatId);
                if (!pending) return;

                const { appointmentId, clinicId } = pending;

                const appointment = await prisma.appointment.findUnique({
                    where: { id: appointmentId },
                    include: { patient: true, doctor: true }
                });
                if (!appointment) return;

                const adminClinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
                if (!adminClinic?.telegramChatId) {
                    await ctx.reply("✅ Chekingiz qabul qilindi. Admin tez orada tasdiqlaydî.");
                    return;
                }

                const caption =
                    `💳 *TO'LOV CHEKI*\n\n` +
                    `👤 Bemor: ${appointment.patient.firstName} ${appointment.patient.lastName}\n` +
                    `📱 Telefon: ${appointment.patient.phone}\n` +
                    `👨‍⚕️ Shifokor: ${appointment.doctorName}\n` +
                    `📅 Sana: ${appointment.date}\n` +
                    `⏰ Vaqt: ${appointment.time}\n\n` +
                    `Qabulni tasdiqlaysizmi?`;

                const replyMarkup = {
                    inline_keyboard: [[
                        { text: "✅ Tasdiqlash", callback_data: `confirm_pay_${appointmentId}` },
                        { text: "❌ Rad etish", callback_data: `reject_pay_${appointmentId}` }
                    ]]
                };

                try {
                    if (isPhoto) {
                        await bot.telegram.sendPhoto(adminClinic.telegramChatId, fileId, {
                            caption,
                            parse_mode: 'Markdown',
                            reply_markup: replyMarkup
                        });
                    } else {
                        await bot.telegram.sendDocument(adminClinic.telegramChatId, fileId, {
                            caption,
                            parse_mode: 'Markdown',
                            reply_markup: replyMarkup
                        });
                    }
                    this.pendingPayments.delete(chatId);
                    await ctx.reply("✅ Chekingiz adminga yuborildi. Tez orada qabulingiz tasdiqlanadi.");
                } catch (e) {
                    console.error("Failed to forward payment receipt:", e);
                    await ctx.reply("❌ Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
                }
            };

            bot.on(message('photo'), async (ctx) => {
                const photos = ctx.message.photo;
                const fileId = photos[photos.length - 1].file_id;
                await handlePaymentReceipt(ctx, fileId, true);
            });

            bot.on(message('document'), async (ctx) => {
                const fileId = ctx.message.document.file_id;
                await handlePaymentReceipt(ctx, fileId, false);
            });

            // 8. Admin: Confirm or Reject Payment
            bot.action(/^confirm_pay_([\w-]+)$/, async (ctx) => {
                const appointmentId = ctx.match[1];
                try {
                    const appointment = await prisma.appointment.update({
                        where: { id: appointmentId },
                        data: { status: 'Confirmed', notes: 'Telegram bot orqali yozildi (to\'lov tasdiqlandi)' },
                        include: { patient: true, doctor: true }
                    });
                    await ctx.editMessageCaption(
                        `✅ *TASDIQLANDI*\n\n` +
                        `👤 Bemor: ${appointment.patient.firstName} ${appointment.patient.lastName}\n` +
                        `👨‍⚕️ Shifokor: ${appointment.doctorName}\n` +
                        `📅 ${appointment.date} soat ${appointment.time}`,
                        { parse_mode: 'Markdown' }
                    );
                    await ctx.answerCbQuery("✅ Qabul tasdiqlandi");

                    if (appointment.patient.telegramChatId) {
                        await bot.telegram.sendMessage(
                            appointment.patient.telegramChatId,
                            `✅ *Qabulingiz tasdiqlandi!*\n\n👨‍⚕️ Shifokor: ${appointment.doctorName}\n📅 Sana: ${appointment.date}\n⏰ Vaqt: ${appointment.time}\n\nKlinikada kutib qolamiz!`,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});
                    }
                } catch (e) {
                    console.error("Confirm payment error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi");
                }
            });

            bot.action(/^reject_pay_([\w-]+)$/, async (ctx) => {
                const appointmentId = ctx.match[1];
                try {
                    const appointment = await prisma.appointment.update({
                        where: { id: appointmentId },
                        data: { status: 'Cancelled', notes: 'To\'lov rad etildi' },
                        include: { patient: true, doctor: true }
                    });
                    // Vaqt bo'shadi — resepshn o'rniga boshqa bemorni yozishi mumkin
                    await notif.appointmentCancelled(appointment, 'To\'lov rad etildi');
                    await ctx.editMessageCaption(
                        `❌ *RAD ETILDI*\n\n` +
                        `👤 Bemor: ${appointment.patient.firstName} ${appointment.patient.lastName}\n` +
                        `👨‍⚕️ Shifokor: ${appointment.doctorName}\n` +
                        `📅 ${appointment.date} soat ${appointment.time}`,
                        { parse_mode: 'Markdown' }
                    );
                    await ctx.answerCbQuery("❌ Qabul rad etildi");

                    if (appointment.patient.telegramChatId) {
                        await bot.telegram.sendMessage(
                            appointment.patient.telegramChatId,
                            `❌ *Qabulingiz tasdiqlanmadi.*\n\nTo'lovingiz rad etildi. Iltimos, klinika bilan bog'laning yoki qaytadan urinib ko'ring.`,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});
                    }
                } catch (e) {
                    console.error("Reject payment error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi");
                }
            });

            // 6. Rating Action Handler
            bot.action(/^rate_(\d+)_([\w-]+)$/, async (ctx) => {
                const rating = parseInt(ctx.match[1]);
                const appointmentId = ctx.match[2];
                if (!ctx.chat) return;

                try {
                    const review = await prisma.review.upsert({
                        where: { appointmentId: appointmentId },
                        update: { rating: rating },
                        create: {
                            appointmentId: appointmentId,
                            rating: rating
                        }
                    });

                    // Baho qo'ng'iroqqa tushadi. Past baho shifokorga ham boradi:
                    // bemor hali ketmagan bo'lsa, tuzatish imkoni qoladi.
                    const rated = await prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        select: { clinicId: true, patientName: true, doctorId: true },
                    });
                    if (rated) {
                        await notif.newReview({
                            id: review.id,
                            clinicId: rated.clinicId,
                            patientName: rated.patientName,
                            rating,
                            comment: review.comment,
                            doctorId: rated.doctorId,
                        });
                    }

                    const stars = "⭐".repeat(rating);
                    await ctx.editMessageText(`✅ Bahoingiz uchun rahmat!\n\nSiz bizni ${rating} ball (${stars}) bilan baholadingiz. Kelajakda xizmatlarimizni yanada yaxshilashda davom etamiz.`);
                    await ctx.answerCbQuery("Rahmat!");
                } catch (e) {
                    console.error("Rating save error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi.");
                }
            });

            // Menyuda yo'q matn — menyuni qaytarib beramiz (yopilib qolgan bo'lsa ham).
            // Faqat shaxsiy chatda: guruhga qo'shilgan bot har xabarga javob bermasin.
            bot.on(message('text'), async (ctx) => {
                if (ctx.chat.type !== 'private') return;
                const roles = await this.rolesFor(String(ctx.chat.id), token);
                const known = roles.owner || roles.doctor || roles.receptionist || roles.patient;
                ctx.reply(known ? "Kerakli bo'limni pastdagi menyudan tanlang." : "Iltimos, telefon raqamingizni yuboring:", {
                    reply_markup: this.menuMarkup(roles)
                });
            });

            bot.launch().catch(err => console.error(`Bot launch failed for token ${token.substring(0, 5)}:`, err.message));
            // Telegram'ning "Menu" tugmasi — /menu har doim qo'l ostida
            bot.telegram.setMyCommands([
                { command: 'menu', description: 'Menyu' },
                { command: 'hisobot', description: 'Hisobot (klinika rahbari uchun)' },
            ]).catch((e: any) => console.error('setMyCommands xatosi:', e?.message));
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

    public async notifyClinicUser(
        clinicId: string,
        chatId: string,
        message: string,
        patientId?: string,
        type: string = 'Manual',
        replyMarkup?: any,
        logExtra?: { source?: string; ruleId?: string; refId?: string },
        sendOpts?: { parseMode?: 'HTML' }
    ): Promise<{ success: boolean; error?: string }> {
        const extra = {
            channel: 'telegram',
            source: logExtra?.source || 'manual',
            ruleId: logExtra?.ruleId || null,
            refId: logExtra?.refId || null,
            recipient: chatId,
        };

        // Har qanday muvaffaqiyatsizlik ham tarixga yozilishi shart: aks holda xabar
        // "yo'qoladi" va avtomatika dvigateli (ruleId+refId bo'yicha dedupe qiladi)
        // o'sha qabulga har 10 daqiqada qayta urinaveradi.
        const logFailure = async (error: string) => {
            await prisma.telegramLog.create({
                data: { clinicId, patientId, type, status: 'Failed', message, error, ...extra }
            }).catch((err: any) => console.error('Telegram log error:', err));
            return { success: false, error };
        };

        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return await logFailure('Bot sozlanmagan');

        const bot = this.bots.get(clinic.botToken);
        if (!bot) return await logFailure('Bot instance topilmadi (bot ishga tushmagan)');
        try {
            const sendExtra: any = {};
            if (replyMarkup) sendExtra.reply_markup = replyMarkup;
            if (sendOpts?.parseMode) sendExtra.parse_mode = sendOpts.parseMode;
            await bot.telegram.sendMessage(chatId, message, Object.keys(sendExtra).length ? sendExtra : undefined);
            await prisma.telegramLog.create({
                data: { clinicId, patientId, type, status: 'Sent', message, ...extra }
            }).catch((err: any) => console.error('Telegram log error:', err));
            return { success: true };
        } catch (e: any) {
            console.error(`Failed to send message in clinic ${clinicId}:`, e);
            return await logFailure(e.message || 'Telegram xatosi');
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
     * Generate today's appointment schedule for a clinic
     */
    public async generateClinicSchedule(clinicId: string, date: string = tashkentDateStr(0)): Promise<string> {
        const isToday = date === tashkentDateStr(0);
        const appointments = await prisma.appointment.findMany({
            where: {
                clinicId: clinicId,
                date,
                status: { notIn: ['Cancelled'] }
            },
            include: {
                patient: true,
                doctor: true
            },
            orderBy: { time: 'asc' }
        });

        if (appointments.length === 0) {
            return isToday ? `📅 *Bugun uchun qabullar yo'q.*` : `📅 *${date} uchun qabullar yo'q.*`;
        }

        let message = `📅 *${isToday ? 'Bugungi' : 'Ertangi'} qabullar (klinika bo'yicha)*\nSana: ${date}\n\n`;
        appointments.forEach((app: any, index: number) => {
            const docName = app.doctor ? `Dr. ${app.doctor.lastName}` : "Noma'lum";
            message += `${index + 1}. ⏰ *${app.time}* - 👤 ${app.patient.firstName} ${app.patient.lastName}\n`;
            message += `   🩺 Shifokor: ${docName}\n`;
            if (app.type) {
                message += `   🛠 Xizmat turkum: ${app.type}\n`;
            }
            message += `\n`;
        });

        return message;
    }

    /**
     * Generate today's cash report for a clinic
     */
    /**
     * Bugungi kassa (HTML). Ilgari bu yerda to'lanmagan (qarzga yozilgan) to'lovlar
     * ham "tushum" ga qo'shilardi — endi Moliya va hisobot bilan bir xil hisob.
     */
    public async generateClinicCashReport(clinicId: string): Promise<string> {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
        if (!clinic) return "Klinika topilmadi.";
        return (await buildReportScreen(clinic, 'd0', 'cash', '')).text;
    }

    /**
     * Generate today's appointment schedule for a specific doctor
     */
    public async generateDoctorSchedule(doctorId: string, clinicId: string, date?: string): Promise<string> {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tashkent',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const realToday = formatter.format(new Date());
        // Ertangi jadval so'ralganda — o'sha kun; nazorat ro'yxati esa doim bugungi holat
        const todayDateString = date || realToday;
        const dayWord = todayDateString === realToday ? 'BUGUNGI' : 'ERTANGI';

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

        // Nazoratga chaqirish kerak bo'lgan bemorlar: muddati kelgan yoki 7 kun ichida.
        // Shifokor ertalab kimga qo'ng'iroq qilish (yoki resepshnga aytish) kerakligini ko'radi.
        const weekAhead = formatter.format(new Date(Date.now() + 7 * 86400000));
        const dueRecalls = await prisma.recall.findMany({
            where: {
                clinicId: clinicId,
                doctorId: doctorId,
                status: { in: ['planned', 'reminded'] },
                dueDate: { lte: weekAhead }
            },
            include: { patient: true },
            orderBy: { dueDate: 'asc' }
        });
        let recallBlock = '';
        if (dueRecalls.length > 0) {
            recallBlock = `\n🔁 *NAZORATGA CHAQIRISH* — ${dueRecalls.length} ta bemor\n`;
            dueRecalls.slice(0, 10).forEach((r: any) => {
                const overdue = r.dueDate < realToday ? ' ⚠️' : '';
                const who = r.patient ? `${r.patient.lastName} ${r.patient.firstName}` : 'Bemor';
                const reminded = (r.kind === 'treatment' ? ' · davolash davomi' : ' · nazorat') + (r.status === 'reminded' ? ', xabar yuborilgan' : '');
                recallBlock += `• ${String(r.dueDate).split('-').reverse().join('.')}${overdue} — ${who}${r.reason ? ` (${r.reason})` : ''}${reminded}\n`;
            });
            if (dueRecalls.length > 10) recallBlock += `… yana ${dueRecalls.length - 10} ta\n`;
        }

        const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Shifokor';
        const clinicName = doctor?.clinic?.name || 'Klinika';

        if (appointments.length === 0) {
            return `📅 *${dayWord} JADVALINGIZ* (${todayDateString})\n\n` +
                `👨‍⚕️ ${doctorName} — ${clinicName}\n\n` +
                (dayWord === 'BUGUNGI' ? `✅ Bugun qabulingiz yo'q. Dam oling! 😊` : `✅ Ertaga qabulingiz yo'q.`) + recallBlock;
        }

        let message = `📅 *${dayWord} JADVALINGIZ* (${todayDateString})\n\n` +
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

        message += recallBlock + (dayWord === 'BUGUNGI' ? `\nXayrli kun deb tilaymiz! 🌟` : '');
        return message;
    }
    public async notifyReceptionists(clinicId: string, text: string) {
        try {
            const receptionists = await prisma.receptionist.findMany({
                where: { clinicId, telegramChatId: { not: null } }
            });
            for (const rec of receptionists) {
                if (rec.telegramChatId) {
                    await this.notifyClinicUser(clinicId, rec.telegramChatId, text);
                }
            }
        } catch(e) {
            console.error("Failed to notify receptionists:", e);
        }
    }
}

export const botManager = new BotManager();
