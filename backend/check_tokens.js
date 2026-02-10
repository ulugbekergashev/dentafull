const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Fragment of the token seen in Oilaviy Dental or from user's potential token
    const clinics = await prisma.clinic.findMany({
        where: { NOT: { botToken: null } },
        select: { id: true, name: true, botToken: true, ownerPhone: true }
    });
    console.log('CLINICS_WITH_TOKENS:' + JSON.stringify(clinics, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
