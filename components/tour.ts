/**
 * Qo'llanma (onboarding tour) — sarlavhadagi "Qo'llanma" tugmasi ochadi.
 *
 * Joriy sahifaga qarab qadamlar tanlanadi: bosh sahifada — umumiy tanishuv
 * (menyu, qidiruv, DentaAI ...) va sahifaning o'zi; Kalendar, Bemorlar va
 * Xabarlarda — o'sha sahifa. Qolgan sahifalarda — umumiy tanishuv.
 * Elementlar `data-tour="..."` belgisi bilan topiladi. Ekranda ko'rinmaydigan
 * element (rol, ruxsat yoki ekran o'lchami tufayli) bo'lsa, qadam tashlab ketiladi —
 * shuning uchun bitta ro'yxat admin, resepshn va shifokorga ham, telefon va
 * kompyuterga ham yaraydi.
 *
 * Bu modul (driver.js bilan birga) faqat tugma bosilganda yuklanadi.
 */
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import type { TranslationKey } from '../i18n/translations';

type TourName =
    | 'welcome' | 'nav' | 'menu' | 'search' | 'ai' | 'bell' | 'lang'
    | 'period' | 'quick' | 'map' | 'money' | 'calls' | 'myQueue' | 'colleagues'
    | 'calDate' | 'calView' | 'calNew' | 'calDoctors' | 'calGrid'
    | 'msgTabs' | 'msgVars' | 'msgNew' | 'msgTemplate'
    | 'patAdd' | 'patStats' | 'patSearch' | 'patList'
    | 'again';

interface TourStep {
    name: TourName;
    /** CSS selektor. Bo'lmasa — ekran o'rtasidagi izoh */
    target?: string;
}

const at = (id: string) => `[data-tour="${id}"]`;
const textKey = <N extends TourName, P extends 'title' | 'desc'>(name: N, part: P) =>
    `tour.${name}.${part}` as `tour.${N}.${P}`;

const WELCOME: TourStep = { name: 'welcome' };

// Ilova qobig'i: kompyuterda yuqori sarlavha, telefonda — pastki menyu va ☰
const SHELL: TourStep[] = [
    { name: 'nav', target: at('nav') },
    { name: 'menu', target: at('menu') },
    { name: 'search', target: at('search') },
    { name: 'ai', target: at('ai') },
    { name: 'bell', target: at('bell') },
    { name: 'lang', target: at('lang') },
];

// Bosh sahifa: resepshn/admin ish stoli yoki shifokor navbati — qaysi biri ekranda bo'lsa
const DASHBOARD: TourStep[] = [
    { name: 'period', target: at('period') },
    { name: 'quick', target: at('quick') },
    { name: 'map', target: at('clinic-map') },
    { name: 'money', target: at('money') },
    { name: 'calls', target: at('calls') },
    { name: 'myQueue', target: at('my-queue') },
    { name: 'colleagues', target: at('colleagues') },
];

const CALENDAR: TourStep[] = [
    { name: 'calDate', target: at('cal-date') },
    { name: 'calView', target: at('cal-view') },
    { name: 'calNew', target: at('cal-new') },
    { name: 'calDoctors', target: at('cal-doctors') },
    { name: 'calGrid', target: at('cal-grid') },
];

const MESSAGES: TourStep[] = [
    { name: 'msgTabs', target: at('msg-tabs') },
    { name: 'msgVars', target: at('msg-vars') },
    { name: 'msgNew', target: at('msg-new') },
    { name: 'msgTemplate', target: `${at('msg-templates')} > :first-child` },
];

const PATIENTS: TourStep[] = [
    { name: 'patAdd', target: at('pat-add') },
    { name: 'patStats', target: at('pat-stats') },
    { name: 'patSearch', target: at('pat-search') },
    // Ro'yxat yuzlab qator bo'lishi mumkin — birinchi bemor qatori ko'rsatiladi
    { name: 'patList', target: at('pat-row') },
];

// Oxirida — qo'llanmani qayta ochish tugmasining o'zi
const AGAIN: TourStep = { name: 'again', target: at('tour') };

const PAGE_TOURS: { match: (path: string) => boolean; steps: TourStep[] }[] = [
    { match: p => p === '/', steps: [WELCOME, ...SHELL, ...DASHBOARD] },
    { match: p => p === '/calendar', steps: CALENDAR },
    { match: p => p === '/messages', steps: MESSAGES },
    { match: p => p === '/patients', steps: PATIENTS },
];

function isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // Yopiq yon menyu ekrandan tashqarida turadi
    if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
    return getComputedStyle(el).visibility !== 'hidden';
}

const findVisible = (selector: string): Element | undefined =>
    Array.from(document.querySelectorAll(selector)).find(isVisible);

export function startTour(pathname: string, t: (key: TranslationKey) => string): void {
    const page = PAGE_TOURS.find(p => p.match(pathname.replace(/\/+$/, '') || '/'));
    const plan = [...(page ? page.steps : [WELCOME, ...SHELL]), AGAIN];

    const steps: DriveStep[] = [];
    for (const step of plan) {
        let element: DriveStep['element'];
        if (step.target) {
            const found = findVisible(step.target);
            if (!found) continue;
            const selector = step.target;
            // React sahifani qayta chizsa ham to'g'ri elementni topsin
            element = () => findVisible(selector) || found;
        }
        steps.push({
            element,
            popover: {
                title: t(textKey(step.name, 'title')),
                description: t(textKey(step.name, 'desc')),
            },
        });
    }
    if (steps.length === 0) return;

    driver({
        steps,
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: t('tour.next'),
        prevBtnText: t('tour.prev'),
        doneBtnText: t('tour.done'),
        popoverClass: 'denta-tour',
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 12,
        smoothScroll: true,
        // O'rganish paytida tasodifan bosib, boshqa sahifaga ketib qolmasin
        disableActiveInteraction: true,
    }).drive();
}
