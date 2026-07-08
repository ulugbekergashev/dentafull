// Mavjud shifokorlar uchun yangi "Maosh turi" (salaryType) maydonini orqaga moslashtiradi:
// percentage > 0 bo'lgan, lekin salaryType hali 'none' (default) bo'lgan shifokorlarga
// salaryType='kpi' qo'yiladi — shunda ular Xarajat->Oylik->Shifokor oqimida darhol
// avtomatik hisoblash bilan ishlay boshlaydi, hech narsa qayta sozlash shart emas.
// Faqat update, destructive emas. Ishga tushirish: node scripts/backfill-doctor-salary-type.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const result = await prisma.doctor.updateMany({
        where: { salaryType: 'none', percentage: { gt: 0 } },
        data: { salaryType: 'kpi' },
    });
    console.log(`Yangilandi: ${result.count} ta shifokor (percentage>0) -> salaryType='kpi'`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
