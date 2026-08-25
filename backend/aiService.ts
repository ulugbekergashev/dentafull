// ─── AI qatlami (0-bosqich) ───────────────────────────────────────────────────
// Tizimdagi BARCHA AI so'rovlari shu fayldan o'tadi. Model, kalit, fallback va
// hisob-kitob mantiqi faqat shu yerda turadi — route'lar provayder haqida hech
// narsa bilmaydi.
//
// Barcha qo'llab-quvvatlanadigan provayderlar OpenAI-compatible `chat/completions`
// formatida ishlaydi, shuning uchun provayder almashish = .env dagi bitta qiymat.
// Kelajakda pullik tier'ga o'tish ham shu yerda, bitta qatorda hal bo'ladi.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ChatMessage {
    role: ChatRole;
    content: string | null;
    /** Assistant tool chaqirganda to'ladi. */
    tool_calls?: any[];
    /** role === 'tool' bo'lganda majburiy. */
    tool_call_id?: string;
}

/**
 * Oqim hodisalari. UI shular orqali "nima bo'layotganini" ko'rsatadi —
 * javob to'liq tayyor bo'lguncha kutish o'rniga.
 */
export type AiEvent =
    | { type: 'tool_start'; name: string; args: any }
    | { type: 'tool_done'; name: string; ok: boolean }
    | { type: 'token'; text: string }
    | { type: 'round'; n: number }
    /**
     * Uzatilgan matnni bekor qil.
     *
     * Model ba'zan tool chaqirishdan oldin bir necha so'z yozadi ("Hozir
     * tekshiraman..."), yoki provayder javob o'rtasida yiqilib, zanjir
     * keyingisiga o'tadi. Ikkala holatda ham ekrandagi yarim matn endi
     * yaroqsiz — UI uni tozalashi kerak, aks holda javob oldiga tasodifiy
     * bo'lak yopishib qolardi.
     */
    | { type: 'discard' }
    /**
     * Provayder limitga urildi va kutish boshlandi.
     *
     * Bitta provayder bilan ishlaganda (zaxira zanjiri yo'q) 429 odatiy hol.
     * Bunda foydalanuvchi 20 soniya sababsiz aylanayotgan spinnerga qarab
     * turardi — bu "ilova qotib qoldi" degan taassurot beradi. Sababni ochiq
     * aytish kutishni bir xil uzunlikda qoldiradi, lekin tushunarli qiladi.
     */
    | { type: 'wait'; seconds: number };

export interface ChatOptions {
    /** Ish turi: qaysi model ishlatilishini belgilaydi. */
    task?: 'chat' | 'cheap';
    maxTokens?: number;
    /** Kuzatuv uchun: qaysi endpoint chaqirdi. */
    label?: string;
    /**
     * Berilsa — javob token-token uzatiladi va bu funksiya har bo'lakda
     * chaqiriladi. Berilmasa oddiy, to'liq javob rejimi ishlaydi.
     */
    onEvent?: (e: AiEvent) => void;
    /**
     * Javobda matn ham, tool chaqiruvi ham bo'lmasa — xato deb hisoblansin
     * va zanjirdagi keyingi provayderga o'tilsin.
     */
    expectContent?: boolean;
    /**
     * So'rov tugashi kerak bo'lgan absolut vaqt (Date.now() shkalasida).
     * Qayta urinishlar va provayderlar bo'ylab uzatiladi, ya'ni umumiy
     * kutish vaqti barcha urinishlar yig'indisi bilan cheklanadi.
     */
    deadlineAt?: number;
}

/** Chaqiruv haqidagi ma'lumot — jurnal (ai/log.ts) uchun. */
export interface CallMeta {
    provider: string;
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    rounds?: number;
}

interface ProviderConfig {
    name: string;
    baseUrl: string;
    apiKey?: string;
    /** task -> model nomi */
    models: { chat: string; cheap: string };
}

// ─── Provayder ro'yxati ──────────────────────────────────────────────────────
// Kalit berilmagan provayder avtomatik o'tkazib yuboriladi, ya'ni faqat
// mavjud kalitlar bilan ishlaydi. Tartib = fallback tartibi.
//
// DIQQAT: bu funksiya, konstanta emas. Sabab: konstanta bo'lganda process.env
// modul yuklangan PAYTDA o'qiladi. Agar aiService .env yuklanishidan oldin
// require qilinsa, kalitlar abadiy undefined bo'lib qolardi va AI jimgina
// "sozlanmagan" holatda ishlardi. Har chaqiruvda o'qish bu bog'liqlikni
// butunlay yo'q qiladi.
const providers = (): ProviderConfig[] => [
    {
        name: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: process.env.GEMINI_API_KEY,
        // 2.0 -> 2.5: bir xil API, bir xil narx darajasi, lekin ko'rsatma
        // bajarish va o'zbek tilida sezilarli kuchliroq.
        //
        // Model almashtirish ilgari qo'rqinchli amal edi — regressiyani sezmay
        // qolish mumkin edi. Endi `ai/evals/run.ts --model <nom>` bor: nomzodni
        // bir xil 54 savolda o'tkazib, ballni oldingisi bilan solishtirsa
        // bo'ladi. Ya'ni bu qator endi o'lchov bilan tasdiqlanadigan qaror.
        models: {
            chat: process.env.GEMINI_MODEL_CHAT || 'gemini-2.5-flash',
            cheap: process.env.GEMINI_MODEL_CHEAP || 'gemini-2.5-flash-lite',
        },
    },
    {
        name: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        // gpt-oss-120b o'zbek tilida ham, klinik aniqlikda ham llama-3.3-70b dan
        // sezilarli ustun chiqdi (35-tishni to'g'ri aniqladi, differensial tashxis berdi).
        // Tezligi ham bir xil (~1.6s). qwen3.6-27b ni ishlatmang — u ichki
        // fikrlashini ingliz tilida javobga chiqarib yuboradi.
        models: {
            chat: process.env.GROQ_MODEL_CHAT || 'openai/gpt-oss-120b',
            cheap: process.env.GROQ_MODEL_CHEAP || 'llama-3.1-8b-instant',
        },
    },
    {
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        models: {
            chat: process.env.OPENROUTER_MODEL_CHAT || 'meta-llama/llama-3.3-70b-instruct:free',
            cheap: process.env.OPENROUTER_MODEL_CHEAP || 'meta-llama/llama-3.1-8b-instruct:free',
        },
    },
];

/**
 * Ishlatiladigan provayderlar zanjiri.
 * AI_PROVIDER berilgan bo'lsa — o'sha birinchi bo'ladi, qolganlari zaxira.
 */
const providerChain = (): ProviderConfig[] => {
    const available = providers().filter(p => !!p.apiKey);
    const preferred = process.env.AI_PROVIDER;
    if (!preferred) return available;
    const first = available.filter(p => p.name === preferred);
    const rest = available.filter(p => p.name !== preferred);
    return [...first, ...rest];
};

export const isAiConfigured = (): boolean => providerChain().length > 0;

/** Sozlangan provayder nomlari — diagnostika uchun (kalitlar oshkor qilinmaydi). */
export const aiStatus = () => ({
    configured: isAiConfigured(),
    providers: providerChain().map(p => ({ name: p.name, models: p.models })),
});

// Fallback qilishga arziydigan xatolar: limit, vaqtinchalik nosozlik, tarmoq.
// 400/401/403 — bu bizning xatomiz, boshqa provayderda ham takrorlanadi.
const isRetryable = (status: number) => status === 429 || status === 408 || status >= 500;

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60_000);

/**
 * Ba'zi "reasoning" modellar (masalan qwen3.x) ichki fikrlashini <think> blokida
 * javob matniga qo'shib yuboradi — ko'pincha ingliz tilida. Foydalanuvchi buni
 * ko'rmasligi kerak, shuning uchun har qanday model uchun tozalab o'tamiz.
 */
const stripReasoning = (text: string): string =>
    text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        // Yopilmagan blok: model token chegarasiga urilgan bo'lsa shunday bo'ladi.
        .replace(/<think>[\s\S]*$/i, '')
        .trim();

/**
 * Markdown belgilarini olib tashlaydi.
 *
 * UI javobni oddiy matn sifatida chizadi (whitespace-pre-wrap), markdown
 * parse qilinmaydi — ya'ni `**Qarzlar**` foydalanuvchiga yulduzchalari bilan
 * ko'rinadi. Prompt buni taqiqlaydi, lekin prompt ehtimoliy: model ba'zan
 * baribir ishlatadi. Shuning uchun serverda kafolatlab tozalanadi.
 */
const stripMarkdown = (text: string): string =>
    text
        .replace(/\*\*(.+?)\*\*/g, '$1')      // **qalin**
        .replace(/(^|\s)\*(\S[^*]*?)\*/g, '$1$2')  // *kursiv* (ko'paytirishga tegmaydi)
        .replace(/^#{1,6}\s+/gm, '')           // ## sarlavha
        .replace(/^\s*[-*]\s+/gm, '• ')        // ro'yxat belgisi -> nuqta
        .replace(/`([^`]+)`/g, '$1');          // `kod`

const cleanReply = (text: string): string => stripMarkdown(stripReasoning(text)).trim();

// ─── Oqim (streaming) ────────────────────────────────────────────────────────
//
// Ilgari tool-calling tsikli to'liq tugagach bitta JSON qaytardi va
// foydalanuvchi 5–12 soniya spinnerga qarab turardi. Endi har bir bo'lak
// darhol uzatiladi.
//
// Muammo: `stripReasoning` to'liq matn ustida ishlaydi, oqimda esa matn
// bo'lak-bo'lak keladi va `<think>` tegi ikki bo'lak orasida bo'linib
// qolishi mumkin. Shuning uchun oqim uchun alohida, holatni eslab
// qoladigan filtr kerak — aks holda model ichki fikrlashi foydalanuvchi
// ekraniga chiqib ketardi.

/** Matn oxiri `tag` ning boshlanishiga o'xshasa — nechta belgi ushlab qolinsin. */
const holdBack = (s: string, tag: string): number => {
    const max = Math.min(tag.length - 1, s.length);
    for (let n = max; n > 0; n--) {
        if (s.slice(s.length - n) === tag.slice(0, n)) return n;
    }
    return 0;
};

const OPEN = '<think>';
const CLOSE = '</think>';

/** Oqim davomida `<think>` bloklarini kesib tashlaydigan filtr. */
class ThinkFilter {
    private buf = '';
    private inThink = false;

    feed(chunk: string): string {
        this.buf += chunk;
        let out = '';

        for (;;) {
            if (this.inThink) {
                const end = this.buf.indexOf(CLOSE);
                if (end === -1) {
                    // Blok ichidamiz — hech narsa chiqarmaymiz. Yopuvchi teg
                    // bo'linib qolishi mumkin, shuning uchun oxirini saqlaymiz.
                    const keep = holdBack(this.buf, CLOSE);
                    this.buf = keep ? this.buf.slice(this.buf.length - keep) : '';
                    return out;
                }
                this.buf = this.buf.slice(end + CLOSE.length);
                this.inThink = false;
                continue;
            }

            const start = this.buf.indexOf(OPEN);
            if (start === -1) {
                const keep = holdBack(this.buf, OPEN);
                out += this.buf.slice(0, this.buf.length - keep);
                this.buf = keep ? this.buf.slice(this.buf.length - keep) : '';
                return out;
            }

            out += this.buf.slice(0, start);
            this.buf = this.buf.slice(start + OPEN.length);
            this.inThink = true;
        }
    }

    /** Oqim tugagach qolgan qismini qaytaradi. */
    flush(): string {
        const rest = this.inThink ? '' : this.buf;
        this.buf = '';
        return rest;
    }
}

/**
 * SSE oqimini o'qib, oddiy (oqimsiz) javob shakliga yig'adi.
 *
 * Qaytariladigan obyekt `chat/completions` javobining aynan o'zi bo'ladi —
 * shu sababli chaqiruvchi kod oqim ishlatilgan-ishlatilmaganini bilishi
 * shart emas va tool-calling mantiqi ikki nusxada yozilmaydi.
 */
const readStream = async (res: Response, onEvent?: (e: AiEvent) => void): Promise<any> => {
    const reader = (res.body as any)?.getReader?.();
    if (!reader) throw new Error('oqim o\'qilmadi');

    const decoder = new TextDecoder();
    const filter = new ThinkFilter();

    let buffer = '';
    let content = '';
    let usage: any = undefined;
    let finishReason: string | undefined;
    // tool_call'lar bo'lak-bo'lak keladi va `index` bo'yicha yig'iladi.
    const toolCalls: any[] = [];

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: xabarlar bo'sh qator bilan ajratiladi, har biri "data: ..." qatori.
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            let data: any;
            try { data = JSON.parse(payload); } catch { continue; }

            if (data.usage) usage = data.usage;
            const choice = data.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;

            const delta = choice.delta || {};

            if (typeof delta.content === 'string' && delta.content) {
                content += delta.content;
                const visible = filter.feed(delta.content);
                if (visible && onEvent) onEvent({ type: 'token', text: visible });
            }

            for (const tc of delta.tool_calls || []) {
                const i = tc.index ?? 0;
                if (!toolCalls[i]) {
                    toolCalls[i] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                }
                if (tc.id) toolCalls[i].id = tc.id;
                if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
            }
        }
    }

    const tail = filter.flush();
    if (tail && onEvent) onEvent({ type: 'token', text: tail });

    const calls = toolCalls.filter(Boolean);
    return {
        choices: [{
            message: {
                content: content || null,
                ...(calls.length ? { tool_calls: calls } : {}),
            },
            finish_reason: finishReason,
        }],
        usage,
    };
};

interface ProviderError extends Error {
    status?: number;
    provider?: string;
    /** 429 javobidagi `retry-after` (soniya). */
    retryAfter?: number;
}

/** Zanjir to'liq 429 bergandan keyin necha marta qayta urinish. */
const AI_RETRY_MAX = Number(process.env.AI_RETRY_MAX || 2);

/**
 * Bitta so'rovga ajratilgan UMUMIY vaqt.
 *
 * Nega kerak: qayta urinishlar mustaqil chegaralarga ega edi — bitta
 * chaqiruv 60s, 429 dan keyin kutish 120s gacha, urinishlar 3 ta. Ya'ni
 * eng yomon holatda foydalanuvchi 7 DAQIQA jimlikda kutardi va javob
 * o'rniga xato olardi. Bu productionda aynan shunday yuz berdi.
 *
 * Ikkita provayder bo'lganda muammo yashiringan edi: birinchisi 429
 * bersa, ikkinchisi darhol javob berardi. Bitta provayder bilan
 * (zaxira zanjiri yo'q) yashiradigan narsa qolmadi.
 *
 * Chegara qat'iy: undan oshadigan kutishning ma'nosi yo'q, chunki
 * foydalanuvchi allaqachon ketgan bo'ladi. Tushunarli xato yaxshiroq.
 */
const AI_DEADLINE_MS = Number(process.env.AI_DEADLINE_MS || 45_000);

/** Limitga urilganda foydalanuvchi ko'radigan xato. */
const busyError = (errors: string[]): Error => {
    const err: any = new Error(
        'AI xizmati hozir band — so\'rovlar chegarasiga yetildi. '
        + 'Bir daqiqadan keyin qayta urinib ko\'ring.'
    );
    err.status = 429;
    err.detail = errors.slice(-2).join(' | ');
    return err;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 429 javobidan kutish vaqtini oladi. Groq `retry-after` sarlavhasini beradi,
 * ba'zi provayderlar esa faqat xabar matnida ko'rsatadi.
 */
const parseRetryAfter = (res: Response, body: string): number | undefined => {
    const header = res.headers.get('retry-after');
    if (header) {
        const n = Number(header);
        if (Number.isFinite(n) && n > 0) return Math.min(n, 120);
    }
    // "Please try again in 8.5s" ko'rinishidagi matndan.
    const m = body.match(/try again in ([\d.]+)s/i);
    if (m) {
        const n = Math.ceil(Number(m[1]));
        if (Number.isFinite(n) && n > 0) return Math.min(n, 120);
    }
    return undefined;
};


// ─── Tool calling (2-bosqich) ────────────────────────────────────────────────

export interface ToolCallTrace {
    name: string;
    args: any;
}

/** Bitta provayderga tool'lar bilan so'rov — xom javob qaytaradi. */
const callProviderRaw = async (
    p: ProviderConfig,
    messages: ChatMessage[],
    tools: any[],
    opts: ChatOptions
): Promise<any> => {
    const model = p.models[opts.task === 'cheap' ? 'cheap' : 'chat'];
    const stream = !!opts.onEvent;
    const controller = new AbortController();
    // Bitta chaqiruv umumiy muddatdan oshib keta olmaydi: aks holda 60s lik
    // timeout 45s lik muddatni bosib o'tardi va cheklovning ma'nosi qolmasdi.
    const budget = opts.deadlineAt
        ? Math.max(1000, Math.min(AI_TIMEOUT_MS, opts.deadlineAt - Date.now()))
        : AI_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), budget);
    try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: opts.maxTokens ?? 1024,
                ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
                // include_usage — oqim rejimida token hisobini oxirgi bo'lakda
                // beradi. Usiz jurnal (ai/log.ts) token ustunlari bo'sh qolardi
                // va sarfni o'lchab bo'lmasdi. Qo'llab-quvvatlamaydigan
                // provayder buni jimgina e'tiborsiz qoldiradi.
                ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const err: ProviderError = new Error(`${p.name} ${res.status}: ${body.slice(0, 300)}`);
            err.status = res.status;
            err.provider = p.name;
            err.retryAfter = parseRetryAfter(res, body);
            throw err;
        }
        const data = stream ? await readStream(res, opts.onEvent) : await res.json();

        // Bo'sh javob — provayder tomonidagi vaqtinchalik nosozlik. Uni
        // qaytarib bo'lmaydigan xato deb hisoblash noto'g'ri: zanjirdagi
        // keyingi provayder odatda normal javob beradi.
        if (opts.expectContent) {
            const m = data?.choices?.[0]?.message;
            if (!m?.content && !(m?.tool_calls?.length)) {
                const err: ProviderError = new Error(`${p.name}: bo'sh javob qaytdi`);
                err.status = 502;
                err.provider = p.name;
                throw err;
            }
        }
        return data;
    } catch (e: any) {
        if (e?.status) throw e;
        const err: ProviderError = new Error(`${p.name}: ${e?.message || 'tarmoq xatosi'}`);
        err.status = e?.name === 'AbortError' ? 408 : 503;
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Oqim hodisalarini kuzatib boruvchi darvoza.
 *
 * Kerak, chunki uzatish boshlangandan keyin urinish yiqilishi mumkin —
 * bunday holatda UI ga "uzatilganini bekor qil" deb aytish shart.
 */
const makeStreamGate = (onEvent?: (e: AiEvent) => void) => {
    let emitted = false;
    return {
        handler: onEvent
            ? (e: AiEvent) => { if (e.type === 'token') emitted = true; onEvent(e); }
            : undefined,
        /** Shu urinishda matn uzatilgan bo'lsa — bekor qilishni buyuradi. */
        rollback: () => {
            if (emitted && onEvent) onEvent({ type: 'discard' });
            emitted = false;
        },
        reset: () => { emitted = false; },
    };
};

/** Fallback zanjiri bilan bitta raund. */
const roundWithFallback = async (
    messages: ChatMessage[],
    tools: any[],
    opts: ChatOptions
): Promise<{ data: any; provider: ProviderConfig }> => {
    const chain = providerChain();
    if (chain.length === 0) {
        throw new Error(
            'AI sozlanmagan: GEMINI_API_KEY, GROQ_API_KEY yoki OPENROUTER_API_KEY dan ' +
            'kamida bittasini .env ga qo\'shing.'
        );
    }
    const errors: string[] = [];
    const gate = makeStreamGate(opts.onEvent);
    const deadlineAt = opts.deadlineAt ?? Date.now() + AI_DEADLINE_MS;

    for (let attempt = 0; attempt <= AI_RETRY_MAX; attempt++) {
        let waitFor: number | undefined;

        if (Date.now() >= deadlineAt) throw busyError(errors);

        for (const p of chain) {
            try {
                gate.reset();
                const data = await callProviderRaw(
                    p, messages, tools, { ...opts, onEvent: gate.handler, deadlineAt }
                );
                return { data, provider: p };
            } catch (e: any) {
                // Yarim uzatilgan matnni tozalaymiz — keyingi provayder
                // javobni noldan yozadi.
                gate.rollback();
                errors.push(e.message);
                if (!isRetryable(e?.status ?? 500)) throw e;
                if (e?.status === 429 && e.retryAfter) {
                    waitFor = Math.min(waitFor ?? Infinity, e.retryAfter);
                }
                console.warn(`[AI] ${p.name} ishlamadi (${e.status}), keyingisiga o'tilmoqda...`);
            }
        }

        if (attempt < AI_RETRY_MAX) {
            const sec = waitFor ?? Math.pow(2, attempt) * 3;
            // Kutish muddatdan oshib ketsa — kutishning ma'nosi yo'q: baribir
            // javob bera olmaymiz. Darhol tushunarli xato qaytargan ma'qul.
            if (Date.now() + sec * 1000 >= deadlineAt) throw busyError(errors);

            console.warn(`[AI] Zanjir band. ${sec}s kutib qayta urinilmoqda (${attempt + 1}/${AI_RETRY_MAX})...`);
            opts.onEvent?.({ type: 'wait', seconds: sec });
            await sleep(sec * 1000);
        }
    }
    throw busyError(errors);
};

/**
 * Tool'siz oddiy so'rov — chaqiruv haqidagi ma'lumot bilan birga.
 *
 * Ilgari bu funksiya (`chat`) o'zining alohida provayder aylanishi va qayta
 * urinish siklini olib yurardi — `roundWithFallback` bilan deyarli bir xil
 * 45 qator kod. Ikkitasi vaqt o'tib bir-biridan uzoqlashardi: oqim
 * qo'llab-quvvatlashi faqat bittasiga qo'shilardi, `retry-after` mantig'i
 * faqat boshqasida tuzatilardi. Endi bitta manba.
 */
export const chatMeta = async (
    messages: ChatMessage[],
    opts: ChatOptions = {}
): Promise<{ text: string; meta: CallMeta }> => {
    const { data, provider } = await roundWithFallback(messages, [], { ...opts, expectContent: true });
    const raw = data?.choices?.[0]?.message?.content;
    const text = typeof raw === 'string' ? cleanReply(raw) : '';
    if (!text) throw new Error('Model bo\'sh javob qaytardi.');

    const model = provider.models[opts.task === 'cheap' ? 'cheap' : 'chat'];
    console.log(
        `[AI] ${opts.label || 'chat'} · ${provider.name}/${model} · ` +
        `in=${data?.usage?.prompt_tokens ?? '?'} out=${data?.usage?.completion_tokens ?? '?'}`
    );

    return {
        text,
        meta: {
            provider: provider.name,
            model,
            tokensIn: data?.usage?.prompt_tokens,
            tokensOut: data?.usage?.completion_tokens,
            rounds: 1,
        },
    };
};

/**
 * AI dan javob oladi. Birinchi provayder limitga urilsa yoki tushib qolsa —
 * avtomatik keyingisiga o'tadi.
 *
 * @throws Barcha provayderlar ishlamasa yoki hech biri sozlanmagan bo'lsa.
 */
export const chat = async (
    messages: ChatMessage[],
    opts: ChatOptions = {}
): Promise<string> => (await chatMeta(messages, opts)).text;

/**
 * Tool'lar bilan suhbat. Model tool chaqirsa — `execute` orqali bajariladi va
 * natija modelga qaytariladi. Model javob yozgunicha yoki `maxRounds` ga
 * yetgunicha takrorlanadi.
 *
 * maxRounds — cheksiz tsikldan himoya: model bir xil tool'ni qayta-qayta
 * chaqiraversa, so'rov to'xtaydi va shu paytgacha yig'ilgan ma'lumot bilan
 * javob so'raladi.
 */
export const chatWithTools = async (
    messages: ChatMessage[],
    tools: any[],
    execute: (name: string, args: any) => Promise<any>,
    opts: ChatOptions & { maxRounds?: number } = {}
): Promise<{ reply: string; toolCalls: ToolCallTrace[]; results: any[]; meta: CallMeta }> => {
    const maxRounds = opts.maxRounds ?? 5;
    // Muddat BUTUN suhbat uchun bir marta belgilanadi, har raund uchun emas:
    // aks holda 5 ta raund 5 x 45s = 225 soniyagacha cho'zilishi mumkin edi.
    const deadlineAt = opts.deadlineAt ?? Date.now() + AI_DEADLINE_MS;
    const history: ChatMessage[] = [...messages];
    const trace: ToolCallTrace[] = [];
    // Xom tool natijalari — grounding tekshiruvi (ai/guard.ts) aynan shularga
    // tayanadi, shuning uchun ular chaqiruvchiga qaytarilishi shart.
    const results: any[] = [];
    let tokensIn = 0;
    let tokensOut = 0;

    for (let round = 0; round < maxRounds; round++) {
        opts.onEvent?.({ type: 'round', n: round + 1 });

        // Oxirgi raundda tool bermaymiz — model matn bilan javob berishga majbur bo'ladi.
        const active = round === maxRounds - 1 ? [] : tools;
        const { data, provider } = await roundWithFallback(history, active, { ...opts, deadlineAt });

        tokensIn += data?.usage?.prompt_tokens || 0;
        tokensOut += data?.usage?.completion_tokens || 0;

        const msg = data?.choices?.[0]?.message;
        const calls = msg?.tool_calls;
        const model = provider.models[opts.task === 'cheap' ? 'cheap' : 'chat'];

        if (!calls || calls.length === 0) {
            const raw = msg?.content;
            const reply = typeof raw === 'string' ? cleanReply(raw) : '';
            console.log(
                `[AI] ${opts.label || 'ask'} · ${provider.name} · raund=${round + 1} · ` +
                `tool=${trace.length} · in=${tokensIn || '?'} out=${tokensOut || '?'}`
            );
            if (!reply) throw new Error('Model bo\'sh javob qaytardi.');
            return {
                reply,
                toolCalls: trace,
                results,
                meta: { provider: provider.name, model, tokensIn, tokensOut, rounds: round + 1 },
            };
        }

        // Bu raund tool chaqiruvi bilan tugadi. Model matn ham yozgan bo'lsa,
        // u allaqachon ekranga uzatilgan — uni tozalashni buyuramiz, aks holda
        // "Hozir tekshiraman..." javobning oldiga yopishib qolardi.
        if (msg?.content) opts.onEvent?.({ type: 'discard' });

        // Assistant'ning tool chaqiruvini tarixga qo'shamiz (protokol talabi).
        history.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });

        for (const c of calls) {
            let args: any = {};
            try {
                args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
                args = {};
            }
            const name = c.function?.name;
            trace.push({ name, args });
            console.log(`[AI:tool] ${name}(${JSON.stringify(args).slice(0, 160)})`);
            opts.onEvent?.({ type: 'tool_start', name, args });

            const result = await execute(name, args);
            results.push(result);
            opts.onEvent?.({ type: 'tool_done', name, ok: !result?.xato });

            history.push({
                role: 'tool',
                tool_call_id: c.id,
                content: typeof result === 'string' ? result.slice(0, 12_000) : JSON.stringify(result).slice(0, 12_000),
            });
        }
    }

    throw new Error('Tool chaqiruvlari chegarasiga yetdi, javob shakllanmadi.');
};
