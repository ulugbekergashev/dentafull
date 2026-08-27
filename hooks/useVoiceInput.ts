import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../services/api';

// ─── Ovozli kiritish ──────────────────────────────────────────────────────────
//
// Shifokorning qo'li band va qo'lqopda — klaviatura amalda ishlamaydi.
// Shuning uchun tugma emas, HOT KEY: bosdi, gapirdi, tayyor.
//
// Ikkita yo'l, birinchisi ustun:
//
//   1. Brauzerning o'zi (Web Speech API, Chrome/Edge). Tekin, serverga yuk
//      bermaydi, token sarflamaydi va o'zbek tilida Google'ning o'z
//      modeliga tayanadi.
//
//   2. Server orqali Whisper (Groq). Brauzer qo'llab-quvvatlamaganda.
//      O'lchangan sifat: ruschada so'zma-so'z, o'zbekchada qisqa buyruq
//      o'tadi, lekin ism va summani buzadi.
//
// Ikkala yo'l ham natijani BAJARMAYDI — u savol maydoniga tushadi va
// harakat bo'lsa tasdiqlash kartasi chiqadi. Noto'g'ri eshitilgan gap
// bazaga yetib bormaydi.

export type VoiceState = 'idle' | 'listening' | 'processing' | 'error';

interface Options {
    /**
     * Diktovka tili — interfeys tilidan MUSTAQIL.
     *
     * Ilgari u interfeys tiliga bog'langan edi va bu tizimli xatoga olib
     * keldi: klinika ruscha interfeysda ishlaydi, lekin bemorlar ismi
     * o'zbekcha. Ruscha tanigich "Asrorov" ni "Осворов" deb eshitdi —
     * chunki bu rus tilida so'z emas.
     */
    lang: 'uz' | 'ru';
    /** Matn tayyor bo'lganda. */
    onResult: (text: string) => void;
}

/** Brauzer o'zi tanish imkoniyatini beradimi. */
const nativeRecognition = (): any =>
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

/**
 * Server yo'li ishlamay qolganini eslab qolamiz.
 *
 * O'zbekcha uchun asosiy yo'l server bo'ldi, lekin u har doim ham
 * mavjud emas: kalit sozlanmagan bo'lishi, soatlik chegaraga yetish yoki
 * tarmoq uzilishi mumkin. Bunday holatda brauzerning o'z tanigichiga
 * qaytamiz — aks holda ovoz butunlay ishlamay qolardi, bu esa hozirgi
 * holatdan yomonroq.
 */
let serverSttDown = false;

export const voiceSupported = (): boolean =>
    !!nativeRecognition() || !!(navigator.mediaDevices?.getUserMedia);

function authToken(): string | null {
    try {
        const raw = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        return raw ? JSON.parse(raw)?.token ?? null : null;
    } catch {
        return null;
    }
}

export function useVoiceInput({ lang, onResult }: Options) {
    const [state, setState] = useState<VoiceState>('idle');
    const [error, setError] = useState('');
    /** Gapirayotgan paytdagi oraliq matn — foydalanuvchi eshitilayotganini ko'rsin. */
    const [partial, setPartial] = useState('');

    // onResult har renderda yangi funksiya bo'ladi. Uni to'g'ridan-to'g'ri
    // bog'liqlikka qo'ysak, butun hook har renderda qayta quriladi va
    // hot key tinglagichi ham qayta-qayta ulanadi. Ref esa oxirgi
    // versiyani saqlaydi va identifikatorni barqaror qoldiradi.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    const recognitionRef = useRef<any>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    /** Jimlikni kuzatish uchun — tafsilotlar startRecording ichida. */
    const audioCtxRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    // Natija ikki marta yuborilmasligi uchun: Web Speech ba'zan `onresult`
    // dan keyin `onend` da ham chaqiradi.
    const deliveredRef = useRef(false);

    const stopAll = useCallback(() => {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        try { audioCtxRef.current?.close(); } catch { /* allaqachon yopilgan */ }
        audioCtxRef.current = null;
        try { recognitionRef.current?.stop(); } catch { /* allaqachon to'xtagan */ }
        try {
            const rec = recorderRef.current;
            if (rec && rec.state !== 'inactive') rec.stop();
            rec?.stream?.getTracks?.().forEach(t => t.stop());
        } catch { /* yo'q */ }
        recognitionRef.current = null;
        recorderRef.current = null;
    }, []);

    useEffect(() => stopAll, [stopAll]);

    const deliver = useCallback((text: string) => {
        if (deliveredRef.current) return;
        deliveredRef.current = true;
        setPartial('');
        setState('idle');
        const clean = text.trim();
        if (clean) onResultRef.current(clean);
    }, []);

    const fail = useCallback((msg: string) => {
        setPartial('');
        setError(msg);
        setState('error');
        // Xato o'zi yo'qolsin — foydalanuvchi uni yopish bilan ovora bo'lmasin.
        setTimeout(() => setState(s => (s === 'error' ? 'idle' : s)), 4000);
    }, []);

    /** 2-yo'l: yozib olib, serverga yuborish. */
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const rec = new MediaRecorder(stream);
            recorderRef.current = rec;
            chunksRef.current = [];

            rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

            rec.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
                if (blob.size < 1200) { setState('idle'); return; }   // deyarli jimlik

                setState('processing');
                try {
                    const fd = new FormData();
                    fd.append('audio', blob, 'speech.webm');
                    const token = authToken();
                    const res = await fetch(`${API_URL}/ai/transcribe?lang=${lang}`, {
                        method: 'POST',
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                        body: fd,
                    });
                    const data = await res.json().catch(() => ({} as any));
                    if (!res.ok || !data.success) throw new Error(data.message || 'Ovoz tanilmadi.');
                    deliver(data.text);
                } catch (e: any) {
                    // Keyingi safar brauzer taniydi — jimgina ishlamay
                    // qolgandan ko'ra sifati pastroq natija yaxshiroq.
                    serverSttDown = true;
                    fail(e?.message || 'Ovoz tanilmadi.');
                }
            };

            rec.start();
            setState('listening');

            // JIMLIK BO'YICHA O'ZI TO'XTAYDI.
            //
            // Brauzer tanigichi buni o'zi qiladi (continuous = false) va
            // butun oqim shunga qurilgan: bosdi, gapirdi, tayyor. MediaRecorder
            // esa o'zi to'xtamaydi — usiz shifokor qo'lqopda turib ikkinchi
            // marta bosishi kerak bo'lardi, ya'ni server yo'liga o'tish
            // sifatni oshirib, qulaylikni buzardi.
            const ac = new AudioContext();
            audioCtxRef.current = ac;
            // Hot key orqali ochilganda AudioContext 'suspended' holatda
            // boshlanishi mumkin — u holda o'lchov doim nol chiqadi.
            if (ac.state === 'suspended') ac.resume().catch(() => { /* muhim emas */ });
            const analyser = ac.createAnalyser();
            analyser.fftSize = 512;
            ac.createMediaStreamSource(stream).connect(analyser);
            const buf = new Uint8Array(analyser.frequencyBinCount);

            const boshlandi = Date.now();
            let oxirgiOvoz = Date.now();
            // Jimlik bo'yicha to'xtash FAQAT bir marta ovoz eshitilgandan keyin.
            // Aks holda o'lchov ishlamay qolsa (AudioContext to'xtagan, mikrofon
            // jim) yozuv birinchi soniyadayoq uzilib ketardi.
            let ovozEshitildi = false;

            const kuzat = () => {
                if (recorderRef.current !== rec || rec.state !== 'recording') return;

                analyser.getByteTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) {
                    const v = (buf[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / buf.length);

                const hozir = Date.now();
                // 0.02 — tinch xonadagi shovqindan yuqori, lekin sekin
                // gapirishni ham ushlaydi.
                if (rms > 0.02) { oxirgiOvoz = hozir; ovozEshitildi = true; }

                // Boshlanishiga 700ms beriladi: mikrofon yonguncha va odam
                // gapira boshlaguncha o'tadigan vaqt jimlik deb hisoblanmasin.
                const jimlik = ovozEshitildi
                    && hozir - oxirgiOvoz > 1500
                    && hozir - boshlandi > 700;
                // Umuman gapirilmadi — mikrofonni bekorga ochiq qoldirmaymiz.
                const jimjit = !ovozEshitildi && hozir - boshlandi > 8000;
                // Yuqori chegara — oxirgi kafolat: mikrofon unutilib qolsa,
                // cheksiz yozib turmasin.
                const juda_uzoq = hozir - boshlandi > 30000;

                if (jimlik || jimjit || juda_uzoq) {
                    try { rec.stop(); } catch { /* allaqachon to'xtagan */ }
                    return;
                }
                rafRef.current = requestAnimationFrame(kuzat);
            };
            rafRef.current = requestAnimationFrame(kuzat);
        } catch {
            fail('Mikrofonga ruxsat berilmadi.');
        }
    }, [lang, deliver, fail]);

    const start = useCallback(async () => {
        setError('');
        setPartial('');
        deliveredRef.current = false;

        // O'ZBEKCHA UCHUN SERVER YO'LI ASOSIY.
        //
        // Brauzerning uz-UZ tanigichi klinika atamalarini muntazam buzadi
        // ("plomba" -> "qlondi") va buni to'g'rilashning iloji yo'q: Web
        // Speech API ga lug'at berib bo'lmaydi.
        //
        // Serverdagi Whisper esa `prompt` orqali klinikaning O'Z xizmat
        // nomlari va shifokor familiyalariga moyil qilinadi
        // (backend: ai/context.ts -> clinicVocab). Aynan shu so'zlar eng
        // ko'p buzilardi.
        //
        // Ruscha uchun brauzer qoladi: u yerda tanish ishonchli va tekin.
        const preferServer = lang === 'uz' && !serverSttDown;
        const Recognition = preferServer ? null : nativeRecognition();
        if (!Recognition) return startRecording();

        try {
            const rec = new Recognition();
            // uz-UZ / ru-RU — Google shu kodlar bo'yicha tilni tanlaydi.
            rec.lang = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
            // Bitta gap yetarli: buyruq aytilgach o'zi to'xtaydi va shifokor
            // hech narsani bosishi shart emas.
            rec.continuous = false;
            rec.interimResults = true;
            rec.maxAlternatives = 1;

            rec.onresult = (e: any) => {
                let finalText = '';
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const r = e.results[i];
                    if (r.isFinal) finalText += r[0].transcript;
                    else interim += r[0].transcript;
                }
                if (interim) setPartial(interim);
                if (finalText) deliver(finalText);
            };

            rec.onerror = (e: any) => {
                if (e.error === 'no-speech') { setPartial(''); setState('idle'); return; }
                if (e.error === 'not-allowed') { fail('Mikrofonga ruxsat berilmadi.'); return; }
                // 'language-not-supported' — o'zbekcha bu brauzerda yo'q.
                // Jimgina serverdagi zaxira yo'lga o'tamiz.
                if (e.error === 'language-not-supported' || e.error === 'service-not-allowed') {
                    recognitionRef.current = null;
                    startRecording();
                    return;
                }
                fail('Ovozni tanib bo\'lmadi.');
            };

            rec.onend = () => {
                // Natija kelmagan bo'lsa — shunchaki jimlik edi.
                if (!deliveredRef.current) { setPartial(''); setState(s => (s === 'listening' ? 'idle' : s)); }
            };

            recognitionRef.current = rec;
            rec.start();
            setState('listening');
        } catch {
            startRecording();
        }
    }, [lang, deliver, fail, startRecording]);

    const stop = useCallback(() => {
        stopAll();
        setPartial('');
        setState(s => (s === 'listening' ? 'idle' : s));
    }, [stopAll]);

    const toggle = useCallback(() => {
        if (state === 'listening') stop();
        else if (state !== 'processing') start();
    }, [state, start, stop]);

    return { state, error, partial, start, stop, toggle };
}
