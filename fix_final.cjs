const fs = require('fs');
let c = fs.readFileSync('pages/CashBook.tsx', 'utf8').split('\n');

// 1. Fix lines 231-232: CashFlowPanel `const t = day.totals;`
// We will replace `const t = day.totals;` with `const totals = day.totals;`
// And we also must replace `t.` with `totals.` in the subsequent lines (242-255).
for (let i = 230; i < 260; i++) {
    if (c[i] && c[i].includes('const t = day.totals;')) {
        c[i] = c[i].replace('const t = day.totals;', 'const totals = day.totals;');
    }
    if (c[i] && c[i].includes('t.openingCash')) c[i] = c[i].replace(/t\.openingCash/g, 'totals.openingCash');
    if (c[i] && c[i].includes('t.cashIn')) c[i] = c[i].replace(/t\.cashIn/g, 'totals.cashIn');
    if (c[i] && c[i].includes('t.cashInManual')) c[i] = c[i].replace(/t\.cashInManual/g, 'totals.cashInManual');
    if (c[i] && c[i].includes('t.cashExpense')) c[i] = c[i].replace(/t\.cashExpense/g, 'totals.cashExpense');
    if (c[i] && c[i].includes('t.refundCash')) c[i] = c[i].replace(/t\.refundCash/g, 'totals.refundCash');
    if (c[i] && c[i].includes('t.encashment')) c[i] = c[i].replace(/t\.encashment/g, 'totals.encashment');
}
for (let i = 270; i < 290; i++) {
    if (c[i] && c[i].includes('t.nonCashIn')) c[i] = c[i].replace(/t\.nonCashIn/g, 'totals.nonCashIn');
    if (c[i] && c[i].includes('t.nonCashExpense')) c[i] = c[i].replace(/t\.nonCashExpense/g, 'totals.nonCashExpense');
    // Also openingCash again
    if (c[i] && c[i].includes('t.openingCash')) c[i] = c[i].replace(/t\.openingCash/g, 'totals.openingCash');
}

// 2. Fix lines 712-717: unpaidItems
// Line 714: `.filter(t => {` to `.filter(tx => {`
// Line 715: `const { t } = useLanguage();` to `` (delete)
// Line 716: `return t && (tx.date || '').split('T')[0] === date && tx.status !== 'Paid';` to `return tx && (tx.date || '').split('T')[0] === date && tx.status !== 'Paid';`
for (let i = 711; i < 718; i++) {
    if (c[i] && c[i].includes('.filter(t => {')) {
        c[i] = c[i].replace('.filter(t => {', '.filter(tx => {');
    }
    if (c[i] && c[i].includes('const { t } = useLanguage();') && i > 713) { // line 715
        c[i] = ''; // remove inner injected t
    }
    if (c[i] && c[i].includes('return t &&')) {
        c[i] = c[i].replace('return t &&', 'return tx &&');
    }
}

fs.writeFileSync('pages/CashBook.tsx', c.join('\n'), 'utf8');
console.log('Fixed using robust line replacements');
