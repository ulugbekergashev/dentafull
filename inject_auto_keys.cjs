const fs = require('fs');

const dict = require('./dict.json');

let uzEntries = [];
let ruEntries = [];

for (const [key, value] of Object.entries(dict)) {
    // Escape single quotes properly
    const safeKey = 'auto.' + key.replace(/'/g, "\\'").replace(/\n/g, ' ');
    const safeUz = key.replace(/'/g, "\\'").replace(/\n/g, ' ');
    const safeRu = value.replace(/'/g, "\\'").replace(/\n/g, ' ');
    
    uzEntries.push(`    '${safeKey}': '${safeUz}',`);
    ruEntries.push(`    '${safeKey}': '${safeRu}',`);
}

let transContent = fs.readFileSync('i18n/translations.ts', 'utf8');

const ruIndex = transContent.indexOf('  ru: {');
if (ruIndex !== -1) {
    const lastCommaUz = transContent.lastIndexOf('  },', ruIndex);
    if (lastCommaUz !== -1) {
        const injectedUz = '\n    // --- AUTO TRANSLATIONS UZ ---\n' + uzEntries.join('\n') + '\n';
        transContent = transContent.slice(0, lastCommaUz) + injectedUz + transContent.slice(lastCommaUz);
    }
}

const endOfFileIndex = transContent.lastIndexOf('};');
if (endOfFileIndex !== -1) {
    const lastCommaRu = transContent.lastIndexOf('  }', endOfFileIndex);
    if (lastCommaRu !== -1) {
        const injectedRu = '\n    // --- AUTO TRANSLATIONS RU ---\n' + ruEntries.join('\n') + '\n';
        transContent = transContent.slice(0, lastCommaRu) + injectedRu + transContent.slice(lastCommaRu);
    }
}

fs.writeFileSync('i18n/translations.ts', transContent, 'utf8');
console.log('Successfully injected auto translations!');
