import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api';
// Sender name registered in Eskiz cabinet (default for most accounts)
const ESKIZ_NICK = process.env.ESKIZ_NICK || '4546';

class SmsService {
    /**
     * Get a valid Eskiz token for the clinic.
     * If stored token is missing or expired, fetches a new one.
     */
    public async getToken(clinicId: string): Promise<string | null> {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } }) as any;

        if (!clinic || !clinic.eskizEmail || !clinic.eskizPassword) {
            console.log(`[SMS] Clinic ${clinicId} has no Eskiz credentials.`);
            return null;
        }

        // Check if existing token is still valid (> 1 day buffer)
        if (clinic.eskizToken && clinic.eskizTokenExpiry) {
            const expiry = new Date(clinic.eskizTokenExpiry);
            const now = new Date();
            const oneDayMs = 24 * 60 * 60 * 1000;
            if (expiry.getTime() - now.getTime() > oneDayMs) {
                return clinic.eskizToken;
            }
        }

        // Need fresh token
        return await this.refreshToken(clinicId, clinic.eskizEmail, clinic.eskizPassword);
    }

    /**
     * Login to Eskiz and save the new token to DB.
     */
    public async refreshToken(clinicId: string, email: string, password: string): Promise<string | null> {
        try {
            const formData = new URLSearchParams();
            formData.append('email', email);
            formData.append('password', password);

            const response = await axios.post(`${ESKIZ_BASE_URL}/auth/login`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            });

            const token = response.data?.data?.token;
            if (!token) {
                console.error('[SMS] Eskiz login returned no token:', response.data);
                return null;
            }

            // Save token — valid for 30 days, we store 29 days expiry
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 29);

            await (prisma.clinic as any).update({
                where: { id: clinicId },
                data: {
                    eskizToken: token,
                    eskizTokenExpiry: expiry
                }
            });

            console.log(`[SMS] Fresh Eskiz token saved for clinic ${clinicId}`);
            return token;
        } catch (err: any) {
            console.error('[SMS] Failed to refresh Eskiz token:', err.response?.data || err.message);
            return null;
        }
    }

    /**
     * Send an SMS to a phone number using the clinic's Eskiz account.
     * phone must be in format: 998901234567 (without +)
     */
    public async sendSms(clinicId: string, phone: string, message: string): Promise<{ success: boolean; error?: string }> {
        try {
            const token = await this.getToken(clinicId);
            if (!token) {
                return { success: false, error: 'Eskiz token topilmadi. Iltimos SMS sozlamalarini tekshiring.' };
            }

            // Normalize phone: remove spaces, +, leading zeros
            const cleanPhone = phone.replace(/\s/g, '').replace(/^\+/, '').replace(/^0+/, '');

            const formData = new URLSearchParams();
            formData.append('mobile_phone', cleanPhone);
            formData.append('message', message);
            formData.append('from', ESKIZ_NICK);
            formData.append('callback_url', '');

            const response = await axios.post(`${ESKIZ_BASE_URL}/message/sms/send`, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${token}`
                },
                timeout: 15000
            });

            const status = response.data?.status;
            if (status === 'waiting' || status === 'success' || response.data?.id) {
                console.log(`[SMS] Sent to ${cleanPhone} via clinic ${clinicId}. Status: ${status}`);
                return { success: true };
            } else {
                console.error('[SMS] Unexpected response:', response.data);
                return { success: false, error: response.data?.message || 'SMS yuborishda xatolik' };
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || err.message || 'SMS yuborishda xatolik';
            console.error(`[SMS] sendSms error for clinic ${clinicId}:`, errorMsg);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Get remaining SMS balance from Eskiz for a clinic.
     */
    public async getBalance(clinicId: string): Promise<{ balance: number | null; error?: string }> {
        try {
            const token = await this.getToken(clinicId);
            if (!token) {
                return { balance: null, error: 'Eskiz token topilmadi' };
            }

            const response = await axios.get(`${ESKIZ_BASE_URL}/user/get-limit`, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            });

            const balance = response.data?.data?.balance ?? response.data?.balance ?? null;
            return { balance };
        } catch (err: any) {
            console.error('[SMS] getBalance error:', err.response?.data || err.message);
            return { balance: null, error: err.response?.data?.message || err.message };
        }
    }

    /**
     * Validate Eskiz credentials (used when clinic saves SMS settings).
     * Returns token on success, null on failure.
     */
    public async validateCredentials(email: string, password: string): Promise<{ valid: boolean; error?: string }> {
        try {
            const formData = new URLSearchParams();
            formData.append('email', email);
            formData.append('password', password);

            const response = await axios.post(`${ESKIZ_BASE_URL}/auth/login`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            });

            const token = response.data?.data?.token;
            if (token) {
                return { valid: true };
            }
            return { valid: false, error: 'Login yoki parol noto\'g\'ri' };
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Eskiz bilan bog\'lanib bo\'lmadi';
            return { valid: false, error: msg };
        }
    }
}

export const smsService = new SmsService();
