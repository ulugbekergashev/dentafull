import { Transaction, Doctor, Service } from '../types';

export interface DoctorFinancials {
    grossRevenue: number;
    technicianCosts: number;
    netRevenue: number;
    doctorSalary: number;
}

export interface TotalFinancials {
    technicianCosts: number;
    doctorSalaries: number;
    netProfit: number;
}

/**
 * Calculate financial breakdown for a specific doctor
 * Used in DoctorsAnalytics to show per-doctor metrics
 */
export function calculateDoctorSalary(
    transactions: Transaction[],
    doctor: Doctor,
    services: { name: string; price: number; cost: number; duration: number }[]
): DoctorFinancials {
    let grossRevenue = 0;
    let technicianCosts = 0;
    let netRevenue = 0;
    let doctorSalary = 0;

    const hasPercentage = doctor.percentage && doctor.percentage > 0;

    transactions.forEach(tx => {
        grossRevenue += tx.amount;

        // Find service to get cost
        const txService = tx.service.trim().toLowerCase();
        const service = services.find(s => s.name.trim().toLowerCase() === txService);

        const servicePrice = service?.price || tx.amount;
        const serviceCost = service?.cost || 0;

        // Calculate proportional cost
        const ratio = servicePrice > 0 ? Math.min(tx.amount / servicePrice, 1) : 1;
        const allocatedCost = serviceCost * ratio;

        const txNetRevenue = tx.amount - allocatedCost;
        netRevenue += txNetRevenue;
        technicianCosts += allocatedCost;

        if (hasPercentage) {
            const percentage = doctor.percentage || 0;
            doctorSalary += Math.max(0, txNetRevenue * (percentage / 100));
        }
    });

    return {
        grossRevenue,
        technicianCosts,
        netRevenue,
        doctorSalary
    };
}

/**
 * Calculate total financial breakdown across all transactions
 * Used in Finance module to show clinic-wide metrics
 */
export function calculateTotalFinancials(
    transactions: Transaction[],
    doctors: Doctor[],
    services: { name: string; price: number; cost: number; duration: number }[]
): TotalFinancials {
    let technicianCosts = 0;
    let doctorSalaries = 0;

    // Detect single doctor mode
    const hasSingleDoctor = doctors.length === 1;
    const singleDoctor = hasSingleDoctor ? doctors[0] : null;

    transactions.forEach(tx => {
        // Calculate technician cost
        const txService = tx.service.trim().toLowerCase();
        const service = services.find(s => s.name.trim().toLowerCase() === txService);

        const servicePrice = service?.price || tx.amount;
        const serviceCost = service?.cost || 0;
        const ratio = servicePrice > 0 ? Math.min(tx.amount / servicePrice, 1) : 1;
        const allocatedCost = serviceCost * ratio;
        technicianCosts += allocatedCost;

        // Find doctor for this transaction
        let doctor = doctors.find(d => d.id === tx.doctorId) ||
            doctors.find(d => {
                const docName = `${d.lastName} ${d.firstName}`.toLowerCase();
                const txDocName = (tx.doctorName || '').toLowerCase();
                return docName === txDocName || docName.includes(txDocName) || txDocName.includes(docName);
            });

        // FORCE ASSIGNMENT if single doctor and no match found (or even if match found, to be safe)
        // Actually, if it's single doctor, ALL revenue goes to them regardless of transaction metadata
        if (hasSingleDoctor) {
            doctor = singleDoctor!;
        }

        // Calculate doctor salary
        if (doctor && doctor.percentage > 0) {
            const netRevenue = tx.amount - allocatedCost;
            doctorSalaries += Math.max(0, netRevenue * (doctor.percentage / 100));
        }
    });

    const totalRevenue = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const netProfit = totalRevenue - technicianCosts - doctorSalaries;

    return {
        technicianCosts,
        doctorSalaries,
        netProfit
    };
}
