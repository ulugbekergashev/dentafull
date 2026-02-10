const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clinics = await prisma.clinic.findMany();
    const results = clinics.filter(c => {
        const str = JSON.stringify(c).toLowerCase();
        return str.includes('crm') || str.includes('demo');
    });

    console.log('SEARCH_RESULTS:', JSON.stringify(results.map(r => ({
        id: r.id,
        name: r.name,
        username: r.username,
        botToken: r.botToken,
        ownerPhone: r.ownerPhone
    })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
