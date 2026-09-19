const fs = require('fs');

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

let dict = JSON.parse(fs.readFileSync('dict.json', 'utf8'));
let updated = false;

for (const [k, v] of Object.entries(newKeys)) {
    if (!dict[k]) {
        dict[k] = v;
        updated = true;
    }
}

if (updated) {
    fs.writeFileSync('dict.json', JSON.stringify(dict, null, 2), 'utf8');
    console.log('dict.json updated');
} else {
    console.log('No new keys to add');
}
