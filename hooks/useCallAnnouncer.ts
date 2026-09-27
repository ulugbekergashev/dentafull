import { useEffect, useRef } from 'react';
import { CallEvent } from '../utils/onlineQueue';
import { announceCall } from '../utils/queueCall';

/** Shundan eski chaqiruv e'lon qilinmaydi (masalan, kompyuter uyqudan uyg'onganda) */
const FRESH_MS = 3 * 60 * 1000;

/**
 * Yangi chaqiruvni e'lon qiladi: ohang va (yoqilgan bo'lsa) ovoz. Chaqiruv qaysi
 * qurilmada bosilgani ahamiyatsiz — shifokorning "Kirish"i, resepshnning
 * "Chaqirish"i yoki "Qayta chaqirish" — hammasi server orqali keladi.
 *
 * Sahifa ochilganda mavjud chaqiruvlar qayta o'qilmaydi: `ready` bo'lgan paytdagi
 * holat boshlang'ich deb olinadi.
 */
export function useCallAnnouncer(events: CallEvent[], opts: { ready: boolean; enabled: boolean; voice: boolean }) {
    const seen = useRef<Map<string, number> | null>(null);
    const optsRef = useRef(opts);
    optsRef.current = opts;

    useEffect(() => {
        if (!opts.ready) {
            seen.current = null;
            return;
        }
        if (!seen.current) {
            seen.current = new Map(events.map(e => [e.appointment.id, e.at]));
            return;
        }
        const map = seen.current;
        const fresh = events
            .filter(e => (map.get(e.appointment.id) ?? 0) < e.at)
            .sort((a, b) => a.at - b.at);
        for (const e of fresh) map.set(e.appointment.id, e.at);
        const { enabled, voice } = optsRef.current;
        if (!enabled) return;
        const now = Date.now();
        for (const e of fresh) {
            if (now - e.at > FRESH_MS) continue;
            void announceCall({ number: e.number, patientName: e.appointment.patientName, doctorName: e.appointment.doctorName }, voice);
        }
    }, [events, opts.ready]);
}
