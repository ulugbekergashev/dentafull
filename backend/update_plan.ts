import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
        console.log('No clinic found');
        return;
    }

    console.log('Updating clinic', clinic.id, 'to individual plan');
    await prisma.clinic.update({
        where: { id: clinic.id },
        data: { planId: 'individual' }
    });
    console.log('Updated.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
