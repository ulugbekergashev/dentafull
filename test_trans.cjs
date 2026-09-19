require('ts-node').register();
const t = require('./i18n/translations.ts').translations;
console.log(Object.keys(t));
console.log('uz quickPatient:', t.uz['dashboard.quickPatient']);
console.log('uz header.search:', t.uz['header.search']);
console.log('uz auto.Tolov:', t.uz["auto.To'lov"]);
