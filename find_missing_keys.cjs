const fs = require('fs');
const ts = require('typescript');

const sourceCode = fs.readFileSync('i18n/translations.ts', 'utf8');
const sourceFile = ts.createSourceFile('translations.ts', sourceCode, ts.ScriptTarget.Latest, true);

let uzKeys = new Set();
let ruKeys = new Set();
let ruEntriesObj = {};

function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name && ts.isIdentifier(node.name) && node.name.text === 'uz') {
        node.initializer.properties.forEach(prop => {
            if (ts.isPropertyAssignment(prop) || ts.isStringLiteral(prop.name)) {
                let k = prop.name.text || (prop.name.escapedText);
                if (k) uzKeys.add(k);
            }
        });
    }
    if (ts.isPropertyAssignment(node) && node.name && ts.isIdentifier(node.name) && node.name.text === 'ru') {
        node.initializer.properties.forEach(prop => {
            if (ts.isPropertyAssignment(prop) || ts.isStringLiteral(prop.name)) {
                let k = prop.name.text || (prop.name.escapedText);
                if (k) {
                    ruKeys.add(k);
                    if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
                        ruEntriesObj[k] = prop.initializer.text;
                    }
                }
            }
        });
    }
    ts.forEachChild(node, visit);
}

visit(sourceFile);

let missingInUz = {};
for (let k of ruKeys) {
    if (!uzKeys.has(k)) {
        missingInUz[k] = ruEntriesObj[k];
    }
}

fs.writeFileSync('missing_in_uz.json', JSON.stringify(missingInUz, null, 2), 'utf8');
console.log('Found missing keys:', Object.keys(missingInUz).length);
