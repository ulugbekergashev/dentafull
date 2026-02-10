const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clinics = await prisma.clinic.findMany();
    console.log('ALL_CLINICS_DEBUG:', JSON.stringify(clinics, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
