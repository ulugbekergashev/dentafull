// ─── Yordam botining "miyasi" ────────────────────────────────────────────────
// Bitta savolga javob tayyorlaydi. Kanalni bilmaydi (Telegram yoki ilova) —
// faqat matn oladi va natija qaytaradi; yuborish, qoralama va operatorga
// uzatish flow.ts da.
//
// Model javobni O'ZIDAN to'qimaydi:
//   • mahsulot haqidagi bilim — faqat ochilgan maqolalardan (open_article);
//   • klinika holati — faqat tekshiruv asboblaridan (tools.ts);
//   • bilmasa — escalate.
// Amallar (parol tiklash, to'lov) shu yerda BAJARILMAYDI: model faqat "taklif"
// qiladi, uni flow javob yuborilganda ishga tushiradi. Aks holda qoralama
// rejimida operator javobni hali tasdiqlamasdan mijozga tugma ketib qolardi.

import { wrapToolResult, sanitizeText } from '../ai/guard';
import type { ChatMessage, CallMeta } from '../aiService';
import type { SupportUserRow } from './identity';
import { isLinked } from './identity';
import type { Kb } from './kb';
import { bodyOf, titleOf } from './kb';
import { guideUrl, pathLabel, pathUrl, unknownPaths } from './productMap';
import type { SupportSettings } from './settings';
import type { Tools, ToolContext } from './tools';

export interface AiDeps {
    chatWithTools: (
        messages: ChatMessage[], tools: any[], execute: (name: string, args: any) => Promise<any>, opts?: any
    ) => Promise<{ reply: string; toolCalls: { name: string; args: any }[]; results: any[]; meta: CallMeta }>;
    isConfigured: () => boolean;
    /** Yordam uchun alohida kalit (SUPPORT_AI_PROVIDER / SUPPORT_AI_KEY) — bo'lsa zanjir boshiga qo'yiladi */
    supportKey?: () => { provider: string; apiKey: string } | null;
}

export interface BrainInput {
    user: SupportUserRow;
    clinicName?: string | null;
    text: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    settings: SupportSettings;
    /** Xabar bilan rasm/fayl kelgan (model uni ko'rmaydi) */
    attachment?: 'photo' | 'document' | null;
}

export type Proposal = 'password_reset' | 'payment';

export interface BrainResult {
    reply: string;
    category: string;
    articleIds: string[];
    buttons: { text: string; url: string }[];
    /** Kod tomonidan qo'shiladigan bloklar (jurnal ro'yxati kabi) */
    attachments: string[];
    escalate: { reason: string; summary: string } | null;
    proposals: Proposal[];
    /** Javobni avtomatik yuborishga to'sqinlik qiladigan belgilar */
    flags: string[];
    toolCalls: { name: string; args: any }[];
    meta: CallMeta | null;
}

const ROLE_LABEL: Record<string, string> = {
    CLINIC_ADMIN: 'klinika rahbari', DOCTOR: 'shifokor', RECEPTIONIST: 'resepshn (administrator)',
    LAB_TECHNICIAN: 'laborant', SALES_AGENT: 'sotuvchi', SUPER_ADMIN: 'DentaCRM jamoasi',
};

const fn = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
});

const OPEN_ARTICLE = fn('open_article',
    "Bilim bazasidagi maqolani ochadi. Ilovadan foydalanish haqidagi har qanday savolda AVVAL mundarijadan mos maqolani tanlab shu bilan och — javobni faqat ochilgan maqola matniga tayanib yoz.",
    { id: { type: 'string', description: "Mundarijadagi maqola nomi, masalan 'finance.take-payment'" } }, ['id']);

const ESCALATE = fn('escalate',
    "Savolni operatorga (odamga) uzatadi. Chaqir: foydalanuvchi operatorni so'rasa; javob bilim bazasida va tekshiruvlarda topilmasa; dasturda xato borligi ko'rinsa; pul qaytarish, shartnoma, narx bo'yicha kelishuv kabi qaror kerak bo'lsa; foydalanuvchi jahli chiqqan bo'lsa.",
    {
        sabab: { type: 'string', description: 'Nega uzatilyapti — bir gap' },
        xulosa: { type: 'string', description: "Operator uchun: foydalanuvchi nima so'radi, nima tekshirildi, nima topildi" },
    }, ['sabab', 'xulosa']);

const REQUEST_PASSWORD_RESET = fn('request_password_reset',
    "Shu foydalanuvchining O'Z parolini tiklash so'rovini tayyorlaydi (boshqa odamniki emas). Foydalanuvchi parolini unutganini yoki kira olmayotganini aytsa chaqir.");

const START_PAYMENT = fn('start_payment',
    "Foydalanuvchi obuna uchun to'lov qilganini aytsa yoki chek yubormoqchi bo'lsa chaqir — unga chek yuborish tugmasi ko'rsatiladi.");

/** Salom-alik va rahmat — bularga maqola kerak emas */
const SMALL_TALK = /^(salom|assalom|rahmat|raxmat|tashakkur|ok|xop|hop|yaxshi|tushunarli|привет|здравствуйте|спасибо|понятно|хорошо|салом|рахмат|раҳмат)[\s!.,а-яa-z']{0,20}$/i;

const CATEGORY_BY_TOOL: [string, string][] = [
    ['check_messaging', 'messaging'], ['check_automation', 'messaging'],
    ['check_subscription', 'subscription'], ['start_payment', 'subscription'],
    ['check_login', 'access'], ['request_password_reset', 'access'],
    ['explain_permission', 'permissions'],
    ['recent_changes', 'data'],
    ['system_status', 'bug'],
];

export const categoryOf = (toolNames: string[], linked: boolean): string => {
    for (const [tool, category] of CATEGORY_BY_TOOL) if (toolNames.includes(tool)) return category;
    if (toolNames.includes('open_article')) return 'howto';
    return linked ? 'other' : 'presales';
};

export const systemPrompt = (input: BrainInput, kbIndex: string, toolNames: string[]): string => {
    const u = input.user;
    const linked = isLinked(u);
    const langRule = u.lang === 'ru'
        ? 'Отвечай на русском языке. Названия разделов бери из русских статей.'
        : u.script === 'cyrillic'
            ? "Foydalanuvchi o'zbekchani KIRILL yozuvida yozadi — javobni ham o'zbekcha kirill yozuvida yoz (bo'lim nomlarini ham)."
            : "Javobni o'zbek tilida, lotin yozuvida yoz.";

    return [
        "Sen DentaCRM (stomatologiya klinikalari uchun CRM) ning yordam xizmatisan. Telegramda klinika xodimlarining savollariga javob berasan — ilgari bu ishni odam qilardi.",

        linked
            ? `KIM YOZYAPTI: ${sanitizeText(u.staffName || u.tgName || 'foydalanuvchi')}, ${ROLE_LABEL[u.role || ''] || u.role}` +
              (input.clinicName ? `, klinika: ${sanitizeText(input.clinicName)}.` : '.') +
              (u.verifiedVia === 'phone' ? " (telefon raqami orqali ulangan)" : '')
            : "KIM YOZYAPTI: hali ulanmagan odam — qaysi klinikadan ekani noma'lum. Unga klinika ma'lumotini ko'rsatib bo'lmaydi. " +
              "Mavjud mijoz bo'lsa: pastdagi «📱 Telefon raqamni yuborish» tugmasi yoki ilovadagi «Yordam» tugmasi orqali ulanishini ayt. " +
              "DentaCRM bilan endi tanishayotgan bo'lsa: umumiy savollarga maqolalardan javob ber, sotib olish yoki sinab ko'rish istagi bo'lsa — escalate chaqir (menejer bog'lanadi).",

        "QOIDALAR:\n" +
        "1. Ilovadan foydalanish haqidagi savolda avval open_article bilan mos maqolani och. Bo'lim, tugma va maydon nomlarini FAQAT maqoladagidek yoz — o'zingdan nom to'qima. Mundarijada mos maqola bo'lmasa, taxmin qilma: escalate chaqir.\n" +
        "2. \"Ishlamayapti\", \"ketmayapti\", \"ko'rinmayapti\" kabi shikoyatda avval tegishli tekshiruvni chaqir va sababni ANIQ ayt (\"Eskiz ulanmagan\", \"shablon tasdiqlanmagan\"), keyin nima qilishni ko'rsat. Tekshirmasdan umumiy maslahat berma.\n" +
        "3. Raqam, sana, narx va holatni faqat tekshiruv natijasidan ol. Natijada yo'q narsani aytma.\n" +
        "4. Savol noaniq bo'lsa — BITTA aniqlashtiruvchi savol ber. Tekshirib bilsa bo'ladigan narsani so'rama.\n" +
        "5. Boshqa klinika, boshqa odam haqida ma'lumot berma. Tibbiy maslahat berma. DentaCRM ga aloqasi yo'q savolga xushmuomalalik bilan rad javobi ber.\n" +
        "6. Parol tiklash va to'lov uchun tegishli asbobni chaqir — o'zing \"qildim\" dema, tugma foydalanuvchiga alohida ko'rsatiladi.\n" +
        "7. Ichki nomlarni (asbob nomlari, maqola nomlari, texnik atamalar) foydalanuvchiga yozma.",

        "JAVOB USLUBI: qisqa va aniq, resepshn tushunadigan oddiy so'zlar bilan. Qadamlar bo'lsa raqamlab yoz (ko'pi bilan 6 ta). " +
        "Faqat oddiy matn: markdown, ** va # ishlatma. Havola yozma — ochilgan maqolaga tegishli bo'lim tugmasi javob ostiga o'zi qo'shiladi. " +
        "Salomlashishni cho'zma, bir xil gapni takrorlama." +
        (input.attachment ? " Foydalanuvchi rasm/fayl yubordi, lekin sen uni KO'RMAYSAN — rasmda nima borligini taxmin qilma; kerak bo'lsa nima ko'rinayotganini so'z bilan yozishni so'ra." : ''),

        langRule,

        (toolNames.length ? `MAVJUD TEKSHIRUVLAR: ${toolNames.join(', ')}.` : ''),

        "BILIM BAZASI MUNDARIJASI (maqola nomi — sarlavha):\n" + (kbIndex || '(bo\'sh)'),
    ].filter(Boolean).join('\n\n');
};

export interface BrainDeps {
    ai: AiDeps;
    kb: Kb;
    tools: Tools;
}

export const createBrain = ({ ai, kb, tools }: BrainDeps) => ({
    async answer(input: BrainInput): Promise<BrainResult> {
        const u = input.user;
        const linked = isLinked(u);
        const role = linked ? u.role : null;

        const articleIds: string[] = [];
        const proposals: Proposal[] = [];
        let escalate: BrainResult['escalate'] = null;
        const ctx: ToolContext = { user: u, lang: u.lang, settings: input.settings, attachments: [] };

        const diagDefs = linked && u.clinicId ? tools.defsFor(u) : [];
        const defs = [
            OPEN_ARTICLE,
            ...diagDefs,
            ...(linked && u.clinicId ? [REQUEST_PASSWORD_RESET, START_PAYMENT] : []),
            ESCALATE,
        ];

        const execute = async (name: string, args: any): Promise<any> => {
            if (name === 'open_article') {
                const a = await kb.open(String(args?.id || ''), role);
                if (!a) return wrapToolResult({ xato: "Bunday maqola yo'q. Mundarijadagi nomni aynan yoz yoki escalate chaqir." });
                if (!articleIds.includes(a.id)) articleIds.push(a.id);
                return wrapToolResult({
                    sarlavha: titleOf(a, u.lang),
                    matn: bodyOf(a, u.lang),
                    bolimlar: a.paths.map(p => pathLabel(p, u.lang)),
                });
            }
            if (name === 'escalate') {
                escalate = {
                    reason: String(args?.sabab || 'Operator kerak').slice(0, 300),
                    summary: String(args?.xulosa || '').slice(0, 1500),
                };
                return "Savol operatorga uzatiladi. Foydalanuvchiga bir-ikki gap bilan ayt: savoli mutaxassisga yuborildi, javob shu chatga keladi. Boshqa va'da berma.";
            }
            if (name === 'request_password_reset') {
                if (!proposals.includes('password_reset')) proposals.push('password_reset');
                return "Parolni tiklash so'rovi tayyor: javobing ostida foydalanuvchiga tasdiqlash tugmasi chiqadi. Qisqa qilib shuni ayt.";
            }
            if (name === 'start_payment') {
                if (!proposals.includes('payment')) proposals.push('payment');
                return "Javobing ostida chek yuborish tugmasi chiqadi. Foydalanuvchiga to'lov chekining rasmini yuborishini ayt.";
            }
            if (tools.has(name)) return wrapToolResult(await tools.run(name, args, ctx));
            return wrapToolResult({ xato: "Bunday asbob yo'q" });
        };

        const kbIndex = await kb.indexFor(role, u.lang);
        const toolNames = diagDefs.map((d: any) => d.function.name);
        const userText = sanitizeText(input.text).slice(0, 4000)
            + (input.attachment ? `\n[${input.attachment === 'photo' ? 'rasm' : 'fayl'} yuborildi]` : '');
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt(input, kbIndex, toolNames) },
            ...input.history.slice(-10).map(m => ({ role: m.role, content: String(m.content).slice(0, 3000) })),
            { role: 'user', content: userText },
        ];

        const out = await ai.chatWithTools(messages, defs, execute, {
            label: 'support', task: 'chat', maxRounds: 4, maxTokens: 700,
            clinicKey: ai.supportKey?.() || null,
        });

        const used = out.toolCalls.map(c => c.name);
        const flags: string[] = [];
        if (escalate) flags.push('escalated');
        if (unknownPaths(out.reply).length) flags.push('unknown_path');
        // Hech narsaga tayanmagan javob — model o'zidan yozgan bo'lishi mumkin
        const grounded = used.some(n => n === 'open_article' || tools.has(n)) || proposals.length > 0;
        if (!grounded && !escalate && !SMALL_TALK.test(input.text.trim())) flags.push('ungrounded');

        // Tugmalar ochilgan maqolalardan olinadi — model havola to'qimaydi
        const buttons: { text: string; url: string }[] = [];
        const all = await kb.all();
        for (const id of articleIds) {
            const a = all.find(x => x.id === id);
            if (!a) continue;
            for (const p of a.paths) {
                const url = pathUrl(p);
                if (url && !buttons.some(b => b.url === url)) buttons.push({ text: pathLabel(p, u.lang), url });
            }
            if (a.guideId) {
                const url = guideUrl(a.guideId);
                if (!buttons.some(b => b.url === url)) {
                    buttons.push({ text: u.lang === 'ru' ? '▶️ Показать в приложении' : "▶️ Ilovada ko'rsatish", url });
                }
            }
        }

        return {
            reply: out.reply,
            category: categoryOf(used, linked),
            articleIds,
            buttons: buttons.slice(0, 3),
            attachments: ctx.attachments,
            escalate,
            proposals,
            flags,
            toolCalls: out.toolCalls,
            meta: out.meta,
        };
    },
});

export type Brain = ReturnType<typeof createBrain>;
