import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { Appointment, Patient, Transaction } from '../types';
import { formatDateToISO } from '../utils/dateUtils';
import { mergeDay } from '../utils/queue';

interface TodaySyncOptions {
    /** Bosh sahifa ochiq, ma'lumot yuklangan va rol klinika xodimi bo'lganda true */
    active: boolean;
    clinicId: string;
    /** Shifokor bo'lsa — faqat o'z navbatidagi bemorlar yuklanadi */
    doctorId?: string;
    isDoctor: boolean;
    appointments: Appointment[];
    patients: Patient[];
    setAppointments: Dispatch<SetStateAction<Appointment[]>>;
    setTransactions: Dispatch<SetStateAction<Transaction[]>>;
    setPatients: Dispatch<SetStateAction<Patient[]>>;
    fetchAppointmentsByDate: (clinicId: string, date: string) => Promise<Appointment[]>;
    fetchTransactionsByDate: (clinicId: string, date: string) => Promise<Transaction[]>;
    fetchPatient: (id: string) => Promise<Patient>;
    intervalMs?: number;
}

/**
 * Bosh sahifadagi navbat: resepshn "Hozir keldi" dan yozgan bemor shifokor ekranida
 * sahifani yangilamasdan chiqishi uchun bugungi qabullar bosh sahifa ochiq va
 * ko'rinib turganda 20 soniyada bir qayta olinadi (faqat bugungi kun — yengil so'rov).
 *
 * Kassa yozuvlari har safar so'ralmaydi: faqat boshqa qurilmada qabul yakunlangani
 * ko'rinsa, o'sha kungi yozuvlar bir marta yangilanadi — aks holda shifokor olgan
 * to'lov resepshnda "olinmagan pul" bo'lib ko'rinardi.
 */
export function useTodaySync(o: TodaySyncOptions) {
    const intervalMs = o.intervalMs ?? 20000;
    const latest = useRef(o);
    latest.current = o;
    // Shu ekrandagi oxirgi yozish vaqti — undan oldin boshlangan so'rov javobi uni o'chirmasin
    const apptWriteAt = useRef(0);
    const txWriteAt = useRef(0);
    const dataLoadedAt = useRef(0);
    const txRefreshNeeded = useRef(false);
    const failedPatientIds = useRef(new Set<string>());
    // Server "date" filtrini bilmasa (yangi backend hali chiqmagan) — og'ir so'rovni takrorlamaymiz
    const dayFilterUnsupported = useRef(false);

    const { active, clinicId, doctorId, isDoctor } = o;
    useEffect(() => {
        if (!active || !clinicId) return;
        let stopped = false;
        let inFlight = false;
        const refresh = async () => {
            if (inFlight || dayFilterUnsupported.current || document.visibilityState !== 'visible') return;
            inFlight = true;
            const startedAt = Date.now();
            const today = formatDateToISO(new Date());
            const cur = latest.current;
            try {
                const fresh = await cur.fetchAppointmentsByDate(clinicId, today);
                if (fresh.some(a => a.date !== today)) {
                    // Eski server hamma qabullarni qaytardi — bu sessiyada qayta so'ramaymiz
                    dayFilterUnsupported.current = true;
                    return;
                }
                if (stopped || apptWriteAt.current >= startedAt) return;
                const doneBefore = new Set(latest.current.appointments
                    .filter(a => a.date === today && a.status === 'Completed').map(a => a.id));
                if (fresh.some(a => a.status === 'Completed' && !doneBefore.has(a.id))) txRefreshNeeded.current = true;
                cur.setAppointments(prev => mergeDay(prev, fresh, today));

                if (txRefreshNeeded.current) {
                    const txStartedAt = Date.now();
                    const freshTx = await cur.fetchTransactionsByDate(clinicId, today);
                    if (!stopped && txWriteAt.current < txStartedAt) {
                        // Eski server hammasini qaytarsa ham faqat bugungilar almashadi
                        cur.setTransactions(prev => mergeDay(prev, freshTx.filter(t => t.date === today), today));
                        txRefreshNeeded.current = false;
                    }
                }

                // Navbatdagi bemor ro'yxatda bo'lmasa (shifokor faqat o'z bemorlarini ko'radi,
                // yoki bemorni boshqa resepshn hozirgina qo'shdi) — kartasi ochilishi uchun yuklaymiz
                const known = new Set(latest.current.patients.map(p => p.id));
                const missing = [...new Set(fresh
                    .filter(a => a.status !== 'Cancelled' && (!isDoctor || a.doctorId === doctorId))
                    .map(a => a.patientId))]
                    .filter(id => id && !known.has(id) && !failedPatientIds.current.has(id))
                    .slice(0, 10);
                if (missing.length) {
                    const got = await Promise.all(missing.map(id => cur.fetchPatient(id).catch(() => {
                        failedPatientIds.current.add(id);
                        return null;
                    })));
                    const found = got.filter((p): p is Patient => !!p && !!p.id);
                    if (!stopped && found.length) {
                        cur.setPatients(prev => {
                            const ids = new Set(prev.map(p => p.id));
                            const add = found.filter(p => !ids.has(p.id));
                            return add.length ? [...add, ...prev] : prev;
                        });
                    }
                }
            } catch {
                // Tarmoq xatosi — keyingi safar qayta urinadi, ekrandagi ma'lumot o'zgarmaydi
            } finally {
                inFlight = false;
            }
        };
        // Bosh sahifaga qaytganda (masalan, bemor kartasidan) darhol, keyin muntazam.
        // Ma'lumot hozirgina to'liq yuklangan bo'lsa — darhol so'rash shart emas.
        if (Date.now() - dataLoadedAt.current > intervalMs) refresh();
        const timer = setInterval(refresh, intervalMs);
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            stopped = true;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [active, clinicId, doctorId, isDoctor, intervalMs]);

    return {
        markAppointmentWrite: () => { apptWriteAt.current = Date.now(); },
        markTransactionWrite: () => { txWriteAt.current = Date.now(); },
        markDataLoaded: () => { dataLoadedAt.current = Date.now(); },
    };
}
