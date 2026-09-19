const { execSync } = require('child_process');
const original = execSync('git show 2d25bbd^:i18n/translations.ts').toString();
const ruIndex = original.indexOf('ru: {');
const uzBlock = original.slice(0, ruIndex);
console.log('Original UZ has dashboard?', uzBlock.includes('dashboard'));
console.log('Original UZ has quickPatient?', uzBlock.includes('quickPatient'));
