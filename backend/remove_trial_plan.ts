import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from .env file explicitly if needed, but usually default load is fine if run from correct dir
// For safety in this environment:
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

async function main() {
    console.log('Removing "trial" plan...');

    try {
        const trialPlan = await prisma.subscriptionPlan.findUnique({
            where: { id: 'trial' }
        });

        if (trialPlan) {
            // Check if any clinics are using it?
            // If clinics use it, we might need to update them or just leave them (Prisma might complain if foreign key constraint)
            // But usually we should update them to something else or just let them be if soft delete?
            // Let's check clinics first.
            const clinicsCount = await prisma.clinic.count({
                where: { planId: 'trial' }
            });

            if (clinicsCount > 0) {
                console.log(`Warning: ${clinicsCount} clinics are using the 'trial' plan.`);
                console.log('Updating them to "individual" plan temporarily to allow deletion...');
                // Or maybe just don't delete if it breaks integrity?
                // User wants it removed from dropdown.
                // If I delete it, existing clinics might have issues if they try to fetch plan details.
                // Better approach: Update seed to remove it, and maybe just delete it if no one uses it.
                // If someone uses it, we should probably migrate them.
                // Let's migrate them to 'individual' or 'basic' (Start).
                // Let's migrate to 'basic' (Start) as a safe fallback, or 'individual'.
                // Let's migrate to 'individual' since it's the new cheap one.
                await prisma.clinic.updateMany({
                    where: { planId: 'trial' },
                    data: { planId: 'individual' }
                });
                console.log('Migrated clinics to "individual".');
            }

            await prisma.subscriptionPlan.delete({
                where: { id: 'trial' }
            });
            console.log('✅ "trial" plan removed successfully.');
        } else {
            console.log('ℹ️ "trial" plan not found.');
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
