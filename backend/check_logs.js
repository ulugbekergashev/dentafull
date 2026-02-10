const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const logs = await prisma.telegramLog.findMany({
        where: {
            OR: [
                { message: { contains: 'Ulug' } },
                { message: { contains: '8242992' } },
                { error: { not: null } }
            ]
        },
        orderBy: { sentAt: 'desc' },
        take: 50,
        include: { clinic: { select: { name: true, botToken: true } } }
    });

    console.log('TELEGRAM_LOG_DEBUG:', JSON.stringify(logs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
