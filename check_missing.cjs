const fs = require('fs');
const ts = require('typescript');
const trans = require('./i18n/translations.ts').translations; // wait, this will fail due to ESM.
