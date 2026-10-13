// Rahbar raqami (ownerPhone.ts) va klinika botidagi kontakt tekshiruvi (botManager.ts).
// Ikkalasi bir xil teshikni yopadi: rahbar bo'lmagan odam "rahbar" sifatida ulanib qolmasin.
// Soxta baza bilan ishlaydi — haqiqiy bazaga ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/owner-phone.test.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');

global.prisma = createFakeDb();
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
process.env.DISABLE_BOTS = '1';
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { ownerPhoneData, OwnerPhoneForbidden } = require(path.join(__dirname, '..', 'ownerPhone.ts'));
const { isOwnContact } = require(path.join(__dirname, '..', 'botManager.ts'));

const seed = () => createFakeDb({
  clinic: [{ id: 'c1', ownerPhone: '+998 90 111-22-33', telegramChatId: '100' }],
  doctor: [{ id: 'd1', clinicId: 'c1', phone: '998907778899', telegramChatId: '200' }],
  receptionist: [
    { id: 'r1', clinicId: 'c1', phone: '+998 93 555 44 33', telegramChatId: '300' },
    { id: 'r2', clinicId: 'c2', phone: '+998 93 555 44 33', telegramChatId: '999' },
  ],
});

runTests({
  'raqam yuborilmagan bo\'lsa hech narsa o\'zgarmaydi': async () => {
    assert.deepStrictEqual(await ownerPhoneData(seed(), 'c1', undefined, 'RECEPTIONIST'), {});
  },

  'resepshn rahbar raqamini o\'zgartira olmaydi': async () => {
    await assert.rejects(
      () => ownerPhoneData(seed(), 'c1', '+998 93 555 44 33', 'RECEPTIONIST'),
      (e) => e instanceof OwnerPhoneForbidden,
    );
    await assert.rejects(() => ownerPhoneData(seed(), 'c1', '', 'DOCTOR'), (e) => e instanceof OwnerPhoneForbidden);
  },

  'resepshn o\'sha raqamni qayta yuborsa (forma hamma maydonni yuboradi) — xato emas, o\'zgarish ham yo\'q': async () => {
    assert.deepStrictEqual(await ownerPhoneData(seed(), 'c1', '998901112233', 'RECEPTIONIST'), {});
  },

  'rahbar raqamni almashtirsa eski Telegram ulanishi uziladi': async () => {
    const out = await ownerPhoneData(seed(), 'c1', '+998 91 000 00 00', 'CLINIC_ADMIN');
    assert.deepStrictEqual(out, { ownerPhone: '+998 91 000 00 00', telegramChatId: null });
  },

  'yangi raqam egasi shu klinika botiga ulangan bo\'lsa — darhol rahbar sifatida ulanadi': async () => {
    const out = await ownerPhoneData(seed(), 'c1', '93 555-44-33', 'CLINIC_ADMIN');
    assert.strictEqual(out.telegramChatId, '300');
  },

  'boshqa klinika xodimining ulanishi olinmaydi': async () => {
    const db = createFakeDb({
      clinic: [{ id: 'c1', ownerPhone: null }],
      receptionist: [{ id: 'r2', clinicId: 'c2', phone: '+998 93 555 44 33', telegramChatId: '999' }],
    });
    const out = await ownerPhoneData(db, 'c1', '+998935554433', 'CLINIC_ADMIN');
    assert.strictEqual(out.telegramChatId, null);
  },

  'rahbar faqat yozilishini o\'zgartirsa (o\'sha raqam) ulanish saqlanadi': async () => {
    assert.deepStrictEqual(
      await ownerPhoneData(seed(), 'c1', '998901112233', 'CLINIC_ADMIN'),
      { ownerPhone: '998901112233' },
    );
  },

  'super admin ham o\'zgartira oladi': async () => {
    const out = await ownerPhoneData(seed(), 'c1', '+998 91 000 00 00', 'SUPER_ADMIN');
    assert.strictEqual(out.ownerPhone, '+998 91 000 00 00');
  },

  'kontakt: tugma orqali yuborilgan o\'z raqami qabul qilinadi': async () => {
    assert.strictEqual(isOwnContact({ from: { id: 7 }, contact: { phone_number: '998901112233', user_id: 7 } }), true);
  },

  'kontakt: boshqa odamning kontakti rad etiladi': async () => {
    assert.strictEqual(isOwnContact({ from: { id: 7 }, contact: { phone_number: '998901112233', user_id: 8 } }), false);
    // Telefon kitobidan yuborilgan, Telegram'da yo'q raqam — user_id umuman bo'lmaydi
    assert.strictEqual(isOwnContact({ from: { id: 7 }, contact: { phone_number: '998901112233' } }), false);
    assert.strictEqual(isOwnContact({}), false);
  },
});
