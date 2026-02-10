const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clinic = await prisma.clinic.findUnique({
        where: { username: 'demoklinikaadmin' }
    });
    console.log('CLINIC_BY_USERNAME:', JSON.stringify(clinic, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
