import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('Adding "Individual" plan...');

    const plan = {
        id: 'individual',
        name: 'Individual',
        price: 250000,
        maxDoctors: 1,
        features: JSON.stringify(['Yakka tartibda ishlash', 'Bemorlar bazasi', 'Moliya', '14 kunlik sinov'])
    };

    const existing = await prisma.subscriptionPlan.findUnique({
        where: { id: plan.id }
    });

    if (existing) {
        console.log('Plan already exists, updating...');
        await prisma.subscriptionPlan.update({
            where: { id: plan.id },
            data: plan
        });
    } else {
        console.log('Creating new plan...');
        await prisma.subscriptionPlan.create({
            data: plan
        });
    }

    console.log('✅ "Individual" plan added successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
