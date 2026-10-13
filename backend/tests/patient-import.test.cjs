// Bemorlarni fayldan yuklash (patientImport.ts): shart bo'lgan maydonlar, telefon va sana
// ko'rinishlari, takrorlarni o'tkazib yuborish, klinikalar orasidagi chegara, bo'lib yozish.
// Soxta baza bilan ishlaydi — haqiqiy bazaga ulanmaydi.
// Ishga tushirish (backend papkasidan):  node tests/patient-import.test.cjs
const path = require('path');
const assert = require('assert');

// smsService.ts → db.ts: `global.prisma` bor bo'lsa o'shani oladi — haqiqiy PrismaClient yaratilmaydi
global.prisma = {};
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';

require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { importPatients, normalizeImportRow, MAX_IMPORT_ROWS } = require(path.join(__dirname, '..', 'patientImport.ts'));
const { normalizeUzPhone } = require(path.join(__dirname, '..', 'smsService.ts'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Xotiradagi soxta baza. Import faqat `patient.findMany` (o'z klinikasi bo'yicha) va
 * `patient.createMany` ni chaqirishi kerak — boshqa har qanday chaqiruv xato tashlaydi,
 * shunda "mavjud bemorni yangilab qo'yish" testdan jimgina o'tib ketmaydi.
 */
const makeDb = (seed = []) => {
  const rows = seed.map((r) => ({ ...r }));
  const calls = { findMany: [], createMany: [] };
  const patient = {
    findMany: async ({ where = {}, select } = {}) => {
      calls.findMany.push(where);
      const unknown = Object.keys(where).filter((k) => k !== 'clinicId');
      if (unknown.length) throw new Error(`soxta baza bu shartni bilmaydi: ${unknown.join(', ')}`);
      if (typeof where.clinicId !== 'string' || !where.clinicId) throw new Error('klinika sharti yo\'q — boshqa klinika bemorlari ham o\'qiladi');
      return rows
        .filter((r) => r.clinicId === where.clinicId)
        .map((r) => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, r[k]])) : { ...r }));
    },
    createMany: async ({ data }) => {
      calls.createMany.push(data.length);
      for (const d of data) rows.push({ ...d });
      return { count: data.length };
    },
  };
  const guarded = new Proxy(patient, {
    get: (target, name) => target[name] || (async () => { throw new Error(`import patient.${String(name)} ni chaqirmasligi kerak`); }),
  });
  return { rows, calls, patient: guarded };
};

const row = (over = {}) => ({ firstName: 'Aziz', lastName: 'Karimov', phone: '+998 90 123 45 67', ...over });
const norm = (over) => {
  const res = normalizeImportRow(row(over));
  assert.strictEqual(res.ok, true, `qator yaroqli bo'lishi kerak edi: ${res.reason}`);
  return res.row;
};
const reason = (raw) => {
  const res = normalizeImportRow(raw);
  assert.strictEqual(res.ok, false, 'qator rad etilishi kerak edi');
  return res.reason;
};
const existing = (over = {}) => ({
  id: 'old-1', clinicId: 'c1', firstName: 'Aziz', lastName: 'Karimov', phone: '+998 90 123 45 67',
  dob: '1985-04-12', gender: 'Male', status: 'Active', lastVisit: '2026-09-01', medicalHistory: 'Allergiya', ...over,
});

const tests = {
  'ism va telefon shart: sababi oddiy tilda, tartib raqami yuborilgan qatorniki': async () => {
    assert.strictEqual(reason({ lastName: '', firstName: '  ', phone: '901234567' }), "Ism yo'q");
    assert.strictEqual(reason({ firstName: 'Aziz' }), "Telefon raqami yo'q");
    assert.strictEqual(reason({ firstName: 'Aziz', phone: '   ' }), "Telefon raqami yo'q");
    assert.strictEqual(reason({ firstName: 'Aziz', phone: '12345' }), "Telefon raqami noto'g'ri");
    assert.strictEqual(reason({ firstName: 'Aziz', phone: "yo'q" }), "Telefon raqami noto'g'ri");
    assert.strictEqual(reason({ firstName: '12345', phone: '901234567' }), "Ism yo'q");
    assert.strictEqual(typeof reason(null), 'string');

    const db = makeDb();
    const res = await importPatients(db, 'c1', [row(), { firstName: 'Vali' }, row({ firstName: 'Olim' }), { phone: '901112233' }]);
    assert.strictEqual(res.created, 2);
    assert.deepStrictEqual(res.invalid, [{ index: 1, reason: "Telefon raqami yo'q" }, { index: 3, reason: "Ism yo'q" }]);
  },

  'familiya ixtiyoriy; faqat familiya ustuni to\'ldirilgan bo\'lsa undan ism olinadi': async () => {
    assert.strictEqual(norm({ lastName: '' }).lastName, '');
    const full = norm({ firstName: '', lastName: 'Муродова Маржона' });
    assert.deepStrictEqual([full.lastName, full.firstName], ['Муродова', 'Маржона']);
    const single = norm({ firstName: undefined, lastName: 'Маржона' });
    assert.deepStrictEqual([single.lastName, single.firstName], ['', 'Маржона']);
  },

  'telefon: O\'zbekiston raqami bitta ko\'rinishga keladi': async () => {
    for (const typed of ['+998 90 123 45 67', '(90) 123-45-67', '901234567', '90 123 45 67', '998901234567', '8 90 123 45 67', '0901234567', 901234567, 998901234567]) {
      assert.strictEqual(norm({ phone: typed }).phone, '+998901234567', `"${typed}"`);
    }
  },

  'telefon: tanib bo\'lmaydigan, lekin raqamga o\'xshagani yozilganicha qoladi': async () => {
    assert.strictEqual(norm({ phone: ' +7 912 345-67-89 ' }).phone, '+7 912 345-67-89');
    assert.strictEqual(norm({ phone: '233-45-67' }).phone, '233-45-67');
    assert.strictEqual(reason(row({ phone: '1234567890123456789' })), "Telefon raqami noto'g'ri");
  },

  'telefon: bitta katakdagi ikki raqam — asosiy va qo\'shimcha': async () => {
    const two = norm({ phone: '90 123 45 67, 91 765 43 21' });
    assert.deepStrictEqual([two.phone, two.secondaryPhone], ['+998901234567', '+998917654321']);
    const own = norm({ phone: '901234567 / 917654321', secondaryPhone: '(93) 555-44-33' });
    assert.deepStrictEqual([own.phone, own.secondaryPhone], ['+998901234567', '+998935554433']);
    assert.strictEqual(norm({ secondaryPhone: '901234567' }).secondaryPhone, null, 'asosiy raqamning o\'zi qo\'shimcha bo\'lmaydi');
    assert.strictEqual(norm({ secondaryPhone: 'yo\'q' }).secondaryPhone, null);
    assert.strictEqual(norm({}).secondaryPhone, null);
  },

  'telefon qoidasi SMS yuboradigan normalizeUzPhone bilan bir xil': async () => {
    for (const typed of ['+998 90 123 45 67', '(90) 123-45-67', '901234567', '0998901234567', '8901234567', '0901234567', '998 71 233 45 67']) {
      assert.strictEqual(norm({ phone: typed }).phone, `+${normalizeUzPhone(typed)}`, `"${typed}"`);
    }
    for (const typed of ['+7 912 345-67-89', '233-45-67', '99890123456']) {
      assert.strictEqual(normalizeUzPhone(typed), null);
      assert.strictEqual(norm({ phone: typed }).phone, typed, `"${typed}" o'zgarmasligi kerak`);
    }
  },

  'tug\'ilgan sana: uch xil yozuv ham bazadagi YYYY-MM-DD ko\'rinishiga keladi': async () => {
    assert.strictEqual(norm({ dob: '1985-04-12' }).dob, '1985-04-12');
    assert.strictEqual(norm({ dob: '12.04.1985' }).dob, '1985-04-12');
    assert.strictEqual(norm({ dob: '12/04/1985' }).dob, '1985-04-12');
    assert.strictEqual(norm({ dob: '1.4.1985' }).dob, '1985-04-01');
    assert.strictEqual(norm({ dob: ' 12.04.1985 й. ' }).dob, '1985-04-12');
    assert.strictEqual(norm({ dob: '1985-04-12T00:00:00.000Z' }).dob, '1985-04-12');
    // Boshqa dasturdan chiqarilgan faylda sana yonida vaqt ham bo'ladi
    assert.strictEqual(norm({ dob: '12.04.1985 0:00:00' }).dob, '1985-04-12');
    assert.strictEqual(norm({ dob: '1985-04-12 00:00:00' }).dob, '1985-04-12');
    assert.strictEqual(norm({ dob: '29.02.2000' }).dob, '2000-02-29');
  },

  'tug\'ilgan sana: tushunarsiz bo\'lsa bemor baribir qo\'shiladi, sana bo\'sh qoladi': async () => {
    for (const typed of ['', undefined, 'abc', '31.02.2000', '12.13.1985', '1985', '45 yosh', '12.04.1885', '01.01.2999', '0000-00-00']) {
      assert.strictEqual(norm({ dob: typed }).dob, '', `"${typed}"`);
    }
  },

  'jins: erkak/ayol/м/ж/male/female — bazadagi Male/Female': async () => {
    for (const typed of ['erkak', 'Erkak', 'ERKAK', 'м', 'М', 'муж', 'Мужской', 'male', 'Male', 'M', 'e', 'эркак']) {
      assert.strictEqual(norm({ lastName: 'Karimova', gender: typed }).gender, 'Male', `"${typed}"`);
    }
    for (const typed of ['ayol', 'Ayol', 'ж', 'Ж', 'жен', 'Женский', 'female', 'Female', 'F', 'a', 'аёл']) {
      assert.strictEqual(norm({ gender: typed }).gender, 'Female', `"${typed}"`);
    }
  },

  'jins yozilmagan bo\'lsa: familiyadan olinadi, bo\'lmasa bemor qo\'shishdagi kabi Male': async () => {
    assert.strictEqual(norm({ gender: '' }).gender, 'Male');
    assert.strictEqual(norm({ gender: '?' }).gender, 'Male');
    assert.strictEqual(norm({ lastName: 'Karimova', firstName: 'Malika' }).gender, 'Female');
    assert.strictEqual(norm({ lastName: 'Муродова', firstName: 'Маржона' }).gender, 'Female');
    assert.strictEqual(norm({ lastName: 'Tursunov', firstName: 'Sevara Alisher qizi' }).gender, 'Female');
    assert.strictEqual(norm({ lastName: 'Aliyev', firstName: 'Jamshid Olimovich' }).gender, 'Male');
  },

  'matn: chetidagi bo\'shliq olinadi, uzunligi cheklanadi, HTML o\'tmaydi': async () => {
    const r = norm({
      firstName: '  <b>Aziz</b>  ', lastName: ' Karimov\t ', address: '<script>alert(1)</script>Chilonzor  5-mavze',
      note: 'x'.repeat(5000),
    });
    assert.strictEqual(r.firstName, 'Aziz');
    assert.strictEqual(r.lastName, 'Karimov');
    assert.strictEqual(r.address, 'alert(1) Chilonzor 5-mavze');
    assert.strictEqual(r.medicalHistory.length, 1000);
    assert.ok(norm({ firstName: 'A'.repeat(300) }).firstName.length <= 60);
    assert.ok(!/[<>]/.test(JSON.stringify(norm({ firstName: 'Aziz <', lastName: '> Karimov <img src=x>', note: '1 < 2 > 0' }))));
    assert.strictEqual(norm({ address: '   ' }).address, null);
    assert.strictEqual(norm({ address: { $ne: null }, note: ['a'] }).medicalHistory, '');
  },

  'zararli matn: megabaytli satr serverni qotirmaydi': async () => {
    // "<<<<…" teg qidiruvini kvadratik sekinlashtirardi: 2 MB li bitta maydon serverni daqiqalarga to'xtatardi
    const evil = '<'.repeat(300000);
    const started = Date.now();
    assert.strictEqual(reason({ firstName: evil, lastName: evil, phone: '901234567' }), "Ism yo'q");
    assert.strictEqual(norm({ firstName: `Aziz${evil}`, address: evil, note: `${evil}allergiya`, dob: evil, gender: evil }).firstName, 'Aziz');
    assert.strictEqual(reason(row({ phone: evil })), "Telefon raqami yo'q");
    assert.strictEqual(norm({ phone: `901234567${',1'.repeat(500000)}` }).phone, '+998901234567');
    assert.strictEqual(reason(row({ phone: '1,'.repeat(500000) })), "Telefon raqami noto'g'ri");
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 500, `juda sekin: ${elapsed} ms`);
    // Ish hajmi chegaralangan: maydonning faqat boshi o'qiladi (ism — 240, telefon katagi — 200 belgi)
    assert.strictEqual(reason({ firstName: `${'<'.repeat(1000)}Aziz`, phone: '901234567' }), "Ism yo'q");
    assert.strictEqual(reason(row({ phone: `${'x,'.repeat(150)}901234567` })), "Telefon raqami noto'g'ri");
  },

  'matn: kesilganda yarimta belgi (emoji bo\'lagi) qolmaydi': async () => {
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const cut = norm({ firstName: `${'A'.repeat(59)}😀`, note: `${'x'.repeat(999)}😀` });
    assert.ok(!loneSurrogate.test(cut.firstName) && !loneSurrogate.test(cut.medicalHistory));
    assert.strictEqual(cut.firstName, 'A'.repeat(59));
    assert.strictEqual(norm({ firstName: 'Az\ud800iz', lastName: '\udc00Karimov' }).firstName, 'Aziz');
    assert.strictEqual(norm({ firstName: 'Aziz 😀' }).firstName, 'Aziz 😀', 'butun emoji joyida qoladi');
  },

  'yozish bitta tranzaksiyada: so\'rov yo to\'liq yoziladi, yo umuman yozilmaydi': async () => {
    const many = Array.from({ length: 450 }, (_, i) => row({ phone: String(900000000 + i) }));
    const db = makeDb();
    const batches = [];
    db.$transaction = async (operations) => { batches.push(operations.length); return Promise.all(operations); };
    const res = await importPatients(db, 'c1', many);
    assert.deepStrictEqual(batches, [db.calls.createMany.length], 'barcha bo\'laklar bitta tranzaksiyada');
    assert.ok(db.calls.createMany.length > 1);
    assert.deepStrictEqual([res.created, db.rows.length], [450, 450]);
    // dryRun tranzaksiya ochmaydi
    await importPatients(db, 'c1', [row({ firstName: 'Yangi' })], { dryRun: true });
    assert.strictEqual(batches.length, 1);
  },

  'yangi bemor: bemor qo\'shishdagi kabi boshlang\'ich qiymatlar va haqiqiy uuid': async () => {
    const db = makeDb();
    const res = await importPatients(db, 'c1', [row({ dob: '12.04.1985', gender: 'ayol', address: 'Chilonzor', note: 'Penitsillinga allergiya', secondaryPhone: '917654321' })], { branchId: 'b1' });
    assert.deepStrictEqual([res.created, res.duplicates, res.invalid.length], [1, 0, 0]);
    assert.strictEqual(db.rows.length, 1);
    const p = db.rows[0];
    assert.ok(UUID.test(p.id), `uuid emas: ${p.id}`);
    assert.deepStrictEqual(res.createdIds, [p.id]);
    assert.deepStrictEqual({ ...p, id: null }, {
      id: null, firstName: 'Aziz', lastName: 'Karimov', phone: '+998901234567', secondaryPhone: '+998917654321',
      dob: '1985-04-12', gender: 'Female', address: 'Chilonzor', medicalHistory: 'Penitsillinga allergiya',
      status: 'Active', lastVisit: 'Never', clinicId: 'c1', branchId: 'b1', doctorId: null,
      pinfl: '', passport: null, regionCode: null, districtCode: null,
    });
    const bare = makeDb();
    await importPatients(bare, 'c1', [{ firstName: 'Aziz', phone: '901234567' }]);
    assert.deepStrictEqual(
      [bare.rows[0].lastName, bare.rows[0].dob, bare.rows[0].gender, bare.rows[0].medicalHistory, bare.rows[0].address, bare.rows[0].branchId],
      ['', '', 'Male', '', null, null]);
  },

  'takror: ro\'yxatda bor bemor (telefon va ism bir xil) o\'tkazib yuboriladi, kartasi o\'zgarmaydi': async () => {
    const db = makeDb([
      existing({ firstName: "Ma'ruf", lastName: "To'rayev" }),
      // Eski yozuv: telefon kodsiz, 9 ta raqam bilan saqlangan
      existing({ id: 'old-2', firstName: 'Olim', lastName: 'Sobirov', phone: '(93) 555-44-33' }),
    ]);
    const before = JSON.stringify(db.rows);
    const res = await importPatients(db, 'c1', [
      row({ firstName: 'MAʼRUF ', lastName: '  toʻrayev', phone: '90-123-45-67', dob: '01.01.1990', note: 'yangi izoh' }),
      row({ firstName: 'To`rayev', lastName: 'Maruf', phone: '8 90 123 45 67' }),
      row({ firstName: 'Olim', lastName: 'Sobirov', phone: '+998 93 555 44 33' }),
    ]);
    assert.deepStrictEqual([res.created, res.duplicates, res.invalid.length], [0, 3, 0]);
    assert.deepStrictEqual(res.createdIds, []);
    assert.strictEqual(JSON.stringify(db.rows), before);
    assert.deepStrictEqual(db.calls.createMany, []);
  },

  'takror emas: telefon bir xil, ism boshqa (oila a\'zolari) yoki ism bir xil, telefon boshqa': async () => {
    const db = makeDb([existing()]);
    const res = await importPatients(db, 'c1', [
      row({ firstName: 'Malika', lastName: 'Karimova' }),
      row({ phone: '+998 91 111 22 33' }),
    ]);
    assert.deepStrictEqual([res.created, res.duplicates], [2, 0]);
    assert.strictEqual(db.rows.length, 3);
  },

  'takror: fayl ichida ikki marta yozilgan bemor bir marta qo\'shiladi': async () => {
    const db = makeDb();
    const res = await importPatients(db, 'c1', [
      row(),
      row({ firstName: 'aziz', lastName: 'KARIMOV', phone: '901234567' }),
      row({ firstName: 'Malika', lastName: 'Karimova' }),
      row({ phone: '998 90 123-45-67' }),
    ]);
    assert.deepStrictEqual([res.created, res.duplicates, res.createdIds.length], [2, 2, 2]);
    assert.deepStrictEqual(db.rows.map((r) => r.firstName), ['Aziz', 'Malika']);
  },

  'dryRun: hech narsa yozilmaydi, sonlar haqiqiy yuklashdagi bilan bir xil': async () => {
    const rows = [row(), row(), row({ firstName: 'Olim' }), { firstName: 'Vali' }, row({ firstName: 'Eski', lastName: 'Bemor', phone: '93 000 00 01' })];
    const seed = [existing({ firstName: 'Eski', lastName: 'Bemor', phone: '+998930000001' })];
    const dry = makeDb(seed);
    const preview = await importPatients(dry, 'c1', rows, { dryRun: true });
    assert.deepStrictEqual(dry.calls.createMany, []);
    assert.strictEqual(dry.rows.length, 1);
    assert.deepStrictEqual(preview.createdIds, []);

    const live = makeDb(seed);
    const real = await importPatients(live, 'c1', rows);
    assert.deepStrictEqual([preview.created, preview.duplicates, preview.invalid], [real.created, real.duplicates, real.invalid]);
    assert.deepStrictEqual([real.created, real.duplicates, real.invalid.length], [2, 2, 1]);
    assert.strictEqual(live.rows.length, 3);
  },

  'klinikalar ajratilgan: boshqa klinikadagi shu telefonli bemor takror emas': async () => {
    const db = makeDb([existing({ id: 'other', clinicId: 'c2' })]);
    const res = await importPatients(db, 'c1', [row()]);
    assert.deepStrictEqual([res.created, res.duplicates], [1, 0]);
    assert.ok(db.calls.findMany.length > 0);
    assert.ok(db.calls.findMany.every((where) => where.clinicId === 'c1'), 'faqat o\'z klinikasi o\'qilishi kerak');
    const created = db.rows.filter((r) => r.id !== 'other');
    assert.deepStrictEqual(created.map((r) => r.clinicId), ['c1']);
    assert.strictEqual(JSON.stringify(db.rows[0]), JSON.stringify(existing({ id: 'other', clinicId: 'c2' })));
    // Qatorning o'zida kelgan clinicId/id/status e'tiborga olinmaydi
    const sneaky = makeDb();
    await importPatients(sneaky, 'c1', [{ ...row(), clinicId: 'c2', id: 'mine', status: 'Archived', balance: 999 }]);
    assert.strictEqual(sneaky.rows[0].clinicId, 'c1');
    assert.ok(UUID.test(sneaky.rows[0].id));
    assert.strictEqual(sneaky.rows[0].status, 'Active');
    assert.strictEqual('balance' in sneaky.rows[0], false);
  },

  'klinika aniqlanmagan yoki qatorlar ro\'yxat emas — xato, bazaga murojaat yo\'q': async () => {
    const db = makeDb();
    await assert.rejects(() => importPatients(db, '', [row()]), /Klinika/);
    await assert.rejects(() => importPatients(db, 'c1', { length: 1 }), /qator/i);
    await assert.rejects(() => importPatients(db, 'c1', undefined), /qator/i);
    assert.deepStrictEqual([db.calls.findMany.length, db.calls.createMany.length], [0, 0]);
  },

  'chegara: 1000 tadan ko\'p qator — tushunarli xato, hech narsa yozilmaydi': async () => {
    assert.strictEqual(MAX_IMPORT_ROWS, 1000);
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => row({ phone: String(900000000 + i) }));
    const db = makeDb();
    await assert.rejects(() => importPatients(db, 'c1', many), (e) => e instanceof Error && /1000 ta/.test(e.message) && /ko'pi bilan/.test(e.message));
    await assert.rejects(() => importPatients(db, 'c1', many, { dryRun: true }), /1000 ta/);
    assert.deepStrictEqual([db.rows.length, db.calls.findMany.length], [0, 0]);
  },

  'bo\'lib yozish: 1000 ta bemor bir nechta createMany bilan, hech biri yo\'qolmaydi': async () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => row({ phone: String(900000000 + i) }));
    const db = makeDb();
    const res = await importPatients(db, 'c1', many);
    assert.strictEqual(res.created, 1000);
    assert.ok(db.calls.createMany.length > 1, 'bitta ulkan so\'rov emas');
    assert.ok(db.calls.createMany.every((n) => n > 0 && n <= 250), `bo'laklar: ${db.calls.createMany}`);
    assert.strictEqual(db.calls.createMany.reduce((a, b) => a + b, 0), 1000);
    assert.strictEqual(new Set(db.rows.map((r) => r.id)).size, 1000);
    assert.deepStrictEqual(res.createdIds, db.rows.map((r) => r.id));
    assert.strictEqual(db.calls.findMany.length, 1, 'mavjud bemorlar bir marta o\'qiladi');
  },

  'bo\'sh ro\'yxat yoki hammasi yaroqsiz — bazaga yozilmaydi': async () => {
    const db = makeDb();
    assert.deepStrictEqual(await importPatients(db, 'c1', []), { created: 0, duplicates: 0, invalid: [], createdIds: [] });
    const res = await importPatients(db, 'c1', [{}, null, 'matn']);
    assert.deepStrictEqual([res.created, res.invalid.map((x) => x.index)], [0, [0, 1, 2]]);
    assert.deepStrictEqual(db.calls.createMany, []);
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
