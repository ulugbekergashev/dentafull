const fs = require('fs');
const ts = require('typescript');
const path = require('path');

const targetFiles = process.argv.slice(2);

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    
    let replacements = [];

    function visit(node) {
        if (ts.isJsxText(node)) {
            const text = node.getText();
            const trimmed = text.trim();
            if (trimmed && /[a-zA-Zа-яА-ЯўғқҳЎҒҚҲ]/.test(trimmed) && !trimmed.includes('{') && !trimmed.includes('}')) {
                // Find precise start and end of the trimmed text within the node
                const startOffset = text.indexOf(trimmed);
                const absoluteStart = node.getStart() + startOffset;
                const absoluteEnd = absoluteStart + trimmed.length;
                replacements.push({
                    start: absoluteStart,
                    end: absoluteEnd,
                    original: trimmed,
                    type: 'jsxText'
                });
            }
        } else if (ts.isJsxExpression(node)) {
            if (node.expression && ts.isStringLiteral(node.expression)) {
                const text = node.expression.text;
                const trimmed = text.trim();
                if (trimmed && /[a-zA-Zа-яА-ЯўғқҳЎҒҚҲ]/.test(trimmed)) {
                    // Start and end include the quotes, so node.expression.getStart() is the opening quote.
                    replacements.push({
                        start: node.expression.getStart(),
                        end: node.expression.getEnd(),
                        original: text,
                        type: 'stringLiteral'
                    });
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    
    // Sort descending by start position to avoid offset shifting
    replacements.sort((a, b) => b.start - a.start);
    
    let modified = content;
    let newKeys = new Set();
    let madeChanges = false;
    
    for (const rep of replacements) {
        const safeKey = rep.original.replace(/'/g, "\\'").replace(/\n/g, ' ').replace(/\s+/g, ' ');
        const tCall = `t('auto.${safeKey}')`;
        let replacementString = "";
        
        if (rep.type === 'jsxText') {
            replacementString = `{${tCall}}`;
        } else if (rep.type === 'stringLiteral') {
            replacementString = tCall;
        }
        
        modified = modified.slice(0, rep.start) + replacementString + modified.slice(rep.end);
        newKeys.add(rep.original);
        madeChanges = true;
    }
    
    if (madeChanges) {
        // Ensure useLanguage is imported and t is available
        if (!modified.includes('useLanguage')) {
            // Find last import
            const importMatch = [...modified.matchAll(/^import.*?;/gm)].pop();
            const insertPos = importMatch ? importMatch.index + importMatch[0].length : 0;
            modified = modified.slice(0, insertPos) + "\nimport { useLanguage } from '@/i18n/LanguageContext';" + modified.slice(insertPos);
        }
        
        if (!modified.includes('const { t } = useLanguage()')) {
            // Find component body start
            // This is naive, maybe let's just log if t is missing
            console.log(`[!] Check if 'const { t } = useLanguage();' exists in ${filePath}`);
        }
        
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`Replaced ${replacements.length} strings in ${filePath}`);
    }
    return Array.from(newKeys);
}

let allNewKeys = new Set();
for (const file of targetFiles) {
    const keys = processFile(file);
    for (const k of keys) allNewKeys.add(k);
}

// Dump to a file so we can translate them later
if (allNewKeys.size > 0) {
    const existingRaw = fs.existsSync('extracted_raw.json') ? fs.readFileSync('extracted_raw.json', 'utf8') : '[]';
    let existing = JSON.parse(existingRaw);
    existing = Array.from(new Set([...existing, ...Array.from(allNewKeys)]));
    fs.writeFileSync('extracted_raw.json', JSON.stringify(existing, null, 2), 'utf8');
    console.log(`Extracted ${allNewKeys.size} new keys.`);
}
