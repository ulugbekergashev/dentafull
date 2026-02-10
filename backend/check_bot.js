const { Telegraf } = require('telegraf');

async function check() {
    const token = '8297181111:AAG2nOSoGvEAtmmoClN26pBZBtQo64MPM3Y';
    try {
        const bot = new Telegraf(token);
        const me = await bot.telegram.getMe();
        console.log('BOT_IDENTITY:', JSON.stringify(me, null, 2));
    } catch (e) {
        console.error('FAILED:', e.message);
    }
}

check();
