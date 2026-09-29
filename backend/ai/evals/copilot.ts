// ─── DentaAI paneli: jonli tekshiruv (faqat o'qish) ───────────────────────────
//
//   npx ts-node ai/evals/copilot.ts              # eng ko'p bemori bor klinika
//   npx ts-node ai/evals/copilot.ts --clinic <id>
//
// Panelning modelsiz qismlarini haqiqiy bazada tekshiradi:
//   • kun pulsi — admin, resepshn va shifokor uchun (rol cheklovlari bilan);
//   • bemor kartasi — ochiq karta (ctx.patientId) va ism bo'yicha;
//   • bo'sh vaqtlar — bugun va ertaga;
//   • kartochkalar — har bir o'qish tool'i uchun;
//   • "joriy bemor" iborasi ochiq kartaga bog'lanishi.
//
// XAVFSIZLIK: hech narsa yozilmaydi. Ekranga faqat TUZILMA va SONLAR
// chiqadi — bemor ismi va telefoni chiqarilmaydi.

require('dotenv').config();

const { prisma } = require('../../db');
import { runTool, ToolContext, refersToCurrentPatient, clinicClock } from '../tools';
import { buildEvidence } from '../evidence';
import { buildPulse } from '../pulse';

const argv = process.argv.slice(2);
const flag = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
};

let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(44)} ${info}`);
};

/** Tuzilma: kalitlar va sonlar, matn qiymatlari yashiriladi. */
const shape = (v: any): any => {
    if (Array.isArray(v)) return `[${v.length}]`;
    if (v && typeof v === 'object') {
        const o: any = {};
        for (const k of Object.keys(v)) o[k] = typeof v[k] === 'number' ? v[k] : shape(v[k]);
        return o;
    }
    return typeof v === 'string' ? `<${v.length}>` : v;
};

(async () => {
    let clinicId = flag('clinic');
    if (!clinicId) {
        const clinics = await prisma.clinic.findMany({
            where: { status: 'Active' },
            select: { id: true, _count: { select: { patients: true } } },
        });
        clinics.sort((a: any, b: any) => b._count.patients - a._count.patients);
        if (!clinics.length) { console.error('Faol klinika topilmadi.'); process.exit(1); }
        clinicId = clinics[0].id as string;
        console.log(`Klinika: ${clinicId}  (${clinics[0]._count.patients} bemor)\n`);
    }

    const { date: today } = clinicClock();
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const tomorrow = d.toISOString().slice(0, 10);

    const admin: ToolContext = { clinicId: clinicId!, role: 'CLINIC_ADMIN' };
    const reception: ToolContext = { clinicId: clinicId!, role: 'RECEPTIONIST' };
    const doc = await prisma.doctor.findFirst({ where: { clinicId, status: 'Active' }, select: { id: true } });
    const doctor: ToolContext | null = doc ? { clinicId: clinicId!, role: 'DOCTOR', doctorId: doc.id } : null;

    // ── Puls
    console.log('KUN PULSI');
    for (const [label, ctx] of [['admin', admin], ['resepshn', reception], ['shifokor', doctor]] as const) {
        if (!ctx) continue;
        const t0 = Date.now();
        const p = await buildPulse(ctx, 'uz');
        const keys = p.tiles.map(t => t.key).join(',');
        check(`puls · ${label}`, p.tiles.length > 0, `${Date.now() - t0}ms  [${keys}]  alert=${p.alerts.length} next=${p.next ? 'bor' : 'yo\'q'}`);
        if (label === 'shifokor') check('puls · shifokorda tushum yo\'q', !keys.includes('revenue'));
        if (label === 'resepshn') check('puls · resepshnda tushum yo\'q', !keys.includes('revenue'));
    }
    const ru = await buildPulse(admin, 'ru');
    check('puls · ruscha yorliqlar', /[А-Яа-я]/.test(ru.tiles[0]?.label || ''), ru.tiles[0]?.label ? '' : 'bo\'sh');

    // ── Bemor kartasi
    console.log('\nBEMOR KARTASI');
    const withVisits = await prisma.appointment.findFirst({
        where: { clinicId, status: 'Completed' },
        orderBy: { date: 'desc' },
        select: { patientId: true },
    });
    if (withVisits) {
        const ctx: ToolContext = { ...admin, patientId: withVisits.patientId };
        const t0 = Date.now();
        const card = await runTool('get_patient_card', {}, ctx);
        check('karta · ochiq bemor (query yo\'q)', !card.xato && typeof card.tashriflar === 'number',
            `${Date.now() - t0}ms  ${JSON.stringify(shape(card)).slice(0, 150)}`);
        check('karta · ism maskalangan', /^\S+ \S\.$/.test(card.bemor || '') || !String(card.bemor).includes(' '));
        check('karta · telefon yo\'q', !JSON.stringify(card).match(/telefon|phone/i));
        const same = await runTool('get_patient_card', { query: 'shu bemor' }, ctx);
        check('karta · "shu bemor" = ochiq bemor', same.bemor === card.bemor);
        const ev = await buildEvidence([{ name: 'get_patient_card', args: {}, result: card }], ctx, 'uz');
        check('kartochka · bemor kartasi', ev[0]?.kind === 'patient' && (ev[0] as any).card?.id === withVisits.patientId);
    } else {
        check('karta · yakunlangan qabul topilmadi', true, '(o\'tkazib yuborildi)');
    }

    const noCtx = await runTool('get_patient_card', {}, admin);
    check('karta · kontekstsiz va ismsiz — xato', !!noCtx.xato);

    // ── Bo'sh vaqtlar
    console.log('\nBO\'SH VAQTLAR');
    for (const date of [today, tomorrow]) {
        const t0 = Date.now();
        const r = await runTool('find_free_slots', { date }, admin);
        const free = (r.shifokorlar || []).reduce((s: number, x: any) => s + (x.jami_bosh || 0), 0);
        check(`slots · ${date}`, !r.xato, `${Date.now() - t0}ms  shifokor=${r.shifokorlar?.length ?? 0} bo'sh=${free}`);
    }
    const past = await runTool('find_free_slots', { date: '2020-01-01' }, admin);
    check('slots · o\'tgan sana — xato', !!past.xato);
    if (doctor) {
        const mine = await runTool('find_free_slots', { date: tomorrow }, doctor);
        check('slots · shifokor faqat o\'zini ko\'radi', !mine.xato && (mine.shifokorlar?.length ?? 0) <= 1);
    }

    // ── Kartochkalar
    console.log('\nKARTOCHKALAR');
    const monthFrom = `${today.slice(0, 7)}-01`;
    const reads: [string, any][] = [
        ['get_appointments', { dateFrom: today, dateTo: today }],
        ['get_debtors', { limit: 10 }],
        ['get_revenue', { dateFrom: monthFrom, dateTo: today }],
        ['get_low_stock', {}],
        ['get_doctor_stats', { dateFrom: monthFrom, dateTo: today }],
        ['get_leads', { days: 30 }],
        ['find_free_slots', { date: tomorrow }],
    ];
    for (const [name, args] of reads) {
        const result = await runTool(name, args, admin);
        const ev = await buildEvidence([{ name, args, result }], admin, 'uz');
        const k = ev[0] as any;
        const n = k ? (k.items?.length ?? k.rows?.length ?? k.doctors?.length ?? 1) : 0;
        check(`kartochka · ${name}`, !result.xato, k ? `${k.kind} · ${n} qator` : '(ma\'lumot yo\'q — kartochka chiqmaydi)');
    }
    const many = await buildEvidence(reads.map(([name, args]) => ({ name, args, result: { ok: 1, jami: 1, kassaga_kirgan: 1, tugayotgan: 1, shifokorlar: [{}] } })), admin, 'uz');
    check('kartochka · ko\'pi bilan 3 ta', many.length <= 3, `${many.length}`);

    // ── "Joriy bemor" iborasi
    console.log('\nJORIY BEMOR IBORASI');
    for (const q of ['', 'joriy bemor', 'shu bemor', "o'sha bemor", 'bemor', 'этот пациент', 'текущий пациент', 'unga']) {
        check(`joriy · "${q}"`, refersToCurrentPatient(q));
    }
    for (const q of ['Aliyev Sardor', 'Karimova', 'bemorlar ro\'yxati haqida']) {
        check(`boshqa · "${q}"`, !refersToCurrentPatient(q));
    }

    console.log(`\n${'─'.repeat(70)}\n${failed ? `BUZUQ: ${failed}` : 'Hammasi joyida.'}`);
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
})();
