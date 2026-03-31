const fs = require('fs');
const content = fs.readFileSync('c:/Users/Hp Vitus Gaming/Desktop/denta7/i18n/translations.ts', 'utf8');

const lines = content.split('\n');
const keysUz = new Set();
const keysRu = new Set();
let currentLang = '';

lines.forEach((line, index) => {
  if (line.includes('uz: {')) currentLang = 'uz';
  if (line.includes('ru: {')) currentLang = 'ru';
  
  const match = line.match(/'([^']+)':/);
  if (match) {
    const key = match[1];
    if (currentLang === 'uz') {
      if (keysUz.has(key)) console.log(`Duplicate UZ key: ${key} at line ${index + 1}`);
      keysUz.add(key);
    } else if (currentLang === 'ru') {
      if (keysRu.has(key)) console.log(`Duplicate RU key: ${key} at line ${index + 1}`);
      keysRu.add(key);
    }
  }
});
