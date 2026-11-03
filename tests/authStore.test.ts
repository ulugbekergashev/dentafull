// Kirish ma'lumotini saqlash (services/authStore.ts) — xotirasi to'lgan yoki yopiq planshetda
// ham login o'tishi kerak (2026-11-03: Osiyo Art planshetida login oynasiga qaytarardi).
// Ishga tushirish: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_KEY, clearAuth, readAuth, readAuthToken, saveAuth, updateAuthToken } from '../services/authStore';

/** Brauzer Storage'ining sodda nusxasi: limit (belgilarda) oshsa QuotaExceededError, blocked — har amal xato */
class FakeStorage {
    private data = new Map<string, string>();
    constructor(public limit = Infinity, public blocked = false) {}
    private guard() { if (this.blocked) throw new Error('SecurityError'); }
    private used() { let n = 0; for (const [k, v] of this.data) n += k.length + v.length; return n; }
    get length() { this.guard(); return this.data.size; }
    key(i: number) { this.guard(); return [...this.data.keys()][i] ?? null; }
    getItem(k: string) { this.guard(); return this.data.has(k) ? this.data.get(k)! : null; }
    setItem(k: string, v: string) {
        this.guard();
        const old = this.data.get(k);
        if (this.used() - (old ? k.length + old.length : 0) + k.length + v.length > this.limit) throw new Error('QuotaExceededError');
        this.data.set(k, v);
    }
    removeItem(k: string) { this.guard(); this.data.delete(k); }
}

const g = globalThis as any;
const auth = { role: 'CLINIC_ADMIN', name: 'Azizbek', clinicId: 'c1', token: 'new-token' };

beforeEach(() => {
    g.localStorage = new FakeStorage();
    g.sessionStorage = new FakeStorage();
    clearAuth();
});

test('oddiy holat: localStorage ga saqlanadi va o\'qiladi', () => {
    assert.equal(saveAuth(auth), 'local');
    assert.equal(readAuthToken(), 'new-token');
    assert.equal(readAuth()?.clinicId, 'c1');
});

test('sessionStorage dagi eski token yangi kirishni bosib qo\'ymaydi', () => {
    g.sessionStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, token: 'old-expired' }));
    saveAuth(auth);
    assert.equal(readAuthToken(), 'new-token');
    assert.equal(g.sessionStorage.getItem(AUTH_KEY), null);
});

test('localStorage to\'lgan: keraksiz keshlar o\'chiriladi va localStorage ga saqlanadi', () => {
    g.localStorage = new FakeStorage(400);
    g.localStorage.setItem('dentalflow_demo_data', 'x'.repeat(250));
    g.localStorage.setItem('dentalflow_calls:c1:2026-10-01', 'y'.repeat(60));
    g.localStorage.setItem('app_language', 'uz');
    assert.equal(saveAuth(auth), 'local');
    assert.equal(readAuthToken(), 'new-token');
    assert.equal(g.localStorage.getItem('dentalflow_demo_data'), null);
    assert.equal(g.localStorage.getItem('app_language'), 'uz', 'til tanlovi o\'chmasligi kerak');
});

test('localStorage bo\'shatib bo\'lmaydigan darajada to\'la: sessionStorage ga saqlanadi', () => {
    g.localStorage = new FakeStorage(10);
    assert.equal(saveAuth(auth), 'session');
    assert.equal(readAuthToken(), 'new-token');
});

test('ikkala ombor ham yopiq: sahifa xotirasida ishlaydi, chiqishda tozalanadi', () => {
    g.localStorage = new FakeStorage(Infinity, true);
    g.sessionStorage = new FakeStorage(Infinity, true);
    assert.equal(saveAuth(auth), 'memory');
    assert.equal(readAuthToken(), 'new-token');
    updateAuthToken('renewed');
    assert.equal(readAuthToken(), 'renewed');
    clearAuth();
    assert.equal(readAuthToken(), null);
});

test('token yangilanishi sessiya turgan joyning o\'zida', () => {
    g.localStorage = new FakeStorage(10);
    saveAuth(auth);
    updateAuthToken('renewed');
    assert.equal(JSON.parse(g.sessionStorage.getItem(AUTH_KEY)).token, 'renewed');
    assert.equal(readAuth()?.name, 'Azizbek');
});

test('buzilgan yozuv — kirilmagan deb hisoblanadi', () => {
    g.localStorage.setItem(AUTH_KEY, '{buzuq');
    assert.equal(readAuth(), null);
    assert.equal(readAuthToken(), null);
});
