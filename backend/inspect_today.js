const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectTodayTransactions() {
    try {
        const today = new Date().toISOString().split('T')[0]; // 2026-02-08
        console.log(`Checking for transactions on ${today}...`);

        const transactions = await prisma.transaction.findMany({
            where: {
                date: {
                    gte: '2026-02-08' // Check strictly for today or later
                }
            }
        });

        console.log(`Found ${transactions.length} transactions for today.`);
        console.log(JSON.stringify(transactions, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectTodayTransactions();
