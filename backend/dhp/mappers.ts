/**
 * Bizning yozuvlar → DHP FHIR R5 resurslari (UZ Core profillari).
 *
 * Faqat sof funksiyalar: bazaga murojaat yo'q, tarmoq yo'q. Kirish — Prisma
 * yozuvlari va oldindan topilgan havolalar (Patient/xxx). Chiqish — JSON.
 *
 * Bu ilovada "tashrif" = yakunlangan Appointment; unda qilingan ishlar =
 * o'sha kungi Transaction'lar (xizmat nomi bilan); tashxis = PatientDiagnosis.
 * Visit/TreatmentProcedure jadvallari ishlatilmaydi, shuning uchun Encounter
 * Appointment'dan, Procedure Transaction'dan quriladi.
 */
import type { Appointment, Doctor, ICD10Code, Patient, PatientDiagnosis, Transaction } from '@prisma/client';
import { CS, DHP_PROFILE, ENCOUNTER_TYPE, SID, specialtyByCode } from './codes';

export interface DhpContext {
    clinicId: string;
    /** DHP'dagi Organization resursi id'si (sozlamalarda) */
    organizationId: string | null;
    /** Bizning ichki id'lar uchun identifier.system — platformada takror yaratilmasin */
    localSystem: string;
}

export const localSystemFor = (clinicId: string) => `https://dentacrm.uz/fhir/sid/clinic/${clinicId}`;

/** Toshkent vaqti — UTC+5, yozgi/qishki o'tish yo'q. */
const TZ = '+05:00';

const isoDate = (s?: string | null): string | undefined =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;

const clean = (s?: string | null): string | undefined => {
    const v = (s || '').trim();
    return v || undefined;
};

/** Bo'sh (undefined) maydonlarni olib tashlaydi — FHIR null qabul qilmaydi. */
function compact<T extends Record<string, any>>(obj: T): T {
    for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) delete obj[k];
    }
    return obj;
}

const genderCode = (g?: string | null): 'male' | 'female' | 'unknown' =>
    g === 'Male' ? 'male' : g === 'Female' ? 'female' : 'unknown';

function humanName(lastName?: string | null, firstName?: string | null) {
    const family = clean(lastName);
    const given = clean(firstName);
    return compact({
        use: 'official',
        text: [family, given].filter(Boolean).join(' '),
        family,
        given: given ? [given] : undefined,
    });
}

function phoneTelecom(phone?: string | null, rank = 1) {
    const v = clean(phone);
    return v ? { system: 'phone', value: v, use: 'mobile', rank } : undefined;
}

const localIdentifier = (ctx: DhpContext, localId: string) => ({ system: ctx.localSystem, value: localId });

const ref = (reference: string, display?: string) => compact({ reference, display });

// ---------------------------------------------------------------------------
// Patient
// ---------------------------------------------------------------------------
export function patientResource(p: Patient, ctx: DhpContext, remoteId?: string | null) {
    const identifier: any[] = [];
    if (p.pinfl) {
        identifier.push({ type: { coding: [{ system: CS.v2IdType, code: 'NI' }] }, system: SID.pinfl, value: p.pinfl });
    }
    if (p.passport) {
        identifier.push({ type: { coding: [{ system: CS.v2IdType, code: 'PPN' }] }, system: SID.passportLocal, value: p.passport });
    }
    if (identifier.length === 0) {
        // Profil: identifikator yo'q bo'lsa NI slice'ida data-absent-reason=unknown
        identifier.push({
            type: { coding: [{ system: CS.v2IdType, code: 'NI' }] },
            system: SID.pinfl,
            _value: { extension: [{ url: CS.dataAbsentReason, valueCode: 'unknown' }] },
        });
    }
    identifier.push(localIdentifier(ctx, p.id));

    const telecom = [phoneTelecom(p.phone, 1), phoneTelecom(p.secondaryPhone, 2)].filter(Boolean);

    const hasAddress = !!(clean(p.address) || p.regionCode || p.districtCode);
    const address = hasAddress
        ? [compact({
            use: 'home',
            type: 'physical',
            line: clean(p.address) ? [clean(p.address)] : undefined,
            district: p.districtCode || undefined,
            state: p.regionCode || undefined,
            country: 'UZ',
        })]
        : undefined;

    return compact({
        resourceType: 'Patient',
        id: remoteId || undefined,
        meta: { profile: [DHP_PROFILE.Patient] },
        language: 'uz',
        identifier,
        active: p.status !== 'Archived',
        name: [humanName(p.lastName, p.firstName)],
        telecom,
        gender: genderCode(p.gender),
        birthDate: isoDate(p.dob),
        address,
        managingOrganization: ctx.organizationId ? ref(`Organization/${ctx.organizationId}`) : undefined,
    });
}

// ---------------------------------------------------------------------------
// Practitioner / PractitionerRole
// ---------------------------------------------------------------------------
export function practitionerResource(d: Doctor, ctx: DhpContext, remoteId?: string | null) {
    const identifier: any[] = [];
    if (d.pinfl) {
        identifier.push({ type: { coding: [{ system: CS.v2IdType, code: 'NI' }] }, system: SID.pinfl, value: d.pinfl });
    }
    if (d.argosId) identifier.push({ system: SID.argos, value: d.argosId });
    identifier.push(localIdentifier(ctx, d.id));

    return compact({
        resourceType: 'Practitioner',
        id: remoteId || undefined,
        meta: { profile: [DHP_PROFILE.Practitioner] },
        language: 'uz',
        identifier,
        active: d.status !== 'Deleted',
        name: [humanName(d.lastName, d.firstName)],
        telecom: [phoneTelecom(d.phone, 1), phoneTelecom(d.secondaryPhone, 2)].filter(Boolean),
        gender: d.gender ? genderCode(d.gender) : undefined,
        birthDate: isoDate(d.birthDate),
    });
}

export function practitionerRoleResource(d: Doctor, ctx: DhpContext, practitionerRef: string, remoteId?: string | null) {
    const spec = specialtyByCode(d.specialtyCode);
    return compact({
        resourceType: 'PractitionerRole',
        id: remoteId || undefined,
        meta: { profile: [DHP_PROFILE.PractitionerRole] },
        language: 'uz',
        identifier: [localIdentifier(ctx, d.id)],
        active: d.status !== 'Deleted',
        practitioner: ref(practitionerRef),
        organization: ctx.organizationId ? ref(`Organization/${ctx.organizationId}`) : undefined,
        code: [{ coding: [{ system: CS.position, code: spec.role, display: spec.roleDisplay }] }],
        specialty: [{ coding: [{ system: CS.specialization, code: spec.code, display: spec.display }] }],
    });
}

// ---------------------------------------------------------------------------
// Encounter (Appointment'dan)
// ---------------------------------------------------------------------------
/** Qabul sanasi+vaqti+davomiyligidan boshlanish/tugash. Vaqt buzuq bo'lsa faqat sana. */
export function appointmentPeriod(a: Pick<Appointment, 'date' | 'time' | 'duration'>): { start: string; end?: string } | undefined {
    const date = isoDate(a.date);
    if (!date) return undefined;
    const time = /^\d{2}:\d{2}$/.test(a.time || '') ? a.time : null;
    if (!time) return { start: date };
    const start = `${date}T${time}:00${TZ}`;
    const minutes = Number(a.duration) > 0 ? Number(a.duration) : 0;
    if (!minutes) return { start };
    // Date UTC'da hisoblaydi — natijani yana Toshkent vaqtida (+05:00) yozamiz
    const endMs = new Date(start).getTime() + minutes * 60_000;
    const end = new Date(endMs + 5 * 3_600_000).toISOString().slice(0, 19) + TZ;
    return { start, end };
}

/** Bizning qabul holati → FHIR R5 Encounter.status */
export function encounterStatus(status?: string | null): string {
    switch (status) {
        case 'Completed': return 'completed';
        case 'Checked-In': return 'in-progress';
        case 'Cancelled': return 'cancelled';
        case 'No-Show': return 'cancelled';
        default: return 'planned';
    }
}

/** Qabul turi matnidan milliy tur: konsultatsiya → Konsultativ, profilaktika → Profilaktik, qolgani Davolash. */
function encounterNationalType(type?: string | null) {
    const t = (type || '').toLowerCase();
    if (/konsult|консульт|consult/.test(t)) return ENCOUNTER_TYPE.consultative;
    if (/profilak|профилак|gigien|гигиен|tozalash|чистк/.test(t)) return ENCOUNTER_TYPE.preventive;
    return ENCOUNTER_TYPE.treatment;
}

export function encounterResource(
    a: Appointment,
    ctx: DhpContext,
    refs: { patientRef: string; practitionerRef?: string | null },
    remoteId?: string | null,
) {
    const period = appointmentPeriod(a);
    const nationalType = encounterNationalType(a.type);
    return compact({
        resourceType: 'Encounter',
        id: remoteId || undefined,
        meta: { profile: [DHP_PROFILE.Encounter] },
        language: 'uz',
        identifier: [localIdentifier(ctx, a.id)],
        status: encounterStatus(a.status),
        class: [{ coding: [{ system: CS.actCode, code: 'AMB', display: 'ambulatory' }] }],
        type: [{ coding: [{ system: CS.encounterType, code: nationalType.code, display: nationalType.display }] }],
        subject: ref(refs.patientRef, a.patientName),
        participant: refs.practitionerRef
            ? [compact({
                type: [{ coding: [{ system: CS.participationType, code: 'ATND', display: 'attender' }] }],
                actor: ref(refs.practitionerRef, a.doctorName),
                period,
            })]
            : undefined,
        actualPeriod: period,
        serviceProvider: ctx.organizationId ? ref(`Organization/${ctx.organizationId}`) : undefined,
    });
}

// ---------------------------------------------------------------------------
// Condition (PatientDiagnosis'dan)
// ---------------------------------------------------------------------------
function conditionClinicalStatus(status?: string | null): { code: string; display: string } {
    const s = (status || '').toLowerCase();
    if (/resolv|cured|tuzal|вылеч|yopilgan/.test(s)) return { code: 'resolved', display: 'Resolved' };
    if (/remission|remiss/.test(s)) return { code: 'remission', display: 'Remission' };
    return { code: 'active', display: 'Active' };
}

export function conditionResource(
    dx: PatientDiagnosis & { icd10?: ICD10Code | null },
    ctx: DhpContext,
    refs: { patientRef: string; encounterRef?: string | null; practitionerRef?: string | null },
    remoteId?: string | null,
) {
    const clinical = conditionClinicalStatus(dx.status);
    const date = isoDate(dx.date);
    return compact({
        resourceType: 'Condition',
        id: remoteId || undefined,
        meta: { profile: [DHP_PROFILE.Condition] },
        language: 'uz',
        identifier: [localIdentifier(ctx, dx.id)],
        clinicalStatus: { coding: [{ system: CS.conditionClinical, code: clinical.code, display: clinical.display }] },
        verificationStatus: { coding: [{ system: CS.conditionVerStatus, code: 'confirmed', display: 'Confirmed' }] },
        code: compact({
            coding: [compact({ system: CS.icd10, code: dx.code, display: clean(dx.icd10?.name) })],
            text: clean(dx.icd10?.name),
        }),
        subject: ref(refs.patientRef),
        encounter: refs.encounterRef ? ref(refs.encounterRef) : undefined,
        onsetDateTime: date,
        recordedDate: date,
        participant: refs.practitionerRef
            ? [{
                function: { coding: [{ system: CS.provenanceParticipant, code: 'author', display: 'Author' }] },
                actor: ref(refs.practitionerRef),
            }]
            : undefined,
        note: clean(dx.notes) ? [{ text: clean(dx.notes) }] : undefined,
    });
}

// ---------------------------------------------------------------------------
// Procedure (Transaction'dan — xizmat nomi bilan)
// ---------------------------------------------------------------------------
/** Avans/balans kabi pul harakatlari muolaja emas. */
export function isClinicalTransaction(tx: Pick<Transaction, 'patientId' | 'service' | 'type' | 'amount'>): boolean {
    if (!tx.patientId) return false;
    const s = (tx.service || '').trim();
    if (!s) return false;
    if (/^(avans|аванс|balans|баланс|qarz|долг|prepay|oldindan|deposit|refund|qaytar)/i.test(s)) return false;
    if (tx.type === 'Balance') return false;
    return true;
}

export function procedureResource(
    tx: Transaction,
    ctx: DhpContext,
    refs: { patientRef: string; encounterRef?: string | null; practitionerRef?: string | null; snomedCode?: string | null },
    remoteId?: string | null,
) {
    const service = clean(tx.service) || 'Stomatologik muolaja';
    const code = refs.snomedCode
        ? { coding: [{ system: CS.snomed, code: refs.snomedCode, display: service }], text: service }
        : { text: service };
    const occurrence = tx.createdAt instanceof Date && !isNaN(tx.createdAt.getTime())
        ? tx.createdAt.toISOString()
        : isoDate(tx.date);
    return compact({
        resourceType: 'Procedure',
        id: remoteId || undefined,
        meta: { profile: [DHP_PROFILE.Procedure] },
        language: 'uz',
        identifier: [localIdentifier(ctx, tx.id)],
        status: 'completed',
        code,
        subject: ref(refs.patientRef, tx.patientName),
        encounter: refs.encounterRef ? ref(refs.encounterRef) : undefined,
        occurrenceDateTime: occurrence,
        performer: refs.practitionerRef ? [{ actor: ref(refs.practitionerRef, tx.doctorName || undefined) }] : undefined,
    });
}
