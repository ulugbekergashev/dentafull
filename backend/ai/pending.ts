// ─── Tasdiqlashni kutayotgan harakat ─────────────────────────────────────────
//
// Ilgari bu ro'yxat server xotirasida (`new Map()`) turardi. Railway'da
// process har deploy'da, uyquga ketganda va har qanday qulashda qayta ishga
// tushadi — va o'sha daqiqada BARCHA kutayotgan tasdiqlashlar yo'qolardi.
// Foydalanuvchi "Tasdiqlash" tugmasini bosardi, javob esa "topilmadi yoki
// muddati o'tgan" bo'lardi.
//
// Tashqaridan bu "AI tushundi, lekin hech narsa qilmadi" bo'lib ko'rinadi —
// aynan shu eng ko'p shikoyat qilingan xatti-harakat edi.
//
// Endi serverda hech narsa saqlanmaydi: harakat IMZOLANGAN token ichida
// mijozga beriladi va tasdiqlashda imzo qayta tekshiriladi. Server qayta
// ishga tushsa ham token amal qiladi; bir nechta instansiya bo'lsa ham
// ishlaydi (birida yaratilgan token boshqasida tekshiriladi).
//
// NEGA JADVAL EMAS: Railway deploy'i migratsiya ishlatmaydi (railway.json —
// faqat `prisma generate` va build). Yangi jadval qo'shilsa, uni qo'lda
// `prisma db push` bilan chiqarish kerak bo'lardi va shu qadam unutilsa,
// harakatlar butunlay ishlamay qolardi — ya'ni hozirgisidan ham yomon.
//
// XAVFSIZLIK XOSSASI SAQLANDI. Eski yechimda muhimi "serverda saqlanishi"
// emas edi — muhimi mijoz argumentni O'ZGARTIRA OLMASLIGI: ekranda
// ko'rsatilgan narsa bilan bajariladigan narsa bir xil bo'lishi shart.
// HMAC aynan shuni beradi: tokenda bitta bayt o'zgarsa, imzo mos kelmaydi
// va harakat rad etiladi. Kalitsiz to'g'ri imzo yasab bo'lmaydi.

import crypto from 'crypto';
// Faqat tip — kompilyatsiyada o'chib ketadi, ya'ni actions.ts bilan
// aylanma import hosil qilmaydi.
import type { ActionPreview } from './actions';

export interface Pending {
    name: string;
    args: any;
    preview: ActionPreview;
    clinicId: string;
    userId: string;
    role: string;
    expiresAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Imzo kaliti. JWT bilan bir xil sir ishlatiladi — u serverda allaqachon
 * majburiy (server.ts uni topmasa umuman ishga tushmaydi), ya'ni bu yerda
 * qo'shimcha sozlama talab qilinmaydi.
 */
const secret = (): string => {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET yo\'q — tasdiqlash tokenini imzolab bo\'lmaydi');
    return s;
};

const b64url = (b: Buffer): string =>
    b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string): Buffer =>
    Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const sign = (body: string): string =>
    b64url(crypto.createHmac('sha256', secret()).update(body).digest());

/**
 * Bir marta bajarilgan tokenlar.
 *
 * Tugmani ikki marta bosish 40 ta bemorga ikkita bir xil SMS yuborardi —
 * shuning uchun bajarilgan token qayta qabul qilinmaydi.
 *
 * Bu ro'yxat XOTIRADA va buni ochiq aytish kerak: server qayta ishga
 * tushsa, u bo'shaydi. Ya'ni himoya "bir jarayon ichida" ishlaydi.
 * Amalda takroriy bajarish uchun serverning AYNAN ikki bosish orasida
 * qayta ishga tushishi va mijozning o'sha tokenni qayta yuborishi kerak —
 * juda tor oyna. Muhimi: eski yechimda bu holatda harakat umuman
 * bajarilmasdi, hozir esa eng yomon holatda ikki marta bajariladi.
 */
const used = new Map<string, number>();

setInterval(() => {
    const now = Date.now();
    for (const [k, exp] of Array.from(used.entries())) {
        if (now > exp) used.delete(k);
    }
}, 5 * 60 * 1000).unref?.();

export const storePending = (
    name: string,
    args: any,
    preview: ActionPreview,
    ctx: { clinicId: string; userId: string; role: string }
): string => {
    const payload = {
        v: 1,
        n: name,
        a: args,
        p: preview,
        c: ctx.clinicId,
        u: ctx.userId,
        r: ctx.role,
        x: Date.now() + PENDING_TTL_MS,
        // Takroriy bajarishni aniqlash uchun — har token noyob.
        j: crypto.randomBytes(9).toString('hex'),
    };
    const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
    return `${body}.${sign(body)}`;
};

/**
 * Tasdiqlangan harakatni tokendan ochadi va qayta ishlatilmasligini
 * belgilaydi.
 */
export const takePending = (
    id: string,
    ctx: { clinicId: string; userId: string }
): { pending?: Pending; xato?: string } => {
    const raw = String(id || '');
    const dot = raw.lastIndexOf('.');
    if (dot < 1) return { xato: 'Bu tasdiqlash topilmadi yoki muddati o\'tgan. Iltimos, qaytadan so\'rang.' };

    const body = raw.slice(0, dot);
    const got = raw.slice(dot + 1);
    const want = sign(body);

    // Doimiy vaqtli solishtirish: imzoni belgima-belgi topib bo'lmasin.
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { xato: 'Bu tasdiqlash yaroqsiz. Iltimos, qaytadan so\'rang.' };
    }

    let p: any;
    try {
        p = JSON.parse(unb64url(body).toString('utf8'));
    } catch {
        return { xato: 'Bu tasdiqlash yaroqsiz. Iltimos, qaytadan so\'rang.' };
    }

    if (p?.v !== 1) return { xato: 'Bu tasdiqlash eskirgan. Iltimos, qaytadan so\'rang.' };

    if (!p.x || p.x < Date.now()) {
        return { xato: 'Tasdiqlash muddati tugagan (10 daqiqa). Iltimos, qaytadan so\'rang.' };
    }

    // Boshqa foydalanuvchi tasdiqlay olmaydi. Token imzolangan, ya'ni bu
    // maydonni mijoz o'zgartira olmaydi — faqat o'zinikini ishlata oladi.
    if (p.u !== ctx.userId) {
        return { xato: 'Bu tasdiqlash sizga tegishli emas.' };
    }

    // Klinika tekshiruvi — qo'shimcha himoya, lekin faqat chaqiruvda klinika
    // aniq bo'lganda. SUPER_ADMIN da clinicId so'rov tanasidan keladi va
    // tasdiqlashda u yuborilmasligi mumkin; bunday holatda harakat baribir
    // tokendagi klinikada bajariladi, ya'ni chegara buzilmaydi.
    if (ctx.clinicId && p.c !== ctx.clinicId) {
        return { xato: 'Bu tasdiqlash boshqa klinikaga tegishli.' };
    }

    if (used.has(p.j)) {
        return { xato: 'Bu harakat allaqachon bajarilgan.' };
    }
    used.set(p.j, p.x);

    return {
        pending: {
            name: p.n,
            args: p.a,
            preview: p.p,
            clinicId: p.c,
            userId: p.u,
            role: p.r,
            expiresAt: p.x,
        },
    };
};
