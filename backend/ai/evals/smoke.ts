// ─── Jonli tekshiruv (faqat o'qish) ───────────────────────────────────────────
//
//   npx ts-node ai/evals/smoke.ts              # eng ko'p bemori bor klinika
//   npx ts-node ai/evals/smoke.ts --clinic <id>
//
// NEGA KERAK: bu loyihada topilgan nosozliklarning aksariyati AI ning
// o'zida emas, MA'LUMOT qatlamida edi va ularning hammasi bir xil
// ko'rinardi — "ma'lumot yo'q":
//
//   • find_patient da `doctorName` ustuni yo'q edi (Prisma xato tashlardi,
//     runTool uni ushlab "ma'lumot yo'q" deb qaytarardi);
//   • qarzdorlar `balance < 0` bo'yicha qidirilardi, `balance` esa avans
//     qoldig'i va u deyarli har doim nol;
//   • ko'p so'zli ism hech qachon topilmasdi.
//
// Ularning bittasi ham modelga bog'liq emas va bittasi ham etalon
// to'plamda (fikstura bilan ishlaydi) ko'rinmasdi. Faqat HAQIQIY baza
// ko'rsatadi.
//
// XAVFSIZLIK: bu skript hech narsa YOZMAYDI. Tool'lar faqat o'qiydi,
// harakatlar esa faqat KO'RIB CHIQISH (preview) bosqichigacha
// chaqiriladi — u ham faqat o'qish. `executeAction` umuman ishlatilmaydi.

require('dotenv').config();

const { prisma } = require('../../db');
import { TOOL_DEFS, runTool, ToolContext } from '../tools';
import { ACTION_DEFS, previewAction } from '../actions';

const argv = process.argv.slice(2);
const flag = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
};

const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;

interface Row { nom: string; holat: 'OK' | 'BO\'SH' | 'XATO'; izoh: string; ms: number; }

const short = (v: any): string => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return (s || '').replace(/\s+/g, ' ').slice(0, 90);
};

(async () => {
    let clinicId = flag('clinic');
    if (!clinicId) {
        const clinics = await prisma.clinic.findMany({
            where: { status: 'Active' },
            select: { id: true, name: true, _count: { select: { patients: true } } },
        });
        clinics.sort((a: any, b: any) => b._count.patients - a._count.patients);
        if (!clinics.length) { console.error('Faol klinika topilmadi.'); process.exit(1); }
        clinicId = clinics[0].id;
        console.log(`Klinika: ${clinics[0].name}  (${clinics[0]._count.patients} bemor)\n`);
    }

    const ctx: ToolContext = { clinicId: clinicId!, role: 'CLINIC_ADMIN' };

    // Argumentlar haqiqiy ma'lumotdan olinadi — "topilmadi" natijasi
    // tool buzuqligini yashirib qo'ymasligi uchun.
    const anyPatient = await prisma.patient.findFirst({
        where: { clinicId }, select: { firstName: true, lastName: true },
    });
    const anyDoctor = await prisma.doctor.findFirst({
        where: { clinicId }, select: { firstName: true, lastName: true },
    });
    const anyLead = await prisma.lead.findFirst({ where: { clinicId }, select: { name: true } });

    const patientName = anyPatient ? `${anyPatient.lastName} ${anyPatient.firstName}` : 'test';
    const doctorName = anyDoctor ? anyDoctor.lastName : 'test';

    const TOOL_ARGS: Record<string, any> = {
        get_appointments: { dateFrom: today, dateTo: today },
        get_revenue: { dateFrom: monthStart, dateTo: today },
        get_debtors: { limit: 5 },
        get_doctor_stats: { dateFrom: monthStart, dateTo: today },
        find_patient: { query: patientName },
        get_low_stock: {},
        get_leads: { days: 30 },
    };

    const ACTION_ARGS: Record<string, any> = {
        send_reminder: { target: 'debtors', limit: 5 },
        send_message: { patientQuery: patientName, message: 'Sinov xabari' },
        add_charge: { patientQuery: patientName, amount: 1000, service: 'Sinov' },
        record_payment: { patientQuery: patientName, amount: 1000 },
        book_appointment: { patientQuery: patientName, doctorName, date: today, time: '23:45' },
        update_lead_status: { leadQuery: anyLead?.name || 'test', status: 'Contacted' },
        create_expense: { amount: 1000, category: 'Other', title: 'Sinov' },
        pay_doctor: { doctorName, amount: 1000 },
        update_doctor_pay: { doctorName, percentage: 40 },
    };

    const rows: Row[] = [];

    console.log('O\'QISH TOOL\'LARI');
    for (const def of TOOL_DEFS) {
        const t0 = Date.now();
        try {
            const r = await runTool(def.name, TOOL_ARGS[def.name] ?? {}, ctx);
            const ms = Date.now() - t0;
            if (r?.xato) rows.push({ nom: def.name, holat: 'XATO', izoh: short(r.xato), ms });
            else {
                const count = r.jami ?? r.topildi ?? r.tugayotgan ?? r.shifokorlar?.length ?? r.tolovlar_soni;
                const bosh = count === 0 || count === undefined && !Object.keys(r).length;
                rows.push({
                    nom: def.name,
                    holat: bosh ? 'BO\'SH' : 'OK',
                    izoh: short(r), ms,
                });
            }
        } catch (e: any) {
            rows.push({ nom: def.name, holat: 'XATO', izoh: short(e?.message), ms: Date.now() - t0 });
        }
    }

    console.log('\nHARAKATLAR (faqat ko\'rib chiqish — hech narsa yozilmaydi)');
    for (const def of ACTION_DEFS) {
        const t0 = Date.now();
        try {
            const r = await previewAction(def.name, ACTION_ARGS[def.name] ?? {}, ctx, today);
            const ms = Date.now() - t0;
            if (r.xato) {
                // Ba'zi "xato" lar aslida to'g'ri xatti-harakat: bo'sh guruh,
                // band vaqt, bir nechta nomzod. Ular alohida belgilanadi.
                rows.push({ nom: def.name, holat: 'BO\'SH', izoh: short(r.xato), ms });
            } else if (r.preview?.choices?.length) {
                rows.push({ nom: def.name, holat: 'OK', izoh: `tanlash kartasi · ${r.preview.choices.length} nomzod`, ms });
            } else {
                rows.push({ nom: def.name, holat: 'OK', izoh: short(r.preview?.summary), ms });
            }
        } catch (e: any) {
            rows.push({ nom: def.name, holat: 'XATO', izoh: short(e?.message), ms: Date.now() - t0 });
        }
    }

    // ─── Natija ──────────────────────────────────────────────────────────
    const mark = (h: Row['holat']) => (h === 'OK' ? '✓' : h === 'BO\'SH' ? '·' : '✗');
    console.log('');
    for (const r of rows) {
        console.log(`${mark(r.holat)} ${r.nom.padEnd(20)} ${String(r.ms + 'ms').padStart(7)}  ${r.izoh}`);
    }

    const broken = rows.filter(r => r.holat === 'XATO');
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`OK: ${rows.filter(r => r.holat === 'OK').length} · `
        + `bo'sh: ${rows.filter(r => r.holat === 'BO\'SH').length} · `
        + `buzuq: ${broken.length}`);
    if (broken.length) {
        console.log('\nBUZUQ:');
        broken.forEach(r => console.log(`  ${r.nom}: ${r.izoh}`));
    }

    await prisma.$disconnect();
    process.exit(broken.length ? 1 : 0);
})();
