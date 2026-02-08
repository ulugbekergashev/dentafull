const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectRecentTransactions() {
    try {
        const transactions = await prisma.transaction.findMany({
            take: 5,
            orderBy: { date: 'desc' }, // or createdAt if available, but date is string.
            // Better to order by id or something if date is just YYYY-MM-DD
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
