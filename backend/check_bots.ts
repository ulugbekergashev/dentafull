
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const clinics = await prisma.clinic.findMany();
    console.log('Clinics:', clinics);

    for (const clinic of clinics) {
        console.log(`Clinic: ${clinic.name} (${clinic.id})`);
        console.log(`Bot Token: ${clinic.botToken ? 'Present' : 'Missing'}`);
        if (clinic.botToken) {
            console.log(`Bot Token Value: ${clinic.botToken.substring(0, 10)}...`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
