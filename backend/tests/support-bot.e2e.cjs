// Yordam boti uchma-uch: HAQIQIY Telegraf bot (support/bot.ts) soxta Telegram serveriga
// ulanadi. Tekshiriladi: buyruqlar, kontakt, matn, ovoz, tugmalar va operator guruhi
// to'g'ri joyga ulanganmi — ya'ni Telegram bilan gaplashadigan qatlamning o'zi.
// Tarmoqqa va haqiqiy bazaga chiqmaydi.
// Ishga tushirish (backend papkasidan):  node tests/support-bot.e2e.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');
const { startFakeTelegram } = require('./helpers/fakeTelegram.cjs');

global.prisma = createFakeDb();
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
delete process.env.DISABLE_BOTS;
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const at = (f) => path.join(__dirname, '..', f);
const { createSupport } = require(at('support/index.ts'));
const { createDiag } = require(at('diag.ts'));
const { todayTashkent } = require(at('support/text.ts'));

const GROUP = -500;   // operator guruhi
const ADMIN = 900;    // DentaCRM jamoasi (super admin)
const OWNER = 100;    // klinika rahbari
const STRANGER = 300;

const SEED = [{
  id: 'finance.pay', module: 'finance', roles: '*', titleUz: "To'lovni qabul qilish", titleRu: 'Приём оплаты',
  bodyUz: "Moliya → Kassa bo'limini oching.", bodyRu: 'Откройте Финансы → Касса.', paths: ['finance.kassa'],
}];

let tg, support, db, aiCalls, mid = 1;

const from = (id, name = 'Test') => ({ id, is_bot: false, first_name: name });
const privateMsg = (id, extra) => ({ message: { message_id: mid++, date: 0, chat: { id, type: 'private' }, from: from(id), ...extra } });
const groupMsg = (userId, extra) => ({ message: { message_id: mid++, date: 0, chat: { id: GROUP, type: 'supergroup', title: 'Support' }, from: from(userId, 'Ulugbek'), ...extra } });
const command = (text) => ({ text, entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] });
const textOf = (c) => c.text || c.caption || '';

const boot = async () => {
  tg = await startFakeTelegram();
  process.env.TELEGRAM_API_ROOT = tg.url;
  process.env.SUPPORT_BOT_TOKEN = '123456:TEST-TOKEN';
  db = createFakeDb({
    clinic: [{ id: 'c1', name: 'Smile', adminName: 'Anvar', username: 'smile', password: 'old', status: 'Active',
      ownerPhone: '998901112233', expiryDate: todayTashkent(10), planId: 'pro' }],
    subscriptionPlan: [{ id: 'pro', name: 'Pro', price: 300000, maxDoctors: 5 }],
    doctor: [], receptionist: [], labTechnician: [],
  });
  aiCalls = [];
  const ai = {
    isConfigured: () => true,
    supportKey: () => null,
    async chatWithTools(messages, _tools, execute) {
      aiCalls.push(messages[messages.length - 1].content);
      await execute('open_article', { id: 'finance.pay' });
      return { reply: "Moliya → Kassa bo'limida to'lovni qabul qilasiz.", toolCalls: [{ name: 'open_article', args: { id: 'finance.pay' } }], results: [], meta: { provider: 'fake', model: 'fake' } };
    },
  };
  support = createSupport({
    db, diag: createDiag(db), ai, debounceMs: 30, seed: SEED, withActor: (_a, fn) => fn(),
    stt: async () => 'sms ketmayapti',
  });
  await support.start();
  await tg.until(() => support.botUsername(), 'bot ishga tushishi');
};

(async () => {
  await boot();
  await runTests({
    'bot ishga tushadi va ilova uchun nomini beradi': async () => {
      assert.strictEqual(support.botUsername(), 'denta_yordam_bot');
      assert.strictEqual(support.configured(), true);
    },

    'Telegram menyusi va bot tavsifi ikki tilda o\'rnatiladi': async () => {
      const cmds = (lang) => tg.calls.find((c) => c.method === 'setMyCommands' && (c.language_code || '') === lang);
      await tg.until(() => cmds('') && cmds('ru'), 'setMyCommands');
      assert.deepStrictEqual(cmds('').commands.map((c) => c.command), ['start', 'yangi', 'tolov', 'parol']);
      assert.deepStrictEqual(cmds('ru').commands.map((c) => c.command), ['start', 'yangi', 'tolov', 'parol']);
      await tg.until(() => tg.calls.some((c) => c.method === 'setMyDescription' && c.language_code === 'ru'), 'setMyDescription ru');
      assert.ok(tg.calls.some((c) => c.method === 'setMyDescription' && !c.language_code && /DentaCRM/.test(c.description)));
      assert.ok(tg.calls.some((c) => c.method === 'setMyShortDescription' && !c.language_code));
    },

    '/start: ulanmagan odamga ham menyu chiqadi (operator, yangi savol), /tolov ulanishni so\'raydi': async () => {
      const NEWCOMER = 301;
      tg.push(privateMsg(NEWCOMER, command('/start')));
      await tg.until(() => tg.sentTo(NEWCOMER).length >= 1, '/start javobi');
      const kb = tg.sentTo(NEWCOMER)[0].reply_markup;
      const labels = kb.keyboard.flat().map((b) => b.text);
      assert.ok(kb.keyboard.flat().some((b) => b.request_contact), 'telefon tugmasi yo\'q');
      assert.ok(labels.includes('👤 Operator') && labels.includes('🆕 Yangi savol'), 'menyu chiqmadi: ' + labels.join(' | '));
      assert.strictEqual(kb.is_persistent, true);
      tg.push(privateMsg(NEWCOMER, command('/tolov')));
      await tg.until(() => tg.sentTo(NEWCOMER).length >= 2, '/tolov javobi');
      assert.ok(!(await support.identity.getUser(String(NEWCOMER)))?.clinicId, 'ulanmagan odamga klinika bog\'landi');
    },

    'super admin havola orqali ulanadi va guruhni operator chati qiladi': async () => {
      const code = await support.identity.createLinkCode({ role: 'SUPER_ADMIN', name: 'Ulugbek' });
      tg.push(privateMsg(ADMIN, command(`/start ${code}`)));
      await tg.until(() => tg.sentTo(ADMIN).some((c) => /DentaCRM jamoasi/.test(textOf(c))), 'jamoa ulanishi');
      tg.push(groupMsg(ADMIN, command('/operator')));
      await tg.until(() => tg.sentTo(GROUP).some((c) => /shu chatga keladi/.test(textOf(c))), '/operator javobi');
      assert.strictEqual(await support.settings.operatorChat(), String(GROUP));
    },

    'begona odam /operator bilan chatni egallay olmaydi': async () => {
      tg.push(privateMsg(STRANGER, command('/operator')));
      await tg.until(() => tg.sentTo(STRANGER).some((c) => /faqat DentaCRM jamoasi/.test(textOf(c))), 'rad javobi');
      assert.strictEqual(await support.settings.operatorChat(), String(GROUP));
    },

    'boshqa odamning kontakti rad etiladi; o\'ziniki ulanadi': async () => {
      tg.push(privateMsg(STRANGER, { contact: { phone_number: '+998901112233', first_name: 'Anvar', user_id: 77777 } }));
      await tg.until(() => tg.sentTo(STRANGER).some((c) => /boshqa odamning raqami/.test(textOf(c))), 'begona kontakt');
      assert.ok(!(await support.identity.getUser(String(STRANGER)))?.role);
      tg.push(privateMsg(OWNER, { contact: { phone_number: '+998901112233', first_name: 'Anvar', user_id: OWNER } }));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /Ulandingiz: Smile/.test(textOf(c))), 'rahbar ulanishi');
      const linked = tg.sentTo(OWNER).slice(-1)[0];
      assert.ok(JSON.stringify(linked.reply_markup).includes('Parolni tiklash'), 'menyu chiqmadi');
    },

    'savol → operator guruhiga qoralama → "Yuborish" → mijozga javob': async () => {
      tg.push(privateMsg(OWNER, { text: "to'lovni qanday qabul qilaman" }));
      const card = await tg.until(() => tg.sentTo(GROUP).find((c) => /Tayyor javob/.test(textOf(c))), 'qoralama kartasi');
      assert.strictEqual(card.parse_mode, 'HTML');
      const sendButton = card.reply_markup.inline_keyboard.flat().find((b) => b.callback_data.startsWith('sd:'));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /qabul qilindi/.test(textOf(c))), 'mijozga tasdiq');

      const cardMessageId = card.sentMessageId;
      tg.push({ callback_query: { id: 'q1', from: from(ADMIN, 'Ulugbek'), chat_instance: 'x', data: sendButton.callback_data,
        message: { message_id: cardMessageId, date: 0, chat: { id: GROUP, type: 'supergroup' } } } });
      const answer = await tg.until(() => tg.sentTo(OWNER).find((c) => /Moliya → Kassa bo'limida/.test(textOf(c))), 'mijozga javob');
      const buttons = answer.reply_markup.inline_keyboard.flat();
      assert.ok(buttons.some((b) => b.url && b.url.includes('/finance?tab=kassa')));
      assert.ok(buttons.some((b) => (b.callback_data || '').startsWith('ok:')));
      await tg.until((calls) => calls.some((c) => c.method === 'answerCallbackQuery' && c.text === 'Yuborildi'), 'tugma javobi');
      await tg.until((calls) => calls.some((c) => c.method === 'editMessageReplyMarkup' && String(c.chat_id) === String(GROUP)), 'karta yangilanishi');
    },

    'operator kartaga reply qilsa — matn mijozga boradi': async () => {
      const card = tg.sentTo(GROUP).find((c) => /Tayyor javob/.test(textOf(c)));
      const cardMessageId = card.sentMessageId;
      tg.push(groupMsg(ADMIN, { text: 'Qo\'shimcha: chekni ham chiqarsangiz bo\'ladi.', reply_to_message: { message_id: cardMessageId, date: 0, chat: { id: GROUP, type: 'supergroup' } } }));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /chekni ham chiqarsangiz/.test(textOf(c))), 'operator javobi');
      await tg.until(() => tg.sentTo(GROUP).some((c) => /Yetkazildi/.test(textOf(c))), 'operatorga tasdiq');
    },

    'guruhdagi oddiy gap (reply emas) hech kimga ketmaydi': async () => {
      const before = tg.calls.length;
      tg.push(groupMsg(ADMIN, { text: 'bugun ishlar qalay?' }));
      await new Promise((r) => setTimeout(r, 400));
      assert.strictEqual(tg.calls.slice(before).filter((c) => /^send/.test(c.method)).length, 0);
    },

    'ovozli xabar: matnga aylanadi, tushunilgani ko\'rsatiladi va savol sifatida ishlanadi': async () => {
      const seen = aiCalls.length;
      // Avvalgi murojaat operator qo'lida — yangi savol uchun yopamiz
      tg.push(privateMsg(OWNER, { text: '🆕 Yangi savol' }));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /yangi savolingizni yozing/.test(textOf(c))), 'yangi savol');
      tg.push(privateMsg(OWNER, { voice: { file_id: 'V1', file_unique_id: 'u', duration: 4, mime_type: 'audio/ogg' } }));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /Eshitdim: «sms ketmayapti»/.test(textOf(c))), 'ovoz tushunildi');
      await tg.until(() => aiCalls.length > seen, 'ovozdan olingan savol modelga bordi');
      assert.ok(aiCalls[aiCalls.length - 1].includes('sms ketmayapti'));
    },

    'juda uzun ovozli xabar yuklab olinmaydi': async () => {
      const before = tg.calls.filter((c) => c.method === 'getFile').length;
      tg.push(privateMsg(OWNER, { voice: { file_id: 'V2', file_unique_id: 'u2', duration: 600 } }));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /juda uzun/.test(textOf(c))), 'uzun ovoz');
      assert.strictEqual(tg.calls.filter((c) => c.method === 'getFile').length, before);
    },

    'to\'lov: tugma → chek rasmi → guruhga rasm bilan karta': async () => {
      tg.push(privateMsg(OWNER, { text: "💳 To'lov qildim" }));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /chekining rasmini/.test(textOf(c))), 'chek so\'raldi');
      tg.push(privateMsg(OWNER, { photo: [{ file_id: 'small', file_unique_id: 'a', width: 90, height: 90 }, { file_id: 'BIG', file_unique_id: 'b', width: 900, height: 900 }] }));
      const card = await tg.until((calls) => calls.find((c) => c.method === 'sendPhoto' && String(c.chat_id) === String(GROUP)), 'chek kartasi');
      assert.strictEqual(card.photo, 'BIG');
      assert.ok(card.reply_markup.inline_keyboard.flat().some((b) => /^py:.+:12$/.test(b.callback_data)));
      await tg.until(() => tg.sentTo(OWNER).some((c) => /Chek qabul qilindi/.test(textOf(c))), 'chek qabul');
    },

    'handler ichidagi xato botni to\'xtatmaydi': async () => {
      // Buzuq hodisa: xabarsiz callback va noma'lum tugma
      tg.push({ callback_query: { id: 'bad', from: from(OWNER), chat_instance: 'x', data: 'zz:nope', message: { message_id: 1, date: 0, chat: { id: OWNER, type: 'private' } } } });
      tg.push(privateMsg(STRANGER, { text: 'salom, sinab ko\'rmoqchi edim' }));
      await tg.until(() => tg.sentTo(GROUP).some((c) => /sinab ko'rmoqchi/.test(textOf(c))), 'bot hali ham ishlayapti');
    },

    "operator guruhidagi jamoa a'zosi bo'lmagan odam tugma bosa olmaydi va mijozga javob yubora olmaydi": async () => {
      // Mijoz yangi savol yozadi — operator guruhiga karta tushadi
      tg.push(privateMsg(OWNER, { text: "bitta savol bor edi, bemor kartasida rasm qayerda?" }));
      const card = await tg.until(() => tg.sentTo(GROUP).filter((c) => c.reply_markup).slice(-1)[0] && tg.sentTo(GROUP).filter((c) => c.reply_markup).slice(-1)[0].sentMessageId > 0 && tg.sentTo(GROUP).filter((c) => c.reply_markup).slice(-1)[0], "yangi karta");
      const press = card.reply_markup.inline_keyboard.flat().find((b) => b.callback_data);
      const before = tg.sentTo(OWNER).length;
      // Guruhdagi oddiy a'zo (jamoaga ulanmagan) tugmani bosadi
      tg.push({ callback_query: { id: 'evil1', from: from(STRANGER, 'Yovuz'), chat_instance: 'x', data: press.callback_data,
        message: { message_id: card.sentMessageId, date: 0, chat: { id: GROUP, type: 'supergroup' } } } });
      await tg.until((calls) => calls.some((c) => c.method === 'answerCallbackQuery' && c.callback_query_id === 'evil1' && c.show_alert), 'ogohlantirish');
      // Va kartaga reply qilib mijozga "javob" yozishga urinadi
      tg.push(groupMsg(STRANGER, { text: "soxta javob: pul o'tkazing", reply_to_message: { message_id: card.sentMessageId, date: 0, chat: { id: GROUP, type: 'supergroup' } } }));
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(!tg.sentTo(OWNER).slice(before).some((c) => /soxta javob/.test(textOf(c))), 'begona odamning javobi mijozga yetdi');
    },

    'guruhda mijoz buyruqlari ishlamaydi (shaxsiy ma\'lumot guruhga chiqmasin)': async () => {
      const before = tg.sentTo(GROUP).length;
      tg.push(groupMsg(OWNER, command('/start')));
      tg.push(groupMsg(OWNER, { contact: { phone_number: '+998901112233', user_id: OWNER, first_name: 'A' } }));
      await new Promise((r) => setTimeout(r, 400));
      assert.strictEqual(tg.sentTo(GROUP).length, before);
    },
  });
  support.stop();
  await support.flow.idle();
  await tg.stop();
  // Telegraf ulanishlari yopilishini kutmasdan chiqamiz
  setTimeout(() => process.exit(process.exitCode || 0), 200);
})().catch((e) => { console.error(e); process.exit(1); });
