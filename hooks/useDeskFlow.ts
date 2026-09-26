import { useCallback, useEffect, useRef, useState } from 'react';
import { FlowLog } from '../types';
import { api } from '../services/api';

// Shifokor "Kirish" ni bosganda resepshn ekranida tez ko'rinsin
const POLL_MS = 15000;

const localKey = (clinicId: string, date: string) => `dentalflow_flow:${clinicId}:${date}`;

function readLocal(key: string): FlowLog {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeLocal(key: string, log: FlowLog) {
    try {
        localStorage.setItem(key, JSON.stringify(log));
    } catch { /* xotira yopiq — sessiya davomida baribir ishlaydi */ }
}

function applyFlow(log: FlowLog, appointmentId: string, inChair: boolean, at: string): FlowLog {
    const next = { ...log };
    if (inChair) next[appointmentId] = next[appointmentId] || { in: at };
    else delete next[appointmentId];
    return next;
}

/**
 * Bosh sahifa xaritasi: bugun qaysi bemor kabinetga kirgan.
 *
 * Serverda klinika bo'yicha saqlanadi — shifokor "Kirish" ni bosadi, resepshn
 * ekranida bemor kabinetga o'tadi (sahifa ko'rinib turganda 15 soniyada yangilanadi).
 * Server bu belgilarni umuman bermasa (backend hali yangilanmagan) — ular shu
 * brauzerda yuritiladi. Bir martalik tarmoq xatosi ekrandagi belgilarni o'chirmaydi.
 */
export function useDeskFlow(clinicId: string, date: string, active: boolean) {
    const [entries, setEntries] = useState<FlowLog>({});
    const entriesRef = useRef<FlowLog>({});
    /** Server bu kun uchun kamida bir marta javob berdimi */
    const serverOk = useRef(false);
    // Yozish davomida boshlangan o'qish javobi yangi belgini bosib ketmasin
    const writeSeq = useRef(0);
    const writing = useRef(0);
    const lastWriteAt = useRef(0);
    const lk = localKey(clinicId, date);

    const publish = useCallback((next: FlowLog) => {
        entriesRef.current = next;
        setEntries(next);
    }, []);

    useEffect(() => {
        if (!active || !clinicId) return;
        let alive = true;
        serverOk.current = false;
        publish({});
        const load = async () => {
            if (document.visibilityState === 'hidden' || writing.current > 0) return;
            const startedAt = Date.now();
            try {
                const res = await api.desk.getFlow(clinicId, date);
                if (!alive || writing.current > 0 || startedAt < lastWriteAt.current) return;
                serverOk.current = true;
                publish(res.entries || {});
            } catch {
                if (alive && !serverOk.current) publish(readLocal(lk));
            }
        };
        load();
        const id = setInterval(load, POLL_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            alive = false;
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [clinicId, date, active, lk, publish]);

    /** Bemor kabinetga kirdi (true) yoki navbatga qaytdi (false). Xato otmaydi — ekranda darhol ko'rinadi. */
    const set = useCallback(async (appointmentId: string, inChair: boolean): Promise<void> => {
        const seq = ++writeSeq.current;
        lastWriteAt.current = Date.now();
        publish(applyFlow(entriesRef.current, appointmentId, inChair, new Date().toISOString()));
        if (!serverOk.current) {
            writeLocal(lk, entriesRef.current);
            return;
        }
        writing.current++;
        try {
            const res = await api.desk.setFlow({ clinicId, date, appointmentId, inChair });
            lastWriteAt.current = Date.now();
            // Orada yana bosilgan bo'lsa, oxirgi javobni kutamiz
            if (seq === writeSeq.current) publish(res.entries || {});
        } catch (e) {
            console.warn('Kabinet belgisi serverga yozilmadi:', e);
        } finally {
            writing.current--;
        }
    }, [clinicId, date, lk, publish]);

    return { entries, set };
}
