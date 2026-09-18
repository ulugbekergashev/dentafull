const fs = require('fs');

let c = fs.readFileSync('pages/CashBook.tsx', 'utf8');

// Error 1: CashFlowPanel duplicated t
c = c.replace(
    '  const { t } = useLanguage();\r\n    const t = day.totals;',
    '  const { t } = useLanguage();\r\n    const totals = day.totals;'
);
c = c.replace(
    '  const { t } = useLanguage();\n    const t = day.totals;',
    '  const { t } = useLanguage();\n    const totals = day.totals;'
);
// Now we have to replace `t.` with `totals.` ONLY inside CashFlowPanel. 
// But wait, it's easier to just rename the hook: `const { t: translate } = useLanguage();`
// and replace `t('` with `translate('` in CashFlowPanel.
// Let's do that instead! I'll undo the above.

let cb = fs.readFileSync('pages/CashBook.tsx', 'utf8');
cb = cb.replace(
    'const CashFlowPanel: React.FC<{\n    day: ReturnType<typeof buildCashBookDay>;\n    closure: ReturnType<typeof getClosureStatus>;\n    onClose?: () => void;\n}> = ({ day, closure, onClose }) => {\n  const { t } = useLanguage();\n    const t = day.totals;',
    'const CashFlowPanel: React.FC<{\n    day: ReturnType<typeof buildCashBookDay>;\n    closure: ReturnType<typeof getClosureStatus>;\n    onClose?: () => void;\n}> = ({ day, closure, onClose }) => {\n  const { t: translate } = useLanguage();\n    const t = day.totals;'
);
cb = cb.replace(
    'const CashFlowPanel: React.FC<{\r\n    day: ReturnType<typeof buildCashBookDay>;\r\n    closure: ReturnType<typeof getClosureStatus>;\r\n    onClose?: () => void;\r\n}> = ({ day, closure, onClose }) => {\r\n  const { t } = useLanguage();\r\n    const t = day.totals;',
    'const CashFlowPanel: React.FC<{\r\n    day: ReturnType<typeof buildCashBookDay>;\r\n    closure: ReturnType<typeof getClosureStatus>;\r\n    onClose?: () => void;\r\n}> = ({ day, closure, onClose }) => {\r\n  const { t: translate } = useLanguage();\r\n    const t = day.totals;'
);
// replace `t('auto.` with `translate('auto.` in CashFlowPanel
cb = cb.replace(/label={t\('auto\.Kun boshida'\)}/g, "label={translate('auto.Kun boshida')}");
cb = cb.replace(/label={t\('auto\.Naqd tushum'\)}/g, "label={translate('auto.Naqd tushum')}");
cb = cb.replace(/label={t\('auto\.Kassaga solindi'\)}/g, "label={translate('auto.Kassaga solindi')}");
cb = cb.replace(/label={t\('auto\.Naqd xarajat'\)}/g, "label={translate('auto.Naqd xarajat')}");
cb = cb.replace(/label={t\('auto\.Qaytarildi'\)}/g, "label={translate('auto.Qaytarildi')}");
cb = cb.replace(/label={t\('auto\.Inkassatsiya'\)}/g, "label={translate('auto.Inkassatsiya')}");
cb = cb.replace(/\{t\('auto\.Naqd yashik hisobi'\)\}/g, "{translate('auto.Naqd yashik hisobi')}");


// Error 2: unpaidItems duplicated t
cb = cb.replace(
    '    const unpaidItems = useMemo(() => {\n  const { t } = useLanguage();\n        const pendingTx = transactions\n            .filter(t => {\n  const { t } = useLanguage();\n  return t && (t.date || \'\').split(\'T\')[0] === date && t.status !== \'Paid\';\n})',
    '    const unpaidItems = useMemo(() => {\n        const pendingTx = transactions\n            .filter(t => {\n  return t && (t.date || \'\').split(\'T\')[0] === date && t.status !== \'Paid\';\n})'
);
cb = cb.replace(
    '    const unpaidItems = useMemo(() => {\r\n  const { t } = useLanguage();\r\n        const pendingTx = transactions\r\n            .filter(t => {\r\n  const { t } = useLanguage();\r\n  return t && (t.date || \'\').split(\'T\')[0] === date && t.status !== \'Paid\';\r\n})',
    '    const unpaidItems = useMemo(() => {\r\n        const pendingTx = transactions\r\n            .filter(t => {\r\n  return t && (t.date || \'\').split(\'T\')[0] === date && t.status !== \'Paid\';\r\n})'
);

fs.writeFileSync('pages/CashBook.tsx', cb, 'utf8');

console.log('Fixed exactly the 4 duplicate t errors');
