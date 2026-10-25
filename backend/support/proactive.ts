// ─── Oldindan ogohlantirish ──────────────────────────────────────────────────
// Odam yordamchi mijoz yozishini kutadi. Bot esa muammoni mijozdan oldin
// ko'ra oladi va o'zi yozadi:
//
//   • obuna tugashiga 7 / 3 / 1 kun qoldi, bugun tugaydi, tugadi
//   • klinikaning Telegram boti ishlamay qoldi (token xato va h.k.)
//   • oxirgi sutkada ko'p xabar ketmadi (SMS ulanmagan, balans tugagan...)
//   • yangi klinika sozlashni yarim yo'lda tashlab qo'ygan
//
// Faqat yordam botiga ulangan klinika rahbarlariga boradi (Telegram bot
// o'zi birinchi bo'lib yoza olmaydi) va faqat ish soatlarida. Har bir
// ogohlantirish bir marta ketadi — kalit DiagEvent'da saqlanadi.

import { createHash } from 'crypto';
import type { Diag } from '../diag';
import { BOT_CONFLICT_REASON } from '../diag';
import type { Messenger } from './flow';
import type { Identity, SupportUserRow } from './identity';
import type { SupportLang } from './productMap';
import type { SettingsStore } from './settings';
import { ddmmyyyy, tashkentHour, todayTashkent } from './text';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Bot tokeni to'qnashuvi (409) shuncha vaqt yangilanmasa — tugagan hisoblanadi */
export const CONFLICT_ONGOING_MS = 30 * 60 * 1000;
const EXPIRY_MARKS = [7, 3, 1, 0, -1];
const FAILED_SPIKE = 5;
/** Yangi klinikaga necha kundan keyin va necha kungacha eslatiladi */
const ONBOARDING_FROM_DAY = 2;
const ONBOARDING_TO_DAY = 7;

interface Alert {
    key: string;
    text: (lang: SupportLang) => string;
}

export interface ProactiveDeps {
    db: any;
    diag: Diag;
    identity: Identity;
    settings: SettingsStore;
    messenger: Messenger;
    /** Haqiqiy Telegram boti ishlayaptimi. Yo'q bo'lsa hech narsa "yuborilgan" deb belgilanmaydi */
    enabled?: () => boolean;
}

const daysUntil = (iso: string, today: string) => Math.round((Date.parse(iso) - Date.parse(today)) / DAY_MS);

export const createProactive = (deps: ProactiveDeps) => {
    const { db, diag, settings, messenger } = deps;
    const dedupeId = (key: string) => createHash('sha1').update('proactive|' + key).digest('hex');

    /** Bu ogohlantirish allaqachon yuborilganmi */
    const wasSent = async (key: string): Promise<boolean> => {
        try {
            return !!(await db.diagEvent.findUnique({ where: { id: dedupeId(key) } }));
        } catch {
            // Tekshirib bo'lmadi: yubormaymiz (aks holda har soatda takror ketardi)
            return true;
        }
    };

    /** Yuborilgan deb belgilaydi — FAQAT kamida bitta xabar haqiqatan yetib borgandan keyin */
    const markSent = async (key: string, clinicId: string): Promise<void> => {
        try {
            await db.diagEvent.create({
                data: { id: dedupeId(key), clinicId, kind: 'proactive', subject: key.split(':')[0], message: key, count: 1, lastAt: new Date() },
            });
        } catch (e: any) {
            console.warn('[support:proactive] belgilab bo\'lmadi:', e?.message);
        }
    };

    const alertsFor = async (clinicId: string, trustDays: number): Promise<Alert[]> => {
        const alerts: Alert[] = [];
        const today = todayTashkent();
        const c = await db.clinic.findUnique({
            where: { id: clinicId },
            select: { id: true, name: true, status: true, expiryDate: true, botToken: true, subscriptionStartDate: true },
        });
        if (!c || c.status !== 'Active') return alerts;

        // 1. Obuna muddati
        if (c.expiryDate) {
            const left = daysUntil(c.expiryDate, today);
            if (EXPIRY_MARKS.includes(left)) {
                const date = ddmmyyyy(c.expiryDate);
                alerts.push({
                    key: `sub:${c.id}:${c.expiryDate}:${left}`,
                    text: lang => {
                        if (lang === 'ru') {
                            if (left > 0) return `⏳ ${c.name}: подписка заканчивается ${date} (осталось дней: ${left}).\n\nПосле оплаты нажмите «💳 Я оплатил» и отправьте чек — продлю без ожидания.`;
                            if (left === 0) return `⏳ ${c.name}: подписка заканчивается сегодня.\n\nПосле оплаты нажмите «💳 Я оплатил» и отправьте чек.`;
                            return `🔒 ${c.name}: срок подписки истёк, приложение закрыто.\n\nНажмите «💳 Я оплатил» и отправьте чек${trustDays > 0 ? ' — на время проверки открою клинику' : ''}.`;
                        }
                        if (left > 0) return `⏳ ${c.name}: obuna ${date} da tugaydi (${left} kun qoldi).\n\nTo'lov qilgach «💳 To'lov qildim» tugmasini bosib chekni yuboring — kutmasdan uzaytiraman.`;
                        if (left === 0) return `⏳ ${c.name}: obuna bugun tugaydi.\n\nTo'lov qilgach «💳 To'lov qildim» tugmasini bosib chekni yuboring.`;
                        return `🔒 ${c.name}: obuna muddati tugadi, ilova yopildi.\n\n«💳 To'lov qildim» tugmasini bosib chekni yuboring${trustDays > 0 ? ' — tekshirilguncha klinikani ochib beraman' : ''}.`;
                    },
                });
            }
        }

        // 2. Klinika boti ishlamayapti
        if (c.botToken) {
            const ev = await diag.latest(c.id, ['bot_up', 'bot_down']);
            const age = ev ? Date.now() - new Date(ev.lastAt).getTime() : Infinity;
            // 409 deploy paytida ham chiqadi: yangi server ishga tushgach (bot_up) eskisi hali bir necha
            // soniya ishlab, o'zining bot_down'ini KEYIN yozadi — oxirgi hodisa bot_down bo'lib qolaveradi,
            // bot esa ishlab turadi. Haqiqiy to'qnashuv har qayta urinishda yangilanib turadi, shuning uchun
            // 409 faqat so'nggi daqiqalarda yangilangan bo'lsa ogohlantiriladi. Boshqa sabablar (token
            // noto'g'ri) o'zi tuzalmaydi — ular kun bo'yi ogohlantiriladi.
            const stillBroken = ev?.kind === 'bot_down'
                && age < (ev.message === BOT_CONFLICT_REASON ? CONFLICT_ONGOING_MS : DAY_MS);
            if (stillBroken) {
                alerts.push({
                    key: `botdown:${c.id}:${today}`,
                    text: lang => lang === 'ru'
                        ? `⚠️ Telegram-бот клиники не работает: ${ev.message}.\n\nПроверьте токен: Настройки → Интеграции → Telegram и SMS. Пока бот не работает, пациенты и врачи не получают сообщения в Telegram.`
                        : `⚠️ Klinikangizning Telegram boti ishlamayapti: ${ev.message}.\n\nTokenni tekshiring: Sozlamalar → Integratsiyalar → Telegram va SMS. Bot ishlamaguncha bemor va shifokorlarga Telegram xabarlari bormaydi.`,
                });
            }
        }

        // 3. Ko'p xabar ketmadi
        const failed: any[] = await db.telegramLog.findMany({
            where: { clinicId: c.id, status: 'Failed', sentAt: { gte: new Date(Date.now() - DAY_MS) } },
            select: { error: true, channel: true },
            take: 500,
        });
        if (failed.length >= FAILED_SPIKE) {
            const counts = new Map<string, number>();
            for (const f of failed) counts.set(f.error || '—', (counts.get(f.error || '—') || 0) + 1);
            const [reason] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            alerts.push({
                key: `fail:${c.id}:${today}`,
                text: lang => lang === 'ru'
                    ? `⚠️ За последние сутки не отправлено сообщений: ${failed.length}. Самая частая причина: «${reason}».\n\nНапишите мне «SMS не уходят» — проверю и подскажу, что исправить.`
                    : `⚠️ Oxirgi sutkada ${failed.length} ta xabar ketmadi. Eng ko'p sabab: «${reason}».\n\nMenga «SMS ketmayapti» deb yozing — tekshirib, nimani tuzatishni aytaman.`,
            });
        }

        // 4. Sozlash to'xtab qolgan yangi klinika
        if (c.subscriptionStartDate) {
            const age = -daysUntil(c.subscriptionStartDate, today);
            if (age >= ONBOARDING_FROM_DAY && age <= ONBOARDING_TO_DAY) {
                const [services, doctors, patients] = await Promise.all([
                    db.service.count({ where: { clinicId: c.id } }),
                    db.doctor.count({ where: { clinicId: c.id } }),
                    db.patient.count({ where: { clinicId: c.id } }),
                ]);
                const missingUz = [!services && 'xizmatlar va narxlar', !doctors && 'shifokorlar', !patients && 'bemorlar'].filter(Boolean);
                const missingRu = [!services && 'услуги и цены', !doctors && 'врачи', !patients && 'пациенты'].filter(Boolean);
                if (missingUz.length) {
                    alerts.push({
                        key: `onb:${c.id}`,
                        text: lang => lang === 'ru'
                            ? `👋 ${c.name}: настройка ещё не закончена — не добавлены: ${missingRu.join(', ')}.\n\nНапишите «с чего начать» — покажу по шагам. Старую базу пациентов можно загрузить из Excel: Пациенты → «Загрузить из Excel».`
                            : `👋 ${c.name}: sozlash hali tugamagan — qo'shilmagan: ${missingUz.join(', ')}.\n\n«Nimadan boshlay» deb yozing — qadam-baqadam ko'rsataman. Eski bemorlar bazasini Excel'dan yuklasa bo'ladi: Bemorlar → «Excel'dan yuklash».`,
                    });
                }
            }
        }
        return alerts;
    };

    return {
        alertsFor,

        /** Soatlik cron: ulangan rahbarlarga yangi ogohlantirishlarni yuboradi */
        async run(): Promise<{ sent: number }> {
            // Haqiqiy bot yo'q (token qo'yilmagan yoki DISABLE_BOTS=1): hech narsa yuborilmaydi va
            // eslatmalar "yuborilgan" deb yoqib yuborilmaydi
            if (deps.enabled && !deps.enabled()) return { sent: 0 };
            const s = await settings.get();
            const hour = tashkentHour();
            if (!s.proactive || hour < s.quietFrom || hour >= s.quietTo) return { sent: 0 };

            const owners: SupportUserRow[] = await db.supportUser.findMany({
                where: { role: 'CLINIC_ADMIN', blocked: false, clinicId: { not: null } },
            });
            const byClinic = new Map<string, SupportUserRow[]>();
            for (const o of owners) byClinic.set(o.clinicId as string, [...(byClinic.get(o.clinicId as string) || []), o]);

            let sent = 0;
            for (const [clinicId, people] of byClinic) {
                try {
                    for (const alert of await alertsFor(clinicId, s.trustDays)) {
                        if (await wasSent(alert.key)) continue;
                        let delivered = 0;
                        for (const p of people) {
                            const ok = await messenger.send(p.chatId, alert.text(p.lang), { lang: p.lang, keyboard: 'menu' });
                            // Botni to'xtatgan foydalanuvchini messenger o'zi belgilaydi
                            if (ok) delivered++;
                        }
                        if (delivered > 0) {
                            sent += delivered;
                            await markSent(alert.key, clinicId);
                        }
                    }
                } catch (e: any) {
                    console.error('[support:proactive]', clinicId, e?.message);
                }
            }
            return { sent };
        },
    };
};

export type Proactive = ReturnType<typeof createProactive>;
