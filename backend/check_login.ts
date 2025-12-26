import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const username = 'demoklinikaadmin';
    console.log(`Checking for clinic with username: ${username}`);

    const clinic = await prisma.clinic.findUnique({
        where: { username: username },
    });

    if (clinic) {
        console.log('Clinic found:', clinic);
    } else {
        console.log('Clinic not found.');
        // List all clinics to see what's available
        const allClinics = await prisma.clinic.findMany();
        console.log('All clinics:', allClinics.map(c => ({ username: c.username, password: c.password })));
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
