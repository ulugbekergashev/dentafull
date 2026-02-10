const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clinics = await prisma.clinic.findMany({
        select: { id: true, name: true, ownerPhone: true, botToken: true, phone: true }
    });
    console.log('ALL_CLINICS:' + JSON.stringify(clinics, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
