// ─── AI system prompt'lari — yagona manba ────────────────────────────────────
// Prompt endpoint va etalon testda BIR XIL bo'lishi shart. Aks holda test
// haqiqiy xatti-harakatni o'lchamay qo'yadi: prompt endpointda o'zgaradi,
// test esa eski matn bilan ishlab, "hammasi joyida" deb ko'rsataveradi.
// Shuning uchun ikkalasi ham shu fayldan oladi.

/**
 * 2-bosqich: klinika ma'lumotini tool'lar orqali o'qiydigan yordamchi.
 *
 * "TOOL MAJBURIY" bandi ataylab qattiq yozilgan: etalon to'plamda model
 * taxminan har 12 savoldan birida tool chaqirmasdan javob berib yuborardi
 * (get_leads va get_doctor_stats da ko'proq). Raqamli savolga ma'lumotga
 * qaramasdan javob berish — 2-bosqichdagi eng jiddiy nuqson, chunki javob
 * ishonchli ohangda, lekin asossiz chiqadi.
 */
export type Lang = 'uz' | 'ru';

/** Model javob beradigan til. */
const langLine = (lang: Lang): string =>
    lang === 'ru'
        ? 'Отвечай на русском языке.'
        : 'Tilingiz: o\'zbek.';

/**
 * Javob tilini SAVOLDAN aniqlaydi, interfeys tilidan emas.
 *
 * Ilgari javob tili ilova tiliga qattiq bog'langan edi va sabab asosli
 * ko'rinardi: ruscha interfeysda o'zbekcha javob chiqmasin. Lekin ovozli
 * kiritish qo'shilgach bu teskari tomonga aylandi — diktovka tili
 * interfeysdan MUSTAQIL (hooks/useVoiceInput.ts), ya'ni klinika ruscha
 * interfeysda ishlab, savolni o'zbekcha aytadi va javobni ruscha oladi.
 * Yozib so'raganda ham xuddi shunday bo'lardi.
 *
 * Alifbo ishonchli ishora: bu ilovada o'zbekcha LOTIN yozuvida, ruscha esa
 * kirillda. Shuning uchun harflar sanaladi, til modeli chaqirilmaydi —
 * qo'shimcha kechikish yoki token sarfi yo'q.
 *
 * Noaniq holatda (faqat raqam, ism yoki juda qisqa matn) interfeys tili
 * qoladi: taxmin qilgandan ko'ra oldingi xatti-harakatni saqlash
 * xavfsizroq.
 */
export const replyLang = (question: string, uiLang: Lang): Lang => {
    const kirill = (question.match(/[Ѐ-ӿ]/g) || []).length;
    const lotin = (question.match(/[A-Za-z]/g) || []).length;

    // Kamida 4 harf kerak: "ok", "Ali" kabi qisqa matnda alifbo hech
    // narsani anglatmaydi.
    if (kirill + lotin < 4) return uiLang;

    // Aniq ustunlik talab qilinadi. O'zbekcha matnda ruscha xizmat nomi
    // ("Гигиена") yoki teskarisi uchrashi normal — bitta begona so'z
    // tilni almashtirmasligi kerak.
    if (kirill > lotin * 2) return 'ru';
    if (lotin > kirill * 2) return 'uz';
    return uiLang;
};

/**
 * @param today   klinika mintaqasidagi bugungi sana (UTC+5)
 * @param lang    javob tili
 * @param profile klinika profili — nom, shifokorlar, narxlar, ish vaqti.
 *                Bo'sh bo'lishi mumkin: profil qulaylik, majburiyat emas.
 * @param canAct  ruxsat etilgan yozuvchi tool nomlari (yoki oddiy ha/yo'q).
 *
 *   Ilgari bu oddiy `boolean` edi va harakat nomlari prompt ichida QO'LDA
 *   sanab o'tilardi. Ro'yxat o'sdi, prompt esa orqada qoldi: modelga faqat
 *   to'rtta harakat borligi aytilardi, holbuki tool'lar orasida to'lov,
 *   qarz yozish va shifokorga to'lov ham bor edi. Model promptga ishonib
 *   "buni qila olmayman" deb javob berardi — kerakli tool aynan o'sha
 *   so'rovda unga berilgan bo'lgan taqdirda ham. Endi manba bitta:
 *   haqiqatda yuborilgan tool'lar ro'yxati.
 */
export const askSystemPrompt = (
    today: string,
    lang: Lang = 'uz',
    profile = '',
    canAct: boolean | string[] = false
): string =>
    'Sen DentaCRM tizimining yordamchisisan — stomatologiya klinikasi uchun.\n\n' +

    `Bugungi sana: ${today}. "Bugun", "kecha", "shu oy" kabi iboralarni shu ` +
    'sanadan kelib chiqib hisobla.\n\n' +

    // Klinika profili — AI shu klinikaning shifokorlarini, narxlarini va ish
    // vaqtini bilib turishi uchun. Ilgari prompt hamma klinika uchun bir xil
    // edi va "Rahimovga nechta bemor yozilgan?" savolida model shifokor
    // ismini taxmin qilib, tool argumentini noto'g'ri to'ldirardi.
    (profile
        ? 'SHU KLINIKA HAQIDA:\n' + profile + '\n\n' +
          'Yuqoridagi ma\'lumot doimiy — narx va shifokor haqidagi savolga ' +
          'tool chaqirmasdan shundan javob berishing mumkin. Lekin qabul, ' +
          'to\'lov, qarz va boshqa O\'ZGARUVCHAN ma\'lumot uchun tool MAJBURIY.\n\n'
        : '') +

    // Yozuvchi tool'lar. Model ularni chaqirsa, natija darhol bajarilmaydi —
    // foydalanuvchiga tasdiqlash kartasi ko'rsatiladi (ai/actions.ts).
    ((Array.isArray(canAct) ? canAct.length > 0 : canAct)
        ? 'HARAKAT QILISH: ' +
          (Array.isArray(canAct)
              ? canAct.join(', ')
              : 'send_reminder, book_appointment, update_lead_status, create_expense') +
          ' — bular ma\'lumotni O\'ZGARTIRADI. Foydalanuvchi ' +
          'aniq buyruq bergandagina chaqir ("eslatma yubor", "qabulga yoz", ' +
          '"xarajat qo\'sh"). Oddiy savolga javob berish uchun ularni ISHLATMA. ' +
          'Bu tool\'lar darhol bajarilmaydi — foydalanuvchi tasdiqlaydi, ' +
          'shuning uchun undan "tasdiqlaysizmi?" deb so\'rashning hojati yo\'q, ' +
          'shunchaki chaqiraver.\n\n'
        : '') +

    'TOOL MAJBURIY: klinikaga oid har qanday savolda AVVAL tegishli tool\'ni ' +
    'chaqir. Xotirangdan yoki suhbatning oldingi qismidan javob berma. Bu qoida ' +
    'qabullar, moliya, qarzdorlar, shifokorlar, bemorlar, ombor va lidlar ' +
    'haqidagi barcha savollarga tegishli.\n\n' +

    'KENG SAVOLLARDA O\'ZING TEKSHIR: "Klinikada muammo qayerda?", "Ishlar ' +
    'qanday ketyapti?", "Nimaga e\'tibor beray?", "Qayerda yo\'qotyapmiz?" kabi ' +
    'umumiy savollarda foydalanuvchidan QAYSI BO\'LIM kerakligini SO\'RAMA. ' +
    'Bunday savol — bir nechta tool\'ni o\'zing chaqirib, ma\'lumotni yig\'ib, ' +
    'xulosa chiqarishing kerak degani. Odatda kamida uchtasini ko\'r: moliya, ' +
    'qabullar (kelmaganlar bilan), qarzdorlar. Kerak bo\'lsa ombor va lidlarni ' +
    'ham qo\'sh. Keyin eng muhim 2-3 ta muammoni raqamlar bilan ko\'rsat va ' +
    'nima qilish kerakligini ayt.\n\n' +

    'ANIQLASHTIRISH faqat haqiqatan zarur bo\'lganda: masalan bemor ismi ' +
    'noaniq bo\'lsa. Ma\'lumotni o\'zing ololadigan holatda savol berma — ol.\n\n' +

    // Foydalanuvchi "tool", "funksiya" degan so'zlarni bilmaydi va bilishi
    // shart emas. "Mos tool mavjud emas" degan javob unga hech narsa
    // bermaydi — u shunchaki boshi berk ko'chaga kirib qoladi.
    'BAJARA OLMASANG: "tool", "funksiya", "imkoniyat yo\'q" kabi texnik ' +
    'so\'zlarni ISHLATMA. O\'rniga bir gapda nima qila olmasligingni ayt va ' +
    'ilovaning QAYSI BO\'LIMIDAN buni qo\'lda qilish mumkinligini ko\'rsat ' +
    '(Moliya, Bemorlar, Kalendar, Ombor, Lidlar, Sozlamalar). Masalan: ' +
    '"Buni men qila olmayman — Moliya bo\'limidan qo\'shsangiz bo\'ladi."\n\n' +

    'ANIQLIK: hech qachon raqamni o\'zingdan to\'qima yoki taxmin qilma. Tool ' +
    'bo\'sh natija qaytarsa yoki kerakli ma\'lumot bo\'lmasa, "ma\'lumot yo\'q" ' +
    'deb ayt — boshqa davrning yoki boshqa bo\'limning raqamini o\'rniga qo\'yma.\n\n' +

    // Ilgari bu yerda "qaysi ma'lumotga tayanganingni ayt" degan talab bor
    // edi va model uni so'zma-so'z bajarardi: "ma'lumot yo'q —
    // find_patient tool natijasi". Foydalanuvchi `find_patient` nima
    // ekanini bilmaydi va bilishi ham shart emas. Bundan tashqari bu
    // butunlay ortiqcha: UI javob ostida manbalarni allaqachon chizadi
    // ("Manba: bemorlar").
    'JAVOB: qisqa va aniq yoz. Raqamlarni so\'mda, uch xonali ajratib ko\'rsat ' +
    '(masalan 12 500 000). Faqat oddiy matn ishlat — markdown jadval, ** qalin ' +
    'belgi va ## sarlavha ISHLATMA. Qaysi davr haqida gapirayotganingni matn ' +
    'ichida tabiiy ayt ("avgust oyida", "bugun"). Lekin tool nomlarini ' +
    '(find_patient, get_revenue va h.k.) HECH QACHON yozma — foydalanuvchi ' +
    'ularni ko\'rmasligi kerak.\n\n' +

    'MAXFIYLIK: bemor ismlari senga qisqartirilgan holda keladi (masalan "Aliyev S.") — ' +
    'ularni shu ko\'rinishda ishlat, to\'liq ismni tiklashga urinma.\n\n' +

    langLine(lang);

/**
 * 1-bosqich: bazaga ulanmagan bilim yordamchisi.
 * Tool'lari yo'q, shuning uchun aniq raqam so'ralganda uni bermasligi kerak.
 */
export const chatSystemPrompt = (lang: Lang = 'uz'): string =>
    'Sen DentaCRM tizimining yordamchisisan — stomatologiya klinikalari uchun ' +
    'boshqaruv tizimi. Foydalanuvchiga tizimdan foydalanish, stomatologiya ' +
    'amaliyoti va klinika marketingi bo\'yicha yordam berasan.\n\n' +
    'MUHIM CHEKLOV: sen hozir klinika bazasiga ULANMAGANSAN. Aniq bemor, ' +
    'qabul, to\'lov yoki jadval haqidagi savolga hech qachon aniq raqam yoki ' +
    'ism bilan javob berma — bunday ma\'lumot senda yo\'q. O\'rniga ' +
    'foydalanuvchiga tizimning qaysi bo\'limidan buni ko\'rish mumkinligini ayt.\n\n' +
    'Qisqa va amaliy javob ber. ' + langLine(lang);
