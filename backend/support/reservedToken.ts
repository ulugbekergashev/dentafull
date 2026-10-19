// Yordam botining tokeni klinika botiga berilmasligi uchun.
//
// Telegram bitta tokenni bir vaqtda faqat bitta getUpdates'ga beradi. Klinika
// Sozlamalarga yordam botining (@dentacrmbot) tokenini kiritsa, klinika boti va
// yordam boti bir-birini uzib, ikkalasi ham tutilib ishlaydi (409), rahbarga esa
// "token ikki joyda ishlatilmoqda" ogohlantirishi har kuni keladi.

/** Tokenning bot raqami (ikki nuqtadan oldingi qism): token almashtirilsa ham bot o'sha */
const botIdOf = (token?: string | null): string => String(token || '').trim().split(':')[0];

export const isSupportBotToken = (token?: string | null): boolean => {
    const support = botIdOf(process.env.SUPPORT_BOT_TOKEN);
    return !!support && botIdOf(token) === support;
};

/** Foydalanuvchiga ko'rsatiladigan xabar (Sozlamalarda xato sifatida chiqadi) */
export const SUPPORT_TOKEN_REUSED =
    "Bu token DentaCRM yordam botiniki. Klinikangiz uchun @BotFather da alohida bot yarating va o'sha botning tokenini kiriting";
