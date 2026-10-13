// Bilim bazasining ikkinchi yarmi: xabarlar, Eskiz SMS, klinika boti, sozlamalar,
// ombor, laboratoriya, navbat, lidlar, kirish, obuna va umumiy savollar.
//
// Har bir tugma va maydon nomi koddagi bilan bir xil (i18n/translations.ts).
// Ruscha matnda o'zbekcha qolgan nomlar — ilovaning o'zida tarjima qilinmagan
// yozuvlar (ekranda ham shunday chiqadi), ataylab shunday qoldirilgan.
//
// Fayl 800 qatordan uzun: bu kod emas, mazmun (55 ta maqola, ikki tilda).

import type { SeedArticle } from './kbTypes';

const DESK = ['CLINIC_ADMIN', 'RECEPTIONIST'];
const OWNER = ['CLINIC_ADMIN'];
const CLINICAL = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];

/** Ko'p qatorli matnni chekinishlardan tozalaydi — maqolalar kodda o'qishli tursin */
const body = (text: string): string => text.split('\n').map(line => line.trim()).join('\n').trim();

export const KB_SEED_SETUP: SeedArticle[] = [
    // ─── Xabarlar: shablon, qoidalar, qo'lda yuborish ────────────────────────
    {
        id: 'messages.template-create',
        module: 'messages',
        roles: DESK,
        titleUz: "Xabar (SMS/Telegram) shablonini qanday yarataman?",
        titleRu: 'Как создать шаблон сообщения (SMS/Telegram)?',
        bodyUz: body(`
            Shablon — tayyor xabar matni. Avtomatik xabarlar faqat shablon orqali ketadi.
            1. Xabarlar → Shablonlar bo'limida «Yangi shablon» ni bosing.
            2. «Shablon nomi» ni yozing (masalan: Qabul eslatmasi).
            3. Matnni yozing. Ism, sana, vaqt turadigan joyga pastdagi tugmalar bilan o'zgaruvchi qo'ying: {bemor_ismi}, {bemor_familyasi}, {sana}, {vaqt}, {klinika_nomi}, {shifokor_ismi}, {qarz} (qarz summasi), {sabab} (nazorat sababi).
            4. «Saqlash» ni bosing.
            Xabar ketayotganda o'zgaruvchi o'rniga har bir bemorning o'z ma'lumoti qo'yiladi. Masalan: Hurmatli {bemor_ismi}, qabulingiz {sana} kuni {vaqt} da.
            Eskiz SMS ulangan bo'lsa, shablon o'zi Eskiz tekshiruviga yuboriladi.
            Shablon avtomatik qoidada ishlatilayotgan bo'lsa, uni o'chirib bo'lmaydi — avval qoidani o'chiring.
        `),
        bodyRu: body(`
            Шаблон — готовый текст сообщения. Автоматические сообщения уходят только по шаблону.
            1. В разделе Сообщения → Шаблоны нажмите «Новый шаблон».
            2. Заполните «Название шаблона» (например: Напоминание о приёме).
            3. Напишите текст. Туда, где должны стоять имя, дата, время, вставьте переменные кнопками под полем: {bemor_ismi} — имя, {bemor_familyasi} — фамилия, {sana} — дата, {vaqt} — время, {klinika_nomi} — клиника, {shifokor_ismi} — врач, {qarz} — сумма долга, {sabab} — причина контроля.
            4. Нажмите «Saqlash» (сохранить).
            При отправке вместо переменных подставляются данные каждого пациента.
            Если подключён Eskiz SMS, шаблон сам уходит на проверку в Eskiz.
            Шаблон, который используется в автоматическом правиле, удалить нельзя — сначала удалите правило.
        `),
        keywords: ['shablon', 'shablon yaratish', 'sms matni', 'xabar matni', 'oʻzgaruvchi', 'bemor_ismi', 'шаблон', 'шаблон смс', 'переменные', 'текст сообщения', 'шаблон яратиш', 'shablon qoshish'],
        paths: ['messages.templates'],
        guideId: 'task-sms',
    },
    {
        id: 'messages.auto-rule-create',
        module: 'messages',
        roles: DESK,
        titleUz: 'Avtomatik xabarni (qoidani) qanday sozlayman?',
        titleRu: 'Как настроить автоматическое сообщение (правило)?',
        bodyUz: body(`
            Avtomatik xabar qoida orqali ishlaydi: qachon va qaysi shablon ketishini bir marta belgilaysiz.
            1. Avval Xabarlar → Shablonlar bo'limida shablon yarating — qoida shablonsiz ishlamaydi.
            2. Xabarlar → Avtomatik bo'limida «Yangi qoida» ni bosing.
            3. «Qoida nomi» ni yozing va «Shablon» ni tanlang.
            4. «Qachon yuborilsin» ro'yxatidan hodisani tanlang (masalan: «Qabuldan oldin») va yonidagi muddatni belgilang.
            5. «Yuborish kanali» ni tanlang: «Avval Telegram» — botga ulangan bemorga bepul Telegram, qolganlarga SMS; «Telegram» — faqat bot; «SMS» — faqat pullik SMS; «Ikkalasi» — ikkalasi ham ketadi.
            6. «Saqlash» ni bosing. Qoida darhol ishlay boshlaydi.
            Ro'yxatdagi yashil tugmacha qoidani vaqtincha o'chirib-yoqadi. Xabarlar har 10 daqiqada tekshirib yuboriladi.
        `),
        bodyRu: body(`
            Автоматическое сообщение работает по правилу: один раз задаёте, когда и какой шаблон отправлять.
            1. Сначала создайте шаблон в разделе Сообщения → Шаблоны — без шаблона правило не работает.
            2. В разделе Сообщения → Автоматически нажмите «Новое правило».
            3. Заполните «Название правила» и выберите «Шаблон».
            4. В списке «Когда отправить» выберите событие (например: «Перед приёмом») и срок рядом.
            5. Выберите «Канал отправки»: «Сначала Telegram» — подключённым к боту бесплатно в Telegram, остальным SMS; «Telegram» — только бот; «SMS» — только платное SMS; «Ikkalasi» — уходит и то, и другое.
            6. Нажмите «Saqlash» (сохранить). Правило сразу начинает работать.
            Зелёный переключатель в списке временно выключает и включает правило. Сообщения проверяются и отправляются каждые 10 минут.
        `),
        keywords: ['avtomatik xabar', 'qoida', 'avtomatika', 'avtomatik sms', 'yangi qoida', 'kanal tanlash', 'автоматическое сообщение', 'правило', 'авторассылка', 'автоматик хабар', 'қоида', 'avto sms'],
        paths: ['messages.auto', 'messages.templates'],
        guideId: 'page-messages',
    },
    {
        id: 'messages.auto-appointment',
        module: 'messages',
        roles: DESK,
        titleUz: 'Qabul eslatmasi va «qabulga yozildingiz» xabari qanday ishlaydi?',
        titleRu: 'Как работают напоминание о приёме и сообщение «вы записаны»?',
        bodyUz: body(`
            Ikkalasi ham Xabarlar → Avtomatik bo'limida qoida qilib yoqiladi («Yangi qoida», «Qachon yuborilsin»).
            «Qabuldan oldin» — eslatma. «Necha soat oldin» ni tanlaysiz: 1, 2, 3, 6, 12 yoki 24 soat. Bekor qilingan yoki yakunlangan qabulga ketmaydi.
            «Qabulga yozilganda» — xodim bemorni yozgandan keyin «siz yozildingiz» xabari. Faqat 08:00–22:00 oralig'ida ketadi, kechki yozuv ertalab yuboriladi.
            Bilib qo'ying:
            - Qabul vaqtiga 1 soatdan kam qolganda yozilgan bemorga bu ikki xabar ketmaydi: u odatda klinikaning o'zida turgan bo'ladi.
            - Bemor Telegram bot orqali o'zi yozilgan bo'lsa, «Qabulga yozilganda» xabari ketmaydi — bot o'zi tasdiq yuboradi.
            - Bitta qabulga bitta qoidadan faqat bir marta xabar ketadi. Eslatma ketib bo'lgan qabul boshqa vaqtga ko'chirilsa, eslatma qayta ketmaydi.
        `),
        bodyRu: body(`
            Оба включаются правилом в разделе Сообщения → Автоматически («Новое правило», «Когда отправить»).
            «Перед приёмом» — напоминание. В поле «За сколько часов» выбираете 1, 2, 3, 6, 12 или 24 часа. На отменённые и завершённые приёмы не уходит.
            «При записи на приём» — после того как сотрудник записал пациента, уходит сообщение «вы записаны». Только с 08:00 до 22:00, вечерняя запись отправится утром.
            Важно знать:
            - Если пациента записали меньше чем за 1 час до приёма, оба сообщения не уходят: обычно он уже в клинике.
            - Если пациент записался сам через Telegram-бота, сообщение «При записи на приём» не уходит — бот подтверждает запись сам.
            - На один приём по одному правилу сообщение уходит один раз. Если напоминание уже ушло, а приём перенесли, повторно оно не отправится.
        `),
        keywords: ['eslatma', 'qabul eslatmasi', 'qabuldan oldin', 'yozilganda sms', 'bemorga eslatma ketmadi', '1 soat', 'напоминание', 'напоминание о приёме', 'смс при записи', 'не пришло напоминание', 'эслатма', 'eslatma ketmayapti'],
        paths: ['messages.auto'],
    },
    {
        id: 'messages.auto-greetings',
        module: 'messages',
        roles: DESK,
        titleUz: "Tug'ilgan kun tabrigi, yangi bemorga salom va to'lovdan keyin rahmat xabari",
        titleRu: 'Поздравление с днём рождения, приветствие нового пациента и благодарность после оплаты',
        bodyUz: body(`
            Har biri Xabarlar → Avtomatik bo'limida alohida qoida («Yangi qoida», «Qachon yuborilsin»):
            - «Tug'ilgan kun» — bemor kartasida «Tug'ilgan sana» to'ldirilgan faol bemorlarga, yiliga bir marta, 09:00–21:00 oralig'ida.
            - «Yangi bemor ro'yxatdan o'tdi» — bemor qo'shilgandan keyin: darhol, 1, 2 yoki 24 soatdan so'ng. Har bir bemorga bir marta.
            - «Qabuldan keyin» — yakunlangan qabuldan 2, 4, 24, 48 yoki 72 soat o'tgach (masalan: o'zingizni qanday his qilyapsiz?).
            - «To'lov qabul qilindi» — to'lovdan keyin: darhol, 1, 2 yoki 24 soatdan so'ng. Bu qoidada {qarz} o'rniga to'langan summa qo'yiladi.
            Har biriga avval mos matnli shablon yarating. Tunda xabar ketmaydi — vaqti kelgan xabar ertalab yuboriladi.
        `),
        bodyRu: body(`
            Каждое — отдельное правило в разделе Сообщения → Автоматически («Новое правило», «Когда отправить»):
            - «День рождения» — активным пациентам, у которых в карте заполнена «Дата рождения», раз в год, с 09:00 до 21:00.
            - «Yangi bemor ro'yxatdan o'tdi» (новый пациент) — после добавления пациента: сразу, через 1, 2 или 24 часа. Каждому пациенту один раз.
            - «После приёма» — через 2, 4, 24, 48 или 72 часа после завершённого приёма (например: как вы себя чувствуете?).
            - «Оплата принята» — после оплаты: сразу, через 1, 2 или 24 часа. В этом правиле вместо {qarz} подставляется оплаченная сумма.
            Для каждого сначала создайте шаблон с подходящим текстом. Ночью сообщения не уходят — они отправятся утром.
        `),
        keywords: ["tug'ilgan kun", 'tabrik', 'tugilgan kun sms', 'yangi bemor', 'rahmat xabari', "to'lovdan keyin", 'день рождения', 'поздравление', 'новый пациент', 'после оплаты', 'туғилган кун', 'tabriknoma'],
        paths: ['messages.auto'],
    },
    {
        id: 'messages.auto-no-show',
        module: 'messages',
        roles: DESK,
        titleUz: 'Kelmagan bemorga xabar qanday ketadi?',
        titleRu: 'Как уходит сообщение пациенту, который не пришёл?',
        bodyUz: body(`
            Qabul «Kelmadi» deb belgilanganda bemorga xabar ikki yo'ldan biri bilan ketadi.
            Qoida yo'q bo'lsa: tizim darhol tayyor matn yuboradi — qabulga kelmagani va klinika telefoni yoziladi. Botga ulangan bemorga Telegram orqali, qolganlarga SMS orqali (Eskiz ulangan bo'lsa).
            O'z matningiz ketishi uchun:
            1. Xabarlar → Shablonlar bo'limida shablon yarating.
            2. Xabarlar → Avtomatik bo'limida «Yangi qoida» ni bosing, «Qachon yuborilsin» da «Kelmagan bemor» ni tanlang.
            3. Kanalni tanlab saqlang.
            Shunda tayyor matn o'rniga sizning shabloningiz ketadi — o'sha kuni 20:00–22:00 oralig'ida. Telegram xabari ostida «📅 Qabulga yozilish» tugmasi chiqadi.
            Xabardagi klinika telefoni Sozlamalar → Klinika bo'limidan olinadi.
        `),
        bodyRu: body(`
            Когда приём отмечают «Не пришел», сообщение пациенту уходит одним из двух способов.
            Если правила нет: система сразу отправляет готовый текст — что пациент не пришёл на приём, и телефон клиники. Подключённым к боту — в Telegram, остальным — по SMS (если подключён Eskiz).
            Чтобы уходил ваш текст:
            1. Создайте шаблон в разделе Сообщения → Шаблоны.
            2. В разделе Сообщения → Автоматически нажмите «Новое правило» и в «Когда отправить» выберите «Пациент не пришёл».
            3. Выберите канал и сохраните.
            Тогда вместо готового текста уйдёт ваш шаблон — в тот же день с 20:00 до 22:00. Под сообщением в Telegram будет кнопка «📅 Qabulga yozilish» (записаться).
            Телефон клиники в сообщении берётся из раздела Настройки → Клиника.
        `),
        keywords: ['kelmadi', 'kelmagan bemor', 'bemor kelmadi sms', 'no show', 'kelmaganlarga xabar', 'не пришёл', 'пациент не пришел', 'неявка', 'смс неявка', 'келмади', 'kelmagan'],
        paths: ['messages.auto', 'settings.clinic'],
    },
    {
        id: 'messages.auto-debt-reminder',
        module: 'messages',
        roles: DESK,
        titleUz: 'Qarzdor bemorlarga eslatma avtomatik ketishi uchun nima qilaman?',
        titleRu: 'Как настроить автоматическое напоминание должникам?',
        bodyUz: body(`
            1. Xabarlar → Shablonlar bo'limida shablon yarating. Matnga {qarz} o'zgaruvchisini qo'ying — o'rniga bemorning umumiy qarzi yoziladi.
            2. Xabarlar → Avtomatik bo'limida «Yangi qoida» ni bosing.
            3. «Qachon yuborilsin» da «Qarz eslatmasi» ni tanlang.
            4. «Qarz necha kundan beri» ni belgilang: 3, 7, 14 yoki 30 kun. Qarzi shu muddatdan eski bemorlar tanlanadi.
            5. Kanalni tanlang va saqlang.
            Qanday ishlaydi: bitta bemorga oyiga ko'pi bilan bitta eslatma ketadi, faqat 10:00–19:00 oralig'ida. Bemor qarzini to'lasa, eslatma to'xtaydi.
            Bir martalik eslatma kerak bo'lsa, Xabarlar → Qo'lda bo'limida «Qarzi bor» filtri bilan yuboring.
        `),
        bodyRu: body(`
            1. Создайте шаблон в разделе Сообщения → Шаблоны. Вставьте в текст переменную {qarz} — вместо неё подставится общий долг пациента.
            2. В разделе Сообщения → Автоматически нажмите «Новое правило».
            3. В «Когда отправить» выберите «Напоминание о долге».
            4. В поле «Сколько дней долгу» выберите 3, 7, 14 или 30 дней. Будут выбраны пациенты, у которых долг старше этого срока.
            5. Выберите канал и сохраните.
            Как это работает: одному пациенту уходит не больше одного напоминания в месяц, только с 10:00 до 19:00. Когда пациент оплатит долг, напоминания прекратятся.
            Если нужно разовое напоминание, отправьте его из раздела Сообщения → Вручную с фильтром «Есть долг».
        `),
        keywords: ['qarz eslatmasi', 'qarzdor', 'qarzdorlarga sms', 'qarz', 'qarzni eslatish', 'долг', 'напоминание о долге', 'должники', 'смс должникам', 'қарз', 'qarzdorlik'],
        paths: ['messages.auto', 'messages.manual'],
    },
    {
        id: 'messages.auto-recall',
        module: 'messages',
        roles: DESK,
        titleUz: 'Uzoq kelmagan bemorlarni va nazorat vaqti kelganlarni avtomatik chaqirish',
        titleRu: 'Как автоматически приглашать давно не приходивших и тех, кому пора на контроль',
        bodyUz: body(`
            Xabarlar → Avtomatik bo'limida buning uchun uch xil qoida bor:
            - «Uzoq kelmaganlarni qaytarish» — oxirgi tashrifidan 3, 6, 9 yoki 12 oy o'tgan faol bemorlarga. Bemor kelmaguncha oyiga bir marta takrorlanadi. Hech qachon kelmagan bemorga ketmaydi.
            - «Nazorat vaqti (qayta tashrif)» — shifokor qabulda qayta kelish muddatini belgilagan bemorlarga, muddatdan 0, 3, 7 yoki 14 kun oldin. Bu qoida va «Nazorat eslatmasi» shabloni birinchi nazorat belgilanganda o'zi yaratiladi (7 kun oldin, avval Telegram, keyin SMS) — uni shu yerda o'zgartirasiz yoki o'chirasiz.
            - «Nazorat: javob bo'lmadi (qayta eslatma)» — eslatma ketgan, lekin bemor yozilmagan bo'lsa, muddat o'tganidan 3, 7 yoki 14 kun keyin yana bir marta. O'zi yoqilmaydi.
            Telegram xabari ostida «📅 Qabulga yozilish» tugmasi bo'ladi.
        `),
        bodyRu: body(`
            В разделе Сообщения → Автоматически для этого есть три правила:
            - «Возврат давно не приходивших» — активным пациентам, у которых с последнего визита прошло 3, 6, 9 или 12 месяцев. Повторяется раз в месяц, пока пациент не придёт. Тем, кто ни разу не был, не уходит.
            - «Время контроля (повторный визит)» — пациентам, которым врач на приёме назначил срок повторного визита, за 0, 3, 7 или 14 дней до срока. Это правило и шаблон «Nazorat eslatmasi» создаются сами при первом назначенном контроле (за 7 дней, сначала Telegram, потом SMS) — здесь их можно изменить или удалить.
            - «Контроль: нет ответа (повторное напоминание)» — если напоминание ушло, а пациент не записался: ещё один раз через 3, 7 или 14 дней после срока. Само не включается.
            Под сообщением в Telegram будет кнопка «📅 Qabulga yozilish» (записаться).
        `),
        keywords: ['nazorat', 'qayta tashrif', 'uzoq kelmagan', 'profilaktika', 'bemorni qaytarish', 'nazorat eslatmasi', 'контроль', 'повторный визит', 'давно не приходил', 'возврат пациентов', 'назорат', 'qayta chaqirish'],
        paths: ['messages.auto'],
    },
    {
        id: 'messages.auto-scheduled',
        module: 'messages',
        roles: DESK,
        titleUz: "Bemorlar guruhiga jadval bo'yicha xabar yuborish (har hafta, har oy)",
        titleRu: 'Рассылка группе пациентов по расписанию (каждую неделю, каждый месяц)',
        bodyUz: body(`
            Masalan: har dushanba qarzdorlarga yoki har oyning 1-kuni yarim yildan beri kelmaganlarga.
            1. Xabarlar → Shablonlar bo'limida shablon yarating.
            2. Xabarlar → Avtomatik bo'limida «Yangi qoida» ni bosing.
            3. «Qachon yuborilsin» da «Jadval bo'yicha (segmentga)» ni tanlang.
            4. Pastda vaqtni belgilang: «Har kuni», «Har hafta» (hafta kuni bilan) yoki «Har oy» (oyning kuni bilan) va soatni — 08:00 dan 20:00 gacha.
            5. «Kimga yuborilsin» da filtrlar bilan bemorlar guruhini tanlang, masalan «Qarzi bor» yoki «Oxirgi tashrif».
            6. Kanalni tanlab saqlang.
            Har bir bemorga bitta davrda bir marta ketadi. Guruh har safar o'sha kungi holat bo'yicha yig'iladi: qarzini to'lagan bemor keyingi safar ro'yxatga tushmaydi.
        `),
        bodyRu: body(`
            Например: каждый понедельник должникам или 1-го числа тем, кто не приходил полгода.
            1. Создайте шаблон в разделе Сообщения → Шаблоны.
            2. В разделе Сообщения → Автоматически нажмите «Новое правило».
            3. В «Когда отправить» выберите «По расписанию (на сегмент)».
            4. Ниже задайте время: «Каждый день», «Каждую неделю» (с днём недели) или «Каждый месяц» (с числом) и час — с 08:00 до 20:00.
            5. В блоке «Кому отправить» фильтрами выберите группу пациентов, например «Есть долг» или «Последний визит».
            6. Выберите канал и сохраните.
            Каждому пациенту сообщение уходит один раз за период. Группа каждый раз собирается заново по состоянию на этот день: пациент, оплативший долг, в следующий раз в список не попадёт.
        `),
        keywords: ['jadval', 'kampaniya', 'har hafta sms', 'segment', 'guruhga xabar', 'reklama sms', 'рассылка по расписанию', 'кампания', 'сегмент', 'каждую неделю', 'жадвал', 'aksiya xabari'],
        paths: ['messages.auto'],
    },
    {
        id: 'messages.quiet-hours',
        module: 'messages',
        roles: DESK,
        titleUz: 'Nega avtomatik xabar kechasi ketmadi yoki faqat ertalab ketdi?',
        titleRu: 'Почему автоматическое сообщение не ушло ночью или ушло только утром?',
        bodyUz: body(`
            Bemorlarni tunda bezovta qilmaslik uchun har bir avtomatik xabar turi faqat o'z vaqtida ketadi:
            - Qabulga yozilganda, to'lov qabul qilindi: 08:00–22:00
            - Tug'ilgan kun, qabuldan keyin, yangi bemor: 09:00–21:00
            - Nazorat vaqti: 09:00–20:00
            - Qarz eslatmasi, uzoq kelmaganlar, nazorat qayta eslatmasi: 10:00–19:00
            - Kelmagan bemor: 20:00–22:00 (22:00 dan keyin belgilangan «Kelmadi» uchun xabar ketmaydi)
            Qolgan turlarda vaqtdan tashqarida yuzaga kelgan xabar yo'qolmaydi — navbatdagi ruxsat etilgan soatda yuboriladi.
            «Qabuldan oldin» eslatmasida chegara yo'q: u qabul vaqtiga bog'liq. Qabul 08:00 da, eslatma 2 soat oldin bo'lsa, xabar 06:00 da ketadi.
            Bu vaqtlarni o'zgartirib bo'lmaydi. Qoida oynasida tanlangan tur uchun «Yuborish vaqti» pastda yozib qo'yiladi.
            Qo'lda yuborilgan xabarlar darhol ketadi.
        `),
        bodyRu: body(`
            Чтобы не беспокоить пациентов ночью, каждый вид автоматических сообщений уходит только в своё время:
            - При записи на приём, оплата принята: 08:00–22:00
            - День рождения, после приёма, новый пациент: 09:00–21:00
            - Время контроля: 09:00–20:00
            - Напоминание о долге, давно не приходившие, повторное напоминание о контроле: 10:00–19:00
            - Пациент не пришёл: 20:00–22:00 (если «Не пришел» отметили после 22:00, сообщение не уйдёт)
            В остальных случаях сообщение, возникшее вне этих часов, не теряется — оно уйдёт в ближайшее разрешённое время.
            У напоминания «Перед приёмом» ограничения нет: оно привязано ко времени приёма. Если приём в 08:00, а напоминание за 2 часа, оно уйдёт в 06:00.
            Изменить эти часы нельзя. В окне правила внизу показано «Yuborish vaqti» (время отправки) для выбранного вида.
            Сообщения, отправленные вручную, уходят сразу.
        `),
        keywords: ['tunda sms', 'kechasi xabar', 'yuborish vaqti', 'nega ertalab ketdi', 'tinch soatlar', 'soat nechida ketadi', 'ночью смс', 'время отправки', 'тихие часы', 'почему утром', 'кечаси', 'xabar kech ketdi'],
        paths: ['messages.auto'],
    },
    {
        id: 'messages.manual-send',
        module: 'messages',
        roles: DESK,
        titleUz: "Bir nechta bemorga qo'lda xabar (ommaviy SMS/Telegram) yuborish",
        titleRu: 'Как отправить сообщение сразу нескольким пациентам (массовая рассылка)?',
        bodyUz: body(`
            1. Xabarlar → Qo'lda bo'limini oching.
            2. Kanalni tanlang: «Avval Telegram» (botga ulanganlarga bepul, qolganlarga SMS), «Telegram» yoki «Faqat SMS».
            3. «Kimga yuborish?» da filtrlar bilan bemorlarni tanlang. Pastda nechta bemorga yetib borishi va nechta SMS ketishi ko'rinadi. «To'liq ro'yxat» da keraksiz bemor belgisini olib tashlash mumkin.
            4. «Xabar matni» ni yozing yoki tayyor shablonni tanlang. «Bemor ko'radigan matn» da natijani tekshiring.
            5. «Avval o'zimga test yuborish» bilan sinab ko'ring.
            6. Eng pastdagi «... ta bemorga yuborish» tugmasini bosib, tasdiqlang.
            Yuborish orqa fonda ketadi, natijasi Xabarlar → Tarix bo'limida ko'rinadi. Oldingisi tugamaguncha yangisini boshlab bo'lmaydi.
            Lotin harflarida bitta SMS 160 belgi; kirill yoki maxsus belgi bo'lsa — 70 belgi. Uzun matn bir nechta SMS bo'lib hisoblanadi.
        `),
        bodyRu: body(`
            1. Откройте раздел Сообщения → Вручную.
            2. Выберите канал: «Сначала Telegram» (подключённым к боту бесплатно, остальным SMS), «Telegram» или «Только SMS».
            3. В блоке «Кому отправить?» выберите пациентов фильтрами. Ниже видно, до скольких пациентов сообщение дойдёт и сколько уйдёт SMS. Открыв «Полный список», можно снять галочку с ненужных.
            4. Напишите «Текст сообщения» или выберите готовый шаблон. Проверьте результат в блоке «Текст, который увидит пациент».
            5. Проверьте на себе: «Сначала отправить тест себе».
            6. Нажмите самую нижнюю кнопку «... ta bemorga yuborish» (отправить) и подтвердите.
            Отправка идёт в фоне, результат виден в разделе Сообщения → История. Пока не закончилась предыдущая рассылка, новую начать нельзя.
            Латиницей в одно SMS помещается 160 знаков, кириллицей или со спецсимволами — 70. Длинный текст считается как несколько SMS.
        `),
        keywords: ['ommaviy sms', 'hammaga sms', "qo'lda yuborish", 'rassilka', 'bemorlarga xabar yuborish', 'aksiya sms', 'массовая рассылка', 'рассылка', 'отправить всем', 'смс всем пациентам', 'оммавий', 'hammaga xabar'],
        paths: ['messages.manual', 'messages.history'],
    },

    // ─── "Xabar ketmadi": har bir sabab alohida ──────────────────────────────
    {
        id: 'sms.not-sent',
        module: 'messages',
        roles: DESK,
        titleUz: 'SMS yoki Telegram xabar ketmayapti — nima qilay?',
        titleRu: 'Не уходит SMS или сообщение в Telegram — что делать?',
        bodyUz: body(`
            Ketmagan xabarning sababini tizim o'zi yozib qo'yadi.
            1. Xabarlar → Tarix bo'limini oching va «Xato» filtrini bosing.
            2. Xabar ostidagi qizil yozuvni o'qing — bu sabab. Masalan: «Eskiz SMS ulanmagan», «Bemor botga ulanmagan», «Telefon raqami noto'g'ri formatda».
            3. Sababni tuzating: Eskiz yoki botni ulang, bemor raqamini to'g'rilang.
            4. Xabarni belgilang (yoki «Hammasini tanlash») va «Tanlanganlarni qayta yuborish» ni bosing. Avtomatik xabar o'zi qayta urinmaydi.
            Belgilar: «Yuborildi» — jo'natildi; «Xato» — ketmadi; «Qayta yuborilgan» — qayta jo'natilgan, yangi natijasi alohida qatorda.
            Tarixda xabar umuman yo'q bo'lsa, u yuborilmagan: Xabarlar → Avtomatik bo'limida qoida yoqilganini va shabloni borligini tekshiring.
            Qizil yozuvni shu yerga yuboring — nima qilishni aytaman.
        `),
        bodyRu: body(`
            Причину, по которой сообщение не ушло, система записывает сама.
            1. Откройте раздел Сообщения → История и нажмите фильтр «Ошибка».
            2. Прочитайте красную строку под сообщением — это причина. Например: «Eskiz SMS ulanmagan», «Bemor botga ulanmagan», «Telefon raqami noto'g'ri formatda».
            3. Устраните причину: подключите Eskiz или бота, исправьте номер пациента.
            4. Отметьте сообщение (или «Выбрать все») и нажмите «Tanlanganlarni qayta yuborish» (отправить повторно). Автоматическое сообщение само повторно не отправляется.
            Отметки: «Отправлено» — ушло; «Ошибка» — не ушло; «Повторно отправлено» — отправлено заново, новый результат в отдельной строке.
            Если сообщения в истории нет совсем, оно не отправлялось: проверьте в разделе Сообщения → Автоматически, что правило включено и у него есть шаблон.
            Пришлите красную строку сюда — подскажу, что делать.
        `),
        keywords: ['sms ketmayapti', 'xabar ketmadi', 'sms bormayapti', 'sms kelmayapti', 'qayta yuborish', 'xabarlar tarixi', 'смс не уходит', 'не отправляется', 'сообщение не дошло', 'ошибка отправки', 'смс кетмаяпти', 'sms ishlamayapti'],
        paths: ['messages.history', 'messages.auto'],
    },
    {
        id: 'sms.not-connected',
        module: 'messages',
        roles: DESK,
        titleUz: 'Xato: «Eskiz SMS ulanmagan» yoki «Eskiz token topilmadi»',
        titleRu: 'Ошибка: «Eskiz SMS ulanmagan» или «Eskiz token topilmadi»',
        bodyUz: body(`
            SMS klinikaning Eskiz.uz hisobi orqali ketadi. Bu xatolar hisob ulanmaganini yoki ulanish uzilganini bildiradi.
            «Eskiz SMS ulanmagan» — Eskiz login va paroli hali kiritilmagan.
            «Eskiz token topilmadi. Iltimos SMS sozlamalarini tekshiring.» — tizim Eskizga kira olmadi: masalan, Eskizdagi parol o'zgargan yoki Eskiz vaqtincha javob bermagan.
            Tuzatish:
            1. Sozlamalar → Integratsiyalar → Telegram va SMS bo'limini oching.
            2. «Eskiz.uz SMS» qismida «Eskiz.uz Kabinet Email» va «Eskiz.uz Kabinet Paroli» ni qaytadan kiriting.
            3. «Saqlash va Ulanishni Tekshirish» ni bosing. Yonida «Ulangan» yozuvi chiqishi kerak.
            4. Xabarlar → Tarix bo'limida xato xabarlarni tanlab, qayta yuboring.
            Eskiz hisobingiz bo'lmasa, avval eskiz.uz saytida ro'yxatdan o'ting. Eskizsiz ham botga ulangan bemorlarga Telegram xabarlari ketaveradi.
        `),
        bodyRu: body(`
            SMS отправляются через аккаунт клиники в Eskiz.uz. Эти ошибки означают, что аккаунт не подключён или подключение пропало.
            «Eskiz SMS ulanmagan» — логин и пароль Eskiz ещё не введены.
            «Eskiz token topilmadi. Iltimos SMS sozlamalarini tekshiring.» — система не смогла войти в Eskiz: например, в Eskiz сменили пароль или он временно не ответил.
            Как исправить:
            1. Откройте Настройки → Интеграции → Telegram и SMS.
            2. В блоке «Eskiz.uz SMS» заново введите «Email кабинета Eskiz.uz» и «Пароль от кабинета Eskiz.uz».
            3. Нажмите «Сохранить и проверить подключение». Рядом должно появиться «Подключено».
            4. В разделе Сообщения → История отметьте сообщения с ошибкой и отправьте повторно.
            Если аккаунта Eskiz нет, сначала зарегистрируйтесь на eskiz.uz. Без Eskiz сообщения в Telegram подключённым к боту пациентам всё равно уходят.
        `),
        keywords: ['eskiz ulanmagan', 'eskiz token', 'sms ulanmagan', 'eskiz xato', 'token topilmadi', 'eskiz parol', 'eskiz не подключен', 'токен эскиз', 'смс не подключено', 'эскиз уланмаган', 'eskiz ishlamayapti'],
        paths: ['settings.messaging', 'messages.history'],
    },
    {
        id: 'sms.no-phone',
        module: 'messages',
        roles: DESK,
        titleUz: "Xato: «Bemorda telefon raqami yo'q»",
        titleRu: "Ошибка: «Bemorda telefon raqami yo'q»",
        bodyUz: body(`
            Bu nimani anglatadi: xabar SMS orqali ketishi kerak edi, lekin bemor kartasida telefon raqami bo'sh.
            Tuzatish:
            1. Bemorlar bo'limida bemorni toping va kartasini oching.
            2. Tahrirlashda «Telefon» maydoniga raqamni kiriting — bo'sh joysiz, masalan +998901234567 — va saqlang.
            3. Xabarlar → Tarix bo'limida «Xato» filtrini oching, o'sha xabarni belgilab, «Tanlanganlarni qayta yuborish» ni bosing.
            Ommaviy xabar yuborishdan oldin tekshirish: Xabarlar → Qo'lda bo'limida «... ta bemorga yetib bo'lmaydi» qatorini oching — raqami yo'q bemorlar sababi bilan ko'rinadi («Telefon raqami yo'q»).
        `),
        bodyRu: body(`
            Что это значит: сообщение должно было уйти по SMS, но в карте пациента не указан телефон.
            Как исправить:
            1. В разделе Пациенты найдите пациента и откройте его карту.
            2. При редактировании введите номер в поле «Телефон» — без пробелов, например +998901234567 — и сохраните.
            3. В разделе Сообщения → История откройте фильтр «Ошибка», отметьте это сообщение и нажмите «Tanlanganlarni qayta yuborish» (отправить повторно).
            Как проверить заранее перед рассылкой: в разделе Сообщения → Вручную раскройте строку «... ta bemorga yetib bo'lmaydi» (до стольких пациентов не дойдёт) — там видны пациенты без номера с причиной («Telefon raqami yo'q»).
        `),
        keywords: ["telefon raqami yo'q", 'raqam yoq', 'bemor raqami kiritilmagan', 'telefon kiritilmagan', 'нет номера телефона', 'нет телефона', 'номер не указан', 'телефон рақами йўқ', 'raqamsiz bemor'],
        paths: ['patients', 'messages.history'],
    },
    {
        id: 'sms.bad-phone-format',
        module: 'messages',
        roles: DESK,
        titleUz: "Xato: «Telefon raqami noto'g'ri formatda»",
        titleRu: "Ошибка: «Telefon raqami noto'g'ri formatda»",
        bodyUz: body(`
            Bu nimani anglatadi: bemor kartasidagi raqam O'zbekiston mobil raqamiga o'xshamaydi, shuning uchun SMS jo'natilmadi. Xato matnida raqamning o'zi ham yoziladi.
            To'g'ri ko'rinishlar: +998901234567, 998901234567 yoki 901234567 (9 ta raqam). Eng ishonchlisi — bo'sh joysiz +998901234567.
            Ko'p uchraydigan sabablar: raqam to'liq emas yoki ortiqcha raqam bor; bitta maydonga ikkita raqam yozilgan; chet el raqami kiritilgan — SMS faqat O'zbekiston raqamlariga ketadi.
            Tuzatish:
            1. Bemorlar bo'limida bemor kartasini oching.
            2. «Telefon» maydonida bitta to'g'ri raqam qoldiring. Ikkinchi raqamni «Qo'shimcha telefon» maydoniga yozing.
            3. Xabarlar → Tarix bo'limida xato xabarni belgilab, qayta yuboring.
        `),
        bodyRu: body(`
            Что это значит: номер в карте пациента не похож на мобильный номер Узбекистана, поэтому SMS не отправлено. В тексте ошибки указан и сам номер.
            Правильные варианты: +998901234567, 998901234567 или 901234567 (9 цифр). Надёжнее всего — без пробелов: +998901234567.
            Частые причины: номер неполный или с лишней цифрой; в одном поле записаны два номера; введён зарубежный номер — SMS уходят только на номера Узбекистана.
            Как исправить:
            1. В разделе Пациенты откройте карту пациента.
            2. Оставьте в поле «Телефон» один правильный номер. Второй номер перенесите в поле «Дополнительный телефон».
            3. В разделе Сообщения → История отметьте сообщение с ошибкой и отправьте повторно.
        `),
        keywords: ["raqam noto'g'ri", "noto'g'ri format", 'telefon formati', 'raqam xato', 'chet el raqami', 'неверный формат номера', 'неправильный номер', 'формат телефона', 'рақам нотўғри', 'nomer xato'],
        paths: ['patients', 'messages.history'],
    },
    {
        id: 'sms.eskiz-rejected',
        module: 'messages',
        roles: DESK,
        titleUz: 'SMS ni Eskiz rad etdi — Tarixda Eskizning xato matni chiqyapti',
        titleRu: 'Eskiz отклонил SMS — в истории текст ошибки от Eskiz',
        bodyUz: body(`
            Tarixdagi qizil yozuv DentaCRM ning tayyor sabablariga o'xshamasa, uni Eskiz.uz qaytargan. Tartib bilan tekshiring:
            1. Shablon tasdiqlanganmi: Xabarlar → Shablonlar bo'limida shablon yonidagi belgi «Tasdiqlandi» bo'lishi kerak. «Moderatsiyada» yoki «Rad etildi» bo'lsa, Eskiz bu matnli SMS ni o'tkazmaydi.
            2. Balans yetarlimi: Sozlamalar → Integratsiyalar → Telegram va SMS bo'limida «Joriy SMS balans» ni ko'ring. Tugagan bo'lsa, Eskiz kabinetida to'ldiring.
            3. Yuboruvchi nomi to'g'rimi: o'sha yerdagi «Nickname (Yuboruvchi nomi)» — Eskiz sizga tasdiqlab bergan nom yoki 4546 bo'lishi kerak.
            4. Tuzatgach, Xabarlar → Tarix bo'limida xato xabarlarni tanlab, qayta yuboring.
            Qo'lda yozilgan matn ham Eskizda tasdiqlangan shablonga mos bo'lishi kerak.
            Xatoda «SMS yuborishda xatolik» yoki «timeout» so'zi bo'lsa — Eskiz javob bermagan, birozdan keyin qayta yuboring.
        `),
        bodyRu: body(`
            Если красная строка в истории не похожа на готовые причины DentaCRM, её вернул Eskiz.uz. Проверьте по порядку:
            1. Одобрен ли шаблон: в разделе Сообщения → Шаблоны отметка рядом с шаблоном должна быть «Tasdiqlandi» (одобрен). Если там «Moderatsiyada» или «Rad etildi», Eskiz не пропустит SMS с таким текстом.
            2. Хватает ли баланса: в разделе Настройки → Интеграции → Telegram и SMS посмотрите «Joriy SMS balans» (остаток SMS). Если он закончился, пополните в кабинете Eskiz.
            3. Верно ли имя отправителя: там же в поле «Nickname (имя отправителя)» должно быть имя, одобренное для вас в Eskiz, или 4546.
            4. После исправления отметьте сообщения с ошибкой в разделе Сообщения → История и отправьте повторно.
            Текст, написанный вручную, тоже должен совпадать с одобренным в Eskiz шаблоном.
            Если в ошибке есть «SMS yuborishda xatolik» или «timeout» — Eskiz не ответил, отправьте повторно чуть позже.
        `),
        keywords: ['eskiz rad etdi', 'eskiz xato', 'sms rad etildi', 'shablon tasdiqlanmagan', 'balans tugadi', 'eskiz error', 'эскиз отклонил', 'ошибка eskiz', 'шаблон не одобрен', 'баланс закончился', 'эскиз хато'],
        paths: ['messages.templates', 'settings.messaging'],
    },
    {
        id: 'sms.no-channel',
        module: 'messages',
        roles: DESK,
        titleUz: "Xato: «Bemor botga ulanmagan va telefon raqami ham yo'q»",
        titleRu: "Ошибка: «Bemor botga ulanmagan va telefon raqami ham yo'q»",
        bodyUz: body(`
            Bu nimani anglatadi: xabar «Avval Telegram» kanali bilan yuborilgan, lekin bemorga na Telegram, na SMS orqali yetib bo'lmadi. Yozuvda faqat telefon aytilsa ham, sabab uchta bo'lishi mumkin:
            1. Eskiz SMS ulanmagan. Sozlamalar → Integratsiyalar → Telegram va SMS bo'limida «Eskiz.uz SMS» yonida «Ulangan» turishi kerak. Ulanmagan bo'lsa, bemorda raqam bo'lsa ham aynan shu xato chiqadi.
            2. Bemor kartasida «Telefon» bo'sh.
            3. Bemor klinika botiga ulanmagan.
            Kamida bittasi tuzatilsa, xabar ketadi.
            Muhim: bu xatoni Tarixdan qayta yuborish faqat Telegram orqali urinadi. Bemor botga ulanmagan bo'lsa, xabarni bemor kartasidan yoki Xabarlar → Qo'lda bo'limidan yangidan yuboring.
            «Aloqa kanali mavjud emas» xatosi ham shuni anglatadi («Ikkalasi» kanali tanlanganda).
        `),
        bodyRu: body(`
            Что это значит: сообщение отправлялось по каналу «Сначала Telegram», но до пациента не удалось дойти ни через Telegram, ни по SMS. Хотя в тексте говорится только о телефоне, причин может быть три:
            1. Не подключён Eskiz SMS. В разделе Настройки → Интеграции → Telegram и SMS рядом с «Eskiz.uz SMS» должно стоять «Подключено». Если нет — эта ошибка появится, даже когда номер у пациента есть.
            2. В карте пациента пустое поле «Телефон».
            3. Пациент не подключён к боту клиники.
            Достаточно исправить хотя бы одно, и сообщение уйдёт.
            Важно: повторная отправка этой ошибки из истории пробует только Telegram. Если пациент не подключён к боту, отправьте сообщение заново из карты пациента или из раздела Сообщения → Вручную.
            Ошибка «Aloqa kanali mavjud emas» означает то же самое (при канале «Ikkalasi»).
        `),
        keywords: ['botga ulanmagan', "telefon raqami ham yo'q", 'aloqa kanali mavjud emas', 'xabar yetib bormadi', 'kanal yoq', 'не подключен к боту', 'нет канала связи', 'нет номера и бота', 'ботга уланмаган', 'bemorga yetib bolmaydi'],
        paths: ['settings.messaging', 'messages.manual'],
    },
    {
        id: 'bot.not-configured',
        module: 'messages',
        roles: DESK,
        titleUz: 'Xato: «Telegram bot sozlanmagan» yoki «Bot sozlanmagan»',
        titleRu: 'Ошибка: «Telegram bot sozlanmagan» или «Bot sozlanmagan»',
        bodyUz: body(`
            Bu nimani anglatadi: xabar Telegram orqali ketishi kerak edi, lekin klinikaga Telegram bot ulanmagan — bot tokeni kiritilmagan yoki o'chirilgan.
            Tuzatish:
            1. Sozlamalar → Integratsiyalar → Telegram va SMS bo'limini oching.
            2. «Telegram Bot Token» maydoni bo'sh bo'lsa, Telegramda @BotFather orqali bot yarating va u bergan tokenni shu maydonga qo'ying.
            3. «Saqlash» ni bosing.
            4. Bemorlar botga ulanishi kerak: botni ochib, telefon raqamini yuboradi.
            5. Xabarlar → Tarix bo'limida xato xabarlarni belgilab, qayta yuboring.
            Bot ulanmaguncha xabarlar yo'qolmasligi uchun Xabarlar → Avtomatik bo'limida qoida kanalini «SMS» yoki «Avval Telegram» ga o'zgartiring — Eskiz ulangan bo'lsa, SMS ketadi.
        `),
        bodyRu: body(`
            Что это значит: сообщение должно было уйти через Telegram, но у клиники не подключён Telegram-бот — токен бота не введён или удалён.
            Как исправить:
            1. Откройте Настройки → Интеграции → Telegram и SMS.
            2. Если поле «Токен Telegram бота» пустое, создайте бота в Telegram через @BotFather и вставьте выданный токен в это поле.
            3. Нажмите «Сохранить».
            4. Пациенты должны подключиться к боту: открыть его и отправить свой номер телефона.
            5. В разделе Сообщения → История отметьте сообщения с ошибкой и отправьте повторно.
            Чтобы сообщения не терялись, пока бот не подключён, в разделе Сообщения → Автоматически смените канал правила на «SMS» или «Сначала Telegram» — при подключённом Eskiz уйдёт SMS.
        `),
        keywords: ['bot sozlanmagan', 'telegram bot sozlanmagan', 'bot ulanmagan', 'bot token yoq', 'telegram xabar ketmadi', 'бот не настроен', 'бот не подключен', 'нет токена бота', 'бот созланмаган', 'bot yoq'],
        paths: ['settings.messaging', 'messages.history'],
    },
    {
        id: 'bot.patient-not-linked',
        module: 'messages',
        roles: DESK,
        titleUz: 'Xato: «Bemor botga ulanmagan» — Telegram xabar bormadi',
        titleRu: 'Ошибка: «Bemor botga ulanmagan» — сообщение в Telegram не дошло',
        bodyUz: body(`
            Bu nimani anglatadi: kanal sifatida faqat «Telegram» tanlangan, bemor esa klinika botiga ulanmagan. Bot bemorga birinchi bo'lib yoza olmaydi — avval bemor botni ochishi shart.
            Tuzatish:
            1. Bemorga klinika botining havolasini yuboring.
            2. Bemor botda «Start» ni bosadi va «📱 Telefon raqamni yuborish» tugmasi bilan raqamini yuboradi. Raqam bemor kartasidagi «Telefon» bilan bir xil bo'lishi kerak.
            3. Xabarlar → Tarix bo'limida xabarni belgilab, qayta yuboring.
            Botsiz bemorlarga ham yetib borishi uchun qoida kanalini «Avval Telegram» ga o'zgartiring: ulanmaganlarga SMS ketadi.
            Xato matni inglizcha bo'lib, ichida bot was blocked by the user so'zlari bo'lsa — bemor ulangan, lekin botni bloklagan yoki o'chirgan. U botni qaytadan ochib, «Start» ni bosishi kerak.
        `),
        bodyRu: body(`
            Что это значит: выбран канал только «Telegram», а пациент не подключён к боту клиники. Бот не может написать пациенту первым — сначала пациент должен открыть бота.
            Как исправить:
            1. Отправьте пациенту ссылку на бота клиники.
            2. Пациент нажимает в боте «Start» и отправляет номер кнопкой «📱 Telefon raqamni yuborish». Номер должен совпадать с полем «Телефон» в его карте.
            3. В разделе Сообщения → История отметьте сообщение и отправьте повторно.
            Чтобы сообщения доходили и до пациентов без бота, смените канал правила на «Сначала Telegram»: неподключённым уйдёт SMS.
            Если текст ошибки на английском и в нём есть слова bot was blocked by the user — пациент подключён, но заблокировал или удалил бота. Ему нужно снова открыть бота и нажать «Start».
        `),
        keywords: ['bemor botga ulanmagan', 'telegram bormadi', 'bot bloklangan', 'bemor botni ochmagan', 'bot was blocked', 'пациент не подключен к боту', 'телеграм не дошло', 'заблокировал бота', 'ботга уланмаган', 'bemor bot'],
        paths: ['messages.history', 'messages.auto'],
    },
    {
        id: 'bot.not-running',
        module: 'messages',
        roles: DESK,
        titleUz: 'Xato: «Bot instance topilmadi (bot ishga tushmagan)»',
        titleRu: 'Ошибка: «Bot instance topilmadi (bot ishga tushmagan)»',
        bodyUz: body(`
            Bu nimani anglatadi: bot tokeni kiritilgan, lekin klinika boti o'sha paytda ishlamay turgan, shuning uchun Telegram xabar jo'natilmadi.
            Tartib bilan tekshiring:
            1. Klinika botini Telegramda oching va /start yozing. Javob bersa — bot ishlab ketgan, 4-qadamga o'ting.
            2. Javob bermasa: Sozlamalar → Integratsiyalar → Telegram va SMS bo'limida «Telegram Bot Token» ni tekshirib, «Saqlash» ni qayta bosing — bot qaytadan ishga tushadi.
            3. Baribir javob bermasa, token eskirgan bo'lishi mumkin: @BotFather da botingiz uchun yangi token oling, uni maydonga qo'yib saqlang.
            4. Xabarlar → Tarix bo'limida xato xabarlarni belgilab, qayta yuboring.
            Bot tokenini faqat DentaCRM ishlatishi kerak: shu token boshqa dastur yoki xizmatga ham ulangan bo'lsa, bot javob bermay qoladi.
        `),
        bodyRu: body(`
            Что это значит: токен бота введён, но бот клиники в тот момент не работал, поэтому сообщение в Telegram не ушло.
            Проверьте по порядку:
            1. Откройте бота клиники в Telegram и напишите /start. Если отвечает — бот уже работает, переходите к шагу 4.
            2. Если не отвечает: в разделе Настройки → Интеграции → Telegram и SMS проверьте «Токен Telegram бота» и снова нажмите «Сохранить» — бот запустится заново.
            3. Если всё равно не отвечает, возможно, токен устарел: получите в @BotFather новый токен для своего бота, вставьте его в поле и сохраните.
            4. В разделе Сообщения → История отметьте сообщения с ошибкой и отправьте повторно.
            Токен бота должен использовать только DentaCRM: если тот же токен подключён к другой программе или сервису, бот перестаёт отвечать.
        `),
        keywords: ['bot instance topilmadi', 'bot ishga tushmagan', 'bot ishlamayapti', 'bot ochmayapti', 'bot toxtab qoldi', 'бот не запущен', 'бот не работает', 'bot instance', 'бот ишламаяпти', 'bot javob bermayapti'],
        paths: ['settings.messaging', 'messages.history'],
    },

    // ─── Eskiz SMS ───────────────────────────────────────────────────────────
    {
        id: 'sms.connect-eskiz',
        module: 'settings',
        roles: DESK,
        titleUz: 'Eskiz SMS ni qanday ulayman?',
        titleRu: 'Как подключить Eskiz SMS?',
        bodyUz: body(`
            SMS klinikaning o'z Eskiz.uz hisobi orqali ketadi va Eskiz tarifi bo'yicha to'lanadi.
            1. eskiz.uz saytida ro'yxatdan o'ting (hisobingiz bo'lsa, shu qadam kerak emas).
            2. Sozlamalar → Integratsiyalar → Telegram va SMS bo'limida «Eskiz.uz SMS» qismiga tushing.
            3. «Eskiz.uz Kabinet Email» va «Eskiz.uz Kabinet Paroli» ni kiriting.
            4. «Nickname (Yuboruvchi nomi)» — SMS kimdan kelgani ko'rinadigan nom. Eskiz sizga alohida nom tasdiqlab bergan bo'lsa, o'shani yozing, bo'lmasa 4546 qolsin.
            5. «Saqlash va Ulanishni Tekshirish» ni bosing. Login-parol to'g'ri bo'lsa, «Ulangan» yozuvi va SMS balansi chiqadi; noto'g'ri bo'lsa, xato oynasi chiqadi va hech narsa saqlanmaydi.
            6. «Test SMS yuborish» maydoniga o'z raqamingizni yozib sinab ko'ring.
            Shundan keyin botga ulanmagan bemorlarga xabarlar SMS bo'lib ketadi. Alohida «rejim» tanlash yo'q: kanal har bir qoidada va xabar yuborishda tanlanadi.
        `),
        bodyRu: body(`
            SMS уходят через собственный аккаунт клиники в Eskiz.uz и оплачиваются по тарифу Eskiz.
            1. Зарегистрируйтесь на eskiz.uz (если аккаунт есть, этот шаг не нужен).
            2. В разделе Настройки → Интеграции → Telegram и SMS перейдите к блоку «Eskiz.uz SMS».
            3. Введите «Email кабинета Eskiz.uz» и «Пароль от кабинета Eskiz.uz».
            4. «Nickname (имя отправителя)» — имя, от которого приходит SMS. Если Eskiz одобрил для вас отдельное имя, укажите его, иначе оставьте 4546.
            5. Нажмите «Сохранить и проверить подключение». Если логин и пароль верны, появятся отметка «Подключено» и остаток SMS; если нет — появится окно с ошибкой и ничего не сохранится.
            6. В поле «Отправить тестовое SMS» введите свой номер и проверьте.
            После этого пациентам, не подключённым к боту, сообщения уходят по SMS. Отдельного «режима» нет: канал выбирается в каждом правиле и при отправке.
        `),
        keywords: ['eskiz ulash', 'sms ulash', 'eskiz sozlash', 'sms yoqish', 'nickname', '4546', 'подключить eskiz', 'подключить смс', 'настроить смс', 'имя отправителя', 'эскиз улаш', 'sms rejimi'],
        paths: ['settings.messaging'],
    },
    {
        id: 'sms.template-moderation',
        module: 'messages',
        roles: DESK,
        titleUz: 'Shablon nega «Moderatsiyada» turibdi va nega tasdiqlanishi kerak?',
        titleRu: 'Почему шаблон «Moderatsiyada» и зачем его одобрять?',
        bodyUz: body(`
            Eskiz.uz qoidasi shunday: SMS matni oldindan tekshirilgan shablonga mos bo'lishi kerak, aks holda Eskiz uni jo'natmaydi. Telegram xabarlariga bu qoida tegishli emas.
            Eskiz ulangan bo'lsa, shablon saqlanganda o'zi tekshiruvga yuboriladi. Xabarlar → Shablonlar bo'limida shablon nomi yonida holati ko'rinadi:
            - «Moderatsiyada» — Eskiz hali tekshiryapti, kuting.
            - «Tasdiqlandi (servis)» yoki «Tasdiqlandi (reklama)» — SMS yuborish mumkin.
            - «Rad etildi» — matnni o'zgartirib qayta saqlang; sababini Eskiz kabinetidan ko'ring.
            - «Eskiz'da topilmadi» yoki «Yuborishda xatolik» — shablon Eskizga yetib bormagan: 🔄 tugmasini bosing, qayta yuboriladi.
            Holat o'zi yangilanmaydi — shablon yonidagi 🔄 tugmasi bilan yangilab turing. Matnni o'zgartirsangiz, shablon qaytadan tekshiruvga ketadi. Tekshiruv muddati Eskizga bog'liq.
        `),
        bodyRu: body(`
            Правило Eskiz.uz такое: текст SMS должен совпадать с заранее проверенным шаблоном, иначе Eskiz его не отправит. На сообщения в Telegram это не распространяется.
            Если Eskiz подключён, при сохранении шаблон сам уходит на проверку. В разделе Сообщения → Шаблоны рядом с названием виден его статус (надписи на узбекском):
            - «Moderatsiyada» — Eskiz ещё проверяет, подождите.
            - «Tasdiqlandi (servis)» или «Tasdiqlandi (reklama)» — одобрен, SMS можно отправлять.
            - «Rad etildi» — отклонён: измените текст и сохраните заново; причину смотрите в кабинете Eskiz.
            - «Eskiz'da topilmadi» или «Yuborishda xatolik» — шаблон не дошёл до Eskiz: нажмите кнопку 🔄, он отправится снова.
            Статус сам не обновляется — нажимайте кнопку 🔄 рядом с шаблоном. Если изменить текст, шаблон снова уйдёт на проверку. Срок проверки зависит от Eskiz.
        `),
        keywords: ['moderatsiya', 'moderatsiyada', 'shablon tasdiqlanmadi', 'tasdiqlandi', 'rad etildi', 'eskiz shablon', 'модерация', 'шаблон на модерации', 'шаблон отклонен', 'одобрение шаблона', 'модерацияда', 'shablon tekshiruvi'],
        paths: ['messages.templates'],
    },
    {
        id: 'sms.sent-not-delivered',
        module: 'messages',
        roles: DESK,
        titleUz: 'Tarixda «Yuborildi» deb turibdi, lekin bemorga SMS kelmagan',
        titleRu: 'В истории «Отправлено», но пациент SMS не получил',
        bodyUz: body(`
            «Yuborildi» — Eskiz SMS ni jo'natish uchun qabul qilib oldi, degani. Telefon uni qabul qilgan-qilmaganini DentaCRM ko'rmaydi.
            Tartib bilan tekshiring:
            1. Raqam to'g'rimi: Xabarlar → Tarix bo'limida xabar yonida qaysi raqamga ketgani yozilgan. Bemor kartasidagi raqam eskirgan bo'lishi mumkin.
            2. Bemorning telefoni o'chiq yoki aloqadan tashqarida bo'lmaganmi.
            3. Eskiz kabinetidagi hisobotdan shu SMS holatini ko'ring.
            4. Balansni tekshiring: Sozlamalar → Integratsiyalar → Telegram va SMS bo'limida «Joriy SMS balans». Xabarlar → Qo'lda bo'limida ham «Eskiz balansi» ko'rinadi. Balans Eskiz kabinetida to'ldiriladi.
            Muhim xabarlar uchun bemorlarni klinika botiga ulang: Telegram xabari bepul va tez yetib boradi.
        `),
        bodyRu: body(`
            «Отправлено» означает, что Eskiz принял SMS к отправке. Получил ли его телефон, DentaCRM не видит.
            Проверьте по порядку:
            1. Верен ли номер: в разделе Сообщения → История рядом с сообщением указан номер, на который оно ушло. Номер в карте пациента мог устареть.
            2. Не был ли телефон пациента выключен или вне сети.
            3. Посмотрите статус этого SMS в отчёте в кабинете Eskiz.
            4. Проверьте баланс: в разделе Настройки → Интеграции → Telegram и SMS — «Joriy SMS balans» (остаток SMS). В разделе Сообщения → Вручную тоже виден «Eskiz balansi». Баланс пополняется в кабинете Eskiz.
            Для важных сообщений подключайте пациентов к боту клиники: сообщение в Telegram бесплатное и доходит быстро.
        `),
        keywords: ['yuborildi lekin kelmadi', 'sms bormadi', 'sms yetib bormadi', 'sms balans', 'eskiz balans', 'balans qayerda', 'отправлено но не дошло', 'смс не доставлено', 'баланс смс', 'баланс eskiz', 'смс бормади', 'sms kelmadi'],
        paths: ['messages.history', 'settings.messaging'],
    },

    // ─── Klinika Telegram boti ───────────────────────────────────────────────
    {
        id: 'bot.create-connect',
        module: 'settings',
        roles: DESK,
        titleUz: 'Klinika uchun Telegram botni qanday yaratib ulayman?',
        titleRu: 'Как создать и подключить Telegram-бота клиники?',
        bodyUz: body(`
            Har bir klinikaning o'z boti bo'ladi: bemorlar undan eslatma oladi va qabulga yoziladi, rahbar hisobot oladi.
            1. Telegramda @BotFather ni oching va /newbot buyrug'ini yuboring.
            2. Botga nom bering va oxiri bot bilan tugaydigan manzil tanlang.
            3. BotFather bergan tokenni nusxalang (uzun kod, ichida ikki nuqta bor).
            4. DentaCRM da Sozlamalar → Integratsiyalar → Telegram va SMS bo'limini oching.
            5. Tokenni «Telegram Bot Token» maydoniga qo'yib, «Saqlash» ni bosing.
            6. Botni Telegramda ochib /start bosing — javob bersa, ishlayapti.
            Token noto'g'ri bo'lsa ham saqlanadi, lekin bot javob bermaydi — shuning uchun 6-qadamni albatta bajaring.
            Sahifadagi «Bot hali ulanmagan» yozuvi rahbar hali botga ulanmaganini bildiradi. Rahbar botda telefon raqamini yuborgach, u «Bot faol» ga o'zgaradi.
        `),
        bodyRu: body(`
            У каждой клиники свой бот: пациенты получают в нём напоминания и записываются на приём, руководитель получает отчёты.
            1. Откройте в Telegram @BotFather и отправьте команду /newbot.
            2. Дайте боту имя и выберите адрес, который заканчивается на bot.
            3. Скопируйте токен, который выдаст BotFather (длинный код с двоеточием).
            4. В DentaCRM откройте Настройки → Интеграции → Telegram и SMS.
            5. Вставьте токен в поле «Токен Telegram бота» и нажмите «Сохранить».
            6. Откройте бота в Telegram и нажмите /start — если отвечает, он работает.
            Неверный токен тоже сохранится, но бот отвечать не будет — поэтому шаг 6 обязателен.
            Надпись «Бот еще не подключен» на странице означает, что к боту ещё не подключился руководитель. Когда он отправит боту свой номер, надпись сменится на «Бот активен».
        `),
        keywords: ['bot yaratish', 'botfather', 'bot token', 'telegram bot ulash', 'bot ulash', 'token qayerdan', 'создать бота', 'подключить бота', 'токен бота', 'ботфазер', 'бот улаш', 'bot ochish'],
        paths: ['settings.messaging'],
    },
    {
        id: 'bot.link-account',
        module: 'messages',
        roles: '*',
        titleUz: 'Rahbar, shifokor, resepshn va bemor botga qanday ulanadi?',
        titleRu: 'Как руководителю, врачу, ресепшн и пациенту подключиться к боту?',
        bodyUz: body(`
            Bot odamni telefon raqamidan taniydi, shuning uchun raqam avval DentaCRM da yozilgan bo'lishi kerak:
            - rahbar — Sozlamalar → Klinika bo'limidagi «Klinika Egasi Telefoni (Hisobotlar uchun)»;
            - shifokor va resepshn — Xodimlar → Ro'yxat bo'limidagi xodim telefoni;
            - bemor — bemor kartasidagi «Telefon».
            Ulanish:
            1. Klinika botini Telegramda oching va «Start» ni bosing.
            2. Pastdagi «📱 Telefon raqamni yuborish» tugmasini bosib, ruxsat bering.
            3. Bot sizni tanib, rolingizga mos menyuni chiqaradi.
            Raqamni qo'lda yozib yoki boshqa odamning kontaktini yuborib ulanib bo'lmaydi — faqat shu tugma orqali, o'z Telegram raqamingiz bilan.
            Shifokor ulangach, har kuni ertalab 08:00 da bugungi qabullari ro'yxatini oladi.
        `),
        bodyRu: body(`
            Бот узнаёт человека по номеру телефона, поэтому номер сначала должен быть записан в DentaCRM:
            - руководитель — «Телефон владельца клиники (для отчетов)» в разделе Настройки → Клиника;
            - врач и ресепшн — телефон сотрудника в разделе Сотрудники → Список;
            - пациент — поле «Телефон» в карте пациента.
            Подключение:
            1. Откройте бота клиники в Telegram и нажмите «Start».
            2. Нажмите внизу кнопку «📱 Telefon raqamni yuborish» (отправить номер) и разрешите отправку.
            3. Бот узнает вас и покажет меню для вашей роли.
            Подключиться, написав номер вручную или переслав чужой контакт, нельзя — только этой кнопкой, со своим номером в Telegram.
            После подключения врач каждое утро в 08:00 получает список своих приёмов на день.
        `),
        keywords: ['botga ulanish', 'botga qanday ulanaman', 'telefon raqamni yuborish', 'shifokor bot', 'bemor botga ulash', 'rahbar bot', 'подключиться к боту', 'как подключить пациента к боту', 'бот врач', 'отправить номер боту', 'ботга уланиш', 'bot start'],
        paths: ['settings.clinic', 'staff.list'],
    },
    {
        id: 'bot.phone-not-found',
        module: 'messages',
        roles: '*',
        titleUz: 'Bot «telefon raqamingiz tizimda topilmadi» deyapti',
        titleRu: 'Бот отвечает «telefon raqamingiz tizimda topilmadi»',
        bodyUz: body(`
            To'liq matni: «Kechirasiz, sizning telefon raqamingiz tizimda topilmadi. Iltimos, klinika bilan bog'laning.» Demak, Telegramdagi raqam DentaCRM dagi raqamga to'g'ri kelmadi. Tartib bilan tekshiring:
            1. To'g'ri bot ochilganmi — har bir klinikaning boti alohida.
            2. Raqam DentaCRM da bormi: bemor uchun — kartasidagi «Telefon»; xodim uchun — Xodimlar → Ro'yxat; rahbar uchun — Sozlamalar → Klinika bo'limidagi «Klinika Egasi Telefoni (Hisobotlar uchun)».
            3. Raqam Telegramdagi bilan bir xilmi: odam Telegramga boshqa raqamdan kirgan bo'lishi mumkin.
            4. Bemor raqami bo'sh joysiz yozilganmi: +998901234567 ko'rinishida yozing — orasi ochiq yoki chiziqchali raqamni bot topa olmaydi.
            5. Tuzatgach, botda «📱 Telefon raqamni yuborish» tugmasini qayta bosing.
            «Bu boshqa odamning raqami» javobi chiqsa — kontakt qo'lda yuborilgan, tugmaning o'zini bosish kerak.
        `),
        bodyRu: body(`
            Полный текст: «Kechirasiz, sizning telefon raqamingiz tizimda topilmadi. Iltimos, klinika bilan bog'laning.» Значит, номер в Telegram не совпал с номером в DentaCRM. Проверьте по порядку:
            1. Тот ли бот открыт — у каждой клиники свой бот.
            2. Есть ли номер в DentaCRM: для пациента — поле «Телефон» в карте; для сотрудника — Сотрудники → Список; для руководителя — «Телефон владельца клиники (для отчетов)» в разделе Настройки → Клиника.
            3. Совпадает ли номер с тем, что в Telegram: человек мог войти в Telegram с другого номера.
            4. Записан ли номер пациента без пробелов: пишите в виде +998901234567 — номер с пробелами или дефисами бот не находит.
            5. После исправления снова нажмите в боте кнопку «📱 Telefon raqamni yuborish».
            Если бот ответил «Bu boshqa odamning raqami» — контакт отправили вручную, нужно нажать саму кнопку.
        `),
        keywords: ['raqam topilmadi', 'tizimda topilmadi', 'bot tanimayapti', 'bot raqamni topmadi', 'botga ulana olmayapman', 'номер не найден', 'бот не находит номер', 'не могу подключиться к боту', 'рақам топилмади', 'bot raqam xato'],
        paths: ['staff.list', 'settings.clinic'],
    },
    {
        id: 'bot.menu-buttons',
        module: 'messages',
        roles: '*',
        titleUz: 'Klinika botidagi tugmalar nima qiladi?',
        titleRu: 'Что делают кнопки в боте клиники?',
        bodyUz: body(`
            Menyu har kimga o'z roliga qarab chiqadi. Yo'qolib qolsa, botga /menu deb yozing.
            Rahbar:
            - «📊 Hisobot» — bugun, kecha, hafta, oy yoki o'tgan oy bo'yicha: umumiy, shifokorlar, kassa, qarzdorlar, kelmaganlar; filiallar bo'lsa — filial bo'yicha ham.
            - «📋 Bugungi qabullar», «📆 Ertangi qabullar» — klinika jadvali.
            - «💰 Bugungi kassa holati».
            Resepshn: «📋 Bugungi qabullar», «📆 Ertangi qabullar», «💰 Bugungi kassa holati».
            Shifokor: «📅 Bugungi qabullarim», «📆 Ertangi qabullarim».
            Bemor: «📅 Qabulga yozilish», «⏰ Keyingi qabulim», «📋 Davolanish tarixim» (oxirgi 5 ta tashrif), «💳 Mening hisobim» (to'lanmagan qarzi).
            Qabul yakunlangach, bir soatdan so'ng bot bemordan xizmatni 1 dan 5 gacha baholashni so'raydi. Baho klinikaga bildirishnoma bo'lib keladi.
        `),
        bodyRu: body(`
            Меню у каждого своё, по роли (надписи в боте на узбекском). Если меню пропало, напишите боту /menu.
            Руководитель:
            - «📊 Hisobot» — отчёт за сегодня, вчера, неделю, месяц или прошлый месяц: общий, по врачам, касса, должники, не пришедшие; если есть филиалы — и по филиалам.
            - «📋 Bugungi qabullar», «📆 Ertangi qabullar» — приёмы клиники на сегодня и на завтра.
            - «💰 Bugungi kassa holati» — касса за сегодня.
            Ресепшн: «📋 Bugungi qabullar», «📆 Ertangi qabullar», «💰 Bugungi kassa holati».
            Врач: «📅 Bugungi qabullarim», «📆 Ertangi qabullarim» — свои приёмы.
            Пациент: «📅 Qabulga yozilish» — запись, «⏰ Keyingi qabulim» — ближайший приём, «📋 Davolanish tarixim» — последние 5 визитов, «💳 Mening hisobim» — неоплаченный долг.
            Через час после завершения приёма бот просит пациента оценить обслуживание от 1 до 5. Оценка приходит клинике уведомлением.
        `),
        keywords: ['bot tugmalari', 'bot menyu', 'hisobot tugmasi', 'bugungi qabullar', 'baholash', 'reyting', 'menyu yoqoldi', 'кнопки бота', 'меню бота', 'оценка', 'отчёт в боте', 'бот меню'],
        paths: ['settings.messaging'],
    },
    {
        id: 'bot.daily-report',
        module: 'messages',
        roles: DESK,
        titleUz: 'Rahbarga kunlik hisobot: qanday yoqiladi va nega kelmayapti?',
        titleRu: 'Ежедневный отчёт руководителю: как включить и почему не приходит?',
        bodyUz: body(`
            Yoqish:
            1. Sozlamalar → Klinika bo'limida «Klinika Egasi Telefoni (Hisobotlar uchun)» ga rahbar raqamini yozing.
            2. «Kunlik hisobotni yuborish» ni belgilang, «Yuborish vaqti» ni tanlang (boshida 22:00) va «Saqlash» ni bosing.
            3. Rahbar klinika botini ochib, «📱 Telefon raqamni yuborish» tugmasini bosadi.
            Hisobot kelmasa, tekshiring:
            - O'sha sahifada «⚠️ Rahbar botga hali ulanmagan» tursa — 3-qadam bajarilmagan. Raqam o'zgartirilsa, yangi rahbar botga qaytadan ulanishi kerak.
            - «Kunlik hisobotni yuborish» belgisi yoqilganmi.
            - O'sha kuni qabul ham, to'lov ham bo'lmagan bo'lsa (dam olish kuni), hisobot yuborilmaydi.
            - Vaqt 12:00 dan oldin tanlangan bo'lsa, kechagi kun hisoboti keladi.
            - Bot javob beryaptimi: /start yozib ko'ring.
            Istalgan payt botda «📊 Hisobot» tugmasi bilan ham ko'rish mumkin.
        `),
        bodyRu: body(`
            Как включить:
            1. В разделе Настройки → Клиника укажите номер руководителя в поле «Телефон владельца клиники (для отчетов)».
            2. Отметьте «Отправлять ежедневный отчет», выберите «Время отправки» (изначально 22:00) и нажмите «Сохранить».
            3. Руководитель открывает бота клиники и нажимает кнопку «📱 Telefon raqamni yuborish».
            Если отчёт не приходит, проверьте:
            - На той же странице стоит «⚠️ Руководитель еще не подключен к боту» — не выполнен шаг 3. После смены номера новый руководитель должен подключиться к боту заново.
            - Включена ли отметка «Отправлять ежедневный отчет».
            - Если в этот день не было ни приёмов, ни оплат (выходной), отчёт не отправляется.
            - Если выбрано время до 12:00, приходит отчёт за вчерашний день.
            - Отвечает ли бот: напишите ему /start.
            В любой момент отчёт можно открыть кнопкой «📊 Hisobot» в боте.
        `),
        keywords: ['kunlik hisobot', 'hisobot kelmayapti', 'rahbarga hisobot', 'hisobot vaqti', '22:00 hisobot', 'bot hisobot yubormayapti', 'ежедневный отчёт', 'отчёт не приходит', 'время отчёта', 'отчёт руководителю', 'кунлик ҳисобот', 'hisobot kelmadi'],
        paths: ['settings.clinic', 'settings.messaging'],
    },
    {
        id: 'bot.patient-booking',
        module: 'messages',
        roles: DESK,
        titleUz: "Bemor bot orqali qabulga qanday yoziladi va oldindan to'lov qanday ishlaydi?",
        titleRu: 'Как пациент записывается через бота и как работает предоплата?',
        bodyUz: body(`
            Botga ulangan bemor «📅 Qabulga yozilish» tugmasini bosadi, shifokorni, kunni (bugundan 7 kun ichida) va bo'sh vaqtni tanlaydi. Bo'sh vaqtlar shifokorning (yoki klinikaning) ish soatlari ichida yarim soatlik oraliq bilan chiqadi. Qabul Kalendarda paydo bo'ladi, klinikaga bildirishnoma keladi.
            Oldindan to'lov talab qilish:
            1. Sozlamalar → Maxsus imkoniyatlar bo'limida «Oldindan to'lovni yoqish» ni yoqing.
            2. «Karta raqami» va bron summasini kiritib, «Saqlash» ni bosing.
            Shunda bot bemorga summa va kartani ko'rsatadi, bemor to'lov chekini rasm yoki fayl qilib botga yuboradi. Chek rahbarning Telegramiga «✅ Tasdiqlash» va «❌ Rad etish» tugmalari bilan keladi. Tasdiqlansa — qabul tasdiqlanadi, rad etilsa — bekor bo'ladi; bemorga xabar boradi.
            Chek kelishi uchun rahbar botga ulangan bo'lishi shart.
        `),
        bodyRu: body(`
            Пациент, подключённый к боту, нажимает «📅 Qabulga yozilish», выбирает врача, день (в пределах 7 дней) и свободное время. Свободное время показывается в рабочие часы врача (или клиники) с шагом в полчаса. Запись появляется в Календаре, клинике приходит уведомление.
            Как требовать предоплату:
            1. В разделе Настройки → Дополнительные возможности включите «Включить предоплату».
            2. Укажите «Номер карты» и сумму брони, нажмите «Сохранить».
            Тогда бот покажет пациенту сумму и карту, а пациент отправит боту чек об оплате — фото или файлом. Чек приходит руководителю в Telegram с кнопками «✅ Tasdiqlash» (подтвердить) и «❌ Rad etish» (отклонить). После подтверждения запись подтверждается, после отклонения — отменяется; пациент получает сообщение.
            Чтобы чеки приходили, руководитель должен быть подключён к боту.
        `),
        keywords: ['bot orqali yozilish', 'onlayn yozilish', "oldindan to'lov", 'bron', 'chek', 'predoplata', 'запись через бота', 'онлайн запись', 'предоплата', 'бронь', 'чек об оплате', 'олдиндан тўлов'],
        paths: ['settings.features', 'calendar'],
    },
    {
        id: 'bot.not-answering',
        module: 'messages',
        roles: '*',
        titleUz: 'Klinika boti javob bermayapti',
        titleRu: 'Бот клиники не отвечает',
        bodyUz: body(`
            Tartib bilan tekshiring:
            1. To'g'ri bot ochilganmi: har bir klinikaning o'z boti bor. Botga /start yozing.
            2. Sozlamalar → Integratsiyalar → Telegram va SMS bo'limida «Telegram Bot Token» to'ldirilganmi. «Saqlash» ni qayta bosing — bot ishlamay turgan bo'lsa, qaytadan ishga tushadi.
            3. Token to'g'rimi: u @BotFather bergan token bilan aynan bir xil bo'lishi kerak, ortiqcha belgisiz. Token BotFather da yangilangan bo'lsa, eskisi ishlamaydi — yangisini kiriting.
            4. Shu bot tokeni boshqa dastur yoki xizmatga ham ulanmaganmi: bitta botni ikki joy ishlata olmaydi — ikkinchisini uzing.
            5. Tugmalar yo'qolgan bo'lsa, botga /menu deb yozing.
            Bot tugmalarga va telefon raqamiga javob beradi; boshqa matn yozilsa, menyudan tanlashni so'raydi. Guruhga qo'shilgan bot xabarlarga javob bermaydi — unga shaxsiy chatda yozing.
        `),
        bodyRu: body(`
            Проверьте по порядку:
            1. Тот ли бот открыт: у каждой клиники свой бот. Напишите боту /start.
            2. Заполнено ли поле «Токен Telegram бота» в разделе Настройки → Интеграции → Telegram и SMS. Нажмите «Сохранить» ещё раз — если бот не работал, он запустится заново.
            3. Верен ли токен: он должен точно совпадать с токеном от @BotFather, без лишних символов. Если токен в BotFather обновляли, старый не работает — введите новый.
            4. Не подключён ли этот токен ещё к какой-то программе или сервису: один бот не может работать в двух местах — отключите второй.
            5. Если пропали кнопки, напишите боту /menu.
            Бот отвечает на кнопки и на отправленный номер телефона; на другой текст он просит выбрать пункт меню. В группе бот на сообщения не отвечает — пишите ему в личный чат.
        `),
        keywords: ['bot javob bermayapti', 'bot ishlamayapti', 'bot jim', 'bot ochilmayapti', 'bot qotib qoldi', 'bot tugmalari yoq', 'бот не отвечает', 'бот не работает', 'бот молчит', 'бот завис', 'бот жавоб бермаяпти', 'bot ishlamadi'],
        paths: ['settings.messaging'],
    },

    // ─── Sozlamalar ──────────────────────────────────────────────────────────
    {
        id: 'settings.clinic-info',
        module: 'settings',
        roles: DESK,
        titleUz: "Klinika ma'lumotlari, ish vaqti va rahbar telefonini qanday o'zgartiraman?",
        titleRu: 'Как изменить данные клиники, часы работы и телефон руководителя?',
        bodyUz: body(`
            1. Sozlamalar → Klinika bo'limini oching.
            2. «Umumiy Ma'lumotlar» da «Klinika Nomi», «Manzil», «Telefon», «Email» va «STIR (INN)» ni to'ldiring. STIR 9 ta raqamdan iborat bo'lishi kerak.
            3. «Ishni boshlash vaqti» va «Ishni tugash vaqti» ni tanlang. Kalendar va botdagi bo'sh vaqtlar shu soatlar bo'yicha chiqadi.
            4. «Klinika Egasi Telefoni (Hisobotlar uchun)» — rahbar shu raqam bilan klinika botiga ulanadi va hisobot oladi.
            5. «Saqlash» ni bosing — sahifa o'zi yangilanadi.
            Bilib qo'ying: rahbar raqamini faqat klinika rahbarining o'zi o'zgartira oladi. Boshqa xodimda bu maydon o'zgarmaydi va ostida «Bu raqamni faqat klinika rahbari o'zgartira oladi» yozuvi turadi. Raqam o'zgarsa, oldingi rahbarga hisobot bormay qoladi.
            Klinika telefoni kelmagan bemorga ketadigan tayyor xabarda ko'rsatiladi.
        `),
        bodyRu: body(`
            1. Откройте Настройки → Клиника.
            2. В блоке «Общая информация» заполните «Название клиники», «Адрес», «Телефон», «Email» и «ИНН». ИНН должен состоять из 9 цифр.
            3. Выберите «Время начала работы» и «Время окончания работы». По этим часам строятся календарь и свободное время в боте.
            4. «Телефон владельца клиники (для отчетов)» — с этим номером руководитель подключается к боту клиники и получает отчёты.
            5. Нажмите «Сохранить» — страница обновится сама.
            Важно: номер руководителя может изменить только сам руководитель клиники. У другого сотрудника это поле не редактируется, под ним написано «Этот номер может изменить только руководитель клиники». После смены номера прежний руководитель перестаёт получать отчёты.
            Телефон клиники указывается в готовом сообщении пациенту, который не пришёл.
        `),
        keywords: ["klinika ma'lumotlari", 'ish vaqti', 'klinika nomi', 'manzil ozgartirish', 'rahbar telefoni', 'stir', 'данные клиники', 'часы работы', 'название клиники', 'телефон руководителя', 'иш вақти', 'klinika sozlamalari'],
        paths: ['settings.clinic'],
    },
    {
        id: 'settings.branches',
        module: 'settings',
        roles: OWNER,
        titleUz: "Filial qo'shish va filiallar bo'yicha ishlash",
        titleRu: 'Как добавить филиал и работать по филиалам?',
        bodyUz: body(`
            Filiallarni faqat klinika rahbari boshqaradi.
            1. Sozlamalar → Filiallar bo'limida «Qo'shish» ni bosing.
            2. «Filial nomi», «Manzil» va «Telefon» ni kiriting.
            3. Birinchi filialni qo'shayotganda «Mavjud barcha bemorlar, qabullar va to'lovlarni shu filialga biriktirish» belgisini qoldiring — aks holda filial tanlanganda ro'yxatlar bo'sh ko'rinadi.
            4. «Saqlash» ni bosing.
            Shundan keyin sahifa tepasida filial tanlagichi paydo bo'ladi: filial tanlansa, bemorlar, kalendar va moliya faqat shu filial bo'yicha ko'rinadi; «Butun klinika» — hammasi birga.
            Shifokorni filialga Xodimlar → Ro'yxat bo'limida biriktirasiz; filiali tanlanmagan shifokor barcha filiallarda ko'rinadi.
            Filial o'chirilsa, uning bemorlari, qabullari va to'lovlari o'chmaydi — «Butun klinika» ko'rinishida qoladi.
        `),
        bodyRu: body(`
            Филиалами управляет только руководитель клиники.
            1. В разделе Настройки → Филиалы нажмите «Добавить».
            2. Укажите «Название филиала», «Адрес» и «Телефон».
            3. При добавлении первого филиала оставьте отметку «Привязать всех существующих пациентов, приёмы и платежи к этому филиалу» — иначе при выборе филиала списки будут пустыми.
            4. Нажмите «Сохранить».
            После этого вверху страницы появится переключатель филиалов: если выбран филиал, пациенты, календарь и финансы показываются только по нему; «Вся клиника» — всё вместе.
            Врача привязывают к филиалу в разделе Сотрудники → Список; врач без филиала виден во всех филиалах.
            При удалении филиала его пациенты, приёмы и платежи не удаляются — остаются в режиме «Вся клиника».
        `),
        keywords: ['filial', "filial qo'shish", 'ikkinchi filial', 'filial tanlash', 'butun klinika', 'bemorlar yoqoldi', 'филиал', 'добавить филиал', 'переключить филиал', 'вся клиника', 'филиал қўшиш', 'filiallar'],
        paths: ['settings.branches', 'staff.list'],
    },
    {
        id: 'settings.services',
        module: 'settings',
        roles: DESK,
        titleUz: "Xizmat va narx qo'shish, bir nechta tishga bitta narx qo'yish",
        titleRu: 'Как добавить услугу и цену, одна цена на несколько зубов',
        bodyUz: body(`
            1. Sozlamalar → Xizmatlar va narxlar bo'limini oching.
            2. Tartib uchun chapdagi «Kategoriyalar» yonidagi «+» bilan kategoriya qo'shing (masalan: Terapiya).
            3. «Xizmat Qo'shish» ni bosing.
            4. «Xizmat Nomi», «Kategoriya» va «Narxi» ni kiriting. «Texniklar xarajati» — shu xizmatga ketadigan laboratoriya xarajati; bo'lmasa bo'sh qoldiring.
            5. «Nazorat (oy)» — bemor shu xizmatdan keyin necha oyda qayta kelishi kerak (kerak bo'lmasa «Kerak emas»).
            6. «Saqlash» ni bosing.
            «Bir nechta tishga qilinsa ham narx bitta» belgisini konsultatsiya yoki tish tozalash kabi xizmatlarga qo'ying. Belgilanmasa, narx har bir tishga alohida hisoblanadi (implant, plomba).
            «Qabulni yakunlashdan oldin majburiy» qismida rasm yuklash yoki ishlatilgan materialni yozishni shart qilib qo'yish mumkin.
            Narxni o'zgartirish uchun xizmat qatoridagi qalamcha belgisini bosing.
        `),
        bodyRu: body(`
            1. Откройте Настройки → Услуги и цены.
            2. Для порядка добавьте категорию кнопкой «+» рядом с надписью «Категории» слева (например: Терапия).
            3. Нажмите «Добавить услугу».
            4. Заполните «Название услуги», «Категория» и «Цена». «Расходы на техников» — лабораторные расходы на эту услугу; если их нет, оставьте пустым.
            5. «Контроль (мес)» — через сколько месяцев пациент должен прийти снова (если не нужно — «Не нужен»).
            6. Нажмите «Сохранить».
            Отметку «Одна цена, даже если зубов несколько» ставьте для таких услуг, как консультация или чистка. Без неё цена считается за каждый зуб отдельно (имплант, пломба).
            В блоке «Обязательно перед завершением приёма» можно сделать обязательными загрузку фото или запись использованного материала.
            Чтобы изменить цену, нажмите значок карандаша в строке услуги.
        `),
        keywords: ["xizmat qo'shish", 'narx', "narx o'zgartirish", 'preyskurant', 'kategoriya', 'bitta narx', 'har bir tishga narx', 'добавить услугу', 'цена', 'изменить цену', 'прайс', 'хизмат қўшиш'],
        paths: ['settings.services'],
        guideId: 'task-service',
    },
    {
        id: 'settings.features',
        module: 'settings',
        roles: DESK,
        titleUz: "To'lov turlari, chek chiqarish va kassa smenalarini sozlash",
        titleRu: 'Настройка способов оплаты, чека и кассовых смен',
        bodyUz: body(`
            Hammasi Sozlamalar → Maxsus imkoniyatlar bo'limida.
            To'lov turlari: «To'lov turlari» ro'yxatida to'lov oynasida chiqishi kerak bo'lgan usullarni belgilang (naqd doim yoqilgan) va «Saqlash» ni bosing. «Sukut ro'yxatga qaytarish» boshlang'ich holatga qaytaradi.
            Chek: «Chek chiqarish funksiyasi» ni belgilab saqlang — to'lov qabul qilinganda chek oynasi o'zi ochiladi.
            Kassa smenalari (faqat rahbarda ko'rinadi): «Kuniga 1 smena» yoki «Kuniga 2 smena» ni tanlang. Ikki smenada Kassa sahifasida «1-smena / 2-smena» tanlagichi chiqadi. Smena soat bo'yicha emas, kassir «Kunni yopish» ni bosganda tugaydi; 2-smena 1-smena topshirgan naqddan boshlanadi.
            Shu bo'limda bot orqali yozilishda oldindan to'lov talab qilish ham yoqiladi: «Oldindan to'lovni yoqish».
        `),
        bodyRu: body(`
            Всё находится в разделе Настройки → Дополнительные возможности.
            Способы оплаты: в списке «Способы оплаты» отметьте способы, которые должны быть в окне оплаты (наличные включены всегда), и нажмите «Сохранить». «Вернуть стандартный список» возвращает исходный набор.
            Чек: отметьте «Функция выдачи чека» и сохраните — при приёме оплаты окно чека будет открываться само.
            Кассовые смены (видит только руководитель): выберите «1 смена в день» или «2 смены в день». При двух сменах на странице кассы появится переключатель «1-я смена / 2-я смена». Смена заканчивается не по часам, а когда кассир нажимает «Закрыть день»; вторая смена начинается с наличных, сданных первой.
            Здесь же включается предоплата при записи через бота: «Включить предоплату».
        `),
        keywords: ["to'lov turlari", 'click payme', 'chek chiqarish', 'kassa smenasi', '2 smena', 'tolov usuli yoq', 'способы оплаты', 'чек', 'кассовые смены', 'две смены', 'тўлов турлари', 'maxsus imkoniyatlar'],
        paths: ['settings.features', 'finance.kassa'],
    },
    {
        id: 'settings.dhp',
        module: 'settings',
        roles: DESK,
        titleUz: 'DHP (davlat platformasi) ga qanday ulanaman?',
        titleRu: 'Как подключиться к DHP (государственной платформе)?',
        bodyUz: body(`
            DHP — Raqamli sog'liqni saqlash davlat platformasi (dhp.uz). Ulangach, bemor, shifokor, qabul, tashxis va muolajalar unga avtomatik yuboriladi.
            1. Kalitlarni (client_id va client_secret) platforma operatori UZINFOCOM dan olasiz. Avval sinov muhiti, keyin ishchi.
            2. Sozlamalar → Klinika bo'limida «STIR (INN)» ni kiriting.
            3. Sozlamalar → Integratsiyalar → DHP bo'limida «DHP'ga yuborishni yoqish» ni yoqing.
            4. «Muhit», «Client ID» va «Client Secret» ni to'ldiring.
            5. «Ulanishni tekshirish» ni bosing — klinika STIR bo'yicha topilsa, «Organization ID» o'zi to'ladi. Keyin «Saqlash» ni bosing.
            Pastdagi «Yuborish holati» da nechta yozuv yuborilgani va xatolar ko'rinadi; xato bo'lsa «Xatolarni qayta urinish» ni bosing.
            Shifokorlar uchun tug'ilgan sana, jins va mutaxassislik kodi Xodimlar bo'limida kiritiladi.
        `),
        bodyRu: body(`
            DHP — государственная платформа цифрового здравоохранения (dhp.uz). После подключения пациенты, врачи, приёмы, диагнозы и процедуры отправляются туда автоматически.
            1. Ключи (client_id и client_secret) выдаёт оператор платформы UZINFOCOM. Сначала тестовая среда, затем рабочая.
            2. В разделе Настройки → Клиника укажите «ИНН».
            3. В разделе Настройки → Интеграции → DHP включите «Включить отправку в DHP».
            4. Заполните «Среда», «Client ID» и «Client Secret».
            5. Нажмите «Проверить подключение» — если клиника найдена по ИНН, «Organization ID» заполнится сам. Затем нажмите «Сохранить».
            Ниже в блоке «Статус отправки» видно, сколько записей отправлено, и ошибки; при ошибках нажмите «Повторить ошибки».
            Дата рождения, пол и код специальности врачей указываются в разделе Сотрудники.
        `),
        keywords: ['dhp', 'davlat platformasi', 'dmed', 'ssv', 'uzinfocom', 'client id', 'гос платформа', 'дхп', 'дмед', 'минздрав интеграция', 'давлат платформаси'],
        paths: ['settings.dhp', 'settings.clinic'],
    },
    {
        id: 'settings.ai-key',
        module: 'settings',
        roles: OWNER,
        titleUz: "DentaAI «xizmat band» deyapti — o'z AI kalitimni qanday ulayman?",
        titleRu: 'DentaAI пишет, что сервис занят — как подключить свой ключ AI?',
        bodyUz: body(`
            DentaAI umumiy kalit bilan ishlaydi, u barcha klinikalarga taqsimlanadi — tig'iz paytda «xizmat band» xabari chiqishi mumkin. O'z kalitingizni ulasangiz, kutish yo'qoladi. Kalit bepul olinadi. Buni faqat klinika rahbari qila oladi.
            1. aistudio.google.com/apikey manzilini oching va Google hisobingiz bilan kiring.
            2. «Create API key» tugmasini bosing va chiqqan kalitni nusxalang.
            3. DentaCRM da Sozlamalar → Integratsiyalar → AI kaliti bo'limini oching.
            4. «Provayder» da Google Gemini ni qoldiring, kalitni «Kalit» maydoniga qo'ying.
            5. «Tekshirish va saqlash» ni bosing — kalit darhol sinab ko'riladi, xato bo'lsa sababi yoziladi.
            Kalit ulangach «O'z kalitingiz ulangan» yozuvi chiqadi. «Kalitni o'chirish» bosilsa, klinika yana umumiy kalitga qaytadi.
        `),
        bodyRu: body(`
            DentaAI работает на общем ключе, который делится между всеми клиниками — в часы пик может появиться сообщение, что сервис занят. Со своим ключом ждать не придётся. Ключ бесплатный. Подключить его может только руководитель клиники.
            1. Откройте aistudio.google.com/apikey и войдите в свой аккаунт Google.
            2. Нажмите «Create API key» и скопируйте полученный ключ.
            3. В DentaCRM откройте Настройки → Интеграции → Ключ AI.
            4. В поле «Провайдер» оставьте Google Gemini, вставьте ключ в поле «Ключ».
            5. Нажмите «Проверить и сохранить» — ключ сразу проверяется, при ошибке будет показана причина.
            После подключения появится надпись «Ваш ключ подключен». Если нажать «Удалить ключ», клиника снова перейдёт на общий ключ.
        `),
        keywords: ['ai kaliti', 'dentaai band', 'xizmat band', 'gemini kalit', 'api key', 'ai ishlamayapti', 'ключ ai', 'dentaai занят', 'сервис занят', 'ключ gemini', 'ai калити', 'suniy intellekt'],
        paths: ['settings.ai'],
    },
    {
        id: 'settings.journal',
        module: 'settings',
        roles: OWNER,
        titleUz: "Kim nimani o'zgartirgani yoki o'chirganini qayerdan ko'raman?",
        titleRu: 'Где посмотреть, кто что изменил или удалил?',
        bodyUz: body(`
            Buning uchun Sozlamalar → Jurnal bo'limi bor. Uni faqat klinika rahbari ko'radi.
            «O'zgarishlar jurnali» da kim, qachon, nimani qo'shgani, o'zgartirgani yoki o'chirgani yoziladi: bemorlar, qabullar, to'lovlar, xarajatlar, xizmatlar, xodimlar va boshqalar.
            1. Sozlamalar → Jurnal bo'limini oching.
            2. Davrni tanlang: «Bugun», «7 kun», «30 kun» yoki «Hammasi».
            3. Kerak bo'lsa xodim, bo'lim yoki amal bo'yicha saralang, yoki qidiruvga bemor ismi, summa yoki xodim ismini yozing.
            4. Qatorni bosing — aynan nima o'zgargani ochiladi.
            Yozuvlar 1 yil saqlanadi.
            Masalan, to'lov o'chirilgan yoki summasi o'zgartirilgan bo'lsa, buni kim va qachon qilgani shu yerda ko'rinadi.
        `),
        bodyRu: body(`
            Для этого есть раздел Настройки → Журнал. Его видит только руководитель клиники.
            В блоке «Журнал изменений» записано, кто, когда и что добавил, изменил или удалил: пациенты, приёмы, платежи, расходы, услуги, сотрудники и другое.
            1. Откройте Настройки → Журнал.
            2. Выберите период: «Сегодня», «7 дней», «30 дней» или «Всё».
            3. При необходимости отфильтруйте по сотруднику, разделу или действию либо введите в поиск имя пациента, сумму или имя сотрудника.
            4. Нажмите на строку — откроется, что именно изменилось.
            Записи хранятся 1 год.
            Например, если платёж удалили или изменили его сумму, здесь видно, кто и когда это сделал.
        `),
        keywords: ['jurnal', "kim o'chirdi", "kim o'zgartirdi", 'tarix', 'audit', "to'lov o'chirilgan", 'журнал', 'кто удалил', 'кто изменил', 'история изменений', 'журнал изменений', 'ким ўчирди'],
        paths: ['settings.journal'],
    },

    // ─── Ombor, laboratoriya, navbat, lidlar ─────────────────────────────────
    {
        id: 'inventory.stock',
        module: 'inventory',
        roles: DESK,
        titleUz: "Omborga material qo'shish, kirim va chiqim qilish",
        titleRu: 'Склад: как добавить материал, оформить приход и списание',
        bodyUz: body(`
            1. Ombor bo'limida «Yangi Material» ni bosing.
            2. «Material nomi», «O'lchov birligi» (dona, quti...), «Boshlang'ich miqdor» va «Minimal miqdor (ogohlantirish uchun)» ni kiriting. «Umumiy narxi (ixtiyoriy)» yozilsa, Moliya bo'limida «Ombor» kategoriyali xarajat bo'lib yoziladi.
            3. «Qo'shish» ni bosing.
            Kirim: material qatoridagi yashil «+» belgisini bosing, miqdorni (bo'lsa, xarajat summasini ham) kiriting.
            Chiqim: to'q sariq «−» belgisini bosing va miqdorni kiriting. Ombordagidan ko'p chiqim qilib bo'lmaydi.
            Miqdor minimal darajaga tushsa, material yonida «Kam qoldi» belgisi chiqadi va bildirishnoma keladi; to'ldirilgach «Yetarli» ga qaytadi.
            Shifokor ishlatgan materialni bemor kartasida yozsa, u ombordan o'zi kamayadi.
            Material o'chirilsa, uning butun tarixi ham o'chadi.
        `),
        bodyRu: body(`
            1. В разделе Склад нажмите «Новый материал».
            2. Заполните «Название материала», «Единица измерения» (шт, уп...), «Начальное количество» и «Минимальное количество (для уведомления)». Если указать «Общая стоимость (необязательно)», в разделе Финансы запишется расход категории «Склад».
            3. Нажмите «Добавить».
            Приход: нажмите зелёный значок «+» в строке материала, введите количество (и сумму расхода, если есть).
            Списание: нажмите оранжевый значок «−» и введите количество. Списать больше, чем есть на складе, нельзя.
            Когда количество опускается до минимального, рядом с материалом появляется отметка «Мало» и приходит уведомление; после пополнения она сменится на «Достаточно».
            Если врач записывает использованный материал в карте пациента, он списывается со склада сам.
            При удалении материала удаляется и вся его история.
        `),
        keywords: ['ombor', "material qo'shish", 'kirim', 'chiqim', 'kam qoldi', 'material tugadi', 'склад', 'добавить материал', 'приход', 'списание', 'остаток материалов', 'омбор'],
        paths: ['inventory'],
    },
    {
        id: 'lab.orders',
        module: 'lab',
        roles: ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN'],
        titleUz: 'Laboratoriyaga buyurtma berish va holatini kuzatish',
        titleRu: 'Лаборатория: как создать заказ и следить за его статусом',
        bodyUz: body(`
            Avval texnik bo'lishi kerak: Xodimlar → Ro'yxat bo'limida «Xodim qo'shish» orqali texnik qo'shing. Texnik bo'lmasa, «Texniklar qo'shilmagan» yozuvi chiqadi.
            1. Laboratoriya bo'limida «Buyurtma qo'shish» ni bosing.
            2. Bemorni qidirib tanlang, «Texnik», «Buyurtma turi» (koronka, protez...) va «Muddat (deadline)» ni to'ldiring — bular majburiy.
            3. Xohlasangiz material, tish raqamlari, narx, «Ustuvorlik» va texnikka izoh yozing.
            4. «Yaratish» ni bosing.
            Holat tugmalar bilan o'zgaradi: «Kutilmoqda» da «Boshlash», «Ishlayapti» da «Tayyor», «Tayyor» da «Topshirish» — oxiri «Topshirildi».
            «Tayyor» bo'lganda shifokorga bildirishnoma keladi. «Topshirildi» bo'lganda buyurtma narxi Moliya bo'limiga laboratoriya xarajati bo'lib yoziladi. Muddati o'tgan buyurtmada «Muddati o'tgan!» belgisi chiqadi.
            Texnik o'z logini bilan kirsa, faqat Laboratoriya bo'limini ko'radi.
        `),
        bodyRu: body(`
            Сначала нужен техник: добавьте его в разделе Сотрудники → Список кнопкой «Добавить сотрудника». Если техников нет, появится надпись «Техники не добавлены».
            1. В разделе Лаборатория нажмите «Добавить заказ».
            2. Найдите и выберите пациента, заполните «Техник», «Тип заказа» (коронка, протез...) и «Срок (deadline)» — эти поля обязательны.
            3. При желании укажите материал, номера зубов, цену, «Приоритет» и комментарий для техника.
            4. Нажмите «Создать».
            Статус меняется кнопками: при «Ожидается» — «Начать», при «В работе» — «Готово», при «Готово» — «Сдать», в конце — «Выдано».
            При статусе «Готово» врачу приходит уведомление. При «Выдано» цена заказа записывается в раздел Финансы как лабораторный расход. У просроченного заказа появляется отметка «Срок истек!».
            Техник, вошедший под своим логином, видит только раздел Лаборатория.
        `),
        keywords: ['laboratoriya', 'buyurtma', 'texnik', 'koronka buyurtma', 'zubtexnik', "muddati o'tgan", 'лаборатория', 'заказ в лабораторию', 'техник', 'зубной техник', 'коронка', 'лаборатория буюртма'],
        paths: ['lab', 'staff.list'],
    },
    {
        id: 'queue.call-tv',
        module: 'queue',
        roles: CLINICAL,
        titleUz: 'Onlayn navbat: bemorni chaqirish va TV ekranini yoqish',
        titleRu: 'Онлайн-очередь: как вызвать пациента и включить экран ТВ',
        bodyUz: body(`
            Online Navbat bo'limida bugungi qabullar shifokorlar bo'yicha ko'rinadi: kim kabinetda, kim kutmoqda.
            1. Bemor kelganda «Navbat qo'shish» ni bosing. «Talon» belgisi yoqilgan bo'lsa, navbat raqami yozilgan talon chop etiladi.
            2. Navbati kelganda bemor yonidagi «Chaqirish» ni bosing. Kabinetda boshqa bemor bo'lsa, tizim tasdiq so'raydi.
            3. Bemor eshitmasa — «Qayta chaqirish»; xato chaqirilgan bo'lsa — «Navbatga qaytarish»; kelmagan bo'lsa — «Kelmadi».
            TV ekrani: kutish zalidagi televizorga ulangan kompyuterda shu bo'limni ochib, «TV ekrani» ni bosing. «Tabloni boshlash» chiqsa, bir marta bosing — ovoz va to'liq ekran yoqiladi. Chaqirilgan bemorning raqami va ismi ovoz chiqarib aytiladi.
            Ovoz chiqmasa: tablodagi ovoz tugmasini va televizor ovozini tekshiring. O'z kompyuteringizda ham eshitish uchun «Ovoz o'chiq» tugmasini yoqing.
            Tablodan chiqish — «Tablodan chiqish» tugmasi yoki Esc.
        `),
        bodyRu: body(`
            В разделе Онлайн очередь сегодняшние приёмы показаны по врачам: кто в кабинете, кто ждёт.
            1. Когда пациент пришёл, нажмите «Добавить в очередь». Если включена отметка «Талон», печатается талон с номером.
            2. Когда подошла очередь, нажмите «Вызвать» рядом с пациентом. Если в кабинете ещё другой пациент, система попросит подтвердить.
            3. Пациент не услышал — «Вызвать снова»; вызвали по ошибке — «Вернуть в очередь»; не пришёл — «Не пришёл».
            Экран ТВ: на компьютере, подключённом к телевизору в зале ожидания, откройте этот раздел и нажмите «Экран ТВ». Если появится «Запустить табло», нажмите один раз — включатся звук и полный экран. Номер и имя вызванного пациента объявляются голосом.
            Нет звука: проверьте кнопку звука на табло и громкость телевизора. Чтобы слышать вызовы и на своём компьютере, включите кнопку «Звук выключен».
            Выход из табло — кнопка «Выйти из табло» или Esc.
        `),
        keywords: ['navbat', 'onlayn navbat', 'chaqirish', 'tv ekran', 'tablo', 'talon', 'ovoz chiqmayapti', 'очередь', 'электронная очередь', 'вызвать пациента', 'табло', 'талон'],
        paths: ['queue'],
    },
    {
        id: 'leads.stages-convert',
        module: 'leads',
        roles: DESK,
        titleUz: "Lid qo'shish, bosqichlar va lidni bemorga aylantirish",
        titleRu: 'Лиды: как добавить, менять этапы и превратить в пациента',
        bodyUz: body(`
            Lid — hali bemor bo'lmagan murojaat. Lidlar bo'limida ular ustunlarda turadi: «Yangi», «Bog'lanildi», «O'ylanmoqda», «Yozilgan», «Rad etildi».
            Qo'shish: «Yangi Lid» ni bosing, «Mijoz ismi» (ism va familiya) va «Telefon raqami» ni kiriting; xohlasangiz xizmat, «Murojaat manbasi» va izoh. «Saqlash» ni bosing.
            Bosqichni o'zgartirish: kartani boshqa ustunga suring yoki karta pastidagi bosqich tugmasini bosing.
            Bemorga aylantirish:
            1. Karta pastidagi «Yozilgan» tugmasini bosing (yoki kartani shu ustunga suring).
            2. «Bemorga aylantirish» oynasida shifokor, sana va vaqtni tanlang.
            3. «Bemorga aylantirish» ni bosing — bemor kartasi ochiladi, qabul Kalendarga yoziladi.
            «Ism, familiya va telefon raqam kiritilishi shart.» xatosi chiqsa — lid ismi bitta so'zdan iborat. Lidni familiyasi bilan qaytadan qo'shing yoki bemorni Bemorlar bo'limida qo'lda qo'shing.
        `),
        bodyRu: body(`
            Лид — обращение человека, который ещё не стал пациентом. В разделе Лиды они стоят по колонкам: «Новый», «Связались», «Думает», «Записан», «Отказ».
            Добавление: нажмите «Новый Лид», заполните «Имя клиента» (имя и фамилия) и «Номер телефона»; при желании — услугу, «Источник обращения» и комментарий. Нажмите «Сохранить».
            Смена этапа: перетащите карточку в другую колонку или нажмите кнопку этапа внизу карточки.
            Превращение в пациента:
            1. Нажмите внизу карточки кнопку «Записан» (или перетащите карточку в эту колонку).
            2. В окне «Превратить в пациента» выберите врача, дату и время.
            3. Нажмите «Превратить в пациента» — создаётся карта пациента, приём записывается в Календарь.
            Если появилась ошибка «Ism, familiya va telefon raqam kiritilishi shart.» — имя лида состоит из одного слова. Добавьте лид заново с фамилией или создайте пациента вручную в разделе Пациенты.
        `),
        keywords: ['lid', "lid qo'shish", 'bemorga aylantirish', 'lid bosqichi', 'voronka', 'murojaat', 'лид', 'добавить лид', 'превратить в пациента', 'воронка', 'этап лида', 'лидлар'],
        paths: ['leads', 'calendar'],
    },
    {
        id: 'leads.sources-api',
        module: 'leads',
        roles: OWNER,
        titleUz: "Reklama, sayt yoki Facebook'dan lidlar o'zi tushishi uchun nima qilaman?",
        titleRu: 'Как сделать, чтобы лиды с рекламы, сайта или Facebook попадали сами?',
        bodyUz: body(`
            Tashqi manbalar (masalan, yuboraman.uz orqali Facebook va Instagram reklamasi) lidni to'g'ridan-to'g'ri DentaCRM ga yuborishi mumkin. Buni klinika rahbari sozlaydi.
            1. Sozlamalar → Integratsiyalar → Lid API bo'limini oching. Lidlar bo'limidagi «Facebook ulash» tugmasi ham shu yerga olib boradi.
            2. «Kalit yaratish» ni bosing.
            3. «So'rov manzili (endpoint)» va API kalitni nusxalab, lid yuboradigan xizmatga bering.
            Shundan keyin har bir yangi lid Lidlar bo'limida «Yangi» ustunida paydo bo'ladi, ilovada bildirishnoma, rahbar va resepshnlarga esa klinika boti orqali Telegram xabari keladi.
            Bilib qo'ying: kalitni faqat ishonchli hamkorga bering. «Yangi kalit yaratish» bosilsa, eski kalit darhol ishlamay qoladi. Bir xil raqamdan 15 daqiqa ichida qayta kelgan lid ikkinchi marta yozilmaydi.
            Qo'lda qo'shilgan lidda manba «Murojaat manbasi» ro'yxatidan tanlanadi.
        `),
        bodyRu: body(`
            Внешние источники (например, реклама в Facebook и Instagram через yuboraman.uz) могут отправлять лиды прямо в DentaCRM. Настраивает это руководитель клиники.
            1. Откройте Настройки → Интеграции → API лидов. Кнопка «Подключить Facebook» в разделе Лиды ведёт сюда же.
            2. Нажмите «Создать ключ».
            3. Скопируйте «Адрес запроса (endpoint)» и API-ключ и передайте их сервису, который будет отправлять лиды.
            После этого каждый новый лид появляется в разделе Лиды в колонке «Новый», в приложении приходит уведомление, а руководителю и ресепшн — сообщение в Telegram через бота клиники.
            Важно: передавайте ключ только надёжному партнёру. Если нажать «Создать новый ключ», старый сразу перестанет работать. Лид с того же номера, пришедший повторно в течение 15 минут, второй раз не записывается.
            У лида, добавленного вручную, источник выбирается в списке «Источник обращения».
        `),
        keywords: ['lid api', 'facebook ulash', 'instagram lid', 'yuboraman', 'reklamadan lid', 'api kalit', 'api лидов', 'подключить facebook', 'лиды с рекламы', 'лиды инстаграм', 'таргет лид', 'лид апи'],
        paths: ['settings.leadApi', 'leads'],
    },

    // ─── Tizimga kirish va parol ─────────────────────────────────────────────
    {
        id: 'account.wrong-password',
        module: 'account',
        roles: '*',
        titleUz: "Kirishda «Login yoki parol noto'g'ri» chiqyapti",
        titleRu: "При входе появляется «Login yoki parol noto'g'ri»",
        bodyUz: body(`
            Bu nimani anglatadi: bunday login yo'q yoki parol mos kelmadi. Tartib bilan tekshiring:
            1. Login aynan sizga berilgandek yozilganmi: katta-kichik harflar farq qiladi, ortiqcha belgi tushib qolmasin.
            2. Parolda Caps Lock yoqilib qolmaganmi, klaviatura tili to'g'rimi. Parol maydonidagi ko'z belgisini bosib, nima yozilganini ko'ring.
            3. Brauzer eski parolni o'zi qo'yib yubormayaptimi — maydonni tozalab, qo'lda yozing.
            4. Parolingiz yaqinda o'zgartirilgan bo'lishi mumkin.
            Baribir kira olmasangiz, yangi parol oling:
            - shu botda «🔑 Parolni tiklash» tugmasini bosing — so'rov tasdiqlangach, yangi parol shu chatga keladi;
            - yoki klinika rahbaridan yangi parol qo'yib berishni so'rang (Xodimlar → Ro'yxat).
            Kirish sahifasidagi «Telegram orqali yordam» tugmasi ham shu botni ochadi.
        `),
        bodyRu: body(`
            Что это значит: такого логина нет или пароль не подошёл («неверный логин или пароль»). Проверьте по порядку:
            1. Логин введён точно так, как вам выдали: большие и маленькие буквы различаются, не должно быть лишних символов.
            2. Не включён ли Caps Lock и та ли раскладка клавиатуры. Нажмите значок глаза в поле пароля и посмотрите, что введено.
            3. Не подставляет ли браузер старый пароль — очистите поле и введите вручную.
            4. Возможно, ваш пароль недавно меняли.
            Если войти всё равно не удаётся, получите новый пароль:
            - нажмите в этом боте кнопку «🔑 Восстановить пароль» — после подтверждения запроса новый пароль придёт в этот чат;
            - или попросите руководителя клиники задать новый пароль (Сотрудники → Список).
            Кнопка «Помощь в Telegram» на странице входа тоже открывает этот бот.
        `),
        keywords: ["login yoki parol noto'g'ri", 'kira olmayapman', 'parol xato', 'login xato', 'tizimga kirolmayapman', 'kirish xatosi', 'неверный логин или пароль', 'не могу войти', 'пароль не подходит', 'не входит', 'кира олмаяпман', 'parol notogri'],
        paths: ['staff.list'],
    },
    {
        id: 'account.clinic-blocked',
        module: 'account',
        roles: OWNER,
        titleUz: 'Kirishda «Klinika bloklangan yoki kutilmoqda» chiqyapti',
        titleRu: 'При входе появляется «Klinika bloklangan yoki kutilmoqda»',
        bodyUz: body(`
            Bu xato klinika rahbari kirayotganda chiqadi va klinika hisobi hozir faol emasligini bildiradi: u to'xtatib qo'yilgan (odatda obuna to'lanmagani uchun) yoki hali faollashtirilmagan.
            Login va parolingiz to'g'ri — muammo ularda emas, shuning uchun parolni almashtirish yordam bermaydi.
            Nima qilish kerak:
            1. Obuna to'lovi qilinmagan bo'lsa — to'lovni qiling.
            2. Shu botda «💳 To'lov qildim» tugmasini bosib, to'lov cheki rasmini yuboring. To'lov tasdiqlangach, hisob ochiladi.
            3. Yangi ro'yxatdan o'tgan bo'lsangiz yoki to'lov qilingan bo'lsa-yu, xato ketmasa — shu botga yozing.
            Ma'lumotlaringiz o'chmaydi: hisob ochilgach, hammasi joyida bo'ladi.
            Bu holatda shifokor va resepshnlar tizimga kira oladi, lekin ularda «Tizim bloklandi» oynasi chiqadi.
        `),
        bodyRu: body(`
            Эта ошибка появляется при входе руководителя клиники и означает, что аккаунт клиники сейчас не активен: он приостановлен (обычно из-за неоплаченной подписки) или ещё не активирован.
            Логин и пароль у вас верные — дело не в них, поэтому смена пароля не поможет.
            Что делать:
            1. Если подписка не оплачена — оплатите её.
            2. Нажмите в этом боте кнопку «💳 Я оплатил» и отправьте фото чека об оплате. После подтверждения оплаты аккаунт откроется.
            3. Если вы только зарегистрировались или оплата уже была, а ошибка не исчезает — напишите в этот бот.
            Ваши данные не удаляются: когда аккаунт откроют, всё будет на месте.
            Врачи и ресепшн в этой ситуации войти могут, но у них появляется окно «Система заблокирована».
        `),
        keywords: ['klinika bloklangan', 'bloklangan yoki kutilmoqda', 'hisob bloklandi', 'klinika yopildi', 'kirolmayapman blok', 'клиника заблокирована', 'аккаунт заблокирован', 'блокировка клиники', 'клиника блокланган', 'blok'],
        paths: ['settings.plan'],
    },
    {
        id: 'account.staff-blocked',
        module: 'account',
        roles: '*',
        titleUz: 'Kirishda «Shifokor bloklangan» yoki «Resepshn bloklangan» chiqyapti',
        titleRu: 'При входе появляется «Shifokor bloklangan» или «Resepshn bloklangan»',
        bodyUz: body(`
            Bu nimani anglatadi: login va parol to'g'ri, lekin sizning hisobingiz klinikada o'chirib qo'yilgan — xodim Xodimlar ro'yxatidan o'chirilganda shunday bo'ladi. Texniklarda xuddi shu holat «Lab texnik akkaunti faol emas» deb chiqadi.
            Buni faqat klinika rahbari hal qiladi:
            1. Rahbarga murojaat qiling.
            2. Rahbar Xodimlar → Ro'yxat bo'limida «Xodim qo'shish» orqali sizni qaytadan qo'shadi.
            3. Yangi login tanlash kerak bo'ladi: o'chirilgan hisobning eski logini band bo'lib qoladi va «Bu login (username) allaqachon band.» xatosi chiqadi.
            Xodim ataylab o'chirilgan bo'lsa (ishdan ketgan), hech narsa qilish shart emas: u tizimga kira olmaydi, uning qabullari va to'lovlari esa tarixda saqlanib qoladi.
        `),
        bodyRu: body(`
            Что это значит: логин и пароль верные, но ваш аккаунт в клинике отключён — так бывает, когда сотрудника удалили из списка сотрудников. У техников то же самое выглядит как «Lab texnik akkaunti faol emas».
            Решить это может только руководитель клиники:
            1. Обратитесь к руководителю.
            2. Руководитель заново добавит вас в разделе Сотрудники → Список кнопкой «Добавить сотрудника».
            3. Понадобится новый логин: старый логин удалённого аккаунта остаётся занятым, и появится ошибка «Bu login (username) allaqachon band.».
            Если сотрудника удалили намеренно (уволился), ничего делать не нужно: войти он не сможет, а его приёмы и платежи сохраняются в истории.
        `),
        keywords: ['shifokor bloklangan', 'resepshn bloklangan', 'xodim bloklangan', 'login band', 'akkaunt faol emas', 'ochirilgan xodim', 'врач заблокирован', 'ресепшн заблокирован', 'сотрудник заблокирован', 'логин занят', 'шифокор блокланган'],
        paths: ['staff.list'],
    },
    {
        id: 'account.clinic-deleted',
        module: 'account',
        roles: ['DOCTOR', 'RECEPTIONIST'],
        titleUz: "Kirishda «Klinika tizimdan o'chirilgan» chiqyapti",
        titleRu: "При входе появляется «Klinika tizimdan o'chirilgan»",
        bodyUz: body(`
            Bu xato shifokor yoki resepshn kirayotganda chiqadi: login va parol to'g'ri, lekin shu login tegishli bo'lgan klinikaning hisobi DentaCRM dan o'chirilgan.
            Tekshiring:
            1. To'g'ri login bilan kiryapsizmi: avval boshqa klinikada ishlagan bo'lsangiz, eski klinikaning loginini yozgan bo'lishingiz mumkin. Hozirgi klinikangiz rahbaridan yangi login va parol so'rang — u Xodimlar → Ro'yxat bo'limida beriladi.
            2. Klinika ishlab turgan bo'lsa-yu, bu xato chiqayotgan bo'lsa — klinika rahbari shu botga yozsin, hisob holatini tekshiramiz.
            Parolni almashtirish bu xatoni tuzatmaydi.
        `),
        bodyRu: body(`
            Эта ошибка появляется при входе врача или ресепшн: логин и пароль верные, но аккаунт клиники, к которой относится этот логин, удалён из DentaCRM.
            Проверьте:
            1. Тот ли логин вы вводите: если раньше вы работали в другой клинике, возможно, вы ввели логин старой клиники. Попросите новый логин и пароль у руководителя нынешней клиники — их выдают в разделе Сотрудники → Список.
            2. Если клиника работает, а ошибка всё равно появляется — пусть руководитель клиники напишет в этот бот, мы проверим состояние аккаунта.
            Смена пароля эту ошибку не исправит.
        `),
        keywords: ["klinika o'chirilgan", "tizimdan o'chirilgan", 'klinika yoq', 'eski klinika login', 'kirish xatosi klinika', 'клиника удалена', 'удалена из системы', 'клиника не найдена', 'клиника ўчирилган', 'klinika ochirilgan'],
    },
    {
        id: 'account.forgot-password',
        module: 'account',
        roles: '*',
        titleUz: 'Parolni unutdim — qanday tiklayman?',
        titleRu: 'Забыл пароль — как восстановить?',
        bodyUz: body(`
            Parol shifrlangan holda saqlanadi, shuning uchun eski parolni hech kim ko'ra olmaydi — faqat yangisini olish mumkin.
            Shu bot orqali:
            1. Shu botda «🔑 Parolni tiklash» tugmasini bosing. Bot sizni tanishi kerak: Telegram raqamingiz DentaCRM dagi raqamingiz bilan bir xil bo'lsin.
            2. Klinika rahbari bo'lsangiz — bot tasdiq so'raydi yoki so'rovni tekshiruvga yuboradi. Xodim bo'lsangiz — so'rov klinika rahbariga boradi (u ham shu botga ulangan bo'lishi kerak).
            3. Tasdiqlangach, yangi parol shu chatga keladi. Eski parol o'sha zahoti ishlamay qoladi.
            Rahbar orqali: rahbar Xodimlar → Ro'yxat bo'limida sizning ma'lumotlaringizni tahrirlab, «Tizimga kirish ma'lumotlari» qismidagi «Parol» maydoniga yangi parol yozadi va saqlaydi. Loginingiz o'sha oynadagi «Login (Username)» maydonida ko'rinadi.
            Kirgach, parolni o'zingizga qulayiga almashtiring: sahifa tepasidagi «Parolni almashtirish».
        `),
        bodyRu: body(`
            Пароль хранится в зашифрованном виде, поэтому старый пароль не может увидеть никто — можно только получить новый.
            Через этот бот:
            1. Нажмите в этом боте кнопку «🔑 Восстановить пароль». Бот должен вас узнать: номер в Telegram должен совпадать с вашим номером в DentaCRM.
            2. Если вы руководитель клиники — бот попросит подтвердить или отправит запрос на проверку. Если вы сотрудник — запрос уйдёт руководителю клиники (он тоже должен быть подключён к этому боту).
            3. После подтверждения новый пароль придёт в этот чат. Старый пароль сразу перестанет работать.
            Через руководителя: руководитель в разделе Сотрудники → Список открывает ваши данные на редактирование, в блоке «Данные для входа в систему» вводит новый пароль в поле «Пароль» и нажимает «Сохранить». Ваш логин виден там же, в поле «Login (Username)».
            После входа смените пароль на удобный: «Сменить пароль» вверху страницы.
        `),
        keywords: ['parolni unutdim', 'parol esimda yoq', 'parolni tiklash', 'yangi parol', 'login esimda yoq', 'parol ochirish', 'забыл пароль', 'восстановить пароль', 'сбросить пароль', 'новый пароль', 'паролни унутдим', 'parol unutildi'],
        paths: ['staff.list'],
    },
    {
        id: 'account.change-password',
        module: 'account',
        roles: '*',
        titleUz: "O'z parolimni qanday almashtiraman?",
        titleRu: 'Как сменить свой пароль?',
        bodyUz: body(`
            1. Tizimga kiring. Sahifa tepasida, ismingiz yonidagi «Parolni almashtirish» tugmasini (kalit belgisi) bosing. Telefonda bu tugma yon menyuning pastida turadi.
            2. «Hozirgi parol» ni kiriting.
            3. «Yangi parol» ni yozing — kamida 6 ta belgi.
            4. «Yangi parolni takrorlang» maydoniga uni yana bir marta yozing.
            5. «Saqlash» ni bosing.
            Xatolar: «Yangi parol kamida 6 ta belgidan iborat bo'lsin» — parol qisqa; «Yangi parollar bir xil emas» — ikki maydonga har xil yozilgan.
            Hozirgi parolni eslamasangiz, bu yerdan almashtirib bo'lmaydi: shu botda «🔑 Parolni tiklash» ni bosing yoki klinika rahbaridan yangi parol so'rang (Xodimlar → Ro'yxat).
            Demo rejimda bu tugma ko'rinmaydi.
        `),
        bodyRu: body(`
            1. Войдите в систему. Вверху страницы рядом со своим именем нажмите кнопку «Сменить пароль» (значок ключа). На телефоне эта кнопка находится внизу бокового меню.
            2. Заполните поле «Текущий пароль».
            3. Введите «Новый пароль» — не менее 6 символов.
            4. Введите его ещё раз в поле «Повторите новый пароль».
            5. Нажмите «Сохранить».
            Ошибки: «Новый пароль должен быть не короче 6 символов» — пароль слишком короткий; «Новые пароли не совпадают» — в двух полях введено разное.
            Если вы не помните текущий пароль, сменить его здесь не получится: нажмите в этом боте «🔑 Восстановить пароль» или попросите новый пароль у руководителя клиники (Сотрудники → Список).
            В демо-режиме этой кнопки нет.
        `),
        keywords: ['parolni almashtirish', "parol o'zgartirish", 'yangi parol qoyish', 'parolni yangilash', 'oz parolim', 'сменить пароль', 'поменять пароль', 'изменить пароль', 'новый пароль', 'паролни алмаштириш', 'parol almashtirish'],
        paths: ['staff.list'],
    },
    {
        id: 'account.demo-mode',
        module: 'account',
        roles: '*',
        titleUz: "Demo rejim nima va undagi ma'lumotlar saqlanadimi?",
        titleRu: 'Что такое демо-режим и сохраняются ли в нём данные?',
        bodyUz: body(`
            Demo rejim — DentaCRM ni tayyor namunaviy klinika misolida sinab ko'rish. Unda sahifa tepasida «DEMO REJIM» belgisi turadi.
            Bilib qo'ying:
            - Demo'dagi bemorlar, qabullar va to'lovlar namuna — haqiqiy emas.
            - Siz kiritgan o'zgarishlar faqat shu brauzerda turadi: serverga yozilmaydi va boshqa qurilmada ko'rinmaydi.
            - Demo har kuni bugungi kunga moslab yangilanadi.
            - Haqiqiy SMS va Telegram xabarlari ketmaydi, bot ulanmaydi, parolni almashtirish tugmasi yo'q. Ba'zi amallarda «Demo rejimida bu amal mavjud emas» yozuvi chiqadi.
            Haqiqiy ish uchun demo'dan chiqing («Chiqish») va o'z klinikangiz login-paroli bilan kiring. Demo'da kiritilgan ma'lumotlar haqiqiy hisobga o'tmaydi.
            O'z hisobingiz hali bo'lmasa — shu botga yozing.
        `),
        bodyRu: body(`
            Демо-режим — это возможность попробовать DentaCRM на готовой учебной клинике. В нём вверху страницы стоит отметка «ДЕМО-РЕЖИМ».
            Важно знать:
            - Пациенты, приёмы и платежи в демо — учебные, не настоящие.
            - Ваши изменения остаются только в этом браузере: на сервер они не записываются и на другом устройстве не видны.
            - Демо каждый день обновляется под текущую дату.
            - Настоящие SMS и сообщения в Telegram не уходят, бот не подключается, кнопки смены пароля нет. В некоторых действиях появляется надпись «Demo rejimida bu amal mavjud emas».
            Для настоящей работы выйдите из демо («Выйти») и войдите с логином и паролем своей клиники. Данные из демо в настоящий аккаунт не переносятся.
            Если своего аккаунта ещё нет — напишите в этот бот.
        `),
        keywords: ['demo', 'demo rejim', 'sinab korish', "demo ma'lumot", 'demoda saqlanmadi', 'demo klinika', 'демо', 'демо режим', 'попробовать', 'демо данные', 'демо режими', 'demo akkaunt'],
    },

    // ─── Obuna va to'lov ─────────────────────────────────────────────────────
    {
        id: 'billing.expiry-blocked',
        module: 'billing',
        roles: '*',
        titleUz: 'Obuna muddati qachon tugaydi va «Tizim bloklandi» oynasi nimani anglatadi?',
        titleRu: 'Когда заканчивается подписка и что значит окно «Система заблокирована»?',
        bodyUz: body(`
            Muddatni ko'rish: Sozlamalar → Tarif bo'limida «Amal qilish muddati» — tugash sanasi va necha kun qolgani. Sinov davrida tarif nomi yonida «Sinov davri» belgisi turadi. Tugashiga 7 kun qolganda rahbarga bildirishnoma keladi.
            Muddat tugagan kunning ertasidan boshlab har bir xodimda «Tizim bloklandi» oynasi chiqadi: «Sizning tarifingizning amal qilish muddati tugagan.» Oyna yopilmaydi va ishlashga qo'ymaydi; undagi «Telegram orqali yozish» tugmasi shu botni ochadi. Hisob boshqa sabab bilan to'xtatilgan bo'lsa ham shu oyna chiqadi.
            Ma'lumotlaringiz o'chmaydi — bemorlar, qabullar va to'lovlar joyida turadi.
            Ochish uchun:
            1. Obuna to'lovini qiling.
            2. Shu botda «💳 To'lov qildim» tugmasini bosib, to'lov cheki rasmini yuboring.
            3. To'lov tasdiqlangach, muddat uzaytiriladi. Sahifani yangilang — oyna yo'qoladi.
        `),
        bodyRu: body(`
            Где посмотреть срок: в разделе Настройки → Тариф строка «Действует до» — дата окончания и сколько дней осталось. В пробный период рядом с названием тарифа стоит отметка «Пробный период». За 7 дней до окончания руководителю приходит уведомление.
            Со следующего дня после окончания срока у каждого сотрудника появляется окно «Система заблокирована»: «Срок действия вашего тарифа истёк.» Окно не закрывается и не даёт работать; кнопка «Написать в Telegram» в нём открывает этот бот. То же окно появляется, если аккаунт приостановлен по другой причине.
            Ваши данные не удаляются — пациенты, приёмы и платежи остаются на месте.
            Чтобы открыть доступ:
            1. Оплатите подписку.
            2. Нажмите в этом боте кнопку «💳 Я оплатил» и отправьте фото чека об оплате.
            3. После подтверждения оплаты срок продлят. Обновите страницу — окно исчезнет.
        `),
        keywords: ['tizim bloklandi', 'obuna tugadi', 'muddat tugadi', 'sinov davri', 'tarif muddati', 'dastur ochilmayapti', 'система заблокирована', 'подписка закончилась', 'пробный период', 'срок тарифа', 'тизим блокланди', 'obuna muddati'],
        paths: ['settings.plan'],
    },
    {
        id: 'billing.how-to-pay',
        module: 'billing',
        roles: DESK,
        titleUz: "Obuna uchun to'lovni qanday qilaman?",
        titleRu: 'Как оплатить подписку?',
        bodyUz: body(`
            1. To'lov summasi va rekvizitlarini shu botdan olasiz.
            2. To'lovni amalga oshiring.
            3. Shu botda «💳 To'lov qildim» tugmasini bosing.
            4. To'lov cheki rasmini (skrinshot yoki surat) shu chatga yuboring. Chekda summa va sana aniq ko'rinsin.
            5. Bot «Chek qabul qilindi» deb javob beradi. Chek tekshirilgach, obuna uzaytiriladi va shu chatga xabar keladi.
            6. DentaCRM da sahifani yangilang va Sozlamalar → Tarif bo'limida «Amal qilish muddati» yangilanganini tekshiring.
            Bilib qo'ying: chek yuborilmasa, to'lov o'zi tasdiqlanmaydi. Bot qaysi klinika uchun to'layotganingizni bilishi kerak: klinikangizni so'rasa, telefon raqamingizni yuboring yoki DentaCRM dagi «Yordam» tugmasi orqali kiring.
            To'lov muddat tugashidan oldin qilinsa, ish to'xtab qolmaydi — qancha kun qolgani Tarif bo'limida ko'rinadi.
        `),
        bodyRu: body(`
            1. Сумму и реквизиты для оплаты вы получаете в этом боте.
            2. Произведите оплату.
            3. Нажмите в этом боте кнопку «💳 Я оплатил».
            4. Отправьте в этот чат фото чека об оплате (скриншот или снимок). На чеке должны быть хорошо видны сумма и дата.
            5. Бот ответит «Чек получен». После проверки чека подписка будет продлена, и в этот чат придёт сообщение.
            6. Обновите страницу в DentaCRM и проверьте в разделе Настройки → Тариф, что строка «Действует до» изменилась.
            Важно: без отправленного чека оплата сама не подтверждается. Бот должен знать, за какую клинику вы платите: если он попросит указать клинику, отправьте свой номер телефона или зайдите через кнопку «Помощь» в DentaCRM.
            Если оплатить до окончания срока, работа не прервётся — сколько дней осталось, видно в разделе Тариф.
        `),
        keywords: ["to'lov qilish", "obuna to'lovi", 'qanday tolayman', "to'lov qildim", 'chek yuborish', 'tarif tolovi', 'как оплатить', 'оплата подписки', 'отправить чек', 'продлить подписку', 'тўлов қилиш', 'obunani uzaytirish'],
        paths: ['settings.plan'],
    },
    {
        id: 'billing.plan-change',
        module: 'billing',
        roles: DESK,
        titleUz: "Tarifimda nechta shifokor bo'lishi mumkin va tarifni qanday o'zgartiraman?",
        titleRu: 'Сколько врачей допускает мой тариф и как сменить тариф?',
        bodyUz: body(`
            Joriy tarifni ko'rish: Sozlamalar → Tarif bo'limida «Joriy Tarif» — tarif nomi, «Shifokorlar» qatori (masalan 3 / 5: 3 ta band, 5 tagacha mumkin), «Amal qilish muddati» va tarifga kiradigan imkoniyatlar ro'yxati.
            Shifokorlar chegarasi:
            - Hisobga faqat shifokorlar kiradi; resepshn va texniklar soni cheklanmagan.
            - O'chirilgan shifokor hisobdan chiqadi — o'rni bo'shaydi.
            - Chegaraga yetganda yangi shifokor qo'shib bo'lmaydi: «Cheklovlarni olib tashlang!» oynasi chiqadi («Sizning tarifingizda yangi shifokor qo'shib bo'lmaydi»).
            Tarifni o'zgartirish:
            1. Sozlamalar → Tarif bo'limida «Tarifni Yangilash» ni bosing.
            2. Ochilgan oynada «Telegram orqali yozish» ni bosing — shu bot ochiladi.
            3. Nechta shifokor bilan ishlamoqchi ekaningizni yoki qaysi tarifga o'tmoqchi ekaningizni yozing.
            Tarifni ilovaning o'zida almashtirib bo'lmaydi — uni biz o'zgartirib beramiz.
        `),
        bodyRu: body(`
            Где посмотреть тариф: в разделе Настройки → Тариф блок «Текущий тариф» — название тарифа, строка «Врачи» (например, 3 / 5: занято 3, можно до 5), «Действует до» и список возможностей тарифа.
            Лимит врачей:
            - В лимит входят только врачи; число ресепшн и техников не ограничено.
            - Удалённый врач из лимита выбывает — место освобождается.
            - Когда лимит исчерпан, добавить врача нельзя: появляется окно «Снимите ограничения!» («На вашем тарифе нельзя добавить ещё одного врача»).
            Как сменить тариф:
            1. В разделе Настройки → Тариф нажмите «Обновить тариф».
            2. В открывшемся окне нажмите «Написать в Telegram» — откроется этот бот.
            3. Напишите, со сколькими врачами вы хотите работать или на какой тариф хотите перейти.
            Сменить тариф в самом приложении нельзя — его меняем мы.
        `),
        keywords: ["tarifni o'zgartirish", 'tarifni yangilash', 'shifokor limiti', 'nechta shifokor', 'tarif almashtirish', 'katta tarif', 'сменить тариф', 'обновить тариф', 'лимит врачей', 'сколько врачей', 'тарифни ўзгартириш', 'tarif cheklovi'],
        paths: ['settings.plan'],
    },

    // ─── Umumiy savollar ─────────────────────────────────────────────────────
    {
        id: 'general.mobile',
        module: 'general',
        roles: '*',
        titleUz: "DentaCRM telefonda ishlaydimi? Ilova qilib o'rnatsa bo'ladimi?",
        titleRu: 'Работает ли DentaCRM на телефоне? Можно ли установить как приложение?',
        bodyUz: body(`
            Ha. DentaCRM brauzerda ochiladi — kompyuter, planshet va telefonda bir xil login bilan ishlaysiz, alohida dastur yuklash shart emas.
            Telefonga ilova kabi o'rnatish:
            - Android: saytni brauzerda oching va ekran pastidagi «Ilovani o'rnatish» tugmasini bosing.
            - iPhone yoki iPad: «Ilovani o'rnatish» ni bosing va ko'rsatmaga amal qiling: brauzerda «Ulashish» belgisini bosib, «Add to Home Screen» (Ekraniga qo'shish) ni tanlang.
            Shundan keyin DentaCRM belgisi telefon ekranida turadi va bir bosishda ochiladi.
            Tugma ko'rinmasa — ilova allaqachon o'rnatilgan, siz Kalendar sahifasidasiz (u yerda tugma yashiriladi) yoki brauzeringiz buni qo'llamaydi; sayt brauzerning o'zida ochilaveradi.
            Bemorlar uchun alohida ilova yo'q — ular klinikaning Telegram boti orqali yoziladi va eslatma oladi.
        `),
        bodyRu: body(`
            Да. DentaCRM открывается в браузере — на компьютере, планшете и телефоне вы работаете под одним логином, отдельную программу скачивать не нужно.
            Как установить на телефон как приложение:
            - Android: откройте сайт в браузере и нажмите внизу экрана кнопку «Установить приложение».
            - iPhone или iPad: нажмите «Установить приложение» и следуйте подсказке: нажмите в браузере значок «Поделиться» и выберите «Add to Home Screen» (На экран «Домой»).
            После этого значок DentaCRM появится на экране телефона и будет открываться одним нажатием.
            Если кнопки нет — приложение уже установлено, вы на странице Календарь (там кнопка скрыта) или ваш браузер это не поддерживает; сайт по-прежнему открывается в браузере.
            Отдельного приложения для пациентов нет — они записываются и получают напоминания через Telegram-бота клиники.
        `),
        keywords: ['telefonda ishlaydimi', 'mobil ilova', "ilovani o'rnatish", 'android', 'iphone', 'play market', 'на телефоне', 'мобильное приложение', 'установить приложение', 'айфон', 'телефонда', 'ilova bormi'],
    },
    {
        id: 'general.internet-data',
        module: 'general',
        roles: '*',
        titleUz: "Internet uzilib qolsa nima bo'ladi? Ma'lumotlarim qayerda saqlanadi?",
        titleRu: 'Что будет, если пропадёт интернет? Где хранятся мои данные?',
        bodyUz: body(`
            DentaCRM bulutli tizim: barcha ma'lumot — bemorlar, qabullar, to'lovlar — sizning kompyuteringizda emas, serverda saqlanadi.
            Internet uzilsa:
            - Saqlab bo'lingan ma'lumot yo'qolmaydi.
            - Internet yo'q paytda yangi yozuv saqlanmaydi. Internet qaytgach, ishni davom ettirasiz.
            - Kompyuterda internet bo'lmasa, telefon internetini tarqatib ulash ham yetarli.
            Xavfsizlik:
            - Sayt bilan aloqa shifrlangan (HTTPS).
            - Parollar shifrlangan holda saqlanadi.
            - Har bir xodim faqat o'ziga ruxsat berilgan bo'limlarni ko'radi (Xodimlar → Ruxsatlar).
            - Kim nimani o'zgartirgani Sozlamalar → Jurnal bo'limida yozib boriladi.
            Kompyuter buzilsa yoki almashtirilsa, hech narsa yo'qolmaydi: boshqa qurilmadan o'z loginingiz bilan kirasiz.
        `),
        bodyRu: body(`
            DentaCRM — облачная система: все данные — пациенты, приёмы, платежи — хранятся не на вашем компьютере, а на сервере.
            Если пропал интернет:
            - Уже сохранённые данные не теряются.
            - Пока интернета нет, новые записи не сохраняются. Когда связь вернётся, вы продолжите работу.
            - Если на компьютере нет интернета, достаточно раздать его с телефона.
            Безопасность:
            - Связь с сайтом зашифрована (HTTPS).
            - Пароли хранятся в зашифрованном виде.
            - Каждый сотрудник видит только те разделы, к которым ему дан доступ (Сотрудники → Доступы).
            - Кто что изменил, записывается в разделе Настройки → Журнал.
            Если компьютер сломался или его заменили, ничего не пропадёт: войдите со своим логином с другого устройства.
        `),
        keywords: ['internet uzilsa', 'internet yoq', "ma'lumot qayerda", 'xavfsizlik', "ma'lumot yo'qoladimi", 'oflayn', 'нет интернета', 'где хранятся данные', 'безопасность', 'данные пропадут', 'офлайн', 'интернет узилса'],
        paths: ['staff.access', 'settings.journal'],
    },
    {
        id: 'general.import-excel',
        module: 'general',
        roles: DESK,
        titleUz: "Eski bemorlar bazasini Excel'dan qanday ko'chiraman?",
        titleRu: 'Как перенести старую базу пациентов из Excel?',
        bodyUz: body(`
            Bemorlarni bittalab kiritish shart emas — ro'yxatni Excel yoki CSV fayldan yuklash mumkin. Faylda bemorning ismi va telefon raqami bo'lishi kerak, qolgan ustunlar ixtiyoriy.
            1. Bemorlar bo'limida «Excel'dan yuklash» tugmasini bosing.
            2. Faylni tanlang (xlsx, xls yoki csv). Namuna kerak bo'lsa, «Namuna faylni yuklab olish» ni bosing.
            3. Ustunlarni moslang: qaysi ustunda ism, familiya, telefon, tug'ilgan sana yozilganini ko'rsating.
            4. Tekshirish bosqichida nechta bemor qo'shilishi, nechtasi ro'yxatda borligi (ular o'tkazib yuboriladi) va xato qatorlar ko'rinadi. Xato qatorlarni yuklab olib, tuzatib, qayta yuklash mumkin.
            5. Qo'shishni tasdiqlang va tugaguncha oynani yopmang.
            Faylni qayta yuklasangiz ham, bor bemorlar ikki marta qo'shilmaydi.
            Maslahat: telefon raqamlarini bir xil ko'rinishda yozing (+998901234567) — SMS va klinika boti bemorni shu raqam orqali topadi.
        `),
        bodyRu: body(`
            Вводить пациентов по одному не обязательно — список можно загрузить из файла Excel или CSV. В файле должны быть имя пациента и номер телефона, остальные столбцы необязательны.
            1. В разделе Пациенты нажмите кнопку «Загрузить из Excel».
            2. Выберите файл (xlsx, xls или csv). Если нужен образец, скачайте его там же.
            3. Сопоставьте столбцы: укажите, в каком столбце имя, фамилия, телефон, дата рождения.
            4. На шаге проверки видно, сколько пациентов будет добавлено, сколько уже есть в списке (они пропускаются) и строки с ошибками. Их можно скачать, исправить и загрузить снова.
            5. Подтвердите добавление и не закрывайте окно до конца загрузки.
            Даже при повторной загрузке файла уже существующие пациенты второй раз не добавляются.
            Совет: записывайте номера телефонов в одном виде (+998901234567) — по этому номеру пациента находят SMS и бот клиники.
        `),
        keywords: ['excel', "exceldan yuklash", 'import', "baza ko'chirish", 'eski baza', 'bemorlarni yuklash', 'загрузить из excel', 'импорт пациентов', 'перенести базу', 'csv', 'эксель', 'eksel'],
        paths: ['patients'],
    },
    {
        id: 'general.help',
        module: 'general',
        roles: '*',
        titleUz: "Yordam kerak bo'lsa qayerga murojaat qilaman?",
        titleRu: 'Куда обращаться, если нужна помощь?',
        bodyUz: body(`
            1. DentaCRM da sahifa tepasidagi «Yordam» tugmasini bosing (qutqaruv halqasi belgisi) — Telegramda shu yordam boti ochiladi. Bot kim yozayotganini va qaysi klinikadan ekanini o'zi biladi.
            2. Savolingizni oddiy so'zlar bilan yozing yoki ovozli xabar yuboring. Xato chiqqan bo'lsa, ekrandagi xato matnini yuboring — sababi tezroq topiladi.
            3. Javob ostidagi tugmalar sizni DentaCRM ning kerakli bo'limiga olib boradi.
            4. Javob yordam bermasa yoki odam bilan gaplashmoqchi bo'lsangiz, «👤 Operator» tugmasini bosing — javob shu chatga keladi.
            Shu botda yana: «💳 To'lov qildim» — obuna to'lovi chekini yuborish; «🔑 Parolni tiklash» — unutilgan parol o'rniga yangisini olish.
            Ilovaning o'zida: sahifa tepasidagi «Qo'llanma» tugmasi har bir sahifani qadamma-qadam ko'rsatadi; DentaAI klinikangiz raqamlari bo'yicha savollarga javob beradi.
        `),
        bodyRu: body(`
            1. В DentaCRM нажмите вверху страницы кнопку «Помощь» (значок спасательного круга) — в Telegram откроется этот бот поддержки. Бот сам знает, кто пишет и из какой клиники.
            2. Напишите вопрос простыми словами или отправьте голосовое сообщение. Если появилась ошибка, пришлите её текст — причина найдётся быстрее.
            3. Кнопки под ответом ведут в нужный раздел DentaCRM.
            4. Если ответ не помог или нужен человек, нажмите кнопку «👤 Оператор» — ответ придёт в этот чат.
            В этом боте также: «💳 Я оплатил» — отправить чек об оплате подписки; «🔑 Восстановить пароль» — получить новый пароль вместо забытого.
            В самом приложении: кнопка «Обучение» вверху страницы пошагово показывает каждую страницу; DentaAI отвечает на вопросы по цифрам вашей клиники.
        `),
        keywords: ['yordam', 'yordam kerak', 'support', 'qollab quvvatlash', 'operator', 'kimga yozaman', 'помощь', 'поддержка', 'техподдержка', 'связаться с оператором', 'ёрдам', 'savolim bor'],
    },
];
