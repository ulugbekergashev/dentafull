const fs = require('fs');

const dict = JSON.parse(fs.readFileSync('dict.json', 'utf8'));
let transContent = fs.readFileSync('i18n/translations.ts', 'utf8');

let uzEntries = [];
let ruEntries = [];

for (const [key, value] of Object.entries(dict)) {
    // key is Uzbek, value is Russian
    const safeKey = 'auto.' + key.replace(/'/g, "\\'").replace(/\n/g, ' ');
    const safeUz = key.replace(/'/g, "\\'").replace(/\n/g, ' ');
    const safeRu = value.replace(/'/g, "\\'").replace(/\n/g, ' ');
    
    uzEntries.push(`    '${safeKey}': '${safeUz}',`);
    ruEntries.push(`    '${safeKey}': '${safeRu}',`);
}

// In transContent, find the end of the `uz` block.
// The `ru:` block starts somewhere. We can inject right before `  ru: {`
const ruIndex = transContent.indexOf('  ru: {');
if (ruIndex !== -1) {
    // Find the closing brace of `uz: {` which is right before `ru: {`
    // It should be something like `  },`
    const lastCommaUz = transContent.lastIndexOf('  },', ruIndex);
    if (lastCommaUz !== -1) {
        const injectedUz = '\n    // --- AUTO INJECTED UZ ---\n' + uzEntries.join('\n') + '\n';
        transContent = transContent.slice(0, lastCommaUz) + injectedUz + transContent.slice(lastCommaUz);
    }
}

// Now find the end of `ru` block.
// We can just inject right before the end of the `translations` object, which is `};\n\nexport type Language`
const endOfRu = transContent.indexOf('};\n\nexport type Language');
if (endOfRu !== -1) {
    const lastCommaRu = transContent.lastIndexOf('  }', endOfRu);
    if (lastCommaRu !== -1) {
        const injectedRu = '\n    // --- AUTO INJECTED RU ---\n' + ruEntries.join('\n') + '\n';
        transContent = transContent.slice(0, lastCommaRu) + injectedRu + transContent.slice(lastCommaRu);
    }
}

fs.writeFileSync('i18n/translations.ts', transContent, 'utf8');
console.log('Successfully injected auto translations!');
