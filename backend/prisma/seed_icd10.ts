import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const icd10Codes = [
    // 1. Og'iz bo'shlig'i kasalliklari
    { code: 'K00', name: "Tish va jag' rivojlanishi va o'sishi buzilishlari", category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K00.0', name: 'Tishning anodontiyasi', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K00.2', name: "Tishning noto'g'ri chiqishi (masalan, don tishlar)", category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K02', name: 'Tish kariyesi', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K02.1', name: 'Dentin kariyesi', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K02.9', name: 'Aniqlanmagan kariyes', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K03', name: 'Tishning boshqa kasalliklari', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K03.6', name: 'Tishning singishi (yoriq va travma)', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K04', name: 'Tish ildizining kasalliklari', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K04.0', name: "Pulpa yallig'lanishi (pulpit)", category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K04.1', name: 'Periapikal absess', category: "Og'iz bo'shlig'i kasalliklari" },
    { code: 'K04.7', name: 'Tish ildizi rezorbsiyasi', category: "Og'iz bo'shlig'i kasalliklari" },

    // 2. Milk va periodontal kasalliklar
    { code: 'K05', name: "Gingivit va periodontal kasalliklar", category: "Milk va periodontal kasalliklar" },
    { code: 'K05.0', name: "Gingivit (yallig'lanish)", category: "Milk va periodontal kasalliklar" },
    { code: 'K05.2', name: 'Periodontit', category: "Milk va periodontal kasalliklar" },
    { code: 'K05.6', name: 'Periodontal absess', category: "Milk va periodontal kasalliklar" },
    { code: 'K06', name: "Milkning boshqa o'zgarishlari", category: "Milk va periodontal kasalliklar" },
    { code: 'K06.0', name: "Gingival o'sma (haddan tashqari o'sish)", category: "Milk va periodontal kasalliklar" },
    { code: 'K06.8', name: "Milk va alveolyar tog'ning boshqa buzilishlari", category: "Milk va periodontal kasalliklar" },

    // 3. Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar
    { code: 'K11', name: 'So\'lak bezlari kasalliklari', category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K11.0', name: "So'lak bezlari yallig'lanishi (sialadenit)", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K11.5', name: "So'lak bezlaridagi tosh (sialolitiaz)", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K12', name: "Stomatit va og'iz bo'shligidagi yaralar", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K12.0', name: "Og'izda og'riqli yaralar (aftalar)", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K12.1', name: "Og'izning boshqa stomatiti", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K13', name: "Og'iz bo'shligining boshqa kasalliklari", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K13.0', name: "Og'iz shilliq qavatining leykoplakiya holati", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },
    { code: 'K13.2', name: "Og'izda boshqa o'zgarishlar", category: "Og'iz bo'shlig'i shilliq qavati va boshqa kasalliklar" },

    // 4. Jag' va temporomandibulyar bo'g'im kasalliklari
    { code: 'K07', name: "Jag'ning rivojlanishi va shakli buzilishlari", category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },
    { code: 'K07.6', name: "Temporomandibulyar bo'g'im disfunksiyasi", category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },
    { code: 'K07.8', name: "Jag'ning boshqa buzilishlari", category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },
    { code: 'M26', name: 'Tish-yuz qiyofasidagi anomaliyalar', category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },
    { code: 'M26.0', name: "Jag'ning noto'g'ri o'rnatilishi", category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },
    { code: 'M26.4', name: "Temporomandibulyar bo'g'im artriti", category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },
    { code: 'Q35', name: "Tug'ma tanglay yo'qligi (tug'ma bo'shliq, tanglay yorilishi)", category: "Jag' va temporomandibulyar bo'g'im kasalliklari" },

    // 5. Tish protezlari va davolash bilan bog'liq asoratlar
    { code: 'K08', name: "Tish yo'qolishi va boshqa muammolar", category: "Tish protezlari va davolash bilan bog'liq asoratlar" },
    { code: 'K08.1', name: "Tishning yo'qolishi (travma yoki kasallik sababli)", category: "Tish protezlari va davolash bilan bog'liq asoratlar" },
    { code: 'K08.4', name: "Sun'iy protezlarning nosozligi", category: "Tish protezlari va davolash bilan bog'liq asoratlar" },
    { code: 'T88.5', name: 'Anesteziya yoki stomatologik muolajalar oqibatidagi noxush holatlar', category: "Tish protezlari va davolash bilan bog'liq asoratlar" },
];

async function main() {
    console.log('Start seeding ICD-10 codes with categories...');
    for (const item of icd10Codes) {
        await prisma.iCD10Code.upsert({
            where: { code: item.code },
            update: { name: item.name, category: item.category },
            create: {
                code: item.code,
                name: item.name,
                category: item.category,
            },
        });
    }
    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
