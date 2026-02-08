
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Creating/Updating demo clinic...');

    // 1. Ensure a subscription plan exists
    let plan = await prisma.subscriptionPlan.findFirst();
    if (!plan) {
        plan = await prisma.subscriptionPlan.create({
            data: {
                id: 'standard-plan',
                name: 'Standard Plan',
                price: 0,
                maxDoctors: 10,
                features: 'All features'
            }
        });
        console.log('Created Standard Plan');
    }

    // 2. Create or Update the Clinic
    const clinicData = {
        name: 'Demo Klinika',
        adminName: 'Demo Admin',
        username: 'demoklinikaadmin',
        password: 'demoklinikaparol', // In a real app, hash this!
        phone: '+998901234567',
        status: 'Active',
        planId: plan.id,
        subscriptionStartDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(), // 1 year
        monthlyRevenue: 0,
        subscriptionType: 'Paid'
    };

    const existingClinic = await prisma.clinic.findUnique({
        where: { username: 'demoklinikaadmin' }
    });

    if (existingClinic) {
        console.log('Demo clinic already exists. Updating password...');
        await prisma.clinic.update({
            where: { id: existingClinic.id },
            data: { password: 'demoklinikaparol', status: 'Active' }
        });
    } else {
        console.log('Creating new demo clinic...');
        await prisma.clinic.create({
            data: clinicData
        });
    }

    console.log('✅ Success! You can now login with demoklinikaadmin / demoklinikaparol');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
