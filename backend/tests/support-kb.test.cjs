// Bilim bazasi va mahsulot xaritasi: maqolalar ilovada HAQIQATAN bor bo'limlarga
// yo'naltiradimi. Bu test bilim bazasining eskirib qolishidan himoya qiladi:
// menyudagi bo'lim nomi o'zgarsa yoki maqola yo'q bo'limni aytsa — shu yerda yiqiladi.
// Ishga tushirish (backend papkasidan):  node tests/support-kb.test.cjs
const path = require('path');
const assert = require('assert');
const { runTests } = require('./helpers/fakeDb.cjs');

require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const at = (f) => path.join(__dirname, '..', f);
const { KB_SEED } = require(at('support/kbSeed.ts'));
const { PRODUCT_PATHS, GUIDE_IDS, isPathId, isGuideId, unknownPaths } = require(at('support/productMap.ts'));
const { ARTICLE_ID_RE, BODY_MAX } = require(at('support/kb.ts'));
// Frontend fayllari ES modul (ildizdagi package.json: "type": "module") — require bilan
// yuklab bo'lmaydi. Lug'at o'sha joyda CommonJS ga o'girib o'qiladi, qo'llanma nomlari matndan olinadi.
const fs = require('fs');
const ts = require('typescript');
const root = path.join(__dirname, '..', '..');
const loadTs = (file) => {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports;
};
const { translations } = loadTs(path.join(root, 'i18n', 'translations.ts'));
const guidesSource = fs.readFileSync(path.join(root, 'components', 'guide', 'guides.ts'), 'utf8');
const APP_GUIDE_IDS = [...new Set([...guidesSource.matchAll(/[^a-zA-Z]id:[ ]*'((?:tour|page-[a-z]+|task-[a-z]+))'/g)].map((m) => m[1]))];

const ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN'];
// Ilovada tarjima lug'atidan o'tmaydigan, kodda yozilgan nomlar
const HARDCODED_LABELS = new Set(['DHP']);

const problems = (check) => KB_SEED.map((a) => { const p = check(a); return p ? `${a.id}: ${p}` : null; }).filter(Boolean);

runTests({
  'mahsulot xaritasi: bo\'lim nomlari ilovadagi nomlar bilan bir xil': async () => {
    for (const lang of ['uz', 'ru']) {
      const known = new Set(Object.values(translations[lang]));
      const missing = [...new Set(Object.values(PRODUCT_PATHS).flatMap((p) => p[lang]))]
        .filter((label) => !known.has(label) && !HARDCODED_LABELS.has(label));
      assert.deepStrictEqual(missing, [], `${lang}: ilovada bunday nom yo'q`);
    }
  },

  'mahsulot xaritasi: qo\'llanma nomlari ilovadagi ro\'yxat bilan bir xil': async () => {
    assert.deepStrictEqual([...GUIDE_IDS].sort(), APP_GUIDE_IDS.sort());
  },

  'maqolalar: yetarli va nomlari takrorlanmaydi': async () => {
    assert.ok(KB_SEED.length >= 60, `maqolalar kam: ${KB_SEED.length}`);
    const ids = KB_SEED.map((a) => a.id);
    assert.deepStrictEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'takror nomlar');
    assert.deepStrictEqual(ids.filter((id) => !ARTICLE_ID_RE.test(id)), [], 'noto\'g\'ri nom');
  },

  'maqolalar: ikki tilda ham sarlavha va matn bor, uzunligi chegarada': async () => {
    assert.deepStrictEqual(problems((a) => {
      for (const f of ['titleUz', 'titleRu', 'bodyUz', 'bodyRu']) if (!String(a[f] || '').trim()) return `${f} bo'sh`;
      if (a.bodyUz.length > BODY_MAX || a.bodyRu.length > BODY_MAX) return 'matn juda uzun';
      if (/[*#`]|<\/?[a-z]/i.test(a.bodyUz + a.bodyRu)) return 'markdown yoki HTML bor';
      return null;
    }), []);
  },

  'maqolalar: tugma va qo\'llanmalar mavjud bo\'limlarga olib boradi': async () => {
    assert.deepStrictEqual(problems((a) => {
      const badPath = (a.paths || []).find((p) => !isPathId(p));
      if (badPath) return `yo'q bo'lim: ${badPath}`;
      if (a.guideId && !isGuideId(a.guideId)) return `yo'q qo'llanma: ${a.guideId}`;
      return null;
    }), []);
  },

  'maqolalar: matndagi "A → B" yo\'llari ilovada bor bo\'limdan boshlanadi': async () => {
    assert.deepStrictEqual(problems((a) => {
      const bad = [...unknownPaths(a.bodyUz), ...unknownPaths(a.bodyRu)];
      return bad.length ? bad.join(' | ') : null;
    }), []);
  },

  'maqolalar: rollar to\'g\'ri va tugma bo\'limi shu rolga ko\'rinadi': async () => {
    assert.deepStrictEqual(problems((a) => {
      if (a.roles === '*') return null;
      if (!Array.isArray(a.roles) || !a.roles.length) return 'rollar bo\'sh';
      const unknown = a.roles.find((r) => !ROLES.includes(r));
      return unknown ? `noma'lum rol: ${unknown}` : null;
    }), []);
  },

  'ruscha matn tarjima qilingan (o\'zbekcha nusxa emas)': async () => {
    assert.deepStrictEqual(problems((a) => (a.bodyRu === a.bodyUz ? 'ruscha matn o\'zbekchaning nusxasi' : null)), []);
    const noCyrillic = problems((a) => (/[а-яё]/i.test(a.bodyRu) ? null : 'ruscha matnda kirill yo\'q'));
    assert.deepStrictEqual(noCyrillic, []);
  },
});
