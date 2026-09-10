// ─── Ovozni matnga aylantirish ────────────────────────────────────────────────
//
// Shifokorning qo'li band va qo'lqopda bo'ladi — klaviatura bilan yozish
// amalda ishlamaydi. Ovozli buyruq esa aynan shu holat uchun.
//
// IKKI PROVAYDER, ZANJIR TARTIBIDA (aiService.ts dagi providerChain kabi):
//
//   1. Gemini — audioni to'g'ridan-to'g'ri tushunadi. O'zbekcha uchun ASOSIY.
//   2. Groq Whisper — zaxira. Ilgari yakka yo'l edi.
//
// NEGA GEMINI BIRINCHI. O'lchangan sifat Whisper bilan (sun'iy ovoz, 2026-08):
//
//   ru  "Запиши Алиева к врачу Рахимову на завтра"  -> so'zma-so'z, 413ms
//   uz  "Qarzdorlarga eslatma yubor"                -> "Qarzdarlarga eslatma yubar"
//   uz  "Asror Kamolovga besh yuz ming so'm ..."    -> ism va summa BUZILDI
//
// Ya'ni Whisper rus tilida ishonchli, o'zbekchada esa qisqa buyruqqa yaraydi,
// lekin ism va raqamga ishonib bo'lmaydi. Ikki sabab Gemini foydasiga:
//
//   • Whisper `prompt` ~224 tokenga sig'adi, shuning uchun klinika lug'ati
//     qirqilardi (pastdagi VOCAB_MAX). Gemini'da bu chegara yo'q — butun
//     lug'at, ya'ni shifokor familiyalari va xizmat nomlari to'liq beriladi.
//     Aynan shu so'zlar eng ko'p buzilardi.
//   • Gemini kaliti bo'lgan klinikada ovoz UMUMAN ishlamasdi: sttKey faqat
//     Groq'ni bilardi va platforma kalitiga qaytardi. Platformada Groq
//     kaliti bo'lmasa — mikrofon jimgina o'lardi.
//
// Natija HECH QACHON to'g'ridan-to'g'ri bajarilmaydi — u tasdiqlash
// kartasiga tushadi (ai/actions.ts) va foydalanuvchi ko'rib tasdiqlaydi.

// DIQQAT: model nomlari FUNKSIYA orqali o'qiladi, konstanta orqali emas.
// Sabab aiService.ts dagi bilan bir xil: konstanta modul yuklangan PAYTDA
// process.env ni o'qiydi va bu fayl .env yuklanishidan oldin require
// qilinsa, standart qiymat abadiy qotib qolardi — env dagi sozlama
// jimgina e'tiborsiz qolardi. Sinov skriptlari (evals/stt.ts --model)
// ham aynan shu sababdan ishlamasdi.

/** Groq'da mavjud transkripsiya modellari. turbo tezroq, katta modeli aniqroq. */
const groqModel = (): string => process.env.STT_MODEL || 'whisper-large-v3';

// Gemini tomonida ikki xil model ishlatish mumkin:
//
//   gemini-3.5-flash      — BEPUL tierda. Audioni tushunadi va transkripsiya
//                           qiladi. Standart tanlov: Sozlamalarda klinikaga
//                           "kalit bepul olinadi" deb aytamiz va bu rost
//                           bo'lib qolishi kerak.
//   gemini-3.5-transcribe — maxsus STT modeli: 85+ til (uz-UZ bor), 1000
//                           tagacha maxsus lug'at, so'zlovchini ajratish.
//                           Sifati yuqoriroq, lekin FAQAT PULLIK
//                           (~$0.005/daqiqa). Shuning uchun standart emas —
//                           xohlagan klinika env orqali yoqadi.
const geminiModel = (): string => process.env.GEMINI_STT_MODEL || 'gemini-3.5-flash';

// Yangi Interactions API. Api-Revision majburiy: usiz Google jimgina eski
// sxemani qo'llashi va transcription_config ni tashlab yuborishi mumkin.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_API_REVISION = process.env.GEMINI_API_REVISION || '2026-05-20';

const TIMEOUT_MS = Number(process.env.STT_TIMEOUT_MS || 30_000);

/**
 * Gemini qabul qiladigan audio turlari.
 *
 * webm YO'Q — Google uni qo'llab-quvvatlamaydi, brauzer esa MediaRecorder'da
 * aynan webm beradi. Shuning uchun frontend yozuvni yuborishdan oldin WAV'ga
 * o'giradi (hooks/useVoiceInput.ts). Bu ro'yxat — shu shartnomaning server
 * tomonidagi tekshiruvi: eski keshdagi mijoz webm yuborsa, Gemini'ning
 * tushunarsiz 400 xatosi emas, zanjirning Whisper bo'g'ini ishlaydi.
 */
const GEMINI_AUDIO_TYPES = ['wav', 'mp3', 'mpeg', 'aiff', 'aac', 'ogg', 'flac'];

export type SttProvider = 'gemini' | 'groq';

export interface SttTarget {
    provider: SttProvider;
    apiKey: string;
    /** Loglarda kimning chegarasi ishlatilgani ko'rinib tursin. */
    own?: boolean;
}

export interface TranscribeResult {
    text: string;
    ms: number;
    model: string;
}

/** Klinika lug'atini Whisper prompt'i uchun qirqadi (~224 token chegarasi). */
const trimVocab = (vocab: string): string => {
    const VOCAB_MAX = 600;
    if (vocab.length <= VOCAB_MAX) return vocab;
    return vocab.slice(0, vocab.lastIndexOf(',', VOCAB_MAX) + 1 || VOCAB_MAX);
};

const langCode = (lang: 'uz' | 'ru'): string => (lang === 'ru' ? 'ru-RU' : 'uz-UZ');

const extFor = (mimeType: string): string =>
    mimeType.includes('wav') ? 'wav'
        : mimeType.includes('webm') ? 'webm'
            : mimeType.includes('ogg') ? 'ogg'
                : mimeType.includes('flac') ? 'flac' : 'mp3';

// ─── 1-yo'l: Gemini ──────────────────────────────────────────────────────────

/**
 * Audioni Gemini'ga inline (base64) yuboradi.
 *
 * Files API ishlatilmaydi: u ikki qadamli (yuklash + so'rov) va ovozli
 * buyruq uchun ortiqcha kechikish beradi. Inline chegarasi 20 MB, bizdagi
 * yozuv esa 30 soniyadan oshmaydi — muammo yo'q.
 */
const transcribeGemini = async (
    audio: Buffer,
    mimeType: string,
    lang: 'uz' | 'ru',
    apiKey: string,
    vocab: string
): Promise<TranscribeResult> => {
    const type = (mimeType || '').toLowerCase();
    if (!GEMINI_AUDIO_TYPES.some(t => type.includes(t))) {
        throw new Error(`Gemini bu audio turini qabul qilmaydi: ${mimeType}`);
    }

    // Maxsus STT modeli lug'atni ALOHIDA maydonda oladi va u ko'rsatma
    // matnidan ishonchliroq ishlaydi. Oddiy flash modelida esa bunday
    // maydon yo'q — u yerda lug'at ko'rsatma ichida beriladi.
    const model = geminiModel();
    const isTranscribeModel = model.includes('transcribe');
    const terms = vocab.split(',').map(s => s.trim()).filter(Boolean).slice(0, 1000);

    const body: any = {
        model,
        input: [{ type: 'audio', data: audio.toString('base64'), mime_type: mimeType }],
    };

    if (isTranscribeModel) {
        body.generation_config = {
            transcription_config: {
                language_codes: [langCode(lang)],
                ...(terms.length ? { custom_vocabulary: terms } : {}),
            },
        };
    } else {
        // Ko'rsatma audiodan OLDIN turadi — model uni vazifa sifatida
        // o'qishi uchun. Eng muhim shart: faqat matn qaytarsin. Izohli
        // javob ("Bu audioda shifokor...") bevosita savol maydoniga
        // tushib ketardi va buyruq sifatida o'qilmasdi.
        const til = lang === 'uz' ? "o'zbek (lotin yozuvida)" : 'rus';
        const yoriq = [
            `Bu ${til} tilidagi ovozli yozuvni SO'ZMA-SO'Z matnga aylantir.`,
            'Faqat matnning o\'zini qaytar: izoh, tarjima, qo\'shtirnoq va sarlavha qo\'shma.',
            'Hech narsa eshitilmasa — bo\'sh javob qaytar.',
            'Bu stomatologiya klinikasining ish buyrug\'i: bemor, shifokor, qabul, qarz, eslatma, xarajat, so\'m kabi so\'zlar uchraydi.',
        ];
        // Butun lug'at beriladi, qirqilmaydi — Whisper'dagi 224 token
        // chegarasi bu yerda yo'q va aynan shu so'zlar eng ko'p buzilardi.
        if (terms.length) {
            yoriq.push(`Quyidagi atama va ismlar aynan shu shaklda yozilishi kerak: ${terms.join(', ')}.`);
        }
        body.input.unshift({ type: 'text', text: yoriq.join(' ') });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = Date.now();

    try {
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                'Api-Revision': GEMINI_API_REVISION,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const err = await res.text().catch(() => '');
            if (res.status === 429) throw new Error('Ovoz xizmati band. Biroz kutib qayta urinib ko\'ring.');
            throw new Error(`Ovozni tanib bo'lmadi (${res.status}): ${err.slice(0, 120)}`);
        }

        const data: any = await res.json();

        // Javob shakli bir necha ko'rinishda uchraydi: yangi Interactions
        // API steps[].content[].text beradi, snake_case va camelCase
        // varianti ham bor. Bittasiga tayanib qolsak, Google maydon nomini
        // o'zgartirgan kuni ovoz jimgina "hech narsa eshitilmadi" deb
        // qolardi — sababi esa loglarda ko'rinmasdi.
        const fromSteps = (data?.steps || [])
            .flatMap((s: any) => s?.content || [])
            .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
            .map((c: any) => c.text)
            .join(' ');
        const text = String(data?.output_text || data?.outputText || fromSteps || '').trim();

        if (!text) throw new Error('Hech narsa eshitilmadi.');
        return { text, ms: Date.now() - t0, model };
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('Ovoz xizmati javob bermadi.');
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

// ─── 2-yo'l: Groq Whisper ────────────────────────────────────────────────────

const transcribeGroq = async (
    audio: Buffer,
    mimeType: string,
    lang: 'uz' | 'ru',
    apiKey: string,
    vocab: string
): Promise<TranscribeResult> => {
    const form = new FormData();
    // Fayl nomidagi kengaytma muhim: Groq turni shundan ham aniqlaydi.
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${extFor(mimeType)}`);
    const model = groqModel();
    form.append('model', model);
    form.append('language', lang);
    // Kontekst ishorasi: model klinika atamalarini va lotin o'zbek imlosini
    // to'g'riroq tanlashi uchun. Whisper `prompt` ni uslub namunasi sifatida
    // ishlatadi, buyruq sifatida emas.
    const asos = lang === 'uz'
        ? 'Stomatologiya klinikasi. Bemor, shifokor, qabul, qarz, eslatma, xarajat, so\'m.'
        : 'Стоматологическая клиника. Пациент, врач, приём, долг, напоминание, расход, сум.';

    // Klinikaning O'Z lug'ati — xizmat nomlari va shifokor familiyalari.
    // Aynan shular eng ko'p buzilardi: "plomba" -> "qlondi".
    //
    // Prompt uzunligi cheklangan (Whisper ~224 token). Shuning uchun
    // lug'at qirqiladi: to'lib ketgan podskazka modelni chalg'itadi va
    // oxiridagi so'zlar baribir e'tiborga olinmaydi.
    const qirqilgan = trimVocab(vocab);
    form.append('prompt', qirqilgan ? `${asos} ${qirqilgan}` : asos);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = Date.now();

    try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form as any,
            signal: controller.signal,
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            if (res.status === 429) throw new Error('Ovoz xizmati band. Biroz kutib qayta urinib ko\'ring.');
            throw new Error(`Ovozni tanib bo'lmadi (${res.status}): ${body.slice(0, 120)}`);
        }

        const data: any = await res.json();
        const text = String(data?.text || '').trim();
        if (!text) throw new Error('Hech narsa eshitilmadi.');

        return { text, ms: Date.now() - t0, model };
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('Ovoz xizmati javob bermadi.');
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

// ─── Zanjir ──────────────────────────────────────────────────────────────────

/**
 * Audio bo'lagini matnga aylantiradi.
 *
 * @param audio    xom audio (wav/ogg/mp3/flac — Gemini uchun; webm faqat Groq'da)
 * @param mimeType brauzer bergan tur
 * @param lang     'uz' | 'ru' — model uchun til ishorasi. Berilishi sifatni
 *                 sezilarli oshiradi: usiz Whisper o'zbekchani ko'pincha
 *                 turk yoki ozarbayjon tili deb qabul qiladi.
 * @param targets  provayderlar zanjiri (sttTargets)
 * @param vocab    klinikaning o'z lug'ati — xizmat nomlari, familiyalar
 */
export const transcribe = async (
    audio: Buffer,
    mimeType: string,
    lang: 'uz' | 'ru',
    targets: SttTarget[],
    vocab = ''
): Promise<TranscribeResult> => {
    if (!audio?.length) throw new Error('Audio bo\'sh.');
    if (!targets?.length) throw new Error('Ovoz xizmati sozlanmagan.');

    let last: Error | null = null;

    for (const t of targets) {
        try {
            const fn = t.provider === 'gemini' ? transcribeGemini : transcribeGroq;
            return await fn(audio, mimeType, lang, t.apiKey, vocab);
        } catch (e: any) {
            // "Hech narsa eshitilmadi" — jimlik, ya'ni provayder ishladi.
            // Buni zanjir bo'ylab qaytarish ikkinchi kalitni bekorga
            // yeyardi va javob ham o'zgarmasdi.
            if (/eshitilmadi|bo'sh/i.test(e?.message || '')) throw e;
            console.warn(`[AI:stt] ${t.provider} yiqildi:`, e?.message);
            last = e;
        }
    }

    throw last || new Error('Ovozni tanib bo\'lmadi.');
};

/**
 * Ishlatiladigan STT provayderlari zanjiri.
 *
 * Klinikaning O'Z kaliti birinchi bo'ladi — u to'lagan chegara avval
 * ishlatilsin. Ilgari bu yerda faqat Groq bor edi va Gemini kaliti
 * kiritgan klinikada mikrofon jimgina ishlamay qolardi: sababi
 * tushunarsiz bo'lardi, chunki savol-javob esa ayni kalit bilan
 * ishlayverardi.
 *
 * OpenRouter yo'q: uning transkripsiya endpoint'i mavjud emas.
 */
export const sttTargets = (
    clinicKey: { provider: string; apiKey: string } | null
): SttTarget[] => {
    const chain: SttTarget[] = [];

    if (clinicKey?.apiKey && (clinicKey.provider === 'gemini' || clinicKey.provider === 'groq')) {
        chain.push({ provider: clinicKey.provider, apiKey: clinicKey.apiKey, own: true });
    }

    // Platforma kalitlari — zaxira. Gemini birinchi: o'zbekcha sifati
    // yuqoriroq (yuqoridagi izohga qara).
    if (process.env.GEMINI_API_KEY) chain.push({ provider: 'gemini', apiKey: process.env.GEMINI_API_KEY });
    if (process.env.GROQ_API_KEY) chain.push({ provider: 'groq', apiKey: process.env.GROQ_API_KEY });

    // Bir xil provayder ikki marta kelmasin: klinika kaliti platformaniki
    // bilan bir provayderda bo'lsa, ikkinchisi baribir yiqilardi.
    const seen = new Set<string>();
    return chain.filter(t => {
        const k = `${t.provider}:${t.apiKey}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

/**
 * Eski nom — chaqiruvchilar buzilmasin.
 * @deprecated `sttTargets` ishlatilsin.
 */
export const sttKey = (clinicKey: { provider: string; apiKey: string } | null): string | null =>
    sttTargets(clinicKey)[0]?.apiKey ?? null;
