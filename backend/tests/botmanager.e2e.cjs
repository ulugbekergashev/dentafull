// Klinika botlari (botManager.ts): umumiy token, token almashtirish, bot o'chirish, yaroqsiz token.
// Haqiqiy Telegraf soxta Telegram serveriga ulanadi (TELEGRAM_API_ROOT); baza — xotiradagi soxta.
// Ishga tushirish (backend papkasidan):  node tests/botmanager.e2e.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');
const { startFakeTelegram } = require('./helpers/fakeTelegram.cjs');

(async () => {
  const tg = await startFakeTelegram();
  const tgBad = await startFakeTelegram({ fail: { getMe: 401 } });
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
  process.env.TELEGRAM_API_ROOT = tg.url;
  delete process.env.DISABLE_BOTS;
  // Bazada ikkita klinika bitta tokenni ishlatadi — bitta bot nusxasi ishga tushishi kerak
  global.prisma = createFakeDb({
    clinic: [
      { id: 'c1', name: 'Bir', botToken: '111:AAA-shared' },
      { id: 'c2', name: 'Ikki', botToken: '111:AAA-shared' },
      { id: 'c3', name: 'Uch', botToken: null },
    ],
  });
  require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
  const { botManager } = require(path.join(__dirname, '..', 'botManager.ts'));
  const bots = () => botManager.bots;
  const users = (token) => [...(botManager.tokenClinics.get(token) || [])].sort();
  const wait = (check, label, ms = 6000) => (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (check()) return; await new Promise((r) => setTimeout(r, 25)); }
    throw new Error('kutilgan narsa kelmadi: ' + label);
  })();

  await runTests({
    'umumiy token: ikki klinika uchun bitta bot ishga tushadi': async () => {
      await wait(() => bots().size === 1, 'bot yuklandi');
      assert.deepStrictEqual(users('111:AAA-shared'), ['c1', 'c2']);
      await wait(() => tg.calls.some((c) => c.method === 'getMe'), 'getMe');
      assert.strictEqual(tg.calls.filter((c) => c.method === 'setMyCommands').length, 1, 'bot ikki marta yaratilgan');
    },

    'umumiy token: bitta klinika chiqsa bot ishlab turadi, oxirgisi chiqsa to\'xtaydi': async () => {
      await botManager.removeBot('c1', '111:AAA-shared');
      assert.strictEqual(bots().size, 1, 'boshqa klinika ishlatayotgan bot to\'xtadi');
      assert.deepStrictEqual(users('111:AAA-shared'), ['c2']);
      await botManager.removeBot('c2', '111:AAA-shared');
      assert.strictEqual(bots().size, 0);
      assert.strictEqual(botManager.tokenClinics.has('111:AAA-shared'), false);
    },

    'token qayta saqlansa hisoblagich oshmaydi (bot to\'xtatilishi mumkin)': async () => {
      await botManager.startBot('c3', '222:BBB');
      await botManager.startBot('c3', '222:BBB');
      await botManager.startBot('c3', '222:BBB');
      assert.deepStrictEqual(users('222:BBB'), ['c3']);
      await botManager.removeBot('c3', '222:BBB');
      assert.strictEqual(bots().size, 0, 'qayta saqlash hisoblagichni oshirib, botni to\'xtatib bo\'lmaydigan qildi');
    },

    'token almashtirilsa eskisi to\'xtaydi, yangisi ishlaydi': async () => {
      await botManager.startBot('c3', '333:OLD');
      assert.strictEqual(bots().size, 1);
      // Server: eski token bazadan allaqachon o'zgargan — qaysi bot to'xtashi aniq berilgan token bo'yicha
      await botManager.removeBot('c3', '333:OLD');
      await botManager.startBot('c3', '444:NEW');
      assert.deepStrictEqual([...bots().keys()], ['444:NEW']);
      await botManager.removeBot('c3', '444:NEW');
    },

    'token tozalansa (bazada allaqachon null) bot to\'xtaydi': async () => {
      await botManager.startBot('c3', '555:CLR');
      // Ilgari removeBot bazadan tokenni qayta o'qirdi: u null bo'lgani uchun hech narsa to'xtamasdi
      await botManager.removeBot('c3', '555:CLR');
      assert.strictEqual(bots().size, 0);
    },

    'yaroqsiz token: sabab klinikaga yoziladi, qayta urinilmaydi': async () => {
      process.env.TELEGRAM_API_ROOT = tgBad.url;
      await global.prisma.clinic.update({ where: { id: 'c3' }, data: { botToken: '666:BAD' } });
      await botManager.startBot('c3', '666:BAD');
      await wait(() => global.prisma.diagEvent._rows().some((e) => e.kind === 'bot_down' && e.clinicId === 'c3'), 'bot_down qaydi');
      const ev = global.prisma.diagEvent._rows().find((e) => e.kind === 'bot_down' && e.clinicId === 'c3');
      assert.match(ev.message, /token/i);
      assert.ok(!ev.message.includes('666:BAD') && !(ev.meta || '').includes('666:BAD'), 'token qaydga tushdi');
      const getMeCalls = tgBad.calls.filter((c) => c.method === 'getMe').length;
      await new Promise((r) => setTimeout(r, 600));
      assert.ok(tgBad.calls.filter((c) => c.method === 'getMe').length <= getMeCalls + 1, '401 da takror urinildi');
      await botManager.removeBot('c3', '666:BAD');
    },

    'handler ichidagi xato botni to\'xtatmaydi (bot.catch)': async () => {
      process.env.TELEGRAM_API_ROOT = tg.url;
      await botManager.startBot('c3', '777:CATCH');
      // Bazada bunday bemor/xodim yo'q — matnli xabar handler'i xato bermasa ham, buzuq update yuboramiz
      tg.push({ message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'X' }, text: 'salom' } });
      tg.push({ callback_query: { id: 'q', from: { id: 5, is_bot: false, first_name: 'X' }, chat_instance: 'x', data: 'rp:zz:zz:zz' } });
      tg.push({ message: { message_id: 2, date: 0, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'X' }, text: 'yana' } });
      await wait(() => tg.calls.filter((c) => c.method === 'sendMessage').length >= 2, 'ikkinchi xabarga ham javob keldi');
      await botManager.removeBot('c3', '777:CATCH');
    },
  });

  await tg.stop();
  await tgBad.stop();
  setTimeout(() => process.exit(process.exitCode || 0), 200);
})().catch((e) => { console.error(e); process.exit(1); });
