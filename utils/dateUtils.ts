/**
 * Formats a date object to YYYY-MM-DD using local timezone components
 * to avoid timezone shift issues.
 */
export const formatDateToISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * 'YYYY-MM-DD' satrini 'DD.MM.YYYY' ko'rinishida qaytaradi.
 * new Date() ISHLATILMAYDI — UTC/lokal zona siljishi bo'lmaydi (tug'ilgan sana bug fix).
 */
export const formatDobDDMMYYYY = (dob?: string): string => {
    if (!dob) return '';
    const parts = dob.split('T')[0].split('-');
    if (parts.length !== 3) return dob;
    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
};

/**
 * Tug'ilgan sanadan yoshni hisoblaydi — faqat satr parchalari orqali (Date/UTC siljishisiz).
 */
export const calcAge = (dob?: string): number | null => {
    if (!dob) return null;
    const parts = dob.split('T')[0].split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [year, month, day] = parts;
    const now = new Date();
    let age = now.getFullYear() - year;
    if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) {
        age -= 1;
    }
    return age;
};

/**
 * Returns the first day of the current month and today's date in YYYY-MM-DD format.
 */
export const getCurrentMonthRange = () => {
    const now = new Date();
    // Use local time to get the 1st of the month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
        startDate: formatDateToISO(start),
        endDate: formatDateToISO(now)
    };
};

/**
 * Sarlavhadagi bugungi sana.
 *
 * `toLocaleDateString('uz-UZ', …)` brauzerlarda "2026 M09 10, Thu" beradi:
 * oy raqam kodi bo'lib qoladi, hafta kuni esa inglizcha. Shuning uchun
 * nomlar qo'lda yoziladi — natija ikkala tilda ham qisqa va o'qiladigan.
 */
const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS_UZ = ['yak', 'dush', 'sesh', 'chor', 'pay', 'jum', 'shan'];
const WEEKDAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const formatHeaderDate = (lang: string, date: Date = new Date()): string => {
    const day = date.getDate();
    const month = date.getMonth();
    const weekday = date.getDay();
    return lang === 'ru'
        ? `${day} ${MONTHS_RU[month]}, ${WEEKDAYS_RU[weekday]}`
        : `${day}-${MONTHS_UZ[month]}, ${WEEKDAYS_UZ[weekday]}`;
};
