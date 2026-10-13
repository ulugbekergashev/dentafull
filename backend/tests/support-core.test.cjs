// Yordam boti: kimlik, bilim bazasi, to'lov hisobi, amallar, tekshiruv asboblari.
// Soxta baza bilan ishlaydi — haqiqiy bazaga va Telegram'ga ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/support-core.test.cjs
const path = require('path');
const assert = require('assert');
const { createFakeDb, runTests } = require('./helpers/fakeDb.cjs');

global.prisma = createFakeDb();
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
process.env.DISABLE_BOTS = '1';
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const at = (f) => path.join(__dirname, '..', f);
const { createDiag } = require(at('diag.ts'));
const { createIdentity, canActAsOwner } = require(at('support/identity.ts'));
const { createKb } = require(at('support/kb.ts'));
const { createBilling, addMonths } = require(at('support/billing.ts'));
const { createActions } = require(at('support/actions.ts'));
const { createTools } = require(at('support/tools.ts'));
const { createTickets, AUTO_MIN_DRAFTS } = require(at('support/tickets.ts'));
const { detectLang, normalizeForSearch, chunkText, todayTashkent } = require(at('support/text.ts'));
const { unknownPaths } = require(at('support/productMap.ts'));
const { sanitizeSettings, DEFAULT_SETTINGS } = require(at('support/settings.ts'));
const { changeOwnPassword, PasswordChangeError } = require(at('passwordChange.ts'));
const bcrypt = require('bcryptjs');

const DAY = 24 * 60 * 60 * 1000;
const withActor = (_actor, fn) => fn();
const iso = (offsetDays) => todayTashkent(offsetDays);

const clinicSeed = () => ({
  clinic: [
    { id: 'c1', name: 'Smile', adminName: 'Anvar', username: 'smile', password: 'old', status: 'Active', ownerPhone: '+998 90 111-22-33',
      expiryDate: iso(10), planId: 'pro', subscriptionType: 'Paid', customPrice: null, botToken: '111:secret-token', eskizPassword: 'eskiz-secret',
      eskizToken: 'tok', eskizEmail: 'a@b.uz', aiApiKey: 'ai-secret', notificationMode: 'sms', telegramChatId: null, accessControl: null },
    { id: 'c2', name: 'Other', adminName: 'Bek', username: 'other', password: 'x', status: 'Active', ownerPhone: '998935550000',
      expiryDate: iso(-3), planId: 'pro', subscriptionType: 'Paid', customPrice: 500000 },
    { id: 'c3', name: 'Gone', adminName: 'Z', username: 'gone', status: 'Deleted', ownerPhone: '998971112233', expiryDate: iso(5), planId: 'pro' },
  ],
  subscriptionPlan: [{ id: 'pro', name: 'Pro', price: 300000, maxDoctors: 5 }],
  doctor: [
    { id: 'd1', clinicId: 'c1', firstName: 'Olim', lastName: 'Sobirov', phone: '+998 91 222 33 44', username: 'olim', password: 'p', status: 'Active' },
    { id: 'd9', clinicId: 'c2', firstName: 'Begona', lastName: 'Shifokor', phone: '998900000001', username: 'begona', password: 'p', status: 'Active' },
  ],
  receptionist: [{ id: 'r1', clinicId: 'c1', firstName: 'Nodira', lastName: 'A', phone: '998933334455', username: 'nodira', password: 'p', status: 'Active' }],
  labTechnician: [],
});

runTests({
  // ── Til va matn ───────────────────────────────────────────────────────────
  'til: o\'zbek kirili ruscha deb olinmaydi': async () => {
    assert.deepStrictEqual(detectLang('Ассалому алейкум, смс кетмаяпти'), { lang: 'uz', script: 'cyrillic' });
    assert.deepStrictEqual(detectLang('Тўлов қандай қилинади?'), { lang: 'uz', script: 'cyrillic' });
    assert.deepStrictEqual(detectLang('Здравствуйте, не отправляются сообщения пациентам'), { lang: 'ru', script: 'latin' });
    assert.deepStrictEqual(detectLang('SMS ketmayapti nima qilay'), { lang: 'uz', script: 'latin' });
  },
  'til: qisqa yoki noaniq matnda oldingi til saqlanadi': async () => {
    assert.deepStrictEqual(detectLang('ok', { lang: 'ru', script: 'latin' }), { lang: 'ru', script: 'latin' });
    assert.deepStrictEqual(detectLang('12345', { lang: 'uz', script: 'cyrillic' }), { lang: 'uz', script: 'cyrillic' });
  },
  'qidiruv: turli yozilish bir xil ko\'rinishga keladi': async () => {
    const a = normalizeForSearch("To'lov");
    assert.strictEqual(normalizeForSearch('Тўлов'), a);
    assert.strictEqual(normalizeForSearch('tolov'), a);
    assert.strictEqual(normalizeForSearch('TO`LOV'), a);
  },
  'uzun matn Telegram chegarasidan oshmaydigan bo\'laklarga bo\'linadi': async () => {
    const parts = chunkText(('Bir qator matn. '.repeat(40) + '\n\n').repeat(12), 1000);
    assert.ok(parts.length > 1 && parts.every((p) => p.length <= 1000));
  },
  'yo\'l nazorati: ilovada yo\'q bo\'lim ushlanadi, bori o\'tadi': async () => {
    assert.deepStrictEqual(unknownPaths('Buning uchun Sozlamalar → Integratsiyalar → Telegram va SMS bo\'limiga kiring.'), []);
    assert.deepStrictEqual(unknownPaths('1. Bemorlar → Yangi bemor tugmasini bosing'), []);
    assert.deepStrictEqual(unknownPaths('Откройте Настройки → Услуги и цены'), []);
    assert.strictEqual(unknownPaths('Hisob-kitob → To\'lovlar bo\'limini oching').length, 1);
    assert.strictEqual(unknownPaths('Откройте Отчёты → Продажи').length, 1);
  },
  'yo\'l nazorati: tugmalar ketma-ketligi va oddiy strelka bo\'lim deb olinmaydi': async () => {
    // Haqiqiy model javobidan: iPhone'da o'rnatish qadami
    assert.deepStrictEqual(unknownPaths('2. iPhone\'da “Ilovani o‘rnatish” ni bosing, keyin “Ulashish” → “Add to Home Screen” tanlang.'), []);
    assert.deepStrictEqual(unknownPaths('Tugmani bosing → oyna ochiladi'), []);
    assert.deepStrictEqual(unknownPaths('«Saqlash» → «Yopish»'), []);
  },
  'sozlamalar: noto\'g\'ri qiymatlar o\'tmaydi': async () => {
    const s = sanitizeSettings({ mode: 'hack', trustDays: 999, quietFrom: -5, categoryModes: { howto: 'auto', nope: 'auto', bug: 'rule' }, evil: 1 });
    assert.strictEqual(s.mode, DEFAULT_SETTINGS.mode);
    assert.strictEqual(s.trustDays, 14);
    assert.strictEqual(s.quietFrom, 0);
    assert.deepStrictEqual(s.categoryModes, { howto: 'auto' });
    assert.strictEqual(s.evil, undefined);
  },

  // ── Kimlik ────────────────────────────────────────────────────────────────
  'havola kodi: bir marta ishlaydi': async () => {
    const id = createIdentity(createFakeDb(clinicSeed()));
    const code = await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Anvar' });
    const first = await id.linkByCode('100', code);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.user.verifiedVia, 'session');
    assert.strictEqual(first.user.clinicId, 'c1');
    assert.strictEqual((await id.linkByCode('200', code)).ok, false, 'kod ikkinchi marta ishladi');
    assert.strictEqual(await id.getUser('200'), null);
  },
  'havola kodi: muddati o\'tgani va to\'qilgani ishlamaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const id = createIdentity(db);
    const code = await id.createLinkCode({ role: 'DOCTOR', clinicId: 'c1', doctorId: 'd1' });
    await db.supportLink.updateMany({ where: {}, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.strictEqual((await id.linkByCode('100', code)).ok, false);
    assert.strictEqual((await id.linkByCode('100', 'l_uydirma')).ok, false);
    assert.strictEqual((await id.linkByCode('100', 'l_')).ok, false);
  },
  'telefon: rahbar raqami bo\'yicha ulanadi, lekin egasi nomidan amal qila olmaydi': async () => {
    const id = createIdentity(createFakeDb(clinicSeed()));
    const r = await id.linkByContact('100', '+998901112233');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.user.role, 'CLINIC_ADMIN');
    assert.strictEqual(r.user.verifiedVia, 'phone');
    assert.strictEqual(canActAsOwner(r.user), false);
  },
  'telefon: xodim o\'z klinikasiga ulanadi; notanish raqam va o\'chirilgan klinika — yo\'q': async () => {
    const id = createIdentity(createFakeDb(clinicSeed()));
    const doc = await id.linkByContact('100', '998912223344');
    assert.deepStrictEqual([doc.user.role, doc.user.clinicId, doc.user.staffId], ['DOCTOR', 'c1', 'd1']);
    assert.strictEqual((await id.linkByContact('200', '998999999999')).ok, false);
    assert.strictEqual((await id.linkByContact('300', '998971112233')).ok, false, 'o\'chirilgan klinika rahbari ulandi');
  },
  'telefon ilova orqali ulanishni almashtirmaydi': async () => {
    const id = createIdentity(createFakeDb(clinicSeed()));
    await id.linkByCode('100', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1' }));
    const r = await id.linkByContact('100', '998935550000'); // boshqa klinika rahbarining raqami
    assert.deepStrictEqual([r.ok, r.reason], [false, 'keep_session']);
    assert.strictEqual((await id.getUser('100')).clinicId, 'c1');
  },

  // ── Bilim bazasi ──────────────────────────────────────────────────────────
  'bilim bazasi: rolga yopiq maqola ochilmaydi va mundarijada ko\'rinmaydi': async () => {
    const kb = createKb(createFakeDb());
    await kb.syncSeed([
      { id: 'a.hamma', module: 'general', roles: '*', titleUz: 'Hamma uchun', titleRu: 'Для всех', bodyUz: 'x', bodyRu: 'x' },
      { id: 'a.rahbar', module: 'staff', roles: ['CLINIC_ADMIN'], titleUz: 'Ruxsatlar', titleRu: 'Доступы', bodyUz: 'x', bodyRu: 'x' },
    ]);
    assert.ok(await kb.open('a.rahbar', 'CLINIC_ADMIN'));
    assert.strictEqual(await kb.open('a.rahbar', 'DOCTOR'), null);
    assert.strictEqual(await kb.open('a.rahbar', null), null);
    assert.ok(!(await kb.indexFor('DOCTOR', 'uz')).includes('a.rahbar'));
    assert.ok((await kb.indexFor(null, 'ru')).includes('Для всех'));
  },
  'bilim bazasi: qayta yozishda o\'chirilgan maqola yoqilmaydi, olib tashlangani ketadi, o\'rgatilgani qoladi': async () => {
    const db = createFakeDb();
    const kb = createKb(db);
    const seed = [
      { id: 's.bir', module: 'm', roles: '*', titleUz: 'Bir', titleRu: 'Раз', bodyUz: 'eski', bodyRu: 'x' },
      { id: 's.ikki', module: 'm', roles: '*', titleUz: 'Ikki', titleRu: 'Два', bodyUz: 'x', bodyRu: 'x' },
    ];
    await kb.syncSeed(seed);
    await kb.setActive('s.bir', false);
    await kb.save('learned.x', { module: 'm', roles: '*', titleUz: 'Operatordan', bodyUz: 'javob' });
    const r = await kb.syncSeed([{ ...seed[0], bodyUz: 'yangi' }]);
    assert.strictEqual(r.retired, 1);
    const rows = await db.supportArticle.findMany();
    assert.deepStrictEqual(rows.map((x) => x.id).sort(), ['learned.x', 's.bir']);
    const bir = rows.find((x) => x.id === 's.bir');
    assert.deepStrictEqual([bir.active, bir.bodyUz], [false, 'yangi']);
  },
  'bilim bazasi: qidiruv kirill, xato yozilish va qo\'shimchani tushunadi': async () => {
    const kb = createKb(createFakeDb());
    await kb.syncSeed([
      { id: 'finance.pay', module: 'finance', roles: '*', titleUz: "To'lovni qanday qabul qilaman?", titleRu: 'Как принять оплату?', bodyUz: 'x', bodyRu: 'x', keywords: ['pul olish', 'оплата'] },
      { id: 'sms.fail', module: 'messages', roles: '*', titleUz: 'SMS ketmayapti', titleRu: 'SMS не уходят', bodyUz: 'x', bodyRu: 'x', keywords: ['sms bormadi'] },
    ]);
    for (const q of ['tolovni qanday olaman', 'Тўловни қабул қилиш', 'как принять оплату']) {
      assert.strictEqual((await kb.search(q, 'RECEPTIONIST'))[0]?.id, 'finance.pay', q);
    }
    assert.strictEqual((await kb.search('смс кетмаяпти', 'RECEPTIONIST'))[0]?.id, 'sms.fail');
    assert.deepStrictEqual(await kb.search('ob-havo qanday', 'RECEPTIONIST'), []);
  },
  'bilim bazasi: noto\'g\'ri nom va bo\'sh matn saqlanmaydi': async () => {
    const kb = createKb(createFakeDb());
    await assert.rejects(() => kb.save('Yomon Nom', { titleUz: 'a', bodyUz: 'b' }));
    await assert.rejects(() => kb.save('yaxshi.nom', { titleUz: '', bodyUz: 'b' }));
  },

  // ── To'lov ────────────────────────────────────────────────────────────────
  'oy qo\'shish: oy oxiri keyingi oyga o\'tib ketmaydi': async () => {
    assert.strictEqual(addMonths('2026-01-31', 1), '2026-02-28');
    assert.strictEqual(addMonths('2024-01-31', 1), '2024-02-29');
    assert.strictEqual(addMonths('2026-10-12', 3), '2027-01-12');
    assert.strictEqual(addMonths('2026-10-12', 12), '2027-10-12');
  },
  'uzaytirish: muddati bor klinikada oxiridan, tugaganida bugundan boshlanadi': async () => {
    const db = createFakeDb(clinicSeed());
    const billing = createBilling({ db, withActor });
    const a = await billing.extend('c1', 1, { approvedBy: 'Ulug\'bek' });
    assert.strictEqual(a.toExpiry, addMonths(iso(10), 1));
    assert.strictEqual(a.amount, 300000);
    const b = await billing.extend('c2', 3, { approvedBy: 'Ulug\'bek' });
    assert.strictEqual(b.toExpiry, addMonths(iso(0), 3));
    assert.strictEqual(b.amount, 1500000, 'maxsus narx hisobga olinmadi');
    assert.strictEqual((await db.clinic.findUnique({ where: { id: 'c2' } })).expiryDate, b.toExpiry);
    assert.strictEqual(await db.subscriptionPayment.count({ where: { kind: 'payment' } }), 2);
  },
  'uzaytirish: noto\'g\'ri muddat va o\'chirilgan klinika rad etiladi': async () => {
    const billing = createBilling({ db: createFakeDb(clinicSeed()), withActor });
    await assert.rejects(() => billing.extend('c1', 99, { approvedBy: 'x' }));
    await assert.rejects(() => billing.extend('c3', 1, { approvedBy: 'x' }));
  },
  'ishonch muddati: faqat sana bo\'yicha tugagan klinikaga, 30 kunda bir marta': async () => {
    const db = createFakeDb(clinicSeed());
    const billing = createBilling({ db, withActor });
    assert.deepStrictEqual(await billing.grantTrust('c1', 2, 'f'), { granted: false }, 'muddati bor klinikaga berildi');
    const t = await billing.grantTrust('c2', 2, 'f');
    assert.deepStrictEqual(t, { granted: true, toExpiry: iso(2) });
    await db.clinic.update({ where: { id: 'c2' }, data: { expiryDate: iso(-1) } });
    assert.deepStrictEqual(await billing.grantTrust('c2', 2, 'f'), { granted: false }, 'ikkinchi marta berildi');
    assert.deepStrictEqual(await billing.grantTrust('c2', 0, 'f'), { granted: false });
  },
  'ishonch muddati: qo\'lda bloklangan klinika ochilmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    await db.clinic.update({ where: { id: 'c2' }, data: { status: 'Blocked' } });
    assert.deepStrictEqual(await createBilling({ db, withActor }).grantTrust('c2', 2, 'f'), { granted: false });
  },
  'ishonch kunlari to\'langan muddatga qo\'shilmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const billing = createBilling({ db, withActor });
    await billing.grantTrust('c2', 2, 'f'); // muddat bugun+2 ga surildi
    const r = await billing.extend('c2', 1, { approvedBy: 'x' });
    assert.strictEqual(r.toExpiry, addMonths(iso(0), 1));
  },

  // ── Amallar ───────────────────────────────────────────────────────────────
  'amal: tugma ikki marta bosilsa bir marta bajariladi': async () => {
    const actions = createActions({ db: createFakeDb(clinicSeed()), withActor });
    const a = await actions.create({ chatId: '1', clinicId: 'c1', kind: 'subscription_extend', approver: 'operator' });
    const results = await Promise.all([actions.claim(a.id, 'A'), actions.claim(a.id, 'B')]);
    assert.strictEqual(results.filter(Boolean).length, 1);
    assert.strictEqual(await actions.claim(a.id, 'C'), null);
  },
  'amal: rad etilgan va eskirgan so\'rov bajarilmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const actions = createActions({ db, withActor });
    const a = await actions.create({ chatId: '1', clinicId: 'c1', kind: 'owner_password_reset', approver: 'operator' });
    assert.strictEqual(await actions.reject(a.id, 'op'), true);
    assert.strictEqual(await actions.claim(a.id, 'op'), null);
    const b = await actions.create({ chatId: '1', clinicId: 'c1', kind: 'owner_password_reset', approver: 'operator' });
    await db.supportAction.update({ where: { id: b.id }, data: { createdAt: new Date(Date.now() - 3 * DAY) } });
    assert.strictEqual(await actions.claim(b.id, 'op'), null);
  },
  'parol tiklash: yangi parol ishlaydi, eskisi yo\'q; bazada ochiq saqlanmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const actions = createActions({ db, withActor });
    const { login, password } = await actions.resetOwnerPassword('c1', 'test');
    const stored = (await db.clinic.findUnique({ where: { id: 'c1' } })).password;
    assert.strictEqual(login, 'smile');
    assert.notStrictEqual(stored, password);
    assert.ok(await bcrypt.compare(password, stored));
    assert.ok(!(await bcrypt.compare('old', stored)));
  },
  'parol tiklash: boshqa klinika xodimiga tegib bo\'lmaydi': async () => {
    const actions = createActions({ db: createFakeDb(clinicSeed()), withActor });
    await assert.rejects(() => actions.resetStaffPassword('c1', 'DOCTOR', 'd9', 'rahbar'));
    const ok = await actions.resetStaffPassword('c1', 'DOCTOR', 'd1', 'rahbar');
    assert.strictEqual(ok.login, 'olim');
  },
  'parol tiklash: kuniga chegaradan oshmaydi': async () => {
    const actions = createActions({ db: createFakeDb(clinicSeed()), withActor });
    for (let i = 0; i < 3; i++) {
      assert.strictEqual(await actions.resetAllowed('c1', 'owner'), true);
      // Faqat bajarilgan tiklashlar sanaladi
      await actions.create({ chatId: '1', clinicId: 'c1', kind: 'owner_password_reset', approver: 'self', args: { target: 'owner' }, status: 'done' });
    }
    assert.strictEqual(await actions.resetAllowed('c1', 'owner'), false);
    assert.strictEqual(await actions.resetAllowed('c1', 'd1'), true, 'boshqa akkaunt ham bloklandi');
  },
  'o\'z parolini almashtirish: joriy parol tekshiriladi': async () => {
    const db = createFakeDb(clinicSeed());
    const user = { role: 'DOCTOR', doctorId: 'd1', clinicId: 'c1' };
    await assert.rejects(() => changeOwnPassword(db, user, 'xato', 'yangi-parol'), PasswordChangeError);
    await assert.rejects(() => changeOwnPassword(db, user, 'p', '123'), PasswordChangeError);
    await assert.rejects(() => changeOwnPassword(db, user, 'p', 'p'), PasswordChangeError);
    await assert.rejects(() => changeOwnPassword(db, { role: 'SUPER_ADMIN' }, 'a', 'bbbbbbbb'), PasswordChangeError);
    await changeOwnPassword(db, user, 'p', '  yangi-parol  ');
    const stored = (await db.doctor.findUnique({ where: { id: 'd1' } })).password;
    assert.ok(await bcrypt.compare('yangi-parol', stored), 'login parolni trim qiladi — saqlangani ham trim bo\'lishi kerak');
    // Boshqa odamning paroli o'zgarmagan
    assert.strictEqual((await db.doctor.findUnique({ where: { id: 'd9' } })).password, 'p');
  },

  // ── Tekshiruv asboblari ───────────────────────────────────────────────────
  'asboblar: natijada parol, token va kalitlar yo\'q': async () => {
    const db = createFakeDb({ ...clinicSeed(), telegramLog: [], messageTemplate: [], patient: [] });
    const tools = createTools({ db, diag: createDiag(db) });
    const ctx = { user: { chatId: '1', role: 'CLINIC_ADMIN', clinicId: 'c1', verifiedVia: 'session' }, lang: 'uz', settings: DEFAULT_SETTINGS, attachments: [] };
    for (const name of ['check_subscription', 'check_messaging', 'check_login', 'setup_progress', 'system_status']) {
      const out = JSON.stringify(await tools.run(name, {}, ctx));
      for (const secret of ['secret-token', 'eskiz-secret', 'ai-secret', '"old"']) {
        assert.ok(!out.includes(secret), `${name} natijasida maxfiy qiymat: ${secret}`);
      }
    }
  },
  'asboblar: rol ruxsat bermagan tekshiruv bajarilmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const tools = createTools({ db, diag: createDiag(db) });
    const doctor = { chatId: '1', role: 'DOCTOR', clinicId: 'c1', staffId: 'd1', verifiedVia: 'session' };
    const names = tools.defsFor(doctor).map((d) => d.function.name);
    assert.ok(!names.includes('check_messaging') && !names.includes('recent_changes'));
    const out = await tools.run('recent_changes', {}, { user: doctor, lang: 'uz', settings: DEFAULT_SETTINGS, attachments: [] });
    assert.ok(out.xato);
  },
  'asboblar: jurnal faqat ilova orqali ulangan rahbarga, ismlar modelga bormaydi': async () => {
    const db = createFakeDb({
      ...clinicSeed(),
      auditLog: [
        { id: '1', clinicId: 'c1', actorName: 'Nodira', actorRole: 'RECEPTIONIST', action: 'delete', entity: 'Appointment', summary: 'Karimov Ali · 02.10 10:00', createdAt: new Date() },
        { id: '2', clinicId: 'c2', actorName: 'Begona', actorRole: 'RECEPTIONIST', action: 'delete', entity: 'Appointment', summary: 'Boshqa klinika bemori', createdAt: new Date() },
      ],
    });
    const tools = createTools({ db, diag: createDiag(db) });
    const phoneOwner = { chatId: '1', role: 'CLINIC_ADMIN', clinicId: 'c1', verifiedVia: 'phone' };
    assert.ok(!tools.defsFor(phoneOwner).some((d) => d.function.name === 'recent_changes'));
    const ctx = { user: { ...phoneOwner, verifiedVia: 'session' }, lang: 'uz', settings: DEFAULT_SETTINGS, attachments: [] };
    const out = await tools.run('recent_changes', { amal: 'delete' }, ctx);
    assert.strictEqual(out.topildi, 1);
    assert.ok(!JSON.stringify(out).includes('Karimov'), 'bemor ismi modelga ketdi');
    assert.ok(ctx.attachments[0].includes('Karimov Ali') && !ctx.attachments[0].includes('Boshqa klinika'));
  },
  'asboblar: xodim faqat o\'z akkauntini ko\'radi': async () => {
    const db = createFakeDb({ ...clinicSeed(), auditLog: [] });
    const tools = createTools({ db, diag: createDiag(db) });
    const ctx = { user: { chatId: '1', role: 'RECEPTIONIST', clinicId: 'c1', staffId: 'r1', verifiedVia: 'phone' }, lang: 'uz', settings: DEFAULT_SETTINGS, attachments: [] };
    const out = await tools.run('check_login', { login: 'olim' }, ctx);
    assert.deepStrictEqual(out.xodimlar.map((x) => x.login), ['nodira']);
    assert.strictEqual(out.rahbar_akkaunti, undefined);
  },
  'asboblar: ketmagan xabarlar sabab bo\'yicha yig\'iladi, raqam va ism chiqmaydi': async () => {
    const log = (error, extra = {}) => ({ clinicId: 'c1', status: 'Failed', channel: 'sms', error, sentAt: new Date(), recipient: '+998901234567', message: 'Hurmatli Karimov', ...extra });
    const db = createFakeDb({
      ...clinicSeed(), messageTemplate: [], patient: [],
      telegramLog: [log('Eskiz SMS ulanmagan'), log('Eskiz SMS ulanmagan'), log('Bemorda telefon raqami yo\'q'),
        { clinicId: 'c1', status: 'Sent', channel: 'sms', sentAt: new Date() }, log('Boshqa klinika', { clinicId: 'c2' })],
    });
    const tools = createTools({ db, diag: createDiag(db) });
    const ctx = { user: { chatId: '1', role: 'RECEPTIONIST', clinicId: 'c1', verifiedVia: 'phone' }, lang: 'uz', settings: DEFAULT_SETTINGS, attachments: [] };
    const out = await tools.run('check_messaging', {}, ctx);
    assert.deepStrictEqual([out.oxirgi_7_kun.yuborilgan, out.oxirgi_7_kun.ketmagan], [1, 3]);
    assert.strictEqual(out.oxirgi_7_kun.ketmaganlik_sabablari[0].soni, 2);
    const text = JSON.stringify(out);
    assert.ok(!text.includes('901234567') && !text.includes('Karimov') && !text.includes('Boshqa klinika'));
  },

  // ── Ulanishlarni bekor qilish va tekshirish ───────────────────────────────
  'ulanish: parol almashganda shu hisobning barcha Telegram ulanishlari uziladi': async () => {
    const db = createFakeDb(clinicSeed());
    const id = createIdentity(db);
    await id.linkByCode('100', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Anvar' }));
    await id.linkByCode('101', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Eski rahbar' }));
    await id.linkByCode('200', await id.createLinkCode({ role: 'DOCTOR', clinicId: 'c1', doctorId: 'd1', name: 'Olim' }));
    // Rahbar parolini almashtiradi (ilova orqali)
    await db.clinic.update({ where: { id: 'c1' }, data: { password: await bcrypt.hash('old-pass', 10) } });
    await changeOwnPassword(db, { role: 'CLINIC_ADMIN', clinicId: 'c1' }, 'old-pass', 'yangi-parol-1');
    assert.strictEqual((await id.getUser('100')).role, null);
    assert.strictEqual((await id.getUser('101')).role, null, 'eski ulanish qoldi');
    assert.strictEqual((await id.getUser('200')).role, 'DOCTOR', 'boshqa hisob uzildi');
  },
  'ulanish: bot orqali tiklashda so\'ragan odamning o\'zi qoladi, boshqalar uziladi': async () => {
    const db = createFakeDb(clinicSeed());
    const id = createIdentity(db);
    const actions = createActions({ db, withActor });
    await id.linkByCode('100', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Anvar' }));
    await id.linkByCode('101', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Boshqa' }));
    await actions.resetOwnerPassword('c1', 'test', '100');
    assert.strictEqual((await id.getUser('100')).role, 'CLINIC_ADMIN');
    assert.strictEqual((await id.getUser('101')).role, null);
  },
  'ulanish: tayyorlangan parol commit qilinmaguncha saqlanmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const actions = createActions({ db, withActor });
    const prepared = await actions.prepareOwnerReset('c1', 'test');
    assert.strictEqual((await db.clinic.findUnique({ where: { id: 'c1' } })).password, 'old');
    await prepared.commit();
    assert.ok(await bcrypt.compare(prepared.password, (await db.clinic.findUnique({ where: { id: 'c1' } })).password));
  },
  'ulanish: o\'chirilgan xodim, o\'chirilgan klinika va eskirgan ulanish — ulanmagan holat': async () => {
    const db = createFakeDb(clinicSeed());
    const id = createIdentity(db);
    await id.linkByCode('200', await id.createLinkCode({ role: 'DOCTOR', clinicId: 'c1', doctorId: 'd1', name: 'Olim' }));
    assert.strictEqual((await id.getUser('200')).role, 'DOCTOR');
    await db.doctor.update({ where: { id: 'd1' }, data: { status: 'Deleted' } });
    assert.strictEqual((await id.getUser('200')).role, null, 'o\'chirilgan xodim ulangan qoldi');

    await id.linkByCode('100', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c1', name: 'Anvar' }));
    await db.clinic.update({ where: { id: 'c1' }, data: { status: 'Deleted' } });
    assert.strictEqual((await id.getUser('100')).role, null);

    await id.linkByCode('300', await id.createLinkCode({ role: 'CLINIC_ADMIN', clinicId: 'c2', name: 'Bek' }));
    const old = new Date(Date.now() - 61 * DAY);
    await db.supportUser.update({ where: { chatId: '300' }, data: { linkedAt: old } });
    assert.strictEqual((await id.getUser('300')).role, null, '60 kundan eski ulanish qoldi');
  },
  'telefon: chet el raqami o\'zbek raqamining oxirgi 9 xonasiga mos kelsa ham ulanmaydi': async () => {
    const id = createIdentity(createFakeDb(clinicSeed()));
    // CRM'dagi rahbar: +998 90 111-22-33 → oxirgi 9 xona 901112233; ruscha raqam +7 xxx 901112233 emas, lekin 12 xona:
    assert.strictEqual((await id.linkByContact('100', '+79901112233')).ok, false);
    assert.strictEqual((await id.linkByContact('100', '+992901112233')).ok, false, 'Tojikiston raqami o\'zbek deb olindi');
    assert.strictEqual((await id.linkByContact('100', '901112233')).ok, false, 'xalqaro kodsiz raqam qabul qilindi');
    assert.strictEqual((await id.linkByContact('100', '+998901112233')).ok, true);
  },
  'asboblar: telefon orqali ulangan rahbar xodimlar ro\'yxatini ko\'rmaydi, faqat o\'z akkaunti': async () => {
    const db = createFakeDb({ ...clinicSeed(), auditLog: [] });
    const tools = createTools({ db, diag: createDiag(db) });
    const phoneOwner = { chatId: '1', role: 'CLINIC_ADMIN', clinicId: 'c1', verifiedVia: 'phone' };
    const out = await tools.run('check_login', {}, { user: phoneOwner, lang: 'uz', settings: DEFAULT_SETTINGS, attachments: [] });
    assert.deepStrictEqual(out.xodimlar, []);
    assert.strictEqual(out.rahbar_akkaunti.login, 'smile');
  },

  // ── Pul va qaydlar ────────────────────────────────────────────────────────
  'uzaytirish: super admin muddatni qo\'lda uzaytirgan bo\'lsa ishonch muddati uni qisqartirmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    const billing = createBilling({ db, withActor });
    await billing.grantTrust('c2', 2, 'f'); // muddat bugun+2
    await db.clinic.update({ where: { id: 'c2' }, data: { expiryDate: iso(40) } }); // super admin qo'lda
    const r = await billing.extend('c2', 1, { approvedBy: 'op' });
    assert.strictEqual(r.toExpiry, addMonths(iso(40), 1));
  },
  'uzaytirish: bloklangan klinika holati o\'zgarmaydi': async () => {
    const db = createFakeDb(clinicSeed());
    await db.clinic.update({ where: { id: 'c2' }, data: { status: 'Blocked' } });
    await createBilling({ db, withActor }).extend('c2', 1, { approvedBy: 'op' });
    assert.strictEqual((await db.clinic.findUnique({ where: { id: 'c2' } })).status, 'Blocked');
  },
  'sozlamalar: tinch soatlar tartibi noto\'g\'ri bo\'lsa standartga qaytadi': async () => {
    const s = sanitizeSettings({ quietFrom: 22, quietTo: 6 });
    assert.deepStrictEqual([s.quietFrom, s.quietTo], [DEFAULT_SETTINGS.quietFrom, DEFAULT_SETTINGS.quietTo]);
  },
  'sozlamalar: bazani o\'qib bo\'lmasa "operator yo\'q" keshlanmaydi': async () => {
    const { createSettings } = require(at('support/settings.ts'));
    let fail = true;
    const db = {
      platformSetting: {
        findUnique: async () => { if (fail) throw new Error('db down'); return { value: '-1001' }; },
        upsert: async () => ({}),
      },
    };
    const store = createSettings(db);
    assert.strictEqual(await store.operatorChat(), null);
    fail = false;
    assert.strictEqual(await store.operatorChat(), '-1001', 'uzilish paytidagi null keshlanib qoldi');
  },
  'murojaat: uzilib qolgan "processing" xabar eskirgach qayta olinadi, yangisi tegilmaydi': async () => {
    const db = createFakeDb();
    const tickets = createTickets(db);
    await db.supportMessage.create({ data: { chatId: '1', direction: 'in', author: 'user', text: 'eski', state: 'processing', createdAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const claimed = await tickets.claimInbound('1');
    assert.deepStrictEqual(claimed.map((m) => m.text), ['eski']);
    const db2 = createFakeDb();
    await db2.supportMessage.create({ data: { chatId: '1', direction: 'in', author: 'user', text: 'yangi', state: 'processing' } });
    assert.deepStrictEqual(await createTickets(db2).claimInbound('1'), []);
  },
  'murojaat: biriktirish xabarni "done" qilmaydi': async () => {
    const db = createFakeDb();
    const tickets = createTickets(db);
    const m = await tickets.addMessage({ chatId: '1', direction: 'in', author: 'user', text: 'x', state: 'processing' });
    await tickets.attachInbound([m.id], 'T1');
    const row = await db.supportMessage.findUnique({ where: { id: m.id } });
    assert.deepStrictEqual([row.state, row.ticketId], ['processing', 'T1']);
  },
  'murojaat: uzun meta JSON bo\'lib qoladi': async () => {
    const db = createFakeDb();
    const tickets = createTickets(db);
    const m = await tickets.addMessage({ chatId: '1', direction: 'out', author: 'bot', kind: 'draft', state: 'pending',
      meta: { category: 'data', attachments: ['x'.repeat(9000)], buttons: [], proposals: [] } });
    const meta = JSON.parse((await db.supportMessage.findUnique({ where: { id: m.id } })).meta);
    assert.strictEqual(meta.category, 'data');
  },
  'murojaat: jim qolib yopilgani "bot hal qildi" hisoblanmaydi': async () => {
    const db = createFakeDb();
    const tickets = createTickets(db);
    const t = await db.supportTicket.create({ data: { chatId: '1', status: 'open' } });
    await db.supportTicket.update({ where: { id: t.id }, data: { updatedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
    db.supportTicket._rows().find((r) => r.id === t.id).updatedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    assert.strictEqual(await tickets.current('1'), null);
    assert.strictEqual((await db.supportTicket.findUnique({ where: { id: t.id } })).resolvedBy, 'idle');
  },
  'avtomatga o\'tish: boshqa mavzuning qoralamalari hisobni buzmaydi': async () => {
    const draft = (category) => ({ kind: 'draft', state: 'sent', meta: JSON.stringify({ category }), createdAt: new Date() });
    const rows = [...Array.from({ length: AUTO_MIN_DRAFTS }, () => draft('howto')), ...Array.from({ length: 500 }, () => draft('bug'))];
    const tickets = createTickets(createFakeDb({ supportMessage: rows }));
    assert.strictEqual((await tickets.categoryStats('howto')).drafts >= AUTO_MIN_DRAFTS, true);
  },

  // ── Avtomatik rejimga o'tish qoidasi ──────────────────────────────────────
  'rejim: mavzu yetarlicha tahrirsiz javobdan keyingina avtomatga o\'tadi': async () => {
    const draft = (state, category = 'howto') => ({ kind: 'draft', state, meta: JSON.stringify({ category }), createdAt: new Date() });
    const auto = { ...DEFAULT_SETTINGS, mode: 'auto' };
    const few = createTickets(createFakeDb({ supportMessage: Array.from({ length: AUTO_MIN_DRAFTS - 1 }, () => draft('sent')) }));
    assert.strictEqual(await few.modeFor('howto', auto), 'draft', 'kam namunada avtomatga o\'tdi');
    const good = createTickets(createFakeDb({ supportMessage: Array.from({ length: AUTO_MIN_DRAFTS }, () => draft('sent')) }));
    assert.strictEqual(await good.modeFor('howto', auto), 'auto');
    assert.strictEqual(await good.modeFor('howto', DEFAULT_SETTINGS), 'draft', 'umumiy rejim qoralama bo\'lsa ham avtomat');
    assert.strictEqual(await good.modeFor('bug', auto), 'draft', 'boshqa mavzuning natijasi hisobga olindi');
    const edited = createTickets(createFakeDb({ supportMessage: [...Array.from({ length: 27 }, () => draft('sent')), draft('edited'), draft('edited'), draft('rejected')] }));
    assert.strictEqual(await edited.modeFor('howto', auto), 'draft', 'tahrirlangan javoblar bilan avtomatga o\'tdi');
    assert.strictEqual(await edited.modeFor('howto', { ...auto, categoryModes: { howto: 'auto' } }), 'auto', 'qo\'lda belgilash ishlamadi');
  },
  'navbat: kelgan xabar bir marta olinadi': async () => {
    const tickets = createTickets(createFakeDb());
    await tickets.addMessage({ chatId: '1', direction: 'in', author: 'user', text: 'salom', state: 'pending' });
    const [a, b] = await Promise.all([tickets.claimInbound('1'), tickets.claimInbound('1')]);
    assert.strictEqual(a.length + b.length, 1);
  },
});
