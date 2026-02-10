const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clinics = await prisma.clinic.findMany({
        select: {
            id: true,
            name: true,
            ownerPhone: true,
            phone: true,
            telegramChatId: true
        }
    });
    console.log('CLINICS_LIST:' + JSON.stringify(clinics));
}

main()
    .catch(err => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
