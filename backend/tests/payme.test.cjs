// Payme Merchant API va buyurtma yaratish. Soxta baza bilan — Payme'ga ham, haqiqiy bazaga ham ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/payme.test.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const at = (f) => path.join(__dirname, '..', f);
const { createPaymeMerchant, PAYME_TIMEOUT_MS, isAuthorized, externalIdOf, UNPARSABLE_BODY } = require(at('payme/merchant.ts'));
const { createPaymeOrders, readPaymeConfig, checkoutUrl, MAX_ORDERS_PER_WINDOW } = require(at('payme/orders.ts'));
const { safeReturnUrl } = require(at('payme/routes.ts'));
const { createBilling, addMonths } = require(at('support/billing.ts'));
const { todayTashkent } = require(at('support/text.ts'));

const KEY = 'test-key-123';
const AUTH = 'Basic ' + Buffer.from('Paycom:' + KEY).toString('base64');
const FISCAL_ENV = { PAYME_IKPU_CODE: '10305008002000000', PAYME_PACKAGE_CODE: '1501313', PAYME_VAT_PERCENT: '0' };

/** Har test uchun yangi muhit: klinika (oyiga 300 000 so'm), buyurtma, soat */
const setup = ({ env = {}, extendFails = false } = {}) => {
  const db = createFakeDb({
    clinic: [{ id: 'c1', name: 'Tabassum <Dent>', status: 'Active', planId: 'p1', customPrice: null, expiryDate: todayTashkent(5), subscriptionType: 'Paid' }],
    subscriptionPlan: [{ id: 'p1', name: 'Standart', price: 300000 }],
  });
  const config = readPaymeConfig({ PAYME_MERCHANT_ID: 'm-1', PAYME_KEY: KEY, ...env });
  const billing = createBilling({ db, withActor: (_a, fn) => fn() });
  const clock = { t: 1_800_000_000_000 };
  const notes = [];
  const merchant = createPaymeMerchant({
    db,
    getConfig: () => config,
    extend: async (...args) => {
      if (extendFails) throw new Error('baza ishlamayapti');
      return billing.extend(...args);
    },
    notify: (t) => { notes.push(t); },
    now: () => clock.t,
  });
  const orders = createPaymeOrders(db, () => config);
  const call = (method, params, auth = AUTH) =>
    merchant.handle({ httpMethod: 'POST', authorization: auth, body: JSON.stringify({ id: 7, method, params }) });
  return { db, merchant, orders, call, clock, notes, config, billing };
};

const newOrder = async (env, months = 3) => (await env.orders.create({ clinicId: 'c1', months })).orderId;
const AMOUNT_3M = 300000 * 100 * 3;

runTests({
  async 'kalit noto\'g\'ri bo\'lsa -32504, sozlanmagan bo\'lsa ham -32504'() {
    const env = setup();
    const r = await env.call('CheckTransaction', { id: 'x' }, 'Basic ' + Buffer.from('Paycom:boshqa').toString('base64'));
    assert.strictEqual(r.error.code, -32504);
    assert.strictEqual(r.id, 7);
    assert.strictEqual((await env.call('CheckTransaction', { id: 'x' }, '')).error.code, -32504);
    assert.strictEqual(isAuthorized(AUTH, KEY), true);
    assert.strictEqual(isAuthorized('Bearer abc', KEY), false);

    const off = createPaymeMerchant({ db: env.db, getConfig: () => null, extend: async () => ({}) });
    const r2 = await off.handle({ httpMethod: 'POST', authorization: AUTH, body: '{"id":1,"method":"CheckTransaction","params":{}}' });
    assert.strictEqual(r2.error.code, -32504);
  },

  async 'POST emas -32300, buzuq JSON -32700, noma\'lum usul -32601'() {
    const env = setup();
    assert.strictEqual((await env.merchant.handle({ httpMethod: 'GET', authorization: AUTH, body: '' })).error.code, -32300);
    assert.strictEqual((await env.merchant.handle({ httpMethod: 'POST', authorization: AUTH, body: '{buzuq' })).error.code, -32700);
    const r = await env.call('Nimadir', {});
    assert.strictEqual(r.error.code, -32601);
    assert.strictEqual(r.error.data, 'Nimadir');
    assert.ok(r.error.message.uz && r.error.message.ru && r.error.message.en);
  },

  async 'CheckPerformTransaction: buyurtma yo\'q -31050, summa xato -31001, to\'g\'ri — allow'() {
    const env = setup();
    const orderId = await newOrder(env);
    const missing = await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: 'yoq' } });
    assert.strictEqual(missing.error.code, -31050);
    assert.strictEqual(missing.error.data, 'order_id');
    assert.strictEqual((await env.call('CheckPerformTransaction', { amount: 100, account: { order_id: orderId } })).error.code, -31001);
    const ok = await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.deepStrictEqual(ok.result, { allow: true }, 'MXIK kodi yo\'q — chek ma\'lumoti qo\'shilmaydi');
  },

  async 'CheckPerformTransaction: MXIK sozlangan bo\'lsa chek ma\'lumoti (narx × soni = summa)'() {
    const env = setup({ env: FISCAL_ENV });
    const orderId = await newOrder(env);
    const ok = await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: orderId } });
    const item = ok.result.detail.items[0];
    assert.strictEqual(ok.result.detail.receipt_type, 0);
    assert.strictEqual(item.count, 3);
    assert.strictEqual(item.price * item.count, AMOUNT_3M);
    assert.strictEqual(item.code, FISCAL_ENV.PAYME_IKPU_CODE);
    assert.strictEqual(item.package_code, FISCAL_ENV.PAYME_PACKAGE_CODE);
    assert.strictEqual(item.vat_percent, 0);
  },

  async 'to\'liq yo\'l: yaratish → o\'tkazish → obuna 3 oyga uzayadi, to\'lov yoziladi, xabar ketadi'() {
    const env = setup();
    const orderId = await newOrder(env);
    const created = await env.call('CreateTransaction', { id: 'pm-1', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.strictEqual(created.result.state, 1);
    assert.strictEqual(created.result.create_time, env.clock.t);

    // Takroriy CreateTransaction — o'sha javob
    const again = await env.call('CreateTransaction', { id: 'pm-1', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.deepStrictEqual(again.result, created.result);

    env.clock.t += 60_000;
    const before = (await env.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate;
    const performed = await env.call('PerformTransaction', { id: 'pm-1' });
    assert.strictEqual(performed.result.state, 2);
    assert.strictEqual(performed.result.perform_time, env.clock.t);
    assert.strictEqual(performed.result.transaction, created.result.transaction);

    const clinic = await env.db.clinic.findUnique({ where: { id: 'c1' } });
    assert.ok(clinic.expiryDate > before, 'muddat uzaydi');
    const pay = await env.db.subscriptionPayment.findFirst({ where: { clinicId: 'c1' } });
    assert.strictEqual(pay.months, 3);
    assert.strictEqual(pay.amount, 900000, 'Payme to\'lagan aniq summa (so\'m)');
    assert.strictEqual(pay.approvedBy, 'Payme');
    assert.strictEqual(pay.note, 'Payme pm-1');
    assert.strictEqual((await env.db.paymeOrder.findUnique({ where: { id: orderId } })).status, 'paid');
    assert.strictEqual(env.notes.length, 1);
    assert.ok(env.notes[0].includes('Tabassum &lt;Dent&gt;') && env.notes[0].includes('900 000'));

    // Takroriy PerformTransaction — muddat ikkinchi marta uzaymaydi
    env.clock.t += 60_000;
    const repeat = await env.call('PerformTransaction', { id: 'pm-1' });
    assert.deepStrictEqual(repeat.result, performed.result);
    assert.strictEqual(await env.db.subscriptionPayment.count({ where: { clinicId: 'c1' } }), 1);

    // To'langan buyurtmani qayta to'lab bo'lmaydi
    assert.strictEqual((await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: orderId } })).error.code, -31008);
    // O'tkazilgan to'lovni bekor qilib bo'lmaydi (xizmat ko'rsatilgan)
    assert.strictEqual((await env.call('CancelTransaction', { id: 'pm-1', reason: 5 })).error.code, -31007);

    const check = await env.call('CheckTransaction', { id: 'pm-1' });
    assert.deepStrictEqual(Object.keys(check.result).sort(), ['cancel_time', 'create_time', 'perform_time', 'reason', 'state', 'transaction']);
    assert.strictEqual(check.result.state, 2);
    assert.strictEqual(check.result.cancel_time, 0);
    assert.strictEqual(check.result.reason, null);
  },

  async 'bitta buyurtmaga ikkinchi tranzaksiya -31008; bekor qilingach yana to\'lash mumkin'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.call('CreateTransaction', { id: 'a', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    const second = await env.call('CreateTransaction', { id: 'b', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.strictEqual(second.error.code, -31008);
    assert.strictEqual((await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: orderId } })).error.code, -31008);

    const cancelled = await env.call('CancelTransaction', { id: 'a', reason: 3 });
    assert.strictEqual(cancelled.result.state, -1);
    assert.ok(cancelled.result.cancel_time > 0);
    // Takroriy bekor qilish — o'sha javob
    assert.deepStrictEqual((await env.call('CancelTransaction', { id: 'a', reason: 3 })).result, cancelled.result);
    // Bekor qilingan tranzaksiyani o'tkazib bo'lmaydi
    assert.strictEqual((await env.call('PerformTransaction', { id: 'a' })).error.code, -31008);
    assert.strictEqual((await env.call('CheckTransaction', { id: 'a' })).result.reason, 3);

    const third = await env.call('CreateTransaction', { id: 'c', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.strictEqual(third.result.state, 1);
  },

  async '12 soatdan keyin o\'tkazib bo\'lmaydi: bekor (sabab 4) va -31008'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.call('CreateTransaction', { id: 'old', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    env.clock.t += PAYME_TIMEOUT_MS + 1;
    assert.strictEqual((await env.call('PerformTransaction', { id: 'old' })).error.code, -31008);
    const check = await env.call('CheckTransaction', { id: 'old' });
    assert.strictEqual(check.result.state, -1);
    assert.strictEqual(check.result.reason, 4);
    assert.strictEqual(await env.db.subscriptionPayment.count({ where: { clinicId: 'c1' } }), 0);
    // Buyurtma bo'shadi — yangi tranzaksiya ochiladi
    const fresh = await env.call('CreateTransaction', { id: 'new', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.strictEqual(fresh.result.state, 1);
  },

  async 'eskirgan ochiq tranzaksiya yangi to\'lovga to\'sqinlik qilmaydi'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.call('CreateTransaction', { id: 'stale', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    env.clock.t += PAYME_TIMEOUT_MS + 1;
    const r = await env.call('CreateTransaction', { id: 'next', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.strictEqual(r.result.state, 1);
    assert.strictEqual((await env.call('CheckTransaction', { id: 'stale' })).result.reason, 4);
  },

  async 'Payme vaqti 12 soatdan eski bo\'lsa tranzaksiya ochilmaydi'() {
    const env = setup();
    const orderId = await newOrder(env);
    const r = await env.call('CreateTransaction', { id: 'late', time: env.clock.t - PAYME_TIMEOUT_MS - 1, amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.strictEqual(r.error.code, -31008);
    assert.strictEqual((await env.db.paymeOrder.findUnique({ where: { id: orderId } })).status, 'new');
  },

  async 'muddatni uzaytirib bo\'lmasa to\'lov o\'tkazilmaydi va holat qaytadi (-32400)'() {
    const env = setup({ extendFails: true });
    const orderId = await newOrder(env);
    await env.call('CreateTransaction', { id: 'f', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    const r = await env.call('PerformTransaction', { id: 'f' });
    assert.strictEqual(r.error.code, -32400);
    assert.strictEqual((await env.call('CheckTransaction', { id: 'f' })).result.state, 1);
    assert.strictEqual((await env.db.paymeOrder.findUnique({ where: { id: orderId } })).status, 'pending');
    assert.strictEqual(env.notes.length, 0);
  },

  async 'muddat uzayib, belgilash uzilib qolgan bo\'lsa: qayta so\'rov tugatadi, ikkinchi marta uzaytirmaydi'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.call('CreateTransaction', { id: 'crash', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    // Server extend() dan keyin, belgilashdan oldin o'chdi deb faraz qilamiz
    await env.billing.extend('c1', 3, { approvedBy: 'Payme', amount: 900000, externalId: externalIdOf('crash') });
    const afterCrash = (await env.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate;

    const r = await env.call('PerformTransaction', { id: 'crash' });
    assert.strictEqual(r.result.state, 2);
    assert.strictEqual((await env.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate, afterCrash, 'qayta uzaymadi');
    assert.strictEqual(await env.db.subscriptionPayment.count({ where: { clinicId: 'c1' } }), 1);
    assert.strictEqual(env.notes.length, 0, 'ikkinchi xabar ketmaydi');
    assert.strictEqual((await env.db.paymeOrder.findUnique({ where: { id: orderId } })).status, 'paid');
  },

  async 'muddat uzaygan ochiq tranzaksiyani bekor qilib bo\'lmaydi (-31007), 12 soatdan keyin ham to\'langan'() {
    const env = setup();
    const o1 = await newOrder(env);
    await env.call('CreateTransaction', { id: 'x1', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: o1 } });
    await env.billing.extend('c1', 3, { approvedBy: 'Payme', externalId: externalIdOf('x1') });
    assert.strictEqual((await env.call('CancelTransaction', { id: 'x1', reason: 3 })).error.code, -31007);
    assert.strictEqual((await env.call('CheckTransaction', { id: 'x1' })).result.state, 2);

    const o2 = await newOrder(env, 1);
    await env.call('CreateTransaction', { id: 'x2', time: env.clock.t, amount: 300000 * 100, account: { order_id: o2 } });
    await env.billing.extend('c1', 1, { approvedBy: 'Payme', externalId: externalIdOf('x2') });
    env.clock.t += PAYME_TIMEOUT_MS + 1;
    assert.strictEqual((await env.call('PerformTransaction', { id: 'x2' })).result.state, 2);
    assert.strictEqual(await env.db.subscriptionPayment.count({ where: { clinicId: 'c1' } }), 2);
  },

  async 'bitta tranzaksiyaga bir vaqtda ikki PerformTransaction — muddat bir marta uzayadi'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.call('CreateTransaction', { id: 'dup', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: orderId } });
    const [a, b] = await Promise.all([env.call('PerformTransaction', { id: 'dup' }), env.call('PerformTransaction', { id: 'dup' })]);
    assert.strictEqual(a.result.state, 2);
    assert.deepStrictEqual(a.result, b.result);
    assert.strictEqual(await env.db.subscriptionPayment.count({ where: { clinicId: 'c1' } }), 1);
    assert.strictEqual(env.notes.length, 1);
  },

  async 'bitta klinikaga parallel ikki to\'lov — ikkalasi ham muddatga qo\'shiladi'() {
    const env = setup();
    const base = (await env.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate;
    const o1 = await newOrder(env, 3);
    const o2 = await newOrder(env, 1);
    await env.call('CreateTransaction', { id: 'p1', time: env.clock.t, amount: AMOUNT_3M, account: { order_id: o1 } });
    await env.call('CreateTransaction', { id: 'p2', time: env.clock.t, amount: 300000 * 100, account: { order_id: o2 } });
    await Promise.all([env.call('PerformTransaction', { id: 'p1' }), env.call('PerformTransaction', { id: 'p2' })]);
    // Oy oxirida (masalan 30-noyabr) "3+1" va "1+3" turli kunga tushadi — qaysi biri birinchi yozilganiga qarab
    const end = (await env.db.clinic.findUnique({ where: { id: 'c1' } })).expiryDate;
    assert.ok([addMonths(addMonths(base, 3), 1), addMonths(addMonths(base, 1), 3)].includes(end), `muddat ${end}`);
    // Zanjir uzilmagan: ikkinchi to'lov birinchisining yangi muddatidan boshlanadi (biri ikkinchisini bosib ketmagan)
    const pays = await env.db.subscriptionPayment.findMany({ where: { clinicId: 'c1' }, orderBy: { createdAt: 'asc' } });
    assert.strictEqual(pays.length, 2);
    assert.strictEqual(pays[0].fromExpiry, base);
    assert.strictEqual(pays[1].fromExpiry, pays[0].toExpiry);
    assert.strictEqual(pays[1].toExpiry, end);
  },

  async 'band, lekin ochiq tranzaksiyasiz buyurtma yana to\'lanadi; meros nomli usul -32601; o\'qilmagan tana -32700'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.db.paymeOrder.update({ where: { id: orderId }, data: { status: 'pending' } });
    assert.deepStrictEqual((await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: orderId } })).result, { allow: true });
    assert.strictEqual((await env.call('constructor', {})).error.code, -32601);
    assert.strictEqual((await env.call('toString', {})).error.code, -32601);
    assert.strictEqual((await env.merchant.handle({ httpMethod: 'POST', authorization: AUTH, body: UNPARSABLE_BODY })).error.code, -32700);
  },

  async 'o\'chirilgan klinika uchun to\'lov qabul qilinmaydi'() {
    const env = setup();
    const orderId = await newOrder(env);
    await env.db.clinic.update({ where: { id: 'c1' }, data: { status: 'Deleted' } });
    const r = await env.call('CheckPerformTransaction', { amount: AMOUNT_3M, account: { order_id: orderId } });
    assert.ok(r.error.code <= -31050 && r.error.code >= -31099);
  },

  async 'topilmagan tranzaksiya -31003; GetStatement vaqt oralig\'ida, o\'sish tartibida'() {
    const env = setup();
    assert.strictEqual((await env.call('PerformTransaction', { id: 'yoq' })).error.code, -31003);
    assert.strictEqual((await env.call('CancelTransaction', { id: 'yoq', reason: 1 })).error.code, -31003);
    assert.strictEqual((await env.call('CheckTransaction', { id: 'yoq' })).error.code, -31003);

    const o1 = await newOrder(env, 1);
    const o2 = await newOrder(env, 12);
    const t0 = env.clock.t;
    await env.call('CreateTransaction', { id: 's2', time: t0 + 10, amount: 300000 * 100 * 12, account: { order_id: o2 } });
    await env.call('CreateTransaction', { id: 's1', time: t0 + 5, amount: 300000 * 100, account: { order_id: o1 } });
    const st = await env.call('GetStatement', { from: t0, to: t0 + 10 });
    assert.deepStrictEqual(st.result.transactions.map((t) => t.id), ['s1', 's2']);
    const t = st.result.transactions[0];
    assert.deepStrictEqual(t.account, { order_id: o1 });
    assert.strictEqual(t.amount, 300000 * 100);
    assert.strictEqual((await env.call('GetStatement', { from: t0 + 11, to: t0 + 99 })).result.transactions.length, 0);
    assert.deepStrictEqual((await env.call('SetFiscalData', { id: 's1', type: 'PERFORM', fiscal_data: {} })).result, { success: true });
  },

  async 'buyurtma: summa tarif narxidan yoki alohida narxdan, havola to\'g\'ri, noto\'g\'ri muddat rad'() {
    const env = setup();
    const o = await env.orders.create({ clinicId: 'c1', months: 12, returnUrl: 'https://dentacrm.uz/settings?tab=plan&paid=1' });
    assert.strictEqual(o.amount, 3_600_000);
    const decoded = Buffer.from(o.url.split('/').pop(), 'base64').toString('utf8');
    assert.ok(o.url.startsWith('https://checkout.paycom.uz/'));
    assert.strictEqual(decoded, `m=m-1;ac.order_id=${o.orderId};a=360000000;l=uz;c=https://dentacrm.uz/settings?tab=plan&paid=1`);

    await env.db.clinic.update({ where: { id: 'c1' }, data: { customPrice: 250000 } });
    assert.strictEqual((await env.orders.create({ clinicId: 'c1', months: 1 })).amount, 250000);
    const q = await env.orders.quote('c1');
    assert.strictEqual(q.monthly, 250000);
    assert.deepStrictEqual(q.options.map((x) => x.months), [1, 3, 6, 12]);

    await assert.rejects(env.orders.create({ clinicId: 'c1', months: 2 }), /Muddat/);
    await assert.rejects(env.orders.create({ clinicId: 'yoq', months: 1 }), /topilmadi/);
    const off = createPaymeOrders(env.db, () => null);
    await assert.rejects(off.create({ clinicId: 'c1', months: 1 }), /yoqilmagan/);
    assert.strictEqual(await off.quote('c1'), null);
  },

  async 'bir klinika soatiga cheklangan sondan ortiq buyurtma yarata olmaydi'() {
    const env = setup();
    for (let i = 0; i < MAX_ORDERS_PER_WINDOW; i++) await env.orders.create({ clinicId: 'c1', months: 1 });
    await assert.rejects(env.orders.create({ clinicId: 'c1', months: 1 }), (e) => e.status === 429);
    // Eski buyurtmalar (bir soatdan oldingi) hisobga olinmaydi
    const all = await env.db.paymeOrder.findMany({ where: { clinicId: 'c1' } });
    for (const o of all) await env.db.paymeOrder.update({ where: { id: o.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    assert.ok((await env.orders.create({ clinicId: 'c1', months: 1 })).orderId);
  },

  async 'sinov muhiti havolasi va sozlamalar'() {
    assert.strictEqual(readPaymeConfig({ PAYME_MERCHANT_ID: 'm' }), null);
    const test = readPaymeConfig({ PAYME_MERCHANT_ID: 'm', PAYME_KEY: 'k', PAYME_TEST: '1', ...FISCAL_ENV });
    assert.ok(checkoutUrl(test, 'o', 100, null).startsWith('https://test.paycom.uz/'));
    assert.strictEqual(test.fiscal.vatPercent, 0);
    assert.strictEqual(readPaymeConfig({ PAYME_MERCHANT_ID: 'm', PAYME_KEY: 'k', PAYME_IKPU_CODE: '1' }).fiscal, null);
  },

  async 'qaytish manzili faqat o\'zimizning sayt'() {
    assert.strictEqual(safeReturnUrl('https://dentacrm.uz/settings?tab=plan'), 'https://dentacrm.uz/settings?tab=plan');
    assert.strictEqual(safeReturnUrl('https://demo.dentacrm.uz/x'), 'https://demo.dentacrm.uz/x');
    assert.strictEqual(safeReturnUrl('http://localhost:3005/settings'), 'http://localhost:3005/settings');
    assert.ok(safeReturnUrl('https://evil.com/dentacrm.uz').startsWith('https://dentacrm.uz/'));
    assert.ok(safeReturnUrl('https://dentacrm.uz.evil.com').startsWith('https://dentacrm.uz/'));
    assert.ok(safeReturnUrl('javascript:alert(1)').startsWith('https://dentacrm.uz/'));
  },
});
