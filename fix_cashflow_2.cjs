const fs = require('fs');

let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

const start = c.indexOf('const CashFlowPanel');
const end = c.indexOf('const MainTable', start);

if (start !== -1 && end !== -1) {
    let panel = c.slice(start, end);
    // 1. Rename const t = day.totals to const totals = day.totals
    panel = panel.replace('const t = day.totals;', 'const totals = day.totals;');
    
    // 2. Replace all t. properties with totals.
    panel = panel.replace(/t\.openingCash/g, 'totals.openingCash');
    panel = panel.replace(/t\.cashIn/g, 'totals.cashIn');
    panel = panel.replace(/t\.cashInManual/g, 'totals.cashInManual');
    panel = panel.replace(/t\.cashExpense/g, 'totals.cashExpense');
    panel = panel.replace(/t\.refundCash/g, 'totals.refundCash');
    panel = panel.replace(/t\.encashment/g, 'totals.encashment');
    panel = panel.replace(/t\.nonCashIn/g, 'totals.nonCashIn');
    panel = panel.replace(/t\.nonCashExpense/g, 'totals.nonCashExpense');

    c = c.slice(0, start) + panel + c.slice(end);
    fs.writeFileSync('pages/CashBook.tsx', c, 'utf8');
    console.log('Fixed CashFlowPanel duplicate t');
} else {
    console.log('Could not find CashFlowPanel or MainTable');
}
