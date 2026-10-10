// DentaCRM sotuv lidlari: takror arizalar va dublikat belgisi (demoRequests.ts), Meta signallari (leadSignals.ts).
// Soxta baza va soxta tarmoq bilan ishlaydi — haqiqiy bazaga ham, Meta'ga ham ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/lead-forms.test.cjs
const path = require('path');
const assert = require('assert');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { saveDemoRequest, saveDoctorsAnswer, earlierApplications, NO_CLINIC_NOTE } = require(path.join(__dirname, '..', 'demoRequests.ts'));
const UUID = 'a1b2c3d4-0000-4000-8000-123456789abc';
const { createLeadSignals, cleanTrack, hashPhone, META_PIXEL_ID } = require(path.join(__dirname, '..', 'leadSignals.ts'));

const PHONE = '+998901234567';
const T0 = new Date('2026-10-01T10:00:00Z');
const later = (min) => new Date(T0.getTime() + min * 60000);

// ---------- demoRequests ----------

const fakeDb = (rows = [], clinics = []) => {
  let seq = 0;
  const db = {
    rows,
    clock: null,
    writes: [],
    demoRequest: {
      findFirst: async ({ where }) =>
        [...rows].filter((r) => r.phone === where.phone).sort((a, b) => b.createdAt - a.createdAt)[0] || null,
      findUnique: async ({ where }) => rows.find((r) => r.id === where.id) || null,
      findMany: async () => rows,
      create: async ({ data }) => {
        const row = { id: `id${++seq}`, clinicName: null, city: null, doctorsCount: null, notes: null, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        db.writes.push(Object.keys(data).sort().join(','));
        Object.assign(row, data, { updatedAt: db.clock || new Date() });
        return row;
      },
    },
    clinic: { findMany: async () => clinics },
  };
  return db;
};
const save = (db, input, at) => { db.clock = at; return saveDemoRequest(db, input, at); };
const lead = (over = {}) => ({ id: 'old', name: 'Aziz', phone: PHONE, clinicName: null, city: null, doctorsCount: null, source: 'ad-lifetime-x', status: 'Thinking', notes: null, createdAt: T0, updatedAt: T0, ...over });

// ---------- leadSignals ----------

const fakeSignals = ({ token = 'EAAtesttoken1234567890', rows = [], clinics = [], failWith = null } = {}) => {
  const settings = new Map(token ? [['meta_capi_token', token]] : []);
  const posts = [];
  const signals = createLeadSignals({
    db: fakeDb(rows, clinics),
    getSetting: async (k) => (settings.has(k) ? settings.get(k) : null),
    setSetting: async (k, v) => { if (v === null) settings.delete(k); else settings.set(k, v); },
    http: {
      post: async (url, body) => {
        posts.push({ url, body });
        if (failWith) throw Object.assign(new Error('Request failed'), { response: { data: { error: { message: failWith } } } });
        return { data: { events_received: body.data.length } };
      },
    },
    now: () => T0,
  });
  const events = () => posts.flatMap((p) => p.body.data);
  return { signals, settings, posts, events, names: () => events().map((e) => e.event_name).sort() };
};
const TRACK = { eventId: 'abcdef123456', fbp: 'fb.1.1700000000000.123456789', fbc: 'fb.1.1700000000000.IwAR0abc_DEF-123', url: 'https://dentacrm.uz/lifetime' };
const form = (over = {}) => ({ leadId: 'L1', isNew: true, notClinic: false, phone: PHONE, track: TRACK, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', ...over });

const tests = {
  // --- takror arizalar: har biri alohida karta, belgi "Dublikat" ---
  'yangi raqam — yangi karta, Taqsimlanmagan ustunida': async () => {
    const db = fakeDb();
    const res = await save(db, { name: 'Aziz', phone: PHONE, source: 'landing' }, T0);
    assert.strictEqual(res.repeat, false);
    assert.strictEqual(res.created, true);
    assert.strictEqual(db.rows[0].status, 'Inbox');
  },
  'o\'sha raqam yana kelsa — yangi karta ochiladi, eski kartaga tegilmaydi': async () => {
    const db = fakeDb([lead({ notes: 'ДЕМО СКИНУЛ' })]);
    const res = await save(db, { name: 'Aziz', phone: PHONE, source: 'ad-lifetime-x' }, later(60 * 30));
    assert.strictEqual(res.repeat, true, 'Meta\'ga "yangi lid" deb xabar berilmasligi uchun');
    assert.strictEqual(res.created, true);
    assert.notStrictEqual(res.id, 'old');
    assert.strictEqual(db.rows.length, 2);
    assert.deepStrictEqual([db.rows[0].status, db.rows[0].notes], ['Thinking', 'ДЕМО СКИНУЛ']);
    assert.deepStrictEqual(db.writes, [], 'eski karta yangilanmaydi — sotuvchining tahriri bosilib ketmasin');
    assert.strictEqual(db.rows[1].status, 'Inbox', 'dublikat ham avval Taqsimlanmagan ustuniga tushadi');
  },
  'eski karta qaysi ustunda bo\'lsa ham joyidan qo\'zg\'almaydi': async () => {
    for (const status of ['Cancelled', 'NoAnswer', 'Booked', 'New', 'Contacted']) {
      const db = fakeDb([lead({ status })]);
      await save(db, { name: 'Aziz', phone: PHONE, source: 'landing' }, later(600));
      assert.strictEqual(db.rows[0].status, status);
      assert.strictEqual(db.rows.length, 2, status);
    }
  },
  'yangi kartada yangi arizaning o\'z ma\'lumoti turadi': async () => {
    const db = fakeDb([lead({ city: 'Samarqand' })]);
    await save(db, { name: 'Boshqa', phone: PHONE, clinicName: 'Smile', city: 'Toshkent', doctorsCount: 4, source: 'Facebook', notes: 'FB Lead ID: 77' }, later(600));
    const fresh = db.rows[1];
    assert.deepStrictEqual([fresh.name, fresh.clinicName, fresh.city, fresh.doctorsCount, fresh.source, fresh.notes], ['Boshqa', 'Smile', 'Toshkent', 4, 'Facebook', 'FB Lead ID: 77']);
    assert.strictEqual(db.rows[0].city, 'Samarqand');
  },
  'tugmani ikki marta bosish — yangi karta ochilmaydi, bazaga hech narsa yozilmaydi': async () => {
    const db = fakeDb([lead()]);
    const res = await save(db, { name: 'Aziz', phone: PHONE, source: 'landing' }, later(3));
    assert.deepStrictEqual(res, { id: 'old', repeat: true, created: false });
    assert.strictEqual(db.rows.length, 1);
    assert.deepStrictEqual(db.writes, []);
  },
  'ikki marta bosish eng oxirgi kartaga nisbatan hisoblanadi': async () => {
    const db = fakeDb([lead()]);
    const second = await save(db, { name: 'Aziz', phone: PHONE, source: 'landing' }, later(600));
    db.rows[1].createdAt = later(600);
    const third = await save(db, { name: 'Aziz', phone: PHONE, source: 'landing' }, later(601));
    assert.strictEqual(db.rows.length, 2);
    assert.deepStrictEqual(third, { id: second.id, repeat: true, created: false });
    const fourth = await save(db, { name: 'Aziz', phone: PHONE, source: 'ad-monthly' }, later(3000));
    assert.strictEqual(fourth.created, true);
    assert.strictEqual(db.rows.length, 3);
  },
  'raqamsiz lid (Facebook "N/A") hech kim bilan solishtirilmaydi': async () => {
    const db = fakeDb([lead({ phone: 'N/A' })]);
    const res = await save(db, { name: 'FB', phone: 'N/A', source: 'Facebook' }, later(1));
    assert.strictEqual(res.repeat, false);
    assert.strictEqual(db.rows.length, 2);
  },
  'dublikat belgisi: birinchi karta belgisiz, keyingilari — oldin nechta ariza bo\'lganini biladi': async () => {
    const rows = [
      { id: 'c', phone: PHONE, createdAt: later(500) },
      { id: 'a', phone: PHONE, createdAt: T0 },
      { id: 'b', phone: PHONE, createdAt: later(100).toISOString() },
      { id: 'solo', phone: '+998900000001', createdAt: T0 },
    ];
    assert.deepStrictEqual(earlierApplications(rows), { b: 1, c: 2 });
  },
  'dublikat belgisi raqamsiz va noto\'g\'ri raqamli lidlarga qo\'yilmaydi': async () => {
    const rows = [
      { id: 'x', phone: 'N/A', createdAt: T0 }, { id: 'y', phone: 'N/A', createdAt: later(5) },
      { id: 'z', phone: null, createdAt: T0 }, { id: 'w', phone: null, createdAt: later(9) },
    ];
    assert.deepStrictEqual(earlierApplications(rows), {});
    assert.deepStrictEqual(earlierApplications([]), {});
  },

  // --- arizadan keyingi savol ---
  'savol javobi lid izohining boshiga yoziladi, sotuvchi izohi saqlanadi': async () => {
    const db = fakeDb([lead({ id: UUID, notes: 'eski izoh' })]);
    assert.strictEqual(await saveDoctorsAnswer(db, UUID, '3-5', later(2)), true);
    assert.strictEqual(db.rows[0].notes, 'Shifokorlar soni: 3–5\neski izoh');
  },
  '"klinikam yo\'q" javobi kartada belgi bo\'ladi': async () => {
    const db = fakeDb([lead({ id: UUID })]);
    await saveDoctorsAnswer(db, UUID, 'none', later(2));
    assert.strictEqual(db.rows[0].notes, NO_CLINIC_NOTE);
  },
  'javob bir marta yoziladi; kechikkan, noma\'lum yoki axlat so\'rov e\'tiborsiz': async () => {
    const db = fakeDb([lead({ id: UUID })]);
    assert.strictEqual(await saveDoctorsAnswer(db, UUID, '3-5', later(61)), false, 'bir soatdan keyin');
    assert.strictEqual(await saveDoctorsAnswer(db, UUID, '99', later(2)), false, 'ro\'yxatda yo\'q javob');
    assert.strictEqual(await saveDoctorsAnswer(db, UUID, { a: 1 }, later(2)), false);
    assert.strictEqual(await saveDoctorsAnswer(db, 'old', '3-5', later(2)), false, 'id uuid emas');
    assert.strictEqual(await saveDoctorsAnswer(db, UUID.replace('a', 'b'), '3-5', later(2)), false, 'bunday lid yo\'q');
    assert.deepStrictEqual(db.writes, []);
    assert.strictEqual(await saveDoctorsAnswer(db, UUID, '1-2', later(2)), true);
    assert.strictEqual(await saveDoctorsAnswer(db, UUID, 'none', later(3)), false, 'ikkinchi javob');
    assert.strictEqual(db.rows[0].notes, 'Shifokorlar soni: 1–2');
  },

  // --- Meta signallari ---
  'yangi lid: Meta\'ga Lead va CrmContact ketadi, raqam xeshlangan': async () => {
    const s = fakeSignals();
    await s.signals.formSubmitted(form());
    assert.deepStrictEqual(s.names(), ['CrmContact', 'Lead']);
    const leadEvent = s.events().find((e) => e.event_name === 'Lead');
    assert.strictEqual(leadEvent.event_id, 'abcdef123456', 'brauzerdagi hodisa bilan bir xil id — Meta ikki marta sanamaydi');
    assert.strictEqual(leadEvent.action_source, 'website');
    assert.strictEqual(leadEvent.event_source_url, 'https://dentacrm.uz/lifetime');
    assert.deepStrictEqual(leadEvent.user_data.ph, [hashPhone(PHONE)]);
    assert.strictEqual(leadEvent.user_data.fbc, TRACK.fbc);
    assert.ok(!JSON.stringify(s.posts).includes('998901234567'), 'ochiq raqam Meta\'ga ketmaydi');
    assert.ok(s.posts[0].url.endsWith(`/${META_PIXEL_ID}/events`) && !s.posts[0].url.includes('EAA'), 'token manzilga qo\'shilmaydi');
  },
  'takror ariza: Lead ketmaydi, faqat CrmContact': async () => {
    const s = fakeSignals();
    await s.signals.formSubmitted(form({ isNew: false }));
    assert.deepStrictEqual(s.names(), ['CrmContact']);
  },
  '"klinikam yo\'q" degan odam: Lead ketmaydi, NotClinic va CrmContact ketadi': async () => {
    const s = fakeSignals();
    await s.signals.formSubmitted(form({ leadId: null, isNew: false, notClinic: true }));
    assert.deepStrictEqual(s.names(), ['CrmContact', 'NotClinic']);
    assert.ok(s.events().every((e) => !e.user_data.ph), 'tekshirilmagan odamning raqami Meta\'ga berilmaydi');
  },
  '"klinikam yo\'q" va brauzer belgisi ham yo\'q: begona raqam bilan hech narsa ketmaydi': async () => {
    const s = fakeSignals();
    await s.signals.formSubmitted(form({ leadId: null, isNew: false, notClinic: true, track: cleanTrack({}) }));
    assert.strictEqual(s.posts.length, 0);
  },
  'forma skript bilan to\'ldirilsa: Meta\'ga soatiga 60 tadan ortiq signal ketmaydi': async () => {
    const s = fakeSignals();
    for (let i = 0; i < 75; i++) await s.signals.formSubmitted(form({ leadId: `L${i}` }));
    assert.strictEqual(s.posts.length, 60);
    assert.strictEqual(s.settings.has('demo_meta:L74'), true, 'lidning o\'zi baribir to\'liq saqlanadi');
  },
  'soxta IP manzil Meta\'ga yuborilmaydi (hodisa rad etilmasin)': async () => {
    const s = fakeSignals();
    await s.signals.formSubmitted(form({ ip: 'x'.repeat(500) }));
    assert.ok(s.events().every((e) => e.user_data.client_ip_address === undefined));
    const ok = fakeSignals();
    await ok.signals.formSubmitted(form({ ip: '2a02:6b8::1' }));
    assert.strictEqual(ok.events()[0].user_data.client_ip_address, '2a02:6b8::1');
  },
  'ishonchli manbadan kelgan lid (Facebook, tashqi kalit) darhol "bizda bor" deb bildiriladi': async () => {
    const s = fakeSignals();
    await s.signals.contactAdded(PHONE);
    await s.signals.contactAdded('N/A');
    assert.deepStrictEqual(s.names(), ['CrmContact']);
    assert.deepStrictEqual(s.events()[0].user_data, { ph: [hashPhone(PHONE)] });
  },
  'token ulanmagan: hech narsa ketmaydi, lekin reklama belgisi keyinga saqlanadi': async () => {
    const s = fakeSignals({ token: null });
    await s.signals.formSubmitted(form());
    assert.strictEqual(s.posts.length, 0);
    assert.deepStrictEqual(JSON.parse(s.settings.get('demo_meta:L1')), { fbc: TRACK.fbc, fbp: TRACK.fbp });
  },
  'Meta xato qaytarsa — funksiya xato otmaydi, sabab saqlanadi': async () => {
    const s = fakeSignals({ failWith: 'Invalid OAuth access token' });
    await s.signals.formSubmitted(form());
    const last = (await s.signals.status()).last;
    assert.strictEqual(last.ok, false);
    assert.match(last.error, /Invalid OAuth/);
  },
  'savolga "klinikam bor" deb javob berildi: CompleteRegistration ketadi, lidning reklama belgisi bilan': async () => {
    const s = fakeSignals({ rows: [lead({ id: 'L1' })] });
    await s.signals.formSubmitted(form());
    s.posts.length = 0;
    await s.signals.doctorsAnswered({ leadId: 'L1', hasClinic: true, ip: '1.2.3.4', userAgent: 'Mozilla/5.0' });
    assert.deepStrictEqual(s.names(), ['CompleteRegistration']);
    const e = s.events()[0];
    assert.strictEqual(e.event_id, 'L1-reg', 'brauzerdagi hodisa bilan bir xil belgi');
    assert.strictEqual(e.user_data.fbc, TRACK.fbc);
    assert.deepStrictEqual(e.user_data.ph, [hashPhone(PHONE)]);
  },
  'savolga "klinikam yo\'q" deb javob berildi: NotClinic ketadi, raqamsiz': async () => {
    const s = fakeSignals({ rows: [lead({ id: 'L1' })] });
    await s.signals.formSubmitted(form());
    s.posts.length = 0;
    await s.signals.doctorsAnswered({ leadId: 'L1', hasClinic: false, ip: '1.2.3.4', userAgent: 'Mozilla/5.0' });
    assert.deepStrictEqual(s.names(), ['NotClinic']);
    assert.strictEqual(s.events()[0].user_data.ph, undefined);
  },
  'savol javobi: token ulanmagan yoki lid yo\'q bo\'lsa hech narsa ketmaydi, xato ham otilmaydi': async () => {
    const noToken = fakeSignals({ token: null, rows: [lead({ id: 'L1' })] });
    await noToken.signals.doctorsAnswered({ leadId: 'L1', hasClinic: true });
    const noLead = fakeSignals();
    await noLead.signals.doctorsAnswered({ leadId: 'yoq', hasClinic: true });
    assert.strictEqual(noToken.posts.length + noLead.posts.length, 0);
  },
  'kanban: O\'ylamoqda — QualifiedLead bir marta ketadi': async () => {
    const s = fakeSignals({ rows: [lead({ id: 'L1' })] });
    await s.signals.formSubmitted(form());
    s.posts.length = 0;
    await s.signals.stageChanged('L1', 'Thinking');
    await s.signals.stageChanged('L1', 'Thinking');
    assert.deepStrictEqual(s.names(), ['QualifiedLead']);
    const e = s.events()[0];
    assert.strictEqual(e.action_source, 'phone_call');
    assert.strictEqual(e.user_data.fbc, TRACK.fbc, 'qaysi reklamadan kelgani ma\'lum bo\'lishi uchun');
  },
  'kanban: Oldi — QualifiedLead ham, ClinicWon ham; oldin ketgani qayta ketmaydi': async () => {
    const s = fakeSignals({ rows: [lead({ id: 'L1' })] });
    await s.signals.stageChanged('L1', 'Thinking');
    await s.signals.stageChanged('L1', 'Booked');
    assert.deepStrictEqual(s.names(), ['ClinicWon', 'QualifiedLead']);
  },
  'kanban: Bekor, Bog\'lashildi, Trubkani ko\'tarmadi — Meta\'ga hech narsa ketmaydi': async () => {
    const s = fakeSignals({ rows: [lead({ id: 'L1' })] });
    for (const status of ['Cancelled', 'Contacted', 'NoAnswer', 'New', 'Inbox']) await s.signals.stageChanged('L1', status);
    assert.strictEqual(s.posts.length, 0);
  },
  'kanban: Meta qabul qilmasa, keyingi safar yana urinadi': async () => {
    const failing = fakeSignals({ rows: [lead({ id: 'L1' })], failWith: 'temporary' });
    await failing.signals.stageChanged('L1', 'Thinking');
    assert.strictEqual(failing.settings.has('demo_meta:L1'), false, '"yuborildi" deb belgilanmaydi');
  },
  'token saqlash: mavjud lidlar va klinikalar Meta\'ga bir martada ketadi, takrorsiz': async () => {
    const s = fakeSignals({ token: null, rows: [lead(), lead({ id: 'b', phone: '+998935554433' })], clinics: [{ phone: '901234567x', ownerPhone: PHONE }, { phone: '+998 97 111 22 33', ownerPhone: null }] });
    const res = await s.signals.saveToken('EAAnewtoken12345678901234567890');
    assert.deepStrictEqual(res, { ok: true, synced: 3 });
    assert.deepStrictEqual(s.names(), ['CrmContact', 'CrmContact', 'CrmContact']);
    assert.strictEqual(s.events()[0].action_source, 'system_generated');
    assert.strictEqual((await s.signals.status()).connected, true);
  },
  'token saqlash: Meta rad etsa token saqlanmaydi': async () => {
    const s = fakeSignals({ token: null, rows: [lead()], failWith: 'Invalid OAuth access token' });
    const res = await s.signals.saveToken('EAAbadtoken12345678901234567890');
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /Invalid OAuth/);
    assert.strictEqual((await s.signals.status()).connected, false);
  },
  'token saqlash: axlat matn tarmoqqa chiqmasdan rad etiladi': async () => {
    const s = fakeSignals({ token: null, rows: [lead()] });
    for (const bad of ['', 'qisqa', 'bo\'sh joy bor token 1234567890', { a: 1 }, null]) {
      assert.strictEqual((await s.signals.saveToken(bad)).ok, false);
    }
    assert.strictEqual(s.posts.length, 0);
  },
  'ochiq formadan kelgan kuzatuv ma\'lumoti tozalanadi': async () => {
    const dirty = cleanTrack({ eventId: '<script>', fbp: 'fb.1.x', fbc: 'fb.1.1700000000000.ok_ID-1', url: 'https://evil.example/x?phone=1' });
    assert.deepStrictEqual(dirty, { eventId: null, fbp: null, fbc: 'fb.1.1700000000000.ok_ID-1', url: 'https://dentacrm.uz/' });
    assert.strictEqual(cleanTrack({ url: 'https://dentacrm.uz/lifetime?utm_campaign=a&x=1' }).url, 'https://dentacrm.uz/lifetime');
    assert.deepStrictEqual(cleanTrack(null), { eventId: null, fbp: null, fbc: null, url: 'https://dentacrm.uz/' });
    assert.strictEqual(cleanTrack({ url: 'javascript://dentacrm.uz/%0aalert(1)' }).url, 'https://dentacrm.uz/');
    assert.strictEqual(cleanTrack({ url: 'https://dentacrm.uz/' + 'a'.repeat(5000) }).url, 'https://dentacrm.uz/');
  },
  'lid o\'chirilsa uning reklama belgilari ham o\'chadi': async () => {
    const s = fakeSignals({ token: null });
    await s.signals.formSubmitted(form());
    await s.signals.leadDeleted('L1');
    assert.strictEqual(s.settings.has('demo_meta:L1'), false);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
  }
  console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} o'tdi`);
  process.exitCode = failed ? 1 : 0;
})();
