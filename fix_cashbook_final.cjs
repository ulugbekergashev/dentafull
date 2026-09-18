const fs = require('fs');
let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

// 1. Fix CashFlowPanel duplicate t
c = c.replace(
    'const t = day.totals;',
    'const totals = day.totals;'
);
// In CashFlowPanel, replace `t.` with `totals.`
const cashFlowStart = c.indexOf('const CashFlowPanel');
const cashFlowEnd = c.indexOf('// ── Kunlik xulosalar');
if (cashFlowStart !== -1 && cashFlowEnd !== -1) {
    let panel = c.slice(cashFlowStart, cashFlowEnd);
    panel = panel.replace(/t\.openingCash/g, 'totals.openingCash');
    panel = panel.replace(/t\.cashIn/g, 'totals.cashIn');
    panel = panel.replace(/t\.cashInManual/g, 'totals.cashInManual');
    panel = panel.replace(/t\.cashExpense/g, 'totals.cashExpense');
    panel = panel.replace(/t\.refundCash/g, 'totals.refundCash');
    panel = panel.replace(/t\.encashment/g, 'totals.encashment');
    c = c.slice(0, cashFlowStart) + panel + c.slice(cashFlowEnd);
}

// 2. Fix unpaidItems duplicate t
// unpaidItems has:
//        const pendingTx = transactions
//            .filter(t => {
//  const { t } = useLanguage();
//  return t && (t.date || '').split('T')[0] === date && t.status !== 'Paid';
//})
// Let's replace the .filter block!
c = c.replace(
    /const pendingTx = transactions\s*\.filter\(t => \{\s*const \{ t \} = useLanguage\(\);\s*return t && \(t\.date \|\| ''\)\.split\('T'\)\[0\] === date && t\.status !== 'Paid';\s*\}\)/,
    "const pendingTx = transactions.filter(tx => tx && (tx.date || '').split('T')[0] === date && tx.status !== 'Paid')"
);

// We should also replace the `.map` if it has duplicate `t` issue, but `t` is shadowed there too.
c = c.replace(
    /\.map\(t => \(\{/g,
    ".map(tx => ({"
);
c = c.replace(/t\.id/g, 'tx.id');
c = c.replace(/t\.patientName/g, 'tx.patientName');
c = c.replace(/t\.patientId/g, 'tx.patientId');
c = c.replace(/t\.doctorName/g, 'tx.doctorName');
c = c.replace(/t\.doctorId/g, 'tx.doctorId');
c = c.replace(/t\.service/g, 'tx.service');
c = c.replace(/t\.amount/g, 'tx.amount');
c = c.replace(/tx: t,/g, 'tx: tx,');

fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');

// Also remove `const { t } = useLanguage();` from `const unpaidItems = useMemo(() => {` block if it was injected there.
let cb2 = fs.readFileSync('pages/CashBook.tsx', 'utf8');
cb2 = cb2.replace(
    /const unpaidItems = useMemo\(\(\) => \{\s*const \{ t \} = useLanguage\(\);/,
    'const unpaidItems = useMemo(() => {'
);
fs.writeFileSync('pages/CashBook.tsx', cb2, 'utf8');

console.log('Fixed CashBook exactly');
