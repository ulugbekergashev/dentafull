/**
 * DHP FHIR serveriga past darajali mijoz: token olish, so'rov yuborish, xatoni
 * o'qish. Resurs tuzilishi haqida hech narsa bilmaydi (u mappers.ts da).
 *
 * Auth: OAuth2 client_credentials, sso.dhp.uz/oauth/token, Basic auth
 * (client_id:client_secret), token 1 soat yashaydi, refresh token yo'q —
 * muddati tugasa xuddi shu yo'l bilan yangisi olinadi.
 * Manba: https://sso.dhp.uz/docs/uz/guides/backend-service/
 *
 * Mock rejim: haqiqiy kalitlar bo'lmaganda ham butun oqimni (navbat, mapper,
 * holat) sinab ko'rish uchun. Tashqariga hech qanday so'rov ketmaydi.
 */
import axios, { AxiosError } from 'axios';

export type DhpEnvironment = 'playground' | 'production';

export interface DhpClientConfig {
    clientId: string;
    clientSecret: string;
    environment: DhpEnvironment;
    /** true — tashqi so'rov o'rniga xotiradagi soxta server */
    mock?: boolean;
}

export const DHP_ENV: Record<DhpEnvironment, { fhir: string; sso: string }> = {
    playground: { fhir: 'https://playground.dhp.uz/fhir', sso: 'https://sso.dhp.uz' },
    production: { fhir: 'https://fhir.dhp.uz', sso: 'https://sso.dhp.uz' },
};

export const MOCK_CLIENT_ID = 'sandbox_key';

/** Kalit soxta bo'lsa yoki DHP_MOCK=1 — mock rejim. */
export const isMockConfig = (clientId?: string | null): boolean =>
    process.env.DHP_MOCK === '1' || clientId === MOCK_CLIENT_ID;

export class DhpError extends Error {
    constructor(message: string, public status?: number, public outcome?: unknown) {
        super(message);
        this.name = 'DhpError';
    }
}

export interface FhirWriteResult {
    id: string;
    versionId?: string;
}

/** Token keshi jarayon xotirasida, clientId bo'yicha — klinikalar bir-biriga aralashmaydi. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
/** Bir vaqtda ikki so'rov token so'rasa — bitta HTTP so'rov ketadi. */
const tokenInflight = new Map<string, Promise<string>>();

/** OperationOutcome'dan odam o'qiydigan xabar. */
function outcomeText(body: any): string | null {
    const issues = body?.resourceType === 'OperationOutcome' ? body.issue : null;
    if (!Array.isArray(issues) || issues.length === 0) return null;
    return issues
        .map((i: any) => i?.details?.text || i?.diagnostics || i?.code)
        .filter(Boolean)
        .slice(0, 3)
        .join('; ');
}

// --- Mock server: xotirada, jarayon yashagancha ---
type MockStore = Map<string, any>;
const mockStore: MockStore = new Map();
let mockCounter = 0;

function mockRequest(method: string, path: string, body?: any): { status: number; data: any } {
    const [route, query = ''] = path.split('?');
    const parts = route.replace(/^\//, '').split('/');
    const type = parts[0];
    const id = parts[1];

    if (route === '/metadata') return { status: 200, data: { resourceType: 'CapabilityStatement', fhirVersion: '5.0.0', mock: true } };

    if (method === 'POST' && type && !id) {
        const newId = `mock-${type.toLowerCase()}-${++mockCounter}`;
        const stored = { ...body, id: newId, meta: { ...(body?.meta || {}), versionId: '1' } };
        mockStore.set(`${type}/${newId}`, stored);
        return { status: 201, data: stored };
    }
    if (method === 'PUT' && type && id) {
        const prev = mockStore.get(`${type}/${id}`);
        const version = String((Number(prev?.meta?.versionId) || 0) + 1);
        const stored = { ...body, id, meta: { ...(body?.meta || {}), versionId: version } };
        mockStore.set(`${type}/${id}`, stored);
        return { status: 200, data: stored };
    }
    if (method === 'GET' && type && id) {
        const found = mockStore.get(`${type}/${id}`);
        return found ? { status: 200, data: found } : { status: 404, data: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] } };
    }
    if (method === 'GET' && type && !id) {
        // Faqat identifier=system|value bo'yicha qidiruv — bizga shu kerak
        const params = new URLSearchParams(query);
        const ident = params.get('identifier');
        const entries: any[] = [];
        for (const [key, res] of mockStore) {
            if (!key.startsWith(`${type}/`)) continue;
            if (ident) {
                const [sys, val] = ident.includes('|') ? ident.split('|') : [null, ident];
                const ok = (res.identifier || []).some((i: any) => (!sys || i.system === sys) && i.value === val);
                if (!ok) continue;
            }
            entries.push({ resource: res });
        }
        return { status: 200, data: { resourceType: 'Bundle', type: 'searchset', total: entries.length, entry: entries } };
    }
    return { status: 400, data: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-supported' }] } };
}

export class DhpClient {
    constructor(private readonly cfg: DhpClientConfig) {}

    get isMock(): boolean {
        return !!this.cfg.mock;
    }

    get fhirBase(): string {
        return DHP_ENV[this.cfg.environment].fhir;
    }

    /** Amaldagi tokenni qaytaradi; muddati tugagan bo'lsa yangisini oladi. */
    async getToken(): Promise<string> {
        if (this.isMock) return 'mock-token';
        const key = `${this.cfg.environment}:${this.cfg.clientId}`;
        const cached = tokenCache.get(key);
        // 60 soniya oldinroq yangilaymiz — so'rov yo'lda ekan tugab qolmasin
        if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

        const inflight = tokenInflight.get(key);
        if (inflight) return inflight;

        const p = this.fetchToken()
            .then(({ token, expiresIn }) => {
                tokenCache.set(key, { token, expiresAt: Date.now() + expiresIn * 1000 });
                return token;
            })
            .finally(() => tokenInflight.delete(key));
        tokenInflight.set(key, p);
        return p;
    }

    private async fetchToken(): Promise<{ token: string; expiresIn: number }> {
        const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
        try {
            const res = await axios.post(
                `${DHP_ENV[this.cfg.environment].sso}/oauth/token`,
                new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
                    timeout: 15_000,
                }
            );
            const token = res.data?.access_token;
            if (!token) throw new DhpError('SSO javobida access_token yo\'q', res.status, res.data);
            return { token, expiresIn: Number(res.data?.expires_in) || 3600 };
        } catch (e) {
            if (e instanceof DhpError) throw e;
            const err = e as AxiosError<any>;
            const status = err.response?.status;
            const desc = err.response?.data?.error_description || err.response?.data?.error;
            throw new DhpError(
                status === 401 || status === 400
                    ? `DHP SSO kalitlarni qabul qilmadi${desc ? ` (${desc})` : ''}`
                    : `DHP SSO bilan bog'lanib bo'lmadi: ${desc || err.message}`,
                status,
                err.response?.data
            );
        }
    }

    /** Keshdagi tokenni tashlab yuborish (401 kelganda). */
    private dropToken() {
        tokenCache.delete(`${this.cfg.environment}:${this.cfg.clientId}`);
    }

    async request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = {}, retried = false): Promise<{ status: number; data: T; etag?: string }> {
        if (this.isMock) {
            const r = mockRequest(method, path, body);
            if (r.status >= 400) throw new DhpError(outcomeText(r.data) || `Mock ${r.status}`, r.status, r.data);
            return { status: r.status, data: r.data as T, etag: r.data?.meta?.versionId ? `W/"${r.data.meta.versionId}"` : undefined };
        }
        const token = await this.getToken();
        try {
            const res = await axios.request<T>({
                method,
                url: `${this.fhirBase}${path}`,
                data: body,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/fhir+json',
                    ...(body ? { 'Content-Type': 'application/fhir+json' } : {}),
                    ...headers,
                },
                timeout: 30_000,
            });
            return { status: res.status, data: res.data, etag: res.headers?.etag };
        } catch (e) {
            const err = e as AxiosError<any>;
            const status = err.response?.status;
            if (status === 401 && !retried) {
                // Token bekor qilingan bo'lishi mumkin — bir marta yangilab qaytaramiz
                this.dropToken();
                return this.request<T>(method, path, body, headers, true);
            }
            const text = outcomeText(err.response?.data) || err.response?.statusText || err.message;
            throw new DhpError(`DHP ${method} ${path} → ${status ?? 'tarmoq'}: ${text}`, status, err.response?.data);
        }
    }

    async read<T = any>(type: string, id: string): Promise<{ resource: T; versionId?: string }> {
        const r = await this.request<T>('GET', `/${type}/${encodeURIComponent(id)}`);
        return { resource: r.data, versionId: (r.data as any)?.meta?.versionId };
    }

    async search(type: string, params: Record<string, string>): Promise<any[]> {
        const qs = new URLSearchParams(params).toString();
        const r = await this.request('GET', `/${type}?${qs}`);
        return Array.isArray(r.data?.entry) ? r.data.entry.map((e: any) => e.resource).filter(Boolean) : [];
    }

    async create(resource: any): Promise<FhirWriteResult> {
        const r = await this.request('POST', `/${resource.resourceType}`, resource);
        const id = r.data?.id || this.idFromLocation(r);
        if (!id) throw new DhpError(`DHP ${resource.resourceType} yaratildi, lekin id qaytmadi`, r.status, r.data);
        return { id, versionId: r.data?.meta?.versionId };
    }

    /**
     * Yangilash. Platforma If-Match (ETag) talab qiladi — parallel o'zgarish
     * bo'lmasin. Bizda saqlangan versiya eskirgan bo'lsa (412/409) joriy
     * versiyani o'qib bir marta qayta uriniladi.
     */
    async update(resource: any, versionId?: string | null, retried = false): Promise<FhirWriteResult> {
        const headers: Record<string, string> = {};
        if (versionId) headers['If-Match'] = `W/"${versionId}"`;
        try {
            const r = await this.request('PUT', `/${resource.resourceType}/${encodeURIComponent(resource.id)}`, resource, headers);
            return { id: resource.id, versionId: r.data?.meta?.versionId };
        } catch (e) {
            const status = (e as DhpError).status;
            if ((status === 412 || status === 409 || status === 428) && !retried) {
                const current = await this.read(resource.resourceType, resource.id);
                return this.update(resource, current.versionId, true);
            }
            throw e;
        }
    }

    private idFromLocation(r: { data: any }): string | null {
        return null;
    }
}
