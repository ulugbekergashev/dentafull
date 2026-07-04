import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Users, UserCheck, UserX, ChevronRight, Plus,
  RefreshCw, Trash2, CheckCircle, XCircle, AlertCircle,
  Phone, User, Stethoscope, Timer, ArrowRight, Play, Bell, Printer, Tv, Volume2, VolumeX
} from 'lucide-react';
import { Doctor, Patient, Appointment, Clinic } from '../types';
import { api, API_URL } from '../services/api';

const playChime = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // First note (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    gain1.gain.setValueAtTime(0.2, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.6);

    // Second note (C5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.25); // C5
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.95);
    osc2.start(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.95);
  } catch (e) {
    console.error('Audio chime failed:', e);
  }
};

const numberToUzbekWords = (num: number): string => {
  const units = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
  const tens = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
  const hundreds = ['', 'yuz', 'ikki yuz', 'uch yuz', "to'rt yuz", 'besh yuz', 'olti yuz', 'yetti yuz', 'sakkiz yuz', "to'qqiz yuz"];
  
  if (num === 0) return 'nol';
  
  let result = '';
  
  const h = Math.floor(num / 100);
  const t = Math.floor((num % 100) / 10);
  const u = num % 10;
  
  if (h > 0) result += hundreds[h] + ' ';
  if (t > 0) result += tens[t] + ' ';
  if (u > 0) result += units[u];
  
  return result.trim();
};

const speakQueueEntry = (entry: any) => {
  try {
    const numWord = numberToUzbekWords(entry.position);
    const cleanDocUz = entry.doctorName ? entry.doctorName.replace(/^Dr\./i, 'Doktor') : '';
    const textUz = `Navbat raqami ${numWord}. Bemor: ${entry.patientName}. ${cleanDocUz ? `${cleanDocUz} qabuliga marhamat.` : 'Qabulga marhamat.'}`;
    
    const cleanDocRu = entry.doctorName ? entry.doctorName.replace(/^Dr\./i, 'Врачу ') : '';
    const textRu = `Пациент ${entry.patientName}, номер очереди ${entry.position}. ${cleanDocRu ? `Пожалуйста, пройдите к ${cleanDocRu}.` : 'Пожалуйста, пройдите на прием.'}`;

    // 1. Try high-quality Google Cloud/Translate TTS (Uzbek language, sounds like a real person) via backend proxy to avoid CORS
    const googleTtsUrl = `${API_URL}/tts?text=${encodeURIComponent(textUz)}&lang=uz`;
    
    const playOfflineFallback = () => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      
      window.speechSynthesis.cancel();
      const voices = window.speechSynthesis.getVoices();
      
      const uzVoice = voices.find(v => v.lang.toLowerCase().includes('uz'));
      const ruVoice = voices.find(v => v.lang.toLowerCase().includes('ru'));
      const enVoice = voices.find(v => v.lang.toLowerCase().includes('en'));
      
      let text = textUz;
      let lang = 'uz-UZ';
      let voice = null;
      
      if (uzVoice) {
        voice = uzVoice;
        lang = 'uz-UZ';
      } else if (ruVoice) {
        text = textRu;
        voice = ruVoice;
        lang = 'ru-RU';
      } else {
        const cleanDoc = entry.doctorName ? entry.doctorName : '';
        text = `Patient ${entry.patientName}, queue number ${entry.position}. ${cleanDoc ? `Please proceed to ${cleanDoc}.` : 'Please proceed to reception.'}`;
        voice = enVoice;
        lang = 'en-US';
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = lang;
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    };

    const audio = new Audio(googleTtsUrl);
    audio.play().catch(err => {
      console.warn("Google TTS blocked or offline, using speech synthesis fallback:", err);
      playOfflineFallback();
    });
  } catch (e) {
    console.error('Speech synthesis failed:', e);
  }
};

interface QueueEntry {
  id: string;
  patientId?: string;
  patientName: string;
  phone: string;
  doctorId?: string;
  doctorName?: string;
  service?: string;
  status: 'Waiting' | 'Called' | 'In-Progress' | 'Done' | 'Missed';
  arrivedAt: string; // ISO
  calledAt?: string;
  startedAt?: string;
  endedAt?: string;
  position: number;
  notes?: string;
}

interface Props {
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  clinicId: string;
  userRole: string;
  currentClinic?: Clinic | null;
}

const STATUS_COLORS: Record<QueueEntry['status'], string> = {
  'Waiting':     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Called':      'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  'In-Progress': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'Done':        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Missed':      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS: Record<QueueEntry['status'], string> = {
  'Waiting':     'Kutmoqda',
  'Called':      'Chaqirildi',
  'In-Progress': 'Qabul jarayonida',
  'Done':        'Tugadi',
  'Missed':      'Kelmadi',
};

const STORAGE_KEY = 'dentalflow_queue';

function loadQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveQueue(q: QueueEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function waitMinutes(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export const OnlineQueue: React.FC<Props> = ({ doctors, patients, clinicId, userRole, currentClinic }) => {
  const [queue, setQueue] = useState<QueueEntry[]>(loadQueue);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isTVMode, setIsTVMode] = useState(false);
  const [tick, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  // Log available voices for debugging
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const logVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log("DentaCRM Available Voices:", voices.map(v => `${v.name} (${v.lang})`));
      };
      logVoices();
      window.speechSynthesis.onvoiceschanged = logVoices;
    }
  }, []);

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem('dentalflow_queue_voice');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const toggleVoice = useCallback(() => {
    const newVal = !voiceEnabled;
    sessionStorage.setItem('dentalflow_queue_voice', JSON.stringify(newVal));
    setVoiceEnabled(newVal);
  }, [voiceEnabled]);

  const announceCall = useCallback((entry: QueueEntry) => {
    if (!voiceEnabled) return;
    setTimeout(() => {
      speakQueueEntry(entry);
    }, 900);
  }, [voiceEnabled]);

  const queueRef = useRef<QueueEntry[]>(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Form state
  const [form, setForm] = useState({
    patientSearch: '',
    patientId: '',
    patientName: '',
    phone: '',
    doctorId: '',
    service: '',
    notes: '',
    printOnAdd: true,
  });
  const [patientSuggestions, setPatientSuggestions] = useState<Patient[]>([]);

  // Tick every 30s to refresh wait times
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Sync between browser tabs/windows
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const updated: QueueEntry[] = JSON.parse(e.newValue);
          const oldQueue = queueRef.current;
          
          // Check if any patient just transitioned to 'Called' status OR had their calledAt timestamp updated (re-call)
          const calledEntry = updated.find(newEntry => {
            if (newEntry.status !== 'Called') return false;
            const oldEntry = oldQueue.find(o => o.id === newEntry.id);
            if (!oldEntry) return true;
            if (oldEntry.status !== 'Called') return true;
            return newEntry.calledAt !== oldEntry.calledAt;
          });
          
          if (calledEntry) {
            playChime();
            
            // Read voiceEnabled directly from sessionStorage to ensure we check this specific tab's setting
            let isVoiceOn = true;
            try {
              const saved = sessionStorage.getItem('dentalflow_queue_voice');
              if (saved !== null) isVoiceOn = JSON.parse(saved);
            } catch {}
            
            if (isVoiceOn) {
              const numWord = numberToUzbekWords(calledEntry.position);
              const cleanDoc = calledEntry.doctorName ? calledEntry.doctorName.replace(/^Dr\./i, 'Doktor') : '';
              const text = `Navbat raqami ${numWord}. Bemor: ${calledEntry.patientName}. ${cleanDoc ? `${cleanDoc} qabuliga marhamat.` : 'Qabulga marhamat.'}`;
              
              // Force loading voices in background before speaking
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.getVoices();
              }
              
              setTimeout(() => {
                speakQueueEntry(calledEntry);
              }, 900);
            }
          }
          
          setQueue(updated);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const persist = useCallback((updated: QueueEntry[]) => {
    setQueue(updated);
    saveQueue(updated);
  }, []);

  const printTicket = useCallback((entry: QueueEntry, position: number) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const clinicName = currentClinic?.name || 'DentaCRM Clinic';
    const clinicPhone = currentClinic?.phone || '';
    const dateStr = new Date(entry.arrivedAt).toLocaleString('uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Navbat chiptasi</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            @media print {
              body { width: 74mm; }
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 74mm;
              padding: 10px;
              margin: 0 auto;
              text-align: center;
              color: #000;
              font-size: 14px;
            }
            .clinic-name { font-size: 16px; font-weight: bold; margin-bottom: 3px; text-transform: uppercase; }
            .clinic-phone { font-size: 12px; margin-bottom: 8px; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .ticket-title { font-size: 15px; font-weight: bold; margin-bottom: 5px; letter-spacing: 1px; }
            .queue-number { font-size: 56px; font-weight: bold; margin: 15px 0; line-height: 1; }
            .info-table { width: 100%; text-align: left; font-size: 13px; border-collapse: collapse; margin-top: 10px; }
            .info-table td { padding: 4px 0; vertical-align: top; }
            .info-table td:first-child { width: 35%; font-weight: bold; }
            .footer { font-size: 11px; margin-top: 15px; font-style: italic; line-height: 1.3; }
          </style>
        </head>
        <body>
          <div class="clinic-name">${clinicName}</div>
          ${clinicPhone ? `<div class="clinic-phone">${clinicPhone}</div>` : ''}
          <div class="divider"></div>
          <div class="ticket-title">NAVBAT CHIPTASI</div>
          <div class="queue-number">#${position}</div>
          <div class="divider"></div>
          <table class="info-table">
            <tr><td>Bemor:</td><td>${entry.patientName}</td></tr>
            <tr><td>Telefon:</td><td>${entry.phone}</td></tr>
            ${entry.doctorName ? `<tr><td>Shifokor:</td><td>${entry.doctorName}</td></tr>` : ''}
            ${entry.service ? `<tr><td>Xizmat:</td><td>${entry.service}</td></tr>` : ''}
            <tr><td>Sana/Vaqt:</td><td>${dateStr}</td></tr>
          </table>
          <div class="divider"></div>
          <div class="footer">
            Navbatingizni kutishingizni so'raymiz.<br/>
            Salomat bo'ling!
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [currentClinic]);

  const handlePatientSearch = (val: string) => {
    setForm(f => ({ ...f, patientSearch: val, patientId: '', patientName: val }));
    if (val.length >= 2) {
      const term = val.toLowerCase();
      setPatientSuggestions(
        patients.filter(p =>
          p.firstName.toLowerCase().includes(term) ||
          p.lastName.toLowerCase().includes(term) ||
          p.phone.includes(term)
        ).slice(0, 6)
      );
    } else {
      setPatientSuggestions([]);
    }
  };

  const selectPatient = (p: Patient) => {
    setForm(f => ({
      ...f,
      patientId: p.id,
      patientName: `${p.lastName} ${p.firstName}`,
      patientSearch: `${p.lastName} ${p.firstName}`,
      phone: p.phone,
    }));
    setPatientSuggestions([]);
  };

  const addToQueue = () => {
    const name = form.patientName.trim() || form.patientSearch.trim();
    const phone = form.phone.trim();
    if (!name || !phone) return;

    const doctor = doctors.find(d => d.id === form.doctorId);
    const activeCount = queue.filter(q => ['Waiting', 'Called', 'In-Progress'].includes(q.status)).length;
    const nextPosition = activeCount + 1;

    const entry: QueueEntry = {
      id: Date.now().toString(),
      patientId: form.patientId || undefined,
      patientName: name,
      phone,
      doctorId: form.doctorId || undefined,
      doctorName: doctor ? `Dr. ${doctor.lastName} ${doctor.firstName}` : undefined,
      service: form.service || undefined,
      status: 'Waiting',
      arrivedAt: new Date().toISOString(),
      position: nextPosition,
      notes: form.notes || undefined,
    };

    persist([...queue, entry]);
    
    if (form.printOnAdd) {
      printTicket(entry, nextPosition);
    }

    setShowAddModal(false);
    setForm({ patientSearch: '', patientId: '', patientName: '', phone: '', doctorId: '', service: '', notes: '', printOnAdd: true });
    setPatientSuggestions([]);
  };

  const updateStatus = (id: string, status: QueueEntry['status']) => {
    const now = new Date().toISOString();
    const updated = queue.map(e => {
      if (e.id !== id) return e;
      return {
        ...e,
        status,
        calledAt:   status === 'Called'      ? now : e.calledAt,
        startedAt:  status === 'In-Progress' ? now : e.startedAt,
        endedAt:    (status === 'Done' || status === 'Missed') ? now : e.endedAt,
      };
    });
    persist(updated);
    if (status === 'Called') {
      playChime();
      const entry = updated.find(e => e.id === id);
      if (entry) {
        // Force loading voices in background before speaking
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.getVoices();
        }
        announceCall(entry);
      }
    }
  };

  const removeEntry = (id: string) => {
    persist(queue.filter(e => e.id !== id));
  };

  const clearHistory = () => {
    persist(queue.filter(e => ['Waiting', 'Called', 'In-Progress'].includes(e.status)));
  };

  const active  = queue.filter(e => ['Waiting', 'Called', 'In-Progress'].includes(e.status));
  const history = queue.filter(e => ['Done', 'Missed'].includes(e.status));

  const waiting    = active.filter(e => e.status === 'Waiting').length;
  const inProgress = active.filter(e => e.status === 'In-Progress').length;
  const doneToday  = history.filter(e => e.status === 'Done').length;
  const missed     = history.filter(e => e.status === 'Missed').length;

  // Listen to Escape key to exit TV mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTVMode(false);
      }
    };
    if (isTVMode) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTVMode]);

  if (isTVMode) {
    return (
      <QueueTVBoard
        queue={queue}
        clinicName={currentClinic?.name || 'DentaCRM Clinic'}
        onClose={() => setIsTVMode(false)}
        voiceEnabled={voiceEnabled}
        onToggleVoice={toggleVoice}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            Online Navbat
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Kunlik qabul navbatini boshqaring</p>
        </div>
        <div className="flex items-center gap-3 font-sans">
          <button
            onClick={toggleVoice}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all active:scale-95 border shadow-sm ${
              voiceEnabled
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                : 'bg-gray-150 hover:bg-gray-200 border-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            title={voiceEnabled ? "Ovozli e'lonni o'chirish" : "Ovozli e'lonni yoqish"}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">
              Ovoz: {voiceEnabled ? "Yoqilgan" : "O'chirilgan"}
            </span>
          </button>
          <button
            onClick={() => setIsTVMode(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-150 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-all active:scale-95 border border-gray-200 dark:border-gray-700 shadow-sm"
            title="Televizorda navbatni ko'rsatish"
          >
            <Tv className="w-4 h-4" />
            Monitor rejimi
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Navbat qo'shish
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Kutmoqda', value: waiting, icon: Clock, color: 'from-amber-400 to-orange-500' },
          { label: 'Qabul jarayonida', value: inProgress, icon: Stethoscope, color: 'from-purple-500 to-violet-600' },
          { label: 'Bugun qabul', value: doneToday, icon: CheckCircle, color: 'from-emerald-400 to-green-500' },
          { label: 'Kelmadi', value: missed, icon: UserX, color: 'from-red-400 to-rose-500' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3 shadow-md`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {[
          { id: 'active', label: `Faol navbat (${active.length})` },
          { id: 'history', label: `Tarix (${history.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Queue List */}
      {activeTab === 'active' && (
        <div className="space-y-3">
          {active.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-violet-400" />
              </div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Navbatda hech kim yo'q</p>
              <p className="text-sm text-gray-400 mt-1">Yangi navbat qo'shish uchun "Navbat qo'shish" tugmasini bosing</p>
            </div>
          )}
          {active.map((entry, idx) => (
            <QueueCard
              key={entry.id}
              entry={entry}
              position={idx + 1}
              onUpdateStatus={updateStatus}
              onRemove={removeEntry}
              tick={tick}
              onPrint={(e) => printTicket(e, idx + 1)}
            />
          ))}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {history.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={clearHistory}
                className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Tarixni tozalash
              </button>
            </div>
          )}
          {history.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p className="text-gray-400">Bugun tarix yo'q</p>
            </div>
          )}
          {history.map((entry, idx) => (
            <QueueCard
              key={entry.id}
              entry={entry}
              position={entry.position}
              onUpdateStatus={updateStatus}
              onRemove={removeEntry}
              tick={tick}
              isHistory
              onPrint={(e) => printTicket(e, e.position)}
            />
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">Navbat qo'shish</h2>
              <button
                onClick={() => { setShowAddModal(false); setPatientSuggestions([]); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Patient search */}
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                  Bemor <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.patientSearch}
                  onChange={e => handlePatientSearch(e.target.value)}
                  placeholder="Ism, familiya yoki telefon..."
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
                {patientSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl z-10 overflow-hidden">
                    {patientSuggestions.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-left transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-xs shrink-0">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{p.lastName} {p.firstName}</p>
                          <p className="text-xs text-gray-500">{p.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                  Telefon <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+998 ..."
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Doctor */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Shifokor</label>
                <select
                  value={form.doctorId}
                  onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                >
                  <option value="">— Shifokor tanlash —</option>
                  {doctors.filter(d => d.status === 'Active').map(d => (
                    <option key={d.id} value={d.id}>Dr. {d.lastName} {d.firstName} — {d.specialty}</option>
                  ))}
                </select>
              </div>

              {/* Service */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Xizmat / sabab</label>
                <input
                  type="text"
                  value={form.service}
                  onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                  placeholder="Masalan: tish og'riq, davolanish..."
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Izoh</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Qo'shimcha ma'lumot..."
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Print Ticket checkbox */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="printOnAdd"
                  checked={form.printOnAdd}
                  onChange={e => setForm(f => ({ ...f, printOnAdd: e.target.checked }))}
                  className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 border-gray-300 cursor-pointer"
                />
                <label htmlFor="printOnAdd" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  Chiptani avtomat chop etish
                </label>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => { setShowAddModal(false); setPatientSuggestions([]); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={addToQueue}
                disabled={!form.phone.trim() && !form.patientSearch.trim()}
                className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-md"
              >
                Navbatga qo'shish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface CardProps {
  entry: QueueEntry;
  position: number;
  tick: number;
  isHistory?: boolean;
  onUpdateStatus: (id: string, status: QueueEntry['status']) => void;
  onRemove: (id: string) => void;
  onPrint: (entry: QueueEntry) => void;
}

const QueueCard: React.FC<CardProps> = ({ entry, position, tick, isHistory, onUpdateStatus, onRemove, onPrint }) => {
  const waited = waitMinutes(entry.arrivedAt);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm transition-all hover:shadow-md ${
      entry.status === 'In-Progress'
        ? 'border-purple-300 dark:border-purple-700 ring-1 ring-purple-200 dark:ring-purple-800'
        : entry.status === 'Called'
        ? 'border-primary-200 dark:border-primary-800'
        : 'border-gray-100 dark:border-gray-700'
    }`}>
      <div className="p-4 flex items-start gap-4">
        {/* Position Badge */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
          entry.status === 'In-Progress' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' :
          entry.status === 'Done'        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
          entry.status === 'Missed'      ? 'bg-red-100 dark:bg-red-900/30 text-red-500' :
          'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
        }`}>
          {isHistory ? (entry.status === 'Done' ? '✓' : '✗') : position}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">{entry.patientName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[entry.status]}`}>
              {STATUS_LABELS[entry.status]}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Phone className="w-3 h-3" />{entry.phone}
            </span>
            {entry.doctorName && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Stethoscope className="w-3 h-3" />{entry.doctorName}
              </span>
            )}
            {entry.service && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">
                {entry.service}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            <span>Keldi: {formatTime(entry.arrivedAt)}</span>
            {entry.status === 'Waiting' && (
              <span className={`font-medium ${waited > 30 ? 'text-red-500' : waited > 15 ? 'text-amber-500' : 'text-gray-400'}`}>
                ⏱ {waited} daqiqa kutdi
              </span>
            )}
            {entry.calledAt && <span>Chaqirildi: {formatTime(entry.calledAt)}</span>}
            {entry.endedAt  && <span>Tugadi: {formatTime(entry.endedAt)}</span>}
          </div>
          {entry.notes && (
            <p className="text-xs text-gray-400 mt-1 italic">"{entry.notes}"</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Print Button (Always available for active or history) */}
          <button
            onClick={() => onPrint(entry)}
            title="Chipta chop etish"
            className="p-2 text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:text-gray-400 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>

          {!isHistory && (
            <>
              {entry.status === 'Waiting' && (
                <>
                  <button
                    onClick={() => onUpdateStatus(entry.id, 'Called')}
                    title="Chaqirish"
                    className="p-2 bg-primary-100 hover:bg-primary-200 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 text-primary-700 dark:text-primary-400 rounded-lg transition-colors"
                  >
                    <Bell className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onUpdateStatus(entry.id, 'Missed')}
                    title="Kelmadi"
                    className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </>
              )}
              {entry.status === 'Called' && (
                <>
                  <button
                    onClick={() => onUpdateStatus(entry.id, 'Called')}
                    title="Qayta chaqirish"
                    className="p-2 bg-primary-100 hover:bg-primary-200 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 text-primary-700 dark:text-primary-400 rounded-lg transition-colors"
                  >
                    <Bell className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onUpdateStatus(entry.id, 'In-Progress')}
                    title="Qabul boshlash"
                    className="p-2 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-400 rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onUpdateStatus(entry.id, 'Missed')}
                    title="Kelmadi"
                    className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </>
              )}
              {entry.status === 'In-Progress' && (
                <button
                  onClick={() => onUpdateStatus(entry.id, 'Done')}
                  title="Tugallash"
                  className="p-2 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-lg transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          <button
            onClick={() => onRemove(entry.id)}
            title="O'chirish"
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const QueueTVBoard: React.FC<{
  queue: QueueEntry[];
  clinicName: string;
  onClose: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
}> = ({ queue, clinicName, onClose, voiceEnabled, onToggleVoice }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = queue.filter(e => ['Waiting', 'Called', 'In-Progress'].includes(e.status));
  const called = active.filter(e => e.status === 'Called');
  const inProgress = active.filter(e => e.status === 'In-Progress');
  const waiting = active.filter(e => e.status === 'Waiting');

  // Display called list, fallback to in-progress list
  const currentDisplays = called.length > 0 ? called : inProgress.slice(0, 2);

  const formatClock = (d: Date) => {
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-slate-950 text-white z-50 flex flex-col p-8 font-sans overflow-hidden select-none">
      {/* Top right buttons (visible on hover) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={onToggleVoice}
          className="opacity-5 hover:opacity-100 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs transition-opacity flex items-center gap-1.5"
          title={voiceEnabled ? "Ovozli e'lonni o'chirish" : "Ovozli e'lonni yoqish"}
        >
          {voiceEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-gray-400" />}
          <span>Ovoz: {voiceEnabled ? "Yoqilgan" : "O'chirilgan"}</span>
        </button>
        <button
          onClick={onClose}
          className="opacity-5 hover:opacity-100 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs transition-opacity"
        >
          Chiqish [Esc]
        </button>
      </div>

      {/* TV Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight uppercase">{clinicName}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Kutish zali elektron monitori</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-mono font-bold text-violet-400 tracking-wider">
            {formatClock(time)}
          </div>
          <div className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">
            {formatDate(time)}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0 mb-6">
        {/* Left Side: Called / Qabuldagilar (2/3 width) */}
        <div className="lg:col-span-2 flex flex-col min-h-0 bg-slate-900/50 border border-slate-800/80 rounded-3xl p-8">
          <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-violet-400 animate-pulse" />
            Qabulga chaqirilganlar / Вызываемые
          </h2>

          <div className="flex-1 flex flex-col justify-center gap-6 overflow-y-auto pr-2">
            {currentDisplays.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <Clock className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-2xl font-medium">Hozircha chaqiruvlar yo'q</p>
                <p className="text-sm mt-2">Kutish zalida navbatingizni kuting</p>
              </div>
            ) : (
              currentDisplays.map((entry) => {
                const isCalledStatus = entry.status === 'Called';
                return (
                  <div
                    key={entry.id}
                    className={`rounded-2xl p-8 flex items-center justify-between border ${
                      isCalledStatus
                        ? 'bg-gradient-to-r from-violet-900/40 to-purple-900/40 border-violet-500 shadow-2xl shadow-violet-500/10 animate-pulse'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-6">
                      {/* Huge position number */}
                      <div className={`w-28 h-28 rounded-2xl flex items-center justify-center text-5xl font-black ${
                        isCalledStatus
                          ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                          : 'bg-slate-800 text-slate-350'
                      }`}>
                        #{entry.position}
                      </div>
                      <div>
                        <div className="text-4xl font-extrabold tracking-tight">{entry.patientName}</div>
                        <div className="text-lg text-slate-400 mt-2 flex items-center gap-2">
                          <Stethoscope className="w-5 h-5 text-violet-400" />
                          <span>{entry.doctorName || 'Shifokor biriktirilmagan'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      {isCalledStatus ? (
                        <div className="px-5 py-2.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-lg font-bold uppercase tracking-wider animate-bounce">
                          Chaqirilmoqda
                        </div>
                      ) : (
                        <div className="px-5 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-lg font-bold uppercase tracking-wider">
                          Qabulda
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Waiting queue (1/3 width) */}
        <div className="flex flex-col min-h-0 bg-slate-900/50 border border-slate-800/80 rounded-3xl p-8">
          <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400 mb-6">
            Navbatdagilar / Очередь
          </h2>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {waiting.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <p className="text-lg">Navbatlar tugadi</p>
              </div>
            ) : (
              waiting.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-900 border border-slate-800/60 rounded-xl p-4 flex items-center gap-4 transition-all"
                >
                  <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xl text-slate-350 shrink-0">
                    #{entry.position}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-lg truncate">{entry.patientName}</div>
                    {entry.doctorName && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">{entry.doctorName}</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 bg-slate-800/50 px-2.5 py-1 rounded-md shrink-0">
                    Kutmoqda
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Scrolling ticker / Marquee */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-2xl py-4 px-6 overflow-hidden relative">
        <div className="whitespace-nowrap flex gap-8 text-lg font-medium text-slate-300 animate-[marquee_25s_linear_infinite]">
          <span>✨ Hurmatli bemorlar, navbatingiz kelganda shifokor qabuliga taklif qilinasiz. Iltimos kutish zalida kuting. Salomat bo'ling!</span>
          <span>✨ Uchrashuvga kechikkan taqdiringizda navbat keyingi bemorga o'tkazilishi mumkin.</span>
          <span>✨ Bizning shiorimiz - sizning chiroyli tabassumingiz! Sog'lom va baxtli bo'ling!</span>
        </div>
      </div>

      {/* Inline style for marquee animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};

