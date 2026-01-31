import { Patient, Appointment, Transaction, Doctor, Clinic, SubscriptionPlan, Service, ServiceCategory, ICD10Code, PatientDiagnosis, InventoryItem, InventoryLog } from '../types';

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
        getAll: (clinicId: string) => fetchJson<Patient[]>(`/patients?clinicId=${clinicId}`),
        create: (data: Omit<Patient, 'id'>) => fetchJson<Patient>('/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: string, data: Partial<Patient>) => fetchJson<Patient>(`/patients/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        delete: (id: string) => fetchJson<{ success: true }>(`/patients/${id}`, {
            method: 'DELETE',
        }),
        remindDebt: (id: string, amount?: number) => fetchJson<{ success: true }>(`/patients/${id}/remind-debt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount }),
        }),
        sendMessage: (id: string, message: string) => fetchJson<{ success: true }>(`/patients/${id}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        }),
    },
    appointments: {
        getAll: (clinicId: string) => fetchJson<Appointment[]>(`/appointments?clinicId=${clinicId}`),
        create: (data: Omit<Appointment, 'id'>) => fetchJson<Appointment>('/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: string, data: Partial<Appointment>) => fetchJson<Appointment>(`/appointments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        delete: (id: string) => fetchJson<{ success: true }>(`/appointments/${id}`, {
            method: 'DELETE',
        }),
        remind: (id: string) => fetchJson<{ success: true }>(`/appointments/${id}/remind`, {
            method: 'POST',
        }),
    },
    transactions: {
        getAll: (clinicId: string) => fetchJson<Transaction[]>(`/transactions?clinicId=${clinicId}`),
        create: (data: Omit<Transaction, 'id'>) => fetchJson<Transaction>('/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: string, data: Partial<Transaction>) => {
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
        getAll: (clinicId: string) => fetchJson<Doctor[]>(`/doctors?clinicId=${clinicId}`),
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
        getAll: (clinicId: string) => fetchJson<Service[]>(`/services?clinicId=${clinicId}`),
        create: (data: Omit<Service, 'id'>) => fetchJson<Service>('/services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: number, data: Partial<Service>) => fetchJson<Service>(`/services/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    },
    categories: {
        getAll: (clinicId: string) => fetchJson<ServiceCategory[]>(`/categories?clinicId=${clinicId}`),
        create: (data: Omit<ServiceCategory, 'id'>) => fetchJson<ServiceCategory>('/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        update: (id: string, data: Partial<ServiceCategory>) => fetchJson<ServiceCategory>(`/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        delete: (id: string) => fetchJson<{ success: true }>(`/categories/${id}`, {
            method: 'DELETE',
        }),
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
        updateSettings: (id: string, data: { botToken?: string }) => fetchJson<{ success: true; clinic: Clinic }>(`/clinics/${id}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    },
    plans: {
        getAll: () => fetchJson<SubscriptionPlan[]>('/plans'),
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
        getAll: (clinicId: string) => fetchJson<InventoryItem[]>(`/inventory?clinicId=${clinicId}`),
        create: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => fetchJson<InventoryItem>('/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        updateStock: (id: string, data: { change: number; type: 'IN' | 'OUT'; note?: string; userName: string; patientId?: string }) => fetchJson<InventoryItem>(`/inventory/${id}/stock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
        delete: (id: string) => fetchJson<{ success: true }>(`/inventory/${id}`, {
            method: 'DELETE',
        }),
        getLogs: (clinicId: string, patientId?: string) => fetchJson<InventoryLog[]>(`/inventory/logs?clinicId=${clinicId}${patientId ? `&patientId=${patientId}` : ''}`),
        getAnalytics: (clinicId: string, startDate?: string, endDate?: string) => fetchJson<any[]>(`/inventory/analytics?clinicId=${clinicId}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`),
    }
};
