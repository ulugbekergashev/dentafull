const fs = require('fs');

const file = 'i18n/translations.ts';
let content = fs.readFileSync(file, 'utf8');

const newKeys = {
    "To'lov": "Оплата",
    "Xarajat": "Расход",
    "Inkassatsiya": "Инкассация",
    "Qaytarish": "Возврат",
    "Kun": "День",
    "Oy": "Месяц",
    "Excel": "Excel",
    "Kunni yopish": "Закрыть смену",
    "Kassaga qancha pul kirdi va qancha qoldi": "Сколько денег поступило и сколько осталось",
    "Qancha ishlab topdik — foyda, qarz, shifokor ulushi": "Сколько мы заработали — прибыль, долги, доля врача",
    "Kassa": "Касса",
    "Hisobot": "Отчет"
};

let uzMatch = content.match(/uz:\s*\{/);
let ruMatch = content.match(/ru:\s*\{/);

if (uzMatch && ruMatch) {
    let ruStartIndex = ruMatch.index;
    let uzEndIndex = content.lastIndexOf('}', ruStartIndex);
    let ruEndIndex = content.lastIndexOf('}');
    
    let uzLines = [];
    let ruLines = [];
    
    for (const [k, v] of Object.entries(newKeys)) {
        const keyStr = `'auto.${k.replace(/'/g, "\\'")}'`;
        uzLines.push(`    ${keyStr}: "${k.replace(/"/g, '\\"')}",`);
        ruLines.push(`    ${keyStr}: "${v.replace(/"/g, '\\"')}",`);
    }
    
    let modified = content;
    
    // Inject RU first to not mess up UZ index
    modified = modified.slice(0, ruEndIndex) + ruLines.join('\n') + '\n  ' + modified.slice(ruEndIndex);
    
    // Recalculate uzEndIndex in the modified string
    let newRuMatch = modified.match(/ru:\s*\{/);
    let newUzEndIndex = modified.lastIndexOf('}', newRuMatch.index);
    modified = modified.slice(0, newUzEndIndex) + uzLines.join('\n') + '\n  ' + modified.slice(newUzEndIndex);
    
    fs.writeFileSync(file, modified, 'utf8');
    console.log('Successfully injected translations!');
} else {
    console.log('Failed to find uz or ru block');
}
