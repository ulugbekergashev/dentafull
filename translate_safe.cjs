const fs = require('fs');

function translateFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('import { useLanguage }')) {
        content = "import { useLanguage } from '../../context/LanguageContext';\n" + content;
    }

    const dict = require('./i18n/dict.json');
    let changed = false;

    // Use backticks for t(`...`) to avoid single quote breakages in Uzbek like o'zgargan
    // 1. Text inside tags >Text<
    content = content.replace(/>([А-ЯЁO'G'a-zA-Z0-9][^<]*?[a-zA-Z0-9])</g, (match, p1) => {
        const text = p1.trim();
        if (!text || text.length < 2 || !/[a-zA-Z]/.test(text)) return match;
        if (text.includes('className') || text.includes('=>') || text.includes('={')) return match;
        
        const key = 'auto.' + text.replace(/`/g, "'");
        dict[key] = text;
        changed = true;
        return `>{t(\`${key}\`)}<`;
    });

    // 2. Placeholder/title attributes: placeholder="Text"
    content = content.replace(/(placeholder|title|label)="([^"]*[a-zA-Z]+[^"]*)"/g, (match, attr, text) => {
        if (!text || text.length < 2) return match;
        const key = 'auto.' + text.replace(/`/g, "'");
        dict[key] = text;
        changed = true;
        return `${attr}={t(\`${key}\`)}`;
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        fs.writeFileSync('./i18n/dict.json', JSON.stringify(dict, null, 2), 'utf8');
        console.log(`Translated ${filePath}`);
    }
}

translateFile('pages/CashBook.tsx');
