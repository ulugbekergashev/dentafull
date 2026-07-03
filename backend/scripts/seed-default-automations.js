// Har bir klinika uchun standart xabar shablonlari va avtomatik qoidalarni yaratadi.
// Eski hardcoded cronlar (ertangi qabul 18:00, tug'ilgan kun 09:00, kelmaganlar 20:00)
// o'rnini bosadi — klinika keyin ularni tahrirlashi/o'chirishi mumkin.
// Ishga tushirish: node scripts/seed-default-automations.js
// Idempotent: shu nomdagi qoida allaqachon mavjud klinikalar o'tkazib yuboriladi.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULTS = [
    {
        template: {
            name: 'Qabul eslatmasi',
            text: "🔔 Eslatma!\n\nHurmatli {bemor_ismi}, sizning {sana} kuni soat {vaqt} da {shifokor_ismi} qabuliga yozilganingizni eslatamiz.\n\nIltimos, kechikmasdan keling!\n\n{klinika_nomi}",
        },
        rule: { name: 'Qabuldan 24 soat oldin eslatma', trigger: 'before_appointment', hoursBefore: 24 },
    },
    {
        template: {
            name: "Tug'ilgan kun tabrigi",
            text: "🎉 Tug'ilgan kuningiz bilan!\n\nHurmatli {bemor_ismi}, sizni tug'ilgan kuningiz bilan chin dildan tabriklaymiz! Sog'lig'ingiz mustahkam bo'lsin! 🎂\n\n{klinika_nomi}",
        },
        rule: { name: "Tug'ilgan kun tabrigi", trigger: 'birthday', hoursBefore: null },
    },
    {
        template: {
            name: 'Kelmagan bemorga xabar',
            text: "❗️ Siz bugun {sana} soat {vaqt} dagi qabulga kelmadingiz.\n\nIltimos, klinika bilan bog'lanib keyingi qabul vaqtini aniqlang yoki qayta yoziling!\n\n{klinika_nomi}",
        },
        rule: { name: 'Kelmagan bemorga eslatma', trigger: 'no_show', hoursBefore: null },
    },
];

function channelFromMode(mode) {
    if (mode === 'sms_only') return 'sms';
    if (mode === 'both') return 'both';
    return 'telegram';
}

async function main() {
    const clinics = await prisma.clinic.findMany({ select: { id: true, name: true, notificationMode: true } });
    console.log(`Klinikalar: ${clinics.length} ta`);

    let created = 0;
    let skipped = 0;

    for (const clinic of clinics) {
        const channel = channelFromMode(clinic.notificationMode);
        for (const def of DEFAULTS) {
            const existingRule = await prisma.automationRule.findFirst({
                where: { clinicId: clinic.id, name: def.rule.name },
            });
            if (existingRule) { skipped++; continue; }

            let template = await prisma.messageTemplate.findFirst({
                where: { clinicId: clinic.id, name: def.template.name },
            });
            if (!template) {
                template = await prisma.messageTemplate.create({
                    data: { ...def.template, clinicId: clinic.id },
                });
            }

            await prisma.automationRule.create({
                data: {
                    name: def.rule.name,
                    trigger: def.rule.trigger,
                    hoursBefore: def.rule.hoursBefore,
                    channel,
                    templateId: template.id,
                    clinicId: clinic.id,
                },
            });
            created++;
        }
    }

    console.log(`Yaratildi: ${created} ta qoida, o'tkazib yuborildi: ${skipped} ta.`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
