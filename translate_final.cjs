const fs = require('fs');
const ts = require('typescript');

let sourceText = fs.readFileSync('pages/CashBook.tsx', 'utf8');

if (!sourceText.includes('import { useLanguage }')) {
    sourceText = "import { useLanguage } from '../../context/LanguageContext';\n" + sourceText;
}


let changed = false;

// 1. Text inside tags >Text<
sourceText = sourceText.replace(/>([А-ЯЁO'G'a-zA-Z0-9][^<]*?[a-zA-Z0-9])</g, (match, p1) => {
    const text = p1.trim();
    if (!text || text.length < 2 || !/[a-zA-Z]/.test(text)) return match;
    if (text.includes('className') || text.includes('=>') || text.includes('={')) return match;
    
    const key = 'auto.' + text;
    
    changed = true;
    return `>{t('${key}')}<`;
});

// 2. Placeholder/title attributes: placeholder="Text"
sourceText = sourceText.replace(/(placeholder|title|label)="([^"]*[a-zA-Z]+[^"]*)"/g, (match, attr, text) => {
    if (!text || text.length < 2) return match;
    const key = 'auto.' + text;
    
    changed = true;
    return `${attr}={t('${key}')}`;
});

if (changed) {
    
}

// AST Injection
const sourceFile = ts.createSourceFile('pages/CashBook.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const positionsToInject = [];

function findAndInject(node) {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        if (node.body) {
            const bodyText = node.body.getText(sourceFile);
            if (bodyText.includes("t('") && !bodyText.includes('useLanguage')) {
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

// Fix duplicates in CashFlowPanel
sourceText = sourceText.replace(
    'const CashFlowPanel: React.FC<{\n    day: ReturnType<typeof buildCashBookDay>;\n    closure: ReturnType<typeof getClosureStatus>;\n    onClose?: () => void;\n}> = ({ day, closure, onClose }) => {\n  const { t } = useLanguage();\n    const t = day.totals;',
    'const CashFlowPanel: React.FC<{\n    day: ReturnType<typeof buildCashBookDay>;\n    closure: ReturnType<typeof getClosureStatus>;\n    onClose?: () => void;\n}> = ({ day, closure, onClose }) => {\n  const { t } = useLanguage();\n    const totals = day.totals;'
);
sourceText = sourceText.replace(
    'const CashFlowPanel: React.FC<{\r\n    day: ReturnType<typeof buildCashBookDay>;\r\n    closure: ReturnType<typeof getClosureStatus>;\r\n    onClose?: () => void;\r\n}> = ({ day, closure, onClose }) => {\r\n  const { t } = useLanguage();\r\n    const t = day.totals;',
    'const CashFlowPanel: React.FC<{\r\n    day: ReturnType<typeof buildCashBookDay>;\r\n    closure: ReturnType<typeof getClosureStatus>;\r\n    onClose?: () => void;\r\n}> = ({ day, closure, onClose }) => {\r\n  const { t } = useLanguage();\r\n    const totals = day.totals;'
);

const cashFlowStart = sourceText.indexOf('const CashFlowPanel');
const cashFlowEnd = sourceText.indexOf('// ── Kunlik xulosalar');
if (cashFlowStart !== -1 && cashFlowEnd !== -1) {
    let panel = sourceText.slice(cashFlowStart, cashFlowEnd);
    panel = panel.replace(/t\.openingCash/g, 'totals.openingCash');
    panel = panel.replace(/t\.cashIn/g, 'totals.cashIn');
    panel = panel.replace(/t\.cashInManual/g, 'totals.cashInManual');
    panel = panel.replace(/t\.cashExpense/g, 'totals.cashExpense');
    panel = panel.replace(/t\.refundCash/g, 'totals.refundCash');
    panel = panel.replace(/t\.encashment/g, 'totals.encashment');
    sourceText = sourceText.slice(0, cashFlowStart) + panel + sourceText.slice(cashFlowEnd);
}

// Fix unpaidItems duplicate t
const unpaidItemsStart = sourceText.indexOf('const unpaidItems = useMemo(() => {');
const unpaidItemsEnd = sourceText.indexOf('// Kassirning kun oxiridagi asosiy savoli');
if (unpaidItemsStart !== -1) {
    let sub = sourceText.slice(unpaidItemsStart, sourceText.indexOf('return [...pendingTx, ...unpaidAppts];', unpaidItemsStart));
    // remove injected t
    sub = sub.replace(/const \{ t \} = useLanguage\(\);\s*/g, '');
    // replace `t =>` with `tx =>` and `t.field` with `tx.field`
    sub = sub.replace(/\.filter\(t => \{/g, '.filter(tx => {');
    sub = sub.replace(/\.map\(t => \(\{/g, '.map(tx => ({');
    sub = sub.replace(/t\./g, 'tx.');
    sub = sub.replace(/tx: t,/g, 'tx: tx,');
    sub = sub.replace(/return tx &&/g, 'return tx &&');
    sourceText = sourceText.slice(0, unpaidItemsStart) + sub + sourceText.slice(sourceText.indexOf('return [...pendingTx, ...unpaidAppts];', unpaidItemsStart));
}

fs.writeFileSync('pages/CashBook.tsx', sourceText, 'utf8');
console.log('Final translate and fix done');
