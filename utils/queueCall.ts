import { API_URL } from '../services/api';

/**
 * Onlayn navbat va TV ekrani: chaqiruv ohangi, ovozli e'lon va talon chop etish.
 * Hammasi oddiy funksiyalar (hook emas) — istalgan joydan, istalgan paytda chaqiriladi.
 */

/** Ikki notali "ding-dong". Brauzer ovozga ruxsat bermagan bo'lsa — jim o'tadi */
export function playChime(): void {
    try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        ([[659.25, 0], [523.25, 0.28]] as const).forEach(([freq, at]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.setValueAtTime(0.22, ctx.currentTime + at);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.7);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + at);
            osc.stop(ctx.currentTime + at + 0.8);
        });
        setTimeout(() => ctx.close().catch(() => {}), 1500);
    } catch { /* ovoz bo'lmasa ham navbat ishlaydi */ }
}

const UNITS = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];

/** 13 → "o'n uch", 105 → "bir yuz besh" */
export function numberToUzbekWords(num: number): string {
    const n = Math.max(0, Math.floor(num));
    if (n === 0) return 'nol';
    const h = Math.floor(n / 100) % 10;
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    return [h > 0 ? `${UNITS[h]} yuz` : '', TENS[t], UNITS[u]].filter(Boolean).join(' ');
}

export interface CallInfo {
    number?: number | null;
    patientName: string;
    doctorName?: string;
}

/** "Dr. Ahmedova" → "doktor Ahmedova" */
const spokenDoctor = (name?: string) => String(name || '').replace(/^Dr\.?\s*/i, '').trim();

export function callText(c: CallInfo): string {
    const doc = spokenDoctor(c.doctorName);
    const num = c.number ? `Navbat raqami ${numberToUzbekWords(c.number)}. ` : '';
    return `${num}${c.patientName}. ${doc ? `Doktor ${doc} qabuliga marhamat.` : 'Qabulga marhamat.'}`;
}

/** Brauzerning o'z ovozi — server ovozi ishlamasa */
function speakFallback(c: CallInfo) {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const uz = voices.find(v => v.lang.toLowerCase().startsWith('uz'));
    const ru = voices.find(v => v.lang.toLowerCase().startsWith('ru'));
    const doc = spokenDoctor(c.doctorName);
    const text = uz || !ru
        ? callText(c)
        : `${c.number ? `Номер ${c.number}. ` : ''}${c.patientName}. ${doc ? `Пройдите к врачу ${doc}.` : 'Пройдите на приём.'}`;
    const u = new SpeechSynthesisUtterance(text);
    if (uz) { u.voice = uz; u.lang = 'uz-UZ'; } else if (ru) { u.voice = ru; u.lang = 'ru-RU'; }
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
}

let speaking: Promise<void> = Promise.resolve();

/**
 * Ohang + ovozli chaqiruv. Bir nechta chaqiruv ketma-ket kelsa — navbat bilan
 * o'qiladi, bir-birining ustiga tushmaydi.
 */
export function announceCall(c: CallInfo, withVoice = true): Promise<void> {
    speaking = speaking.then(() => new Promise<void>(resolve => {
        playChime();
        if (!withVoice) { setTimeout(resolve, 1200); return; }
        setTimeout(() => {
            const audio = new Audio(`${API_URL}/tts?text=${encodeURIComponent(callText(c))}&lang=uz`);
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            audio.onended = () => setTimeout(finish, 400);
            audio.onerror = () => { speakFallback(c); setTimeout(finish, 4000); };
            audio.play().catch(() => { speakFallback(c); setTimeout(finish, 4000); });
            // Ovoz qotib qolsa ham navbat to'xtab qolmasin
            setTimeout(finish, 15000);
        }, 900);
    }));
    return speaking;
}

const escapeHtml = (v: string) => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

export interface TicketInfo {
    number: number;
    patientName: string;
    phone?: string;
    doctorName?: string;
    service?: string;
    clinicName: string;
    clinicPhone?: string;
    /** Talondagi yozuvlar (tilga qarab) */
    labels: { title: string; patient: string; phone: string; doctor: string; service: string; time: string; footer: string };
}

/**
 * 80 mm termoprinter uchun talon. Yashirin iframe orqali — yangi oyna ochilmaydi,
 * shu sababli brauzer "qalqib chiquvchi oyna"ni to'sib qo'ymaydi.
 */
export function printTicket(t: TicketInfo): void {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const when = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const row = (label: string, value?: string) => (value ? `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>` : '');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t.labels.title)}</title>
<style>
@page { size: 80mm auto; margin: 0; }
body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 8px 4px; text-align: center; color: #000; font-size: 13px; }
.clinic { font-size: 16px; font-weight: bold; text-transform: uppercase; }
.phone { font-size: 12px; margin-top: 2px; }
.line { border-bottom: 1px dashed #000; margin: 8px 0; }
.title { font-size: 14px; font-weight: bold; letter-spacing: 2px; }
.num { font-size: 64px; font-weight: bold; line-height: 1; margin: 10px 0 6px; }
table { width: 100%; text-align: left; border-collapse: collapse; font-size: 12px; }
td { padding: 2px 0; vertical-align: top; }
td:first-child { width: 34%; font-weight: bold; }
.foot { font-size: 11px; margin-top: 8px; font-style: italic; }
</style></head><body>
<div class="clinic">${escapeHtml(t.clinicName)}</div>
${t.clinicPhone ? `<div class="phone">${escapeHtml(t.clinicPhone)}</div>` : ''}
<div class="line"></div>
<div class="title">${escapeHtml(t.labels.title)}</div>
<div class="num">№${t.number}</div>
<div class="line"></div>
<table>
${row(t.labels.patient, t.patientName)}
${row(t.labels.phone, t.phone)}
${row(t.labels.doctor, t.doctorName)}
${row(t.labels.service, t.service)}
${row(t.labels.time, when)}
</table>
<div class="line"></div>
<div class="foot">${escapeHtml(t.labels.footer)}</div>
</body></html>`;
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
        try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
        } finally {
            setTimeout(() => frame.remove(), 1000);
        }
    }, 250);
}
