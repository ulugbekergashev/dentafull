import { Appointment, Doctor, FlowLog } from '../types';
import { isOpenAppointment, minutesOf } from './queue';

/**
 * Bosh sahifa xaritasi — bugun klinikada kim qayerda.
 *
 * Yo'lda: vaqti hali kelmagan ochiq qabul. Kutish zalida: vaqti kelgan (resepshn
 * "Keldi" bosganda vaqt hozirga ko'chadi) va hali kabinetga kirmagan. Kabinetda:
 * shifokor "Kirish" yoki resepshn "Kirdi" bosgan (FlowLog). Yakunlandi: "Completed".
 * Kutish va yo'ldagilar hozirgi navbat bilan bir xil hisoblanadi (utils/queue) —
 * xarita faqat kabinet bosqichini qo'shadi.
 */

/** Qabul davomiyligi noma'lum bo'lsa — 30 daqiqa */
export const visitMinutes = (a: Pick<Appointment, 'duration'>): number => (a.duration > 0 ? a.duration : 30);

/** Vaqti o'tib ketgan, lekin hali kabinetda bo'lsa — taxminan shuncha daqiqada tugaydi deb olinadi */
const OVERRUN_GRACE_MIN = 2;

export interface FlowLane {
    doctor: Doctor;
    /** Hozir kabinetda (eng oxirgi kirgani) */
    chair: Appointment | null;
    /** Kabinetga kirgan payt (ms) */
    chairSince: number | null;
    /** Kabinetda yana belgilangan bemorlar soni (odatda 0) */
    chairExtra: number;
    /** Kutish zalida — navbat tartibida */
    queue: Appointment[];
    /** Bugun hali keladiganlar — vaqt tartibida */
    coming: Appointment[];
    /** Bugun yakunlanganlar */
    done: Appointment[];
    /** Hozir kelgan yangi bemor taxminan necha daqiqa kutadi */
    etaMin: number;
    /** Yo'ldagilar navbat tufayli necha daqiqa kech kiradi (qabul id → daqiqa) */
    delays: Record<string, number>;
}

export interface ClinicFlow {
    lanes: FlowLane[];
    /** Bugun qabuli yo'q faol shifokorlar */
    idle: Doctor[];
    /** Hamma yo'ldagilar — vaqt tartibida */
    coming: Appointment[];
    /** Hamma yakunlanganlar — oxirgisi birinchi */
    done: Appointment[];
    counts: { coming: number; waiting: number; inChair: number; done: number };
}

const byTime = (a: Appointment, b: Appointment) => minutesOf(a.time) - minutesOf(b.time) || a.id.localeCompare(b.id);

/** ISO vaqt → kun boshidan beri daqiqa (mahalliy soat) */
const minutesOfIso = (iso: string): number => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
};

export function buildClinicFlow(
    appointments: Appointment[],
    doctors: Doctor[],
    log: FlowLog,
    today: string,
    nowMin: number,
): ClinicFlow {
    const todays = appointments.filter(a => a.date === today);
    const lanes: FlowLane[] = [];
    const idle: Doctor[] = [];
    const allComing: Appointment[] = [];
    const allDone: Appointment[] = [];
    let waiting = 0;
    let inChair = 0;

    for (const doctor of doctors) {
        const mine = todays.filter(a => a.doctorId === doctor.id);
        const open = mine.filter(isOpenAppointment);
        const seated = open
            .filter(a => !!log[a.id])
            .sort((a, b) => Date.parse(log[b.id].in) - Date.parse(log[a.id].in));
        const chair = seated[0] || null;
        const queue = open.filter(a => !log[a.id] && minutesOf(a.time) <= nowMin).sort(byTime);
        const coming = open.filter(a => !log[a.id] && minutesOf(a.time) > nowMin).sort(byTime);
        const done = mine.filter(a => a.status === 'Completed').sort((a, b) => byTime(b, a));

        if (!chair && queue.length === 0 && coming.length === 0 && done.length === 0) {
            if (doctor.status !== 'On Leave') idle.push(doctor);
            continue;
        }

        // Taxminiy jadval: kabinet qachon bo'shaydi, navbatdagilar ketma-ket kiradi,
        // keyin yozilganlar o'z vaqtida yoki navbat tugagach kiradi.
        let t = nowMin;
        if (chair) t = Math.max(minutesOfIso(log[chair.id].in) + visitMinutes(chair), nowMin + OVERRUN_GRACE_MIN);
        for (const a of queue) t += visitMinutes(a);
        const etaMin = Math.max(0, t - nowMin);
        const delays: Record<string, number> = {};
        for (const a of coming) {
            const booked = minutesOf(a.time);
            const start = Math.max(booked, t);
            delays[a.id] = start - booked;
            t = start + visitMinutes(a);
        }

        lanes.push({
            doctor,
            chair,
            chairSince: chair ? Date.parse(log[chair.id].in) : null,
            chairExtra: Math.max(0, seated.length - 1),
            queue,
            coming,
            done,
            etaMin,
            delays,
        });
        allComing.push(...coming);
        allDone.push(...done);
        waiting += queue.length;
        inChair += seated.length;
    }

    allComing.sort(byTime);
    allDone.sort((a, b) => byTime(b, a));
    return {
        lanes,
        idle,
        coming: allComing,
        done: allDone,
        counts: { coming: allComing.length, waiting, inChair, done: allDone.length },
    };
}

/**
 * Yo'l chizig'idagi belgilar joyi (0..1). Vaqtga mutanosib, lekin bir-birining
 * ustiga tushmaydi: yaqin vaqtdagilar kamida `gap` masofada suriladi.
 */
export function spreadPositions(ideal: number[], gap: number): number[] {
    const out = ideal.map(x => Math.min(1, Math.max(0, x)));
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
    // O'ng chetdan chiqib ketganlarni chapga qaytaramiz
    for (let i = out.length - 1; i >= 0; i--) {
        const limit = 1 - (out.length - 1 - i) * gap;
        out[i] = Math.min(out[i], limit);
    }
    return out.map(x => Math.max(0, x));
}

/** "Rashidov Bekzod" → "Rashidov B." */
export const shortName = (name: string): string => {
    const [first = '', second = ''] = String(name || '').trim().split(/\s+/);
    return second ? `${first} ${second.charAt(0)}.` : first;
};

/** "Rashidov Bekzod" → "RB" */
export const initialsOf = (name: string): string =>
    String(name || '')
        .replace(/^Dr\.\s*/, '')
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();
