const fs = require('fs');
let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

c = c.replace('if (tx) openEdit(tx)}', 'if (tx) openEdit(tx); }}');

fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');
console.log('Fixed syntax error');
