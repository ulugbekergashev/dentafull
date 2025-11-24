import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Connecting to database...');
        const plans = await prisma.subscriptionPlan.findMany();
        console.log('Plans count:', plans.length);
        console.log('Plans:', JSON.stringify(plans, null, 2));

        const clinics = await prisma.clinic.findMany();
        console.log('Clinics count:', clinics.length);
        console.log('Clinics:', JSON.stringify(clinics, null, 2));
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
