import { Patient, Appointment, Transaction, Doctor, Clinic, SubscriptionPlan, Service, ServiceCategory, ICD10Code, PatientDiagnosis, InventoryItem, InventoryLog } from '../types';
import { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_DOCTORS, DEMO_SERVICES, DEMO_CLINIC, DEMO_PLAN, DEMO_INVENTORY, DEMO_INVENTORY_LOGS } from './demoData';

// Determine API URL based on hostname to avoid Vercel env var issues
const isProduction = window.location.hostname.includes('vercel.app');
export const API_URL = isProduction
    ? 'https://dentafull-production.up.railway.app/api'
    : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

console.log('🔌 API Configuration:', {
    hostname: window.location.hostname,
    isProduction,
    API_URL
});

const isDemoMode = () => {
    try {
        const stored = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        if (stored) {
            const parsed = JSON.parse(stored);
            return parsed.isDemo === true;
        }
    } catch (e) {
        return false;
    }
    return false;
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, backoff = INITIAL_BACKOFF): Promise<Response> {
    try {
        const response = await fetch(url, options);

        // Check if we should retry based on status
        // Retry on 5xx (Server Error), 408 (Timeout), 429 (Too Many Requests)
        // AND ONLY if it is a GET request (safe to retry)
        if (!response.ok && (response.status >= 500 || response.status === 408 || response.status === 429)) {
            const method = options.method || 'GET';
            if (retries > 0 && method === 'GET') {
                console.warn(`Request to ${url} failed with status ${response.status}. Retrying in ${backoff}ms... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                return fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
        }

        return response;
    } catch (error) {
        // Network errors (fetch throws generic TypeError for network issues)
        const method = options.method || 'GET';
        if (retries > 0 && method === 'GET') {
            console.warn(`Network error for ${url}. Retrying in ${backoff}ms... (${retries} attempts left)`, error);
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    const storedAuth = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
    if (storedAuth) {
        try {
            const { token } = JSON.parse(storedAuth);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        } catch (e) {
            // Ignore parse error
        }
    }

    const response = await fetchWithRetry(`${API_URL}${url}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('dentalflow_auth');
        window.location.href = '/'; // Redirect to login
        throw new Error('Session expired');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API request failed: ${response.statusText}`);
    }
    return response.json();
}

export const api = {
    auth: {
        login: async (username: string, password: string) => {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            return response.json();
        },
    },
    patients: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_PATIENTS);
            return fetchJson<Patient[]>(`/patients?clinicId=${clinicId}`);
        },
        create: (data: Omit<Patient, 'id'>) => {
            if (isDemoMode()) {
                const newPatient = { ...data, id: `demo-patient-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Patient;
                DEMO_PATIENTS.push(newPatient);
                return Promise.resolve(newPatient);
            }
            return fetchJson<Patient>('/patients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Patient>) => {
            if (isDemoMode()) {
                const index = DEMO_PATIENTS.findIndex(p => p.id === id);
                if (index !== -1) {
                    DEMO_PATIENTS[index] = { ...DEMO_PATIENTS[index], ...data };
                    return Promise.resolve(DEMO_PATIENTS[index]);
                }
                return Promise.reject('Patient not found');
            }
            return fetchJson<Patient>(`/patients/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_PATIENTS.findIndex(p => p.id === id);
                if (index !== -1) DEMO_PATIENTS.splice(index, 1);
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/patients/${id}`, {
                method: 'DELETE',
            });
        },
        remindDebt: (id: string, amount?: number) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/patients/${id}/remind-debt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount }),
            });
        },
        sendMessage: (id: string, message: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/patients/${id}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
        },
    },
    appointments: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_APPOINTMENTS);
            return fetchJson<Appointment[]>(`/appointments?clinicId=${clinicId}`);
        },
        create: (data: Omit<Appointment, 'id'>) => {
            if (isDemoMode()) {
                const newAppt = { ...data, id: `demo-appt-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Appointment;
                DEMO_APPOINTMENTS.push(newAppt);
                return Promise.resolve(newAppt);
            }
            return fetchJson<Appointment>('/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Appointment>) => {
            if (isDemoMode()) {
                const index = DEMO_APPOINTMENTS.findIndex(a => a.id === id);
                if (index !== -1) {
                    DEMO_APPOINTMENTS[index] = { ...DEMO_APPOINTMENTS[index], ...data };
                    return Promise.resolve(DEMO_APPOINTMENTS[index]);
                }
                return Promise.reject('Appointment not found');
            }
            return fetchJson<Appointment>(`/appointments/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_APPOINTMENTS.findIndex(a => a.id === id);
                if (index !== -1) DEMO_APPOINTMENTS.splice(index, 1);
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/appointments/${id}`, {
                method: 'DELETE',
            });
        },
        remind: (id: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/appointments/${id}/remind`, {
                method: 'POST',
            });
        },
    },
    transactions: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_TRANSACTIONS);
            return fetchJson<Transaction[]>(`/transactions?clinicId=${clinicId}`);
        },
        create: (data: Omit<Transaction, 'id'>) => {
            if (isDemoMode()) {
                const newTx = { ...data, id: `demo-tx-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Transaction;
                DEMO_TRANSACTIONS.push(newTx);
                return Promise.resolve(newTx);
            }
            return fetchJson<Transaction>('/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Transaction>) => {
            if (isDemoMode()) {
                const index = DEMO_TRANSACTIONS.findIndex(t => t.id === id);
                if (index !== -1) {
                    DEMO_TRANSACTIONS[index] = { ...DEMO_TRANSACTIONS[index], ...data };
                    return Promise.resolve(DEMO_TRANSACTIONS[index]);
                }
                return Promise.reject('Transaction not found');
            }
            const url = `/transactions/${id}`;
            console.log('Transaction update URL:', url, 'Data:', data);
            return fetchJson<Transaction>(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
    },
    doctors: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_DOCTORS);
            return fetchJson<Doctor[]>(`/doctors?clinicId=${clinicId}`);
        },
        create: (data: Omit<Doctor, 'id'>) => fetchJson<Doctor>('/doctors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: string, data: Partial<Doctor>) => fetchJson<Doctor>(`/doctors/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        delete: (id: string) => fetchJson<{ success: true }>(`/doctors/${id}`, {
            method: 'DELETE',
        }),
    },
    services: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_SERVICES);
            return fetchJson<Service[]>(`/services?clinicId=${clinicId}`);
        },
        create: (data: Omit<Service, 'id'>) => {
            if (isDemoMode()) {
                const newService: Service = { ...data, id: Date.now() + Math.floor(Math.random() * 1000) } as Service;
                DEMO_SERVICES.push(newService);
                return Promise.resolve(newService);
            }
            return fetchJson<Service>('/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: number, data: Partial<Service>) => {
            if (isDemoMode()) {
                const index = DEMO_SERVICES.findIndex(s => s.id === id);
                if (index !== -1) {
                    DEMO_SERVICES[index] = { ...DEMO_SERVICES[index], ...data };
                    return Promise.resolve(DEMO_SERVICES[index]);
                }
                return Promise.reject('Service not found');
            }
            return fetchJson<Service>(`/services/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
    },
    categories: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) {
                // Return unique categories from DEMO_SERVICES
                const categories = Array.from(new Set(DEMO_SERVICES.map(s => s.category))).map((cat, index) => ({
                    id: `demo-cat-${index}`,
                    name: cat as unknown as string,
                    clinicId: 'demo-clinic-1'
                }));
                // If we had a separate DEMO_CATEGORIES array, we'd use that.
                // For now, deriving from services or returning a static list is fine,
                // but let's assume we might want to edit them.
                // Let's create a static list in memory if needed, but for now just returning simple list
                return Promise.resolve(categories);
            }
            return fetchJson<ServiceCategory[]>(`/categories?clinicId=${clinicId}`);
        },
        create: (data: Omit<ServiceCategory, 'id'>) => {
            if (isDemoMode()) {
                return Promise.resolve({ ...data, id: `demo-cat-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as ServiceCategory);
            }
            return fetchJson<ServiceCategory>('/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<ServiceCategory>) => {
            if (isDemoMode()) return Promise.resolve({ ...data, id } as ServiceCategory);
            return fetchJson<ServiceCategory>(`/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/categories/${id}`, {
                method: 'DELETE',
            });
        },
    },
    clinics: {
        getAll: () => fetchJson<Clinic[]>('/clinics'),
        create: (data: Omit<Clinic, 'id'>) => fetchJson<Clinic>('/clinics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: string, data: Partial<Clinic>) => fetchJson<Clinic>(`/clinics/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        delete: (id: string) => fetchJson<{ success: true }>(`/clinics/${id}`, {
            method: 'DELETE',
        }),
        updateSettings: (id: string, data: { botToken?: string }) => {
            if (isDemoMode()) return Promise.resolve({ success: true, clinic: DEMO_CLINIC });
            return fetchJson<{ success: true; clinic: Clinic }>(`/clinics/${id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
    },
    plans: {
        getAll: () => {
            if (isDemoMode()) return Promise.resolve([DEMO_PLAN]);
            return fetchJson<SubscriptionPlan[]>('/plans');
        },
        update: (id: string, data: Partial<SubscriptionPlan>) => fetchJson<SubscriptionPlan>(`/plans/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    },
    diagnoses: {
        searchCodes: (query: string) => fetchJson<ICD10Code[]>(`/icd10?query=${query}`),
        add: (data: Omit<PatientDiagnosis, 'id' | 'icd10'>) => fetchJson<PatientDiagnosis>('/diagnoses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        getByPatient: (patientId: string) => fetchJson<PatientDiagnosis[]>(`/diagnoses?patientId=${patientId}`),
        delete: (id: string) => fetchJson<{ success: true }>(`/diagnoses/${id}`, {
            method: 'DELETE',
        }),
    },
    teeth: {
        getAll: (patientId: string) => fetchJson<any[]>(`/patients/${patientId}/teeth`),
        save: (patientId: string, data: { number: number; conditions: any[]; notes: string }) => fetchJson<any>(`/patients/${patientId}/teeth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    },
    batch: {
        remindAppointments: (clinicId: string) => fetchJson<{ success: true; message: string }>('/batch/remind-appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinicId }),
        }),
        remindDebts: (clinicId: string, debtors: any[]) => fetchJson<{ success: true; count: number; message?: string }>('/batch/remind-debts?clinicId=' + clinicId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinicId, debtors }),
        }),
    },
    inventory: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_INVENTORY);
            return fetchJson<InventoryItem[]>(`/inventory?clinicId=${clinicId}`);
        },
        create: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
            if (isDemoMode()) {
                const newItem = {
                    ...data,
                    id: `demo-item-${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                } as InventoryItem;
                DEMO_INVENTORY.push(newItem);
                return Promise.resolve(newItem);
            }
            return fetchJson<InventoryItem>('/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        updateStock: (id: string, data: { change: number; type: 'IN' | 'OUT'; note?: string; userName: string; patientId?: string }) => {
            if (isDemoMode()) {
                const index = DEMO_INVENTORY.findIndex(i => i.id === id);
                if (index !== -1) {
                    const item = DEMO_INVENTORY[index];
                    const changeAmount = data.type === 'IN' ? data.change : -data.change;
                    item.quantity += changeAmount;
                    item.updatedAt = new Date().toISOString();

                    // Create log
                    const log: InventoryLog = {
                        id: `demo-log-${Date.now()}`,
                        itemId: id,
                        change: data.change,
                        type: data.type,
                        note: data.note || '',
                        date: new Date().toISOString(),
                        userName: data.userName,
                        patientId: data.patientId
                    };
                    DEMO_INVENTORY_LOGS.push(log);

                    return Promise.resolve(item);
                }
                return Promise.reject('Item not found');
            }
            return fetchJson<InventoryItem>(`/inventory/${id}/stock`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_INVENTORY.findIndex(i => i.id === id);
                if (index !== -1) DEMO_INVENTORY.splice(index, 1);
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/inventory/${id}`, {
                method: 'DELETE',
            });
        },
        getLogs: (clinicId: string, patientId?: string) => {
            if (isDemoMode()) {
                if (patientId) {
                    return Promise.resolve(DEMO_INVENTORY_LOGS.filter(l => l.patientId === patientId));
                }
                return Promise.resolve(DEMO_INVENTORY_LOGS);
            }
            return fetchJson<InventoryLog[]>(`/inventory/logs?clinicId=${clinicId}${patientId ? `&patientId=${patientId}` : ''}`);
        },
        getAnalytics: (clinicId: string, startDate?: string, endDate?: string) => {
            if (isDemoMode()) return Promise.resolve([]); // Simple empty analytics for demo
            return fetchJson<any[]>(`/inventory/analytics?clinicId=${clinicId}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`);
        },
    }
};
