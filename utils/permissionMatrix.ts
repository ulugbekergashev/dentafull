/**
 * Ruxsatlar jadvali (Xodimlar → Ruxsatlar) — qatorlar katalogi.
 *
 * Saqlanish o'zgarmaydi: har bir qator `utils/permissions.ts` dagi o'sha
 * ma'lumotga tushadi — bo'lim harflari (v/c/e/d/x), maxsus amal bayrog'i,
 * foizli chegara yoki shifokorning ko'rish doirasi. Qator faqat o'z `mask`
 * idagi harflarni o'zgartiradi, qolganiga tegmaydi. Shuning uchun backend bu
 * faylni bilmaydi va `backend/permissions.ts` ga nusxa kerak emas.
 *
 * Bo'limning birinchi qatori — "eshik" (kind: 'gate'): Yo'q bo'lsa modul o'chadi
 * va menyuda chiqmaydi, qolgan qatorlarning qiymati saqlanib turadi.
 *
 * Eski jadvalda qo'lda belgilangan va hech bir variantga to'g'ri kelmaydigan
 * holat ("qo'shadi, lekin tahrirlamaydi" kabi) o'qilganda "Qo'lda sozlangan"
 * bo'lib ko'rinadi va egasi o'sha qatorni o'zgartirmaguncha o'z holicha qoladi.
 */
import { PermRole, PermLevel, RolePerms, PermSectionDef, PERM_MODULES, PERM_ACTIONS, presetPerms } from './permissions';

export type MatrixTone = 'none' | 'view' | 'edit';
export type MatrixIcon = 'eye' | 'pen' | 'check' | 'user' | 'users';

export interface MatrixOption {
    id: string;
    label: string;
    desc: string;
    tone: MatrixTone;
    /** O'zgartirmaydi, faqat ko'radi — "Faqat ko'radi" guruh amali shu variantni tanlaydi */
    ro?: boolean;
    icon?: MatrixIcon;
    /** gate/cells: bo'lim harflari (qator faqat o'z mask'idagilarini yozadi) */
    letters?: string;
    /** flag: true/false; limit: foiz */
    value?: boolean | number;
    scope?: 'own' | 'all';
}

export type MatrixRowKind = 'gate' | 'cells' | 'flag' | 'limit' | 'scope';

export interface MatrixRow {
    id: string;
    name: string;
    hint?: string;
    kind: MatrixRowKind;
    section?: string;
    /** Qator boshqaradigan harflar */
    mask?: string;
    special?: string;
    /** Faqat shu rollarda (bo'lmasa — modulning hamma rollarida) */
    roles?: PermRole[];
    /** Sozlanmaydigan, doimiy qiymat (masalan, resepshn hamma bemorni ko'radi) */
    fixed?: Partial<Record<PermRole, string>>;
    /** Shu indeksdagi va undan kuchli variantlar xavfli — sariq rang bilan ko'rinadi */
    warnFrom?: number;
    opts: MatrixOption[];
}

export interface MatrixGroup {
    /** Modul id'si (PERM_MODULES) */
    id: string;
    name: string;
    note?: string;
    rows: MatrixRow[];
}

const levels = (off: string, view: string, edit: string, editLetters: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', letters: '' },
    { id: 'view', label: "Ko'radi", desc: view, tone: 'view', ro: true, icon: 'eye', letters: 'v' },
    { id: 'edit', label: "O'zgartiradi", desc: edit, tone: 'edit', icon: 'pen', letters: editLetters },
];
const bit = (letter: string, on: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: 'Bu amalni bajara olmaydi', tone: 'none', letters: '' },
    { id: 'allow', label: 'Ruxsat', desc: on, tone: 'edit', icon: 'check', letters: letter },
];
const seeBit = (off: string, on: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', letters: '' },
    { id: 'view', label: "Ko'radi", desc: on, tone: 'view', ro: true, icon: 'eye', letters: 'v' },
];
const flag = (on: string, off = 'Bu amalni bajara olmaydi'): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', value: false },
    { id: 'allow', label: 'Ruxsat', desc: on, tone: 'edit', icon: 'check', value: true },
];
const seeFlag = (off: string, on: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', value: false },
    { id: 'view', label: "Ko'radi", desc: on, tone: 'view', ro: true, icon: 'eye', value: true },
];
const pct = (n: number): MatrixOption => ({ id: `p${n}`, label: `${n}% gacha`, desc: `Bitta to'lovda ${n}% gacha`, tone: 'view', icon: 'check', value: n });

export const PERM_MATRIX: MatrixGroup[] = [
    {
        id: 'patients', name: 'Bemorlar', rows: [
            { id: 'card', name: 'Bemor kartasi', hint: 'Ism, telefon, manzil, shifokor', kind: 'gate', section: 'card', mask: 'ce',
              opts: levels("Bemorlar bo'limi menyuda chiqmaydi", "Kartani ochadi, o'zgartira olmaydi", "Yangi bemor qo'shadi va kartani tahrirlaydi", 'vce') },
            { id: 'scope', name: 'Qaysi bemorlar', hint: 'Kalendarda ham shu amal qiladi', kind: 'scope', roles: ['doctor'], fixed: { receptionist: 'Hammasini' },
              opts: [
                  { id: 'own', label: "O'zinikini", desc: "Faqat o'ziga yozilgan bemorlar va qabullar", tone: 'view', icon: 'user', scope: 'own' },
                  { id: 'all', label: 'Hammasini', desc: 'Klinikadagi barcha bemor va qabullar', tone: 'edit', icon: 'users', scope: 'all' },
              ] },
            { id: 'delete', name: "Bemorni o'chirish", kind: 'cells', section: 'card', mask: 'd', warnFrom: 1, opts: bit('d', "Bemor kartasini butunlay o'chiradi") },
            { id: 'export', name: "Excel'ga yuklash", hint: "Bemorlar ro'yxatini faylga olish", kind: 'cells', section: 'card', mask: 'x', opts: bit('x', "Ro'yxatni Excel faylga yuklab oladi") },
            { id: 'history', name: 'Kasallik tarixi', hint: 'Allergiya, surunkali kasalliklar', kind: 'cells', section: 'history', mask: 've',
              opts: levels("Kartada bu qism ko'rinmaydi", "O'qiydi, o'zgartira olmaydi", 'Yozadi va tuzatadi', 've') },
            { id: 'chart', name: 'Tish kartasi', hint: 'Tishlar holati', kind: 'cells', section: 'chart', mask: 've',
              opts: levels("Kartada bu qism ko'rinmaydi", "Ko'radi, o'zgartira olmaydi", 'Tishlarni belgilaydi va tuzatadi', 've') },
            { id: 'photos', name: 'Suratlar va rentgen', kind: 'cells', section: 'photos', mask: 'vcd', opts: [
                { id: 'none', label: "Yo'q", desc: "Kartada suratlar ko'rinmaydi", tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Suratlarni ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'upload', label: 'Yuklaydi', desc: "Yangi surat yuklaydi, o'chira olmaydi", tone: 'edit', icon: 'pen', letters: 'vc' },
                { id: 'full', label: "To'liq", desc: "Yuklaydi va o'chiradi", tone: 'edit', icon: 'pen', letters: 'vcd' },
            ] },
            { id: 'payhist', name: "To'lovlar tarixi", hint: "Kartadagi to'lovlar va bo'lib to'lash", kind: 'cells', section: 'payhist', mask: 'v',
              opts: seeBit("Kartada to'lovlar ko'rinmaydi", "To'lovlarni ko'radi") },
            { id: 'phone', name: 'Telefon raqami', hint: "Yo'q bo'lsa: +*** ** *** ** 67", kind: 'flag', special: 'phone',
              opts: seeFlag("Raqam yulduzcha bilan ko'rinadi", "To'liq raqamni ko'radi") },
            { id: 'message', name: 'Bemorga xabar', hint: 'Kartadan SMS yoki Telegram', kind: 'flag', special: 'message', opts: flag('Kartadan SMS yoki Telegram yuboradi') },
        ],
    },
    {
        id: 'calendar', name: 'Kalendar', rows: [
            { id: 'appts', name: 'Qabullar', kind: 'gate', section: 'appts', mask: 'ce',
              opts: levels('Kalendar menyuda chiqmaydi', "Qabullarni ko'radi, yoza olmaydi", "Qabul yozadi, kun va vaqtini ko'chiradi", 'vce') },
            { id: 'delete', name: "Qabulni o'chirish", kind: 'cells', section: 'appts', mask: 'd', opts: bit('d', "Qabulni kalendardan o'chiradi") },
            { id: 'remind', name: 'Eslatma yuborish', hint: 'Qabul haqida bemorga xabar', kind: 'flag', special: 'remind', opts: flag('Bemorga qabul haqida xabar yuboradi') },
        ],
    },
    {
        id: 'money', name: "Pul va to'lovlar", note: 'Bosh sahifa, bemor kartasi va Kassada bir xil amal qiladi', rows: [
            { id: 'payCreate', name: "To'lov qabul qilish", hint: 'Bemordan pul olish, qarzni yopish, avans', kind: 'flag', special: 'payCreate',
              opts: flag('Bemordan pul oladi, qarzni yopadi', "O'zi pul olmaydi — kassaga yuboradi") },
            { id: 'discount', name: 'Chegirma', hint: "Bitta to'lovda eng ko'pi bilan", kind: 'limit', special: 'discount', warnFrom: 5, opts: [
                { id: 'p0', label: "Yo'q", desc: 'Chegirma bera olmaydi', tone: 'none', value: 0 },
                pct(5), pct(10), pct(20), pct(50),
                { id: 'p100', label: 'Cheklovsiz', desc: 'Istalgan chegirma, bepulgacha', tone: 'edit', icon: 'check', value: 100 },
            ] },
            { id: 'payEdit', name: "To'lovni tahrirlash", hint: 'Summasi, usuli yoki holati', kind: 'flag', special: 'payEdit', warnFrom: 1, opts: flag("Kiritilgan to'lovni o'zgartiradi") },
            { id: 'payDelete', name: "To'lovni o'chirish", hint: "O'chirilgani Kassa tarixida qoladi", kind: 'flag', special: 'payDelete', warnFrom: 1, opts: flag("To'lovni o'chiradi") },
            { id: 'waive', name: 'Bepul deb yopish', hint: 'Tugagan qabulni pul olmasdan yopish', kind: 'flag', special: 'waive', warnFrom: 1, opts: flag('Qabulni pulsiz yopadi') },
            { id: 'backdate', name: "O'tgan sanaga yozish", hint: "Kechagi yoki undan oldingi kunga to'lov", kind: 'flag', special: 'backdate', warnFrom: 1, opts: flag("O'tgan kunga to'lov yozadi") },
            { id: 'amounts', name: 'Tushum summalari', hint: "Bosh sahifada tushum, o'rtacha chek va qarz", kind: 'flag', special: 'amounts',
              opts: seeFlag("Summalar ko'rinmaydi", "Summalarni ko'radi") },
        ],
    },
    {
        id: 'finance', name: 'Kassa', rows: [
            { id: 'cashbook', name: 'Kunlik kassa', hint: 'Kirim va chiqimlar', kind: 'gate', section: 'cashbook', mask: 'x', opts: [
                { id: 'none', label: "Yo'q", desc: 'Kassa menyuda chiqmaydi', tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Kunlik kassani ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'viewx', label: "Ko'radi + Excel", desc: "Ko'radi va Excel faylga yuklab oladi", tone: 'view', ro: true, icon: 'eye', letters: 'vx' },
            ] },
            { id: 'expenses', name: 'Xarajatlar', kind: 'cells', section: 'expenses', mask: 'vced', opts: [
                { id: 'none', label: "Yo'q", desc: "Xarajatlar ko'rinmaydi", tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Xarajatlarni ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'add', label: "Qo'shadi", desc: "Yangi xarajat yozadi, keyin o'zgartira olmaydi", tone: 'edit', icon: 'pen', letters: 'vc' },
                { id: 'full', label: "To'liq", desc: "Qo'shadi, tuzatadi va o'chiradi", tone: 'edit', icon: 'pen', letters: 'vced' },
            ] },
            { id: 'reports', name: 'Hisobot', hint: 'Tushum, foyda, shifokor ulushi', kind: 'cells', section: 'reports', mask: 'vx', warnFrom: 1, opts: [
                { id: 'none', label: "Yo'q", desc: "Hisobot ko'rinmaydi", tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Tushum va foydani ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'viewx', label: "Ko'radi + Excel", desc: "Ko'radi va Excel faylga yuklab oladi", tone: 'view', ro: true, icon: 'eye', letters: 'vx' },
            ] },
            { id: 'closeday', name: 'Kunni yopish', hint: 'Kun oxirida kassani sanab yopish', kind: 'flag', special: 'closeday', opts: flag('Kun oxirida kassani yopadi') },
            { id: 'reopen', name: 'Yopilgan kunni ochish', hint: "Yopilgan kassaga o'zgartirish kiritish", kind: 'flag', special: 'reopen', warnFrom: 1,
              opts: flag("Yopilgan kunni qayta ochib, o'zgartiradi") },
            { id: 'encash', name: 'Inkassatsiya va qaytarish', hint: 'Kassadan pul olish, bemorga qaytarish', kind: 'flag', special: 'encash',
              opts: flag('Kassadan pul oladi va bemorga qaytaradi') },
        ],
    },
    {
        id: 'leads', name: 'Lidlar', rows: [
            { id: 'leads', name: 'Lidlar', hint: 'Reklama va saytdan kelgan murojaatlar', kind: 'gate', section: 'leads', mask: 'ce',
              opts: levels('Lidlar menyuda chiqmaydi', "Lidlarni ko'radi", "Lid qo'shadi, bosqichini o'zgartiradi", 'vce') },
            { id: 'delete', name: "Lidni o'chirish", kind: 'cells', section: 'leads', mask: 'd', opts: bit('d', "Lidni o'chiradi") },
            { id: 'convert', name: 'Bemorga aylantirish', hint: 'Liddan bemor kartasi va qabul ochish', kind: 'flag', special: 'convert',
              opts: flag('Liddan bemor kartasi va qabul ochadi') },
        ],
    },
    {
        id: 'doctors', name: 'Xodimlar', note: "Ruxsatlarni faqat klinika egasi o'zgartiradi", rows: [
            { id: 'list', name: "Xodimlar ro'yxati", kind: 'gate', section: 'list', mask: 'ced', warnFrom: 2,
              opts: levels('Xodimlar menyuda chiqmaydi', "Ro'yxatni ko'radi", "Xodim qo'shadi, tahrirlaydi, o'chiradi", 'vced') },
            { id: 'stats', name: 'Statistika', hint: "Xodimlarning ish ko'rsatkichlari", kind: 'cells', section: 'stats', mask: 'v',
              opts: seeBit("Statistika ko'rinmaydi", "Ko'rsatkichlarni ko'radi") },
        ],
    },
    {
        id: 'inventory', name: 'Ombor', rows: [
            { id: 'items', name: 'Mahsulotlar', kind: 'gate', section: 'items', mask: 'cd',
              opts: levels('Ombor menyuda chiqmaydi', "Qoldiqni ko'radi", "Mahsulot qo'shadi va o'chiradi", 'vcd') },
            { id: 'moves', name: 'Kirim va chiqim', kind: 'cells', section: 'moves', mask: 'c', opts: bit('c', 'Omborga kirim va chiqim yozadi') },
        ],
    },
    {
        id: 'lab', name: 'Laboratoriya', rows: [
            { id: 'orders', name: 'Laboratoriya', hint: 'Texnikka yuborilgan buyurtmalar', kind: 'gate', section: 'orders', mask: 'ced',
              opts: levels('Laboratoriya menyuda chiqmaydi', "Buyurtmalarni ko'radi", "Buyurtma yozadi, tahrirlaydi, o'chiradi", 'vced') },
        ],
    },
    {
        id: 'queue', name: 'Onlayn navbat', rows: [
            { id: 'queue', name: 'Onlayn navbat', hint: 'Navbat sahifasi va TV ekrani', kind: 'gate', opts: [
                { id: 'none', label: "Yo'q", desc: 'Onlayn navbat menyuda chiqmaydi', tone: 'none' },
                { id: 'allow', label: 'Ruxsat', desc: 'Navbat sahifasi va TV ekranini ochadi', tone: 'edit', icon: 'check' },
            ] },
        ],
    },
    {
        id: 'messages', name: 'Xabarlar', rows: [
            { id: 'messages', name: "Xabarlar bo'limi", hint: 'Shablonlar va yuborilgan xabarlar tarixi', kind: 'gate', opts: [
                { id: 'none', label: "Yo'q", desc: 'Xabarlar menyuda chiqmaydi', tone: 'none' },
                { id: 'view', label: "Ko'radi", desc: "Shablon va tarixni ko'radi", tone: 'view', ro: true, icon: 'eye' },
            ] },
            { id: 'bulk', name: "Ko'p bemorga yuborish", hint: "Tanlangan guruhga qo'lda — pulli SMS", kind: 'flag', special: 'bulk', warnFrom: 1,
              opts: flag('Guruhga birdaniga SMS yuboradi') },
            { id: 'automation', name: 'Shablon va avtomatik xabarlar', hint: 'Shablonlar va avtomatik yuborish qoidalari', kind: 'flag', special: 'automation',
              opts: flag("Shablon va qoidalarni o'zgartiradi") },
        ],
    },
    {
        id: 'settings', name: 'Sozlamalar', rows: [
            { id: 'services', name: 'Xizmatlar va narxlar', kind: 'gate', section: 'services', mask: 'ced', warnFrom: 2,
              opts: levels('Sozlamalar menyuda chiqmaydi', "Narxlarni ko'radi", "Xizmat qo'shadi, narxini o'zgartiradi, o'chiradi", 'vced') },
            { id: 'clinic', name: 'Klinika sozlamalari', hint: "Ma'lumotlar, imkoniyatlar, integratsiyalar", kind: 'cells', section: 'clinic', mask: 've',
              opts: levels("Ko'rinmaydi", "Ko'radi", "O'zgartiradi", 've') },
        ],
    },
];

// ── O'qish va yozish ──────────────────────────────────────────────────────────

const ORDER = 'vcedx';
const CODE: Record<string, string> = Object.fromEntries(PERM_ACTIONS.map(a => [a.id, a.code]));
const only = (letters: string, mask: string) => ORDER.split('').filter(ch => mask.includes(ch) && letters.includes(ch)).join('');

const moduleDef = (id: string) => PERM_MODULES.find(m => m.id === id);
const sectionDef = (moduleId: string, sectionId: string): PermSectionDef | undefined =>
    moduleDef(moduleId)?.sections.find(s => s.id === sectionId);

/** permissions.ts dagi normalizeCells bilan bir xil qoida */
function normalize(letters: string, sec: PermSectionDef): string {
    const allowed = sec.acts.map(a => CODE[a]).join('');
    let v = letters.split('').filter(ch => allowed.includes(ch)).join('');
    if (sec.acts.includes('view') && (sec.fixedView || v.length > 0) && !v.includes('v')) v = 'v' + v;
    return ORDER.split('').filter(ch => v.includes(ch)).join('');
}

export const groupHasRole = (g: MatrixGroup, role: PermRole): boolean => !!moduleDef(g.id)?.roles.includes(role);
export const rowHasRole = (g: MatrixGroup, r: MatrixRow, role: PermRole): boolean =>
    groupHasRole(g, role) && (!r.roles || r.roles.includes(role));

export interface RowRead {
    opt: MatrixOption;
    /** -1 — qo'lda sozlangan, variantlarning hech biriga to'g'ri kelmaydi */
    index: number;
    custom: boolean;
}

const WORDS: Record<string, string> = { v: "ko'radi", c: "qo'shadi", e: 'tahrirlaydi', d: "o'chiradi", x: "Excel'ga yuklaydi" };

function customRead(letters: string): RowRead {
    const words = letters.split('').map(ch => WORDS[ch]).filter(Boolean);
    return {
        opt: {
            id: 'custom', label: "Qo'lda sozlangan",
            desc: words.length ? `Avval belgilangan: ${words.join(', ')}` : "Avval belgilangan: hech narsa",
            tone: /[cedx]/.test(letters) ? 'edit' : letters ? 'view' : 'none',
        },
        index: -1, custom: true,
    };
}

export function readRow(g: MatrixGroup, r: MatrixRow, perms: RolePerms): RowRead {
    const t = perms[g.id];
    const at = (i: number): RowRead => ({ opt: r.opts[i], index: i, custom: false });
    if (!t) return at(0);
    switch (r.kind) {
        case 'gate': {
            if (!t.on) return at(0);
            if (!r.section) return at(1);
            const cur = only(t.cells[r.section] || '', r.mask || '');
            for (let i = 1; i < r.opts.length; i++) if (only(r.opts[i].letters || '', r.mask || '') === cur) return at(i);
            return customRead('v' + cur);
        }
        case 'cells': {
            const cur = only(t.cells[r.section!] || '', r.mask!);
            for (let i = 0; i < r.opts.length; i++) if (only(r.opts[i].letters || '', r.mask!) === cur) return at(i);
            return customRead(cur);
        }
        case 'flag': {
            const on = t.sp[r.special!] === true;
            return at(Math.max(0, r.opts.findIndex(o => o.value === on)));
        }
        case 'limit': {
            const n = Number(t.sp[r.special!]) || 0;
            const i = r.opts.findIndex(o => o.value === n);
            if (i >= 0) return at(i);
            return { opt: { id: 'custom', label: `${n}% gacha`, desc: `Bitta to'lovda ${n}% gacha`, tone: 'view', icon: 'check', value: n }, index: -1, custom: true };
        }
        case 'scope':
            return at(Math.max(0, r.opts.findIndex(o => o.scope === t.scope)));
    }
    return at(0);
}

/** Qatorga variant yozadi (perms ni o'zgartiradi — chaqiruvchi nusxa beradi) */
export function writeRow(g: MatrixGroup, r: MatrixRow, perms: RolePerms, opt: MatrixOption): void {
    const t = perms[g.id];
    if (!t) return;
    const setLetters = (section: string, mask: string, letters: string) => {
        const sec = sectionDef(g.id, section);
        if (!sec) return;
        const keep = (t.cells[section] || '').split('').filter(ch => !mask.includes(ch)).join('');
        t.cells[section] = normalize(keep + only(letters, mask), sec);
    };
    switch (r.kind) {
        case 'gate':
            if (opt.id === r.opts[0].id) { t.on = false; return; }
            t.on = true;
            if (r.section) setLetters(r.section, r.mask || '', opt.letters || '');
            return;
        case 'cells':
            setLetters(r.section!, r.mask!, opt.letters || '');
            return;
        case 'flag':
            t.sp[r.special!] = opt.value === true;
            return;
        case 'limit':
            t.sp[r.special!] = Number(opt.value) || 0;
            return;
        case 'scope':
            t.scope = opt.scope === 'all' ? 'all' : 'own';
            return;
    }
}

/** Qatorning saqlanadigan qismi — o'zgarganini bilish uchun */
export function rowSignature(g: MatrixGroup, r: MatrixRow, perms: RolePerms): string {
    const t = perms[g.id];
    if (!t) return '';
    switch (r.kind) {
        case 'gate': return `${t.on}|${r.section ? only(t.cells[r.section] || '', r.mask || '') : ''}`;
        case 'cells': return only(t.cells[r.section!] || '', r.mask!);
        case 'flag':
        case 'limit': return String(t.sp[r.special!]);
        case 'scope': return t.scope;
    }
    return '';
}

export const isWarn = (r: MatrixRow, read: RowRead): boolean =>
    r.warnFrom != null && (read.custom ? read.opt.tone !== 'none' : read.index >= r.warnFrom);

/** Eshik qatori Yo'q — bo'lim yopiq, menyuda chiqmaydi */
export function groupClosed(g: MatrixGroup, perms: RolePerms): boolean {
    const gate = g.rows.find(r => r.kind === 'gate');
    return !!gate && !perms[g.id]?.on;
}

/** Bo'lim ikki holatda amalda bir xilmi: yopiq bo'lim ichida saqlanib turgan qiymatlar hisobga olinmaydi */
export function groupSame(g: MatrixGroup, role: PermRole, a: RolePerms, b: RolePerms): boolean {
    if (groupClosed(g, a) && groupClosed(g, b)) return true;
    return g.rows.every(r => !rowHasRole(g, r, role) || rowSignature(g, r, a) === rowSignature(g, r, b));
}

/** Qaysi shablonga amalda to'g'ri keladi; hech biriga to'g'ri kelmasa null — qo'lda sozlangan */
export function levelOf(role: PermRole, perms: RolePerms): PermLevel | null {
    for (const level of ['standard', 'simple', 'full'] as PermLevel[]) {
        const preset = presetPerms(role, level);
        if (PERM_MATRIX.every(g => !groupHasRole(g, role) || groupSame(g, role, perms, preset))) return level;
    }
    return null;
}

export type GroupAgg = 'full' | 'view' | 'none' | 'mixed';
export type GroupAction = 'full' | 'standard' | 'view' | 'none';

/** Bo'lim bo'yicha umumiy holat (ko'rish doirasi hisobga olinmaydi — u ruxsat darajasi emas) */
export function groupAgg(g: MatrixGroup, role: PermRole, perms: RolePerms): GroupAgg {
    if (groupClosed(g, perms)) return 'none';
    const reads = g.rows.filter(r => rowHasRole(g, r, role) && r.kind !== 'scope').map(r => ({ r, read: readRow(g, r, perms) }));
    if (reads.every(x => !x.read.custom && x.read.index === x.r.opts.length - 1)) return 'full';
    if (reads.every(x => !x.read.custom && x.read.index === 0)) return 'none';
    if (reads.every(x => !x.read.custom && (x.read.opt.tone === 'none' || x.read.opt.ro))) return 'view';
    return 'mixed';
}

/** Butun bo'limni birdaniga: To'liq / Standart / Faqat ko'radi / Yo'q */
export function applyGroup(g: MatrixGroup, role: PermRole, perms: RolePerms, action: GroupAction): void {
    if (!perms[g.id]) return;
    if (action === 'standard') {
        perms[g.id] = JSON.parse(JSON.stringify(presetPerms(role, 'standard')[g.id]));
        return;
    }
    for (const r of g.rows) {
        if (!rowHasRole(g, r, role) || r.kind === 'scope') continue;
        if (action === 'none' && r.kind === 'gate') {
            // Bo'limni butunlay yopish: eshik harflarini ham tozalaymiz — shunda
            // holat shablondagi yopiq bo'lim bilan aynan bir xil bo'ladi
            writeRow(g, r, perms, r.opts[1]);
            writeRow(g, r, perms, r.opts[0]);
            continue;
        }
        const opt = action === 'full' ? r.opts[r.opts.length - 1]
            : action === 'view' ? (r.opts.find(o => o.ro) || r.opts[0])
                : r.opts[0];
        writeRow(g, r, perms, opt);
    }
}
