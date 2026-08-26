// ─── Uchdan-uchgacha jonli sinov ──────────────────────────────────────────────
//
//   npx ts-node ai/evals/live.ts [--clinic <id>] [--url <manzil>]
//
// smoke.ts tool'larni TO'G'RIDAN-TO'G'RI chaqiradi. Bu skript esa butun
// zanjirni haqiqiy HTTP orqali o'tkazadi — xuddi brauzer qilganday:
//
//   token -> /api/ai/ask/stream -> autentifikatsiya -> yo'naltirish ->
//   tool -> model -> grounding -> SSE hodisalari -> javob
//
// NEGA KERAK: nosozliklarning bir qismi faqat shu yo'lda ko'rinadi —
// SSE proksidan o'tishi, muddat chegaralari, oqim hodisalari tartibi,
// harakat kartasining shakli. Ularning bittasi ham tool'ni to'g'ridan
// chaqirganda bilinmaydi.
//
// XAVFSIZLIK: /api/ai/act CHAQIRILMAYDI. Harakat faqat tasdiqlash
// kartasigacha boradi — ya'ni bazaga hech narsa yozilmaydi.

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { prisma } = require('../../db');

const argv = process.argv.slice(2);
const flag = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
};

const BASE = flag('url') || 'https://dentafull-production.up.railway.app';

interface Ev { type: string; [k: string]: any }

/** SSE oqimini o'qiydi va hodisalarni yig'adi. */
const askStream = async (
    token: string,
    messages: any[],
    lang = 'uz'
): Promise<{ events: Ev[]; firstTokenMs: number; totalMs: number; error?: string }> => {
    const t0 = Date.now();
    const events: Ev[] = [];
    let firstTokenMs = 0;

    const res = await fetch(`${BASE}/api/ai/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages, lang }),
    });

    if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        return { events, firstTokenMs: 0, totalMs: Date.now() - t0, error: `${res.status}: ${body.slice(0, 200)}` };
    }

    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() || '';
        for (const c of chunks) {
            const line = c.split('\n').find((l: string) => l.startsWith('data:'));
            if (!line) continue;
            try {
                const ev = JSON.parse(line.slice(5).trim());
                if (ev.type === 'token' && !firstTokenMs) firstTokenMs = Date.now() - t0;
                events.push(ev);
            } catch { /* buzilgan bo'lak */ }
        }
    }
    return { events, firstTokenMs, totalMs: Date.now() - t0 };
};

const SAVOLLAR: { q: string; kutilgan: string }[] = [
    { q: 'Bugun nechta qabul bor?', kutilgan: 'qabullar soni' },
    { q: 'Kim qarzdor?', kutilgan: 'qarzdorlar' },
    { q: 'Shu oy tushum qancha?', kutilgan: 'moliya' },
    { q: 'Nima tugayapti?', kutilgan: 'ombor' },
    { q: 'Lidlar qanday?', kutilgan: 'lidlar' },
    { q: 'Asrorov Samandarga 200 ming qarz yozib qoy', kutilgan: 'HARAKAT: qarz' },
    { q: 'Qarzdorlarga eslatma yubor', kutilgan: 'HARAKAT: eslatma' },
];

(async () => {
    const clinicId = flag('clinic') || 'c1';
    const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, adminName: true },
    });
    if (!clinic) { console.error('Klinika topilmadi.'); process.exit(1); }

    const token = jwt.sign(
        { role: 'CLINIC_ADMIN', name: clinic.adminName, clinicId: clinic.id },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
    );

    console.log(`Manzil : ${BASE}`);
    console.log(`Klinika: ${clinic.name}\n`);

    const st = await fetch(`${BASE}/api/ai/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => null);
    console.log(`Provayder: ${st?.providers?.map((p: any) => p.name).join(' -> ') || '?'}`);
    console.log(`Model    : ${st?.providers?.[0]?.models?.chat || '?'}\n`);
    console.log('─'.repeat(78));

    let ok = 0, fail = 0;

    for (const s of SAVOLLAR) {
        const r = await askStream(token, [{ role: 'user', content: s.q }]);

        const done = r.events.find(e => e.type === 'done');
        const err = r.events.find(e => e.type === 'error');
        const tools = r.events.filter(e => e.type === 'tool_start').map(e => e.name);
        const waits = r.events.filter(e => e.type === 'wait').map(e => e.seconds);
        const tokens = r.events.filter(e => e.type === 'token').length;

        console.log(`\n"${s.q}"`);
        if (r.error || err) {
            fail++;
            console.log(`  ✗ XATO: ${r.error || err!.message}`);
            continue;
        }
        ok++;
        console.log(`  tool      : ${tools.join(', ') || '—'}`);
        console.log(`  vaqt      : birinchi bo'lak ${r.firstTokenMs || '—'}ms · jami ${r.totalMs}ms`
            + (waits.length ? `  (limit kutuvi: ${waits.join('+')}s)` : ''));
        console.log(`  bo'laklar : ${tokens}`);
        if (done?.action) {
            const p = done.action.preview;
            console.log(`  KARTA     : ${p.title} — ${p.summary}`);
            if (p.choices?.length) console.log(`              tanlash: ${p.choices.map((c: any) => c.label).join(' | ')}`);
            else p.items?.slice(0, 3).forEach((i: any) => console.log(`              ${i.label}: ${i.detail}`));
        }
        console.log(`  javob     : ${String(done?.reply || '').replace(/\n/g, ' ').slice(0, 110)}`);

        // Limitga urilmaslik uchun tanaffus.
        await new Promise(res => setTimeout(res, 20000));
    }

    console.log(`\n${'─'.repeat(78)}`);
    console.log(`Muvaffaqiyatli: ${ok}/${SAVOLLAR.length}   Xato: ${fail}`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
})();
