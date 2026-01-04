import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'postgresql://postgres:aleGfSHPFhpJTYnTMpPghOJGGHKIZmXi@switchyard.proxy.rlwy.net:56686/railway'
        }
    }
});

async function main() {
    console.log('Removing "trial" plan from PRODUCTION...');

    try {
        const trialPlan = await prisma.subscriptionPlan.findUnique({
            where: { id: 'trial' }
        });

        if (trialPlan) {
            const clinicsCount = await prisma.clinic.count({
                where: { planId: 'trial' }
            });

            if (clinicsCount > 0) {
                console.log(`Warning: ${clinicsCount} clinics are using the 'trial' plan.`);
                console.log('Updating them to "individual" plan temporarily to allow deletion...');
                await prisma.clinic.updateMany({
                    where: { planId: 'trial' },
                    data: { planId: 'individual' }
                });
                console.log('Migrated clinics to "individual".');
            }

            await prisma.subscriptionPlan.delete({
                where: { id: 'trial' }
            });
            console.log('✅ "trial" plan removed successfully from PRODUCTION.');
        } else {
            console.log('ℹ️ "trial" plan not found in PRODUCTION.');
        }
    } catch (error) {
        console.error('Error removing plan:', error);
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
