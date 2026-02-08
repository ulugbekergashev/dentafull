const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupDuplicateTransactions() {
    try {
        console.log('Connecting to database...');

        // Fetch ALL transactions (not just Paid)
        const transactions = await prisma.transaction.findMany({
            orderBy: { date: 'asc' },
            select: {
                id: true,
                patientId: true,
                amount: true,
                date: true,
                service: true,
                status: true,
            }
        });

        console.log(`Found ${transactions.length} total transactions.`);

        // Group by signature: patientId|date|amount (simplified - without service to catch partial duplicates)
        const grouped = {};
        transactions.forEach(tx => {
            // Simplified key - same patient, same date, same amount
            const key = `${tx.patientId}|${tx.date}|${tx.amount}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(tx);
        });

        // Find duplicates to delete
        const idsToDelete = [];

        for (const key in grouped) {
            if (grouped[key].length > 1) {
                console.log(`\nDuplicate set found: ${key}`);
                console.log(`Count: ${grouped[key].length}`);

                grouped[key].forEach((tx, idx) => {
                    console.log(`  ${idx + 1}. ID: ${tx.id}, Service: "${tx.service?.substring(0, 50)}...", Status: ${tx.status}`);
                });

                // Keep the first one, mark rest for deletion
                const [keep, ...remove] = grouped[key];
                console.log(`Keeping: ${keep.id}`);

                remove.forEach(tx => {
                    idsToDelete.push(tx.id);
                });
            }
        }

        if (idsToDelete.length > 0) {
            console.log(`\n--- Deleting ${idsToDelete.length} duplicate transactions... ---`);
            const result = await prisma.transaction.deleteMany({
                where: {
                    id: { in: idsToDelete }
                }
            });
            console.log(`Deleted ${result.count} transactions.`);
        } else {
            console.log('\nNo duplicate transactions found to delete.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanupDuplicateTransactions();
