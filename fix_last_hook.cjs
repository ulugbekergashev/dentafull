const fs = require('fs');
let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

c = c.replace(/\{\s*day\.movements\.map\(m => \{\s*const \{\s*t\s*\}\s*=\s*useLanguage\(\);\s*const isOut = m\.type/s, 
              '{day.movements.map(m => {\n                                    const isOut = m.type');

fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');
console.log('Fixed last hook again');
