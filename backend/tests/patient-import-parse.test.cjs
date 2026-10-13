// Bemorlarni fayldan yuklash — brauzerdagi qism (utils/patientImportParse.ts): ustunlarni tanish,
// F.I.O ni familiya va ismga ajratish, Excel sanalari, fayldagi qator raqamlari.
// Sof mantiq: brauzer ham, baza ham kerak emas.
// Ishga tushirish (backend papkasidan):  node tests/patient-import-parse.test.cjs
const path = require('path');
const assert = require('assert');

// Asosiy package.json "type": "module" — utils/ dagi faylni require qilish uchun CommonJS deb belgilaymiz
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' }, moduleTypes: { '../utils/**/*.ts': 'cjs' } });
const parse =require(path.join(__dirname, '..', '..', 'utils', 'patientImportParse.ts'));
const backend = require(path.join(__dirname, '..', 'patientImport.ts'));
const {
  matchHeader, detectHeaderRow, buildTable, sheetsCompatible, autoMapColumns, isMappingReady,
  splitFullName, detectNameOrder, excelSerialToISO, parseDob, prepareRows, rowKey, problemRowsSheet, chunk, runChunks,
} = parse;

const sheet = (rows, name = 'Bemorlar') => ({ name, rows });
const tableOf = (rows) => buildTable([sheet(rows)]);

const tests = {
  'sarlavha: o\'zbekcha, ruscha va inglizcha nomlar taniladi': async () => {
    const expected = {
      fullName: ['F.I.O', 'FIO', 'ФИО', 'Ф.И.О.', 'F.I.Sh.', 'Familiya, ism', 'Фамилия Имя Отчество', 'Ism sharifi', 'Bemor', 'Пациент', 'Full name', 'Name', "To'liq ism"],
      lastName: ['Familiya', 'Familiyasi', 'Фамилия', 'Last name', 'Surname'],
      firstName: ['Ism', 'Ismi', 'Имя', 'Исм', 'First name'],
      phone: ['Telefon', 'Telefon raqami', 'Tel.', 'Телефон', 'Тел', 'Номер телефона', 'Phone', 'Mobile', 'Bemor telefoni', 'Asosiy telefon'],
      secondaryPhone: ["Qo'shimcha telefon", 'Telefon 2', 'Доп. телефон', 'Второй телефон'],
      dob: ["Tug'ilgan sana", 'Tugʻilgan kuni', "Tug'ilgan yili", 'Дата рождения', 'Год рождения', 'Туғилган сана', 'Date of birth', 'DOB', 'Birthday'],
      gender: ['Jins', 'Jinsi', 'Пол', 'Жинс', 'Gender'],
      address: ['Manzil', 'Yashash manzili', 'Адрес', 'Манзил', 'Address'],
      note: ['Izoh', 'Примечание', 'Комментарий', 'Изоҳ', 'Notes'],
    };
    for (const [field, headers] of Object.entries(expected)) {
      for (const h of headers) assert.strictEqual(matchHeader(h), field, `"${h}"`);
    }
    for (const h of ['№', 'T/r', 'ID', 'Sana', 'Yosh', 'Возраст', 'Telegram', 'Otasining ismi', 'Отчество', 'Summa', 'Bemor ID', "Bemorlar ro'yxati", "Tug'ilgan joyi", 'Место рождения', '']) {
      assert.strictEqual(matchHeader(h), null, `"${h}" hech narsaga mos kelmasligi kerak`);
    }
  },

  'sarlavha: qisqartma va qo\'shimcha so\'zli nomlar ham taniladi': async () => {
    const expected = {
      fullName: ['Bola F.I.O', 'Bemorning F.I.Sh.', 'ФИО пациента', 'Patient name'],
      dob: ['Tug. sana', 'Tug.sana', 'Tug.yili', 'Туг. сана'],
      phone: ['Onasining telefoni', 'Ota-onasi tel.', 'Тел. родителей'],
    };
    for (const [field, headers] of Object.entries(expected)) {
      for (const h of headers) assert.strictEqual(matchHeader(h), field, `"${h}"`);
    }
  },

  'sarlavha: shifokor yoki qarindosh ismi, bemor haqidagi boshqa ustunlar bemor ismi deb olinmaydi': async () => {
    const notPatientName = [
      'Doktor ismi', 'Shifokor', 'Shifokor F.I.O', 'Shifokor telefoni', 'Врач', 'ФИО врача', 'Doctor name',
      'Onasining ismi', 'Otasining F.I.O', 'ФИО матери', 'Father name',
      'Bemor №', 'Bemor yoshi', 'Bemor holati', 'Bemor turi', 'Bemor kartasi', 'Карта пациента',
    ];
    for (const h of notPatientName) assert.strictEqual(matchHeader(h), null, `"${h}"`);
    // Bemor qatoridagi yozuv sarlavha emas: "Ismoilov" — "Ism" emas, "Telman" — "Tel" emas
    for (const cell of ['Ismoilov Ali', 'Ismatova Dilnoza', 'Telman Karimov', 'Исмоилов Али', 'Тельман']) assert.strictEqual(matchHeader(cell), null, `"${cell}"`);
    assert.deepStrictEqual(autoMapColumns(tableOf([['Bemor', 'Doktor ismi', 'Telefon'], ['Karimov Aziz', 'Olim Sobirov', '901234567']])), { fullName: 0, phone: 2 });
    assert.deepStrictEqual(autoMapColumns(tableOf([['Bola F.I.O', 'Onasining ismi', 'Telefon'], ['Karimov Aziz', 'Malika', '901234567']])), { fullName: 0, phone: 2 });
    // To'liq ism ustuni topilgan bo'lsa, alohida "Ism" ustuni uni bosib ketmaydi
    assert.deepStrictEqual(autoMapColumns(tableOf([['F.I.O', 'Ism', 'Telefon'], ['Karimov Aziz', 'Aziz', '901234567']])), { fullName: 0, phone: 2 });
  },

  'sarlavha qatori: ustidagi nom qatori va bo\'sh qatorlar o\'tkazib yuboriladi': async () => {
    assert.strictEqual(detectHeaderRow([['F.I.O', 'Telefon'], ['Karimov Aziz', '901234567']]), 0);
    assert.strictEqual(detectHeaderRow([["Bemorlar ro'yxati 2024"], [], ['№', 'Ф.И.О', 'Дата рождения', 'Телефон'], [1, 'Каримов Азиз', 31149, 901234567]]), 2);
    assert.strictEqual(detectHeaderRow([[1, 'Муродова Маржона', 2000, 901234567], [2, 'Каримов Азиз', 1985, 917654321]]), -1);
    assert.strictEqual(detectHeaderRow([]), -1);
    // Sarlavhasiz fayl: izohida "telefon" so'zi bor bemor qatori sarlavha emas — ustidagi bemorlar yo'qolmasin
    const headerless = [['Karimov Aziz', '901234567', ''], ['Ismoilov Ali', '935554433', 'Telefon qilish kerak, manzili yangi'], ['Aliyev Jamshid', '975554433', '']];
    assert.strictEqual(detectHeaderRow(headerless), -1);
    assert.deepStrictEqual(tableOf(headerless).rows.map((r) => r.fileRow), [1, 2, 3]);
    assert.strictEqual(detectHeaderRow([['Familiya', 'Ism', 'Telefon'], ['Ismoilov', 'Ali', '+998 93 555 44 33']]), 0);
  },

  'ustunlar o\'zi topiladi: alohida familiya va ism, ikkita telefon': async () => {
    const table = tableOf([
      ['№', 'Familiya', 'Ism', "Tug'ilgan sana", 'Jins', 'Telefon', "Qo'shimcha telefon", 'Manzil', 'Izoh'],
      [1, 'Karimov', 'Aziz', '12.04.1985', 'erkak', '+998 90 123 45 67', '', 'Chilonzor', ''],
    ]);
    const mapping = autoMapColumns(table);
    assert.deepStrictEqual(mapping, { lastName: 1, firstName: 2, dob: 3, gender: 4, phone: 5, secondaryPhone: 6, address: 7, note: 8 });
    assert.strictEqual(isMappingReady(mapping), true);
    assert.deepStrictEqual(table.columns.map((c) => c.letter).slice(0, 3), ['A', 'B', 'C']);
    assert.strictEqual(table.columns[1].header, 'Familiya');
    assert.strictEqual(table.columns[1].sample, 'Karimov');
  },

  'ustunlar: bitta F.I.O ustuni; "Ism" ustuni familiyasiz bo\'lsa to\'liq ism deb olinadi': async () => {
    assert.deepStrictEqual(autoMapColumns(tableOf([['Ф.И.О', 'Телефон', 'Телефон 2'], ['Каримов Азиз', '901234567', '']])), { fullName: 0, phone: 1, secondaryPhone: 2 });
    assert.deepStrictEqual(autoMapColumns(tableOf([['Ism', 'Tel'], ['Karimov Aziz', '901234567']])), { fullName: 0, phone: 1 });
    // Ikkita "Telefon" ustuni: ikkinchisi qo'shimcha raqam
    assert.deepStrictEqual(autoMapColumns(tableOf([['FIO', 'Telefon', 'Telefon'], ['Karimov Aziz', '901234567', '917654321']])), { fullName: 0, phone: 1, secondaryPhone: 2 });
    assert.strictEqual(isMappingReady({ fullName: 0 }), false);
    assert.strictEqual(isMappingReady({ phone: 1, lastName: 0 }), false);
    assert.strictEqual(isMappingReady({ phone: 1, firstName: 0 }), true);
  },

  'sarlavhasiz fayl: ustunlar ichidagi yozuvga qarab topiladi': async () => {
    const table = tableOf([
      [1, 'Муродова Маржона', 36526, 901234567],
      [2, 'Каримов Азиз Олимович', 31149, '+998 91 765 43 21'],
      [3, 'Алиева Севара', '12.04.1990', '(93) 555-44-33'],
    ]);
    assert.strictEqual(table.hasHeader, false);
    // Sana ustuni taxmin qilinmaydi: u tashrif sanasi ham bo'lishi mumkin — foydalanuvchi o'zi tanlaydi
    assert.deepStrictEqual(autoMapColumns(table), { fullName: 1, phone: 3 });
    // Sarlavhasi tanilmagan telefon ustuni ham ichidagi yozuvdan topiladi
    assert.deepStrictEqual(autoMapColumns(tableOf([['F.I.O', 'Raqam', 'Sana'], ['Karimov Aziz', '90 123 45 67', '12.04.2024']])), { fullName: 0, phone: 1 });
    assert.strictEqual(table.columns[1].header, '');
    assert.strictEqual(table.rows.length, 3);
    assert.strictEqual(table.rows[0].fileRow, 1);
  },

  'F.I.O: familiya va ismga ajratiladi, otasining ismi ism bilan qoladi': async () => {
    assert.deepStrictEqual(splitFullName('Муродова Маржона', 'lastFirst'), { lastName: 'Муродова', firstName: 'Маржона' });
    assert.deepStrictEqual(splitFullName('  Каримов   Азиз  Олимович ', 'lastFirst'), { lastName: 'Каримов', firstName: 'Азиз Олимович' });
    assert.deepStrictEqual(splitFullName("To'rayev Ma'ruf Alisher o'g'li", 'lastFirst'), { lastName: "To'rayev", firstName: "Ma'ruf Alisher o'g'li" });
    assert.deepStrictEqual(splitFullName('Маржона', 'lastFirst'), { lastName: '', firstName: 'Маржона' });
    assert.deepStrictEqual(splitFullName('', 'lastFirst'), { lastName: '', firstName: '' });
    // Familiyasi aniq ko'rinib turgan qator fayldagi umumiy tartibga qaramaydi
    assert.deepStrictEqual(splitFullName('Маржона Муродова', 'lastFirst'), { lastName: 'Муродова', firstName: 'Маржона' });
    assert.deepStrictEqual(splitFullName('Aziz Olimovich Karimov', 'lastFirst'), { lastName: 'Karimov', firstName: 'Aziz Olimovich' });
    assert.deepStrictEqual(splitFullName('Karimov Aziz', 'firstLast'), { lastName: 'Karimov', firstName: 'Aziz' });
    // Familiyasi bilinmaydigan ism — tanlangan tartib bo'yicha
    assert.deepStrictEqual(splitFullName('Kim Viktor', 'lastFirst'), { lastName: 'Kim', firstName: 'Viktor' });
    assert.deepStrictEqual(splitFullName('Viktor Kim', 'firstLast'), { lastName: 'Kim', firstName: 'Viktor' });
  },

  'ism tartibi: fayldagi ko\'pchilik qatorlarga qarab aniqlanadi': async () => {
    assert.strictEqual(detectNameOrder(['Каримов Азиз', 'Муродова Маржона', 'Kim Viktor']), 'lastFirst');
    assert.strictEqual(detectNameOrder(['Aziz Karimov', 'Malika Karimova', 'Tursunov Botir']), 'firstLast');
    assert.strictEqual(detectNameOrder(['Kim Viktor', 'Маржона']), 'lastFirst');
    assert.strictEqual(detectNameOrder([]), 'lastFirst');
  },

  'Excel sanasi (kun raqami) to\'g\'ri sanaga aylanadi': async () => {
    assert.strictEqual(excelSerialToISO(36526), '2000-01-01');
    assert.strictEqual(excelSerialToISO(44197), '2021-01-01');
    assert.strictEqual(excelSerialToISO(31149), '1985-04-12');
    assert.strictEqual(excelSerialToISO(31149.75), '1985-04-12');
    // Sana formati berilgan, lekin sana bo'lmagan son (masalan telefon) — "NaN-NaN-NaN" emas, bo'sh
    for (const notDate of [901234567, 998901234567, 0.5, 0, -3, NaN, Infinity]) assert.strictEqual(excelSerialToISO(notDate), '', String(notDate));
    assert.deepStrictEqual(parseDob(31149), { iso: '1985-04-12', unclear: false });
    assert.deepStrictEqual(parseDob('31149'), { iso: '1985-04-12', unclear: false });
  },

  'tug\'ilgan sana: matn ko\'rinishlari; tushunarsizi bo\'sh qoladi va belgilanadi': async () => {
    for (const typed of ['1985-04-12', '12.04.1985', '12/04/1985', '12-04-1985', '12.04.85', ' 12.04.1985 г. ', '1985-04-12T00:00:00.000Z', '12.04.1985 0:00:00', '12.04.1985 00:00', '1985-04-12 00:00:00']) {
      assert.deepStrictEqual(parseDob(typed), { iso: '1985-04-12', unclear: false }, `"${typed}"`);
    }
    assert.deepStrictEqual(parseDob('1.4.05'), { iso: '2005-04-01', unclear: false });
    assert.deepStrictEqual(parseDob(new Date(1985, 3, 12)), { iso: '1985-04-12', unclear: false });
    for (const empty of ['', '   ', null, undefined]) assert.deepStrictEqual(parseDob(empty), { iso: '', unclear: false });
    // Faqat yil — tug'ilgan kunni o'ylab topmaymiz
    for (const typed of [1985, '1985', 'abc', '31.02.2000', '45 yosh', 5, 99999999, '01.01.2999', new Date('x')]) {
      assert.deepStrictEqual(parseDob(typed), { iso: '', unclear: true }, `"${typed}"`);
    }
  },

  'qatorlar: bitta ustundagi kirill F.I.O, har xil telefon, Excel sanasi, telefonsiz qator': async () => {
    const table = tableOf([
      ["Bemorlar ro'yxati"],
      ['№', 'Ф.И.О', 'Дата рождения', 'Телефон', 'Пол', 'Адрес', 'Примечание'],
      [1, 'Муродова Маржона', 36526, 901234567, 'ж', 'Чилонзор', 'Аллергия'],
      [2, 'Каримов Азиз Олимович', '12.04.1985', '+998 91 765 43 21', 'м', '', ''],
      [null, null, null, null, null, null, null],
      [3, 'Алиева Севара', 1990, '(93) 555-44-33, 94 111 22 33', '', '', ''],
      [4, 'Турсунов Ботир', '', '', '', '', ''],
      [5, '', '', '', '', '', ''],
    ]);
    const mapping = autoMapColumns(table);
    const { rows, repeated, dobUnclear } = prepareRows(table, mapping, detectNameOrder(table.rows.map((r) => String(r.cells[1] || ''))));
    assert.deepStrictEqual(rows.map((r) => r.fileRow), [3, 4, 6, 7], 'qator raqami fayldagi bilan bir xil; bo\'sh qatorlar yuborilmaydi');
    assert.deepStrictEqual(rows[0].row, { firstName: 'Маржона', lastName: 'Муродова', phone: '901234567', dob: '2000-01-01', gender: 'ж', address: 'Чилонзор', note: 'Аллергия' });
    assert.deepStrictEqual(rows[1].row, { firstName: 'Азиз Олимович', lastName: 'Каримов', phone: '+998 91 765 43 21', dob: '1985-04-12', gender: 'м' });
    assert.deepStrictEqual(rows[2].row, { firstName: 'Севара', lastName: 'Алиева', phone: '(93) 555-44-33, 94 111 22 33' });
    assert.deepStrictEqual(rows[3].row, { firstName: 'Ботир', lastName: 'Турсунов' }, 'telefonsiz qator serverga boradi — sababini u aytadi');
    assert.deepStrictEqual([rows[2].dobUnclear, dobUnclear, repeated.length], [true, 1, 0]);
    // Server shu qatorlarni qanday ko'rishini ham tekshiramiz
    const verdicts = rows.map((r) => backend.normalizeImportRow(r.row));
    assert.deepStrictEqual(verdicts.map((v) => (v.ok ? v.row.phone : v.reason)), ['+998901234567', '+998917654321', '+998935554433', "Telefon raqami yo'q"]);
    assert.deepStrictEqual([verdicts[0].row.gender, verdicts[1].row.gender, verdicts[2].row.gender, verdicts[2].row.secondaryPhone], ['Female', 'Male', 'Female', '+998941112233']);
  },

  'qatorlar: faylda ikki marta yozilgan bemor bir marta yuboriladi': async () => {
    const table = tableOf([
      ['Familiya', 'Ism', 'Telefon'],
      ['Karimov', 'Aziz', '+998 90 123 45 67'],
      ['KARIMOV', 'aziz', 901234567],
      ['Karimova', 'Malika', '901234567'],
      ["To'rayev", "Ma'ruf", '93 555 44 33'],
      ['Toʻrayev', 'Maʼruf', '8 93 555 44 33'],
      ['', 'Vali', ''],
      ['', 'Vali', ''],
    ]);
    const { rows, repeated } = prepareRows(table, autoMapColumns(table), 'lastFirst');
    assert.deepStrictEqual(rows.map((r) => r.fileRow), [2, 4, 5, 7, 8], 'xato qatorlar takror deb yashirilmaydi');
    assert.deepStrictEqual(repeated.map((r) => r.fileRow), [3, 6]);
  },

  'qatorlar: juda uzun kataklar server chegarasigacha kesiladi — so\'rov hajmi oshib ketmaydi': async () => {
    const long = 'я'.repeat(5000);
    const table = tableOf([['Familiya', 'Ism', 'Telefon', 'Manzil', 'Izoh', 'Jins'], [long, long, `901234567 ${'x'.repeat(5000)}`, long, long, long]]);
    const { rows } = prepareRows(table, autoMapColumns(table), 'lastFirst');
    const r = rows[0].row;
    assert.deepStrictEqual([r.lastName.length, r.firstName.length, r.address.length, r.note.length], [60, 60, 200, 1000]);
    assert.ok(r.phone.startsWith('901234567') && r.phone.length <= 100 && r.gender.length <= 20);
    // 500 ta shunday qator ham serverning 2 MB chegarasiga sig'adi
    assert.ok(Buffer.byteLength(JSON.stringify(r)) * 500 < 2 * 1024 * 1024);
  },

  'takror kaliti serverdagi bilan bir xil': async () => {
    const samples = [
      { firstName: 'Aziz', lastName: 'Karimov', phone: '+998 90 123 45 67' },
      { firstName: 'MAʼRUF', lastName: 'toʻrayev', phone: '8 90 123 45 67' },
      { firstName: 'Севара Алишер қизи', lastName: 'Алиёва', phone: '(93) 555-44-33, 94 111 22 33' },
      { firstName: 'Viktor', lastName: '', phone: '+7 912 345-67-89' },
      { firstName: '', lastName: 'Каримов Азиз', phone: 901234567 },
    ];
    for (const s of samples) {
      const res = backend.normalizeImportRow(s);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(rowKey(s), `${backend.phoneKey(res.row.phone)}|${backend.nameKey(res.row.firstName, res.row.lastName)}`, JSON.stringify(s));
    }
    assert.strictEqual(rowKey({ firstName: 'Aziz', phone: '' }), '');
    assert.strictEqual(rowKey({ firstName: '', lastName: '', phone: '901234567' }), '');
    assert.strictEqual(rowKey({ firstName: 'Aziz', phone: '12345' }), '');
  },

  'bir nechta varaq: har birining sarlavhasi o\'tkaziladi, qator raqami o\'z varag\'iniki': async () => {
    const jan = sheet([['F.I.O', 'Telefon'], ['Karimov Aziz', '901234567'], ['Aliyev Jamshid', '975554433']], 'Yanvar');
    const feb = sheet([['Fevral oyi'], ['F.I.O', 'Telefon'], [], ['Karimova Malika', '939876543']], 'Fevral');
    const other = sheet([['Telefon', 'F.I.O'], ['991112233', 'Tursunova Sevara']], 'Boshqa');
    assert.strictEqual(sheetsCompatible([jan, feb]), true);
    assert.strictEqual(sheetsCompatible([jan, feb, other]), false);
    assert.strictEqual(sheetsCompatible([jan]), true);
    const table = buildTable([jan, feb]);
    assert.deepStrictEqual(table.rows.map((r) => [r.sheet, r.fileRow]), [['Yanvar', 2], ['Yanvar', 3], ['Fevral', 4]]);
    const { rows } = prepareRows(table, autoMapColumns(table), 'lastFirst');
    assert.deepStrictEqual(rows.map((r) => r.row.lastName), ['Karimov', 'Aliyev', 'Karimova']);
  },

  'xato qatorlar fayli: asl ustunlar va sababi bilan': async () => {
    const labels = { row: 'Qator', reason: 'Sabab' };
    const table = tableOf([['F.I.O', 'Telefon', "Tug'ilgan sana"], ['Karimov Aziz', '', 31149], ['Aliyev Jamshid', 12345, '1978']]);
    const mapping = autoMapColumns(table);
    const { rows } = prepareRows(table, mapping, 'lastFirst');
    const out = problemRowsSheet(table, [{ row: rows[0], reason: "Telefon raqami yo'q" }, { row: rows[1], reason: "Telefon raqami noto'g'ri" }], labels, mapping.dob);
    assert.deepStrictEqual(out, [
      ['Qator', 'F.I.O', 'Telefon', "Tug'ilgan sana", 'Sabab'],
      [2, 'Karimov Aziz', '', '12.04.1985', "Telefon raqami yo'q"],
      [3, 'Aliyev Jamshid', 12345, '1978', "Telefon raqami noto'g'ri"],
    ]);
    // Tuzatilgan faylni qayta yuklasa, qo'shilgan ikki ustun xalaqit bermaydi
    assert.deepStrictEqual(autoMapColumns(tableOf(out)), { fullName: 1, phone: 2, dob: 3 });
    const bare = tableOf([['Karimov Aziz', 'yoq'], ['Aliyev Jamshid', 'yoq']]);
    const bareRows = prepareRows(bare, { fullName: 0, phone: 1 }, 'lastFirst').rows;
    assert.deepStrictEqual(problemRowsSheet(bare, [{ row: bareRows[1], reason: 'x' }], labels), [['Qator', 'A', 'B', 'Sabab'], [2, 'Aliyev Jamshid', 'yoq', 'x']]);
    // Bir nechta varaq: qator qaysi varaqdan ekani ko'rinadi
    const multi = buildTable([sheet([['F.I.O', 'Telefon'], ['Karimov Aziz', '']], 'Yanvar'), sheet([['F.I.O', 'Telefon'], ['Aliyev Jamshid', '']], 'Fevral')]);
    const multiRows = prepareRows(multi, autoMapColumns(multi), 'lastFirst').rows;
    assert.strictEqual(problemRowsSheet(multi, [{ row: multiRows[1], reason: 'x' }], labels)[1][0], 'Fevral: 2');
  },

  'bo\'laklash: 500 tadan, tartib saqlanadi': async () => {
    const items = Array.from({ length: 1201 }, (_, i) => i);
    const parts = chunk(items, 500);
    assert.deepStrictEqual(parts.map((p) => p.length), [500, 500, 201]);
    assert.deepStrictEqual([].concat(...parts), items);
    assert.deepStrictEqual(chunk([], 500), []);
  },

  'bo\'laklab yuborish: xato qator raqami butun ro\'yxat bo\'yicha, jarayon har bo\'lakdan keyin bildiriladi': async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ firstName: `B${i}` }));
    const sent = [];
    // Soxta server: har bo'lakning 0- va oxirgi qatori xato, bittasi takror
    const post = async (part) => {
      sent.push(part.map((r) => r.firstName));
      return { created: part.length - 3, duplicates: 1, invalid: [{ index: 0, reason: 'a' }, { index: part.length - 1, reason: 'b' }] };
    };
    const progress = [];
    const totals = await runChunks(rows, 500, post, { onProgress: (t) => progress.push(t.sent) });
    assert.deepStrictEqual(sent.map((p) => [p[0], p.length]), [['B0', 500], ['B500', 500], ['B1000', 201]]);
    assert.deepStrictEqual(progress, [500, 1000, 1201]);
    assert.deepStrictEqual([totals.sent, totals.created, totals.duplicates], [1201, 1201 - 9, 3]);
    assert.deepStrictEqual(totals.invalid.map((p) => p.index), [0, 499, 500, 999, 1000, 1200]);
  },

  'bo\'laklab yuborish: uzilgan joydan davom etadi, yuborilgani qayta yuborilmaydi; bekor qilinsa to\'xtaydi': async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ firstName: `B${i}` }));
    const sent = [];
    let failNext = true;
    const post = async (part) => {
      if (sent.length === 1 && failNext) { failNext = false; throw new Error('uzildi'); }
      sent.push(part[0].firstName);
      return { created: part.length, duplicates: 0, invalid: part[0].firstName === 'B500' ? [{ index: 7, reason: 'x' }] : [] };
    };
    let last = null;
    await assert.rejects(() => runChunks(rows, 500, post, { onProgress: (t) => { last = t; } }), /uzildi/);
    assert.deepStrictEqual([last.sent, last.created, sent], [500, 500, ['B0']]);
    const totals = await runChunks(rows, 500, post, { onProgress: () => {}, resumeFrom: last });
    assert.deepStrictEqual(sent, ['B0', 'B500', 'B1000']);
    assert.deepStrictEqual([totals.sent, totals.created, totals.invalid], [1201, 1201, [{ index: 507, reason: 'x' }]]);

    let calls = 0;
    const stopped = await runChunks(rows, 500, async (part) => { calls += 1; return { created: part.length, duplicates: 0, invalid: [] }; },
      { onProgress: () => {}, isCancelled: () => calls >= 1 });
    assert.deepStrictEqual([calls, stopped.sent], [1, 500]);
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
