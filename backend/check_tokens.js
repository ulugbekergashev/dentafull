const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { Telegraf } = require('telegraf');

async function main() {
    const clinics = await prisma.clinic.findMany({
        where: { NOT: { botToken: null } },
        select: { id: true, name: true, botToken: true }
    });

    const results = [];
    for (const clinic of clinics) {
        try {
            const bot = new Telegraf(clinic.botToken);
            const me = await bot.telegram.getMe();
            results.push({
                clinicName: clinic.name,
                botUsername: me.username,
                token: clinic.botToken
            });
        } catch (e) {
            results.push({
                clinicName: clinic.name,
                error: e.message,
                token: clinic.botToken
            });
        }
    }
    console.log('BOT_CHART:', JSON.stringify(results, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
