
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

const STATUS_LABELS: Record<string, string> = {
  [ToothStatus.HEALTHY]: 'Sog\'lom',
  [ToothStatus.CAVITY]: 'Karis',
  [ToothStatus.FILLED]: 'Plomba',
  [ToothStatus.MISSING]: 'Yo\'q (Missing)',
  [ToothStatus.CROWN]: 'Qoplama (Crown)',
};

// --- Ultra-Realistic 3D Render Style Tooth ---
const RealisticTooth: React.FC<{
  number: number;
  status: ToothStatus;
  isUpper: boolean;
  onClick: () => void;
}> = ({ number, status, isUpper, onClick }) => {

  // Transforms for Upper/Lower jaws (Flip vertically)
  const transform = isUpper ? "rotate(180 50 60)" : "";

  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center cursor-pointer group relative transition-transform hover:-translate-y-1"
    >
      {/* Tooth Number */}
      <span className={`mb-1 text-[10px] sm:text-xs font-bold font-mono ${status !== ToothStatus.HEALTHY ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
        {number}
      </span>

      <div className="w-8 h-12 sm:w-14 sm:h-20 relative filter drop-shadow-lg transition-all duration-300">
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
            {status === ToothStatus.MISSING ? (
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
                  filter={status === ToothStatus.CROWN ? "url(#goldMaterial)" : "url(#glossy3D)"}
                  stroke={status === ToothStatus.CROWN ? "none" : "#d1d5db"}
                  strokeWidth="0.5"
                />

                {/* Surface Details (Fissures) - only visible if healthy/cavity/filled */}
                {status !== ToothStatus.CROWN && (
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
                {status === ToothStatus.CROWN && (
                  <path
                    d="M15,45 Q15,20 25,10 Q35,2 50,2 Q65,2 75,10 Q85,20 85,45 Q88,65 80,75 Q70,85 50,82 Q30,85 20,75 Q12,65 15,45 Z"
                    fill="url(#goldGradient)"
                    opacity="0.9"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}

                {/* Cavity (Decay) - Realistic Dark Spot */}
                {status === ToothStatus.CAVITY && (
                  <g filter="url(#glossy3D)">
                    <ellipse cx="45" cy="40" rx="10" ry="8" fill="#3f0808" opacity="0.9" />
                    <ellipse cx="45" cy="40" rx="6" ry="5" fill="#000" opacity="0.4" />
                  </g>
                )}

                {/* Filling (Amalgam) - Metallic Patch */}
                {status === ToothStatus.FILLED && (
                  <path
                    d="M35,25 Q50,40 65,25 L60,40 Q50,55 40,40 Z"
                    fill="#6b7280"
                    stroke="#374151"
                    strokeWidth="0.5"
                    filter="url(#glossy3D)"
                  />
                )}
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
};

export const TeethChart: React.FC<TeethChartProps> = ({ initialData = [], readOnly = false }) => {
  const [teethData, setTeethData] = useState<Record<number, { status: ToothStatus; notes: string }>>(() => {
    const map: Record<number, { status: ToothStatus; notes: string }> = {};
    [...TOOTH_NUMBERS.upper, ...TOOTH_NUMBERS.lower].forEach(n => {
      map[n] = { status: ToothStatus.HEALTHY, notes: '' };
    });
    initialData.forEach(d => {
      if (map[d.number]) {
        map[d.number] = { status: d.status, notes: d.notes || '' };
      }
    });
    return map;
  });

  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [tempStatus, setTempStatus] = useState<ToothStatus>(ToothStatus.HEALTHY);
  const [tempNotes, setTempNotes] = useState('');

  const handleToothClick = (num: number) => {
    if (readOnly) return;
    setSelectedTooth(num);
    setTempStatus(teethData[num].status);
    setTempNotes(teethData[num].notes);
  };

  const saveChanges = () => {
    if (selectedTooth) {
      setTeethData(prev => ({
        ...prev,
        [selectedTooth]: { status: tempStatus, notes: tempNotes }
      }));
      setSelectedTooth(null);
    }
  };


  return (
    <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 sm:gap-6 mb-10 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300 select-none">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-100 border border-gray-300 shadow-sm"></div> Sog'lom</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#3f0808] border border-red-900"></div> Karis</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-500 border border-gray-600"></div> Plomba</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-600"></div> Qoplama</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-dashed border-gray-400 opacity-50"></div> Yo'q</div>
      </div>

      {/* Chart Container */}
      <div className="flex flex-col items-center gap-8 overflow-x-auto pb-4 select-none bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-800/50 dark:to-gray-900 rounded-3xl p-4 sm:p-6 border border-gray-100 dark:border-gray-700/50">

        {/* Upper Jaw */}
        <div className="relative min-w-max px-4">
          <div className="text-center text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 sticky left-0">Yuqori Jag'</div>
          <div className="flex gap-1 sm:gap-2 justify-center">
            {TOOTH_NUMBERS.upper.map(num => (
              <RealisticTooth
                key={num}
                number={num}
                status={teethData[num]?.status || ToothStatus.HEALTHY}
                isUpper={true}
                onClick={() => handleToothClick(num)}
              />
            ))}
          </div>
        </div>

        {/* Lower Jaw */}
        <div className="relative min-w-max px-4 flex flex-col items-center">
          <div className="w-full border-t-2 border-dashed border-gray-200 dark:border-gray-700 mb-8"></div>
          <div className="text-center text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 sticky left-0">Pastki Jag'</div>
          <div className="flex gap-1 sm:gap-2 justify-center">
            {TOOTH_NUMBERS.lower.map(num => (
              <RealisticTooth
                key={num}
                number={num}
                status={teethData[num]?.status || ToothStatus.HEALTHY}
                isUpper={false}
                onClick={() => handleToothClick(num)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedTooth && (
        <Modal
          isOpen={!!selectedTooth}
          onClose={() => setSelectedTooth(null)}
          title={`Tish №${selectedTooth} holati`}
        >
          <div className="flex flex-col md:flex-row gap-8">

            {/* Visual Preview in Modal */}
            <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 min-w-[180px] shadow-inner">
              <div className="scale-[2.5] transform mb-8 mt-4">
                <RealisticTooth
                  number={selectedTooth}
                  status={tempStatus}
                  isUpper={TOOTH_NUMBERS.upper.includes(selectedTooth)}
                  onClick={() => { }}
                />
              </div>
              <div className="text-center mt-6 w-full border-t border-gray-100 dark:border-gray-700 pt-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tanlangan Holat</span>
                <p className="font-bold text-xl text-gray-900 dark:text-white mt-1">{STATUS_LABELS[tempStatus]}</p>
              </div>
            </div>

            {/* Edit Controls */}
            <div className="flex-1 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Tish holatini o'zgartirish
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(ToothStatus).map((s) => (
                    <button
                      key={s}
                      onClick={() => setTempStatus(s)}
                      className={`px-3 py-3 text-sm rounded-xl border transition-all duration-200 flex items-center gap-3 text-left shadow-sm
                         ${tempStatus === s
                          ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/20
                         ${s === ToothStatus.HEALTHY ? 'bg-gray-200' : ''}
                         ${s === ToothStatus.CAVITY ? 'bg-[#3f0808]' : ''}
                         ${s === ToothStatus.FILLED ? 'bg-gray-500' : ''}
                         ${s === ToothStatus.CROWN ? 'bg-yellow-400' : ''}
                         ${s === ToothStatus.MISSING ? 'border border-dashed border-gray-400 bg-transparent' : ''}
                       `}></div>
                      <span className="font-medium">{STATUS_LABELS[s]}</span>
                    </button>
                  ))}
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

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button variant="secondary" onClick={() => setSelectedTooth(null)}>Bekor qilish</Button>
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
