// ─── Ovozni matnga aylantirish ────────────────────────────────────────────────
//
// Shifokorning qo'li band va qo'lqopda bo'ladi — klaviatura bilan yozish
// amalda ishlamaydi. Ovozli buyruq esa aynan shu holat uchun.
//
// Bu fayl ZAXIRA yo'l. Asosiy yo'l — brauzerning o'z ovoz tanish
// imkoniyati (Chrome, Web Speech API): u tekin, serverga yuk bermaydi va
// o'zbek tilida Google'ning o'z modeliga tayanadi. Bu yerdagi kod faqat
// brauzer qo'llab-quvvatlamaganda ishlaydi.
//
// O'LCHANGAN SIFAT (sun'iy ovoz bilan, 2026-08):
//
//   ru  "Запиши Алиева к врачу Рахимову на завтра"  -> so'zma-so'z, 413ms
//   uz  "Qarzdorlarga eslatma yubor"                -> "Qarzdarlarga eslatma yubar"
//   uz  "Asror Kamolovga besh yuz ming so'm ..."    -> ism va summa BUZILDI
//
// Ya'ni rus tilida ishonchli, o'zbekchada qisqa buyruqqa yaraydi, lekin
// ism va raqamga ishonib bo'lmaydi. Shuning uchun natija HECH QACHON
// to'g'ridan-to'g'ri bajarilmaydi — u tasdiqlash kartasiga tushadi
// (ai/actions.ts) va foydalanuvchi ko'rib tasdiqlaydi.

/** Groq'da mavjud transkripsiya modellari. turbo tezroq, katta modeli aniqroq. */
const MODEL = process.env.STT_MODEL || 'whisper-large-v3';

const TIMEOUT_MS = Number(process.env.STT_TIMEOUT_MS || 30_000);

export interface TranscribeResult {
    text: string;
    ms: number;
    model: string;
}

/**
 * Audio bo'lagini matnga aylantiradi.
 *
 * @param audio    xom audio (webm/ogg/mp3/wav)
 * @param mimeType brauzer bergan tur
 * @param lang     'uz' | 'ru' — model uchun til ishorasi. Berilishi sifatni
 *                 sezilarli oshiradi: usiz Whisper o'zbekchani ko'pincha
 *                 turk yoki ozarbayjon tili deb qabul qiladi.
 * @param apiKey   klinikaning o'z kaliti yoki platformaniki
 */
export const transcribe = async (
    audio: Buffer,
    mimeType: string,
    lang: 'uz' | 'ru',
    apiKey: string,
    vocab = ''
): Promise<TranscribeResult> => {
    if (!audio?.length) throw new Error('Audio bo\'sh.');

    const form = new FormData();
    // Fayl nomidagi kengaytma muhim: Groq turni shundan ham aniqlaydi.
    const ext = mimeType.includes('webm') ? 'webm'
        : mimeType.includes('ogg') ? 'ogg'
            : mimeType.includes('wav') ? 'wav' : 'mp3';

    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${ext}`);
    form.append('model', MODEL);
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
    const VOCAB_MAX = 600;
    const qirqilgan = vocab.length > VOCAB_MAX
        ? vocab.slice(0, vocab.lastIndexOf(',', VOCAB_MAX) + 1 || VOCAB_MAX)
        : vocab;

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

        return { text, ms: Date.now() - t0, model: MODEL };
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('Ovoz xizmati javob bermadi.');
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Transkripsiya faqat Groq'da bor (Whisper). Klinikaning kaliti boshqa
 * provayderniki bo'lsa, ovoz uchun platforma kaliti ishlatiladi — aks
 * holda Gemini kalitini kiritgan klinikada mikrofon jimgina ishlamay
 * qolardi va sababi tushunarsiz bo'lardi.
 */
export const sttKey = (clinicKey: { provider: string; apiKey: string } | null): string | null => {
    if (clinicKey?.provider === 'groq' && clinicKey.apiKey) return clinicKey.apiKey;
    return process.env.GROQ_API_KEY || null;
};
