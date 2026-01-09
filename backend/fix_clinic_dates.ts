import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '.env');
console.log('Loading env from:', envPath);
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

async function fixClinicDates() {
    try {
        console.log('🔧 Starting clinic dates migration...\n');

        const clinics = await prisma.clinic.findMany();
        console.log(`Found ${clinics.length} clinics\n`);

        let fixedCount = 0;

        for (const clinic of clinics) {
            const startDate = new Date(clinic.subscriptionStartDate);
            let correctExpiryDate: Date;

            if (clinic.subscriptionType === 'Trial') {
                // Trial = 14 days from start
                correctExpiryDate = new Date(startDate);
                correctExpiryDate.setDate(correctExpiryDate.getDate() + 14);
            } else {
                // Paid = 1 month from start
                correctExpiryDate = new Date(startDate);
                correctExpiryDate.setMonth(correctExpiryDate.getMonth() + 1);
            }

            const correctExpiryString = correctExpiryDate.toISOString().split('T')[0];

            // Check if we need to update
            if (clinic.expiryDate !== correctExpiryString) {
                console.log(`📝 Fixing: ${clinic.name}`);
                console.log(`   Type: ${clinic.subscriptionType}`);
                console.log(`   Start: ${clinic.subscriptionStartDate}`);
                console.log(`   Old Expiry: ${clinic.expiryDate}`);
                console.log(`   New Expiry: ${correctExpiryString}`);

                await prisma.clinic.update({
                    where: { id: clinic.id },
                    data: { expiryDate: correctExpiryString }
                });

                fixedCount++;
                console.log('   ✅ Fixed!\n');
            } else {
                console.log(`✓ ${clinic.name} - Already correct`);
            }
        }

        console.log(`\n✅ Migration complete! Fixed ${fixedCount} out of ${clinics.length} clinics.`);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

fixClinicDates();
