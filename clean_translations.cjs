const fs = require('fs');

let content = fs.readFileSync('i18n/translations.ts', 'utf8');

let lines = content.split('\n');
let modified = [];
let seenKeys = new Set();
let currentBlock = null;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // detect block start
    if (line.match(/^\s*uz:\s*\{/)) {
        currentBlock = 'uz';
        seenKeys.clear();
        modified.push(line);
        continue;
    } else if (line.match(/^\s*ru:\s*\{/)) {
        currentBlock = 'ru';
        seenKeys.clear();
        modified.push(line);
        continue;
    }
    
    if (currentBlock && line.match(/^\s*'(.*)':\s*['"]/)) {
        let match = line.match(/^\s*'(.*)':\s*['"]/);
        let key = match[1];
        
        if (seenKeys.has(key)) {
            // duplicate! comment it out
            // wait, just remove the line completely so we don't have messy comments
            // modified.push('// DUPLICATE: ' + line);
        } else {
            seenKeys.add(key);
            modified.push(line);
        }
    } else {
        modified.push(line);
    }
}

fs.writeFileSync('i18n/translations.ts', modified.join('\n'), 'utf8');
console.log('Removed duplicates from translations.ts');
