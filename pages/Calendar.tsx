import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button, Modal, Input, Select, Badge, SearchableSelect, statusLabel } from '../components/Common';
import {
  ChevronLeft, ChevronRight, ChevronDown, PanelLeftClose, PanelLeftOpen, Plus, Clock, User, FileText,
  XCircle, CheckCircle, Send, Bell, Edit2, Loader2,
  Search
} from 'lucide-react';
import { Appointment, Patient, Doctor, UserRole, Clinic, SubscriptionPlan, ServiceCategory } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { DateField, DateJumpInput, DatePopover, MonthGrid, monthName, weekdayName } from '../components/DateField';
import { CalendarMonthView } from '../components/CalendarMonthView';
import { CalendarSidebar } from '../components/CalendarSidebar';
import { formatDateToISO, formatDayLong, formatHeaderDate } from '../utils/dateUtils';
import { doctorHours, initials } from '../utils/staffStats';
import { usePerms } from '../context/PermissionsContext';

/** Oxirgi tanlangan ko'rinish (Kun / Hafta / Oy) */
const CALENDAR_VIEW_KEY = 'dentalflow_calendar_view';
/** Yon panel (keng ekranda) yig'ib qo'yilganmi */
const CALENDAR_SIDEBAR_KEY = 'dentalflow_calendar_sidebar';
/** Bir soat balandligi (px) chegaralari: ish kuni imkon qadar jadvalga to'liq sig'adi */
const HOUR_MIN_PX = 56;
const HOUR_MAX_PX = 120;
/** Vaqt ustuni kengligi (px) */
const TIME_COL_PX = 60;
type CalView = 'day' | 'week' | 'month';

const minutesOfTime = (time: string) => {
  const [h, m] = String(time || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmmOf = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

interface CalendarProps {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  services: { name: string; price: number; duration: number }[];
  categories: ServiceCategory[];
  onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
  onUpdateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
  onDeleteAppointment: (id: string) => void;
  onAddPatient: (patient: Omit<Patient, 'id'>) => Promise<Patient | undefined>;
  userRole: UserRole;
  doctorId: string;
  /** Xodimlar → Ruxsatlar: shifokor klinikadagi barcha qabullarni ko'rsinmi (default yo'q) */
  seeAllPatients?: boolean;
  currentClinic?: Clinic;
  plans: SubscriptionPlan[];
  onPatientClick?: (id: string) => void;
}



export const Calendar: React.FC<CalendarProps> = ({
  appointments, patients, doctors, services, categories, onAddAppointment, onUpdateAppointment, onDeleteAppointment, onAddPatient, userRole, doctorId, seeAllPatients, currentClinic, plans, onPatientClick
}) => {
  const { t, language } = useLanguage();
  const perms = usePerms();
  const canCreate = perms.can('calendar', 'appts', 'create');
  const canEdit = perms.can('calendar', 'appts', 'edit');
  const canDelete = perms.can('calendar', 'appts', 'delete');
  const canRemind = perms.flag('calendar', 'remind');
  const canAddPatient = perms.can('patients', 'card', 'create');
  const startHour = currentClinic?.startHour ?? 8;
  const endHour = currentClinic?.endHour ?? 20;

  // ─── Shifokor filtri ───────────────────────────────────────────────────────
  // Kalendar shifokor bo'yicha: blok rangi — shifokor rangi, rang izohi esa filtr ham.
  // Standart: shifokorga — o'z qabullari, admin va resepshnga — hammasi; boshqasini
  // shu filtrdan tanlaydi. Tanlov manzilda turadi (?doctor=id1,id2 yoki ?doctor=all):
  // bosh sahifadagi "Hamkasblar hozir" → "Batafsil" hamkasb kalendarini shu orqali ochadi.
  const [searchParams, setSearchParams] = useSearchParams();
  const ownDoctorId = userRole === UserRole.DOCTOR ? doctorId : '';
  const doctorParam = searchParams.get('doctor');
  /** null — barcha shifokorlar */
  const selectedDoctorIds: string[] | null = useMemo(() => {
    if (doctorParam === 'all') return null;
    const fromUrl = (doctorParam || '').split(',').filter(id => doctors.some(d => d.id === id));
    if (fromUrl.length > 0) return fromUrl;
    return ownDoctorId ? [ownDoctorId] : null;
  }, [doctorParam, doctors, ownDoctorId]);
  const setDoctorFilter = (ids: string[] | null) => {
    const next = new URLSearchParams(searchParams);
    const isDefault = ids === null ? !ownDoctorId : ids.length === 1 && ids[0] === ownDoctorId;
    if (isDefault) next.delete('doctor');
    else next.set('doctor', ids === null ? 'all' : ids.join(','));
    setSearchParams(next, { replace: true });
  };
  const toggleDoctor = (id: string) => {
    // "Hammasi"dan keyin birinchi bosish — faqat shu shifokor; keyin qo'shib yoki olib tashlab boriladi
    if (!selectedDoctorIds) return setDoctorFilter([id]);
    const next = selectedDoctorIds.includes(id) ? selectedDoctorIds.filter(x => x !== id) : [...selectedDoctorIds, id];
    setDoctorFilter(next.length > 0 ? next : null);
  };
  const activeDoctors = doctors.filter(d => d.status === 'Active');
  // Filtr qatori: faol shifokorlar + tanlangani (masalan, "Batafsil"dan ochilgan ta'tildagi hamkasb)
  const filterDoctors = doctors.filter(d => d.status === 'Active' || !!selectedDoctorIds?.includes(d.id));
  // Kun ko'rinishidagi ustunlar — tanlangan shifokorlar
  const columnDoctors = selectedDoctorIds ? filterDoctors.filter(d => selectedDoctorIds.includes(d.id)) : activeDoctors;
  // Ko'rish doirasi "faqat o'zinikini" (Ruxsatlar → Bemorlar) bo'lgan shifokor hamkasb
  // qabullarini faqat "Band" deb ko'radi — bemor ismi va xizmat ko'rinmaydi, xuddi
  // bosh sahifadagi "Hamkasblar hozir" kabi. Doira "hammasi" bo'lsa — to'liq ko'radi.
  const restricted = userRole === UserRole.DOCTOR && !!doctorId && !seeAllPatients;
  const isPrivate = (a: Appointment) => restricted && a.doctorId !== doctorId;
  const visibleAppointments = useMemo(() => appointments.filter(a =>
    (!selectedDoctorIds || selectedDoctorIds.includes(a.doctorId))
    // Hamkasbning bekor qilingan yozuvi vaqtni band qilmaydi
    && !(restricted && a.doctorId !== doctorId && a.status === 'Cancelled')
  ), [appointments, selectedDoctorIds, restricted, doctorId]);
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  // Ko'rinish: oxirgi tanlangani eslab qolinadi. Hali tanlanmagan bo'lsa: klinikada bir
  // nechta shifokor bo'lsa admin va resepshnga — "Kun" (har shifokor alohida ustunda, qabul
  // o'qiladigan kenglikda), shifokorga va bitta shifokorli klinikaga — "Hafta".
  // Telefonda doim "Kun".
  const [chosenView, setChosenView] = useState<CalView | null>(() => {
    try {
      const saved = localStorage.getItem(CALENDAR_VIEW_KEY);
      if (saved === 'day' || saved === 'week' || saved === 'month') return saved;
    } catch { /* xotira yopiq bo'lsa — standart */ }
    return null;
  });
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768);
  const view: CalView = narrow ? 'day' : chosenView ?? (!ownDoctorId && activeDoctors.length > 1 ? 'day' : 'week');
  const setView = (v: CalView) => {
    setChosenView(v);
    try { localStorage.setItem(CALENDAR_VIEW_KEY, v); } catch { /* sessiya davomida baribir ishlaydi */ }
  };
  // Yon panel faqat keng ekranda (2xl); yig'ib qo'yilsa — shifokorlar qatori qaytadi, jadval kengayadi
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem(CALENDAR_SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const toggleSidebar = () => setSidebarOpen(open => {
    try { localStorage.setItem(CALENDAR_SIDEBAR_KEY, open ? '0' : '1'); } catch { /* sessiya davomida baribir ishlaydi */ }
    return !open;
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [remindedAppts, setRemindedAppts] = useState<Set<string>>(new Set());

  // Message Modal State
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('Custom');
  const [messagePatientId, setMessagePatientId] = useState<string | null>(null);

  // Add Form State
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    type: '',
    categoryId: '',
    date: formatDateToISO(new Date()),
    time: '09:00',
    duration: 60,
    notes: ''
  });

  // Patient Creation State
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [isSubmittingPatient, setIsSubmittingPatient] = useState(false);
  const [patientFormData, setPatientFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dob: '',
    gender: 'Male',
    medicalHistory: '',
    address: '',
    secondaryPhone: ''
  });

  // Telefon o'lchamida jadval har doim "Kun" ko'rinishida (tanlov saqlanib qoladi)
  React.useEffect(() => {
    const handleResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Open Add Modal with default values selected if available
  const openAddModal = (initialDate?: string, initialTime?: string, initialDoctorId?: string) => {
    // Bo'sh katakni bosish ham shu yerga keladi — qabul yozish ruxsati bo'lmasa hech narsa ochilmaydi
    if (!canCreate) return;
    setEditingApptId(null);
    // Check if clinic is on individual plan
    const isIndividualPlan = currentClinic?.planId === 'individual';

    setFormData({
      patientId: patients.length > 0 ? patients[0].id : '',
      // Defolt shifokor: berilgan → filtrda bitta shifokor tanlangan bo'lsa, o'sha →
      // kirgan shifokor (DOCTOR roli) → birinchi shifokor
      doctorId: initialDoctorId || (selectedDoctorIds?.length === 1 ? selectedDoctorIds[0] : '') || (userRole === UserRole.DOCTOR && doctorId ? doctorId : '') || (doctors.length > 0 ? doctors[0].id : ''),
      type: '',
      categoryId: '',
      // Tugma onClick hodisasini uzatib yuborsa ham sana har doim matn bo'lsin
      date: typeof initialDate === 'string' && initialDate ? initialDate : formatDateToISO(new Date()),
      time: initialTime || '09:00',
      duration: 60,
      notes: ''
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    setEditingApptId(appt.id);
    setFormData({
      patientId: appt.patientId,
      doctorId: appt.doctorId || (doctors.length > 0 ? doctors[0].id : ''),
      type: appt.type,
      categoryId: '',
      date: appt.date,
      time: appt.time,
      duration: appt.duration,
      notes: appt.notes || ''
    });
    setIsAddModalOpen(true);
    setSelectedAppointment(null);
  };

  // Helper: Get start of current week (Monday)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return monday;
  };

  // Helper: Get days to display
  const getDisplayDays = (date: Date, currentView: CalView) => {
    if (currentView === 'day') {
      return [new Date(date)];
    }

    const days = [];
    const start = getStartOfWeek(new Date(date));
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const displayDays = getDisplayDays(currentDate, view);

  // Kunga o'tish: sarlavhadagi sana bosilganda oylik kalendar ochiladi
  const jumpAnchorRef = React.useRef<HTMLButtonElement>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const todayKey = formatDateToISO(new Date());
  const currentKey = formatDateToISO(currentDate);
  const showsToday = view === 'month'
    ? todayKey.slice(0, 7) === currentKey.slice(0, 7)
    : displayDays.some(d => formatDateToISO(d) === todayKey);
  // Oylik kalendarda har kun ostida qabullar soni — bo'sh kunni tez topish uchun
  const appointmentCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    visibleAppointments.forEach(a => {
      if (a.status !== 'Cancelled') counts[a.date] = (counts[a.date] || 0) + 1;
    });
    return counts;
  }, [visibleAppointments]);
  // Tushda: kun o'zgarmaydi, qaysi soat mintaqasida bo'lmasin
  const goToDate = (key: string) => { setCurrentDate(new Date(`${key}T12:00`)); setJumpOpen(false); };
  // Oylik ko'rinishdan kunga: shu kunning soatli jadvali ochiladi
  const openDay = (key: string) => { goToDate(key); setView('day'); };
  const headerLabel = (() => {
    if (view === 'month') return `${monthName(currentDate, language)} ${currentDate.getFullYear()}`;
    const thisYear = new Date().getFullYear();
    if (view === 'day') {
      const d = displayDays[0];
      return `${formatDayLong(language, d)}${d.getFullYear() !== thisYear ? ` ${d.getFullYear()}` : ''}, ${weekdayName(d, language)}`;
    }
    const [first, last] = [displayDays[0], displayDays[6]];
    const year = first.getFullYear() !== thisYear || last.getFullYear() !== thisYear ? ` ${last.getFullYear()}` : '';
    // Bir oy ichida: "5 – 11-oktabr", aks holda "28-sentabr – 4-oktabr"
    const from = first.getMonth() === last.getMonth() ? String(first.getDate()) : formatDayLong(language, first);
    return `${from} – ${formatDayLong(language, last)}${year}`;
  })();

  // ─── Jadval (Kun / Hafta) ──────────────────────────────────────────────────
  const dayKeys = displayDays.map(d => formatDateToISO(d));
  const gridColumns = view === 'week' ? 7 : Math.max(1, columnDoctors.length);
  const gridTemplate = view === 'week'
    ? `${TIME_COL_PX}px repeat(7, minmax(0, 1fr))`
    : columnDoctors.length > 0
      ? `${TIME_COL_PX}px repeat(${columnDoctors.length}, minmax(160px, 1fr))`
      : `${TIME_COL_PX}px 1fr`;
  const doctorRank = new Map<string, number>(doctors.map((d, i) => [d.id, i]));
  const spanOf = (a: Appointment): [number, number] => {
    const start = minutesOfTime(a.time);
    return [start, start + Math.max(10, a.duration || 30)];
  };

  // Bekor qilingan qabul vaqtni band qilmaydi — jadvalda ko'rsatilmaydi (u bemor kartasida qoladi)
  const gridAppointments = visibleAppointments.filter(a =>
    a.status !== 'Cancelled' && (view === 'week' ? dayKeys.includes(a.date) : a.date === currentKey));

  // Soatlar: klinika ish vaqti; undan tashqaridagi qabul bo'lsa — jadval o'sha soatgacha kengayadi
  const gridFirstHour = gridAppointments.reduce((h, a) => Math.min(h, Math.floor(spanOf(a)[0] / 60)), startHour);
  const gridLastHour = Math.min(23, gridAppointments.reduce((h, a) => Math.max(h, Math.ceil(spanOf(a)[1] / 60) - 1), Math.max(startHour, endHour - 1)));
  const gridHours = Array.from({ length: Math.max(1, gridLastHour - gridFirstHour + 1) }, (_, i) => i + gridFirstHour);
  const gridStartMin = gridFirstHour * 60;

  // Soat balandligi: jadval ko'rinadigan qismiga ish kuni to'liq sig'sin (56–120px oralig'ida)
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const [bodyViewport, setBodyViewport] = useState(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || view === 'month' || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBodyViewport(el.clientHeight - (headerRef.current?.offsetHeight || 0));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (headerRef.current) ro.observe(headerRef.current);
    measure();
    return () => ro.disconnect();
  }, [view]);
  const fitPx = bodyViewport > 0 ? Math.floor(bodyViewport / gridHours.length / 2) * 2 : 72;
  const hourPx = Math.min(HOUR_MAX_PX, Math.max(HOUR_MIN_PX, fitPx));
  const gridHeight = gridHours.length * hourPx;
  const yOf = (min: number) => (min - gridStartMin) * hourPx / 60;

  // Ish vaqtidan tashqarisi xira: kun ko'rinishida — har shifokorning o'z vaqti (Xodimlar →
  // ish vaqti), haftada — bitta shifokor tanlangan bo'lsa uniki, aks holda klinikaniki
  const workOf = (doc?: Doctor): [number, number] => {
    const h = doc ? doctorHours(doc, currentClinic) : { start: startHour, end: endHour };
    return [h.start * 60, h.end * 60];
  };
  const columnWork: [number, number][] = view === 'week'
    ? dayKeys.map(() => workOf(columnDoctors.length === 1 ? columnDoctors[0] : undefined))
    : columnDoctors.length > 0 ? columnDoctors.map(d => workOf(d)) : [workOf()];

  // Joylashuv: ustun (hafta — kun, kun — shifokor) ichida vaqti ustma-ust tushgan qabullar
  // yonma-yon turadi, qolgani ustunning to'liq kengligini oladi; yonida bo'sh joy bo'lsa
  // blok o'sha tomonga kengayadi (Google Calendar kabi). Bir vaqtda turganlar shifokor
  // tartibida — bir shifokor hafta davomida bir tomonda turadi.
  const placements: Record<string, { col: number; sub: number; subs: number; span: number }> = (() => {
    const res: Record<string, { col: number; sub: number; subs: number; span: number }> = {};
    const groups = new Map<number, Appointment[]>();
    for (const a of gridAppointments) {
      const col = view === 'week'
        ? dayKeys.indexOf(a.date)
        : columnDoctors.length > 0 ? columnDoctors.findIndex(d => d.id === a.doctorId) : 0;
      if (col < 0) continue;
      if (!groups.has(col)) groups.set(col, []);
      groups.get(col)!.push(a);
    }
    for (const [col, list] of groups) {
      list.sort((a, b) => spanOf(a)[0] - spanOf(b)[0]
        || (doctorRank.get(a.doctorId) ?? 99) - (doctorRank.get(b.doctorId) ?? 99)
        || spanOf(b)[1] - spanOf(a)[1]);
      let cluster: Appointment[] = [];
      let clusterEnd = -1;
      let ends: number[] = [];
      const flush = () => {
        const subs = Math.max(1, ends.length);
        for (const a of cluster) {
          const p = res[a.id];
          const [s, e] = spanOf(a);
          let span = 1;
          while (p.sub + span < subs && !cluster.some(b =>
            res[b.id].sub === p.sub + span && spanOf(b)[0] < e && spanOf(b)[1] > s)) span++;
          p.subs = subs;
          p.span = span;
        }
        cluster = [];
        ends = [];
        clusterEnd = -1;
      };
      for (const a of list) {
        const [s, e] = spanOf(a);
        if (cluster.length && s >= clusterEnd) flush();
        let sub = ends.findIndex(x => x <= s);
        if (sub === -1) { sub = ends.length; ends.push(e); } else ends[sub] = e;
        res[a.id] = { col, sub, subs: 1, span: 1 };
        cluster.push(a);
        clusterEnd = Math.max(clusterEnd, e);
      }
      flush();
    }
    return res;
  })();

  // Blok matni kenglikka qarab tanlanadi — shuning uchun jadval kengligi o'lchab turiladi
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);
  React.useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setGridWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // "Hozir" chizig'i — daqiqa sayin yangilanadi
  const [nowTick, setNowTick] = useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const nowMin = nowTick.getHours() * 60 + nowTick.getMinutes();
  const nowTop = yOf(nowMin);
  const todayCol = view === 'week' ? dayKeys.indexOf(todayKey) : currentKey === todayKey ? 0 : -1;
  const showNowLine = view !== 'month' && todayCol !== -1 && nowTop >= 0 && nowTop <= gridHeight;

  // Ochilganda jadval hozirgi vaqtga (bugun bo'lmasa — birinchi qabulga) suriladi.
  // Faqat ko'rinish, sana yoki soat balandligi almashganda: foydalanuvchi o'zi
  // aylantirganini buzmaymiz.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || view === 'month') return;
    const first = gridAppointments.reduce((mn, a) => Math.min(mn, minutesOfTime(a.time)), Infinity);
    const fromMin = showNowLine
      ? (nowTick.getHours() - 1) * 60
      : Number.isFinite(first) ? Math.floor(first / 60) * 60 : gridStartMin;
    el.scrollTop = Math.max(0, yOf(fromMin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentKey, hourPx]);

  // Handlers
  const handlePrev = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1, 12));
      return;
    }
    const newDate = new Date(currentDate);
    if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1, 12));
      return;
    }
    const newDate = new Date(currentDate);
    if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if clinic is on individual plan
    const isIndividualPlan = currentClinic?.planId === 'individual';

    // Validation check
    if (!formData.patientId) {
      alert(t('patients.details.alerts.selectPatient'));
      return;
    }

    let finalDoctorId = formData.doctorId;
    let finalDoctorName = '';

    // Special handling for individual plan or if doctor is missing
    if (!finalDoctorId) {
      if (isIndividualPlan && doctors.length === 0) {
        // Auto-create doctor logic
        try {
          // Use admin name or default
          const adminNameParts = currentClinic?.adminName?.split(' ') || ['Admin'];
          const firstName = adminNameParts[0];
          const lastName = adminNameParts.slice(1).join(' ') || 'Doctor';

          const newDoctor = await api.doctors.create({
            firstName,
            lastName,
            specialty: 'Stomatolog',
            phone: currentClinic?.phone || '',
            status: 'Active',
            clinicId: currentClinic?.id || ''
          });

          finalDoctorId = newDoctor.id;
          finalDoctorName = `Dr. ${newDoctor.lastName}`;

          // Notify user (optional, but good for context)
          // alert("Individual tarif bo'yicha shifokor profili avtomatik yaratildi.");
        } catch (err) {
          console.error('Failed to auto-create doctor', err);
          alert("Xatolik: Shifokor profilini avtomatik yaratib bo'lmadi. Iltimos, Xodimlar bo'limida yarating.");
          return;
        }
      } else if (doctors.length > 0) {
        // Auto-select first doctor
        finalDoctorId = doctors[0].id;
        finalDoctorName = `Dr. ${doctors[0].lastName}`;
      } else {
        alert(t('calendar.alerts.noDoctorSys'));
        return;
      }
    }

    if (!isIndividualPlan && !finalDoctorId) {
      alert(t('patients.details.alerts.selectDoctorReq'));
      return;
    }

    // Past Time Validation - REMOVED per user request
    // const selectedDateTime = new Date(`${formData.date}T${formData.time}`);
    // const now = new Date();
    // if (selectedDateTime < now) { ... }

    const patient = patients.find(p => p.id === formData.patientId);

    // Check if we found the doctor in existing list (might be new if we just created)
    let doctor = doctors.find(d => d.id === finalDoctorId);

    // If not in list (newly created), mock it for immediate UI usage if needed, 
    // but we have finalDoctorId and finalDoctorName now.

    if (!patient) {
      alert(t('calendar.alerts.patientNotFound'));
      return;
    }

    // Only check for doctor object if we didn't just create it
    if (!doctor && !finalDoctorName) {
      // Should not match here if we handled creation
      alert(t('patients.details.alerts.doctorNotFound'));
      return;
    }

    // Set names if we found existing doctor
    if (doctor) {
      finalDoctorName = `Dr. ${doctor.lastName}`;
    }

    // Doctor Conflict Validation
    const doctorConflict = appointments.some(appt =>
      appt.id !== editingApptId &&
      appt.doctorId === finalDoctorId &&
      appt.date === formData.date &&
      appt.time === formData.time &&
      appt.status !== 'Cancelled'
    );

    if (doctorConflict) {
      alert(t('patients.details.alerts.doctorConflict'));
      return;
    }

    // Patient Conflict Validation
    const patientConflict = appointments.some(appt =>
      appt.id !== editingApptId &&
      appt.patientId === patient.id &&
      appt.date === formData.date &&
      appt.time === formData.time &&
      appt.status !== 'Cancelled'
    );

    if (patientConflict) {
      alert(t('patients.details.alerts.patientConflict'));
      return;
    }

    try {
      if (editingApptId) {
        await onUpdateAppointment(editingApptId, {
          patientId: patient.id,
          patientName: `${patient.lastName} ${patient.firstName}`,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          type: formData.type || 'Konsultatsiya',
          date: formData.date,
          time: formData.time,
          duration: Number(formData.duration),
          notes: formData.notes
        });
      } else {
        await onAddAppointment({
          patientId: patient.id,
          patientName: `${patient.lastName} ${patient.firstName}`,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          type: formData.type || 'Konsultatsiya',
          date: formData.date,
          time: formData.time,
          duration: Number(formData.duration),
          status: 'Pending',
          notes: formData.notes
        });
      }
      setIsAddModalOpen(false);
      setEditingApptId(null);
    } catch (error) {
      // Error is handled by App.tsx toast and re-thrown
      // Keeping modal open on failure
    }
  };

  const handleStatusUpdate = async (status: Appointment['status']) => {
    if (selectedAppointment) {
      try {
        await onUpdateAppointment(selectedAppointment.id, { status });
        setSelectedAppointment({ ...selectedAppointment, status }); // Optimistic update for modal
      } catch (error) {
        // Error handled by App.tsx
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messagePatientId) return;

    try {
      await api.patients.sendMessage(messagePatientId, messageText);
      alert(t('patients.details.alerts.messageSent'));
      setIsMessageModalOpen(false);
      setMessageText('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error.message === 'Bot not configured' || error.error === 'Bot not configured') {
        alert('⚠️ ' + t('patients.details.alerts.botNotConfigured'));
      } else if (error.message === 'Patient telegram not linked' || error.error === 'Patient telegram not linked') {
        alert('⚠️ ' + t('calendar.alerts.tgNotLinked'));
      } else {
        alert(`Xatolik: ${error.message || t('calendar.alerts.msgError')}`);
      }
    }
  };

  const handlePatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientFormData.firstName || !patientFormData.lastName) {
      alert(t('calendar.alerts.enterName'));
      return;
    }

    setIsSubmittingPatient(true);
    try {
      // Find the new patient after creation
      // Note: onAddPatient doesn't return the patient in App.tsx but api.patients.create does.
      // However, addPatient in App.tsx updates the state.
      // We might need to handle selecting it after it's added to the patients list.
      const currentPatientCount = patients.length;

      const newPatient = await onAddPatient({
        ...patientFormData,
        status: 'Active',
        lastVisit: 'Never',
        gender: patientFormData.gender as 'Male' | 'Female'
      });

      setIsAddPatientModalOpen(false);

      if (newPatient && newPatient.id) {
        setFormData(prev => ({ ...prev, patientId: newPatient.id }));
      }

      // Reset form
      setPatientFormData({
        firstName: '',
        lastName: '',
        phone: '',
        dob: '',
        gender: 'Male',
        medicalHistory: '',
        address: '',
        secondaryPhone: ''
      });

      // We'll need to wait for the patients list to update to find the new ID
      // For now, the user can select from the dropdown which will include the new patient
    } catch (error) {
      console.error('Failed to create patient', error);
    } finally {
      setIsSubmittingPatient(false);
    }
  };

  const openMessageModal = (appt: Appointment) => {
    setMessagePatientId(appt.patientId);
    setMessageType('Custom');

    // Check if appointment is tomorrow
    const apptDate = new Date(appt.date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (apptDate.toDateString() === tomorrow.toDateString()) {
      setMessageType('Tomorrow');

      // Format date nicely
      const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
      const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
      const dayName = dayNames[apptDate.getDay()];
      const day = apptDate.getDate();
      const month = monthNames[apptDate.getMonth()];

      setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${appt.patientName}!\n\nSizni ertaga, ${day}-${month} (${dayName}) kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.\n\n📍 Manzil: Klinikamiz\n⏰ Vaqt: ${appt.time}\n👨‍⚕️ Shifokor: ${appt.doctorName}\n\nIltimos, vaqtida kelishingizni so'raymiz.\n\nSavol bo'lsa, biz bilan bog'laning.`);
    } else {
      // Default to generic appointment reminder
      setMessageType('Custom');
      setMessageText(`Hurmatli ${appt.patientName}, sizni ${appt.date} kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.`);
    }

    setIsMessageModalOpen(true);
  };

  // UI Data
  const dayNames = [
    t('calendar.days.sun'), t('calendar.days.mon'), t('calendar.days.tue'),
    t('calendar.days.wed'), t('calendar.days.thu'), t('calendar.days.fri'),
    t('calendar.days.sat')
  ];

  // Ko'rinib turgan davr (kun / hafta / oy) bo'yicha har shifokorning qabullari soni
  const inViewRange = (date: string) => view === 'month'
    ? date.slice(0, 7) === currentKey.slice(0, 7)
    : view === 'week' ? dayKeys.includes(date) : date === currentKey;
  const doctorCounts: Record<string, number> = {};
  appointments.forEach(a => {
    if (a.status !== 'Cancelled' && inViewRange(a.date)) doctorCounts[a.doctorId] = (doctorCounts[a.doctorId] || 0) + 1;
  });

  const viewButton = (v: CalView, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`h-7 px-3 text-xs font-semibold rounded-md transition-all ${view === v
        ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
    >
      {label}
    </button>
  );
  const colW = `((100% - ${TIME_COL_PX}px) / ${gridColumns})`;

  return (
    // Balandlik ekranga teng: sahifa emas, faqat jadval aylanadi (yuqori panel va chekkalar ayiriladi)
    <div className="h-[calc(100vh-12.25rem)] lg:h-[calc(100vh-9rem)] flex flex-col gap-3 animate-fade-in">
      {/* Sahifa nomi menyuda turibdi — ekranda joy olmasin, ekran o'quvchisi uchun qoladi */}
      <h1 className="sr-only">{t('calendar.title')}</h1>

      {/* Asboblar qatori: bugun, sana, ko'rinish, yangi qabul */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-pressed={sidebarOpen}
          aria-label={t('calendar.sidebar.toggle')}
          title={t('calendar.sidebar.toggle')}
          className="hidden 2xl:inline-flex p-2 -ml-1 rounded-lg shrink-0 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={() => goToDate(todayKey)}
          className={`h-9 px-3 rounded-lg border text-sm font-semibold shrink-0 transition-colors ${showsToday
            ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200'}`}
        >
          {t('datefield.today')}
        </button>
        <div data-tour="cal-date" className="flex items-center min-w-0">
          <button type="button" onClick={handlePrev} aria-label={t('calendar.prev')} title={t('calendar.prev')} className="p-1.5 rounded-lg shrink-0 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"><ChevronLeft className="w-5 h-5" /></button>
          <button type="button" onClick={handleNext} aria-label={t('calendar.next')} title={t('calendar.next')} className="p-1.5 rounded-lg shrink-0 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"><ChevronRight className="w-5 h-5" /></button>
          <button
            ref={jumpAnchorRef}
            type="button"
            onClick={() => setJumpOpen(o => !o)}
            title={t('datefield.openCalendar')}
            className="sm:ml-1 flex items-center gap-1 min-w-0 px-1 sm:px-2 py-1 rounded-lg text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
          >
            {/* Telefonda qisqa: "29-sentabr, sesh" (u yerda doim "Kun") */}
            <span className="sm:hidden text-sm font-bold truncate">{view === 'day' ? formatHeaderDate(language, displayDays[0]) : headerLabel}</span>
            <span className="hidden sm:inline text-xl font-bold truncate">{headerLabel}</span>
            <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
          </button>
        </div>
        <DatePopover anchorRef={jumpAnchorRef} open={jumpOpen} onClose={() => setJumpOpen(false)}>
          {/* Sanani bosmasdan yozib ham o'tish mumkin: 26.09.2026 yoki 26.09 + Enter */}
          <DateJumpInput onSubmit={goToDate} />
          <MonthGrid value={currentKey} onPick={goToDate} counts={appointmentCounts} />
          <button type="button" onClick={() => goToDate(todayKey)} className="mt-2 w-full py-1.5 rounded-lg text-xs font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20">
            {t('datefield.today')}
          </button>
        </DatePopover>
        <div className="flex-1" />
        {/* Telefonda doim "Kun" — tanlov kerak emas */}
        <div data-tour="cal-view" className="hidden md:flex items-center gap-0.5 p-1 rounded-lg shrink-0 bg-gray-100 dark:bg-gray-700/60">
          {viewButton('day', t('calendar.day'))}
          {viewButton('week', t('calendar.week'))}
          {viewButton('month', t('calendar.month'))}
        </div>
        {canCreate && (
          <Button onClick={() => openAddModal()} data-tour="cal-new" className="shrink-0" title={t('calendar.newAppointment')}>
            <Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('calendar.newAppointment')}</span>
          </Button>
        )}
      </div>

      {/* Shifokorlar (keng ekranda — yon panelda): rang izohi va filtr bir joyda, blok rangi shifokor rangi */}
      {doctors.length > 1 && (
        <div role="group" aria-label={t('calendar.doctorFilter')} data-tour="cal-doctors" className={`${sidebarOpen ? '2xl:hidden' : ''} flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5`}>
          <button
            type="button"
            onClick={() => setDoctorFilter(null)}
            aria-pressed={!selectedDoctorIds}
            className={`h-8 px-3 rounded-full border text-xs font-bold shrink-0 transition-colors ${!selectedDoctorIds
              ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-200'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
          >
            {t('calendar.allDoctors')}
          </button>
          {filterDoctors.map(doc => {
            const color = doc.color || '#3B82F6';
            const on = !!selectedDoctorIds?.includes(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggleDoctor(doc.id)}
                aria-pressed={on}
                style={on ? { borderColor: color, backgroundColor: `${color}1F` } : undefined}
                className={`inline-flex items-center gap-2 h-8 px-3 rounded-full border text-xs font-semibold shrink-0 transition-all ${on
                  ? 'text-gray-900 dark:text-white'
                  : `border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 ${selectedDoctorIds ? 'opacity-60 hover:opacity-100' : ''}`}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                Dr. {doc.lastName}
                {!!doctorCounts[doc.id] && <span className="tabular-nums font-normal text-gray-400">{doctorCounts[doc.id]}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Kalendar: yon panel (keng ekranda) va jadval */}
      <div className="flex-1 min-h-0 flex bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {sidebarOpen && <CalendarSidebar
          dateKey={view === 'week' ? dayKeys[0] : currentKey}
          rangeFrom={view === 'week' ? dayKeys[0] : undefined}
          rangeTo={view === 'week' ? dayKeys[6] : undefined}
          dayCounts={appointmentCounts}
          onPickDate={goToDate}
          doctors={filterDoctors}
          selectedDoctorIds={selectedDoctorIds}
          doctorCounts={doctorCounts}
          onShowAll={() => setDoctorFilter(null)}
          onToggleDoctor={toggleDoctor}
          showBusy={restricted}
        />}
        <div ref={scrollRef} data-tour="cal-grid" className="flex-1 min-w-0 overflow-auto">
          {view === 'month' ? (
            <CalendarMonthView
              month={currentDate}
              appointments={visibleAppointments}
              doctors={doctors}
              isPrivate={restricted ? isPrivate : undefined}
              onOpenDay={openDay}
              onOpenAppointment={setSelectedAppointment}
              onCreate={canCreate ? key => openAddModal(key) : undefined}
            />
          ) : (
          <div ref={gridRef} className={`relative ${view === 'week' ? 'min-w-[840px]' : columnDoctors.length > 2 ? 'min-w-fit' : 'w-full'}`}>
            {/* Sarlavha: kunlar yoki shifokorlar */}
            <div ref={headerRef} className="grid sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="sticky left-0 z-40 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700"></div>
              {view === 'week' ? (
                displayDays.map((day, i) => {
                  const isToday = dayKeys[i] === todayKey;
                  const count = gridAppointments.filter(a => a.date === dayKeys[i]).length;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openDay(dayKeys[i])}
                      title={t('calendar.openDay')}
                      className={`flex items-center justify-center gap-2 min-w-0 px-1 py-2 border-r border-gray-100 dark:border-gray-700 last:border-0 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${isToday ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                    >
                      <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg font-semibold tabular-nums ${isToday ? 'bg-primary-600 text-white' : 'text-gray-800 dark:text-gray-100'}`}>{day.getDate()}</span>
                      <span className="min-w-0 text-left leading-tight">
                        <span className={`block text-xs font-bold uppercase tracking-wide ${isToday ? 'text-primary-600 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>{dayNames[day.getDay()]}</span>
                        <span className="block text-[11px] truncate text-gray-400">{count > 0 ? t('calendar.dayCount').replace('{n}', String(count)) : '—'}</span>
                      </span>
                    </button>
                  );
                })
              ) : columnDoctors.length > 0 ? (
                columnDoctors.map(doc => {
                  const color = doc.color || '#3B82F6';
                  const count = gridAppointments.filter(a => a.doctorId === doc.id).length;
                  const hours = doctorHours(doc, currentClinic);
                  return (
                    <div key={doc.id} className="flex items-center gap-2.5 min-w-0 px-3 py-2 border-r border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: color }}>{initials(doc)}</span>
                      <span className="flex-1 min-w-0 leading-tight">
                        <span className="block text-sm font-semibold truncate text-gray-900 dark:text-white">Dr. {doc.lastName}</span>
                        <span className="block text-[11px] truncate text-gray-500 dark:text-gray-400">
                          {[doc.specialty, hours.custom ? `${hours.start}:00–${hours.end}:00` : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {count > 0 && (
                        <span className="shrink-0 min-w-[1.75rem] px-1.5 py-0.5 rounded-full text-center text-[11px] font-bold tabular-nums" style={{ backgroundColor: `${color}1F`, color }} title={t('calendar.dayCount').replace('{n}', String(count))}>
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {dayNames[displayDays[0].getDay()]} {displayDays[0].getDate()}
                </div>
              )}
            </div>

            {/* Jadval */}
            <div className="grid relative" style={{ gridTemplateColumns: gridTemplate, height: gridHeight }}>
              {/* Soatlar: yozuv soat chizig'i ustida (birinchisi — chiziq ostida) */}
              <div className="sticky left-0 z-20 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700">
                {gridHours.map((hour, i) => (
                  <div key={hour} className="relative" style={{ height: hourPx }}>
                    <span
                      className={`absolute right-2 text-[11px] tabular-nums text-gray-400 dark:text-gray-500 ${showNowLine && Math.abs(nowMin - hour * 60) * hourPx / 60 < 14 ? 'invisible' : ''}`}
                      style={{ top: i === 0 ? 4 : -8 }}
                    >
                      {hour}:00
                    </span>
                  </div>
                ))}
                {showNowLine && (
                  <div className="absolute right-1 -translate-y-1/2 px-1 py-px rounded bg-red-500 text-white text-[10px] font-bold tabular-nums pointer-events-none" style={{ top: nowTop }}>
                    {hhmmOf(nowMin)}
                  </div>
                )}
              </div>

              {/* Bo'sh kataklar: bosilsa — shu vaqtga yangi qabul */}
              {(view === 'week' ? dayKeys : columnDoctors.length > 0 ? columnDoctors.map(d => d.id) : [currentKey]).map(key => {
                const dateStr = view === 'week' ? key : currentKey;
                const docId = view === 'day' && columnDoctors.length > 0 ? key : undefined;
                const isTodayCol = view === 'week' && key === todayKey;
                return (
                  <div key={key} className={`border-r border-gray-100 dark:border-gray-700 last:border-0 ${isTodayCol ? 'bg-primary-50/30 dark:bg-primary-900/5' : ''}`}>
                    {gridHours.map(hour => {
                      const hh = hour.toString().padStart(2, '0');
                      return (
                        <React.Fragment key={hour}>
                          <div
                            className="border-b border-dashed border-gray-100 dark:border-gray-700/40 cursor-pointer transition-colors hover:bg-primary-50/60 dark:hover:bg-primary-900/10"
                            style={{ height: hourPx / 2 }}
                            onClick={() => openAddModal(dateStr, `${hh}:00`, docId)}
                          ></div>
                          <div
                            className="border-b border-gray-200/70 dark:border-gray-700/70 cursor-pointer transition-colors hover:bg-primary-50/60 dark:hover:bg-primary-900/10"
                            style={{ height: hourPx / 2 }}
                            onClick={() => openAddModal(dateStr, `${hh}:30`, docId)}
                          ></div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })}

              {/* Ish vaqtidan tashqari — chiziqli xira fon (bosish baribir ishlaydi) */}
              {columnWork.map(([ws, we], col) => {
                const parts: [number, number][] = [];
                if (ws > gridStartMin) parts.push([0, Math.min(gridHeight, yOf(ws))]);
                if (yOf(we) < gridHeight) parts.push([Math.max(0, yOf(we)), gridHeight]);
                return parts.filter(([a, b]) => b > a).map(([a, b], k) => (
                  <div
                    key={`off-${col}-${k}`}
                    aria-hidden="true"
                    className="absolute pointer-events-none"
                    style={{
                      top: a,
                      height: b - a,
                      left: `calc(${TIME_COL_PX}px + ${col} * ${colW})`,
                      width: `calc(${colW})`,
                      backgroundColor: 'rgba(148, 163, 184, 0.06)',
                      backgroundImage: 'repeating-linear-gradient(-45deg, rgba(148, 163, 184, 0.16) 0 1px, transparent 1px 8px)',
                    }}
                  />
                ));
              })}

              {/* Hozir — qabullar ostida: ism ustidan o'tib, "Kelmadi" chizig'iga o'xshab qolmasin */}
              {showNowLine && (
                <div
                  className="absolute z-[5] pointer-events-none"
                  style={{
                    top: nowTop,
                    left: view === 'week' ? `calc(${TIME_COL_PX}px + ${todayCol} * ${colW})` : TIME_COL_PX,
                    width: view === 'week' ? `calc(${colW})` : `calc(100% - ${TIME_COL_PX}px)`,
                  }}
                >
                  <div className="relative h-0.5 bg-red-500/90">
                    <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                  </div>
                </div>
              )}

              {/* Qabullar */}
              {gridAppointments.map(app => {
                const place = placements[app.id];
                if (!place) return null;
                const start = minutesOfTime(app.time);
                const dur = Math.max(10, app.duration || 30);
                const end = start + dur;
                // Jadval qabullarga qarab kengayadi; faqat yarim tundan o'tib ketgan qismi kesiladi
                const top = Math.max(0, yOf(start));
                const bottom = Math.min(gridHeight, yOf(end));
                if (bottom <= 0 || top >= gridHeight) return null;
                const heightPx = Math.max(14, bottom - top - 2);
                const subW = `(${colW} / ${place.subs})`;
                const box: React.CSSProperties = {
                  top: top + 1,
                  height: heightPx,
                  left: `calc(${TIME_COL_PX}px + ${place.col} * ${colW} + ${place.sub} * ${subW} + 1px)`,
                  width: `calc(${place.span} * ${subW} - 3px)`,
                };
                // Blok necha piksel — shunga qarab qancha matn sig'ishi tanlanadi
                const blockPx = gridWidth > 0 ? (gridWidth - TIME_COL_PX) / gridColumns / place.subs * place.span : 160;
                const tier = blockPx < 40 ? 'tiny' : blockPx < 72 ? 'mini' : blockPx < 120 ? 'compact' : 'full';
                const oneLine = heightPx < 34;
                const tightY = heightPx < 42 ? 'py-0.5' : 'py-1';
                const doctor = doctors.find(d => d.id === app.doctorId);
                const color = doctor?.color || '#3B82F6';
                const doctorLabel = doctor ? `Dr. ${doctor.lastName}` : app.doctorName;
                const timeRange = `${app.time}–${hhmmOf(end)}`;

                // Hamkasb qabuli (ko'rish doirasi "faqat o'zinikini") — faqat vaqt band ekani
                if (isPrivate(app)) {
                  return (
                    <div
                      key={app.id}
                      title={`${timeRange} · ${t('calendar.busy')} · ${doctorLabel}`}
                      className={`absolute px-1.5 ${oneLine ? '' : 'py-1'} rounded-md text-[11px] leading-tight overflow-hidden z-10 cursor-default bg-white dark:bg-gray-800`}
                      style={{
                        ...box,
                        backgroundImage: `repeating-linear-gradient(135deg, ${color}1A 0 6px, transparent 6px 12px), linear-gradient(${color}0D, ${color}0D)`,
                        borderLeft: `3px solid ${color}`,
                        color,
                      }}
                    >
                      {tier === 'tiny' ? null : oneLine ? (
                        <div className="h-full flex items-center gap-1 leading-none whitespace-nowrap">
                          <span className="text-[10px] font-bold tabular-nums">{app.time}</span>
                          {tier !== 'mini' && <span className="min-w-0 font-semibold truncate opacity-80">{t('calendar.busy')}</span>}
                        </div>
                      ) : (
                        <>
                          <div className="text-[10px] font-bold tabular-nums truncate">{app.time}</div>
                          {/* Tor blokda "Band" so'zi sig'maydi — chiziqli fon buni baribir bildiradi */}
                          {tier !== 'mini' && <div className="font-semibold truncate opacity-80">{t('calendar.busy')}</div>}
                        </>
                      )}
                    </div>
                  );
                }

                const done = app.status === 'Completed';
                const noShow = app.status === 'No-Show';
                const arrived = app.status === 'Checked-In';
                const pending = app.status === 'Pending';
                const tint = noShow ? 'rgba(156, 163, 175, 0.16)' : `${color}${done ? '1A' : '26'}`;
                const [surname = app.patientName, first = ''] = app.patientName.split(/\s+/);
                const shortName = first ? `${surname} ${first.charAt(0)}.` : surname;
                const title = [timeRange, app.patientName, app.type, doctorLabel, statusLabel(app.status, language)].filter(Boolean).join(' · ');
                const statusIcon = done
                  ? <CheckCircle className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  : noShow
                    ? <XCircle className="w-3 h-3 shrink-0 text-gray-400" />
                    : arrived
                      ? <span className="w-2 h-2 shrink-0 rounded-full bg-indigo-500 animate-pulse" />
                      : app.reminderSent
                        ? <Bell className="w-3 h-3 shrink-0 text-primary-500 fill-current" />
                        : null;

                return (
                  <div
                    key={app.id}
                    onClick={() => setSelectedAppointment(app)}
                    title={title}
                    className="absolute rounded-md overflow-hidden z-10 cursor-pointer transition-shadow hover:shadow-md hover:z-20 bg-white dark:bg-gray-800"
                    style={{
                      ...box,
                      backgroundImage: `linear-gradient(${tint}, ${tint})`,
                      borderLeft: `3px ${pending ? 'dashed' : 'solid'} ${noShow ? '#9CA3AF' : color}`,
                    }}
                  >
                    <div className={`h-full ${done ? 'opacity-70' : ''}`}>
                      {tier === 'tiny' ? null : oneLine ? (
                        // Qisqa qabul: vaqt va ism bir qatorda
                        <div className="h-full px-1.5 flex items-center gap-1 text-[10px] leading-none whitespace-nowrap">
                          <span className="font-bold tabular-nums text-gray-700 dark:text-gray-200">{app.time}</span>
                          {tier !== 'mini' && statusIcon}
                          <span className={`min-w-0 font-semibold truncate text-gray-900 dark:text-white ${noShow ? 'line-through opacity-60' : ''}`}>
                            {tier === 'full' ? app.patientName : tier === 'compact' ? shortName : surname}
                          </span>
                        </div>
                      ) : tier === 'mini' ? (
                        <div className="px-1 py-0.5 leading-tight">
                          <div className="text-[10px] font-bold tabular-nums text-gray-700 dark:text-gray-200">{app.time}</div>
                          <div className={`text-[10px] font-semibold truncate text-gray-900 dark:text-white ${noShow ? 'line-through opacity-60' : ''}`}>{surname}</div>
                        </div>
                      ) : tier === 'compact' ? (
                        <div className={`px-1.5 ${tightY} leading-tight`}>
                          <div className="flex items-center gap-1 text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                            <span className="truncate">{app.time}</span>
                            {statusIcon}
                          </div>
                          <div className={`text-[11px] font-semibold truncate text-gray-900 dark:text-white ${noShow ? 'line-through opacity-60' : ''}`}>{shortName}</div>
                          {heightPx >= 54 && <div className="text-[10px] truncate text-gray-500 dark:text-gray-400">{app.type}</div>}
                        </div>
                      ) : (
                        <div className={`px-2 ${tightY} leading-snug`}>
                          <div className="flex items-center justify-between gap-1 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                            <span className="truncate">{timeRange}</span>
                            {statusIcon}
                          </div>
                          <div className={`text-xs font-semibold truncate text-gray-900 dark:text-white ${noShow ? 'line-through opacity-60' : ''}`}>{app.patientName}</div>
                          {heightPx >= 50 && <div className="text-[11px] truncate text-gray-500 dark:text-gray-400">{app.type}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Add Appointment Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setEditingApptId(null); }} title={editingApptId ? t('calendar.editAppointment') : t('calendar.newAppointment')}>
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SearchableSelect
                label={t('calendar.patient')}
                options={patients.map(p => ({ value: p.id, label: `${p.lastName} ${p.firstName}` }))}
                value={formData.patientId}
                onChange={(val) => setFormData({ ...formData, patientId: val })}
              />
            </div>
            {!editingApptId && canAddPatient && (
              <Button
                type="button"
                variant="secondary"
                className="mb-1 p-2 h-10 w-10 flex items-center justify-center"
                onClick={() => setIsAddPatientModalOpen(true)}
                title={t('patients.modal.addTitle')}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
          {/* Hide doctor selection for individual plan clinics */}
          {currentClinic?.planId !== 'individual' && (
            <Select
              label={t('calendar.doctor')}
              options={doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))}
              value={formData.doctorId}
              onChange={(e) => setFormData({ ...formData, doctorId: e.target.value })}
            />
          )}
          {categories.length > 0 && (
            <Select
              label={t('calendar.serviceCategory')}
              options={[
                { value: '', label: t('calendar.allCategories') },
                ...categories.map(c => ({ value: c.id, label: c.name }))
              ]}
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value, type: '' })}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('calendar.serviceType')}
              options={[
                { value: '', label: t('common.select') },
                ...services
                  .filter(s => !formData.categoryId || (s as any).categoryId === formData.categoryId)
                  .map(s => ({ value: s.name, label: s.name }))
              ]}
              value={formData.type}
              onChange={e => {
                const service = services.find(s => s.name === e.target.value);
                setFormData({
                  ...formData,
                  type: e.target.value,
                  duration: service?.duration || formData.duration
                });
              }}
            />
            <Input label={t('calendar.duration')} type="number" value={formData.duration} onChange={e => setFormData({ ...formData, duration: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DateField
              label={t('calendar.date')}
              value={formData.date}
              onChange={date => setFormData({ ...formData, date })}
              counts={appointmentCounts}
              required
            />
            <Input label={t('calendar.time')} type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.notes')}</label>
            <textarea
              className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm h-20 dark:border-gray-700 dark:text-white"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setIsAddModalOpen(false); setEditingApptId(null); }}>{t('common.cancel')}</Button>
            <Button type="submit">{editingApptId ? t('common.save') : t('calendar.book')}</Button>
          </div>
        </form>
      </Modal>

      {/* Appointment Details Modal */}
      {selectedAppointment && (
        <Modal isOpen={!!selectedAppointment} onClose={() => setSelectedAppointment(null)} title={t('calendar.appointmentDetails')}>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className={`text-xl font-bold text-gray-900 dark:text-white ${onPatientClick ? 'cursor-pointer hover:text-primary-600 transition-colors hover:underline title-transition' : ''}`}
                  onClick={() => {
                    if (onPatientClick) {
                      onPatientClick(selectedAppointment.patientId);
                      setSelectedAppointment(null);
                    }
                  }}
                  title={onPatientClick ? "Bemor profiliga o'tish" : ""}
                >
                  {selectedAppointment.patientName}
                </h3>
                <p className="text-gray-500 text-sm">{selectedAppointment.type}</p>
              </div>
              <div className="flex items-center gap-3">
                {canEdit && (
                  <button
                    onClick={() => openEditModal(selectedAppointment)}
                    className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:text-gray-400 dark:hover:bg-gray-800 rounded-md transition-colors"
                    title={t('auto.Qabulni tahrirlash')}
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                )}
                <Badge status={selectedAppointment.status} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Clock className="w-5 h-5 text-gray-400" />
                <span>{selectedAppointment.date}, {selectedAppointment.time} ({selectedAppointment.duration} daq)</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <User className="w-5 h-5 text-gray-400" />
                <span>{selectedAppointment.doctorName}</span>
              </div>
              {selectedAppointment.notes && (
                <div className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                  <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                  <p className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-100 dark:border-gray-700 w-full">
                    {selectedAppointment.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 justify-end">
                {/* Initial States: Pending, Confirmed or Checked-In (Legacy support) */}
                {(selectedAppointment.status === 'Pending' || selectedAppointment.status === 'Confirmed' || selectedAppointment.status === 'Checked-In') && (
                  <div className="flex flex-wrap gap-2 w-full">
                    {canRemind && (
                      <Button
                        variant="secondary"
                        className={`${remindedAppts.has(selectedAppointment.id) ? 'bg-green-100 text-green-700 border-green-200' : ''} flex-1`}
                        onClick={() => openMessageModal(selectedAppointment)}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {t('calendar.sendMessage')}
                      </Button>
                    )}

                    <button
                      onClick={() => handleStatusUpdate('No-Show')}
                      className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2 text-red-500" />
                      {t('calendar.noShow')}
                    </button>

                    <button
                      onClick={() => handleStatusUpdate('Completed')}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 flex-1"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {t('calendar.complete')}
                    </button>
                  </div>
                )}

                {/* Read Only States */}
                {(selectedAppointment.status === 'Completed' || selectedAppointment.status === 'Cancelled' || selectedAppointment.status === 'No-Show') && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setSelectedAppointment(null)}>{t('common.close')}</Button>
                    {canDelete && <Button
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={async () => {
                        if (confirm('Haqiqatan ham bu qabulni butunlay o\'chirmoqchimisiz?')) {
                          try {
                            await onDeleteAppointment(selectedAppointment.id);
                            setSelectedAppointment(null);
                          } catch (e) { }
                        }
                      }}
                    >
                      {t('common.delete')}
                    </Button>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* Message Modal */}
      <Modal isOpen={isMessageModalOpen} onClose={() => setIsMessageModalOpen(false)} title={t('calendar.sendMessage')}>
        <form onSubmit={handleSendMessage} className="space-y-4">
          <Select
            label={t('calendar.messageType')}
            value={messageType}
            onChange={(e) => {
              const type = e.target.value;
              setMessageType(type);
              // Logic to update text based on type if needed, similar to PatientDetails
              // For now, we just keep the text editable
              if (type === 'Custom') setMessageText('');
            }}
            options={[
              { value: 'Custom', label: t('calendar.customMessage') },
              { value: 'Tomorrow', label: t('calendar.tomorrowAppointment') },
              { value: 'Reminder', label: t('calendar.reminder') }
            ]}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.messageText')}</label>
            <textarea
              className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              rows={4}
              placeholder={t('calendar.messageText')}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsMessageModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.send')}</Button>
          </div>
        </form>
      </Modal>

      {/* Add Patient Modal */}
      <Modal isOpen={isAddPatientModalOpen} onClose={() => setIsAddPatientModalOpen(false)} title={t('patients.modal.addTitle')}>
        <form onSubmit={handlePatientSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('patients.modal.lastName')}
              value={patientFormData.lastName}
              onChange={e => setPatientFormData({ ...patientFormData, lastName: e.target.value })}
              required
            />
            <Input
              label={t('patients.modal.firstName')}
              value={patientFormData.firstName}
              onChange={e => setPatientFormData({ ...patientFormData, firstName: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('patients.modal.phone')}
              value={patientFormData.phone}
              onChange={e => setPatientFormData({ ...patientFormData, phone: e.target.value })}
              placeholder="+998 XX XXX XX XX"
              required
            />
            <Input
              label={t('patients.modal.secondaryPhone')}
              value={patientFormData.secondaryPhone}
              onChange={e => setPatientFormData({ ...patientFormData, secondaryPhone: e.target.value })}
              placeholder="+998 XX XXX XX XX"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DateField
              label={t('patients.modal.dob')}
              value={patientFormData.dob}
              onChange={dob => setPatientFormData({ ...patientFormData, dob })}
              max={todayKey}
              required
            />
          </div>
          <Input
            label={t('patients.modal.address')}
            value={patientFormData.address}
            onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })}
            placeholder={t('auto.Toshkent sh., Chilonzor t...')}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.modal.gender')}</label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="calendar-gender"
                  value="Male"
                  checked={patientFormData.gender === 'Male'}
                  onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}
                  className="text-primary-600 focus:ring-primary-500"
                /> <span>{t('patients.modal.male')}</span>
              </label>
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="calendar-gender"
                  value="Female"
                  checked={patientFormData.gender === 'Female'}
                  onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}
                  className="text-primary-600 focus:ring-primary-500"
                /> <span>{t('patients.modal.female')}</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.modal.medicalHistory')}</label>
            <textarea
              value={patientFormData.medicalHistory}
              onChange={e => setPatientFormData({ ...patientFormData, medicalHistory: e.target.value })}
              className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white h-24 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder={t('patients.modal.medicalHistoryPlaceholder')}
            ></textarea>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsAddPatientModalOpen(false)} disabled={isSubmittingPatient}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={isSubmittingPatient}>
              {isSubmittingPatient ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.pleaseWait')}
                </>
              ) : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
