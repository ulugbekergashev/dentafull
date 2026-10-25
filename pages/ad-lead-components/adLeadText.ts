import type { AdPlan } from '../AdLeadPage';

// Reklama sahifasining matni: /lifetime, /monthly — o'zbekcha, /lifetime-ru, /monthly-ru — ruscha.
// Sahifa ilovaning tanlangan tilidan (LanguageContext) qat'i nazar havoladagi tilda chiqadi:
// reklama qaysi tilda bo'lsa, sahifa ham o'sha tilda.
// O'zbekcha matn tanlanishining sabablari AdLeadPage.tsx boshidagi izohda.

export type AdLang = 'uz' | 'ru';

export interface AdLeadText {
  htmlLang: string;
  /** Qisqa — telefonda logotip bilan bir qatorga sig'adi */
  badge: string;
  /** Sarlavhaning birinchi qatori; "—" oldida bo'linmas probel, tire yolg'iz qolmasin */
  lead: string;
  offer: Record<AdPlan, string>;
  sub: string;
  /** Telefonda forma sarlavhasi yashirin — bu gap kichik matn oxiriga qo'shiladi */
  subMobileTail: string;
  formTitle: string;
  formHint: string;
  nameLabel: string;
  namePlaceholder: string;
  nameError: string;
  clinicLabel: string;
  clinicPlaceholder: string;
  clinicError: string;
  phoneLabel: string;
  phoneError: string;
  sendFailed: (ourPhone: string) => string;
  sending: string;
  submit: string;
  callYourself: string;
  successTitle: (name: string, isRepeat: boolean) => string;
  /** Mijoz raqamidan oldingi va keyingi qism: "... {raqam} ..." */
  successLine: (isRepeat: boolean) => { before: string; after: string };
  noWait: string;
  savePhone: string;
  otherPhone: string;
}

const UZ: AdLeadText = {
  htmlLang: 'uz',
  badge: 'Stomatologlar uchun',
  lead: 'Kompyuter dasturi —',
  offer: { lifetime: "bir marta to'lang, umrbod foydalaning", monthly: 'qulay oylik obuna' },
  sub: 'Tish kartasi, qabullar va kassa — bitta dasturda.',
  subMobileTail: " Bepul ko'rsatib beramiz.",
  formTitle: "Bepul ko'rsatib beramiz",
  formHint: "Raqamingizni qoldiring — mutaxassisimiz o'zi qo'ng'iroq qiladi.",
  nameLabel: 'Ismingiz',
  namePlaceholder: 'Masalan: Aziz',
  nameError: 'Ismingizni yozing',
  clinicLabel: 'Klinika nomi',
  clinicPlaceholder: 'Masalan: Tabassum Dent',
  clinicError: 'Klinikangiz nomini yozing',
  phoneLabel: 'Telefon raqamingiz',
  phoneError: "Raqamni to'liq kiriting: +998 va 9 ta raqam",
  sendFailed: (ourPhone) => `Yuborib bo'lmadi. Qaytadan urinib ko'ring yoki ${ourPhone} raqamiga qo'ng'iroq qiling.`,
  sending: 'Yuborilmoqda...',
  submit: "Qo'ng'iroq qilishingizni kutaman",
  callYourself: "Yoki o'zingiz qo'ng'iroq qiling:",
  successTitle: (name, isRepeat) => (isRepeat ? `Arizangiz bizda bor${name ? `, ${name}` : ''}` : `Rahmat, ${name}!`),
  successLine: (isRepeat) =>
    isRepeat
      ? { before: 'Qayta qoldirish shart emas —', after: " raqamiga albatta qo'ng'iroq qilamiz." }
      : { before: 'Arizangiz qabul qilindi. Tez orada', after: " raqamiga qo'ng'iroq qilamiz." },
  noWait: "Kutishni xohlamasangiz, o'zingiz qo'ng'iroq qiling",
  savePhone: "Bu raqamni saqlab qo'ying.",
  otherPhone: 'Boshqa raqam qoldirish',
};

const RU: AdLeadText = {
  htmlLang: 'ru',
  badge: 'Для стоматологов',
  lead: 'Программа учёта —',
  offer: { lifetime: 'платите один раз, пользуйтесь всегда', monthly: 'удобная месячная подписка' },
  sub: 'Зубная формула, приёмы и касса — в одном месте.',
  subMobileTail: ' Покажем бесплатно.',
  formTitle: 'Покажем бесплатно',
  formHint: 'Оставьте номер — наш специалист сам вам позвонит.',
  nameLabel: 'Ваше имя',
  namePlaceholder: 'Например: Азиз',
  nameError: 'Напишите ваше имя',
  clinicLabel: 'Название клиники',
  clinicPlaceholder: 'Например: Tabassum Dent',
  clinicError: 'Напишите название клиники',
  phoneLabel: 'Ваш номер телефона',
  phoneError: 'Введите номер полностью: +998 и 9 цифр',
  sendFailed: (ourPhone) => `Не удалось отправить. Попробуйте ещё раз или позвоните нам: ${ourPhone}.`,
  sending: 'Отправляем...',
  submit: 'Жду вашего звонка',
  callYourself: 'Или позвоните сами:',
  successTitle: (name, isRepeat) => (isRepeat ? `Ваша заявка уже у нас${name ? `, ${name}` : ''}` : `Спасибо, ${name}!`),
  successLine: (isRepeat) =>
    isRepeat
      ? { before: 'Оставлять повторно не нужно — мы обязательно позвоним на номер', after: '.' }
      : { before: 'Заявка принята. Скоро позвоним на номер', after: '.' },
  noWait: 'Не хотите ждать — позвоните сами',
  savePhone: 'Сохраните этот номер.',
  otherPhone: 'Оставить другой номер',
};

export const AD_LEAD_TEXT: Record<AdLang, AdLeadText> = { uz: UZ, ru: RU };
