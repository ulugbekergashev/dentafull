import { Patient } from '../types';
import { DHP_DISTRICTS, DHP_STATES } from './dhpCodes';

/**
 * Bemor kartasining to'liqligi: tug'ilgan sana (kun, oy, yil) va to'liq manzil
 * (viloyat, tuman, ko'cha/uy). Tekshiruv va davlat platformasi uchun shu uchalasi kerak.
 */
export type PatientGap = 'dob' | 'region' | 'address';

export const PATIENT_GAP_LABELS: Record<PatientGap, string> = {
    dob: "Tug'ilgan sana",
    region: 'Viloyat/tuman',
    address: "Manzil (ko'cha, uy)",
};

export function patientGaps(p: Patient): PatientGap[] {
    const gaps: PatientGap[] = [];
    const dob = (p.dob || '').match(/^(\d{4})-\d{2}-\d{2}/);
    if (!dob || Number(dob[1]) < 1900) gaps.push('dob');
    if (!p.regionCode || !p.districtCode) gaps.push('region');
    if (!(p.address || '').trim()) gaps.push('address');
    return gaps;
}

/** Filtr: 'incomplete' — biror narsa yetishmaydi, 'noDob' — sana yo'q, 'noAddress' — manzil to'liq emas */
export type CompletenessFilter = 'all' | 'incomplete' | 'noDob' | 'noAddress';

export function matchesCompleteness(p: Patient, filter: CompletenessFilter): boolean {
    if (filter === 'all') return true;
    const gaps = patientGaps(p);
    if (filter === 'incomplete') return gaps.length > 0;
    if (filter === 'noDob') return gaps.includes('dob');
    return gaps.includes('region') || gaps.includes('address');
}

export const regionName = (code?: string | null): string => DHP_STATES.find(s => s.code === code)?.uz || '';
export const districtName = (code?: string | null): string => DHP_DISTRICTS.find(d => d.code === code)?.uz || '';
