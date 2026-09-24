import { Patient } from '../types';
import { normalizeUzPhone } from './phone';

/**
 * Bemor qidiruvi va takror bemorni oldindan ko'rsatish.
 * Maqsad — resepshn yangi bemor qo'shishdan oldin u bazada bor-yo'qligini ko'rsin.
 */

const digitsOf = (s?: string | null) => (s || '').replace(/\D/g, '');
const norm = (s?: string | null) => (s || '').trim().toLowerCase();

/** "Karimov Aziz", "aziz", "90 123" yoki "901234567" — ism qismlari yoki telefon bo'yicha */
export function matchesPatientQuery(p: Patient, query: string): boolean {
    const q = norm(query);
    if (!q) return false;
    const digits = digitsOf(q);
    if (digits.length >= 3 && (digitsOf(p.phone).includes(digits) || digitsOf(p.secondaryPhone).includes(digits))) return true;
    const name = `${norm(p.lastName)} ${norm(p.firstName)}`;
    return q.split(/\s+/).every(token => name.includes(token));
}

/** Qidiruv natijalari: familiyasi so'rov bilan boshlanganlar oldinda */
export function searchPatients(patients: Patient[], query: string, limit = 6): Patient[] {
    const q = norm(query);
    return patients
        .filter(p => matchesPatientQuery(p, query))
        .sort((a, b) => Number(norm(b.lastName).startsWith(q)) - Number(norm(a.lastName).startsWith(q)))
        .slice(0, limit);
}

/** Qidiruv matnidan yangi bemor formasini to'ldirish: raqam — telefon, so'zlar — "Familiya Ism" */
export function prefillFromQuery(query: string): { lastName: string; firstName: string; phone: string } {
    const q = query.trim();
    if (digitsOf(q).length >= 7 && !/[a-zа-яё]/i.test(q)) return { lastName: '', firstName: '', phone: q };
    const [lastName = '', ...rest] = q.split(/\s+/);
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    return { lastName: cap(lastName), firstName: rest.map(cap).join(' '), phone: '' };
}

export interface SimilarPatient {
    patient: Patient;
    /** 'name' — ism va familiya aynan bir xil; 'phone' — telefon bir xil */
    reason: 'name' | 'phone';
}

/** Yangi bemor formasiga yozilayotgan ma'lumot bo'yicha bazadagi o'xshash bemorlar */
export function findSimilarPatients(
    patients: Patient[],
    form: { firstName: string; lastName: string; phone: string },
    limit = 4
): SimilarPatient[] {
    const first = norm(form.firstName);
    const last = norm(form.lastName);
    const phone = normalizeUzPhone(form.phone);
    const result: SimilarPatient[] = [];
    for (const p of patients) {
        if (phone && (normalizeUzPhone(p.phone) === phone || normalizeUzPhone(p.secondaryPhone) === phone)) {
            result.push({ patient: p, reason: 'phone' });
        } else if (first && last && norm(p.firstName) === first && norm(p.lastName) === last) {
            result.push({ patient: p, reason: 'name' });
        }
        if (result.length >= limit) break;
    }
    return result;
}
