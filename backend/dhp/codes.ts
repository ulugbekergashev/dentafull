/**
 * DHP (Raqamli sog'liqni saqlash platformasi) lug'atlari va profil manzillari.
 *
 * Manba: https://dhp.uz/fhir/core (IG v0.9.1, hali draft). Profil yoki kod
 * tizimi o'zgarsa — faqat shu fayl va mappers.ts tuzatiladi, qolgan kod
 * bu URL'larni bilmaydi.
 *
 * Frontenddagi utils/dhpCodes.ts shu ro'yxatning ko'rsatish uchun nusxasi —
 * stomatologik mutaxassisliklar ikkalasida bir xil bo'lishi kerak.
 */

export const DHP_PROFILE = {
    Patient: 'https://dhp.uz/fhir/core/StructureDefinition/uz-core-patient',
    Practitioner: 'https://dhp.uz/fhir/core/StructureDefinition/uz-core-practitioner',
    PractitionerRole: 'https://dhp.uz/fhir/core/StructureDefinition/uz-core-practitioner-role',
    Encounter: 'https://dhp.uz/fhir/core/StructureDefinition/uz-core-encounter',
    Condition: 'https://dhp.uz/fhir/core/StructureDefinition/uz-core-condition',
    Procedure: 'https://dhp.uz/fhir/core/StructureDefinition/uz-core-procedure',
} as const;

/** Identifikator tizimlari (NamingSystem). */
export const SID = {
    pinfl: 'https://dhp.uz/fhir/core/sid/pid/uz/ni',
    passportLocal: 'https://dhp.uz/fhir/core/sid/pid/uz/ppn/local',
    argos: 'https://dhp.uz/fhir/core/sid/pro/uz/argos',
    soliq: 'https://dhp.uz/fhir/core/sid/org/uz/soliq',
} as const;

/** Kod tizimlari. */
export const CS = {
    v2IdType: 'http://terminology.hl7.org/CodeSystem/v2-0203',
    actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    participationType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
    conditionVerStatus: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
    provenanceParticipant: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
    icd10: 'http://hl7.org/fhir/sid/icd-10',
    snomed: 'http://snomed.info/sct',
    encounterType: 'https://terminology.dhp.uz/fhir/core/CodeSystem/encounter-type-cs',
    position: 'https://terminology.dhp.uz/fhir/core/CodeSystem/position-and-profession-cs',
    specialization: 'https://terminology.dhp.uz/fhir/core/CodeSystem/profession-specialization-cs',
    dataAbsentReason: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
} as const;

/** Encounter.type:nationalType — encounter-type-cs. */
export const ENCOUNTER_TYPE = {
    preventive: { code: 'mserv-0001-00001', display: 'Profilaktik' },
    consultative: { code: 'mserv-0001-00003', display: 'Konsultativ' },
    treatment: { code: 'mserv-0001-00004', display: 'Davolash' },
} as const;

export interface DentalSpecialty {
    /** PractitionerRole.specialty — profession-specialization-cs (SNOMED CT asosida) */
    code: string;
    display: string;
    /** PractitionerRole.code — position-and-profession-cs (lavozim) */
    role: string;
    roleDisplay: string;
}

/**
 * Stomatologik mutaxassisliklar. Doctor.specialtyCode shu ro'yxatdagi `code`.
 * Lavozim (role) alohida kod tizimida — bitta tanlovdan ikkalasi chiqadi.
 */
export const DENTAL_SPECIALTIES: DentalSpecialty[] = [
    { code: '408444009', display: 'Umumiy stomatologiya amaliyoti', role: '2261.4', roleDisplay: 'Umumiy amaliyot stomatolog vrach' },
    { code: '394606000', display: 'Restorativ (terapevtik) stomatologiya', role: '2261.7', roleDisplay: 'Terapevt stomatolog vrach' },
    { code: '408441001', display: 'Endodontiya', role: '2261.7', roleDisplay: 'Terapevt stomatolog vrach' },
    { code: '408461007', display: 'Periodontologiya', role: '2261.7', roleDisplay: 'Terapevt stomatolog vrach' },
    { code: '394605001', display: "Og'iz bo'shlig'i jarrohligi", role: '2261.9', roleDisplay: 'Tish jarrohi' },
    { code: '408465003', display: "Og'iz-jag' jarrohligi", role: '2261.9', roleDisplay: 'Tish jarrohi' },
    { code: '394608004', display: 'Ortodontiya', role: '2261.5', roleDisplay: 'Ortodont-stomatolog vrach' },
    { code: '408460008', display: 'Protezlash (ortopedik stomatologiya)', role: '2261.6', roleDisplay: 'Ortoped-stomatolog vrach' },
    { code: '394607009', display: 'Bolalar stomatologiyasi', role: '2261.1', roleDisplay: 'Bolalar terapevt-stomatolog vrachi' },
];

export const DEFAULT_DENTAL_SPECIALTY = DENTAL_SPECIALTIES[0];

export const specialtyByCode = (code?: string | null): DentalSpecialty =>
    DENTAL_SPECIALTIES.find(s => s.code === code) || DEFAULT_DENTAL_SPECIALTY;
