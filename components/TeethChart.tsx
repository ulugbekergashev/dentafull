
import React, { useState } from 'react';
import { ToothData, ToothStatus } from '../types';
import { Modal, Button } from './Common';
import { Save } from 'lucide-react';

interface TeethChartProps {
  initialData?: ToothData[];
  readOnly?: boolean;
}

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
  const lastDigit = num % 10;
  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V'];
  return romanNumerals[lastDigit] || num.toString();
};

const STATUS_LABELS: Record<string, string> = {
  [ToothStatus.HEALTHY]: 'Sog\'lom',
  [ToothStatus.CAVITY]: 'Karies',
  [ToothStatus.FILLED]: 'Plombalangan',
  [ToothStatus.MISSING]: 'Yo\'q (Missing)',
  [ToothStatus.CROWN]: 'Qoplama (Crown)',
  [ToothStatus.PULPITIS]: 'Pulpit',
  [ToothStatus.PERIODONTITIS]: 'Periodontit',
  [ToothStatus.ABSCESS]: 'Absses',
  [ToothStatus.PHLEGMON]: 'Flegmona',
  [ToothStatus.OSTEOMYELITIS]: 'Osteomiyelit',
  [ToothStatus.ADENTIA]: 'Adentiya',
  [ToothStatus.IMPLANT]: 'Implant',
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

// --- Ultra-Realistic 3D Render Style Tooth ---
const RealisticTooth: React.FC<{
  number: number;
  conditions: ToothStatus[];
  isUpper: boolean;
  isPrimary?: boolean;
  onClick: () => void;
}> = ({ number, conditions, isUpper, isPrimary = false, onClick }) => {
  const hasCondition = (cond: ToothStatus) => conditions.includes(cond);
  const isHealthy = conditions.length === 0;

  // Display Roman numerals for primary teeth
  const displayNumber = isPrimary ? toRomanNumeral(number) : number.toString();

  // Transforms for Upper/Lower jaws (Flip vertically)
  const transform = isUpper ? "rotate(180 50 60)" : "";

  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center cursor-pointer group relative transition-transform hover:-translate-y-1"
    >
      {/* Tooth Number */}
      <span className={`mb-1 text-[10px] sm:text-xs font-bold font-mono ${!isHealthy ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
        {displayNumber}
      </span>

      <div className={`${isPrimary ? 'w-6 h-10 sm:w-10 sm:h-16' : 'w-8 h-12 sm:w-14 sm:h-20'} relative filter drop-shadow-lg transition-all duration-300`}>
        <svg viewBox="0 0 100 120" className="w-full h-full overflow-visible">
          <defs>
            {/* 1. 3D Glossy Enamel Filter (The "NanoBanana" Look) */}
            <filter id="glossy3D" x="-20%" y="-20%" width="140%" height="140%">
              {/* Create a height map from alpha */}
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1" specularExponent="20" lightingColor="#ffffff" result="specOut">
                <fePointLight x="-50" y="-100" z="200" />
              </feSpecularLighting>
              <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
              <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint" />
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
            </filter>

            {/* 2. Gold Material Filter */}
            <filter id="goldMaterial">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
              <feSpecularLighting in="blur" surfaceScale="3" specularConstant="1" specularExponent="35" lightingColor="#ffecb3" result="specOut">
                <fePointLight x="-50" y="-100" z="200" />
              </feSpecularLighting>
              <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
              <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
            </filter>

            {/* Gradients */}
            <linearGradient id="rootGradient" x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#f3f4f6" />
              <stop offset="100%" stopColor="#d1d5db" />
            </linearGradient>

            <radialGradient id="crownGradient" cx="0.4" cy="0.4" r="0.6">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e5e7eb" />
            </radialGradient>

            <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>

            <radialGradient id="cavityGradient" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#450a0a" />
              <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.0" />
            </radialGradient>
          </defs>

          <g transform={transform}>
            {hasCondition(ToothStatus.MISSING) ? (
              // Missing Tooth Outline
              <path
                d="M20,40 Q15,60 15,80 Q15,110 30,115 Q45,120 50,100 Q55,120 70,115 Q85,110 85,80 Q85,60 80,40 Q70,10 50,10 Q30,10 20,40 Z"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="2"
                strokeDasharray="4,4"
              />
            ) : (
              <>
                {/* ROOTS (Background Layer) */}
                <path
                  d="M20,50 Q20,80 25,105 Q27,115 35,110 Q43,105 48,90 L52,90 Q57,105 65,110 Q73,115 75,105 Q80,80 80,50"
                  fill="url(#rootGradient)"
                />

                {/* CROWN (Main Body with 3D Gloss) */}
                <path
                  d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                  fill="url(#crownGradient)"
                  filter={hasCondition(ToothStatus.CROWN) ? "url(#goldMaterial)" : "url(#glossy3D)"}
                  stroke={hasCondition(ToothStatus.CROWN) ? "none" : "#d1d5db"}
                  strokeWidth="0.5"
                />

                {/* Surface Details (Fissures) - only visible if not crown */}
                {!hasCondition(ToothStatus.CROWN) && (
                  <path
                    d="M35,25 Q50,35 65,25 M50,25 L50,45 M40,35 Q50,50 60,35"
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth="1"
                    strokeLinecap="round"
                    opacity="0.4"
                  />
                )}

                {/* --- STATUS OVERLAYS --- */}

                {/* Crown Overlay (Gold Color Override) */}
                {hasCondition(ToothStatus.CROWN) && (
                  <path
                    d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                    fill="url(#goldGradient)"
                    opacity="0.9"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}

                {/* Cavity (Decay) - Realistic Dark Spot */}
                {hasCondition(ToothStatus.CAVITY) && (
                  <g filter="url(#glossy3D)">
                    <ellipse cx="45" cy="40" rx="10" ry="8" fill="#3f0808" opacity="0.9" />
                    <ellipse cx="45" cy="40" rx="6" ry="5" fill="#000" opacity="0.4" />
                  </g>
                )}

                {/* Filling (Amalgam) - Metallic Patch */}
                {hasCondition(ToothStatus.FILLED) && (
                  <path
                    d="M35,25 Q50,40 65,25 L60,40 Q50,55 40,40 Z"
                    fill="#6b7280"
                    stroke="#374151"
                    strokeWidth="0.5"
                    filter="url(#glossy3D)"
                  />
                )}

                {/* Pulpitis - Red Glow/Center */}
                {hasCondition(ToothStatus.PULPITIS) && (
                  <circle cx="50" cy="50" r="15" fill="#ef4444" opacity="0.6" filter="url(#glossy3D)" />
                )}

                {/* Periodontitis - Gum line redness */}
                {hasCondition(ToothStatus.PERIODONTITIS) && (
                  <path d="M20,80 Q50,90 80,80 L80,100 Q50,110 20,100 Z" fill="#7f1d1d" opacity="0.7" filter="url(#glossy3D)" />
                )}

                {/* Abscess - Circle at root */}
                {hasCondition(ToothStatus.ABSCESS) && (
                  <circle cx="50" cy="100" r="12" fill="#f97316" opacity="0.8" filter="url(#glossy3D)" />
                )}

                {/* Phlegmon - Diffuse Purple */}
                {hasCondition(ToothStatus.PHLEGMON) && (
                  <rect x="20" y="20" width="60" height="80" fill="#7e22ce" opacity="0.4" rx="10" filter="url(#glossy3D)" />
                )}

                {/* Osteomyelitis - Dark overlay */}
                {hasCondition(ToothStatus.OSTEOMYELITIS) && (
                  <path
                    d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                    fill="#334155"
                    opacity="0.6"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}

                {/* Adentia - Very Dark/Black overlay */}
                {hasCondition(ToothStatus.ADENTIA) && (
                  <path
                    d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                    fill="#000000"
                    opacity="0.7"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}

                {/* Implant - Screw in root */}
                {hasCondition(ToothStatus.IMPLANT) && (
                  <g filter="url(#glossy3D)">
                    <rect x="42" y="55" width="16" height="50" rx="2" fill="#9ca3af" />
                    <line x1="42" y1="65" x2="58" y2="65" stroke="#4b5563" strokeWidth="1" />
                    <line x1="42" y1="75" x2="58" y2="75" stroke="#4b5563" strokeWidth="1" />
                    <line x1="42" y1="85" x2="58" y2="85" stroke="#4b5563" strokeWidth="1" />
                    <line x1="42" y1="95" x2="58" y2="95" stroke="#4b5563" strokeWidth="1" />
                  </g>
                )}
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
};

interface TeethChartProps {
  initialData?: ToothData[];
  readOnly?: boolean;
  onSave?: (data: { number: number; conditions: ToothStatus[]; notes: string }) => void;
  onToothClick?: (number: number) => void;
  selectedTooth?: number | null;
  procedures?: { id: string; serviceName: string; date: string; toothNumber?: number }[];
}

export const TeethChart: React.FC<TeethChartProps> = ({
  initialData = [],
  readOnly = false,
  onSave,
  onToothClick,
  selectedTooth: externalSelectedTooth,
  procedures = []
}) => {
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
  React.useEffect(() => {
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

  const handleToothClick = (num: number) => {
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

  return (
    <div className="p-2 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

      {/* Tooth Type Toggle */}
      <div className="flex justify-center mb-4 sm:mb-6">
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1 bg-gray-100 dark:bg-gray-700">
          <button
            onClick={() => setToothType('permanent')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-sm font-medium rounded-md transition-all duration-200 ${toothType === 'permanent'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Doimiy (32)
          </button>
          <button
            onClick={() => setToothType('primary')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-sm font-medium rounded-md transition-all duration-200 ${toothType === 'primary'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Sut (20)
          </button>
        </div>
      </div>

      {/* Legend Toggle for Mobile */}
      <div className="flex justify-center mb-4 sm:hidden">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="text-xs text-blue-600 font-medium px-3 py-1 rounded-full bg-blue-50 border border-blue-100"
        >
          {showLegend ? 'Izohlarni yashirish' : 'Holat izohlarini ko\'rish'}
        </button>
      </div>

      {/* Legend */}
      <div className={`${showLegend ? 'flex' : 'hidden sm:flex'} flex-wrap justify-center gap-2 sm:gap-6 mb-6 sm:mb-10 text-[10px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 select-none pb-4 border-b border-gray-50 border-hidden sm:border-solid`}>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gray-100 border border-gray-300 shadow-sm"></div> Sog'lom</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#3f0808] border border-red-900"></div> Karies</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gray-500 border border-gray-600"></div> Plombalangan</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-yellow-600"></div> Qoplama</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-gray-400 opacity-50"></div> Yo'q</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600"></div> Pulpit</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-700 border border-red-800"></div> Periodontit</div>
      </div>

      {/* Chart Container */}
      <div className="flex flex-col items-start lg:items-center gap-4 sm:gap-8 overflow-x-auto pb-6 select-none bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-800/50 dark:to-gray-900 rounded-3xl p-4 sm:p-6 border border-gray-100 dark:border-gray-700/50">

        {/* Upper Jaw */}
        <div className="relative min-w-max px-8">
          <div className="text-left lg:text-center text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 sticky left-0 pl-2 lg:pl-0">Yuqori Jag'</div>
          <div className="flex gap-1.5 sm:gap-2 justify-start lg:justify-center pr-8">
            {(toothType === 'permanent' ? TOOTH_NUMBERS.upper : PRIMARY_TOOTH_NUMBERS.upper).map(num => (
              <div key={num} className={`rounded-full ${activeSelectedTooth === num ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
                <RealisticTooth
                  number={num}
                  conditions={teethData[num]?.conditions || []}
                  isUpper={true}
                  isPrimary={toothType === 'primary'}
                  onClick={() => handleToothClick(num)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Lower Jaw */}
        <div className="relative min-w-max px-8 flex flex-col items-start lg:items-center">
          <div className="w-full border-t-2 border-dashed border-gray-100 dark:border-gray-700/50 my-6 sm:my-8 pr-12"></div>
          <div className="text-left lg:text-center text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 sticky left-0 pl-2 lg:pl-0">Pastki Jag'</div>
          <div className="flex gap-1.5 sm:gap-2 justify-start lg:justify-center pr-8">
            {(toothType === 'permanent' ? TOOTH_NUMBERS.lower : PRIMARY_TOOTH_NUMBERS.lower).map(num => (
              <div key={num} className={`rounded-full ${activeSelectedTooth === num ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
                <RealisticTooth
                  number={num}
                  conditions={teethData[num]?.conditions || []}
                  isUpper={false}
                  isPrimary={toothType === 'primary'}
                  onClick={() => handleToothClick(num)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {internalSelectedTooth && (
        <Modal
          isOpen={!!internalSelectedTooth}
          onClose={() => setInternalSelectedTooth(null)}
          title={`Tish №${toothType === 'primary' ? toRomanNumeral(internalSelectedTooth) : internalSelectedTooth} holati`}
        >
          <div className="flex flex-col md:flex-row gap-8">

            {/* Visual Preview in Modal */}
            <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 min-w-[180px] shadow-inner">
              <div className="scale-[2.5] transform mb-8 mt-4">
                <RealisticTooth
                  number={internalSelectedTooth}
                  conditions={tempConditions}
                  isUpper={TOOTH_NUMBERS.upper.includes(internalSelectedTooth) || PRIMARY_TOOTH_NUMBERS.upper.includes(internalSelectedTooth)}
                  isPrimary={toothType === 'primary'}
                  onClick={() => { }}
                />
              </div>
              <div className="text-center mt-6 w-full border-t border-gray-100 dark:border-gray-700 pt-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tanlangan Holatlar</span>
                <p className="font-bold text-sm text-gray-900 dark:text-white mt-1">
                  {tempConditions.length === 0 ? "Sog'lom" : tempConditions.map(c => STATUS_LABELS[c]).join(', ')}
                </p>
              </div>
            </div>

            {/* Edit Controls */}
            <div className="flex-1 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Tish holatini o'zgartirish
                </label>

                {/* Physical States Group */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Jismoniy Holat</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {PHYSICAL_STATES.map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleCondition(s)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex items-center gap-2 text-left
                           ${tempConditions.includes(s)
                            ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                      >
                        <div className={`w-3 h-3 rounded flex-shrink-0 border-2 flex items-center justify-center
                           ${tempConditions.includes(s) ? 'border-white bg-white' : 'border-gray-400'}`}>
                          {tempConditions.includes(s) && <div className="w-1.5 h-1.5 bg-blue-600 rounded-sm"></div>}
                        </div>
                        <span className="font-medium text-xs">{STATUS_LABELS[s]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Disease States Group */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Kasallik Darajasi (Faqat bittasini tanlang)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {DISEASE_STATES.map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleCondition(s)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex items-center gap-2 text-left
                           ${tempConditions.includes(s)
                            ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                      >
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/20
                           ${s === ToothStatus.CAVITY ? 'bg-[#3f0808]' : ''}
                           ${s === ToothStatus.PULPITIS ? 'bg-red-500' : ''}
                           ${s === ToothStatus.PERIODONTITIS ? 'bg-red-700' : ''}
                           ${s === ToothStatus.ABSCESS ? 'bg-orange-500' : ''}
                           ${s === ToothStatus.PHLEGMON ? 'bg-purple-700' : ''}
                           ${s === ToothStatus.OSTEOMYELITIS ? 'bg-slate-800' : ''}
                           ${s === ToothStatus.ADENTIA ? 'bg-black' : ''}
                         `}></div>
                        <span className="font-medium text-xs">{STATUS_LABELS[s]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Shifokor izohi
                </label>
                <textarea
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm h-28 dark:border-gray-600 dark:bg-gray-800/50 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none transition-shadow focus:shadow-md"
                  placeholder="Tishdagi muammolar, o'tkazilgan muolajalar haqida izoh..."
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                />
              </div>

              {/* Performed Procedures Section */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Qilingan protseduralar
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {procedures.filter(p => p.toothNumber === internalSelectedTooth).length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Hozircha protseduralar yo'q</p>
                  ) : (
                    procedures
                      .filter(p => p.toothNumber === internalSelectedTooth)
                      .map((proc, idx) => (
                        <div key={proc.id || idx} className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 flex justify-between items-center">
                          <span className="text-xs font-medium text-blue-900 dark:text-blue-100">{proc.serviceName}</span>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{proc.date}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button variant="secondary" onClick={() => setInternalSelectedTooth(null)}>Bekor qilish</Button>
                <Button onClick={saveChanges} className="px-6">
                  <Save className="w-4 h-4 mr-2" /> Saqlash
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
