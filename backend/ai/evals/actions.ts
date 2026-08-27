// Harakat qatlamining tekshiruvi: tasdiqlash tokeni, rol chegarasi,
// buyruq yo'naltirilishi va system prompt.
//
// Bazaga UMUMAN tegmaydi — shuning uchun uni istalgan vaqtda, hatto
// production DATABASE_URL yoqilgan holatda ham xavfsiz ishga tushirsa
// bo'ladi. Ishlatish: npm run eval:actions

process.env.JWT_SECRET = 'test-secret-only-for-this-check';

import { storePending, takePending } from '../pending';
import { actionsForQuestion } from '../router';
import { ACTION_DEFS, actionsForRole } from '../actions';

let ok = 0;
let fail = 0;
const check = (nom: string, shart: boolean, izoh = '') => {
    if (shart) { ok++; console.log(`  OK   ${nom}`); }
    else { fail++; console.log(`  XATO ${nom} ${izoh}`); }
};

const preview: any = {
    title: 'Qarz yozish',
    summary: 'Asror K. — 500 000 so\'m',
    items: [{ label: 'Summa', detail: '500 000 so\'m' }],
    confirmLabel: 'Qarzni yozish',
};
const ctx = { clinicId: 'clinic-1', userId: 'user-7', role: 'CLINIC_ADMIN' };
const args = { patientId: 'p1', amount: 500000, service: 'Koronka' };

console.log('\n1) Token: saqlash va ochish');
{
    const id = storePending('add_charge', args, preview, ctx);
    const r = takePending(id, { clinicId: 'clinic-1', userId: 'user-7' });
    check('token ochildi', !r.xato, r.xato || '');
    check('harakat nomi saqlandi', r.pending?.name === 'add_charge');
    check('argumentlar buzilmadi', JSON.stringify(r.pending?.args) === JSON.stringify(args));
    check('preview buzilmadi', r.pending?.preview?.summary === preview.summary);
    check('rol saqlandi', r.pending?.role === 'CLINIC_ADMIN');
}

console.log('\n2) Server qayta ishga tushdi (eng asosiy tuzatish)');
{
    // Xotiradagi Map bo'lganda aynan shu holatda tasdiqlash yo'qolardi.
    // Token esa jarayondan mustaqil: modulni qaytadan yuklab tekshiramiz.
    const id = storePending('add_charge', args, preview, ctx);
    delete require.cache[require.resolve('../pending')];
    const qayta = require('../pending');
    const r = qayta.takePending(id, { clinicId: 'clinic-1', userId: 'user-7' });
    check('qayta ishga tushgandan keyin ham ishlaydi', !r.xato, r.xato || '');
    check('argumentlar o\'sha-o\'sha', r.pending?.args?.amount === 500000);
}

console.log('\n3) Takroriy bajarish rad etiladi');
{
    const id = storePending('send_reminder', args, preview, ctx);
    const bir = takePending(id, { clinicId: 'clinic-1', userId: 'user-7' });
    const ikki = takePending(id, { clinicId: 'clinic-1', userId: 'user-7' });
    check('birinchisi o\'tdi', !bir.xato);
    check('ikkinchisi rad etildi', !!ikki.xato, '(o\'tib ketdi!)');
}

console.log('\n4) Buzib bo\'lmaydi');
{
    const id = storePending('add_charge', args, preview, ctx);
    const nuqta = id.lastIndexOf('.');
    const body = id.slice(0, nuqta);
    const sig = id.slice(nuqta + 1);

    // Summani 500 000 dan 50 000 000 ga o'zgartirishga urinish.
    const ochilgan = JSON.parse(
        Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    ochilgan.a.amount = 50000000;
    const yangiBody = Buffer.from(JSON.stringify(ochilgan), 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const kim = { clinicId: 'clinic-1', userId: 'user-7' };
    check('argument o\'zgartirilsa — rad', !!takePending(`${yangiBody}.${sig}`, kim).xato);
    check('imzo o\'zgartirilsa — rad', !!takePending(`${body}.AAAA`, kim).xato);
    check('bo\'sh token — rad', !!takePending('', kim).xato);
    check('axlat token — rad', !!takePending('abc.def', kim).xato);
}

console.log('\n5) Chegaralar');
{
    const id = storePending('add_charge', args, preview, ctx);
    check('boshqa foydalanuvchi — rad', !!takePending(id, { clinicId: 'clinic-1', userId: 'boshqa' }).xato);

    const id2 = storePending('add_charge', args, preview, ctx);
    check('boshqa klinika — rad', !!takePending(id2, { clinicId: 'clinic-2', userId: 'user-7' }).xato);

    // Muddat: 10 daqiqadan keyin.
    const id3 = storePending('add_charge', args, preview, ctx);
    const haqiqiy = Date.now;
    Date.now = () => haqiqiy() + 11 * 60 * 1000;
    const r = takePending(id3, { clinicId: 'clinic-1', userId: 'user-7' });
    Date.now = haqiqiy;
    check('muddati o\'tgan — rad', !!r.xato);
}

console.log('\n6) Yangi harakatlar ro\'yxatda');
{
    const nomlar = ACTION_DEFS.map(a => a.name);
    check('add_procedure qo\'shildi', nomlar.includes('add_procedure'));
    check('add_cash qo\'shildi', nomlar.includes('add_cash'));
    check('shifokor protsedura yoza oladi',
        actionsForRole('DOCTOR').some((a: any) => a.function.name === 'add_procedure'));
    check('shifokor kassaga tegmaydi',
        !actionsForRole('DOCTOR').some((a: any) => a.function.name === 'add_cash'));
    check('registrator kassaga yoza oladi',
        actionsForRole('RECEPTIONIST').some((a: any) => a.function.name === 'add_cash'));
}

console.log('\n7) Buyruq to\'g\'ri harakatga yo\'naltiriladi');
{
    const yona = (savol: string) =>
        actionsForQuestion('CLINIC_ADMIN', savol, actionsForRole).map((a: any) => a.function.name);

    const holatlar: [string, string][] = [
        ['Aliyevga plomba qo\'ydik', 'add_procedure'],
        ['Karimovaga 26-tishga koronka 800 ming', 'add_procedure'],
        ['пациенту поставили пломбу', 'add_procedure'],
        ['Rasulovaga professional tozalash qildik', 'add_procedure'],
        ['kassaga 200 ming soldim', 'add_cash'],
        ['kassadan 1 million olib ketishdi', 'add_cash'],
        ['в кассу положил 500 тысяч', 'add_cash'],
        ['инкассация 2 миллиона', 'add_cash'],
        // Eskilari buzilmaganini ham tekshiramiz.
        ['Aliyevga 500 ming qarz yozib qo\'y', 'add_charge'],
        ['bugun 200 ming ijara to\'ladik', 'create_expense'],
        ['qarzdorlarga eslatma yubor', 'send_reminder'],
    ];

    for (const [savol, kutilgan] of holatlar) {
        const natija = yona(savol);
        check(`"${savol}" -> ${kutilgan}`, natija.includes(kutilgan),
            `(chiqdi: ${natija.join(', ') || 'hech narsa'})`);
    }
}

console.log('\n8) System prompt harakatlarni haqiqiy ro\'yxatdan oladi');
{
    const { askSystemPrompt } = require('../prompts');
    const nomlar = ['send_reminder', 'add_procedure', 'add_cash', 'record_payment'];
    const p = askSystemPrompt('2026-08-27', 'uz', '', nomlar);
    for (const n of nomlar) check(`promptda ${n} bor`, p.includes(n));
    check('ruxsatsiz rolda harakat bo\'limi yo\'q',
        !askSystemPrompt('2026-08-27', 'uz', '', []).includes('HARAKAT QILISH'));
    check('ro\'yxatdan keyin bo\'sh joy tushib qolmagan',
        !p.includes('record_payment— bular'));
}

console.log(`\n─────────────\nOK: ${ok}   XATO: ${fail}\n`);
process.exit(fail ? 1 : 0);
