/**
 * DHP sinxron navbati.
 *
 * Marshrutlar yozuvni saqlagach `enqueueSafe(...)` deb qo'yadi — javobni
 * kutmaydi. Har daqiqa `processAll()` navbatni ko'rib chiqadi: yozuvni
 * bazadan qayta o'qiydi (eskirgan payload saqlanmaydi), FHIR'ga o'giradi,
 * yuboradi, natijani DhpResourceLink'ga yozadi.
 *
 * Bog'liqlik: Encounter Patient'siz yuborilmaydi — bog'liq resurs hali
 * ketmagan bo'lsa u navbatga qo'yiladi, bu yozuv esa keyingi aylanishga
 * qoladi (Deferred, urinish hisoblanmaydi). Encounter ketgach o'sha kungi
 * tashxis va muolajalar avtomatik navbatga tushadi.
 */
import { prisma } from '../db';
import { DhpClient, DhpEnvironment, isMockConfig } from './client';
import { SID } from './codes';
import {
    DhpContext, conditionResource, encounterResource, isClinicalTransaction, localSystemFor,
    patientResource, practitionerResource, practitionerRoleResource, procedureResource,
} from './mappers';

export type DhpResourceType = 'Patient' | 'Practitioner' | 'PractitionerRole' | 'Encounter' | 'Condition' | 'Procedure';
/** Qayta ishlash tartibi — bog'liq resurslar avval. */
export const RESOURCE_TYPES: DhpResourceType[] = ['Patient', 'Practitioner', 'PractitionerRole', 'Encounter', 'Condition', 'Procedure'];

const MAX_ATTEMPTS = 5;
const BATCH = 25;

export interface ClinicDhp {
    client: DhpClient;
    ctx: DhpContext;
    environment: DhpEnvironment;
    mock: boolean;
}

// Klinika sozlamasi keshi — har bemor/qabul yozuvida bazaga bormaslik uchun.
const cfgCache = new Map<string, { value: ClinicDhp | null; at: number }>();
const CFG_TTL = 60_000;

export function invalidateClinicConfig(clinicId: string) {
    cfgCache.delete(clinicId);
}

/** Klinika DHP'ga ulanganmi; ulangan bo'lsa mijoz + kontekst. */
export async function clinicDhp(clinicId: string): Promise<ClinicDhp | null> {
    const cached = cfgCache.get(clinicId);
    if (cached && Date.now() - cached.at < CFG_TTL) return cached.value;

    const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { dmedEnabled: true, dmedApiKey: true, dmedApiSecret: true, dmedClinicId: true, dhpEnvironment: true },
    });
    let value: ClinicDhp | null = null;
    const mock = isMockConfig(clinic?.dmedApiKey);
    if (clinic?.dmedEnabled && clinic.dmedApiKey && (clinic.dmedApiSecret || mock)) {
        const environment: DhpEnvironment = clinic.dhpEnvironment === 'production' ? 'production' : 'playground';
        value = {
            client: new DhpClient({ clientId: clinic.dmedApiKey, clientSecret: clinic.dmedApiSecret || '', environment, mock }),
            ctx: { clinicId, organizationId: clinic.dmedClinicId || null, localSystem: localSystemFor(clinicId) },
            environment,
            mock,
        };
    }
    cfgCache.set(clinicId, { value, at: Date.now() });
    return value;
}

const linkKey = (clinicId: string, resourceType: string, localId: string) => ({ clinicId_resourceType_localId: { clinicId, resourceType, localId } });

async function upsertPending(clinicId: string, resourceType: DhpResourceType, localId: string) {
    await prisma.dhpResourceLink.upsert({
        where: linkKey(clinicId, resourceType, localId),
        create: { clinicId, resourceType, localId, status: 'pending' },
        update: { status: 'pending', lastError: null },
    });
}

/** Navbatga qo'yish. Klinika ulanmagan bo'lsa hech narsa qilmaydi (false). */
export async function enqueue(clinicId: string | null | undefined, resourceType: DhpResourceType, localId: string | null | undefined): Promise<boolean> {
    if (!clinicId || !localId) return false;
    const cfg = await clinicDhp(clinicId);
    if (!cfg) return false;
    await upsertPending(clinicId, resourceType, localId);
    return true;
}

/** Marshrutlar uchun: xatoni yutadi, javobni kutmaydi — asosiy ish to'xtamasin. */
export function enqueueSafe(clinicId: string | null | undefined, resourceType: DhpResourceType, localId: string | null | undefined): void {
    enqueue(clinicId, resourceType, localId).catch(e =>
        console.error(`[DHP] navbatga qo'shib bo'lmadi ${resourceType}/${localId}:`, e?.message || e));
}

/** Bog'liq resurs hali yuborilmagan — keyingi aylanishda qayta ko'riladi. */
class Deferred extends Error {}

async function remoteIdOf(clinicId: string, resourceType: DhpResourceType, localId: string): Promise<string | null> {
    const link = await prisma.dhpResourceLink.findUnique({ where: linkKey(clinicId, resourceType, localId) });
    return link?.status === 'synced' && link.remoteId ? link.remoteId : null;
}

/** Majburiy havola: yo'q bo'lsa navbatga qo'yib Deferred tashlaydi. */
async function requireRef(clinicId: string, resourceType: DhpResourceType, localId: string): Promise<string> {
    const id = await remoteIdOf(clinicId, resourceType, localId);
    if (id) return `${resourceType}/${id}`;
    await upsertPending(clinicId, resourceType, localId);
    throw new Deferred(`${resourceType} ${localId} hali yuborilmagan — kutilmoqda`);
}

/** Ixtiyoriy havola: yo'q bo'lsa navbatga qo'yadi, lekin to'xtatmaydi. */
async function optionalRef(clinicId: string, resourceType: DhpResourceType, localId: string | null | undefined): Promise<string | null> {
    if (!localId) return null;
    const id = await remoteIdOf(clinicId, resourceType, localId);
    if (id) return `${resourceType}/${id}`;
    await upsertPending(clinicId, resourceType, localId);
    return null;
}

async function completedAppointmentOn(clinicId: string, patientId: string, date: string): Promise<string | null> {
    const a = await prisma.appointment.findFirst({
        where: { clinicId, patientId, date, status: 'Completed' },
        select: { id: true },
        orderBy: { time: 'asc' },
    });
    return a?.id || null;
}

type LinkRow = { id: string; clinicId: string; resourceType: string; localId: string; remoteId: string | null; versionId: string | null; attempts: number };

/** Yozuvni bazadan o'qib FHIR resursini quradi. 'skip' — yuboriladigan narsa yo'q. */
async function buildResource(cfg: ClinicDhp, link: LinkRow): Promise<any | 'skip'> {
    const { clinicId } = cfg.ctx;
    switch (link.resourceType as DhpResourceType) {
        case 'Patient': {
            const p = await prisma.patient.findFirst({ where: { id: link.localId, clinicId } });
            return p ? patientResource(p, cfg.ctx, link.remoteId) : 'skip';
        }
        case 'Practitioner': {
            const d = await prisma.doctor.findFirst({ where: { id: link.localId, clinicId } });
            return d ? practitionerResource(d, cfg.ctx, link.remoteId) : 'skip';
        }
        case 'PractitionerRole': {
            const d = await prisma.doctor.findFirst({ where: { id: link.localId, clinicId } });
            if (!d) return 'skip';
            if (!cfg.ctx.organizationId) throw new Error('DHP Organization ID sozlanmagan (Sozlamalar → Integratsiyalar)');
            const practitionerRef = await requireRef(clinicId, 'Practitioner', d.id);
            return practitionerRoleResource(d, cfg.ctx, practitionerRef, link.remoteId);
        }
        case 'Encounter': {
            const a = await prisma.appointment.findFirst({ where: { id: link.localId, clinicId } });
            if (!a) return 'skip';
            const patientRef = await requireRef(clinicId, 'Patient', a.patientId);
            const practitionerRef = await optionalRef(clinicId, 'Practitioner', a.doctorId);
            return encounterResource(a, cfg.ctx, { patientRef, practitionerRef }, link.remoteId);
        }
        case 'Condition': {
            const dx = await prisma.patientDiagnosis.findFirst({ where: { id: link.localId, clinicId }, include: { icd10: true } });
            if (!dx) return 'skip';
            const patientRef = await requireRef(clinicId, 'Patient', dx.patientId);
            const apptId = await completedAppointmentOn(clinicId, dx.patientId, dx.date);
            const encounterRef = await optionalRef(clinicId, 'Encounter', apptId);
            return conditionResource(dx, cfg.ctx, { patientRef, encounterRef }, link.remoteId);
        }
        case 'Procedure': {
            const tx = await prisma.transaction.findFirst({ where: { id: link.localId, clinicId } });
            if (!tx || !isClinicalTransaction(tx)) return 'skip';
            const patientRef = await requireRef(clinicId, 'Patient', tx.patientId!);
            const apptId = await completedAppointmentOn(clinicId, tx.patientId!, tx.date);
            const encounterRef = await optionalRef(clinicId, 'Encounter', apptId);
            const practitionerRef = await optionalRef(clinicId, 'Practitioner', tx.doctorId);
            const service = await prisma.service.findFirst({ where: { clinicId, name: tx.service }, select: { snomedCode: true } });
            return procedureResource(tx, cfg.ctx, { patientRef, encounterRef, practitionerRef, snomedCode: service?.snomedCode || null }, link.remoteId);
        }
        default:
            return 'skip';
    }
}

/** Encounter ketgach — o'sha kungi tashxis va muolajalar navbatga. */
async function enqueueEncounterChildren(cfg: ClinicDhp, appointmentId: string) {
    const { clinicId } = cfg.ctx;
    const a = await prisma.appointment.findFirst({ where: { id: appointmentId, clinicId }, select: { patientId: true, date: true } });
    if (!a) return;
    const [diagnoses, transactions] = await Promise.all([
        prisma.patientDiagnosis.findMany({ where: { clinicId, patientId: a.patientId, date: a.date }, select: { id: true } }),
        prisma.transaction.findMany({ where: { clinicId, patientId: a.patientId, date: a.date }, select: { id: true, patientId: true, service: true, type: true, amount: true } }),
    ]);
    for (const dx of diagnoses) await upsertPending(clinicId, 'Condition', dx.id);
    for (const tx of transactions) if (isClinicalTransaction(tx)) await upsertPending(clinicId, 'Procedure', tx.id);
}

export type SyncOutcome = 'sent' | 'failed' | 'deferred' | 'skipped';

async function syncLink(cfg: ClinicDhp, link: LinkRow): Promise<SyncOutcome> {
    try {
        const resource = await buildResource(cfg, link);
        if (resource === 'skip') {
            await prisma.dhpResourceLink.update({ where: { id: link.id }, data: { status: 'skipped', lastError: 'Yozuv topilmadi yoki yuborilmaydi' } });
            return 'skipped';
        }
        const result = link.remoteId
            ? await cfg.client.update({ ...resource, id: link.remoteId }, link.versionId)
            : await cfg.client.create(resource);
        await prisma.dhpResourceLink.update({
            where: { id: link.id },
            data: { remoteId: result.id, versionId: result.versionId ?? null, status: 'synced', syncedAt: new Date(), lastError: null, attempts: 0 },
        });
        if (link.resourceType === 'Encounter') await enqueueEncounterChildren(cfg, link.localId);
        // Shifokor ketgach — uning lavozimi (Organization ma'lum bo'lsa)
        if (link.resourceType === 'Practitioner' && cfg.ctx.organizationId) await upsertPending(cfg.ctx.clinicId, 'PractitionerRole', link.localId);
        return 'sent';
    } catch (e: any) {
        if (e instanceof Deferred) {
            await prisma.dhpResourceLink.update({ where: { id: link.id }, data: { lastError: e.message } });
            return 'deferred';
        }
        const message = String(e?.message || e).slice(0, 500);
        await prisma.dhpResourceLink.update({
            where: { id: link.id },
            data: { status: 'error', attempts: link.attempts + 1, lastError: message },
        });
        console.error(`[DHP] ${link.resourceType}/${link.localId} yuborilmadi (${link.attempts + 1}/${MAX_ATTEMPTS}):`, message);
        return 'failed';
    }
}

export interface SyncCounts { sent: number; failed: number; deferred: number; skipped: number }

/** Bitta klinikaning navbatini bir marta o'tkazadi. */
export async function processClinic(clinicId: string, opts: { limit?: number } = {}): Promise<SyncCounts> {
    const counts: SyncCounts = { sent: 0, failed: 0, deferred: 0, skipped: 0 };
    const cfg = await clinicDhp(clinicId);
    if (!cfg) return counts;
    for (const resourceType of RESOURCE_TYPES) {
        const links = await prisma.dhpResourceLink.findMany({
            where: { clinicId, resourceType, status: { in: ['pending', 'error'] }, attempts: { lt: MAX_ATTEMPTS } },
            orderBy: { createdAt: 'asc' },
            take: opts.limit || BATCH,
        });
        for (const link of links) counts[await syncLink(cfg, link)]++;
    }
    return counts;
}

let running = false;

/** Cron: ulangan klinikalarning navbati. Oldingi aylanish tugamagan bo'lsa o'tkazib yuboradi. */
export async function processAll(): Promise<void> {
    if (running) return;
    running = true;
    try {
        const clinics = await prisma.clinic.findMany({ where: { dmedEnabled: true }, select: { id: true } });
        for (const c of clinics) {
            try {
                const r = await processClinic(c.id);
                if (r.sent || r.failed) console.log(`[DHP] ${c.id}: yuborildi ${r.sent}, xato ${r.failed}, kutmoqda ${r.deferred}`);
            } catch (e: any) {
                console.error(`[DHP] ${c.id} navbatida xatolik:`, e?.message || e);
            }
        }
    } finally {
        running = false;
    }
}

export async function retryErrors(clinicId: string): Promise<number> {
    const r = await prisma.dhpResourceLink.updateMany({ where: { clinicId, status: 'error' }, data: { status: 'pending', attempts: 0 } });
    return r.count;
}

export async function status(clinicId: string) {
    const cfg = await clinicDhp(clinicId);
    const [groups, recentErrors, last] = await Promise.all([
        prisma.dhpResourceLink.groupBy({ by: ['status'], where: { clinicId }, _count: { _all: true } }),
        prisma.dhpResourceLink.findMany({
            where: { clinicId, status: 'error' },
            orderBy: { updatedAt: 'desc' },
            take: 10,
            select: { resourceType: true, localId: true, lastError: true, attempts: true, updatedAt: true },
        }),
        prisma.dhpResourceLink.findFirst({ where: { clinicId, status: 'synced' }, orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } }),
    ]);
    const counts: Record<string, number> = { pending: 0, synced: 0, error: 0, skipped: 0 };
    for (const g of groups) counts[g.status] = g._count._all;
    return {
        enabled: !!cfg,
        environment: cfg?.environment ?? null,
        mock: cfg?.mock ?? false,
        organizationId: cfg?.ctx.organizationId ?? null,
        counts,
        recentErrors,
        lastSyncedAt: last?.syncedAt ?? null,
    };
}

/** Kalitlarni tekshirish: token olinadimi, STIR bo'yicha tashkilot topiladimi. */
export async function testConnection(params: { clientId: string; clientSecret: string; environment: DhpEnvironment; inn?: string | null }) {
    const mock = isMockConfig(params.clientId);
    const client = new DhpClient({ clientId: params.clientId, clientSecret: params.clientSecret, environment: params.environment, mock });
    try {
        await client.getToken();
        let organization: { id: string; name?: string } | null = null;
        if (params.inn) {
            const found = await client.search('Organization', { identifier: `${SID.soliq}|${params.inn}` });
            if (found[0]?.id) organization = { id: found[0].id, name: found[0].name };
        } else {
            await client.request('GET', '/metadata');
        }
        return { valid: true, mock, organization };
    } catch (e: any) {
        return { valid: false, mock, error: String(e?.message || e) };
    }
}

export interface LookupResult {
    firstName?: string; lastName?: string; dob?: string; birthDate?: string;
    gender?: 'Male' | 'Female'; pinfl: string; address?: string;
    regionCode?: string; districtCode?: string; dhpId?: string;
}

/** Platformada ro'yxatdan o'tgan bemorni JSHSHIR bo'yicha topish (bemor kartasini to'ldirish uchun). */
export async function lookupPatientByPinfl(clinicId: string, pinfl: string): Promise<{ data: LookupResult | null; error?: string }> {
    const cfg = await clinicDhp(clinicId);
    if (!cfg) return { data: null, error: 'DHP ulanmagan (Sozlamalar → Integratsiyalar)' };
    if (cfg.mock) {
        return { data: { firstName: 'Sherzod', lastName: 'Azizov', dob: '1988-10-12', birthDate: '1988-10-12', gender: 'Male', pinfl, address: 'Yunusobod tumani, 4-uy', regionCode: '1726', districtCode: '1726266' } };
    }
    const found = await cfg.client.search('Patient', { identifier: `${SID.pinfl}|${pinfl}` });
    const p = found[0];
    if (!p) return { data: null, error: 'Platformada bunday JSHSHIR bilan bemor topilmadi' };
    const name = Array.isArray(p.name) ? p.name[0] : undefined;
    const address = Array.isArray(p.address) ? p.address[0] : undefined;
    return {
        data: {
            firstName: name?.given?.[0], lastName: name?.family,
            dob: p.birthDate, birthDate: p.birthDate,
            gender: p.gender === 'female' ? 'Female' : p.gender === 'male' ? 'Male' : undefined,
            pinfl,
            address: address?.text || (Array.isArray(address?.line) ? address.line.join(', ') : undefined),
            regionCode: address?.state, districtCode: address?.district,
            dhpId: p.id,
        },
    };
}
