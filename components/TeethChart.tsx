
import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ToothData, ToothStatus } from '../types';
import { Modal, Button } from './Common';
import { Save } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/*
 * Odontogramma.
 *
 * Har bir tish o'z anatomik shakli bilan chiziladi (kurak, qoziq, kichik va
 * katta oziq tishlar), holatlar esa toj yoki ildiz ustiga qatlam sifatida
 * qo'yiladi. Og'ir SVG filtrlar (feSpecularLighting) ishlatilmaydi — 32 ta
 * tish telefonda ham tez chiziladi. Gradientlar komponent darajasida BIR
 * MARTA e'lon qilinadi; `useId` tufayli sahifada bir nechta karta (masalan,
 * chop etish nusxasi) bir-biriga xalaqit bermaydi.
 *
 * Koordinatalar: viewBox 0 0 100 140, toj tepada (y 0-70), ildiz pastda.
 * Yuqori jag' tishlari vertikal aylantiriladi — ildiz yuqoriga qaraydi.
 */

const TOOTH_NUMBERS = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
};

const PRIMARY_TOOTH_NUMBERS = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]
};

// Convert tooth number to Roman numeral for primary teeth
const toRomanNumeral = (num: number): string => {
  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V'];
  return romanNumerals[num % 10] || num.toString();
};

// Physical states can combine with diseases
const PHYSICAL_STATES = [ToothStatus.FILLED, ToothStatus.MISSING, ToothStatus.CROWN, ToothStatus.IMPLANT];

// Disease states are mutually exclusive (severity levels)
const DISEASE_STATES = [
  ToothStatus.CAVITY,
  ToothStatus.PULPITIS,
  ToothStatus.PERIODONTITIS,
  ToothStatus.ABSCESS,
  ToothStatus.PHLEGMON,
  ToothStatus.OSTEOMYELITIS,
  ToothStatus.ADENTIA
];

/** Izoh, raqam ostidagi nuqtalar va xulosa chiplari uchun ranglar. */
const STATUS_COLORS: Record<ToothStatus, string> = {
  [ToothStatus.HEALTHY]: '#e5e7eb',
  [ToothStatus.CAVITY]: '#4a1410',
  [ToothStatus.FILLED]: '#94a3b8',
  [ToothStatus.MISSING]: '#9ca3af',
  [ToothStatus.CROWN]: '#f59e0b',
  [ToothStatus.PULPITIS]: '#ef4444',
  [ToothStatus.PERIODONTITIS]: '#b91c1c',
  [ToothStatus.ABSCESS]: '#f97316',
  [ToothStatus.PHLEGMON]: '#9333ea',
  [ToothStatus.OSTEOMYELITIS]: '#334155',
  [ToothStatus.ADENTIA]: '#111827',
  [ToothStatus.IMPLANT]: '#64748b',
};

/** Izohda ko'rsatiladigan tartib: avval jismoniy, keyin kasallik holatlari. */
const LEGEND_ORDER: ToothStatus[] = [
  ToothStatus.HEALTHY,
  ToothStatus.CAVITY,
  ToothStatus.FILLED,
  ToothStatus.CROWN,
  ToothStatus.MISSING,
  ToothStatus.IMPLANT,
  ToothStatus.PULPITIS,
  ToothStatus.PERIODONTITIS,
  ToothStatus.ABSCESS,
  ToothStatus.PHLEGMON,
  ToothStatus.OSTEOMYELITIS,
  ToothStatus.ADENTIA,
];

/* ── Tish shakllari ──────────────────────────────────────────────── */

type ToothKind = 'incisor1' | 'incisor2' | 'canine' | 'premolar' | 'molar' | 'molar3';

interface ToothShape {
  crown: string;
  roots: string[];
  /** Chaynov yuzasidagi egatlar (faqat oziq tishlarda) */
  fissure?: string;
  /** Ildiz uchi (y) — periodontit va absses belgisi shu yerga qo'yiladi */
  apex: number;
  scale: number;
}

const SHAPES: Record<ToothKind, ToothShape> = {
  incisor1: {
    crown: 'M21 10 C30 3 70 3 79 10 C84 30 80 50 71 64 C60 71 40 71 29 64 C20 50 16 30 21 10 Z',
    roots: ['M30 63 C40 69 60 69 70 63 C67 90 60 112 54 130 C52 136 48 136 46 130 C40 112 33 90 30 63 Z'],
    apex: 128,
    scale: 1,
  },
  incisor2: {
    crown: 'M25 12 C33 5 67 5 75 12 C80 30 76 50 69 64 C59 71 41 71 31 64 C24 50 20 30 25 12 Z',
    roots: ['M32 63 C41 69 59 69 68 63 C65 88 58 108 53 126 C51 132 49 132 47 126 C42 108 35 88 32 63 Z'],
    apex: 124,
    scale: 0.94,
  },
  canine: {
    crown: 'M22 30 C30 14 42 4 50 2 C58 4 70 14 78 30 C82 46 78 56 71 64 C60 71 40 71 29 64 C22 56 18 46 22 30 Z',
    roots: ['M30 63 C40 69 60 69 70 63 C67 92 60 116 54 133 C52 138 48 138 46 133 C40 116 33 92 30 63 Z'],
    apex: 131,
    scale: 1,
  },
  premolar: {
    crown: 'M14 26 C20 10 34 8 44 14 C48 16 52 16 56 14 C66 8 80 10 86 26 C90 44 84 56 76 64 C62 72 38 72 24 64 C16 56 10 44 14 26 Z',
    roots: ['M28 63 C40 70 60 70 72 63 C68 90 60 110 54 124 C52 130 48 130 46 124 C40 110 32 90 28 63 Z'],
    fissure: 'M34 24 C42 31 58 31 66 24',
    apex: 122,
    scale: 1,
  },
  molar: {
    crown: 'M7 28 C12 10 28 8 38 14 C44 17 48 16 50 15 C52 16 56 17 62 14 C72 8 88 10 93 28 C97 46 90 58 84 64 C66 74 34 74 16 64 C10 58 3 46 7 28 Z',
    roots: [
      'M15 63 C25 69 38 70 45 67 C44 84 42 100 40 112 C38 122 30 124 26 116 C22 100 18 82 15 63 Z',
      'M85 63 C75 69 62 70 55 67 C56 84 58 100 60 112 C62 122 70 124 74 116 C78 100 82 82 85 63 Z',
    ],
    fissure: 'M28 26 C36 34 44 30 50 26 C56 30 64 34 72 26 M50 26 L50 42',
    apex: 116,
    scale: 1,
  },
  molar3: {
    crown: 'M7 28 C12 10 28 8 38 14 C44 17 48 16 50 15 C52 16 56 17 62 14 C72 8 88 10 93 28 C97 46 90 58 84 64 C66 74 34 74 16 64 C10 58 3 46 7 28 Z',
    roots: [
      'M15 63 C25 69 38 70 45 67 C44 84 42 100 40 112 C38 122 30 124 26 116 C22 100 18 82 15 63 Z',
      'M85 63 C75 69 62 70 55 67 C56 84 58 100 60 112 C62 122 70 124 74 116 C78 100 82 82 85 63 Z',
    ],
    fissure: 'M28 26 C36 34 44 30 50 26 C56 30 64 34 72 26 M50 26 L50 42',
    apex: 116,
    scale: 0.88,
  },
};

/** FDI raqamining oxirgi xonasi tish turini aytadi: 1-2 kurak, 3 qoziq, 4-5 kichik oziq, 6-8 katta oziq. */
const kindOf = (num: number, isPrimary: boolean): ToothKind => {
  const p = num % 10;
  if (p === 1) return 'incisor1';
  if (p === 2) return 'incisor2';
  if (p === 3) return 'canine';
  if (isPrimary) return 'molar';
  if (p <= 5) return 'premolar';
  return p === 8 ? 'molar3' : 'molar';
};

/* ── Gradientlar (karta uchun bir marta) ─────────────────────────── */

const ChartDefs: React.FC<{ id: string }> = ({ id }) => (
  <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-enamel`} cx="38%" cy="28%" r="78%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#f4f5f7" />
        <stop offset="100%" stopColor="#cfd4dc" />
      </radialGradient>
      <linearGradient id={`${id}-root`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f3efe6" />
        <stop offset="100%" stopColor="#d8d0bf" />
      </linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fde68a" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#e2e8f0" />
        <stop offset="50%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
      <radialGradient id={`${id}-pulp`}>
        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-apex`}>
        <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#b91c1c" stopOpacity="0" />
      </radialGradient>
    </defs>
  </svg>
);

/* ── Bitta tish (faqat SVG) ──────────────────────────────────────── */

interface ToothProps {
  number: number;
  conditions: ToothStatus[];
  isUpper: boolean;
  isPrimary?: boolean;
  defsId: string;
  className?: string;
}

const Tooth: React.FC<ToothProps> = ({ number, conditions, isUpper, isPrimary = false, defsId, className = '' }) => {
  const has = (c: ToothStatus) => conditions.includes(c);
  const shape = SHAPES[kindOf(number, isPrimary)];
  const scale = shape.scale * (isPrimary ? 0.86 : 1);
  const clipId = `${defsId}-clip-${number}`;
  const missing = has(ToothStatus.MISSING);
  const gold = has(ToothStatus.CROWN);
  const implant = has(ToothStatus.IMPLANT);
  const rootsPath = shape.roots.join(' ');

  // Avval markaz atrofida kichraytiramiz, keyin yuqori jag' uchun ag'daramiz
  const transform = [
    isUpper ? 'matrix(1 0 0 -1 0 140)' : '',
    scale !== 1 ? `translate(${(50 * (1 - scale)).toFixed(1)} ${(70 * (1 - scale)).toFixed(1)}) scale(${scale})` : '',
  ].filter(Boolean).join(' ');

  return (
    <svg viewBox="0 0 100 140" className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={clipId}><path d={shape.crown} /></clipPath>
      </defs>
      <g transform={transform || undefined}>
        {/* Flegmona — butun tish atrofida tarqalgan binafsha halo */}
        {has(ToothStatus.PHLEGMON) && !missing && (
          <rect x="2" y="0" width="96" height="140" rx="34" fill="#a855f7" opacity="0.28" stroke="#9333ea" strokeWidth="1" />
        )}

        {missing ? (
          <g fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeDasharray="4 3" opacity="0.55">
            <path d={shape.crown} />
            <path d={rootsPath} />
          </g>
        ) : (
          <>
            {/* Ildizlar */}
            {implant ? (
              <g>
                <rect x="41" y="64" width="18" height="60" rx="5" fill={`url(#${defsId}-metal)`} stroke="#475569" strokeWidth="1" />
                {[76, 86, 96, 106, 116].map(y => (
                  <line key={y} x1="43" y1={y} x2="57" y2={y} stroke="#475569" strokeWidth="1.2" />
                ))}
              </g>
            ) : (
              <path d={rootsPath} fill={`url(#${defsId}-root)`} stroke="#b9b09f" strokeWidth="1" opacity="0.9" />
            )}
            {has(ToothStatus.OSTEOMYELITIS) && !implant && (
              <path d={rootsPath} fill="#334155" opacity="0.7" />
            )}

            {/* Toj */}
            <path
              d={shape.crown}
              fill={gold ? `url(#${defsId}-gold)` : `url(#${defsId}-enamel)`}
              stroke={gold ? '#b45309' : '#9ca3af'}
              strokeWidth="1.2"
            />
            {shape.fissure && !gold && (
              <path d={shape.fissure} fill="none" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
            )}

            {/* Toj ichidagi qatlamlar — toj shakli bilan kesiladi */}
            <g clipPath={`url(#${clipId})`}>
              {/* Yaltiroq emal: chap yuqorida yumshoq yorug'lik dog'i */}
              <ellipse cx="34" cy="30" rx="9" ry="16" fill="#fff" opacity={gold ? 0.35 : 0.7} transform="rotate(-18 34 30)" />
              {has(ToothStatus.FILLED) && (
                <path
                  d="M33 18 C42 27 58 27 67 18 C66 31 60 41 50 43 C40 41 34 31 33 18 Z"
                  fill={`url(#${defsId}-metal)`} stroke="#475569" strokeWidth="1"
                />
              )}
              {has(ToothStatus.CAVITY) && (
                <>
                  <path d="M37 22 C43 13 59 15 63 24 C67 33 58 41 49 39 C41 38 33 31 37 22 Z" fill="#4a1410" opacity="0.92" />
                  <ellipse cx="47" cy="26" rx="4" ry="2.5" fill="#000" opacity="0.35" />
                </>
              )}
              {has(ToothStatus.PULPITIS) && (
                <>
                  <circle cx="50" cy="44" r="20" fill={`url(#${defsId}-pulp)`} />
                  <circle cx="50" cy="44" r="5" fill="#dc2626" />
                </>
              )}
              {has(ToothStatus.ADENTIA) && <path d={shape.crown} fill="#111827" opacity="0.72" />}
            </g>
            {has(ToothStatus.ADENTIA) && !implant && <path d={rootsPath} fill="#111827" opacity="0.72" />}

            {/* Ildiz uchidagi belgilar */}
            {has(ToothStatus.PERIODONTITIS) && (
              <>
                <circle cx="50" cy={shape.apex} r="17" fill={`url(#${defsId}-apex)`} />
                <circle cx="50" cy={shape.apex} r="5" fill="#b91c1c" />
              </>
            )}
            {has(ToothStatus.ABSCESS) && (
              <>
                <circle cx="50" cy={shape.apex} r="10" fill="#fb923c" stroke="#c2410c" strokeWidth="1.5" />
                <circle cx="47" cy={shape.apex - 3} r="3" fill="#fff" opacity="0.6" />
              </>
            )}
          </>
        )}
      </g>
    </svg>
  );
};

/* ── Tish + raqam + holat nuqtalari (jadvaldagi katak) ───────────── */

// Ixcham: ikkala jag' bitta ekranga sig'sin (ilgari xl da 60x84 edi)
const SIZE_CLASS = 'w-7 h-10 sm:w-9 sm:h-[50px] lg:w-[42px] lg:h-[58px] xl:w-[46px] xl:h-[64px]';

interface ToothSlotProps {
  number: number;
  conditions: ToothStatus[];
  isUpper: boolean;
  isPrimary: boolean;
  defsId: string;
  marked: boolean;
  interactive: boolean;
  lift: number;
  rotate: number;
  onClick: () => void;
  onEnter: (el: HTMLElement) => void;
  onLeave: () => void;
}

const ToothSlot: React.FC<ToothSlotProps> = ({
  number, conditions, isUpper, isPrimary, defsId, marked, interactive, lift, rotate, onClick, onEnter, onLeave
}) => {
  const label = isPrimary ? toRomanNumeral(number) : String(number);
  const hasCondition = conditions.length > 0;

  const badge = (
    <span className={`min-w-[22px] px-1 py-0.5 rounded-md text-center text-[10px] sm:text-[11px] font-bold tabular-nums leading-none transition-colors
      ${marked
        ? 'bg-primary-600 text-white'
        : hasCondition
          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
          : 'text-gray-400 dark:text-gray-500'}`}
    >
      {label}
    </span>
  );

  const dots = (
    <span className="flex items-center gap-0.5 h-1.5">
      {conditions.slice(0, 3).map(c => (
        <span key={c} className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[c] }} />
      ))}
    </span>
  );

  return (
    <div
      onClick={onClick}
      onMouseEnter={e => onEnter(e.currentTarget)}
      onMouseLeave={onLeave}
      className={`group flex flex-col items-center gap-1 rounded-xl px-0.5 py-1 select-none transition-colors
        ${interactive ? 'cursor-pointer hover:bg-primary-50/80 dark:hover:bg-primary-900/30' : ''}
        ${marked ? 'bg-primary-100 dark:bg-primary-900/50 ring-2 ring-primary-500' : ''}`}
      style={{ transform: `translateY(${isUpper ? lift : -lift}px)` }}
    >
      {isUpper && <>{badge}{dots}</>}
      <div style={{ transform: `rotate(${rotate}deg)` }}>
        <div className={`${SIZE_CLASS} transition-transform duration-200 ${interactive ? 'group-hover:scale-110' : ''}`}>
          <Tooth number={number} conditions={conditions} isUpper={isUpper} isPrimary={isPrimary} defsId={defsId} className="w-full h-full" />
        </div>
      </div>
      {!isUpper && <>{dots}{badge}</>}
    </div>
  );
};

/* ── Izoh belgisi ────────────────────────────────────────────────── */

// Quyuq ranglar (karies, adentiya) qorong'u fonda yo'qolib ketmasligi uchun yengil hoshiya
const Swatch: React.FC<{ status: ToothStatus; size?: string }> = ({ status, size = 'w-2.5 h-2.5' }) => {
  const ring = 'shrink-0 rounded-full border border-black/10 dark:border-white/40';
  if (status === ToothStatus.HEALTHY) return <span className={`${size} ${ring} bg-white shadow-sm`} />;
  if (status === ToothStatus.MISSING) return <span className={`${size} shrink-0 rounded-full border-2 border-dashed border-gray-400`} />;
  if (status === ToothStatus.IMPLANT) return <span className={`${size} ${ring} bg-slate-400 ring-2 ring-inset ring-slate-200`} />;
  return <span className={`${size} ${ring}`} style={{ background: STATUS_COLORS[status] }} />;
};

/* ── Karta ───────────────────────────────────────────────────────── */

/** Jag' egriligi: o'rtadagi tishlar necha px ichkariga (jag'lar orasiga) suriladi, chekkadagilar necha gradus qiyshayadi. */
const ARCH_LIFT = 10;
const ARCH_ROT = 5;

interface TeethChartProps {
  initialData?: ToothData[];
  readOnly?: boolean;
  onSave?: (data: { number: number; conditions: ToothStatus[]; notes: string }) => void;
  onToothClick?: (number: number) => void;
  selectedTooth?: number | null;
  /** Bir nechta tishni belgilash (protsedura qo'shish oynasi). Berilsa selectedTooth o'rniga ishlatiladi. */
  selectedTeeth?: number[];
  procedures?: { id: string; serviceName: string; date: string; toothNumber?: number }[];
}

export const TeethChart: React.FC<TeethChartProps> = ({
  initialData = [],
  readOnly = false,
  onSave,
  onToothClick,
  selectedTooth: externalSelectedTooth,
  selectedTeeth,
  procedures = []
}) => {
  const { t } = useLanguage();
  // useId qiymatida `:` yoki `«» bo'lishi mumkin — url(#...) da ishlatish uchun tozalaymiz
  const defsId = 'tc' + useId().replace(/[^a-zA-Z0-9]/g, '');

  const STATUS_LABELS: Record<string, string> = {
    [ToothStatus.HEALTHY]: t('patients.details.teethChart.healthy'),
    [ToothStatus.CAVITY]: t('patients.details.teethChart.cavity'),
    [ToothStatus.FILLED]: t('patients.details.teethChart.filled'),
    [ToothStatus.MISSING]: t('patients.details.teethChart.missing'),
    [ToothStatus.CROWN]: t('patients.details.teethChart.crown'),
    [ToothStatus.PULPITIS]: t('patients.details.teethChart.pulpitis'),
    [ToothStatus.PERIODONTITIS]: t('patients.details.teethChart.periodontitis'),
    [ToothStatus.ABSCESS]: t('patients.details.teethChart.abscess'),
    [ToothStatus.PHLEGMON]: t('patients.details.teethChart.phlegmon'),
    [ToothStatus.OSTEOMYELITIS]: t('patients.details.teethChart.osteomyelitis'),
    [ToothStatus.ADENTIA]: t('patients.details.teethChart.adentia'),
    [ToothStatus.IMPLANT]: t('patients.details.teethChart.implant'),
  };
  // Izoh va chiplarda qisqa nomlar ("Qoplama (Crown)" emas, "Qoplama")
  const SHORT_LABELS: Record<string, string> = {
    ...STATUS_LABELS,
    [ToothStatus.CROWN]: t('patients.details.teethChart.crownShort'),
    [ToothStatus.MISSING]: t('patients.details.teethChart.missingShort'),
  };

  const [toothType, setToothType] = useState<'permanent' | 'primary'>('permanent');

  const [teethData, setTeethData] = useState<Record<number, { conditions: ToothStatus[]; notes: string }>>(() => {
    const map: Record<number, { conditions: ToothStatus[]; notes: string }> = {};
    // Initialize both permanent and primary teeth
    [...TOOTH_NUMBERS.upper, ...TOOTH_NUMBERS.lower, ...PRIMARY_TOOTH_NUMBERS.upper, ...PRIMARY_TOOTH_NUMBERS.lower].forEach(n => {
      map[n] = { conditions: [], notes: '' };
    });
    initialData.forEach(d => {
      if (map[d.number]) {
        map[d.number] = { conditions: d.conditions || [], notes: d.notes || '' };
      }
    });
    return map;
  });

  // Update local state when initialData changes
  useEffect(() => {
    if (initialData.length > 0) {
      setTeethData(prev => {
        const next = { ...prev };
        initialData.forEach(d => {
          if (next[d.number]) {
            next[d.number] = { conditions: d.conditions || [], notes: d.notes || '' };
          }
        });
        return next;
      });
    }
  }, [initialData]);

  const [internalSelectedTooth, setInternalSelectedTooth] = useState<number | null>(null);
  const [tempConditions, setTempConditions] = useState<ToothStatus[]>([]);
  const [tempNotes, setTempNotes] = useState('');

  // Use external selected tooth if provided, otherwise internal
  const activeSelectedTooth = externalSelectedTooth !== undefined ? externalSelectedTooth : internalSelectedTooth;
  const isMarked = (num: number) => (selectedTeeth ? selectedTeeth.includes(num) : activeSelectedTooth === num);
  const interactive = !!onToothClick || !readOnly;

  const handleToothClick = (num: number) => {
    setHover(null);
    // If external handler exists, use it and don't open modal
    if (onToothClick) {
      onToothClick(num);
      return;
    }

    if (readOnly) return;
    setInternalSelectedTooth(num);
    setTempConditions([...teethData[num].conditions]);
    setTempNotes(teethData[num].notes);
  };

  const toggleCondition = (condition: ToothStatus) => {
    setTempConditions(prev => {
      const isSelected = prev.includes(condition);

      if (isSelected) {
        // Remove condition
        return prev.filter(c => c !== condition);
      } else {
        // Add condition with validation
        const isDiseaseState = DISEASE_STATES.includes(condition);

        if (isDiseaseState) {
          // Remove any existing disease state before adding new one
          const withoutDiseases = prev.filter(c => !DISEASE_STATES.includes(c));
          return [...withoutDiseases, condition];
        } else {
          // Physical state - just add it
          return [...prev, condition];
        }
      }
    });
  };

  const saveChanges = () => {
    if (internalSelectedTooth) {
      const newData = { conditions: tempConditions, notes: tempNotes };
      setTeethData(prev => ({
        ...prev,
        [internalSelectedTooth]: newData
      }));

      if (onSave) {
        onSave({ number: internalSelectedTooth, ...newData });
      }

      setInternalSelectedTooth(null);
    }
  };

  const [showLegend, setShowLegend] = useState(false);

  /* Sichqoncha ostidagi tish uchun qisqa ma'lumot. Portal orqali chiziladi:
     karta ba'zan kichraytirilgan (transform) konteyner ichida turadi, u
     yerda `position: fixed` noto'g'ri joyga tushardi. */
  const [hover, setHover] = useState<{ num: number; x: number; y: number; below: boolean } | null>(null);
  const showTip = (num: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 150;
    setHover({ num, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
  };
  useEffect(() => {
    if (!hover) return;
    const hide = () => setHover(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [hover]);

  const lastProcedureFor = (num: number) =>
    procedures
      .filter(p => p.toothNumber === num)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];

  const currentNumbers = toothType === 'permanent' ? TOOTH_NUMBERS : PRIMARY_TOOTH_NUMBERS;

  // Xulosa: joriy jag' turidagi holatlar soni
  const summary = useMemo(() => {
    const counts = new Map<ToothStatus, number>();
    let healthy = 0;
    [...currentNumbers.upper, ...currentNumbers.lower].forEach(n => {
      const c = teethData[n]?.conditions || [];
      if (c.length === 0) healthy++;
      c.forEach(s => counts.set(s, (counts.get(s) || 0) + 1));
    });
    return { healthy, counts };
  }, [teethData, currentNumbers]);

  const renderRow = (nums: number[], isUpper: boolean) => {
    const n = nums.length;
    return (
      <div className={`flex justify-center ${isUpper ? 'items-start' : 'items-end'} gap-0.5 sm:gap-1 min-w-max px-2`}>
        {nums.map((num, i) => {
          const d = Math.abs(i + 0.5 - n / 2) / (n / 2); // 0 — o'rta, 1 — chekka
          const lift = Math.round((1 - d * d) * ARCH_LIFT);
          const isLeft = i + 0.5 < n / 2;
          // Chekkadagi tojlar biroz o'rtaga qarab qiyshayadi
          const rotate = (isUpper ? 1 : -1) * (isLeft ? -1 : 1) * d * ARCH_ROT;
          return (
            <ToothSlot
              key={num}
              number={num}
              conditions={teethData[num]?.conditions || []}
              isUpper={isUpper}
              isPrimary={toothType === 'primary'}
              defsId={defsId}
              marked={isMarked(num)}
              interactive={interactive}
              lift={lift}
              rotate={rotate}
              onClick={() => handleToothClick(num)}
              onEnter={el => showTip(num, el)}
              onLeave={() => setHover(null)}
            />
          );
        })}
      </div>
    );
  };

  const hoverData = hover ? teethData[hover.num] : null;
  const hoverLast = hover ? lastProcedureFor(hover.num) : null;

  return (
    <div className="relative p-3 sm:p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <ChartDefs id={defsId} />

      {/* Sarlavha qatori: jag' turi + xulosa */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-1 bg-gray-100 dark:bg-gray-700">
          {(['permanent', 'primary'] as const).map(type => (
            <button
              key={type}
              onClick={() => setToothType(type)}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${toothType === type
                ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              {t(`patients.details.teethChart.${type}`)}
            </button>
          ))}
        </div>

        {/* Telefonda bitta qatorda yonlama suriladi, kattaroq ekranda o'raladi */}
        <div className="flex sm:flex-wrap items-center gap-1.5 text-xs font-medium max-w-full overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500">
            <Swatch status={ToothStatus.HEALTHY} size="w-2 h-2" />
            {SHORT_LABELS[ToothStatus.HEALTHY]} · {summary.healthy}
          </span>
          {LEGEND_ORDER.filter(s => summary.counts.get(s)).map(s => (
            <span key={s} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              <Swatch status={s} size="w-2 h-2" />
              {SHORT_LABELS[s]} · {summary.counts.get(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Legend Toggle for Mobile */}
      <div className="flex justify-center mb-3 sm:hidden">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="text-xs text-primary-600 font-medium px-3 py-1 rounded-full bg-primary-50 border border-primary-100"
        >
          {showLegend ? t('patients.details.teethChart.hideLegend') : t('patients.details.teethChart.showLegend')}
        </button>
      </div>

      {/* Legend */}
      <div className={`${showLegend ? 'flex' : 'hidden sm:flex'} flex-wrap justify-center gap-x-4 gap-y-2 mb-3 text-[11px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 select-none`}>
        {LEGEND_ORDER.map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <Swatch status={s} />
            {SHORT_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Chart Container. Jag' nomlari suriladigan qism TASHQARISIDA turadi —
          telefonda tishlar yonlama surilganda ham nomlar o'rtada, kesilmagan ko'rinadi. */}
      <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-800/60 dark:via-gray-900 dark:to-gray-800/60 py-3 sm:py-4 select-none">
        <div className="text-center text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-[0.25em] mb-1.5">
          {t('patients.details.teethChart.upperJaw')}
        </div>

        <div className="overflow-x-auto px-2 sm:px-6">
          <div className="min-w-max mx-auto">
            {renderRow(currentNumbers.upper, true)}

            {/* O'rta chiziq: bemorning o'ng tomoni ekranning chap tomonida */}
            <div className="flex items-center gap-3 my-2 sm:my-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300 dark:text-gray-600">
              <span>{t('patients.details.teethChart.right')}</span>
              <div className="flex-1 border-t-2 border-dashed border-gray-200 dark:border-gray-700" />
              <span>{t('patients.details.teethChart.left')}</span>
            </div>

            {renderRow(currentNumbers.lower, false)}
          </div>
        </div>

        <div className="text-center text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-[0.25em] mt-1.5">
          {t('patients.details.teethChart.lowerJaw')}
        </div>
      </div>

      {/* Hover tooltip */}
      {hover && hoverData && createPortal(
        <div
          className="fixed z-[100] pointer-events-none"
          style={{ left: hover.x, top: hover.y, transform: `translate(-50%, ${hover.below ? '0' : '-100%'})` }}
        >
          <div className="rounded-xl bg-gray-900 text-white shadow-xl px-3 py-2 text-xs min-w-[150px] max-w-[240px] dark:bg-gray-700">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-bold text-sm">
                {t('patients.details.teethChart.toothStatusTitle')} {toothType === 'primary' ? toRomanNumeral(hover.num) : hover.num}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {hoverData.conditions.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-success-500">
                  <Swatch status={ToothStatus.HEALTHY} size="w-2 h-2" /> {SHORT_LABELS[ToothStatus.HEALTHY]}
                </span>
              ) : hoverData.conditions.map(c => (
                <span key={c} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10">
                  <Swatch status={c} size="w-2 h-2" /> {SHORT_LABELS[c]}
                </span>
              ))}
            </div>
            {hoverData.notes && (
              <p className="mt-1.5 text-gray-300 italic line-clamp-2">{hoverData.notes}</p>
            )}
            {hoverLast && (
              <div className="mt-1.5 pt-1.5 border-t border-white/10 text-gray-300">
                <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('patients.details.teethChart.lastProcedure')}</span>
                <div className="flex justify-between gap-2">
                  <span className="truncate">{hoverLast.serviceName}</span>
                  <span className="font-mono text-gray-400 shrink-0">{hoverLast.date}</span>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Detail Modal */}
      {internalSelectedTooth && (
        <Modal
          isOpen={!!internalSelectedTooth}
          onClose={() => setInternalSelectedTooth(null)}
          title={`${t('patients.details.teethChart.toothStatusTitle')} ${toothType === 'primary' ? toRomanNumeral(internalSelectedTooth) : internalSelectedTooth}`}
        >
          <div className="flex flex-col md:flex-row gap-6">

            {/* Visual Preview in Modal */}
            <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 md:min-w-[200px] shadow-inner">
              <Tooth
                number={internalSelectedTooth}
                conditions={tempConditions}
                isUpper={TOOTH_NUMBERS.upper.includes(internalSelectedTooth) || PRIMARY_TOOTH_NUMBERS.upper.includes(internalSelectedTooth)}
                isPrimary={toothType === 'primary'}
                defsId={defsId}
                className="w-28 h-40"
              />
              <div className="text-center mt-4 w-full border-t border-gray-100 dark:border-gray-700 pt-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('patients.details.teethChart.selectedConditions')}</span>
                <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                  {tempConditions.length === 0 ? (
                    <span className="text-sm font-bold text-success-600">{t('patients.details.teethChart.healthy')}</span>
                  ) : tempConditions.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-800 dark:text-gray-100">
                      <Swatch status={c} size="w-2 h-2" /> {SHORT_LABELS[c]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Edit Controls */}
            <div className="flex-1 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('patients.details.teethChart.changeStatus')}
                </label>

                {/* Physical States Group */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('patients.details.teethChart.physicalState')}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {PHYSICAL_STATES.map((s) => {
                      const on = tempConditions.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleCondition(s)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex items-center gap-2 text-left
                            ${on
                              ? 'bg-primary-600 text-white border-primary-600 ring-2 ring-primary-200 dark:ring-primary-900'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                          <Swatch status={s} size="w-3 h-3" />
                          <span className="font-medium text-xs">{SHORT_LABELS[s]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Disease States Group */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('patients.details.teethChart.diseaseState')}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {DISEASE_STATES.map((s) => {
                      const on = tempConditions.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleCondition(s)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex items-center gap-2 text-left
                            ${on
                              ? 'bg-primary-600 text-white border-primary-600 ring-2 ring-primary-200 dark:ring-primary-900'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                          <Swatch status={s} size="w-3 h-3" />
                          <span className="font-medium text-xs">{STATUS_LABELS[s]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('patients.details.teethChart.doctorNote')}
                </label>
                <textarea
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm h-24 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none transition-shadow focus:shadow-md"
                  placeholder={t('patients.details.teethChart.notePlaceholder')}
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                />
              </div>

              {/* Performed Procedures Section */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('patients.details.teethChart.performedProcedures')}
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {procedures.filter(p => p.toothNumber === internalSelectedTooth).length === 0 ? (
                    <p className="text-xs text-gray-500 italic">{t('patients.details.teethChart.noProcedures')}</p>
                  ) : (
                    procedures
                      .filter(p => p.toothNumber === internalSelectedTooth)
                      .map((proc, idx) => (
                        <div key={proc.id || idx} className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800 flex justify-between items-center">
                          <span className="text-xs font-medium text-primary-900 dark:text-primary-100">{proc.serviceName}</span>
                          <span className="text-[10px] text-primary-600 dark:text-primary-400 font-mono">{proc.date}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button variant="secondary" onClick={() => setInternalSelectedTooth(null)}>{t('common.cancel')}</Button>
                <Button onClick={saveChanges} className="px-6">
                  <Save className="w-4 h-4 mr-2" /> {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
