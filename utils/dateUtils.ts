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
