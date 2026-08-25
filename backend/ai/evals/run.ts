// ─── Etalon to'plamni ishga tushiruvchi ──────────────────────────────────────
//
//   npx ts-node ai/evals/run.ts                      # hammasi
//   npx ts-node ai/evals/run.ts --category moliya    # bitta toifa
//   npx ts-node ai/evals/run.ts --id 9,17,40         # tanlangan savollar
//   npx ts-node ai/evals/run.ts --limit 10           # birinchi N ta
//   npx ts-node ai/evals/run.ts --verbose            # to'liq javoblarni ko'rsat
//   npx ts-node ai/evals/run.ts --repeat 3           # beqarorlikni o'lchash
//
// Yangi bayroqlar:
//   --concurrency 4        # nechta savol bir vaqtda (Gemini kaliti bilan tez)
//   --model gemini-2.5-pro # nomzod modelni sinash
//   --min 90               # ball shundan past bo'lsa exit 1 (deploy oldidan)
//   --no-history           # natijani tarixga yozma
//
// Baza CHAQIRILMAYDI — fikstura ishlatiladi. AI provayder kaliti kerak.

require('dotenv').config();

import * as fs from 'fs';
import * as path from 'path';
import { QUESTIONS, EvalQuestion } from './questions';
import { EVAL_TODAY, fixtureExecutor } from './fixtures';
import { checkQuality, QualityIssue } from './quality';
import { checkGrounding } from '../guard';

// ─── Argumentlar ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
};
const VERBOSE = argv.includes('--verbose');

// --model: nomzod modelni sinash. Barcha provayderlarga bir xil qiymat
// qo'yiladi — zanjirdagi qaysi biri ishlatilishidan qat'i nazar o'sha model
// sinaladi. providers() env ni HAR chaqiruvda o'qigani uchun bu ishlaydi;
// shuning uchun ham aiService faqat shundan keyin require qilinadi.
const MODEL = flag('model');
if (MODEL) {
    process.env.GEMINI_MODEL_CHAT = MODEL;
    process.env.GROQ_MODEL_CHAT = MODEL;
    process.env.OPENROUTER_MODEL_CHAT = MODEL;
}

const ai = require('../../aiService');
const tools = require('../tools');

// ─── Sur'at ──────────────────────────────────────────────────────────────────
// Groq bepul tier: daqiqasiga 8 000 token (x-ratelimit-limit-tokens).
// Bitta savol ~3 500–4 000 token yeydi (system prompt + 7 tool ta'rifi, ikki
// raund), ya'ni daqiqasiga atigi ~2 ta savol sig'adi.
//
// Tanaffusni qisqartirmang. 2.5s bilan sinab ko'rilgan edi: retry bo'roni
// boshlanadi — har bir qayta urinish to'liq promptni qaytadan yuboradi va
// byudjetni yanada tez yeydi. Bitta savol 450 soniya oldi va natijalar
// sifatni emas, limitni o'lchab qoldi.
//
// Pullik tier'ga o'tganda yoki limiti kengroq provayderda buni tushirsa bo'ladi.
const EVAL_DELAY_MS = Number(process.env.EVAL_DELAY_MS || 30_000);

/**
 * Nechta savol bir vaqtda ketadi.
 *
 * Standart 1 — Groq bepul tieri uchun xavfsiz. Gemini kaliti bilan limit
 * ancha keng, shuning uchun `--concurrency 4 --delay 2000` bilan to'liq
 * o'tish 27 daqiqadan ~3 daqiqagacha qisqaradi. Bu muhim: yarim soatlik
 * test amalda hech qachon ishga tushirilmaydi, uch daqiqalik esa har bir
 * prompt o'zgarishidan keyin tushiriladi.
 */
const CONCURRENCY = Math.max(1, Number(flag('concurrency') || 1));
const DELAY_MS = flag('delay') !== undefined ? Number(flag('delay')) : EVAL_DELAY_MS;

let selected = QUESTIONS;
const cat = flag('category');
if (cat) selected = selected.filter(q => q.category === cat);
const ids = flag('id');
if (ids) {
    const set = new Set(ids.split(',').map(s => Number(s.trim())));
    selected = selected.filter(q => set.has(q.id));
}
const limit = flag('limit');
if (limit) selected = selected.slice(0, Number(limit));

// ─── Solishtirish yordamchilari ──────────────────────────────────────────────

/**
 * Raqamni ajratgichdan qat'i nazar topadi: 42350000 ni "42 350 000",
 * "42,350,000" va "42.350.000" ko'rinishlarida ham tan oladi.
 */
const containsNumber = (text: string, n: number): boolean => {
    const digits = String(n);
    const pattern = digits.split('').join('[\\s.,\\u00A0\']?');
    return new RegExp(pattern).test(text);
};

const containsValue = (text: string, v: string | number): boolean =>
    typeof v === 'number'
        ? containsNumber(text, v)
        : text.toLowerCase().includes(String(v).toLowerCase());

// Prompt endpoint bilan BIR XIL manbadan olinadi — nusxa ko'chirilmaydi.
// Aks holda prompt endpointda o'zgarganda test eski matnni sinab, mavjud
// bo'lmagan xatti-harakatni "to'g'ri" deb ko'rsataverardi.
const { askSystemPrompt } = require('../prompts');

interface Result {
    q: EvalQuestion;
    ok: boolean;
    toolOk: boolean;
    argsOk: boolean;
    contentOk: boolean;
    /** Javobdagi yirik raqamlar tool natijasidan kelib chiqadimi. */
    groundingOk: boolean;
    /** Til, markdown va <think> tekshiruvlari. */
    quality: QualityIssue[];
    reply: string;
    called: string[];
    sabab: string[];
    ms: number;
}

const runOne = async (q: EvalQuestion): Promise<Result> => {
    const t0 = Date.now();
    const calls: { name: string; args: any }[] = [];
    // Grounding tekshiruvi uchun: model qanday ma'lumot ko'rgan bo'lsa,
    // javobidagi raqamlar ham faqat shundan kelib chiqishi kerak.
    const seen: any[] = [];

    const exec = async (name: string, args: any) => {
        calls.push({ name, args });
        // Rol tekshiruvi haqiqiy runTool'dagidek — ruxsatsiz tool'ni bloklaymiz.
        const def = tools.TOOL_DEFS.find((d: any) => d.name === name);
        if (!def) return { xato: `Noma'lum tool: ${name}` };
        if (!def.roles.includes(q.role)) return { xato: 'Bu ma\'lumotga sizning rolingizda ruxsat yo\'q.' };
        const value = await fixtureExecutor(name, args);
        seen.push(value);
        return value;
    };

    let reply = '';
    try {
        const r = await ai.chatWithTools(
            [{ role: 'system', content: askSystemPrompt(EVAL_TODAY) }, { role: 'user', content: q.q }],
            tools.toolsForRole(q.role),
            exec,
            { task: 'chat', maxTokens: 1200, maxRounds: 5, label: `eval:${q.id}` }
        );
        reply = r.reply;
    } catch (e: any) {
        reply = `[XATO] ${e.message}`;
    }

    const called = calls.map(c => c.name);
    const sabab: string[] = [];

    // 1. TOOL
    let toolOk: boolean;
    if (q.tool === null) {
        toolOk = calls.length === 0;
        if (!toolOk) sabab.push(`tool chaqirilmasligi kerak edi, chaqirildi: ${called.join(',')}`);
    } else if (q.tool === '*') {
        toolOk = true; // qaysi tool ishlatilgani muhim emas
    } else {
        const want = Array.isArray(q.tool) ? q.tool : [q.tool];
        toolOk = want.every(w => called.includes(w));
        if (!toolOk) sabab.push(`kutilgan tool: ${want.join(',')}; chaqirilgan: ${called.join(',') || 'hech narsa'}`);
    }

    // 1a. Keng savollar: model o'zi bir nechta manbadan ma'lumot yig'ishi kerak.
    if (q.minTools && calls.length < q.minTools) {
        toolOk = false;
        sabab.push(`kamida ${q.minTools} ta tool kutilgan, chaqirilgan: ${calls.length}`);
    }

    // 1b. TAQIQLANGAN TOOL — rol cheklovining asosiy tekshiruvi.
    for (const f of q.forbiddenTools || []) {
        if (called.includes(f)) {
            toolOk = false;
            sabab.push(`TAQIQLANGAN tool chaqirildi: ${f}`);
        }
    }

    // 2. ARGS
    let argsOk = true;
    if (q.args && q.tool && typeof q.tool === 'string') {
        const call = calls.find(c => c.name === q.tool);
        argsOk = !!call && q.args(call.args);
        if (!argsOk) sabab.push(`argument noto'g'ri: ${JSON.stringify(call?.args ?? null)}`);
    }

    // 3. JAVOB
    let contentOk = true;
    for (const v of q.mustInclude || []) {
        if (!containsValue(reply, v)) { contentOk = false; sabab.push(`javobda yo'q: ${v}`); }
    }
    for (const v of q.mustNotInclude || []) {
        if (containsValue(reply, v)) { contentOk = false; sabab.push(`javobda BO'LMASLIGI kerak edi: ${v}`); }
    }

    // 4. GROUNDING — javobdagi yirik raqam ma'lumotdan kelib chiqadimi.
    //
    // Bu tekshiruv butun to'plamga bepul qo'shiladi va aynan eng xavfli
    // nuqsonni o'lchaydi: javob ishonchli ohangda, lekin raqami to'qima.
    // Ilgari uni faqat `mustInclude` bilvosita ushlab qolardi — ya'ni
    // KUTILGAN raqam bor-yo'qligini bilardik, lekin KERAKSIZ raqam
    // qo'shilganini emas.
    const grounding = checkGrounding(reply, seen);
    const groundingOk = grounding.stripped.length === 0;
    if (!groundingOk) {
        sabab.push(`ma'lumotda yo'q raqam: ${grounding.stripped.join(', ')}`);
    }

    // 5. SIFAT — til, markdown, <think> qoldig'i.
    const quality = checkQuality(reply, 'uz');
    for (const issue of quality) sabab.push(`sifat/${issue.code}: ${issue.detail}`);

    const ok = toolOk && argsOk && contentOk && groundingOk && quality.length === 0;
    return { q, ok, toolOk, argsOk, contentOk, groundingOk, quality, reply, called, sabab, ms: Date.now() - t0 };
};

// ─── Tarix ───────────────────────────────────────────────────────────────────
//
// Ilgari natija faqat terminalga chiqardi va terminal yopilishi bilan
// yo'qolardi. Ya'ni "o'tgan hafta 46/54 edi, hozir 44/54 — nima buzildi?"
// degan savolga javob yo'q edi. Endi har bir o'tish diskka yoziladi va
// oldingisi bilan avtomatik solishtiriladi.

const HISTORY_DIR = path.join(__dirname, 'history');

interface HistoryEntry {
    sana: string;
    provider: string;
    model: string;
    jami: number;
    otdi: number;
    foiz: number;
    yiqilganlar: number[];
    toifalar: Record<string, { otdi: number; jami: number }>;
    bosqichlar: { tool: number; args: number; content: number; grounding: number; sifat: number };
}

const saveHistory = (entry: HistoryEntry): void => {
    try {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const name = entry.sana.replace(/[:.]/g, '-') + '.json';
        fs.writeFileSync(path.join(HISTORY_DIR, name), JSON.stringify(entry, null, 2), 'utf8');
    } catch (e: any) {
        console.warn(`Tarixga yozib bo'lmadi: ${e.message}`);
    }
};

/** Eng oxirgi oldingi natija (hozirgisidan tashqari). */
const lastHistory = (): HistoryEntry | null => {
    try {
        const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json')).sort();
        if (!files.length) return null;
        return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, files[files.length - 1]), 'utf8'));
    } catch {
        return null;
    }
};

// ─── Parallel bajarish ───────────────────────────────────────────────────────

/**
 * Savollarni CONCURRENCY ta oqimda o'tkazadi.
 *
 * Natijalar HAR DOIM savollar tartibida qaytadi — aks holda ikki o'tishni
 * solishtirish qiyinlashardi.
 */
const runPool = async <T, R>(
    items: T[],
    worker: (item: T, index: number) => Promise<R>,
    concurrency: number
): Promise<R[]> => {
    const out: R[] = new Array(items.length);
    let next = 0;

    const lane = async () => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await worker(items[i], i);
            if (DELAY_MS > 0 && next < items.length) {
                await new Promise(res => setTimeout(res, DELAY_MS));
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
    return out;
};

// ─── Ishga tushirish ─────────────────────────────────────────────────────────
(async () => {
    if (!ai.isAiConfigured()) {
        console.error('AI sozlanmagan — .env ga kalit qo\'shing.');
        process.exit(1);
    }
    const st = ai.aiStatus();
    const providerName = st.providers[0].name;
    const modelName = st.providers[0].models.chat;

    console.log(`Provayder: ${st.providers.map((p: any) => p.name).join(' -> ')}`);
    console.log(`Model    : ${modelName}${MODEL ? '  (--model bilan)' : ''}`);
    console.log(`Savollar : ${selected.length} ta`);
    console.log(`Oqim     : ${CONCURRENCY} ta parallel, ${DELAY_MS}ms tanaffus\n`);

    // --repeat N: har bir savolni N marta takrorlaydi. Tool chaqirish
    // ehtimoliy jarayon — bitta ishga tushirish "o'tdi" degani har doim
    // o'tadi degani emas. Beqarorlikni ko'rish uchun shu bayroq kerak.
    const REPEAT = Math.max(1, Number(flag('repeat') || 1));
    const passCount = new Map<number, number>();

    const results = await runPool(selected, async (q) => {
        let r!: Result;
        let passes = 0;
        for (let i = 0; i < REPEAT; i++) {
            const attempt = await runOne(q);
            if (attempt.ok) passes++;
            // Xulosa uchun oxirgi natijani saqlaymiz; yiqilgani bo'lsa — o'shani.
            if (i === 0 || (!attempt.ok && r.ok)) r = attempt;
            if (i < REPEAT - 1) await new Promise(res => setTimeout(res, Math.min(DELAY_MS, 2500)));
        }
        passCount.set(q.id, passes);

        const mark = REPEAT > 1
            ? (passes === REPEAT ? '✓' : passes === 0 ? '✗' : '~')
            : (r.ok ? '✓' : '✗');
        const suffix = REPEAT > 1 ? ` [${passes}/${REPEAT}]` : '';
        console.log(`${mark} #${String(q.id).padStart(2)} [${q.category}/${q.role.slice(0, 4)}] ${q.q.slice(0, 46)}${suffix}  (${r.ms}ms)`);
        if (!r.ok) r.sabab.forEach(s => console.log(`     └─ ${s}`));
        if (VERBOSE) console.log(`     javob: ${r.reply.replace(/\n/g, ' ').slice(0, 220)}\n`);

        return r;
    }, CONCURRENCY);

    // ─── Xulosa ──────────────────────────────────────────────────────────────
    const pass = results.filter(r => r.ok).length;
    const pct = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 100);
    const pctStr = (n: number, d: number) => d === 0 ? '—' : `${pct(n, d)}%`;

    console.log(`\n${'='.repeat(62)}`);
    console.log(`UMUMIY: ${pass}/${results.length}  (${pctStr(pass, results.length)})`);
    console.log('='.repeat(62));

    const qualityOk = results.filter(r => r.quality.length === 0).length;
    const bosqichlar = {
        tool: pct(results.filter(r => r.toolOk).length, results.length),
        args: pct(results.filter(r => r.argsOk).length, results.length),
        content: pct(results.filter(r => r.contentOk).length, results.length),
        grounding: pct(results.filter(r => r.groundingOk).length, results.length),
        sifat: pct(qualityOk, results.length),
    };

    console.log('\nBosqich bo\'yicha:');
    console.log(`  tool tanlash : ${bosqichlar.tool}%`);
    console.log(`  argumentlar  : ${bosqichlar.args}%`);
    console.log(`  javob mazmuni: ${bosqichlar.content}%`);
    console.log(`  grounding    : ${bosqichlar.grounding}%   (raqam ma'lumotdan kelib chiqadimi)`);
    console.log(`  til va shakl : ${bosqichlar.sifat}%   (markdown, <think>, til)`);

    // Sifat muammolari turlari bo'yicha — qaysi biri ko'p uchraydi.
    const byCode: Record<string, number> = {};
    for (const r of results) for (const i of r.quality) byCode[i.code] = (byCode[i.code] || 0) + 1;
    if (Object.keys(byCode).length) {
        console.log('\nSifat muammolari:');
        for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${code.padEnd(12)} ${n} ta`);
        }
    }

    console.log('\nToifa bo\'yicha:');
    const cats = Array.from(new Set(results.map(r => r.q.category)));
    const toifalar: Record<string, { otdi: number; jami: number }> = {};
    for (const c of cats) {
        const rs = results.filter(r => r.q.category === c);
        const p = rs.filter(r => r.ok).length;
        toifalar[c] = { otdi: p, jami: rs.length };
        console.log(`  ${c.padEnd(14)} ${String(p).padStart(2)}/${rs.length}  ${pctStr(p, rs.length)}`);
    }

    if (REPEAT > 1) {
        const flaky = Array.from(passCount.entries()).filter(([, p]) => p > 0 && p < REPEAT);
        const totalRuns = selected.length * REPEAT;
        const totalPass = Array.from(passCount.values()).reduce((s, p) => s + p, 0);
        console.log(`\nBeqarorlik (${REPEAT} marta takror):`);
        console.log(`  jami urinish : ${totalPass}/${totalRuns}  ${pctStr(totalPass, totalRuns)}`);
        console.log(`  beqaror savol: ${flaky.length} ta${flaky.length ? ' — ' + flaky.map(([id, p]) => `#${id}(${p}/${REPEAT})`).join(', ') : ''}`);
    }

    const failed = results.filter(r => !r.ok);

    // ─── Oldingi o'tish bilan solishtirish ───────────────────────────────────
    const prev = lastHistory();
    if (prev) {
        const nowFailed = new Set(failed.map(r => r.q.id));
        const wasFailed = new Set(prev.yiqilganlar);
        const broke = Array.from(nowFailed).filter(id => !wasFailed.has(id));
        const fixed = Array.from(wasFailed).filter(id => !nowFailed.has(id));

        console.log(`\nOldingi o'tish (${prev.sana.slice(0, 16)}, ${prev.model}): ${prev.otdi}/${prev.jami} (${prev.foiz}%)`);
        const delta = pct(pass, results.length) - prev.foiz;
        console.log(`  o'zgarish  : ${delta > 0 ? '+' : ''}${delta}%`);
        if (broke.length) console.log(`  YANGI YIQILGAN: ${broke.map(i => '#' + i).join(', ')}`);
        if (fixed.length) console.log(`  tuzalgan      : ${fixed.map(i => '#' + i).join(', ')}`);
        if (!broke.length && !fixed.length) console.log('  o\'zgarish yo\'q');
    }

    if (!argv.includes('--no-history')) {
        saveHistory({
            sana: new Date().toISOString(),
            provider: providerName,
            model: modelName,
            jami: results.length,
            otdi: pass,
            foiz: pct(pass, results.length),
            yiqilganlar: failed.map(r => r.q.id),
            toifalar,
            bosqichlar,
        });
    }

    if (failed.length) {
        console.log(`\nYiqilganlar: ${failed.map(r => '#' + r.q.id).join(', ')}`);
        console.log('Batafsil ko\'rish uchun: npx ts-node ai/evals/run.ts --id ' + failed.map(r => r.q.id).join(',') + ' --verbose');
    }

    // ─── Chegara ─────────────────────────────────────────────────────────────
    // --min bilan bu skript deploy oldidagi darvozaga aylanadi: ball
    // belgilangan chegaradan pastga tushsa, jarayon xato bilan tugaydi.
    const MIN = flag('min') !== undefined ? Number(flag('min')) : null;
    if (MIN !== null) {
        const score = pct(pass, results.length);
        console.log(`\nChegara: ${MIN}% · natija: ${score}% — ${score >= MIN ? 'O\'TDI' : 'YIQILDI'}`);
        process.exit(score >= MIN ? 0 : 1);
    }

    process.exit(failed.length ? 1 : 0);
})();
