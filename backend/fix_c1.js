const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const updated = await prisma.clinic.update({
        where: { id: 'c1' },
        data: {
            botToken: '8297181111:AAG2nOSoGvEAtmmoClN26pBZBtQo64MPM3Y',
            ownerPhone: '+998908242992'
        }
    });
    console.log('✅ Clinic c1 updated:', updated.name, updated.ownerPhone);
}

main().catch(console.error).finally(() => prisma.$disconnect());
