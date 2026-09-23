/**
 * Xodim bildirishnomalari — sarlavhadagi qo'ng'iroq.
 *
 * NEGA ALOHIDA MODUL: hodisa sodir bo'ladigan joy ko'p (qabul, kassa, lab,
 * ombor, bot, cron), lekin "kimga boradi, qanday yoziladi, bosilganda qayerga
 * olib o'tadi" degan savol bitta joyda hal qilinishi kerak. Chaqiruv joyida
 * bitta qator qoladi: `notify.labOrderReady(order)`.
 *
 * QOIDALAR (har biri real muammodan chiqqan):
 *
 * 1. HAR XODIMGA ALOHIDA QATOR. Umumiy lenta qilinsa, kim birinchi ochsa
 *    hammaning belgisi o'chadi va shifokor resepshnning ishini ko'rib
 *    o'tiraveradi. Kalit — `recipientKey` ('doctor:<id>', 'admin:<clinicId>').
 *
 * 2. YOZUVCHI — SERVER, interfeys emas. Shunda bot orqali yozilgan qabul,
 *    cron topgan muddat, boshqa qurilmadagi amal — hammasi qo'ng'iroqqa
 *    tushadi. Interfeys yozsa, faqat o'sha daqiqada ochiq turgan oyna biladi.
 *
 * 3. HAR HODISANING `refId` SI BOR. Baza darajasida
 *    unique(recipientKey, type, refId) — cron o'n daqiqada bir ishlasa ham
 *    bitta hodisa bitta qator bo'lib qoladi.
 *
 * 4. ISH BAJARILSA YOZUV O'ZI YOPILADI (`resolve`) yoki butunlay o'chadi
 *    (`withdraw`). Pul olingandan keyin ham "kassaga yuborildi" turgan
 *    qo'ng'iroqqa ikkinchi marta hech kim qaramaydi.
 *
 * 5. HODISANI BOSHLAGAN ODAMGA XABAR KETMAYDI (`except`). O'zing bosgan
 *    tugmadan o'zingga bildirishnoma kelishi — shovqin.
 *
 * MUHIM: bu modul hech qachon xato otmaydi. Bildirishnoma yozilmagani uchun
 * to'lov, qabul yoki lab buyurtmasi saqlanmay qolishi mumkin emas.
 */

import { prisma } from './db';

// ─── Qabul qiluvchilar ───────────────────────────────────────────────────────
// Rollar har xil jadvalda (Doctor / Receptionist / LabTechnician / Clinic),
// shuning uchun FK emas, matnli kalit. Transaction.receivedById bilan bir xil
// yondashuv — u yerda ham "kim" savoli shu tarzda hal qilingan.

export type StaffRole = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'LAB';

export interface Recipient {
    key: string;
    role: StaffRole;
}

/** Klinika egasi/administratori — bitta akkaunt, shuning uchun kalit klinika id si. */
export const adminOf = (clinicId: string): Recipient => ({ key: `admin:${clinicId}`, role: 'ADMIN' });
export const doctorOf = (doctorId: string): Recipient => ({ key: `doctor:${doctorId}`, role: 'DOCTOR' });
export const receptionistOf = (id: string): Recipient => ({ key: `receptionist:${id}`, role: 'RECEPTIONIST' });
export const labOf = (technicianId: string): Recipient => ({ key: `lab:${technicianId}`, role: 'LAB' });

/** Bir xil kalit ikki marta kelmasin (masalan admin ham resepshn ro'yxatida bo'lsa). */
const uniq = (list: Recipient[]): Recipient[] => {
    const seen = new Set<string>();
    return list.filter(r => r && r.key && !seen.has(r.key) && seen.add(r.key));
};

/**
 * Old stol: klinikaning faol resepshnlari.
 *
 * Resepshn umuman bo'lmasa (kichik klinikada egasi o'zi qabul qiladi) xabar
 * adminga boradi — aks holda hech kimga bormay qolardi.
 */
export async function frontDesk(clinicId: string): Promise<Recipient[]> {
    try {
        const list = await prisma.receptionist.findMany({
            where: { clinicId, status: 'Active' },
            select: { id: true },
        });
        if (list.length) return list.map((r: any) => receptionistOf(r.id));
    } catch (e: any) {
        console.error('[notif] resepshnlarni o\'qib bo\'lmadi:', e?.message || e);
    }
    return [adminOf(clinicId)];
}

/** Old stol + admin. Admin allaqachon ro'yxatda bo'lsa takrorlanmaydi. */
export async function frontDeskAndAdmin(clinicId: string): Promise<Recipient[]> {
    return uniq([...(await frontDesk(clinicId)), adminOf(clinicId)]);
}

// ─── Yozish ──────────────────────────────────────────────────────────────────

export interface NotifyInput {
    clinicId: string;
    /** Hodisa turi — pastdagi TYPES dan biri. */
    type: string;
    /**
     * Manba yozuv id si. Takror yozilmaslik shunga bog'liq, shuning uchun
     * majburiy: cron yoki webhook ikki marta kelsa ham qator bitta qoladi.
     */
    refId: string;
    title: string;
    body?: string | null;
    /** Bosilganda ochiladigan sahifa: '/finance', '/patients/<id>' */
    link?: string | null;
    to: Recipient[];
    /** Hodisani boshlagan odamning kaliti — unga xabar ketmaydi. */
    except?: string | null;
}

export async function notify(input: NotifyInput): Promise<void> {
    try {
        const to = uniq(input.to).filter(r => r.key !== input.except);
        if (!to.length) return;

        for (const r of to) {
            try {
                // Upsert, create emas: hodisa takror kelganda (cron qayta ishladi,
                // webhook ikki marta urdi) yangi qator ham yozilmaydi, loglarga
                // qo'rqinchli "unique constraint" xatosi ham tushmaydi. Mavjud
                // yozuvga tegilmaydi — o'qilgan bo'lsa o'qilganicha qoladi.
                await prisma.staffNotification.upsert({
                    where: {
                        recipientKey_type_refId: {
                            recipientKey: r.key,
                            type: input.type,
                            refId: input.refId,
                        },
                    },
                    update: {},
                    create: {
                        clinicId: input.clinicId,
                        recipientKey: r.key,
                        recipientRole: r.role,
                        type: input.type,
                        title: input.title,
                        body: input.body || null,
                        link: input.link || null,
                        refId: input.refId,
                    },
                });
            } catch (e: any) {
                console.error(`[notif] ${input.type} → ${r.key} yozilmadi:`, e?.message || e);
            }
        }
    } catch (e: any) {
        console.error('[notif] kutilmagan xatolik:', e?.message || e);
    }
}

/**
 * Ish bajarildi — yozuv o'qilgan bo'lib qoladi (lentada tarix sifatida turadi,
 * lekin raqamni ko'tarmaydi). Kim ochgan-ochmaganidan qat'i nazar hammada.
 */
export async function resolve(type: string | string[], refId: string): Promise<void> {
    try {
        await prisma.staffNotification.updateMany({
            where: { type: Array.isArray(type) ? { in: type } : type, refId, read: false },
            data: { read: true, readAt: new Date() },
        });
    } catch (e: any) {
        console.error('[notif] yopib bo\'lmadi:', e?.message || e);
    }
}

/**
 * Hodisa bekor qilindi — yozuv butunlay o'chadi.
 * `resolve` dan farqi: bu yerda hech qanday ish bo'lmagan, tarixda turishining
 * ma'nosi yo'q (masalan "kassaga yuborish" bekor qilindi).
 */
export async function withdraw(type: string | string[], refId: string): Promise<void> {
    try {
        await prisma.staffNotification.deleteMany({
            where: { type: Array.isArray(type) ? { in: type } : type, refId },
        });
    } catch (e: any) {
        console.error('[notif] o\'chirib bo\'lmadi:', e?.message || e);
    }
}

// ─── O'qish (qo'ng'iroq interfeysi uchun) ────────────────────────────────────

/**
 * Tokendagi foydalanuvchi qaysi kalit bilan yozuv oladi.
 * SUPER_ADMIN va sotuvchida klinika lentasi yo'q — ular boshqa tizimda ishlaydi.
 */
export function recipientKeyOf(user: any): string | null {
    if (!user) return null;
    switch (user.role) {
        case 'CLINIC_ADMIN': return user.clinicId ? `admin:${user.clinicId}` : null;
        case 'DOCTOR': return user.doctorId ? `doctor:${user.doctorId}` : null;
        case 'RECEPTIONIST': return user.receptionistId ? `receptionist:${user.receptionistId}` : null;
        case 'LAB_TECHNICIAN': return user.technicianId ? `lab:${user.technicianId}` : null;
        default: return null;
    }
}

/** O'qilmaganlar tepada: hal qilinmagan ish ko'zdan qochmasin. */
export async function inbox(recipientKey: string, limit = 50) {
    return prisma.staffNotification.findMany({
        where: { recipientKey },
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(limit, 100),
    });
}

export async function unreadCount(recipientKey: string): Promise<number> {
    return prisma.staffNotification.count({ where: { recipientKey, read: false } });
}

export async function markRead(recipientKey: string, id: string): Promise<void> {
    await prisma.staffNotification.updateMany({
        where: { id, recipientKey },
        data: { read: true, readAt: new Date() },
    });
}

export async function markAllRead(recipientKey: string): Promise<void> {
    await prisma.staffNotification.updateMany({
        where: { recipientKey, read: false },
        data: { read: true, readAt: new Date() },
    });
}

/** Faqat o'zining lentasini tozalaydi — boshqalarniki joyida qoladi. */
export async function clearInbox(recipientKey: string): Promise<void> {
    await prisma.staffNotification.deleteMany({ where: { recipientKey } });
}

/**
 * Eski yozuvlarni tozalash. O'qilganlar 14 kundan keyin, o'qilmaganlar 60
 * kundan keyin ketadi: 60 kun turgan "o'qilmagan" ish endi hech kimga kerak
 * emas, lekin jadvalni cheksiz o'stirishning ma'nosi yo'q.
 */
export async function prune(): Promise<void> {
    try {
        const day = 24 * 60 * 60 * 1000;
        await prisma.staffNotification.deleteMany({
            where: { read: true, createdAt: { lt: new Date(Date.now() - 14 * day) } },
        });
        await prisma.staffNotification.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - 60 * day) } },
        });
    } catch (e: any) {
        console.error('[notif] tozalash xatosi:', e?.message || e);
    }
}

// ─── Hodisalar ───────────────────────────────────────────────────────────────
// Matn va manzil shu yerda turadi, chaqiruv joyida emas: bir xil hodisa
// har joyda bir xil yozilishi kerak.

export const TYPES = {
    PAYMENT_TO_CASHIER: 'payment_to_cashier',
    MONEY_UNCOLLECTED: 'money_uncollected',
    DEBT_CREATED: 'debt_created',
    BOT_APPOINTMENT: 'bot_appointment',
    APPOINTMENT_CANCELLED: 'appointment_cancelled',
    APPOINTMENT_MOVED: 'appointment_moved',
    RECALL_DUE: 'recall_due',
    LAB_ORDER_READY: 'lab_order_ready',
    NEW_LEAD: 'new_lead',
    NEW_REVIEW: 'new_review',
    LOW_STOCK: 'low_stock',
    SUBSCRIPTION_EXPIRING: 'subscription_expiring',
} as const;

const som = (n: number) => `${Math.round(n || 0).toLocaleString('ru-RU')} so'm`;

// ── Pul ──────────────────────────────────────────────────────────────────────

/**
 * Shifokor bemorni kassaga uzatdi. Resepshn buni ko'rmasa, bemor kassa oldidan
 * shunchaki chiqib ketadi — pul yo'qoladigan eng keng joy shu.
 */
export async function paymentToCashier(
    appt: { id: string; clinicId: string; patientName: string; doctorName?: string | null; patientId?: string | null },
    actorKey?: string | null
): Promise<void> {
    await notify({
        clinicId: appt.clinicId,
        type: TYPES.PAYMENT_TO_CASHIER,
        refId: appt.id,
        title: `Kassaga: ${appt.patientName}`,
        body: appt.doctorName ? `Shifokor: ${appt.doctorName}` : null,
        link: '/finance',
        to: await frontDeskAndAdmin(appt.clinicId),
        except: actorKey,
    });
}

/** Kassada yozuv paydo bo'ldi — uzatish bajarildi. */
export async function paymentToCashierDone(appointmentId: string): Promise<void> {
    await resolve(TYPES.PAYMENT_TO_CASHIER, appointmentId);
}

/** Uzatish bekor qilindi — hech qanday ish qolmadi. */
export async function paymentToCashierCancelled(appointmentId: string): Promise<void> {
    await withdraw(TYPES.PAYMENT_TO_CASHIER, appointmentId);
}

/** Pul qarzga yozildi — bu klinika egasining qaroriga ta'sir qiladigan narsa. */
export async function debtCreated(
    tx: { id: string; clinicId: string; patientId?: string | null; patientName: string; amount: number },
    actorKey?: string | null
): Promise<void> {
    await notify({
        clinicId: tx.clinicId,
        type: TYPES.DEBT_CREATED,
        refId: tx.id,
        title: `Qarzga yozildi: ${tx.patientName} — ${som(tx.amount)}`,
        link: tx.patientId ? `/patients/${tx.patientId}` : '/finance',
        to: [adminOf(tx.clinicId)],
        except: actorKey,
    });
}

/**
 * Kun oxirida kassaga yozilmay qolgan qabullar.
 *
 * Bu yagona "yig'ma" hodisa: har bir qabul uchun alohida xabar bermaymiz,
 * chunki kun davomida ular normal holat — muammo faqat kun tugaganda paydo
 * bo'ladi. refId da sana bor, ya'ni har kun bitta yozuv.
 */
export async function moneyUncollected(input: {
    clinicId: string;
    date: string;
    doctorId?: string | null;
    names: string[];
}): Promise<void> {
    if (!input.names.length) return;
    const list = input.names.slice(0, 3).join(', ');
    const more = input.names.length > 3 ? ` va yana ${input.names.length - 3} ta` : '';
    await notify({
        clinicId: input.clinicId,
        type: TYPES.MONEY_UNCOLLECTED,
        refId: `${input.doctorId || 'clinic'}:${input.date}`,
        title: `Kassaga yozilmagan ${input.names.length} ta qabul`,
        body: `${list}${more}`,
        link: '/finance',
        to: input.doctorId
            ? [doctorOf(input.doctorId), adminOf(input.clinicId)]
            : [adminOf(input.clinicId)],
    });
}

// ── Bemor oqimi ──────────────────────────────────────────────────────────────

/** Bot orqali o'zi yozilgan bemor. Resepshn bilmasa, jadvalda kutilmagan odam paydo bo'ladi. */
export async function botAppointment(appt: {
    id: string; clinicId: string; patientName: string; doctorName?: string | null; date: string; time: string;
}): Promise<void> {
    await notify({
        clinicId: appt.clinicId,
        type: TYPES.BOT_APPOINTMENT,
        refId: appt.id,
        title: `Bot orqali yozildi: ${appt.patientName}`,
        body: `${appt.date} ${appt.time}${appt.doctorName ? ` · ${appt.doctorName}` : ''}`,
        link: '/calendar',
        to: await frontDesk(appt.clinicId),
    });
}

/** Qabul bekor bo'ldi (bemor o'zi yoki to'lov rad etilgani uchun) — vaqt bo'shadi. */
export async function appointmentCancelled(
    appt: { id: string; clinicId: string; patientName: string; date: string; time: string; doctorId?: string | null },
    reason: string,
    actorKey?: string | null
): Promise<void> {
    await notify({
        clinicId: appt.clinicId,
        type: TYPES.APPOINTMENT_CANCELLED,
        refId: appt.id,
        title: `Qabul bekor qilindi: ${appt.patientName}`,
        body: `${appt.date} ${appt.time} · ${reason}`,
        link: '/calendar',
        to: uniq([
            ...(await frontDesk(appt.clinicId)),
            ...(appt.doctorId ? [doctorOf(appt.doctorId)] : []),
        ]),
        except: actorKey,
    });
}

/**
 * Qabul vaqti ko'chirildi. Shifokor buni bilmasa, kunini eski jadval bo'yicha
 * rejalashtiradi. refId da yangi vaqt bor: ikki marta ko'chirilsa ikkinchisi
 * ham aytiladi, lekin bitta ko'chirish takror yozilmaydi.
 */
export async function appointmentMoved(
    appt: { id: string; clinicId: string; patientName: string; date: string; time: string; doctorId?: string | null },
    from: { date: string; time: string },
    actorKey?: string | null
): Promise<void> {
    if (!appt.doctorId) return;
    await notify({
        clinicId: appt.clinicId,
        type: TYPES.APPOINTMENT_MOVED,
        refId: `${appt.id}:${appt.date}T${appt.time}`,
        title: `Qabul ko'chirildi: ${appt.patientName}`,
        body: `${from.date} ${from.time} → ${appt.date} ${appt.time}`,
        link: '/calendar',
        to: [doctorOf(appt.doctorId)],
        except: actorKey,
    });
}

/** Nazorat muddati keldi — bemorga qo'ng'iroq qilish kerak. */
export async function recallDue(recall: {
    id: string; clinicId: string; patientId: string; patientName: string; dueDate: string; reason?: string | null;
}): Promise<void> {
    await notify({
        clinicId: recall.clinicId,
        type: TYPES.RECALL_DUE,
        refId: recall.id,
        title: `Nazorat muddati: ${recall.patientName}`,
        body: recall.reason || `Rejalashtirilgan sana: ${recall.dueDate}`,
        link: `/patients/${recall.patientId}`,
        to: await frontDesk(recall.clinicId),
    });
}

// ── Ish buyurtmalari ─────────────────────────────────────────────────────────

/** Lab ishi tayyor — buyurtma bergan shifokor bemorni chaqira oladi. */
export async function labOrderReady(order: {
    id: string; clinicId: string; patientName: string; orderType?: string | null; doctorId?: string | null;
}): Promise<void> {
    await notify({
        clinicId: order.clinicId,
        type: TYPES.LAB_ORDER_READY,
        refId: order.id,
        title: `Lab ishi tayyor: ${order.patientName}`,
        body: order.orderType || null,
        link: '/lab',
        to: uniq([
            ...(order.doctorId ? [doctorOf(order.doctorId)] : []),
            ...(await frontDesk(order.clinicId)),
        ]),
    });
}

/**
 * Yangi murojaat (sayt/Facebook). Qo'lda kiritilgan lidga bildirishnoma
 * kerak emas — uni kiritgan odam allaqachon biladi.
 */
export async function newLead(lead: {
    id: string; clinicId: string; name: string; phone?: string | null; source?: string | null;
}): Promise<void> {
    await notify({
        clinicId: lead.clinicId,
        type: TYPES.NEW_LEAD,
        refId: lead.id,
        title: `Yangi murojaat: ${lead.name}`,
        body: [lead.phone, lead.source].filter(Boolean).join(' · ') || null,
        link: '/leads',
        to: await frontDeskAndAdmin(lead.clinicId),
    });
}

/**
 * Bemor baho qo'ydi. Past baho shifokorga ham boradi — tuzatish imkoni
 * bo'lishi uchun; yuqori baho faqat adminda qoladi, bu shovqin qilmaydi.
 */
export async function newReview(review: {
    id: string; clinicId: string; patientName: string; rating: number; comment?: string | null; doctorId?: string | null;
}): Promise<void> {
    const low = review.rating <= 3;
    await notify({
        clinicId: review.clinicId,
        type: TYPES.NEW_REVIEW,
        // Bahoning o'zi kalitda: bemor 5 dan 2 ga tushirsa, bu yangi xabar —
        // aynan shunisi e'tibor talab qiladi.
        refId: `${review.id}:${review.rating}`,
        title: `${'⭐'.repeat(Math.max(1, Math.min(5, review.rating)))} ${review.patientName}`,
        body: review.comment || (low ? 'Past baho — bog\'lanish kerak' : null),
        link: '/',
        to: uniq([
            adminOf(review.clinicId),
            ...(low && review.doctorId ? [doctorOf(review.doctorId)] : []),
        ]),
    });
}

// ── Ogohlantirishlar ─────────────────────────────────────────────────────────

/**
 * Ombordagi mahsulot eng kam miqdordan tushdi.
 *
 * refId — mahsulot id si, ya'ni bitta mahsulot uchun bitta yozuv. Zaxira
 * to'ldirilsa yozuv o'chadi (`stockRestored`) va keyingi safar yana tushsa
 * qaytadan xabar keladi.
 */
export async function lowStock(item: {
    id: string; clinicId: string; name: string; quantity: number; unit?: string | null; minQuantity: number;
}): Promise<void> {
    await notify({
        clinicId: item.clinicId,
        type: TYPES.LOW_STOCK,
        refId: item.id,
        title: `Ombor tugayapti: ${item.name}`,
        body: `Qoldi: ${item.quantity}${item.unit ? ' ' + item.unit : ''} (eng kam: ${item.minQuantity})`,
        link: '/inventory',
        to: await frontDeskAndAdmin(item.clinicId),
    });
}

export async function stockRestored(itemId: string): Promise<void> {
    await withdraw(TYPES.LOW_STOCK, itemId);
}

/** Obuna muddati yaqinlashdi — to'lanmasa tizim yopiladi. */
export async function subscriptionExpiring(clinic: {
    id: string; expiryDate: string; daysLeft: number;
}): Promise<void> {
    await notify({
        clinicId: clinic.id,
        type: TYPES.SUBSCRIPTION_EXPIRING,
        refId: `${clinic.id}:${clinic.expiryDate}`,
        title: clinic.daysLeft <= 0
            ? 'Obuna muddati tugadi'
            : `Obunaga ${clinic.daysLeft} kun qoldi`,
        body: `Tugash sanasi: ${clinic.expiryDate}`,
        link: '/settings',
        to: [adminOf(clinic.id)],
    });
}
