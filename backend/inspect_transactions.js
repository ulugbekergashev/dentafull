const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectRecentTransactions() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const transactions = await prisma.transaction.findMany({
            where: {
                date: today
            },
            orderBy: { date: 'desc' },
        });

        console.log('--- Recent 5 Transactions ---');
        console.log(JSON.stringify(transactions, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectRecentTransactions();
