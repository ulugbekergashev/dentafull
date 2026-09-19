const fs = require('fs');
let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

c = c.replace(/setIsPaymentOpen\(true\)\r?\n\s*\}\}/, 'setIsPaymentOpen(true);\n                                                }\n                                            }}');

fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');
console.log('Fixed syntax error 2');
