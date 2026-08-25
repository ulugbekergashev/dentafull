// ─── Javob sifati: deterministik tekshiruvlar ─────────────────────────────────
//
// Etalon to'plam ilgari faqat MAZMUNNI o'lchardi: to'g'ri tool chaqirildimi,
// kerakli raqam javobda bormi. Lekin javob to'g'ri bo'lib turib, o'qib
// bo'lmaydigan holatda chiqishi mumkin — va aynan shu holat foydalanuvchiga
// birinchi bo'lib ko'rinadi:
//
//   • `<think>` qoldig'i — model ichki fikrlashi javobga chiqib ketgan;
//   • markdown belgilari — UI ularni parse qilmaydi, xom holda ko'rinadi;
//   • ruscha yoki inglizcha so'zlar o'zbekcha javob ichida.
//
// Oxirgisi eng muhimi: o'zbek tilida ishonchli ishlash — bu bozordagi asosiy
// ustunlik, lekin u hozirgacha BIR MARTALIK qo'lda sinovga tayangan edi.
// O'lchov mexanizmi bo'lmasa, model almashtirilganda tilning buzilgani
// sezilmay qolardi. Endi har bir javob shu tekshiruvdan o'tadi.

export type Lang = 'uz' | 'ru';

export interface QualityIssue {
    code: 'think' | 'markdown' | 'wrong_lang' | 'english' | 'empty';
    detail: string;
}

/**
 * Ingliz tilining eng keng tarqalgan xizmatchi so'zlari.
 *
 * Ataylab shular: ular o'zbekcha yoki ruscha matnda tasodifan uchramaydi,
 * lekin model ingliz tiliga o'tib ketsa — birinchi qatorda paydo bo'ladi.
 * Atama sifatida kiradigan so'zlar (implant, kabinet) ro'yxatga KIRMAYDI.
 */
const ENGLISH_MARKERS = [
    'the', 'and', 'is', 'are', 'was', 'were', 'your', 'you', 'here', 'there',
    'this', 'that', 'with', 'from', 'have', 'has', 'please', 'based', 'total',
    'appointments', 'revenue', 'patients', 'today', 'according',
];

const CYRILLIC_RE = new RegExp('[\\u0400-\\u04FF]');
const LATIN_WORD_RE = /[a-z']+/gi;

/**
 * Javobni tekshiradi. Bo'sh massiv = muammo yo'q.
 *
 * @param reply modelning javobi (server tozalagandan KEYINGI holati)
 * @param lang  kutilgan til
 */
export const checkQuality = (reply: string, lang: Lang): QualityIssue[] => {
    const issues: QualityIssue[] = [];
    const text = String(reply || '');

    if (text.trim().length < 5) {
        issues.push({ code: 'empty', detail: 'javob bo\'sh yoki juda qisqa' });
        return issues;
    }

    // 1. Ichki fikrlash qoldig'i. Server `stripReasoning` bilan tozalaydi,
    //    ya'ni bu yerda topilsa — tozalash ishlamayapti degani.
    if (/<\/?think>/i.test(text)) {
        issues.push({ code: 'think', detail: '<think> tegi qolgan' });
    }

    // 2. Markdown. UI matnni whitespace-pre-wrap bilan chizadi, parse qilmaydi.
    const md: string[] = [];
    if (/\*\*/.test(text)) md.push('**');
    if (/^#{1,6}\s/m.test(text)) md.push('##');
    if (/^\s*\|.*\|/m.test(text)) md.push('jadval');
    if (md.length) {
        issues.push({ code: 'markdown', detail: `markdown qoldi: ${md.join(', ')}` });
    }

    // 3. Til. O'zbekcha javobda kirill alifbosi bo'lmasligi kerak va aksincha.
    if (lang === 'uz' && CYRILLIC_RE.test(text)) {
        const sample = (text.match(new RegExp('[\\u0400-\\u04FF]+', 'g')) || []).slice(0, 3).join(', ');
        issues.push({ code: 'wrong_lang', detail: `o'zbekcha javobda kirill: ${sample}` });
    }
    if (lang === 'ru' && !CYRILLIC_RE.test(text)) {
        issues.push({ code: 'wrong_lang', detail: 'ruscha javob kutilgan, kirill yo\'q' });
    }

    // 4. Ingliz tiliga o'tish. Bitta so'z tasodif bo'lishi mumkin —
    //    ikkitasi allaqachon naqsh.
    const words = (text.toLowerCase().match(LATIN_WORD_RE) || []);
    const hits = Array.from(new Set(words.filter(w => ENGLISH_MARKERS.includes(w))));
    if (hits.length >= 2) {
        issues.push({ code: 'english', detail: `inglizcha so'zlar: ${hits.slice(0, 5).join(', ')}` });
    }

    return issues;
};
