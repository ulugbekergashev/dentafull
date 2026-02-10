const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const searchPhone = '8242992';

    const clinicsWithTokens = await prisma.clinic.findMany({
        where: { botToken: { not: null } },
        select: { id: true, name: true, ownerPhone: true, botToken: true }
    });

    const patients = await prisma.patient.findMany({
        where: {
            OR: [
                { phone: { contains: searchPhone } },
                { firstName: { contains: 'Ulug' } }
            ]
        },
        include: { clinic: { select: { name: true } } }
    });

    console.log('CLINICS_WITH_TOKENS:', JSON.stringify(clinicsWithTokens, null, 2));
    console.log('PATIENTS_FOUND:', JSON.stringify(patients, null, 2));
}

main()
    .catch(err => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
