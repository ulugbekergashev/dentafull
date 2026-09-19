const fs = require('fs');
const ts = require('typescript');
const path = require('path');

function findRawTexts(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const rawTexts = [];

    function visit(node) {
        if (ts.isJsxText(node)) {
            const text = node.getText().trim();
            if (text && /[a-zA-Zа-яА-ЯўғқҳЎҒҚҲ]/.test(text) && !text.includes('{') && !text.includes('}')) {
                rawTexts.push(text);
            }
        } else if (ts.isJsxExpression(node)) {
            // Check for string literals inside JSX expressions, e.g. {'Some text'} or {"Some text"}
            if (node.expression && ts.isStringLiteral(node.expression)) {
                const text = node.expression.text.trim();
                if (text && /[a-zA-Zа-яА-ЯўғқҳЎҒҚҲ]/.test(text)) {
                     rawTexts.push(text);
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return rawTexts;
}

const files = fs.readdirSync('pages').filter(f => f.endsWith('.tsx')).map(f => path.join('pages', f));
let total = 0;
for (const file of files) {
    const raw = findRawTexts(file);
    if (raw.length > 0) {
        console.log(`\n--- ${file} (${raw.length} raw texts) ---`);
        console.log(raw.slice(0, 10).join(', ') + (raw.length > 10 ? ' ...' : ''));
        total += raw.length;
    }
}
console.log(`\nTotal raw texts found: ${total}`);
