/**
 * Xodimning o'z hisobi: parolni almashtirish (POST /auth/change-password).
 */
import { API_URL } from './api';
import { jsonHeaders, readSession } from './session';

export interface ChangePasswordResult {
    ok: boolean;
    /** Serverning tayyor matni (masalan, hozirgi parol noto'g'ri); null — muvaffaqiyat, aloqa yoki kutilmagan xato */
    error: string | null;
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
    try {
        const res = await fetch(`${API_URL}/auth/change-password`, {
            method: 'POST',
            headers: jsonHeaders(readSession().token),
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success === true) return { ok: true, error: null };
        return { ok: false, error: typeof data?.error === 'string' && data.error ? data.error : null };
    } catch {
        return { ok: false, error: null };
    }
}
