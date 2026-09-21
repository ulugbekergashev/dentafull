import { AccessControl, RoleAccess, Clinic, UserRole } from '../types';

// Klinika sozlamalaridagi ruxsatlarni o'qish uchun yagona manba.
// accessControl bo'lmasa (eski klinikalar, backend hali yangilanmagan) — hammasi ochiq.

export function parseAccessControl(clinic?: Clinic): AccessControl {
    const raw = clinic?.accessControl;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw) as AccessControl;
    } catch {
        return {};
    }
}

export function getRoleAccess(ac: AccessControl, role: UserRole): RoleAccess | undefined {
    if (role === UserRole.DOCTOR) return ac.doctor;
    if (role === UserRole.RECEPTIONIST) return ac.receptionist;
    return undefined; // admin va boshqa rollar cheklanmaydi
}

export function isModuleHidden(ac: AccessControl, role: UserRole, moduleId: string): boolean {
    return !!getRoleAccess(ac, role)?.hiddenModules?.includes(moduleId);
}

export function canSeeFinance(ac: AccessControl, role: UserRole): boolean {
    return getRoleAccess(ac, role)?.showFinance !== false;
}

export function canSeePatientPhone(ac: AccessControl, role: UserRole): boolean {
    return getRoleAccess(ac, role)?.showPatientPhone !== false;
}

// Xodim bemordan pulni o'zi qabul qila oladimi. O'chirilsa tugagan qabulni faqat
// kassaga uzatishi mumkin. Default true — ilgari bu yerda umuman tekshiruv yo'q edi.
export function canTakePayment(ac: AccessControl, role: UserRole): boolean {
    return getRoleAccess(ac, role)?.canTakePayment !== false;
}

// Xodim klinikadagi barcha bemorlar/qabullarni ko'radimi, yoki faqat o'zinikini.
// Faqat shifokor cheklangan — resepshn va admin allaqachon hammasini ko'radi.
// Boshqa ruxsatlardan farqli, default `false` (cheklangan): bu tarixiy xatti-harakat
// va uni ochish klinika egasining ongli qarori bo'lishi kerak.
export function canSeeAllPatients(ac: AccessControl, role: UserRole): boolean {
    if (role !== UserRole.DOCTOR) return true;
    return ac.doctor?.seeAllPatients === true;
}

// Oxirgi 2 raqamdan tashqari hammasini yashiradi: "+998 90 123 45 67" → "+*** ** *** ** 67"
export function maskPhone(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/\d(?=(?:\D*\d){2})/g, '*');
}
