const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Telegraf } = require('telegraf');

async function main() {
    const clinics = await prisma.clinic.findMany({
        where: { NOT: { botToken: null } },
        select: { id: true, name: true, botToken: true }
    });

    console.log(`Found ${clinics.length} clinics with tokens.`);

    const uniqueTokens = [...new Set(clinics.map(c => c.botToken))];
    console.log(`Unique tokens: ${uniqueTokens.length}`);

    for (const token of uniqueTokens) {
        try {
            const bot = new Telegraf(token);
            const me = await bot.telegram.getMe();
            const linkedClinics = clinics.filter(c => c.botToken === token).map(c => c.name);
            console.log(`TOKEN: ${token.substring(0, 10)}... -> @${me.username} (${me.first_name}) | Clinics: ${linkedClinics.join(', ')}`);
        } catch (e) {
            console.log(`TOKEN: ${token.substring(0, 10)}... -> ERROR: ${e.message}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
