import { useCallback, useEffect, useRef, useState } from 'react';
import { CallLog, CallLogChange } from '../types';
import { api } from '../services/api';
import { applyCallChange } from '../utils/desk';

const POLL_MS = 30000;

const localKey = (clinicId: string, date: string) => `dentalflow_calls:${clinicId}:${date}`;

function readLocal(key: string): CallLog {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeLocal(key: string, log: CallLog) {
    try {
        localStorage.setItem(key, JSON.stringify(log));
    } catch { /* xotira yopiq — sessiya davomida baribir ishlaydi */ }
}

/**
 * Bosh sahifadagi "Qo'ng'iroq qilish kerak" uchun bugungi natijalar jurnali.
 *
 * Serverda klinika bo'yicha saqlanadi: ikki resepshn bir-birining natijasini
 * ko'radi (sahifa ko'rinib turganda 30 soniyada yangilanadi). Server bu jurnalni
 * umuman bermasa (masalan backend hali yangilanmagan) — jurnal shu brauzerda
 * yuritiladi va ro'yxat ishlashda davom etadi. Bir martalik tarmoq xatosi esa
 * ekrandagi natijalarni o'chirmaydi: keyingi yangilanish tuzatadi.
 */
export function useCallLog(clinicId: string, date: string, active: boolean) {
    const [entries, setEntries] = useState<CallLog>({});
    const entriesRef = useRef<CallLog>({});
    /** Server bu kun uchun kamida bir marta javob berdimi */
    const serverOk = useRef(false);
    // Yozish davomida boshlangan o'qish javobi yangi natijani bosib ketmasin
    const writeSeq = useRef(0);
    const writing = useRef(0);
    const lastWriteAt = useRef(0);
    const lk = localKey(clinicId, date);

    const publish = useCallback((next: CallLog) => {
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
                const res = await api.desk.getCalls(clinicId, date);
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

    /** Qatorga o'zgarish. Xato otmaydi — natija ekranda darhol ko'rinadi. */
    const apply = useCallback(async (key: string, change: CallLogChange): Promise<void> => {
        const seq = ++writeSeq.current;
        lastWriteAt.current = Date.now();
        publish(applyCallChange(entriesRef.current, key, change, new Date().toISOString()));
        if (!serverOk.current) {
            writeLocal(lk, entriesRef.current);
            return;
        }
        writing.current++;
        try {
            const res = await api.desk.logCall({ clinicId, date, key, ...change });
            lastWriteAt.current = Date.now();
            // Orada yana bosilgan bo'lsa, oxirgi javobni kutamiz
            if (seq === writeSeq.current) publish(res.entries || {});
        } catch (e) {
            console.warn("Qo'ng'iroq natijasi serverga yozilmadi:", e);
        } finally {
            writing.current--;
        }
    }, [clinicId, date, lk, publish]);

    return { entries, apply };
}
