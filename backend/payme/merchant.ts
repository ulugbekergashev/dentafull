// ─── Payme Merchant API (JSON-RPC) ───────────────────────────────────────────
// Payme serveri POST /api/payme ga murojaat qiladi. Ketma-ketlik:
//   CheckPerformTransaction → CreateTransaction → PerformTransaction
// PerformTransaction'da obuna muddati support/billing.ts dagi extend() bilan
// uzaytiriladi — operator chek bilan tasdiqlagandagi bilan bir xil qoidalar.
//
// Ishonchlilik qoidasi: AVVAL muddat uzayadi (extend, "payme:<id>" kaliti bilan —
// bir to'lov faqat bir marta uzaytiradi), KEYIN tranzaksiya "o'tkazildi" deb
// belgilanadi. Server orada o'chib qolsa, Payme qayta so'raganda belgilash
// tugatiladi; muddat ikkinchi marta uzaymaydi, pul ham "havoda" qolmaydi.
//
// Hujjat: https://developer.help.paycom.uz/metody-merchant-api/
// Javob har doim HTTP 200; xato bo'lsa { error: { code, message: {ru,uz,en}, data } }.

import { timingSafeEqual } from 'crypto';
import type { PaymeConfig } from './orders';

/** Payme tranzaksiyasi shuncha vaqtdan keyin o'tkazilmagan bo'lsa bekor bo'ladi */
export const PAYME_TIMEOUT_MS = 43_200_000;

export const STATE = { CREATED: 1, PERFORMED: 2, CANCELLED: -1, CANCELLED_AFTER_PERFORM: -2 } as const;
const REASON_TIMEOUT = 4;

type Msg = { ru: string; uz: string; en: string };
const msg = (uz: string, ru: string, en: string): Msg => ({ uz, ru, en });

const M = {
    auth: msg("Ruxsat yo'q", 'Недостаточно привилегий', 'Insufficient privileges'),
    parse: msg("So'rovni o'qib bo'lmadi", 'Ошибка парсинга JSON', 'JSON parse error'),
    invalid: msg("So'rov noto'g'ri", 'Неверный RPC-запрос', 'Invalid RPC request'),
    method: msg('Usul topilmadi', 'Метод не найден', 'Method not found'),
    post: msg('Faqat POST', 'Метод запроса не POST', 'Request method must be POST'),
    system: msg('Tizim xatosi', 'Системная ошибка', 'System error'),
    amount: msg("Summa noto'g'ri", 'Неверная сумма', 'Incorrect amount'),
    orderNotFound: msg('Buyurtma topilmadi', 'Заказ не найден', 'Order not found'),
    orderClosed: msg("Buyurtma to'langan yoki to'lanmoqda", 'Заказ уже оплачен или оплачивается', 'Order is already paid or being paid'),
    clinicGone: msg('Klinika topilmadi', 'Клиника не найдена', 'Clinic not found'),
    txNotFound: msg('Tranzaksiya topilmadi', 'Транзакция не найдена', 'Transaction not found'),
    cannotPerform: msg("Amalni bajarib bo'lmaydi", 'Невозможно выполнить операцию', 'Unable to perform operation'),
    cannotCancel: msg("Xizmat ko'rsatilgan, bekor qilib bo'lmaydi", 'Услуга оказана, отмена невозможна', 'Service provided, cannot cancel'),
};

export class PaymeRpcError extends Error {
    constructor(public code: number, public msgs: Msg, public data?: string) {
        super(msgs.en);
    }
}
const fail = (code: number, m: Msg, data?: string): never => { throw new PaymeRpcError(code, m, data); };

export interface ExtendCall {
    approvedBy: string;
    amount: number;
    note: string;
    actorName: string;
    /** Shu kalit bilan muddat faqat bir marta uzayadi */
    externalId: string;
}

export interface MerchantDeps {
    db: any;
    getConfig: () => PaymeConfig | null;
    /** Obunani uzaytiradi (support/billing.ts extend). Xato tashlasa to'lov o'tkazilmaydi */
    extend: (clinicId: string, months: number, info: ExtendCall) => Promise<{ toExpiry: string; clinicName: string; alreadyApplied?: boolean }>;
    /** Operator chatiga xabar (HTML). Xatosi to'lovga ta'sir qilmaydi */
    notify?: (text: string) => Promise<void> | void;
    now?: () => number;
}

export interface RpcRequest {
    httpMethod: string;
    authorization: string | undefined;
    /** Xom matn yoki allaqachon o'qilgan obyekt */
    body: unknown;
}

/** "Basic base64(Paycom:KEY)" — faqat kalit tekshiriladi, vaqtga bog'liq bo'lmagan taqqoslash bilan */
export const isAuthorized = (header: string | undefined, key: string): boolean => {
    const m = /^Basic\s+(.+)$/i.exec(String(header || '').trim());
    if (!m || !key) return false;
    let decoded = '';
    try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return false; }
    const colon = decoded.indexOf(':');
    if (colon < 0) return false;
    const given = Buffer.from(decoded.slice(colon + 1));
    const expected = Buffer.from(key);
    return given.length === expected.length && timingSafeEqual(given, expected);
};

/** Bu so'rov JSON emas edi — handle() unga -32700 bilan javob beradi */
export const UNPARSABLE_BODY = Symbol('payme:unparsable');

const fmtSum = (tiyin: number) => String(Math.round(tiyin / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** SubscriptionPayment.externalId — bitta Payme to'lovi uchun bitta yozuv */
export const externalIdOf = (paymeId: string) => `payme:${paymeId}`;

export const createPaymeMerchant = (deps: MerchantDeps) => {
    const { db } = deps;
    const now = deps.now || (() => Date.now());
    const say = (text: string) => { void Promise.resolve(deps.notify?.(text)).catch(() => { /* xabar — ikkilamchi */ }); };
    /** Interaktiv tranzaksiya (Prisma); tranzaksiyasiz bazada — oddiy chaqiruv */
    const inTx = <T>(fn: (t: any) => Promise<T>): Promise<T> =>
        typeof db.$transaction === 'function' ? db.$transaction(fn) : fn(db);

    const findTx = (paymeId: unknown) => db.paymeTransaction.findUnique({ where: { paymeId: String(paymeId ?? '') } });
    const isExpired = (tx: any) => now() - Number(tx.createTime) > PAYME_TIMEOUT_MS;
    /** Muddat shu to'lov bilan allaqachon uzaytirilganmi (belgilash orada uzilib qolgan bo'lishi mumkin) */
    const isApplied = async (tx: any) => !!(await db.subscriptionPayment.findFirst({ where: { externalId: externalIdOf(tx.paymeId) } }));

    /** Tranzaksiyani "o'tkazildi" deb belgilaydi (faqat muddat uzaytirilgandan keyin). Yangi holatni qaytaradi */
    const markPerformed = async (tx: any) => {
        const performTime = now();
        const r = await db.paymeTransaction.updateMany({
            where: { id: tx.id, state: STATE.CREATED },
            data: { state: STATE.PERFORMED, performTime },
        });
        if (r.count) {
            await db.paymeOrder.updateMany({
                where: { id: tx.orderId, status: { in: ['pending', 'new'] } },
                data: { status: 'paid', paidAt: new Date(performTime) },
            });
        }
        return findTx(tx.paymeId);
    };

    /**
     * Ochiq tranzaksiyani bekor qiladi va buyurtmani yana to'lanadigan qiladi.
     * Parallel so'rov holatni o'zgartirib ulgurgan bo'lsa — haqiqiy holat qaytadi.
     */
    const cancelCreated = async (tx: any, reason: number | null) => {
        const cancelTime = now();
        const r = await db.paymeTransaction.updateMany({
            where: { id: tx.id, state: STATE.CREATED },
            data: { state: STATE.CANCELLED, cancelTime, reason },
        });
        if (!r.count) return findTx(tx.paymeId);
        await db.paymeOrder.updateMany({ where: { id: tx.orderId, status: 'pending' }, data: { status: 'new' } });
        return { ...tx, state: STATE.CANCELLED, cancelTime, reason };
    };

    /**
     * Muddati o'tgan ochiq tranzaksiya: muddat u bilan uzaytirilgan bo'lsa — aslida to'langan,
     * belgilash tugatiladi; aks holda bekor qilinadi. Yangi holatni qaytaradi.
     */
    const settleExpired = async (tx: any) => (await isApplied(tx) ? markPerformed(tx) : cancelCreated(tx, REASON_TIMEOUT));

    const findOrder = async (account: any) => {
        const orderId = String(account?.order_id ?? '').trim();
        if (!orderId) fail(-31050, M.orderNotFound, 'order_id');
        const order = await db.paymeOrder.findUnique({ where: { id: orderId } });
        if (!order) fail(-31050, M.orderNotFound, 'order_id');
        return order;
    };

    /**
     * Buyurtmani to'lash mumkinmi: summa mos, klinika bor, boshqa tranzaksiya ochiq emas.
     * Muddati o'tgan ochiq tranzaksiya shu yerda yakunlanadi — aks holda Payme
     * bekor qilmaguncha buyurtma "band" bo'lib turardi.
     */
    const assertPayable = async (order: any, amount: unknown) => {
        if (Number(amount) !== Number(order.amount)) fail(-31001, M.amount);
        const clinic = await db.clinic.findUnique({ where: { id: order.clinicId }, select: { id: true, status: true } });
        if (!clinic || clinic.status === 'Deleted') fail(-31051, M.clinicGone, 'order_id');

        if (order.status === 'pending') {
            const open = await db.paymeTransaction.findFirst({ where: { orderId: order.id, state: STATE.CREATED } });
            if (!open) {
                // Band, lekin ochiq tranzaksiyasi yo'q — qolib ketgan belgi, bo'shatamiz
                await db.paymeOrder.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'new' } });
            } else if (!isExpired(open)) {
                fail(-31008, M.orderClosed, 'order_id');
            } else if ((await settleExpired(open))?.state !== STATE.CANCELLED) {
                fail(-31008, M.orderClosed, 'order_id');
            }
        } else if (order.status !== 'new') {
            fail(-31008, M.orderClosed, 'order_id');
        }
    };

    const createResult = (tx: any) => ({ create_time: Number(tx.createTime), transaction: tx.id, state: tx.state });
    const performResult = (tx: any) => ({ transaction: tx.id, perform_time: Number(tx.performTime), state: tx.state });
    const cancelResult = (tx: any) => ({ transaction: tx.id, cancel_time: Number(tx.cancelTime), state: tx.state });

    /** Shu id bilan yaratilgan tranzaksiyaga takroriy CreateTransaction */
    const repeatCreate = async (existing: any) => {
        if (existing.state !== STATE.CREATED) fail(-31008, M.cannotPerform);
        if (isExpired(existing)) {
            await settleExpired(existing);
            fail(-31008, M.cannotPerform);
        }
        return createResult(existing);
    };

    const methods: Record<string, (p: any) => Promise<any>> = {
        async CheckPerformTransaction(p) {
            const order = await findOrder(p.account);
            await assertPayable(order, p.amount);
            const config = deps.getConfig();
            const result: any = { allow: true };
            if (config?.fiscal) {
                const f = config.fiscal;
                result.detail = {
                    receipt_type: 0,
                    items: [{
                        title: f.title,
                        price: Number(order.amount) / order.months,
                        count: order.months,
                        code: f.ikpu,
                        package_code: f.packageCode,
                        vat_percent: f.vatPercent,
                    }],
                };
            }
            return result;
        },

        async CreateTransaction(p) {
            const existing = await findTx(p.id);
            if (existing) return repeatCreate(existing);
            if (!p.id || typeof p.id !== 'string') fail(-32600, M.invalid, 'id');
            const paymeTime = Number(p.time);
            if (!Number.isFinite(paymeTime)) fail(-32600, M.invalid, 'time');
            if (now() - paymeTime > PAYME_TIMEOUT_MS) fail(-31008, M.cannotPerform);

            const order = await findOrder(p.account);
            await assertPayable(order, p.amount);
            try {
                // Buyurtmani band qilish va tranzaksiya yozuvi — bitta tranzaksiyada: band bo'lib,
                // tranzaksiyasiz qolib ketgan buyurtma bo'lmaydi, ikkita ochiq tranzaksiya ham bo'lmaydi
                const tx = await inTx(async (t) => {
                    const claimed = await t.paymeOrder.updateMany({ where: { id: order.id, status: 'new' }, data: { status: 'pending' } });
                    if (!claimed.count) fail(-31008, M.orderClosed, 'order_id');
                    return t.paymeTransaction.create({
                        data: {
                            paymeId: p.id, orderId: order.id, clinicId: order.clinicId, amount: Number(order.amount),
                            state: STATE.CREATED, paymeTime, createTime: now(), performTime: 0, cancelTime: 0,
                        },
                    });
                });
                return createResult(tx);
            } catch (e: any) {
                // Shu id bilan parallel so'rov ulgurib yaratdi — o'sha natija
                if (e?.code === 'P2002') {
                    const again = await findTx(p.id);
                    if (again) return repeatCreate(again);
                }
                throw e;
            }
        },

        async PerformTransaction(p) {
            const tx = await findTx(p.id);
            if (!tx) return fail(-31003, M.txNotFound);
            if (tx.state === STATE.PERFORMED) return performResult(tx);
            if (tx.state !== STATE.CREATED) fail(-31008, M.cannotPerform);
            if (isExpired(tx)) {
                const settled = await settleExpired(tx);
                if (settled?.state === STATE.PERFORMED) return performResult(settled);
                fail(-31008, M.cannotPerform);
            }

            const order = await db.paymeOrder.findUnique({ where: { id: tx.orderId } });
            let r: { toExpiry: string; clinicName: string; alreadyApplied?: boolean };
            try {
                // 1) muddat (bir marta) → 2) belgilash. Xato bo'lsa tranzaksiya ochiq qoladi, Payme qayta so'raydi
                r = await deps.extend(tx.clinicId, order.months, {
                    approvedBy: 'Payme',
                    amount: Number(tx.amount) / 100,
                    note: `Payme ${tx.paymeId}`,
                    actorName: "Payme (onlayn to'lov)",
                    externalId: externalIdOf(tx.paymeId),
                });
            } catch (e: any) {
                console.error('[payme] obunani uzaytirib bo\'lmadi:', e?.message);
                return fail(-32400, M.system);
            }

            const fresh = await markPerformed(tx);
            if (fresh?.state !== STATE.PERFORMED) {
                // Muddat uzaydi, lekin shu orada Payme tranzaksiyani bekor qildi — odam tekshirsin
                console.error(`[payme] ${tx.paymeId}: muddat uzaytirildi, lekin tranzaksiya bekor holatda (${fresh?.state})`);
                say(`⚠️ <b>Payme</b> · ${esc(r.clinicName)}\nTo'lov ${esc(tx.paymeId)} bekor qilingan, lekin muddat uzaytirilgan (${r.toExpiry}). Tekshiring.`);
                return fail(-31008, M.cannotPerform);
            }
            if (!r.alreadyApplied) {
                say(`💳 <b>Payme</b> · ${esc(r.clinicName)}\n${order.months} oy — ${fmtSum(Number(tx.amount))} so'm\nYangi muddat: ${r.toExpiry}`);
            }
            return performResult(fresh);
        },

        async CancelTransaction(p) {
            const tx = await findTx(p.id);
            if (!tx) return fail(-31003, M.txNotFound);
            if (tx.state === STATE.CREATED) {
                // Muddat shu to'lov bilan uzaytirilgan bo'lsa — xizmat ko'rsatilgan, bekor qilinmaydi
                if (await isApplied(tx)) {
                    await markPerformed(tx);
                    return fail(-31007, M.cannotCancel);
                }
                const reason = Number.isInteger(Number(p.reason)) ? Number(p.reason) : null;
                const cancelled = await cancelCreated(tx, reason);
                if (cancelled?.state === STATE.PERFORMED) fail(-31007, M.cannotCancel);
                return cancelResult(cancelled);
            }
            // Obuna muddati allaqachon uzaygan — pul qaytarish qo'lda, Payme kabineti orqali
            if (tx.state === STATE.PERFORMED) fail(-31007, M.cannotCancel);
            return cancelResult(tx);
        },

        async CheckTransaction(p) {
            const tx = await findTx(p.id);
            if (!tx) return fail(-31003, M.txNotFound);
            return {
                create_time: Number(tx.createTime),
                perform_time: Number(tx.performTime),
                cancel_time: Number(tx.cancelTime),
                transaction: tx.id,
                state: tx.state,
                reason: tx.reason ?? null,
            };
        },

        async GetStatement(p) {
            const from = Number(p.from), to = Number(p.to);
            if (!Number.isFinite(from) || !Number.isFinite(to)) fail(-32600, M.invalid, 'from');
            const rows = await db.paymeTransaction.findMany({
                where: { paymeTime: { gte: from, lte: to } },
                orderBy: { paymeTime: 'asc' },
            });
            return {
                transactions: rows.map((t: any) => ({
                    id: t.paymeId,
                    time: Number(t.paymeTime),
                    amount: Number(t.amount),
                    account: { order_id: t.orderId },
                    create_time: Number(t.createTime),
                    perform_time: Number(t.performTime),
                    cancel_time: Number(t.cancelTime),
                    transaction: t.id,
                    state: t.state,
                    reason: t.reason ?? null,
                })),
            };
        },

        // Payme soliq cheki chiqqanini xabar qiladi. Majburiy emas — faqat qabul qilamiz.
        async SetFiscalData(p) {
            const tx = await findTx(p.id);
            if (!tx) fail(-32001, M.txNotFound);
            return { success: true };
        },
    };

    const parseBody = (body: unknown): any => {
        if (body === UNPARSABLE_BODY) return undefined;
        if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
        const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
        try { return JSON.parse(text); } catch { return undefined; }
    };

    return {
        /** Har doim JSON-RPC javob obyekti qaytaradi (HTTP 200 bilan yuboriladi) */
        async handle(req: RpcRequest): Promise<any> {
            let id: unknown = null;
            try {
                if (String(req.httpMethod).toUpperCase() !== 'POST') fail(-32300, M.post);
                const config = deps.getConfig();
                const rpc = parseBody(req.body);
                if (rpc === undefined) fail(-32700, M.parse);
                id = rpc?.id ?? null;
                if (!config || !isAuthorized(req.authorization, config.key)) fail(-32504, M.auth);
                if (!rpc || typeof rpc.method !== 'string' || (rpc.params != null && typeof rpc.params !== 'object')) fail(-32600, M.invalid);
                // Faqat o'zimiz yozgan usullar ("constructor", "toString" kabi meros nomlar emas)
                if (!Object.prototype.hasOwnProperty.call(methods, rpc.method)) fail(-32601, M.method, rpc.method);
                return { id, result: await methods[rpc.method](rpc.params || {}) };
            } catch (e: any) {
                if (e instanceof PaymeRpcError) {
                    return { id, error: { code: e.code, message: e.msgs, ...(e.data ? { data: e.data } : {}) } };
                }
                console.error('[payme] kutilmagan xato:', e?.message);
                return { id, error: { code: -32400, message: M.system } };
            }
        },
    };
};

export type PaymeMerchant = ReturnType<typeof createPaymeMerchant>;
