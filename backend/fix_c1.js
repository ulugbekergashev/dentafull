const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const updated = await prisma.clinic.update({
        where: { id: 'c1' },
        data: {
            botToken: process.env.BOT_TOKEN,
            ownerPhone: process.env.OWNER_PHONE
        }
    });
    console.log('✅ Clinic c1 updated:', updated.name, updated.ownerPhone);
}

main().catch(console.error).finally(() => prisma.$disconnect());
