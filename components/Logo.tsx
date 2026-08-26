import React, { useId } from 'react';

/**
 * DentaCRM brend belgisi.
 *
 * Tish shakli bitta clipPath — ichidagi uch qatlam (chapdan o'ngga
 * qorayishdan yorishishga) diagonal chiziqlar bilan ajratiladi.
 * Shu sababli belgi har qanday o'lchamda toza ko'rinadi: PNG emas, vektor.
 */

export type LogoTone = 'brand' | 'onBlue' | 'onDark';

/** [chap, diagonal tasma, o'ng] — har bir fon uchun uch pog'onali gradatsiya */
const TONES: Record<LogoTone, readonly [string, string, string]> = {
  brand: ['#2563EB', '#5B87EE', '#A9C2F5'],
  onBlue: ['#FFFFFF', '#DCE7FC', '#B6CBF3'],
  onDark: ['#5EA0F8', '#4A7BC0', '#3E6394'],
};

const TOOTH_PATH =
  'M50 13C55.5 7 62 3.5 70.5 3.5C85 3.5 94 15 94 30.5C94 41 90.5 51.5 87.5 63' +
  'C84.5 74.5 82.5 86 78.5 92.5C75.5 97.5 68.5 96.5 66.5 90.5C63.5 81 61.5 69 57.5 63' +
  'C54.5 58.5 45.5 58.5 42.5 63C38.5 69 36.5 81 33.5 90.5C31.5 96.5 24.5 97.5 21.5 92.5' +
  'C17.5 86 15.5 74.5 12.5 63C9.5 51.5 6 41 6 30.5C6 15 15 3.5 29.5 3.5' +
  'C38 3.5 44.5 7 50 13Z';

interface LogoMarkProps {
  /** Fonga qarab rang to'plami: oq/och fon, ko'k fon yoki qorong'i fon */
  tone?: LogoTone;
  className?: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({ tone = 'brand', className = 'w-8 h-8' }) => {
  // useId ':' belgilarini qaytaradi — url(#...) ichida ular muammo qiladi
  const clipId = `denta-tooth-${useId().replace(/:/g, '')}`;
  const [deep, mid, light] = TONES[tone];

  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <path d={TOOTH_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="-20" y="-20" width="140" height="140" fill={light} />
        <polygon points="50,-20 68,-20 39,120 21,120" fill={mid} />
        <polygon points="-20,-20 50,-20 21,120 -20,120" fill={deep} />
      </g>
    </svg>
  );
};

const WORDMARK_SIZES = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
} as const;

const MARK_SIZES = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
} as const;

interface LogoProps {
  size?: keyof typeof WORDMARK_SIZES;
  /** Landing kabi doim och fonli sahifalarda dark: variantlarini o'chirish uchun */
  forceLight?: boolean;
  className?: string;
}

/** Belgi + "DentaCRM" so'z belgisi. Dark rejimda ranglar avtomatik almashadi. */
export const Logo: React.FC<LogoProps> = ({ size = 'md', forceLight = false, className = '' }) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    {/* Dark rejimda belgi yorqinroq ko'k bilan almashadi */}
    <LogoMark tone="brand" className={`${MARK_SIZES[size]} ${forceLight ? '' : 'dark:hidden'}`} />
    {!forceLight && <LogoMark tone="onDark" className={`${MARK_SIZES[size]} hidden dark:block`} />}
    <span className={`${WORDMARK_SIZES[size]} font-extrabold tracking-tight leading-none`}>
      <span className={forceLight ? 'text-slate-900' : 'text-slate-900 dark:text-white'}>Denta</span>
      <span className={forceLight ? 'text-primary-600' : 'text-primary-600 dark:text-primary-400'}>CRM</span>
    </span>
  </div>
);

export default Logo;
