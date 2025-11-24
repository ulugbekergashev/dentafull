import { Patient, Appointment, Transaction, Doctor, Clinic, SubscriptionPlan, Service } from '../types';

const API_URL = 'http://localhost:3001/api';

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

    const response = await fetch(`${API_URL}${url}`, {
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
            // Special handling for auth - don't throw on error responses
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
    },
    transactions: {
        getAll: (clinicId: string) => fetchJson<Transaction[]>(`/transactions?clinicId=${clinicId}`),
        create: (data: Omit<Transaction, 'id'>) => fetchJson<Transaction>('/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
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
        getAll: (clinicId: string) => fetchJson<Service[]>(`/services?clinicId=${clinicId}`), // Assuming Service type exists or matches structure
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
    },
    plans: {
        getAll: () => fetchJson<SubscriptionPlan[]>('/plans'),
        update: (id: string, data: Partial<SubscriptionPlan>) => fetchJson<SubscriptionPlan>(`/plans/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    },
};
