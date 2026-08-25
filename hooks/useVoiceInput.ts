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
    const chunksRef = useRef<BlobPart[]>([]);
    // Natija ikki marta yuborilmasligi uchun: Web Speech ba'zan `onresult`
    // dan keyin `onend` da ham chaqiradi.
    const deliveredRef = useRef(false);

    const stopAll = useCallback(() => {
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
                    fail(e?.message || 'Ovoz tanilmadi.');
                }
            };

            rec.start();
            setState('listening');
        } catch {
            fail('Mikrofonga ruxsat berilmadi.');
        }
    }, [lang, deliver, fail]);

    const start = useCallback(async () => {
        setError('');
        setPartial('');
        deliveredRef.current = false;

        const Recognition = nativeRecognition();
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
