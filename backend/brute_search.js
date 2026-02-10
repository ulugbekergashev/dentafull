const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tables = ['Clinic', 'Patient', 'Doctor', 'Receptionist', 'TelegramLog', 'Appointment', 'Transaction'];
    const searchStr = 'crm';

    for (const table of tables) {
        const data = await prisma[table[0].toLowerCase() + table.slice(1)].findMany();
        const matches = data.filter(d => JSON.stringify(d).toLowerCase().includes(searchStr));
        if (matches.length > 0) {
            console.log(`MATCHES IN ${table}:`, JSON.stringify(matches, null, 2));
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
