// ─── Ovoz tanish sifatini o'lchash ────────────────────────────────────────────
//
//   npx ts-node ai/evals/stt.ts                                # mavjud provayderlar
//   npx ts-node ai/evals/stt.ts --provider gemini              # bittasi
//   npx ts-node ai/evals/stt.ts --model gemini-3.5-transcribe  # nomzod model
//   npx ts-node ai/evals/stt.ts --key AIza...                  # kalitni qo'lda berish
//   npx ts-node ai/evals/stt.ts --lang ru
//   npx ts-node ai/evals/stt.ts --verbose
//
// NEGA KERAK: ovoz tanish yagona joy edi, uni almashtirish o'lchovsiz
// qilinardi. Savol-javob uchun etalon to'plam bor (run.ts, 54 savol), ovoz
// uchun esa faqat izohdagi uch qatorlik qo'lda o'lchov qolgan edi —
// shuning uchun har bir model o'zgarishi taxminga tayanardi.
//
// Ovoz EdgeTTS bilan sintez qilinadi (uz-UZ-MadinaNeural) — server.ts dagi
// /api/tts bilan bir xil manba. Ya'ni bu jonli mikrofon emas: haqiqiy
// nutqda shovqin, aksent va tezlik bor. Bu skript REGRESSIYANI ushlaydi,
// mutlaq sifatni kafolatlamaydi.
//
// Baza CHAQIRILMAYDI. Kalit kerak: GEMINI_API_KEY yoki GROQ_API_KEY.

require('dotenv').config();

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
};
const VERBOSE = argv.includes('--verbose');

// --model: nomzodni sinash. speech.ts model nomini HAR chaqiruvda env dan
// o'qiydi, shuning uchun bu shunchaki ishlaydi — lekin faqat require'dan
// oldin qo'yilgan bo'lsa ham xavfsiz.
const MODEL = flag('model');
if (MODEL) {
    if (MODEL.startsWith('gemini')) process.env.GEMINI_STT_MODEL = MODEL;
    else process.env.STT_MODEL = MODEL;
}

const KEY = flag('key');
if (KEY) {
    // Kalit shaklidan provayderni taxmin qilamiz: Gemini kalitlari "AIza"
    // bilan, Groq'niki "gsk_" bilan boshlanadi.
    if (KEY.startsWith('gsk_')) process.env.GROQ_API_KEY = KEY;
    else process.env.GEMINI_API_KEY = KEY;
}

const { transcribe, sttTargets } = require('../speech');

// ─── Sinov gaplari ───────────────────────────────────────────────────────────
//
// Uchtasi ataylab izohdagi 2026-08 o'lchovidan olindi — natijani o'sha
// bazaviy qiymat bilan bevosita solishtirish uchun. Qolganlari eng ko'p
// buziladigan turlarni qamraydi: ism, summa va klinika atamasi.
interface Case {
    lang: 'uz' | 'ru';
    text: string;
    /** Aynan shu so'zlar buzilmasligi kerak — ball shundan hisoblanadi. */
    kalit: string[];
}

const CASES: Case[] = [
    { lang: 'uz', text: 'Qarzdorlarga eslatma yubor', kalit: ['qarzdorlarga', 'eslatma', 'yubor'] },
    {
        lang: 'uz',
        text: 'Asror Kamolovga besh yuz ming so\'m to\'lov qo\'sh',
        kalit: ['asror', 'kamolovga', 'besh', 'yuz', 'ming', 'to\'lov'],
    },
    {
        lang: 'uz',
        text: 'Dilnoza Rahimovani ertaga soat o\'n birga qabulga yoz',
        kalit: ['dilnoza', 'rahimovani', 'ertaga', 'birga', 'qabulga'],
    },
    {
        lang: 'uz',
        text: 'Bu bemorga plomba va tish toshini olish xizmati qo\'shildi',
        kalit: ['bemorga', 'plomba', 'tish', 'toshini', 'xizmati'],
    },
    {
        lang: 'ru',
        text: 'Запиши Алиева к врачу Рахимову на завтра',
        kalit: ['алиева', 'врачу', 'рахимову', 'завтра'],
    },
];

/** Klinika lug'ati — haqiqiy ish sharoitini taqlid qiladi (ai/context.ts). */
const VOCAB = [
    'Dilnoza Rahimova', 'Asror Kamolov', 'Sardor Toshmatov',
    'plomba', 'tish toshini olish', 'implantatsiya', 'koronka',
    'kanal davolash', 'gigiyena', 'oqartirish',
].join(', ');

// ─── Ovoz sintezi ────────────────────────────────────────────────────────────

const VOICES: Record<string, string> = {
    uz: 'uz-UZ-MadinaNeural',
    ru: 'ru-RU-SvetlanaNeural',
};

const synth = async (text: string, lang: 'uz' | 'ru'): Promise<Buffer> => {
    const { EdgeTTS } = require('@andresaya/edge-tts');
    const tts = new EdgeTTS();
    await tts.synthesize(text, VOICES[lang]);
    return tts.toBuffer();
};

// ─── Ball ────────────────────────────────────────────────────────────────────

/**
 * Kalit so'zlarning nechtasi tanildi.
 *
 * Butun gapni belgi-belgi solishtirish yaramaydi: model tinish belgisi
 * qo'shsa yoki bosh harfni o'zgartirsa ball tushib ketardi, ma'no esa
 * buzilmagan bo'ladi. Ahamiyatlisi — ISM, SUMMA va ATAMA joyida turishi;
 * aynan shular buzilganda buyruq noto'g'ri bajarilardi.
 */
const score = (got: string, kalit: string[]): { hit: number; miss: string[] } => {
    // Apostrof brauzer, model va klaviaturada uch xil ko'rinishda keladi
    // (' ' ʻ) — ularni bir shaklga keltirmasak "so'm" hech qachon mos
    // kelmasdi.
    const norm = (s: string) => s.toLowerCase()
        .replace(/[‘’ʻʼ`´]/g, "'")
        .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const hay = norm(got);
    const miss = kalit.filter(k => !hay.includes(norm(k)));
    return { hit: kalit.length - miss.length, miss };
};

// ─── Ishga tushirish ─────────────────────────────────────────────────────────

const run = async () => {
    const onlyLang = flag('lang');
    const onlyProvider = flag('provider');

    let targets = sttTargets(null);
    if (onlyProvider) targets = targets.filter((t: any) => t.provider === onlyProvider);

    if (!targets.length) {
        console.error('❌ Kalit topilmadi. GEMINI_API_KEY yoki GROQ_API_KEY kerak (--key ham mumkin).');
        process.exit(1);
    }

    const cases = onlyLang ? CASES.filter(c => c.lang === onlyLang) : CASES;

    console.log(`\n🎙  Ovoz tanish o'lchovi — ${cases.length} gap, ${targets.length} provayder\n`);

    let xato = 0;

    for (const t of targets) {
        console.log(`── ${t.provider} ${'─'.repeat(Math.max(0, 60 - t.provider.length))}`);

        let jamiHit = 0;
        let jamiKalit = 0;
        let jamiMs = 0;
        let model = '';

        for (const c of cases) {
            let audio: Buffer;
            try {
                audio = await synth(c.text, c.lang);
            } catch (e: any) {
                console.error(`   ⚠  ovoz sintez qilinmadi: ${e?.message}`);
                xato++;
                continue;
            }

            try {
                // Faqat SHU provayder sinaladi — zanjir ishlatilsa yiqilgan
                // bo'g'in keyingisi bilan yashirinib qolardi va o'lchov
                // qaysi model haqida ekani noma'lum bo'lardi.
                const out = await transcribe(audio, 'audio/mp3', c.lang, [t], VOCAB);
                const { hit, miss } = score(out.text, c.kalit);

                jamiHit += hit;
                jamiKalit += c.kalit.length;
                jamiMs += out.ms;
                model = out.model;

                const belgi = miss.length === 0 ? '✅' : hit === 0 ? '❌' : '⚠ ';
                console.log(`   ${belgi} ${c.lang}  ${hit}/${c.kalit.length}  ${out.ms}ms`);
                if (miss.length) console.log(`      yo'qolgan: ${miss.join(', ')}`);
                if (VERBOSE || miss.length) {
                    console.log(`      kutilgan: ${c.text}`);
                    console.log(`      eshitilgan: ${out.text}`);
                }
            } catch (e: any) {
                console.log(`   ❌ ${c.lang}  xato: ${e?.message}`);
                jamiKalit += c.kalit.length;
                xato++;
            }
        }

        const ball = jamiKalit ? Math.round((jamiHit / jamiKalit) * 100) : 0;
        const ort = cases.length ? Math.round(jamiMs / cases.length) : 0;
        console.log(`   ── ball: ${ball}%  (${jamiHit}/${jamiKalit})  o'rtacha ${ort}ms  model: ${model || '—'}\n`);
    }

    // Xato bo'lsa exit 1 — CI yoki deploy oldidan ishlatish uchun.
    process.exit(xato > 0 ? 1 : 0);
};

run().catch(e => {
    console.error('🔥', e?.message || e);
    process.exit(1);
});
