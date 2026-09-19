const fs = require('fs');

let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

let original = c;

// Fix `() => { const { t } = useLanguage(); return ... }`
// We want to replace it with `() => (...)` or just `() => ...`
c = c.replace(/\{\s*const \{\s*t\s*\}\s*=\s*useLanguage\(\);\s*return\s*(.*?);\s*\}/gs, '$1');

if (c !== original) {
    fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');
    console.log('Fixed hooks in CashBook.tsx');
} else {
    console.log('No hooks needed fixing in CashBook.tsx');
}
