import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUBSCRIPTION_PLANS = [
    { id: 'individual', name: 'Individual', price: 190000, maxDoctors: 1, features: JSON.stringify(['1 tagacha shifokor', 'Telegram bot', 'O\'rnatib berish', 'O\'qitish', '14 kun bepul sinov (Freemium)']) },
    { id: 'basic', name: 'Start', price: 290000, maxDoctors: 3, features: JSON.stringify(['3 tagacha shifokor', 'Telegram bot', 'O\'rnatib berish', 'O\'qitish', '14 kun bepul sinov (Freemium)']) },
    { id: 'pro', name: 'Pro', price: 590000, maxDoctors: 10, features: JSON.stringify(['10 tagacha shifokor', 'Telegram bot', 'O\'rnatib berish', 'O\'qitish', '14 kun bepul sinov (Freemium)']) },
];

async function main() {
    for (const plan of SUBSCRIPTION_PLANS) {
        await prisma.subscriptionPlan.upsert({
            where: { id: plan.id },
            update: {
                name: plan.name,
                price: plan.price,
                maxDoctors: plan.maxDoctors,
                features: plan.features
            },
            create: plan
        });
    }

    // Since 'business' plan is removed/not needed for this update based on the image, we can just leave it as is or handle if necessary.
    console.log('Plans updated successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
