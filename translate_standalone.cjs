const fs = require('fs');
const ts = require('typescript');

let sourceText = fs.readFileSync('pages/CashBook.tsx', 'utf8');

if (!sourceText.includes('import { useLanguage }')) {
    sourceText = "import { useLanguage } from '../../context/LanguageContext';\n" + sourceText;
}

// 1. Text inside tags >Text<
sourceText = sourceText.replace(/>([А-ЯЁO'G'a-zA-Z0-9][^<]*?[a-zA-Z0-9])</g, (match, p1) => {
    const text = p1.trim();
    if (!text || text.length < 2 || !/[a-zA-Z]/.test(text)) return match;
    if (text.includes('className') || text.includes('=>') || text.includes('={')) return match;
    const key = 'auto.' + text.replace(/`/g, "'");
    return `>{t(\`${key}\`)}<`;
});

// 2. Placeholder/title attributes: placeholder="Text"
sourceText = sourceText.replace(/(placeholder|title|label)="([^"]*[a-zA-Z]+[^"]*)"/g, (match, attr, text) => {
    if (!text || text.length < 2) return match;
    const key = 'auto.' + text.replace(/`/g, "'");
    return `${attr}={t(\`${key}\`)}`;
});

// AST Injection
const sourceFile = ts.createSourceFile('pages/CashBook.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const positionsToInject = [];

function findAndInject(node) {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        if (node.body) {
            const bodyText = node.body.getText(sourceFile);
            if ((bodyText.includes("t('") || bodyText.includes("t(`")) && !bodyText.includes('useLanguage')) {
                if (ts.isBlock(node.body)) {
                    positionsToInject.push(node.body.getStart(sourceFile) + 1);
                } else if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
                    positionsToInject.push({ type: 'wrap', start: node.body.getStart(sourceFile), end: node.body.getEnd() });
                }
            }
        }
    }
    ts.forEachChild(node, findAndInject);
}

findAndInject(sourceFile);
positionsToInject.sort((a, b) => {
    const posA = typeof a === 'number' ? a : a.start;
    const posB = typeof b === 'number' ? b : b.start;
    return posB - posA;
});

for (const pos of positionsToInject) {
    if (typeof pos === 'number') {
        sourceText = sourceText.slice(0, pos) + '\n  const { t } = useLanguage();' + sourceText.slice(pos);
    } else {
        const bodyStr = sourceText.slice(pos.start, pos.end);
        const wrapped = `{\n  const { t } = useLanguage();\n  return ${bodyStr};\n}`;
        sourceText = sourceText.slice(0, pos.start) + wrapped + sourceText.slice(pos.end);
    }
}

// CashFlowPanel fix - replace ALL t references with totals between CashFlowPanel and next section
const cashFlowStart = sourceText.indexOf('const CashFlowPanel');
const cashFlowEnd = sourceText.indexOf('// ── Kunlik xulosalar');
if (cashFlowStart !== -1 && cashFlowEnd !== -1) {
    let panel = sourceText.slice(cashFlowStart, cashFlowEnd);
    panel = panel.replace(/const t = day\.totals;/g, 'const totals = day.totals;');
    panel = panel.replace(/t\.openingCash/g, 'totals.openingCash');
    panel = panel.replace(/t\.cashIn/g, 'totals.cashIn');
    panel = panel.replace(/t\.cashInManual/g, 'totals.cashInManual');
    panel = panel.replace(/t\.cashExpense/g, 'totals.cashExpense');
    panel = panel.replace(/t\.refundCash/g, 'totals.refundCash');
    panel = panel.replace(/t\.encashment/g, 'totals.encashment');
    panel = panel.replace(/t\.nonCashIn/g, 'totals.nonCashIn');
    panel = panel.replace(/t\.nonCashExpense/g, 'totals.nonCashExpense');
    sourceText = sourceText.slice(0, cashFlowStart) + panel + sourceText.slice(cashFlowEnd);
}

// unpaidItems fix
const unpaidItemsStart = sourceText.indexOf('const unpaidItems = useMemo(() => {');
const unpaidItemsEnd = sourceText.indexOf('return [...pendingTx, ...unpaidAppts];', unpaidItemsStart);
if (unpaidItemsStart !== -1 && unpaidItemsEnd !== -1) {
    let sub = sourceText.slice(unpaidItemsStart, unpaidItemsEnd);
    sub = sub.replace(/const \{ t \} = useLanguage\(\);\s*/g, '');
    sub = sub.replace(/\.filter\(t => \{/g, '.filter(tx => {');
    sub = sub.replace(/\.map\(t => \(\{/g, '.map(tx => ({');
    sub = sub.replace(/t\.date/g, 'tx.date');
    sub = sub.replace(/t\.status/g, 'tx.status');
    sub = sub.replace(/t\.id/g, 'tx.id');
    sub = sub.replace(/t\.patientName/g, 'tx.patientName');
    sub = sub.replace(/t\.patientId/g, 'tx.patientId');
    sub = sub.replace(/t\.doctorName/g, 'tx.doctorName');
    sub = sub.replace(/t\.doctorId/g, 'tx.doctorId');
    sub = sub.replace(/t\.service/g, 'tx.service');
    sub = sub.replace(/t\.amount/g, 'tx.amount');
    sub = sub.replace(/tx: t,/g, 'tx: tx,');
    sub = sub.replace(/return t &&/g, 'return tx &&');
    sourceText = sourceText.slice(0, unpaidItemsStart) + sub + sourceText.slice(unpaidItemsEnd);
}

// deduplicate t everywhere else just in case
sourceText = sourceText.replace(/const \{ t \} = useLanguage\(\);\s*const \{ t \} = useLanguage\(\);/g, 'const { t } = useLanguage();');

fs.writeFileSync('pages/CashBook.tsx', sourceText, 'utf8');
console.log('Translated and fixed!');
