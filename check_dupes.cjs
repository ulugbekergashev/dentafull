const fs = require('fs');
const content = fs.readFileSync('i18n/translations.ts', 'utf8');

// just look at all keys in uz block
let uzMatch = content.match(/uz:\s*\{/);
if (uzMatch) {
    let ruMatch = content.match(/ru:\s*\{/);
    let uzStr = content.substring(uzMatch.index, ruMatch.index);
    let keys = [];
    let lines = uzStr.split('\n');
    let dupes = new Set();
    for(let i=0; i<lines.length; i++) {
        let match = lines[i].match(/^\s*'([^']+)':/);
        if (match) {
            let key = match[1];
            if (keys.includes(key)) {
                console.log(`Duplicate key found at line ${i}: ${key}`);
                dupes.add(key);
            }
            keys.push(key);
        }
    }
    console.log(`Found ${dupes.size} duplicates`);
}
