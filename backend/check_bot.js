const { Telegraf } = require('telegraf');

async function check() {
    const token = process.env.BOT_TOKEN;
    if (!token) { console.error('BOT_TOKEN kerak'); return; }
    try {
        const bot = new Telegraf(token);
        const me = await bot.telegram.getMe();
        console.log('BOT_IDENTITY:', JSON.stringify(me, null, 2));
    } catch (e) {
        console.error('FAILED:', e.message);
    }
}

check();
