// Yordam botining foydalanuvchiga ko'rinadigan tayyor matnlari (o'zbekcha va ruscha).
// Model yozadigan javoblar bu yerda emas — faqat bot o'zi aytadigan gaplar.
// O'zbekchani kirillda yozadigan foydalanuvchiga ham lotin matni boradi: uni
// hamma o'qiy oladi, avtomatik o'girish esa xato qiladi.

import type { SupportLang } from './productMap';

export const BTN = {
    uz: {
        contact: '📱 Telefon raqamni yuborish',
        pay: "💳 To'lov qildim",
        reset: '🔑 Parolni tiklash',
        operator: '👤 Operator',
        newQuestion: '🆕 Yangi savol',
        solved: "✅ Hal bo'ldi",
        needHuman: '🙋 Operator kerak',
        yesReset: '✅ Ha, yangi parol bering',
        cancel: 'Bekor qilish',
        approve: '✅ Yangi parol berish',
        reject: '❌ Rad etish',
        isReceipt: "💳 Bu to'lov cheki",
    },
    ru: {
        contact: '📱 Отправить номер телефона',
        pay: '💳 Я оплатил',
        reset: '🔑 Восстановить пароль',
        operator: '👤 Оператор',
        newQuestion: '🆕 Новый вопрос',
        solved: '✅ Вопрос решён',
        needHuman: '🙋 Нужен оператор',
        yesReset: '✅ Да, выдать новый пароль',
        cancel: 'Отмена',
        approve: '✅ Выдать новый пароль',
        reject: '❌ Отклонить',
        isReceipt: '💳 Это чек об оплате',
    },
} as const;

/**
 * Telegramning pastki chap "Menu" tugmasi va bot profilidagi tavsif (BotFather'siz, bot o'zi o'rnatadi).
 * `/operator` ro'yxatda yo'q: guruhda jamoa uchun chatni biriktiradigan buyruq, mijozga esa pastdagi tugma bor.
 */
export const BOT_PROFILE = {
    uz: {
        commands: [
            { command: 'start', description: 'Boshlash' },
            { command: 'yangi', description: 'Yangi savol' },
            { command: 'tolov', description: "To'lov qildim" },
            { command: 'parol', description: 'Parolni tiklash' },
        ],
        description: "DentaCRM yordamchisi. Ilovadan foydalanish, SMS, to'lov va parol bo'yicha savolingizni yozing yoki ovozli xabar yuboring — javobni shu yerda olasiz. Murakkab holatda operator ulanadi.",
        shortDescription: "DentaCRM yordam xizmati: savol yozing — javob shu yerda",
    },
    ru: {
        commands: [
            { command: 'start', description: 'Начать' },
            { command: 'yangi', description: 'Новый вопрос' },
            { command: 'tolov', description: 'Я оплатил' },
            { command: 'parol', description: 'Восстановить пароль' },
        ],
        description: 'Помощник DentaCRM. Напишите или отправьте голосом вопрос по работе с приложением, SMS, оплате или паролю — ответ придёт здесь. В сложных случаях подключится оператор.',
        shortDescription: 'Поддержка DentaCRM: задайте вопрос — ответ придёт здесь',
    },
} as const;

/** Menyu tugmasi bosilganini ikki tilda ham taniydi */
export const menuAction = (text: string): 'pay' | 'reset' | 'operator' | 'newQuestion' | null => {
    for (const lang of ['uz', 'ru'] as const) {
        for (const key of ['pay', 'reset', 'operator', 'newQuestion'] as const) {
            if (BTN[lang][key] === text) return key;
        }
    }
    return null;
};

const ROLE_UZ: Record<string, string> = {
    CLINIC_ADMIN: 'rahbar', DOCTOR: 'shifokor', RECEPTIONIST: 'resepshn', LAB_TECHNICIAN: 'laborant',
    SALES_AGENT: 'sotuvchi', SUPER_ADMIN: 'DentaCRM jamoasi',
};
const ROLE_RU: Record<string, string> = {
    CLINIC_ADMIN: 'руководитель', DOCTOR: 'врач', RECEPTIONIST: 'администратор', LAB_TECHNICIAN: 'лаборант',
    SALES_AGENT: 'менеджер', SUPER_ADMIN: 'команда DentaCRM',
};
export const roleLabel = (role: string | null | undefined, lang: SupportLang = 'uz'): string =>
    (lang === 'ru' ? ROLE_RU : ROLE_UZ)[role || ''] || String(role || '');

const UZ = {
    welcomeLinked: (name: string) =>
        `Assalomu alaykum${name ? ', ' + name : ''}! Men DentaCRM yordamchisiman.\n\nSavolingizni yozing yoki ovozli xabar yuboring — ilovadan foydalanish, SMS, to'lov, parol bo'yicha yordam beraman.`,
    welcomeUnlinked:
        "Assalomu alaykum! Men DentaCRM yordamchisiman.\n\nQaysi klinikadan ekaningizni bilishim uchun pastdagi tugma orqali telefon raqamingizni yuboring (CRM dagi raqamingiz bilan bir xil bo'lishi kerak). Yoki savolingizni shunchaki yozing.",
    linkedOk: (clinic: string, role: string) =>
        `✅ Ulandingiz: ${clinic}${role ? ' (' + role + ')' : ''}.\n\nEndi savolingizni yozing yoki ovozli xabar yuboring.`,
    linkedTeam: '✅ Ulandingiz (DentaCRM jamoasi). Murojaatlar shu chatga kelishi uchun /operator yuboring — guruhda ham ishlaydi.',
    linkInvalid: "Bu havola eskirgan yoki allaqachon ishlatilgan. Ilovadagi «Yordam» tugmasini qayta bosing.",
    contactNotOwn: "Bu boshqa odamning raqami. Iltimos, pastdagi «📱 Telefon raqamni yuborish» tugmasini bosib, o'z raqamingizni yuboring.",
    contactNotFound: "Bu raqam DentaCRM da topilmadi. Klinikangizda sizning raqamingiz boshqacha yozilgan bo'lishi mumkin — rahbaringizdan tekshirishni so'rang.\n\nSavolingizni yozavering, operatorga yetkazaman.",
    keepSession: "Siz allaqachon ilova orqali ulangansiz — savolingizni yozavering.",
    received: 'Savolingiz qabul qilindi, tez orada javob beraman.',
    escalated: "Savolingizni mutaxassisga uzatdim. Javob shu chatga keladi.",
    escalatedNight: "Savolingizni mutaxassisga uzatdim. Hozir ish vaqti emas — ertalab javob beramiz, javob shu chatga keladi.",
    alreadyWithOperator: 'Xabaringizni operatorga yetkazdim.',
    thanks: "Xursandman! Yana savol bo'lsa — yozing.",
    newQuestion: 'Yaxshi, yangi savolingizni yozing.',
    voiceHeard: (text: string) => `🎙 Eshitdim: «${text}»`,
    voiceFailed: "Ovozli xabarni tushuna olmadim. Iltimos, yozib yuboring.",
    voiceTooLong: "Ovozli xabar juda uzun. Iltimos, 2 daqiqagacha qilib yuboring yoki yozing.",
    photoNoText: "Rasmni oldim. Unda nima muammo ko'rinayotganini bir-ikki so'z bilan yozib yuboring — operatorga rasm bilan birga yetkazaman.",
    needLink: "Buning uchun avval qaysi klinikadan ekaningizni bilishim kerak. Pastdagi tugma orqali telefon raqamingizni yuboring yoki ilovadagi «Yordam» tugmasini bosing.",
    payStart: (info: string) =>
        (info ? info + '\n\n' : '') + "To'lov chekining rasmini (yoki skrinshotini) shu yerga yuboring.",
    payReceived: "Chek qabul qilindi. Tekshirilgach obuna uzaytiriladi va sizga xabar beraman.",
    payTrust: (date: string) => `Tekshirilguncha klinikangiz ${date} gacha ochib qo'yildi — ishni davom ettirishingiz mumkin (sahifani yangilang).`,
    payApproved: (date: string) => `✅ To'lov tasdiqlandi. Obuna ${date} gacha uzaytirildi.\n\nIlovada sahifani yangilang.`,
    payRejected: "To'lov tasdiqlanmadi. Operator siz bilan shu chatda bog'lanadi.",
    resetConfirm: "Yangi parol beraymi? Eski parol shu zahoti ishlamay qoladi.",
    resetCancelled: "Bekor qilindi, parol o'zgarmadi.",
    resetSentToOperator: "So'rovingiz tekshiruvga yuborildi. Tasdiqlangach yangi parol shu chatga keladi.",
    resetSentToOwner: "So'rov klinika rahbariga yuborildi. U tasdiqlasa, yangi parol shu chatga keladi.",
    resetNoOwner: "Klinika rahbari hali bu botga ulanmagan. Rahbaringizdan parolingizni ilovada yangilashni so'rang: Xodimlar → Ro'yxat → sizning ismingiz → tahrirlash.",
    resetNoLogin: "Sizga hali login berilmagan. Rahbaringizdan ilovada login va parol qo'yishni so'rang: Xodimlar → Ro'yxat.",
    resetLimit: "Bugun bu parol bir necha marta tiklandi. Ertaga urinib ko'ring yoki «👤 Operator» tugmasini bosing.",
    resetDone: (login: string, password: string) =>
        `🔑 Yangi parol tayyor.\n\nLogin: ${login}\nParol: ${password}\n\nKirgach, parolni o'zingizga qulayiga almashtiring: ilovaning yuqori qismidagi «Parolni almashtirish». Bu xabarni o'chirib tashlang.`,
    resetRejected: "Parolni tiklash so'rovi rad etildi.",
    resetExpired: "Bu so'rov eskirgan yoki allaqachon bajarilgan.",
    resetNotSupported: "Bu akkaunt uchun parolni bot orqali tiklab bo'lmaydi. «👤 Operator» tugmasini bosing.",
    ownerAsk: (name: string, role: string) => `${name} (${role}) parolini unutibdi va yangi parol so'rayapti.\n\nTasdiqlasangiz, yangi parol faqat uning o'ziga yuboriladi.`,
    ownerApproved: (name: string) => `Tasdiqlandi — yangi parol ${name} ga yuborildi.`,
    ownerRejected: "Rad etildi, parol o'zgarmadi.",
    error: "Kechirasiz, hozir javob bera olmadim. Savolingizni operatorga uzatdim.",
    retry: "Kechirasiz, xatolik yuz berdi. Savolingizni qayta yuboring yoki «👤 Operator» tugmasini bosing.",
    tooMany: "Qisqa vaqtda juda ko'p xabar yubordingiz. Bir soatdan keyin yozing.",
    unreachable: "Kechirasiz, hozir javob bera olmadim va savolingizni xodimga ham yetkaza olmadim. Iltimos, 10–15 daqiqadan keyin qayta yozing.",
    payUnavailable: "Hozir chekni qabul qila olmayapmiz. Birozdan keyin qayta yuboring yoki «👤 Operator» tugmasini bosing.",
    resetUnavailable: "So'rovingizni hozir yubora olmadik. Birozdan keyin qayta urinib ko'ring yoki «👤 Operator» tugmasini bosing.",
    resetFailed: "Parolni saqlab bo'lmadi: yuqoridagi parol ishlamaydi. Eskisidan foydalaning va «🔑 Parolni tiklash» ni qayta bosing.",
};

const RU: typeof UZ = {
    welcomeLinked: (name: string) =>
        `Здравствуйте${name ? ', ' + name : ''}! Я помощник DentaCRM.\n\nНапишите вопрос или отправьте голосовое сообщение — помогу с работой в приложении, SMS, оплатой и паролем.`,
    welcomeUnlinked:
        'Здравствуйте! Я помощник DentaCRM.\n\nЧтобы я понял, из какой вы клиники, отправьте свой номер телефона кнопкой ниже (он должен совпадать с номером в CRM). Или просто напишите вопрос.',
    linkedOk: (clinic: string, role: string) =>
        `✅ Вы подключены: ${clinic}${role ? ' (' + role + ')' : ''}.\n\nТеперь напишите вопрос или отправьте голосовое сообщение.`,
    linkedTeam: '✅ Вы подключены (команда DentaCRM). Чтобы обращения приходили в этот чат, отправьте /operator — работает и в группе.',
    linkInvalid: 'Эта ссылка устарела или уже использована. Нажмите кнопку «Помощь» в приложении ещё раз.',
    contactNotOwn: 'Это номер другого человека. Пожалуйста, нажмите кнопку «📱 Отправить номер телефона» и отправьте свой номер.',
    contactNotFound: 'Этот номер не найден в DentaCRM. Возможно, в клинике ваш номер записан иначе — попросите руководителя проверить.\n\nПишите вопрос, я передам оператору.',
    keepSession: 'Вы уже подключены через приложение — просто напишите вопрос.',
    received: 'Вопрос принят, скоро отвечу.',
    escalated: 'Я передал вопрос специалисту. Ответ придёт в этот чат.',
    escalatedNight: 'Я передал вопрос специалисту. Сейчас нерабочее время — ответим утром, ответ придёт в этот чат.',
    alreadyWithOperator: 'Передал ваше сообщение оператору.',
    thanks: 'Рад помочь! Если будут вопросы — пишите.',
    newQuestion: 'Хорошо, напишите новый вопрос.',
    voiceHeard: (text: string) => `🎙 Услышал: «${text}»`,
    voiceFailed: 'Не удалось разобрать голосовое сообщение. Пожалуйста, напишите текстом.',
    voiceTooLong: 'Голосовое сообщение слишком длинное. Пожалуйста, уложитесь в 2 минуты или напишите текстом.',
    photoNoText: 'Фото получил. Напишите в двух словах, какая проблема на нём видна — передам оператору вместе с фото.',
    needLink: 'Для этого мне нужно знать, из какой вы клиники. Отправьте номер телефона кнопкой ниже или нажмите «Помощь» в приложении.',
    payStart: (info: string) =>
        (info ? info + '\n\n' : '') + 'Отправьте сюда фото (или скриншот) чека об оплате.',
    payReceived: 'Чек получен. После проверки подписка будет продлена, я сообщу.',
    payTrust: (date: string) => `На время проверки клиника открыта до ${date} — можно продолжать работу (обновите страницу).`,
    payApproved: (date: string) => `✅ Оплата подтверждена. Подписка продлена до ${date}.\n\nОбновите страницу в приложении.`,
    payRejected: 'Оплата не подтверждена. Оператор свяжется с вами в этом чате.',
    resetConfirm: 'Выдать новый пароль? Старый сразу перестанет работать.',
    resetCancelled: 'Отменено, пароль не изменён.',
    resetSentToOperator: 'Запрос отправлен на проверку. После подтверждения новый пароль придёт в этот чат.',
    resetSentToOwner: 'Запрос отправлен руководителю клиники. Если он подтвердит, новый пароль придёт в этот чат.',
    resetNoOwner: 'Руководитель клиники ещё не подключён к этому боту. Попросите руководителя обновить ваш пароль в приложении: Сотрудники → Список → ваше имя → редактировать.',
    resetNoLogin: 'Вам ещё не выдан логин. Попросите руководителя задать логин и пароль в приложении: Сотрудники → Список.',
    resetLimit: 'Сегодня этот пароль уже восстанавливали несколько раз. Попробуйте завтра или нажмите «👤 Оператор».',
    resetDone: (login: string, password: string) =>
        `🔑 Новый пароль готов.\n\nЛогин: ${login}\nПароль: ${password}\n\nПосле входа смените пароль на удобный: «Сменить пароль» в верхней части приложения. Удалите это сообщение.`,
    resetRejected: 'Запрос на восстановление пароля отклонён.',
    resetExpired: 'Этот запрос устарел или уже выполнен.',
    resetNotSupported: 'Для этой учётной записи пароль через бота не восстанавливается. Нажмите «👤 Оператор».',
    ownerAsk: (name: string, role: string) => `${name} (${role}) забыл(а) пароль и просит новый.\n\nЕсли подтвердите, новый пароль будет отправлен только этому сотруднику.`,
    ownerApproved: (name: string) => `Подтверждено — новый пароль отправлен: ${name}.`,
    ownerRejected: 'Отклонено, пароль не изменён.',
    error: 'Извините, сейчас не смог ответить. Передал ваш вопрос оператору.',
    retry: 'Извините, произошла ошибка. Отправьте вопрос ещё раз или нажмите «👤 Оператор».',
    tooMany: 'Вы отправили слишком много сообщений за короткое время. Напишите через час.',
    unreachable: 'Извините, сейчас не смог ответить и не смог передать вопрос сотруднику. Пожалуйста, напишите ещё раз через 10–15 минут.',
    payUnavailable: 'Сейчас не можем принять чек. Отправьте его чуть позже или нажмите «👤 Оператор».',
    resetUnavailable: 'Сейчас не удалось отправить ваш запрос. Попробуйте чуть позже или нажмите «👤 Оператор».',
    resetFailed: 'Не удалось сохранить пароль: пароль выше не работает. Используйте прежний и нажмите «🔑 Восстановить пароль» ещё раз.',
};

export type Texts = typeof UZ;
export const T = (lang: SupportLang | undefined | null): Texts => (lang === 'ru' ? RU : UZ);
