// Yordam boti: to'liq suhbat oqimi — savol → javob / qoralama / operator, parol tiklash, to'lov.
// Soxta baza, soxta messenger va ssenariyli soxta model bilan — tarmoqqa chiqmaydi.
// Ishga tushirish (backend papkasidan):  node tests/support-flow.test.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');

global.prisma = createFakeDb();
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
process.env.DISABLE_BOTS = '1';
delete process.env.SUPPORT_BOT_TOKEN;
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const at = (f) => path.join(__dirname, '..', f);
const { createSupport } = require(at('support/index.ts'));
const { createDiag } = require(at('diag.ts'));
const { todayTashkent } = require(at('support/text.ts'));
const { addMonths } = require(at('support/billing.ts'));
const bcrypt = require('bcryptjs');

const OP = '-1001'; // operator guruhi
const OWNER = '100';
const STAFF = '200';
const STRANGER = '300';

const SEED = [
  { id: 'finance.pay', module: 'finance', roles: ['CLINIC_ADMIN', 'RECEPTIONIST'], titleUz: "To'lovni qabul qilish", titleRu: 'Приём оплаты',
    bodyUz: "1. Moliya → Kassa bo'limini oching.\n2. To'lov qabul qilish tugmasini bosing.", bodyRu: '1. Откройте Финансы → Касса.',
    paths: ['finance.kassa'], guideId: 'task-payment' },
  { id: 'general.phone', module: 'general', roles: '*', titleUz: 'Telefonda ishlaydimi?', titleRu: 'Работает на телефоне?', bodyUz: 'Ha.', bodyRu: 'Да.' },
];

/** Ssenariyli model: har chaqiruvga navbatdagi qadam. calls — model "chaqiradigan" asboblar */
const scriptedAi = (script) => {
  const seen = [];
  return {
    seen,
    isConfigured: () => true,
    supportKey: () => null,
    chat: async () => 'UZ SARLAVHA: Kassani yopish\nRU SARLAVHA: Закрытие кассы\nUZ MATN: Moliya → Kassa da kunni yoping.\nRU MATN: Закройте день.\nKALIT: kassa, yopish',
    async chatWithTools(messages, tools, execute) {
      const step = script.shift();
      if (!step) throw new Error('ssenariyda qadam qolmadi');
      const entry = { messages, tools: tools.map((t) => t.function.name), results: [] };
      seen.push(entry);
      if (step.throw) throw new Error(step.throw);
      const toolCalls = [];
      const results = [];
      for (const [name, args] of step.calls || []) {
        toolCalls.push({ name, args });
        results.push(await execute(name, args || {}));
        entry.results.push(results[results.length - 1]);
      }
      return { reply: step.reply, toolCalls, results, meta: { provider: 'fake', model: 'fake', tokensIn: 1, tokensOut: 1, rounds: 1 } };
    },
  };
};

const setup = async (script, opts = {}) => {
  const db = createFakeDb({
    clinic: [{ id: 'c1', name: 'Smile', adminName: 'Anvar', username: 'smile', password: 'old', status: 'Active',
      ownerPhone: '998901112233', expiryDate: opts.expiry || todayTashkent(10), planId: 'pro', subscriptionType: 'Paid' }],
    subscriptionPlan: [{ id: 'pro', name: 'Pro', price: 300000, maxDoctors: 5 }],
    doctor: [{ id: 'd1', clinicId: 'c1', firstName: 'Olim', lastName: 'Sobirov', phone: '998912223344', username: 'olim', password: 'p', status: 'Active' }],
    receptionist: [], labTechnician: [], telegramLog: [], messageTemplate: [], patient: [], auditLog: [],
  });
  const sent = [];
  let nextId = 1;
  // failChats: shu chatlarga yuborish muvaffaqiyatsiz (foydalanuvchi botni to'xtatgan, guruh yo'q)
  const failChats = new Set();
  const messenger = {
    send: async (chatId, text, o = {}) => { if (failChats.has(String(chatId))) return null; const id = nextId++; sent.push({ id, chatId, text, ...o }); return id; },
    sendFile: async (chatId, kind, fileId, caption, o = {}) => { if (failChats.has(String(chatId))) return null; const id = nextId++; sent.push({ id, chatId, file: fileId, kind, text: caption, ...o }); return id; },
    editButtons: async (chatId, messageId, buttons) => { sent.push({ chatId, edit: messageId, buttons }); },
    typing: async () => {},
  };
  const ai = scriptedAi(script);
  const logs = [];
  const support = createSupport({
    db, diag: createDiag(db), ai, messenger, debounceMs: 0, seed: SEED,
    withActor: (_a, fn) => fn(), logAi: async (e) => { logs.push(e); },
  });
  await support.start();
  if (opts.operator !== false) await support.settings.setOperatorChat(OP);
  if (opts.mode) await support.settings.set({ mode: opts.mode, ...(opts.settings || {}) });

  const tg = { name: 'Test' };
  const link = async (chatId, auth) => support.identity.linkByCode(chatId, await support.identity.createLinkCode(auth));
  const ask = async (chatId, text, extra = {}) => {
    await support.flow.enqueue(chatId, tg, { kind: 'text', text, ...extra });
    await support.flow.idle();
  };
  const to = (chatId) => sent.filter((m) => m.chatId === chatId && !m.edit);
  const last = (chatId) => to(chatId).slice(-1)[0];
  const button = (msg, prefix) => (msg.buttons || []).flat().find((b) => (b.data || '').startsWith(prefix));
  return { db, support, sent, ai, logs, tg, link, ask, to, last, button, failChats };
};

const ownerAuth = { role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Anvar' };

runTests({
  'operator ulanmagan + AI xato: mijozga "yozamiz" deyilmaydi, haqiqat aytiladi, murojaat panelda javobsiz qoladi': async () => {
    const t = await setup([{ throw: 'AI limit' }], { operator: false });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'qanday qilib sms jonatsa boladi?');
    assert.strictEqual(t.to(OWNER).length, 1);
    assert.match(t.last(OWNER).text, /javob bera olmadim/);
    assert.ok(!/yozamiz/.test(t.last(OWNER).text), 'mijozga yolg\'on va\'da berildi');
    const ticket = await t.db.supportTicket.findFirst();
    assert.strictEqual(ticket.status, 'waiting_operator', 'panelda javobsiz sifatida ko\'rinishi kerak');
  },

  'operator guruhiga karta yetmasa (qoralama) har xabarga haqiqat aytiladi': async () => {
    const t = await setup([
      { reply: 'Birinchi javob', calls: [['open_article', { id: 'finance.pay' }]] },
      { reply: 'Ikkinchi javob', calls: [['open_article', { id: 'finance.pay' }]] },
    ]);
    await t.link(OWNER, ownerAuth);
    t.failChats.add(OP);
    await t.ask(OWNER, 'kassa qayerda');
    await t.ask(OWNER, 'va yana bitta savol');
    const texts = t.to(OWNER).map((m) => m.text);
    assert.strictEqual(texts.length, 2, 'ikkinchi xabarga javobsiz qoldi: ' + JSON.stringify(texts));
    assert.ok(texts.every((x) => /xodimga ham yetkaza olmadim/.test(x)), JSON.stringify(texts));
    assert.strictEqual((await t.db.supportTicket.findFirst()).status, 'waiting_operator');
  },

  '"Yangi savol"dan keyin oldingi gap kontekst sifatida modelga beriladi': async () => {
    const t = await setup([
      { reply: 'Eskiz ulanmagan ekan.', calls: [['open_article', { id: 'general.phone' }]] },
      { reply: 'Ulash uchun Sozlamalar → Integratsiyalar.', calls: [['open_article', { id: 'general.phone' }]] },
    ], { operator: false });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'sms ketmayapti');
    await t.support.flow.onMenu(OWNER, t.tg, 'newQuestion');
    await t.ask(OWNER, 'hozir ulanmagan deyapdiku, qanday ulayman?');
    const second = t.ai.seen[1].messages.filter((m) => m.role !== 'system');
    const joined = second.map((m) => m.content).join('\n');
    assert.ok(joined.includes('[Oldingi murojaatdan]') && joined.includes('sms ketmayapti') && joined.includes('Eskiz ulanmagan ekan'),
      'oldingi gap modelga berilmadi: ' + joined);
    // Joriy savol oxirgi xabar bo'lib qoladi
    assert.ok(second[second.length - 1].content.includes('hozir ulanmagan deyapdiku'));
  },

  'eski murojaat (24 soatdan oldingi) yangi savolga aralashmaydi': async () => {
    const t = await setup([
      { reply: 'Birinchi', calls: [['open_article', { id: 'general.phone' }]] },
      { reply: 'Ikkinchi', calls: [['open_article', { id: 'general.phone' }]] },
    ], { operator: false });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'eski savol matni');
    await t.support.flow.onMenu(OWNER, t.tg, 'newQuestion');
    // Soxta baza update'da updatedAt ni yangilaydi — eskirganini qo'lda qo'yamiz
    (await t.db.supportTicket._rows()).forEach((r) => { r.updatedAt = new Date(Date.now() - 25 * 3600 * 1000); });
    await t.ask(OWNER, 'butunlay boshqa savol');
    const joined = t.ai.seen[1].messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
    assert.ok(!joined.includes('eski savol matni'), 'eski gap qo\'shildi');
  },

  'qoralama rejimi: javob avval operatorga boradi, "Yuborish" bosilgach mijozga yetadi': async () => {
    const t = await setup([{ reply: "Moliya → Kassa bo'limida to'lovni qabul qiling.", calls: [['open_article', { id: 'finance.pay' }]] }]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, "to'lovni qanday qabul qilaman?");

    assert.strictEqual(t.to(OWNER).length, 1);
    assert.match(t.last(OWNER).text, /qabul qilindi/);
    const card = t.last(OP);
    assert.ok(card.text.includes('Tayyor javob') && card.text.includes('Smile'));
    const draft = await t.db.supportMessage.findFirst({ where: { kind: 'draft' } });
    assert.strictEqual(draft.state, 'pending');

    const toast = await t.support.operator.onCallback(OP, t.button(card, 'sd:').data, card.id, 'Ulug\'bek');
    assert.strictEqual(toast, 'Yuborildi');
    const answer = t.last(OWNER);
    assert.ok(answer.text.includes('Moliya → Kassa'));
    assert.ok(answer.buttons.flat().some((b) => b.url && b.url.endsWith('/finance?tab=kassa')), 'bo\'lim tugmasi yo\'q');
    assert.ok(answer.buttons.flat().some((b) => b.url && b.url.includes('guide=task-payment')), 'qo\'llanma tugmasi yo\'q');
    assert.ok(t.button(answer, 'ok:') && t.button(answer, 'hm:'));
    assert.strictEqual((await t.db.supportMessage.findFirst({ where: { kind: 'draft' } })).state, 'sent');
    // Ikkinchi marta bosish javobni qayta yubormaydi
    const before = t.to(OWNER).length;
    await t.support.operator.onCallback(OP, t.button(card, 'sd:').data, card.id, 'Ulug\'bek');
    assert.strictEqual(t.to(OWNER).length, before);
  },

  'operator o\'zi javob yozsa: mijozga boradi, qoralama "tahrirlangan" bo\'ladi': async () => {
    const t = await setup([{ reply: 'Bot javobi', calls: [['open_article', { id: 'finance.pay' }]] }]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'kassa qayerda');
    const card = t.last(OP);
    const note = await t.support.operator.onReply(OP, card.id, 'Moliya bo\'limida, chapdagi menyuda.', 'Ulug\'bek');
    assert.strictEqual(note, '✓ Yetkazildi');
    assert.strictEqual(t.last(OWNER).text, 'Moliya bo\'limida, chapdagi menyuda.');
    assert.strictEqual((await t.db.supportMessage.findFirst({ where: { kind: 'draft' } })).state, 'edited');
    const ticket = await t.db.supportTicket.findFirst();
    assert.deepStrictEqual([ticket.status, ticket.resolvedBy], ['human', 'operator']);
    // Bundan keyin mijoz yozsa — bot aralashmaydi, operatorga yetkazadi (model chaqirilmaydi)
    await t.ask(OWNER, 'rahmat, yana bir savol bor edi');
    assert.strictEqual(t.ai.seen.length, 1);
    assert.ok(t.last(OP).text.includes('yana bir savol'));
  },

  'begona chatdan operator tugmasi va javobi ishlamaydi': async () => {
    const t = await setup([{ reply: 'Javob', calls: [['open_article', { id: 'finance.pay' }]] }]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'savol');
    const card = t.last(OP);
    assert.strictEqual(await t.support.operator.onCallback(STRANGER, t.button(card, 'sd:').data, card.id, 'Yovuz'), '');
    assert.strictEqual(await t.support.operator.onReply(STRANGER, card.id, 'soxta javob', 'Yovuz'), null);
    assert.strictEqual(t.to(OWNER).length, 1, 'begona odam mijozga javob yubora oldi');
  },

  'avtomatik rejim: ishonchli mavzuda bot o\'zi javob beradi': async () => {
    const t = await setup([{ reply: "Moliya → Kassa bo'limida.", calls: [['open_article', { id: 'finance.pay' }]] }],
      { mode: 'auto', settings: { categoryModes: { howto: 'auto' } } });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, "to'lov qayerda?");
    assert.ok(t.last(OWNER).text.includes('Moliya → Kassa'));
    assert.strictEqual(t.to(OP).length, 0, 'operatorga keraksiz karta ketdi');
    const ticket = await t.db.supportTicket.findFirst();
    assert.strictEqual(ticket.category, 'howto');
    assert.ok(ticket.firstReplyAt);
    assert.strictEqual(t.logs[0].endpoint, 'support');
    // "Hal bo'ldi" — murojaat bot tomonidan yopilgan deb hisoblanadi
    const answer = t.last(OWNER);
    await t.support.flow.onUserCallback(OWNER, t.button(answer, 'ok:').data, answer.id);
    const closed = await t.db.supportTicket.findFirst();
    assert.deepStrictEqual([closed.status, closed.resolvedBy, closed.rating], ['resolved', 'bot', 1]);
  },

  'avtomatik rejimda ham shubhali javob operatorga boradi': async () => {
    const t = await setup([
      { reply: "Hisob-kitob → To'lovlar bo'limini oching.", calls: [['open_article', { id: 'finance.pay' }]] }, // ilovada yo'q bo'lim
      { reply: 'Menimcha Sozlamalarda bo\'lsa kerak.' }, // hech narsaga tayanmagan
    ], { mode: 'auto', settings: { categoryModes: { howto: 'auto', other: 'auto' } } });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, "to'lov qayerda?");
    assert.ok(t.last(OP).text.includes("ilovada yo'q bo'lim"));
    assert.ok(!t.last(OWNER).text.includes('Hisob-kitob'));
    await t.support.flow.onMenu(OWNER, t.tg, 'newQuestion');
    await t.ask(OWNER, 'filial qanday ochiladi?');
    assert.ok(t.last(OP).text.includes('tayanmagan'));
  },

  '"Operator kerak" va model uzatishi: operatorga karta, mijozga xabar': async () => {
    const t = await setup([
      { reply: "Savolingizni mutaxassisga yubordim.", calls: [['escalate', { sabab: 'Pul qaytarish so\'ralmoqda', xulosa: 'Mijoz ortiqcha to\'lovni qaytarishni so\'radi' }]] },
    ], { mode: 'auto' });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'pulimni qaytaring');
    assert.ok(t.last(OP).text.includes('Pul qaytarish'));
    assert.strictEqual(t.last(OWNER).text, 'Savolingizni mutaxassisga yubordim.');
    assert.strictEqual((await t.db.supportTicket.findFirst()).status, 'waiting_operator');
  },

  'model ishlamasa savol yo\'qolmaydi — operatorga uzatiladi': async () => {
    const t = await setup([{ throw: 'AI xizmati band' }]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'sms ketmayapti');
    assert.ok(t.last(OP).text.includes('sms ketmayapti'));
    assert.match(t.last(OWNER).text, /operatorga uzatdim/);
    assert.strictEqual(t.logs[0].error, 'AI xizmati band');
    assert.strictEqual((await t.db.supportMessage.findFirst({ where: { direction: 'in' } })).state, 'done');
  },

  'operator ulanmagan bo\'lsa bot javobsiz qoldirmaydi': async () => {
    const t = await setup([{ reply: 'Ha, telefonda ishlaydi.', calls: [['open_article', { id: 'general.phone' }]] }], { operator: false });
    await t.ask(STRANGER, 'telefonda ishlaydimi?');
    assert.strictEqual(t.last(STRANGER).text, 'Ha, telefonda ishlaydi.');
  },

  'ulanmagan odamga klinika asboblari berilmaydi, yopiq maqola ochilmaydi': async () => {
    const t = await setup([{ reply: 'Ulanish kerak.', calls: [['open_article', { id: 'finance.pay' }], ['check_subscription', {}]] }], { operator: false });
    await t.ask(STRANGER, 'obunam qachon tugaydi');
    assert.deepStrictEqual(t.ai.seen[0].tools.sort(), ['escalate', 'open_article']);
    // Model ro'yxatda yo'q asbobni chaqirsa ham (to'qib) — ma'lumot chiqmaydi
    assert.ok(t.ai.seen[0].results.every((r) => String(r).includes('xato')), 'ulanmagan odamga ma\x27lumot chiqdi');
    const system = t.ai.seen[0].messages[0].content;
    assert.ok(!system.includes('finance.pay') && system.includes('general.phone'), 'mundarijada rolga yopiq maqola');
    assert.strictEqual(t.last(STRANGER).keyboard, 'contact');
  },

  'ketma-ket qisqa xabarlar bitta savol bo\'lib o\'qiladi': async () => {
    const t = await setup([{ reply: 'Javob', calls: [['open_article', { id: 'finance.pay' }]] }]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.enqueue(OWNER, t.tg, { kind: 'text', text: 'salom' });
    await t.support.flow.enqueue(OWNER, t.tg, { kind: 'text', text: "to'lov qilmoqchiman" });
    await t.support.flow.enqueue(OWNER, t.tg, { kind: 'text', text: 'qayerdan?' });
    await t.support.flow.idle();
    assert.strictEqual(t.ai.seen.length, 1);
    const userMsg = t.ai.seen[0].messages.slice(-1)[0].content;
    assert.ok(userMsg.includes('salom') && userMsg.includes('qayerdan?'));
    // Joriy savol tarixda takrorlanmaydi
    assert.strictEqual(t.ai.seen[0].messages.length, 2);
  },

  'deploydan keyin javobsiz qolgan savol davom ettiriladi': async () => {
    const t = await setup([{ reply: 'Javob', calls: [['open_article', { id: 'finance.pay' }]] }], { mode: 'auto', settings: { categoryModes: { howto: 'auto' } } });
    await t.link(OWNER, ownerAuth);
    // Server xabarni olib, javob bermay o'chgan holat
    await t.db.supportMessage.create({ data: { chatId: OWNER, direction: 'in', author: 'user', kind: 'text', text: 'kassa qayerda', state: 'processing', createdAt: new Date(Date.now() - 2 * 60 * 1000) } });
    assert.strictEqual(await t.support.flow.resume(), 1);
    await new Promise((r) => setTimeout(r, 1100));
    await t.support.flow.idle();
    assert.strictEqual(t.last(OWNER).text, 'Javob');
  },

  'rasm matnsiz kelsa bot taxmin qilmaydi — nima muammoligini so\'raydi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.enqueue(OWNER, t.tg, { kind: 'photo', fileId: 'F1' });
    await t.support.flow.idle();
    assert.match(t.last(OWNER).text, /Rasmni oldim/);
    assert.strictEqual(t.ai.seen.length, 0);
  },

  'mijoz qoralama tasdiqlanguncha yana yozsa — eski qoralama yuborilmaydi': async () => {
    const t = await setup([
      { reply: 'Birinchi javob', calls: [['open_article', { id: 'finance.pay' }]] },
      { reply: 'Ikkinchi javob', calls: [['open_article', { id: 'finance.pay' }]] },
    ]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, "to'lov qayerda");
    const firstCard = t.last(OP);
    await t.ask(OWNER, "aniqrog'i, karta orqali to'lov");
    const secondCard = t.last(OP);
    assert.strictEqual(await t.support.operator.onCallback(OP, t.button(firstCard, 'sd:').data, firstCard.id, 'Op'), 'Allaqachon hal qilingan');
    await t.support.operator.onCallback(OP, t.button(secondCard, 'sd:').data, secondCard.id, 'Op');
    const answers = t.to(OWNER).filter((m) => /javob$/.test(m.text));
    assert.deepStrictEqual(answers.map((m) => m.text), ['Ikkinchi javob']);
    // Almashtirilgan qoralama botning xatosi sifatida hisoblanmaydi
    assert.deepStrictEqual(await t.support.tickets.categoryStats('howto'), { drafts: 1, unedited: 1, rate: 1 });
  },

  "notanish odam botni xabar bilan bosib qo'ya olmaydi": async () => {
    const { ANSWERS_PER_HOUR, MESSAGES_PER_HOUR } = require(at('support/flow.ts'));
    const script = Array.from({ length: 60 }, () => ({ reply: 'Ha.', calls: [['open_article', { id: 'general.phone' }]] }));
    const t = await setup(script, { operator: false });
    for (let i = 0; i < ANSWERS_PER_HOUR.stranger + 3; i++) await t.ask(STRANGER, 'telefonda ishlaydimi ' + i);
    assert.strictEqual(t.ai.seen.length, ANSWERS_PER_HOUR.stranger, 'chegaradan keyin ham model chaqirildi');
    assert.match(t.last(STRANGER).text, /juda ko'p xabar/);
    // Xabarlarning o'zi ham cheksiz yozilmaydi
    for (let i = 0; i < MESSAGES_PER_HOUR.stranger + 20; i++) await t.support.flow.enqueue(STRANGER, t.tg, { kind: 'text', text: 'spam' });
    await t.support.flow.idle();
    assert.ok(await t.db.supportMessage.count({ where: { chatId: STRANGER, direction: 'in' } }) <= MESSAGES_PER_HOUR.stranger);
  },

  "ishlov o'rtada yiqilsa xabar osilib qolmaydi va mijozga aytiladi": async () => {
    const t = await setup([{ reply: 'Javob', calls: [['open_article', { id: 'finance.pay' }]] }]);
    await t.link(OWNER, ownerAuth);
    // Operator chatiga yuborish paytidagi kutilmagan xato
    const original = t.support.operator.draftCard;
    t.support.operator.draftCard = async () => { throw new Error('tarmoq uzildi'); };
    await t.ask(OWNER, "to'lov qayerda");
    t.support.operator.draftCard = original;
    assert.match(t.last(OWNER).text, /qayta yuboring/);
    assert.strictEqual(await t.db.supportMessage.count({ where: { direction: 'in', state: 'processing' } }), 0);
    assert.deepStrictEqual(await t.support.tickets.chatsWithPending(), []);
  },

  'operatorda javobsiz qolib ketgan eski murojaat yangi savolga yopishmaydi': async () => {
    const t = await setup([
      { reply: '', calls: [['escalate', { sabab: 'Topilmadi', xulosa: 'x' }]] },
      { reply: 'Yangi javob', calls: [['open_article', { id: 'finance.pay' }]] },
    ]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'eski savol');
    const old = await t.db.supportTicket.findFirst();
    assert.strictEqual(old.status, 'waiting_operator');
    await t.db.supportTicket.update({ where: { id: old.id }, data: { updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    t.db.supportTicket.update = ((orig) => async (args) => orig({ ...args, data: { ...args.data } }))(t.db.supportTicket.update);
    // Soxta baza update'da updatedAt ni yangilaydi — eskirganini qo'lda qaytaramiz
    (await t.db.supportTicket._rows()).find((r) => r.id === old.id).updatedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await t.ask(OWNER, 'yangi savol');
    const all = await t.db.supportTicket.findMany();
    assert.strictEqual(all.length, 2);
    assert.deepStrictEqual([all.find((x) => x.id === old.id).status, all.find((x) => x.id === old.id).resolvedBy], ['closed', 'nobody']);
  },

  // ── Ko'rib chiqish topilmalari ────────────────────────────────────────────
  'savol o\'rtada o\'chib qolsa xabar "processing" da qoladi va qayta olinadi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    // Model javob bermay osilib qoladi (jarayon o'chgan holat)
    t.ai.chatWithTools = () => new Promise(() => { });
    await t.support.flow.enqueue(OWNER, t.tg, { kind: 'text', text: 'kassa qayerda' });
    await new Promise((r) => setTimeout(r, 150));
    const row = await t.db.supportMessage.findFirst({ where: { direction: 'in' } });
    assert.strictEqual(row.state, 'processing', 'javob yo\'q, lekin xabar done bo\'lib qoldi');
    assert.ok(row.ticketId, 'murojaatga biriktirilmagan');
    // Keyingi ishga tushishda (xabar 2 daqiqa oldin yozilgan) qayta ko'riladi
    t.db.supportMessage._rows().find((r) => r.id === row.id).createdAt = new Date(Date.now() - 2 * 60 * 1000);
    assert.deepStrictEqual(await t.support.tickets.chatsWithPending(), [OWNER]);
  },

  'operator ulanmagan: chek "qabul qilindi" deb aldanmaydi va vaqtincha ochilmaydi': async () => {
    const t = await setup([], { operator: false, expiry: todayTashkent(-2) });
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onMenu(OWNER, t.tg, 'pay');
    assert.strictEqual(await t.support.flow.tryReceipt(OWNER, 'photo', 'R'), true);
    assert.match(t.last(OWNER).text, /chekni qabul qila olmayapmiz/);
    assert.strictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate, todayTashkent(-2));
    assert.strictEqual(await t.db.subscriptionPayment.count(), 0);
    const action = await t.db.supportAction.findFirst({ where: { kind: 'subscription_extend' } });
    assert.strictEqual(action.status, 'awaiting_receipt', 'so\'rov yo\'qolgan');
  },

  'operator ulanmagan: shubhali javob mijozga o\'zi ketmaydi': async () => {
    const t = await setup([{ reply: "Hisob-kitob → To'lovlar bo'limini oching.", calls: [['open_article', { id: 'finance.pay' }]] }], { operator: false, mode: 'auto' });
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, "to'lov qayerda?");
    assert.ok(!t.to(OWNER).some((m) => (m.text || '').includes('Hisob-kitob')), 'ilovada yo\'q bo\'lim mijozga ketdi');
    assert.match(t.last(OWNER).text, /xodimga ham yetkaza olmadim/);
    const draft = await t.db.supportMessage.findFirst({ where: { kind: 'draft' } });
    assert.strictEqual(draft.state, 'pending', 'qoralama panelda ko\'rinishi kerak');
  },

  'operator chati yetib bormasa: "mutaxassisga uzatdim" deb aldanmaydi, panelga qayd tushadi': async () => {
    const t = await setup([{ reply: 'x', calls: [['escalate', { sabab: 'Topilmadi', xulosa: 'x' }]] }]);
    await t.link(OWNER, ownerAuth);
    // Operator chatiga yuborib bo'lmaydi (guruh o'zgargan, bot chiqarib yuborilgan)
    t.failChats.add(OP);
    await t.ask(OWNER, 'kassani yopish qanday?');
    assert.doesNotMatch(t.last(OWNER).text, /mutaxassisga/i);
    assert.doesNotMatch(t.last(OWNER).text, /yozamiz/i);
    assert.match(t.last(OWNER).text, /xodimga ham yetkaza olmadim/);
    assert.ok(await t.db.diagEvent.findFirst({ where: { subject: 'support_operator' } }), 'panelga qayd tushmadi');
  },

  "yetib bormagan javob \"yuborildi\" bo'lmaydi — qoralama qaytadi": async () => {
    const t = await setup([{ reply: 'Javob', calls: [['open_article', { id: 'finance.pay' }]] }]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, "to'lov qayerda");
    const card = t.last(OP);
    // Foydalanuvchi botni to'xtatgan: yuborish null qaytaradi
    t.failChats.add(OWNER);
    const toast = await t.support.operator.onCallback(OP, t.button(card, 'sd:').data, card.id, 'Op');
    assert.match(toast, /Yetkazib bo'lmadi/);
    assert.strictEqual((await t.db.supportMessage.findFirst({ where: { kind: 'draft' } })).state, 'pending');
  },

  "parol: yuborib bo'lmasa parol o'zgartirilmaydi": async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onMenu(OWNER, t.tg, 'reset');
    const confirm = t.last(OWNER);
    // Tasdiqlash tugmasi bosilgan paytda foydalanuvchi botni to'xtatgan: parol yetib bormaydi
    t.failChats.add(OWNER);
    await t.support.flow.onUserCallback(OWNER, t.button(confirm, 'pr:').data, confirm.id);
    assert.strictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).password, 'old', "parol yuborilmasdan o'zgartirildi");
    const action = await t.db.supportAction.findFirst({ where: { kind: 'owner_password_reset' } });
    assert.strictEqual(action.status, 'failed');
  },

  'operator tugmasi qayta-qayta bosilsa yangi karta ochilmaydi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onMenu(OWNER, t.tg, 'operator');
    const cards = t.to(OP).length;
    await t.support.flow.onMenu(OWNER, t.tg, 'operator');
    await t.support.flow.onMenu(OWNER, t.tg, 'operator');
    assert.strictEqual(t.to(OP).length, cards, 'har bosishga yangi karta ketdi');
    assert.match(t.last(OWNER).text, /operatorga yetkazdim/);
  },

  'notanish odam menyu va kontaktni bosib operator chatini to\'ldira olmaydi': async () => {
    const t = await setup([]);
    for (let i = 0; i < 40; i++) {
      await t.support.flow.onMenu(STRANGER, t.tg, 'operator');
      await t.support.flow.onContact(STRANGER, t.tg, '+79001112233', true);
    }
    assert.ok(t.to(OP).length <= 2, 'operator chati kartalar bilan to\'ldi: ' + t.to(OP).length);
  },

  'xodim so\'rovini boshqa klinikaga o\'tgan odam tasdiqlata olmaydi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onContact(STAFF, t.tg, '998912223344', true);
    await t.support.flow.onMenu(STAFF, t.tg, 'reset');
    const ask = t.last(OWNER);
    // So'ragan xodim endi boshqa klinikaning odami sifatida qayta ulangan
    await t.db.supportUser.update({ where: { chatId: STAFF }, data: { clinicId: 'c9', staffId: 'x9' } });
    const toast = await t.support.flow.onUserCallback(OWNER, t.button(ask, 'po:').data, ask.id);
    assert.match(toast, /eskirgan|bajarilgan/);
    assert.strictEqual((await t.db.doctor.findUnique({ where: { id: 'd1' } })).password, 'p');
  },

  // ── Parol ─────────────────────────────────────────────────────────────────
  'parol: ilova orqali ulangan rahbar o\'zi tasdiqlaydi va yangi parol oladi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onMenu(OWNER, t.tg, 'reset');
    const confirm = t.last(OWNER);
    await t.support.flow.onUserCallback(OWNER, t.button(confirm, 'pr:').data, confirm.id);
    const creds = t.last(OWNER).text;
    assert.ok(creds.includes('Login: smile'));
    const password = creds.match(/Parol: (\S+)/)[1];
    const stored = (await t.db.clinic.findUnique({ where: { id: 'c1' } })).password;
    assert.ok(await bcrypt.compare(password, stored));
    // Parol suhbat jurnaliga yozilmaydi
    const rows = await t.db.supportMessage.findMany();
    assert.ok(!rows.some((r) => (r.text || '').includes(password)), 'parol bazadagi suhbatga yozildi');
    // Tugmani qayta bosish ikkinchi parol bermaydi
    await t.support.flow.onUserCallback(OWNER, t.button(confirm, 'pr:').data, confirm.id);
    assert.ok(await bcrypt.compare(password, (await t.db.clinic.findUnique({ where: { id: 'c1' } })).password));
  },

  'parol: telefon orqali ulangan rahbarga faqat operator tasdig\'i bilan': async () => {
    const t = await setup([]);
    await t.support.flow.onContact(OWNER, t.tg, '+998 90 111 22 33', true);
    await t.support.flow.onMenu(OWNER, t.tg, 'reset');
    assert.match(t.last(OWNER).text, /tekshiruvga yuborildi/);
    assert.strictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).password, 'old', 'parol tasdiqsiz o\'zgardi');
    const card = t.last(OP);
    // Mijozning o'zi "tasdiqlash" tugmasini yubora olmaydi
    const actionId = t.button(card, 'pw:').data.split(':')[1];
    assert.ok((await t.support.flow.onUserCallback(OWNER, `pr:${actionId}`, 1)).length > 0);
    assert.strictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).password, 'old');
    await t.support.operator.onCallback(OP, t.button(card, 'pw:').data, card.id, 'Ulug\'bek');
    assert.ok(t.last(OWNER).text.includes('Login: smile'));
    assert.notStrictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).password, 'old');
  },

  'parol: boshqa odamning kontakti bilan ulanib bo\'lmaydi': async () => {
    const t = await setup([]);
    await t.support.flow.onContact(STRANGER, t.tg, '+998901112233', false);
    assert.match(t.last(STRANGER).text, /boshqa odamning raqami/);
    assert.strictEqual((await t.support.identity.getUser(STRANGER)).role ?? null, null);
  },

  'parol: xodim so\'rovini klinika rahbari tasdiqlaydi; parol faqat xodimga boradi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onContact(STAFF, t.tg, '998912223344', true);
    await t.support.flow.onMenu(STAFF, t.tg, 'reset');
    assert.match(t.last(STAFF).text, /rahbariga yuborildi/);
    const ask = t.last(OWNER);
    assert.ok(ask.text.includes('Olim Sobirov'));
    // Xodim o'zi tasdiqlay olmaydi
    await t.support.flow.onUserCallback(STAFF, t.button(ask, 'po:').data, 1);
    assert.strictEqual((await t.db.doctor.findUnique({ where: { id: 'd1' } })).password, 'p');
    await t.support.flow.onUserCallback(OWNER, t.button(ask, 'po:').data, ask.id);
    assert.ok(t.last(STAFF).text.includes('Login: olim'));
    assert.ok(!t.to(OWNER).some((m) => /Parol: /.test(m.text || '')), 'xodim paroli rahbarga ham ketdi');
    assert.notStrictEqual((await t.db.doctor.findUnique({ where: { id: 'd1' } })).password, 'p');
  },

  'parol: rahbar botga ulanmagan bo\'lsa xodimga nima qilish aytiladi': async () => {
    const t = await setup([]);
    await t.support.flow.onContact(STAFF, t.tg, '998912223344', true);
    await t.support.flow.onMenu(STAFF, t.tg, 'reset');
    assert.match(t.last(STAFF).text, /hali bu botga ulanmagan/);
    assert.strictEqual(await t.db.supportAction.count(), 0);
  },

  // ── To'lov ────────────────────────────────────────────────────────────────
  'to\'lov: chek → operator kartasi → bir tugma bilan uzayadi, ikkinchi bosish ta\'sir qilmaydi': async () => {
    const t = await setup([], { settings: { payInfoUz: 'Karta: 8600 **** 1234' }, mode: 'draft' });
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onMenu(OWNER, t.tg, 'pay');
    assert.ok(t.last(OWNER).text.includes('8600 **** 1234'));
    assert.strictEqual(await t.support.flow.tryReceipt(OWNER, 'photo', 'RECEIPT'), true);
    const card = t.last(OP);
    assert.strictEqual(card.file, 'RECEIPT');
    assert.ok(card.text.includes('Smile') && card.text.includes('Pro'));
    const before = (await t.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate;
    const toast = await t.support.operator.onCallback(OP, t.button(card, 'py:').data.replace(/:\d+$/, ':3'), card.id, 'Ulug\'bek');
    assert.match(toast, /Uzaytirildi/);
    const after = (await t.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate;
    assert.strictEqual(after, addMonths(before, 3));
    assert.match(t.last(OWNER).text, /tasdiqlandi/);
    assert.strictEqual(await t.support.operator.onCallback(OP, t.button(card, 'py:').data, card.id, 'Ulug\'bek'), 'Allaqachon hal qilingan');
    assert.strictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate, after);
    const pay = await t.db.subscriptionPayment.findFirst({ where: { kind: 'payment' } });
    assert.deepStrictEqual([pay.months, pay.amount, pay.receiptFileId, pay.approvedBy], [3, 900000, 'RECEIPT', 'Ulug\'bek']);
  },

  'to\'lov: muddati tugagan klinika chek yuborganda vaqtincha ochiladi': async () => {
    const t = await setup([], { expiry: todayTashkent(-2) });
    await t.link(OWNER, ownerAuth);
    await t.support.flow.onMenu(OWNER, t.tg, 'pay');
    await t.support.flow.tryReceipt(OWNER, 'photo', 'R');
    assert.strictEqual((await t.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate, todayTashkent(2));
    assert.match(t.last(OWNER).text, /ochib qo'yildi/);
    assert.ok(t.last(OP).text.includes('vaqtincha'));
  },

  'to\'lov: chek kutilmayotganda rasm chek deb olinmaydi; ulanmagan odam to\'lov boshlay olmaydi': async () => {
    const t = await setup([]);
    await t.link(OWNER, ownerAuth);
    assert.strictEqual(await t.support.flow.tryReceipt(OWNER, 'photo', 'X'), false);
    await t.support.flow.onMenu(STRANGER, t.tg, 'pay');
    assert.match(t.last(STRANGER).text, /qaysi klinikadan/);
    assert.strictEqual(await t.db.supportAction.count(), 0);
  },

  // ── O'rganish ─────────────────────────────────────────────────────────────
  'yopilgan murojaatdan maqola yasaladi va keyingi savolda ishlatiladi': async () => {
    const t = await setup([{ reply: '', calls: [['escalate', { sabab: 'Topilmadi', xulosa: 'Kassani yopish haqida so\'radi' }]] }]);
    await t.link(OWNER, ownerAuth);
    await t.ask(OWNER, 'kassani qanday yopaman?');
    const card = t.last(OP);
    await t.support.operator.onReply(OP, card.id, 'Moliya → Kassa da "Kunni yopish" tugmasini bosing.', 'Ulug\'bek');
    await t.support.operator.onCallback(OP, t.button(card, 'cl:').data, card.id, 'Ulug\'bek');
    const ticket = await t.db.supportTicket.findFirst();
    await t.support.operator.onCallback(OP, `kb:${ticket.id}`, card.id, 'Ulug\'bek');
    const learned = (await t.db.supportArticle.findMany()).find((a) => a.source === 'learned');
    assert.ok(learned && learned.titleUz === 'Kassani yopish');
    // Mijoz matnidan yasalgan maqola tekshiruvsiz yoqilmaydi
    assert.strictEqual(learned.active, false);
    assert.ok(!(await t.support.kb.indexFor('CLINIC_ADMIN', 'uz')).includes('Kassani yopish'));
    await t.support.kb.setActive(learned.id, true);
    assert.ok((await t.support.kb.indexFor('CLINIC_ADMIN', 'uz')).includes('Kassani yopish'));
    // Deploy (seed qayta yozilishi) o'rgatilgan maqolani o'chirmaydi
    await t.support.kb.syncSeed(SEED);
    assert.ok((await t.db.supportArticle.findMany()).some((a) => a.id === learned.id));
  },
});
