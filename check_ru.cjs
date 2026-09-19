const fs = require('fs');
let c = fs.readFileSync('i18n/translations.ts', 'utf8');

let uzStart = c.indexOf('uz: {');
let ruStart = c.indexOf('ru: {');

let uzBlock = c.slice(uzStart, ruStart);
let ruBlock = c.slice(ruStart);

function findLine(block, keyFragment) {
    const lines = block.split('\n');
    return lines.find(l => l.includes(keyFragment));
}

console.log("UZ auto.To'lov line:", findLine(uzBlock, "auto.To'lov"));
console.log("RU auto.To'lov line:", findLine(ruBlock, "auto.To'lov"));

console.log("UZ auto.Xarajat line:", findLine(uzBlock, "auto.Xarajat"));
console.log("RU auto.Xarajat line:", findLine(ruBlock, "auto.Xarajat"));
