/**
 * Xodimlar ruxsatlari — yagona katalog, shablonlar va tekshiruv.
 *
 * ⚠️ Bu fayl `backend/permissions.ts` bilan BAYT-BAYT bir xil bo'lishi shart:
 * backend alohida tsconfig bilan yig'iladi, umumiy fayl import qilib bo'lmaydi.
 * Birini o'zgartirsangiz: `cp utils/permissions.ts backend/permissions.ts`.
 * Aks holda interfeys tugmani ko'rsatib, server uni rad etadi (yoki aksincha).
 * Shuning uchun faylda hech qanday import yo'q.
 *
 * Saqlanishi: `Clinic.accessControl` (JSON matn) — yangi ustun yoki migratsiya yo'q.
 *   { doctor: { ...eski bayroqlar, perms }, receptionist: { ...eski bayroqlar, perms } }
 * Eski bayroqlar (hiddenModules, showFinance, showPatientPhone, seeAllPatients,
 * canTakePayment) `perms` dan hisoblanib yoniga yoziladi — keshdagi eski ilova
 * versiyasi ham to'g'ri ishlashi uchun. `perms` yo'q bo'lsa, eski bayroqlardan
 * o'qiladi.
 *
 * Asosiy qoida: sozlamaga tegmagan klinikada hech narsa o'zgarmaydi — "Standart"
 * shablon ruxsatlar jadvali paydo bo'lishidan oldingi xatti-harakatning aynan o'zi.
 */

export type PermRole = 'doctor' | 'receptionist';
export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
export type PermLevel = 'simple' | 'standard' | 'full';

export interface PermSectionDef {
    id: string;
    name: string;
    hint?: string;
    acts: PermAction[];
    /** Bo'lim ochiq bo'lsa har doim ko'rinadi — "Ko'rish" katagini o'chirib bo'lmaydi */
    fixedView?: boolean;
}

export interface PermSpecialDef {
    id: string;
    name: string;
    desc?: string;
    /** Foizli chegara (0–100), yoqish/o'chirish emas */
    limit?: boolean;
    /** Xavfli amal — sozlash sahifasida belgi bilan ko'rsatiladi */
    warn?: boolean;
}

export interface PermModuleDef {
    id: string;
    name: string;
    roles: PermRole[];
    /** Menyudagi sahifa. false — sahifa emas, ilova bo'ylab amal qiladigan imkoniyatlar guruhi */
    menu: boolean;
    /** "Faqat o'zinikini / hammasini" tanlovi qaysi rollarda bor */
    scopeRoles?: PermRole[];
    scopeLabel?: string;
    note?: string;
    sections: PermSectionDef[];
    specials: PermSpecialDef[];
}

export const PERM_ACTIONS: { id: PermAction; label: string; code: string }[] = [
    { id: 'view', label: "Ko'rish", code: 'v' },
    { id: 'create', label: "Qo'shish", code: 'c' },
    { id: 'edit', label: 'Tahrirlash', code: 'e' },
    { id: 'delete', label: "O'chirish", code: 'd' },
    { id: 'export', label: 'Eksport', code: 'x' },
];

const CODE: Record<PermAction, string> = { view: 'v', create: 'c', edit: 'e', delete: 'd', export: 'x' };
const ORDER = 'vcedx';
const BOTH: PermRole[] = ['doctor', 'receptionist'];
const FRONT: PermRole[] = ['receptionist'];

export const PERM_MODULES: PermModuleDef[] = [
    {
        id: 'patients', name: 'Bemorlar', roles: BOTH, menu: true,
        scopeRoles: ['doctor'], scopeLabel: "Qaysi bemor va qabullarni ko'radi",
        sections: [
            { id: 'card', name: 'Bemor kartasi', hint: 'Ism, telefon, manzil, shifokor', acts: ['view', 'create', 'edit', 'delete', 'export'], fixedView: true },
            { id: 'history', name: 'Kasallik tarixi', hint: 'Allergiya, surunkali kasalliklar', acts: ['view', 'edit'] },
            { id: 'chart', name: 'Tish kartasi', acts: ['view', 'edit'] },
            { id: 'photos', name: 'Suratlar va rentgen', acts: ['view', 'create', 'delete'] },
            { id: 'payhist', name: "To'lovlar tarixi", hint: "Bemor kartasidagi to'lovlar va bo'lib to'lash", acts: ['view'] },
        ],
        specials: [
            { id: 'phone', name: "Telefon raqamlarini ko'rish", desc: "O'chirilsa, raqam yulduzcha bilan ko'rinadi: +*** ** *** ** 67" },
            { id: 'message', name: 'Bemorga xabar yuborish', desc: 'Bemor kartasidan SMS yoki Telegram' },
        ],
    },
    {
        id: 'calendar', name: 'Kalendar', roles: BOTH, menu: true,
        note: "Shifokor qaysi qabullarni ko'rishi Bemorlar bo'limidagi tanlovga bog'liq",
        sections: [
            { id: 'appts', name: 'Qabullar', hint: "Tahrirlash — kun va vaqtni ko'chirish. O'chirish — qabulni o'chirish", acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [
            { id: 'remind', name: 'Eslatma yuborish', desc: 'Qabul haqida bemorga xabar' },
        ],
    },
    {
        id: 'money', name: "Pul va to'lovlar", roles: BOTH, menu: false,
        note: "Bosh sahifa, bemor kartasi va Kassada bir xil amal qiladi",
        sections: [],
        specials: [
            { id: 'payCreate', name: "To'lov qabul qilish", desc: "Bemordan pul olish, qarzni yopish, avans" },
            { id: 'payEdit', name: "To'lovni tahrirlash", desc: "Summasi, usuli yoki holatini o'zgartirish", warn: true },
            { id: 'payDelete', name: "To'lovni o'chirish", desc: "O'chirilgani Kassa tarixida qoladi", warn: true },
            { id: 'discount', name: 'Chegirma berish', desc: "Bitta to'lovda eng ko'pi bilan. 0 — chegirma bera olmaydi", limit: true },
            { id: 'waive', name: 'Bepul deb yopish', desc: 'Tugagan qabulni pul olmasdan yopish' },
            { id: 'backdate', name: "O'tgan sanaga yozish", desc: "Kechagi yoki undan oldingi kunga to'lov" },
            { id: 'amounts', name: "Tushum summalarini ko'rish", desc: "Bosh sahifadagi tushum, o'rtacha chek va qarz summalari" },
        ],
    },
    {
        id: 'finance', name: 'Kassa', roles: FRONT, menu: true,
        sections: [
            { id: 'cashbook', name: 'Kunlik kassa', acts: ['view', 'export'], fixedView: true },
            { id: 'expenses', name: 'Xarajatlar', acts: ['view', 'create', 'edit', 'delete'] },
            { id: 'reports', name: 'Hisobot', hint: 'Tushum, foyda, shifokor ulushi', acts: ['view', 'export'] },
        ],
        specials: [
            { id: 'closeday', name: 'Kunni yopish', desc: 'Kun oxirida kassani sanab yopish' },
            { id: 'reopen', name: 'Yopilgan kunni qayta ochish', desc: "Yopilgan kassaga o'zgartirish kiritish", warn: true },
            { id: 'encash', name: 'Inkassatsiya va qaytarish', desc: 'Kassadan pul olish, bemorga qaytarish, kassaga pul solish' },
        ],
    },
    {
        id: 'leads', name: 'Lidlar', roles: FRONT, menu: true,
        sections: [
            { id: 'leads', name: 'Lidlar', hint: 'Reklama va saytdan kelgan murojaatlar', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [
            { id: 'convert', name: 'Bemorga aylantirish', desc: 'Liddan bemor kartasi va qabul ochish' },
        ],
    },
    {
        id: 'doctors', name: 'Xodimlar', roles: FRONT, menu: true,
        note: "Ruxsatlarni faqat klinika egasi o'zgartiradi",
        sections: [
            { id: 'list', name: "Xodimlar ro'yxati", acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
            { id: 'stats', name: 'Statistika', hint: "Xodimlarning ish ko'rsatkichlari", acts: ['view'] },
        ],
        specials: [],
    },
    {
        id: 'inventory', name: 'Ombor', roles: FRONT, menu: true,
        sections: [
            { id: 'items', name: 'Mahsulotlar', acts: ['view', 'create', 'delete'], fixedView: true },
            { id: 'moves', name: 'Kirim va chiqim', acts: ['create'] },
        ],
        specials: [],
    },
    {
        id: 'lab', name: 'Laboratoriya', roles: BOTH, menu: true,
        sections: [
            { id: 'orders', name: 'Buyurtmalar', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [],
    },
    { id: 'queue', name: 'Onlayn navbat', roles: BOTH, menu: true, sections: [], specials: [] },
    {
        id: 'messages', name: 'Xabarlar', roles: FRONT, menu: true,
        sections: [],
        specials: [
            { id: 'bulk', name: "Ko'p bemorga yuborish", desc: "Tanlangan guruhga qo'lda — pulli SMS", warn: true },
            { id: 'automation', name: 'Shablon va avtomatik xabarlar', desc: 'Shablonlarni va avtomatik yuborish qoidalarini sozlash' },
        ],
    },
    {
        id: 'settings', name: 'Sozlamalar', roles: FRONT, menu: true,
        sections: [
            { id: 'services', name: 'Xizmatlar va narxlar', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
            { id: 'clinic', name: 'Klinika sozlamalari', hint: "Ma'lumotlar, imkoniyatlar, integratsiyalar", acts: ['view', 'edit'] },
        ],
        specials: [],
    },
];

export interface ModulePerm {
    on: boolean;
    scope: 'own' | 'all';
    /** Bo'lim → ruxsat harflari: v ko'rish, c qo'shish, e tahrirlash, d o'chirish, x eksport */
    cells: Record<string, string>;
    sp: Record<string, boolean | number>;
}
export type RolePerms = Record<string, ModulePerm>;

type Spec = Record<string, { on?: boolean; scope?: 'own' | 'all'; c?: Record<string, string>; s?: Record<string, boolean | number> }>;

// ── Shablonlar ────────────────────────────────────────────────────────────────
// STANDART — ruxsatlar jadvalidan oldingi xatti-harakat: resepshn deyarli hamma
// narsani qiladi (kassa ham uning qo'lida), shifokor esa klinik ishni.
// Faqat klinika egasiga tegishli bo'lgan narsalar (hisobot, yopilgan kunni
// ochish, bepul yopish) standartda yopiq — ular ilgari ham shunday edi.
const STANDARD: Record<PermRole, Spec> = {
    receptionist: {
        patients: { on: true, c: { card: 'vcedx', history: 've', chart: 've', photos: 'vcd', payhist: 'v' }, s: { phone: true, message: true } },
        calendar: { on: true, c: { appts: 'vced' }, s: { remind: true } },
        money: { on: true, s: { payCreate: true, payEdit: true, payDelete: true, discount: 100, waive: false, backdate: true, amounts: true } },
        finance: { on: true, c: { cashbook: 'vx', expenses: 'vc', reports: '' }, s: { closeday: true, reopen: false, encash: true } },
        leads: { on: true, c: { leads: 'vced' }, s: { convert: true } },
        doctors: { on: true, c: { list: 'vced', stats: 'v' } },
        inventory: { on: true, c: { items: 'vcd', moves: 'c' } },
        lab: { on: true, c: { orders: 'vced' } },
        queue: { on: true },
        messages: { on: true, s: { bulk: true, automation: true } },
        settings: { on: true, c: { services: 'vced', clinic: 've' } },
    },
    doctor: {
        patients: { on: true, scope: 'own', c: { card: 'vcedx', history: 've', chart: 've', photos: 'vcd', payhist: 'v' }, s: { phone: true, message: true } },
        calendar: { on: true, c: { appts: 'vced' }, s: { remind: true } },
        money: { on: true, s: { payCreate: true, payEdit: false, payDelete: false, discount: 100, waive: false, backdate: false, amounts: true } },
        lab: { on: true, c: { orders: 'vced' } },
        queue: { on: true },
    },
};

// SODDA — faqat kundalik ish; o'chirish va pulga oid xavfli amallar yopiq.
const SIMPLE: Record<PermRole, Spec> = {
    receptionist: {
        patients: { on: true, c: { card: 'vce', history: 'v', chart: 'v', photos: 'v', payhist: 'v' }, s: { phone: true, message: true } },
        calendar: { on: true, c: { appts: 'vced' }, s: { remind: true } },
        money: { on: true, s: { payCreate: true, payEdit: false, payDelete: false, discount: 10, waive: false, backdate: false, amounts: true } },
        finance: { on: true, c: { cashbook: 'v', expenses: 'v', reports: '' }, s: { closeday: true, reopen: false, encash: false } },
        queue: { on: true },
    },
    doctor: {
        patients: { on: true, scope: 'own', c: { card: 'vce', history: 've', chart: 've', photos: 'vc', payhist: 'v' }, s: { phone: true, message: true } },
        calendar: { on: true, c: { appts: 'vce' }, s: { remind: true } },
        money: { on: true, s: { payCreate: true, payEdit: false, payDelete: false, discount: 10, waive: false, backdate: false, amounts: false } },
        queue: { on: true },
    },
};

export const PERM_LEVELS: { id: PermLevel; label: string }[] = [
    { id: 'simple', label: 'Sodda' },
    { id: 'standard', label: 'Standart' },
    { id: 'full', label: "To'liq" },
];

export const modulesForRole = (role: PermRole): PermModuleDef[] => PERM_MODULES.filter(m => m.roles.includes(role));

const normalizeCells = (value: string, sec: PermSectionDef): string => {
    const allowed = sec.acts.map(a => CODE[a]).join('');
    let v = String(value || '').split('').filter(ch => allowed.includes(ch)).join('');
    // "Ko'rish"siz boshqa amal ma'nosiz — qo'shish/tahrirlash ko'rishni ham anglatadi
    if (sec.acts.includes('view') && (sec.fixedView || v.length > 0) && !v.includes('v')) v = 'v' + v;
    return ORDER.split('').filter(ch => v.includes(ch)).join('');
};

const clampLimit = (n: unknown): number => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
};

function blankPerms(role: PermRole): RolePerms {
    const p: RolePerms = {};
    for (const m of modulesForRole(role)) {
        const t: ModulePerm = { on: false, scope: 'all', cells: {}, sp: {} };
        for (const s of m.sections) t.cells[s.id] = normalizeCells('', s);
        for (const s of m.specials) t.sp[s.id] = s.limit ? 0 : false;
        p[m.id] = t;
    }
    if (p.money) p.money.on = true; // menyu emas — har doim amal qiladi
    return p;
}

function fromSpec(role: PermRole, spec: Spec): RolePerms {
    const p = blankPerms(role);
    for (const m of modulesForRole(role)) {
        const s = spec[m.id];
        if (!s) continue;
        const t = p[m.id];
        if (typeof s.on === 'boolean') t.on = s.on;
        if (s.scope) t.scope = s.scope;
        for (const sec of m.sections) if (s.c && typeof s.c[sec.id] === 'string') t.cells[sec.id] = normalizeCells(s.c[sec.id], sec);
        for (const sp of m.specials) if (s.s && s.s[sp.id] !== undefined) t.sp[sp.id] = sp.limit ? clampLimit(s.s[sp.id]) : !!s.s[sp.id];
    }
    if (p.money) p.money.on = true;
    return p;
}

function fullPerms(role: PermRole): RolePerms {
    const p = blankPerms(role);
    for (const m of modulesForRole(role)) {
        const t = p[m.id];
        t.on = true;
        t.scope = 'all';
        for (const s of m.sections) t.cells[s.id] = normalizeCells(s.acts.map(a => CODE[a]).join(''), s);
        for (const s of m.specials) t.sp[s.id] = s.limit ? 100 : true;
    }
    return p;
}

export function presetPerms(role: PermRole, level: PermLevel): RolePerms {
    if (level === 'full') return fullPerms(role);
    return fromSpec(role, (level === 'simple' ? SIMPLE : STANDARD)[role]);
}

/** Saqlangan ruxsatlarni katalog bo'yicha tozalaydi; yetishmagan kalitlar Standart'dan olinadi */
function mergeStored(role: PermRole, stored: any): RolePerms {
    const p = presetPerms(role, 'standard');
    for (const m of modulesForRole(role)) {
        const s = stored?.[m.id];
        if (!s || typeof s !== 'object') continue;
        const t = p[m.id];
        if (typeof s.on === 'boolean') t.on = s.on;
        if (s.scope === 'own' || s.scope === 'all') t.scope = s.scope;
        for (const sec of m.sections) {
            const v = s.cells?.[sec.id];
            if (typeof v === 'string') t.cells[sec.id] = normalizeCells(v, sec);
        }
        for (const sp of m.specials) {
            const v = s.sp?.[sp.id];
            if (sp.limit ? typeof v === 'number' : typeof v === 'boolean') t.sp[sp.id] = sp.limit ? clampLimit(v) : v;
        }
    }
    if (p.money) p.money.on = true;
    return p;
}

/** Jadvaldan oldingi bayroqlar → ruxsatlar (klinika hali yangi sahifada saqlamagan bo'lsa) */
function fromLegacy(role: PermRole, legacy: any): RolePerms {
    const p = presetPerms(role, 'standard');
    const hidden: string[] = Array.isArray(legacy?.hiddenModules) ? legacy.hiddenModules : [];
    for (const id of hidden) if (p[id] && id !== 'money') p[id].on = false;
    if (legacy?.showFinance === false) {
        p.money.sp.amounts = false;
        // Ilgari "moliyani ko'rsatmaslik" Kassa bo'limini ham yashirardi
        if (p.finance) p.finance.on = false;
    }
    if (legacy?.showPatientPhone === false && p.patients) p.patients.sp.phone = false;
    if (legacy?.canTakePayment === false) p.money.sp.payCreate = false;
    if (role === 'doctor' && p.patients) p.patients.scope = legacy?.seeAllPatients === true ? 'all' : 'own';
    return p;
}

export function parseAccessControlRaw(raw: unknown): any {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/** Klinika sozlamasidan (matn yoki obyekt) rol ruxsatlari */
export function resolveRolePerms(role: PermRole, accessControl: unknown): RolePerms {
    const ac = parseAccessControlRaw(accessControl);
    const entry = ac?.[role];
    if (entry && typeof entry === 'object' && entry.perms && typeof entry.perms === 'object') return mergeStored(role, entry.perms);
    if (entry && typeof entry === 'object') return fromLegacy(role, entry);
    return presetPerms(role, 'standard');
}

/** Saqlashda eski bayroqlar ham yoziladi — keshdagi eski ilova ham to'g'ri ishlasin */
export function legacyFlags(role: PermRole, p: RolePerms) {
    return {
        hiddenModules: modulesForRole(role).filter(m => m.menu && !p[m.id]?.on).map(m => m.id),
        showFinance: p.money?.sp.amounts !== false,
        showPatientPhone: p.patients?.sp.phone !== false,
        seeAllPatients: role === 'doctor' ? p.patients?.scope === 'all' : true,
        canTakePayment: !!p.money?.sp.payCreate,
    };
}

export function buildAccessControl(perms: Record<PermRole, RolePerms>) {
    return {
        doctor: { ...legacyFlags('doctor', perms.doctor), perms: perms.doctor },
        receptionist: { ...legacyFlags('receptionist', perms.receptionist), perms: perms.receptionist },
    };
}

/** Qaysi shablonga to'liq mos keladi (aks holda null — qo'lda sozlangan) */
export function matchingLevel(role: PermRole, p: RolePerms): PermLevel | null {
    const key = JSON.stringify(p);
    for (const l of PERM_LEVELS) if (JSON.stringify(presetPerms(role, l.id)) === key) return l.id;
    return null;
}

export function countPerms(m: PermModuleDef, t: ModulePerm): { on: number; total: number } {
    let on = 0;
    let total = 0;
    for (const s of m.sections) {
        const editable = s.acts.filter(a => !(a === 'view' && s.fixedView));
        total += editable.length;
        on += editable.filter(a => (t.cells[s.id] || '').includes(CODE[a])).length;
    }
    for (const s of m.specials) {
        total += 1;
        const v = t.sp[s.id];
        if (s.limit ? Number(v) > 0 : v === true) on += 1;
    }
    return { on, total };
}

// ── Tekshiruv ─────────────────────────────────────────────────────────────────

export interface PermChecker {
    /** Klinika egasi (va boshqa cheklanmaydigan rollar) — hamma narsa mumkin */
    owner: boolean;
    role: PermRole | null;
    perms: RolePerms | null;
    /** Menyuda ko'rinadimi (sahifaga kira oladimi) */
    menu(moduleId: string): boolean;
    can(moduleId: string, sectionId: string, action: PermAction): boolean;
    flag(moduleId: string, specialId: string): boolean;
    /** Foizli chegara, masalan chegirma: 0–100 */
    limit(moduleId: string, specialId: string): number;
    /** Shifokor klinikadagi barcha bemor va qabullarni ko'radimi */
    scopeAll(): boolean;
}

export const toPermRole = (userRole: unknown): PermRole | null =>
    userRole === 'DOCTOR' ? 'doctor' : userRole === 'RECEPTIONIST' ? 'receptionist' : null;

const OPEN: PermChecker = {
    owner: true, role: null, perms: null,
    menu: () => true, can: () => true, flag: () => true, limit: () => 100, scopeAll: () => true,
};

export function makePermChecker(userRole: unknown, accessControl: unknown): PermChecker {
    const role = toPermRole(userRole);
    // Klinika egasi, super admin va laborant jadval bilan cheklanmaydi
    if (!role) return OPEN;
    const perms = resolveRolePerms(role, accessControl);
    const moduleOn = (id: string): ModulePerm | null => {
        const def = PERM_MODULES.find(m => m.id === id);
        const t = perms[id];
        if (!def || !t || !def.roles.includes(role)) return null;
        if (def.menu && !t.on) return null;
        return t;
    };
    return {
        owner: false, role, perms,
        menu: id => !!moduleOn(id),
        can: (mid, sid, action) => {
            const t = moduleOn(mid);
            if (!t) return false;
            const sec = PERM_MODULES.find(m => m.id === mid)!.sections.find(s => s.id === sid);
            if (!sec || !sec.acts.includes(action)) return false;
            if (action === 'view' && sec.fixedView) return true;
            return (t.cells[sid] || '').includes(CODE[action]);
        },
        flag: (mid, id) => {
            const t = moduleOn(mid);
            if (!t) return false;
            const v = t.sp[id];
            return typeof v === 'number' ? v > 0 : v === true;
        },
        limit: (mid, id) => {
            const t = moduleOn(mid);
            return t ? clampLimit(t.sp[id]) : 0;
        },
        scopeAll: () => role !== 'doctor' || perms.patients?.scope === 'all',
    };
}
