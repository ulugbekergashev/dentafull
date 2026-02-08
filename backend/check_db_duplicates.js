
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
    try {
        console.log('Connecting to database...');
        // Fetch all appointments
        const appointments = await prisma.appointment.findMany({
            orderBy: { date: 'desc' }
        });

        console.log(`Found ${appointments.length} total appointments.`);

        // Group by patientId and date
        const grouped = {};
        appointments.forEach(appt => {
            const key = `${appt.patientId}|${appt.date}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(appt);
        });

        // Find duplicates
        console.log('\n--- Duplicate Check ---');
        let duplicateCount = 0;
        for (const key in grouped) {
            if (grouped[key].length > 1) {
                duplicateCount++;
                console.log(`\nDuplicate found for key: ${key}`);
                console.log(`Count: ${grouped[key].length}`);
                grouped[key].forEach(a => {
                    console.log(`  ID: ${a.id}, Time: ${a.time}, CreatedAt: ${a.createdAt || 'N/A'}, Notes length: ${a.notes?.length}`);
                });
            }
        }

        if (duplicateCount === 0) {
            console.log('No duplicates found based on patientId + date.');
        } else {
            console.log(`\nFound ${duplicateCount} sets of duplicate appointments.`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDuplicates();
