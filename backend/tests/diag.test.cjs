// Diagnostika qaydlari (diag.ts): bot holati, kira olmagan login, ketmagan avtomatik xabar.
// Soxta baza bilan ishlaydi — haqiqiy bazaga ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/diag.test.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');

global.prisma = createFakeDb();
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { createDiag, botFailureReason } = require(path.join(__dirname, '..', 'diag.ts'));

const DAY = 24 * 60 * 60 * 1000;

runTests({
  'record: har chaqiruv alohida qator': async () => {
    const db = createFakeDb();
    const diag = createDiag(db);
    await diag.record({ clinicId: 'c1', kind: 'login_failed', subject: 'ali', message: 'Parol noto\'g\'ri' });
    await diag.record({ clinicId: 'c1', kind: 'login_failed', subject: 'ali', message: 'Parol noto\'g\'ri' });
    assert.strictEqual(await db.diagEvent.count(), 2);
  },

  'recordDaily: bir xil hodisa kuniga bitta qator, soni oshadi': async () => {
    const db = createFakeDb();
    const diag = createDiag(db);
    const e = { clinicId: 'c1', kind: 'automation_skip', subject: 'rule-1', message: 'Shablon tanlanmagan' };
    await diag.recordDaily(e);
    await diag.recordDaily(e);
    await diag.recordDaily(e);
    const rows = await db.diagEvent.findMany();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].count, 3);
  },

  'recordDaily: boshqa sabab yoki boshqa klinika — alohida qator': async () => {
    const db = createFakeDb();
    const diag = createDiag(db);
    await diag.recordDaily({ clinicId: 'c1', kind: 'automation_skip', subject: 'r1', message: 'A' });
    await diag.recordDaily({ clinicId: 'c1', kind: 'automation_skip', subject: 'r1', message: 'B' });
    await diag.recordDaily({ clinicId: 'c2', kind: 'automation_skip', subject: 'r1', message: 'A' });
    assert.strictEqual(await db.diagEvent.count(), 3);
  },

  'bot tokeni qaydga tushmaydi': async () => {
    const db = createFakeDb();
    const diag = createDiag(db);
    const token = '7123456789:AAHk3l2mN0pQrStUvWxYz_abcdefghijklmn';
    await diag.record({
      kind: 'bot_down',
      message: `request to https://api.telegram.org/bot${token}/getMe failed`,
      meta: { url: `https://api.telegram.org/bot${token}/getMe` },
    });
    const row = (await db.diagEvent.findMany())[0];
    assert.ok(!row.message.includes(token), 'xabarda token qoldi');
    assert.ok(!row.meta.includes(token), 'meta ichida token qoldi');
  },

  'baza ishlamasa ham xato tashlamaydi': async () => {
    const broken = { diagEvent: { create: async () => { throw new Error('db down'); }, upsert: async () => { throw new Error('db down'); } } };
    const diag = createDiag(broken);
    await diag.record({ kind: 'x', message: 'y' });
    await diag.recordDaily({ kind: 'x', message: 'y' });
  },

  'uzun matn qisqartiriladi': async () => {
    const db = createFakeDb();
    await createDiag(db).record({ kind: 'client_error', message: 'x'.repeat(5000), meta: { stack: 'y'.repeat(9000) } });
    const row = (await db.diagEvent.findMany())[0];
    assert.ok(row.message.length <= 500);
    assert.ok(row.meta.length <= 2000);
  },

  'latest: shu klinikaning oxirgi hodisasi': async () => {
    const db = createFakeDb();
    const diag = createDiag(db);
    await diag.record({ clinicId: 'c1', kind: 'bot_down', message: 'eski' });
    await new Promise((r) => setTimeout(r, 5));
    await diag.record({ clinicId: 'c1', kind: 'bot_up', message: 'ishladi' });
    await diag.record({ clinicId: 'c2', kind: 'bot_down', message: 'boshqa klinika' });
    const last = await diag.latest('c1', ['bot_down', 'bot_up']);
    assert.strictEqual(last.kind, 'bot_up');
  },

  'list: klinika, tur va muddat bo\'yicha': async () => {
    const db = createFakeDb({
      diagEvent: [
        { id: '1', clinicId: 'c1', kind: 'login_failed', message: 'a', lastAt: new Date() },
        { id: '2', clinicId: 'c1', kind: 'login_failed', message: 'eski', lastAt: new Date(Date.now() - 10 * DAY) },
        { id: '3', clinicId: 'c2', kind: 'login_failed', message: 'b', lastAt: new Date() },
      ],
    });
    const rows = await createDiag(db).list({ clinicId: 'c1', kinds: ['login_failed'], days: 7 });
    assert.deepStrictEqual(rows.map((r) => r.id), ['1']);
  },

  'prune: muddati o\'tganlar o\'chadi': async () => {
    const db = createFakeDb({
      diagEvent: [
        { id: 'new', kind: 'x', message: 'a', lastAt: new Date() },
        { id: 'old', kind: 'x', message: 'b', lastAt: new Date(Date.now() - 40 * DAY) },
      ],
    });
    await createDiag(db).prune(30);
    assert.deepStrictEqual((await db.diagEvent.findMany()).map((r) => r.id), ['new']);
  },

  'botFailureReason: Telegram xatosini oddiy tilga o\'giradi': async () => {
    assert.match(botFailureReason({ response: { error_code: 401 } }), /token/i);
    assert.match(botFailureReason({ response: { error_code: 409 } }), /boshqa joyda/i);
    assert.match(botFailureReason(new Error('ETIMEDOUT')), /ETIMEDOUT/);
  },
});
