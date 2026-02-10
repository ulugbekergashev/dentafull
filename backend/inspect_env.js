async function main() {
    const keys = Object.keys(process.env);
    console.log('ENV_KEYS:', keys.filter(k => k.includes('BOT') || k.includes('TOKEN') || k.includes('TEL')).join(', '));
    if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log('TELEGRAM_BOT_TOKEN_FOUND: ...' + process.env.TELEGRAM_BOT_TOKEN.slice(-5));
    } else {
        console.log('TELEGRAM_BOT_TOKEN_NOT_FOUND');
    }
}

main();
