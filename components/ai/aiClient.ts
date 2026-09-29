import { API_URL, isDemoMode } from '../../services/api';
import { demoAiRequest, demoAiStream } from '../../services/demoAi';

// ─── DentaAI: server bilan aloqa ──────────────────────────────────────────────
//
// Panelning barcha so'rovlari shu fayldan o'tadi. Demo rejimda server yo'q —
// javoblar brauzerdagi demo klinikadan olinadi (services/demoAi.ts), shakli
// esa server javobi bilan aynan bir xil. Ya'ni panel qaysi rejimda
// ishlayotganini bilmaydi va bilishi shart emas.

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Metric {
    label: string;
    value: number | string;
    unit?: string;
    hint?: string;
    tone?: Tone;
}

export interface Report {
    type: string;
    title: string;
    period: string;
    metrics: Metric[];
    table?: { columns: string[]; rows: (string | number)[][] };
    narrative: string;
    sources: string[];
    empty?: boolean;
    emptyText?: string;
}

export interface ReportOption {
    type: string;
    title: string;
    hint: string;
}

/** Tasdiqlash kutayotgan harakat (backend: ai/actions.ts). */
export interface ActionPreview {
    title: string;
    summary: string;
    items: { label: string; detail?: string }[];
    warning?: string;
    message?: string;
    confirmLabel: string;
    choices?: { id: string; label: string; detail?: string }[];
}

export interface PendingAction {
    id: string;
    name: string;
    preview: ActionPreview;
}

// ─── Kartochkalar (backend: ai/evidence.ts) ──────────────────────────────────

export interface PatientCard {
    id: string;
    name: string;
    age: number | null;
    gender: string;
    status: string;
    since: string;
    lastVisit: string;
    doctor: { id: string; name: string } | null;
    visits: number;
    noShows: number;
    cancelled: number;
    next: { date: string; time: string; doctorName: string; type: string } | null;
    recent: { date: string; type: string; status: string; doctorName: string }[];
    procedures: { date: string; name: string; tooth: number | null; price: number }[];
    teeth: Record<string, number>;
    debt: number;
    advance: number;
    recall: { date: string; reason: string } | null;
    diagnoses: { code: string; name: string; date: string }[];
}

export type Evidence =
    | { kind: 'patient'; card: PatientCard }
    | {
        kind: 'patients';
        title: string;
        total: number;
        sum?: number;
        items: { id: string | null; name: string; detail?: string; amount?: number }[];
    }
    | {
        kind: 'appointments';
        title: string;
        total: number;
        items: {
            id: string; patientId: string; patientName: string; doctorName: string;
            date: string; time: string; status: string; type: string;
        }[];
    }
    | {
        kind: 'slots';
        title: string;
        date: string;
        duration: number;
        doctors: { id: string; name: string; start: string; end: string; free: string[] }[];
    }
    | { kind: 'metrics'; title: string; items: Metric[] }
    | { kind: 'stock'; title: string; total: number; items: { name: string; qty: number; min: number; unit: string }[] }
    | { kind: 'table'; title: string; columns: string[]; rows: (string | number)[][] };

// ─── Kun pulsi (backend: ai/pulse.ts) ────────────────────────────────────────

export type PulseAction =
    | { type: 'ask'; text: string }
    | { type: 'report'; report: string }
    | { type: 'open'; href: string };

export interface PulseTile {
    key: 'appts' | 'revenue' | 'debt' | 'leads' | 'stock' | 'tomorrow';
    label: string;
    value: string;
    unit?: string;
    sub?: string;
    tone: Tone;
    delta?: number;
    spark?: number[];
    action: PulseAction;
}

export interface Pulse {
    date: string;
    tiles: PulseTile[];
    next: { time: string; patientId: string; patientName: string; doctorName: string; type: string } | null;
    inClinic: number;
    alerts: { text: string; tone: Tone }[];
}

// ─── Oqim hodisalari (backend: aiService.ts, AiEvent) ────────────────────────

export type StreamEvent =
    | { type: 'token'; text: string }
    | { type: 'tool_start'; name: string }
    | { type: 'tool_done'; name: string; ok: boolean }
    | { type: 'round'; n: number }
    | { type: 'discard' }
    | { type: 'wait'; seconds: number }
    | {
        type: 'done';
        reply: string;
        sources: string[];
        action: PendingAction | null;
        logId: string | null;
        cards?: Evidence[];
    }
    | { type: 'error'; message: string };

export interface AskResult {
    reply: string;
    sources?: string[];
    action?: PendingAction | null;
    logId?: string | null;
    cards?: Evidence[];
}

// ─── So'rovlar ───────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
        const raw = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        token = raw ? JSON.parse(raw)?.token ?? null : null;
    } catch { /* xotira yopiq — tokensiz so'rov 401 qaytaradi */ }
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function aiRequest<T>(path: string, body?: object, method?: string): Promise<T> {
    if (isDemoMode()) return demoAiRequest(path, body, method) as Promise<T>;
    const res = await fetch(`${API_URL}${path}`, {
        method: method || (body ? 'POST' : 'GET'),
        headers: authHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `Xatolik (${res.status})`);
    return data as T;
}

/**
 * Savolni oqim rejimida yuboradi.
 *
 * EventSource ishlatilmaydi: u sarlavha qo'sha olmaydi, ya'ni tokenni URL ga
 * yozishga to'g'ri kelardi — u esa server loglariga va brauzer tarixiga
 * tushadi. Shuning uchun oddiy fetch + ReadableStream.
 *
 * `false` qaytsa — oqim o'qib bo'lmadi, chaqiruvchi oddiy /ai/ask ga o'tadi.
 */
export async function aiStream(
    body: object,
    onEvent: (e: StreamEvent) => void,
    signal?: AbortSignal
): Promise<boolean> {
    if (isDemoMode()) return demoAiStream(body, onEvent, signal);
    const res = await fetch(`${API_URL}/ai/ask/stream`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal,
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data.message || `Xatolik (${res.status})`);
    }
    if (!res.body?.getReader) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE: xabarlar bo'sh qator bilan ajratiladi; ": ping" izohlari o'tkazib yuboriladi.
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
            const line = chunk.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            // Faqat JSON o'qish try ichida. Ilgari ishlov beruvchi ham shu
            // blok ichida chaqirilardi va u "error" hodisasida tashlagan xato
            // jimgina yutilardi: oqim `done` siz tugab, savol oddiy yo'l bilan
            // QAYTA yuborilardi — ikki barobar sarf va o'sha xatoning o'zi.
            let ev: StreamEvent;
            try {
                ev = JSON.parse(line.slice(5).trim());
            } catch {
                continue;   // buzilgan bo'lak — oqim to'xtamaydi
            }
            onEvent(ev);
        }
    }
    return true;
}
