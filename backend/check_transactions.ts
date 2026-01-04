import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTransactions() {
    try {
        // Get all transactions
        const allTransactions = await prisma.transaction.findMany({
            select: {
                id: true,
                patientName: true,
                status: true,
                amount: true,
                date: true,
                clinicId: true
            }
        });

        console.log('\n=== BARCHA TRANZAKSIYALAR ===');
        console.log(`Jami: ${allTransactions.length} ta\n`);

        // Group by status
        const byStatus: Record<string, number> = {};
        allTransactions.forEach(t => {
            byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        });

        console.log('Status bo\'yicha:');
        Object.entries(byStatus).forEach(([status, count]) => {
            console.log(`  ${status}: ${count} ta`);
        });

        // Show sample transactions
        console.log('\n=== NAMUNA TRANZAKSIYALAR ===');
        allTransactions.slice(0, 5).forEach(t => {
            console.log(`ID: ${t.id}`);
            console.log(`  Bemor: ${t.patientName}`);
            console.log(`  Status: ${t.status}`);
            console.log(`  Summa: ${t.amount}`);
            console.log(`  Sana: ${t.date}`);
            console.log(`  Klinika: ${t.clinicId}`);
            console.log('---');
        });

        // Check for Pending/Overdue
        const pendingOrOverdue = allTransactions.filter(t =>
            t.status === 'Pending' || t.status === 'Overdue'
        );

        console.log(`\n=== PENDING/OVERDUE TRANZAKSIYALAR ===`);
        console.log(`Jami: ${pendingOrOverdue.length} ta\n`);

        if (pendingOrOverdue.length > 0) {
            pendingOrOverdue.forEach(t => {
                console.log(`${t.patientName} - ${t.amount} UZS - ${t.status}`);
            });
        }

    } catch (error) {
        console.error('Xatolik:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTransactions();
