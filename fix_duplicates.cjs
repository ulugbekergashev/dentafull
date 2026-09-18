const fs = require('fs');

let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

// CashFlowPanel fix
c = c.replace(
    'const CashFlowPanel: React.FC<{\n    day: ReturnType<typeof buildCashBookDay>;\n    closure: ReturnType<typeof getClosureStatus>;\n    onClose?: () => void;\n}> = ({ day, closure, onClose }) => {\n  const { t } = useLanguage();\n    const t = day.totals;',
    'const CashFlowPanel: React.FC<{\n    day: ReturnType<typeof buildCashBookDay>;\n    closure: ReturnType<typeof getClosureStatus>;\n    onClose?: () => void;\n}> = ({ day, closure, onClose }) => {\n  const { t } = useLanguage();\n    const totals = day.totals;'
);
c = c.replace(
    'const CashFlowPanel: React.FC<{\r\n    day: ReturnType<typeof buildCashBookDay>;\r\n    closure: ReturnType<typeof getClosureStatus>;\r\n    onClose?: () => void;\r\n}> = ({ day, closure, onClose }) => {\r\n  const { t } = useLanguage();\r\n    const t = day.totals;',
    'const CashFlowPanel: React.FC<{\r\n    day: ReturnType<typeof buildCashBookDay>;\r\n    closure: ReturnType<typeof getClosureStatus>;\r\n    onClose?: () => void;\r\n}> = ({ day, closure, onClose }) => {\r\n  const { t } = useLanguage();\r\n    const totals = day.totals;'
);

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

// unpaidItems fix
const unpaidItemsStart = c.indexOf('const unpaidItems = useMemo(() => {');
const unpaidItemsEnd = c.indexOf('return [...pendingTx, ...unpaidAppts];', unpaidItemsStart);
if (unpaidItemsStart !== -1) {
    let sub = c.slice(unpaidItemsStart, unpaidItemsEnd);
    // remove injected t
    sub = sub.replace(/const \{ t \} = useLanguage\(\);\s*/g, '');
    // replace `t =>` with `tx =>` and `t.` with `tx.`
    sub = sub.replace(/\.filter\(t => \{/g, '.filter(tx => {');
    sub = sub.replace(/\.map\(t => \(\{/g, '.map(tx => ({');
    sub = sub.replace(/t\./g, 'tx.');
    sub = sub.replace(/tx: t,/g, 'tx: tx,');
    sub = sub.replace(/return tx &&/g, 'return tx &&');
    c = c.slice(0, unpaidItemsStart) + sub + c.slice(unpaidItemsEnd);
}

// deduplicate t everywhere else just in case
c = c.replace(/const \{ t \} = useLanguage\(\);\s*const \{ t \} = useLanguage\(\);/g, 'const { t } = useLanguage();');

fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');
console.log('Fixed duplicates in CashBook');
