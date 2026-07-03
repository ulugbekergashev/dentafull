// Eski type='Expense' tranzaksiyalarni yangi Expense jadvaliga ko'chirish.
// Ishga tushirish: node scripts/migrate-expenses.js
// Avval backup JSON yoziladi, keyin ko'chirish bitta DB tranzaksiyasida bajariladi.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function mapCategory(service, patientName) {
    const text = `${service || ''} ${patientName || ''}`.toLowerCase();
    if (text.includes('ombor')) return 'Inventory';
    if (text.includes('oylik')) return 'Salary';
    if (text.includes('ijara')) return 'Rent';
    if (text.includes('kommunal')) return 'Utilities';
    if (text.includes('laborator') || text.includes('texnik')) return 'Lab';
    return 'Other';
}

async function main() {
    const oldExpenses = await prisma.transaction.findMany({ where: { type: 'Expense' } });
    console.log(`Topildi: ${oldExpenses.length} ta eski xarajat tranzaksiyasi`);
    if (oldExpenses.length === 0) {
        console.log("Ko'chiradigan narsa yo'q.");
        return;
    }

    const backupPath = path.join(__dirname, `backup-expense-transactions-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(oldExpenses, null, 2));
    console.log(`Backup yozildi: ${backupPath}`);

    const expenseRows = oldExpenses.map(tx => ({
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        category: mapCategory(tx.service, tx.patientName),
        title: (tx.service && tx.service !== 'Umumiy Xarajat' ? tx.service : tx.patientName) || 'Xarajat',
        clinicId: tx.clinicId,
    }));

    await prisma.$transaction([
        prisma.expense.createMany({ data: expenseRows, skipDuplicates: true }),
        prisma.transaction.deleteMany({ where: { id: { in: oldExpenses.map(t => t.id) } } }),
    ]);
    console.log(`Ko'chirildi: ${expenseRows.length} ta xarajat.`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
