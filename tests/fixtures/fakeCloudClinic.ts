// Sun'iy bulut klinikasi + eksport moduli uchun soxta Prisma (faqat eksport ishlatadigan so'rovlar).
// tests/run.mjs faqat *.test.ts ni ishga tushiradi — bu fayl test emas, ma'lumot.
const C = 'cloud-clinic-1';
const d = (s: string) => new Date(s);

export const dataset: Record<string, any[]> = {
    clinic: [{
        id: C, name: 'Smile Dent', adminName: 'Ali Valiyev', phone: '+998901112233', address: 'Toshkent', email: 'a@b.uz',
        ownerPhone: '+998901112233', startHour: 9, endHour: 19, enableReceipts: true, accessControl: '{"v":1}', cashShiftsPerDay: 1,
        username: 'smiledent', password: '$2a$10$secret', botToken: '123:AAA', aiApiKey: 'sk-secret', eskizEmail: 'x', status: 'Active',
    }],
    serviceCategory: [
        { id: 'cat-ter', clinicId: C, name: 'Terapiya' },
        { id: 'cat-ort', clinicId: C, name: 'Ortopediya' },
    ],
    service: [
        { id: 1, clinicId: C, name: 'Plomba', price: 300000, duration: 30, categoryId: 'cat-ter', cost: 0, snomedCode: '123' },
        { id: 2, clinicId: C, name: 'Koronka', price: 1500000, duration: 60, categoryId: 'cat-ort', cost: 200000, snomedCode: null },
    ],
    doctor: [
        { id: 'doc-1', clinicId: C, firstName: 'Bobur', lastName: 'Karimov', specialty: 'Terapevt', phone: '+998900000001', email: '', status: 'Active', percentage: 30, salaryType: 'fixed', fixedSalary: 5000000, startHour: 9, endHour: 18, username: 'Bobur.K', password: '$2a$10$hash1', pinfl: '12345678901234', argosId: 'A1' },
        { id: 'doc-2', clinicId: C, firstName: 'Nodira', lastName: 'Aliyeva', specialty: 'Ortoped', phone: '+998900000002', email: '', status: 'Active', percentage: 40, salaryType: 'kpi', startHour: null, endHour: null, username: '', password: null },
    ],
    receptionist: [
        { id: 'rec-1', clinicId: C, firstName: 'Admin', lastName: 'Bir', phone: '+998900000003', username: 'Admin1', password: '$2a$10$hash2', status: 'Active', telegramChatId: '999' },
    ],
    labTechnician: [
        { id: 'tech-1', clinicId: C, name: 'Zubtex', phone: '+998900000004', status: 'Active', username: null, password: null },
    ],
    patient: [
        { id: 'p1', clinicId: C, firstName: 'Vali', lastName: 'Aliyev', phone: '+998911111111', dob: '1990-01-01', gender: 'Male', status: 'Active', lastVisit: '2026-10-01', balance: 100000, doctorId: 'doc-1', avatarUrl: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', pinfl: '11111111111111', passport: 'AA1234567', telegramChatId: '555' },
        { id: 'p2', clinicId: C, firstName: 'Ali', lastName: 'Rustamov', phone: '+998922222222', dob: '1985-05-05', gender: 'Male', status: 'Active', lastVisit: 'Never', balance: 0, doctorId: 'doc-deleted' },
        { id: 'p3', clinicId: C, firstName: 'Ali', lastName: 'Rustamov', phone: '+998933333333', dob: '1980-02-02', gender: 'Male', status: 'Active', lastVisit: 'Never', balance: 0, doctorId: null },
        { id: 'p4', clinicId: C, firstName: 'Nigora', lastName: 'Karimova', phone: '+998944444444', dob: '1995-03-03', gender: 'Female', status: 'Active', lastVisit: '2026-09-20', balance: 0, doctorId: 'doc-2' },
    ],
    iCD10Code: [{ code: 'K02.1', name: 'Dentin kariesi' }],
    patientDiagnosis: [{ id: 'dg-1', clinicId: C, patientId: 'p1', code: 'K02.1', date: '2026-10-01', notes: '', visitId: 'visit-x' }],
    toothData: [
        { id: 10, patientId: 'p1', number: 16, conditions: '["Filled"]' },
        { id: 11, patientId: 'p4', number: 36, conditions: '["Crown"]' },
    ],
    patientPhoto: [{ id: 'ph-1', patientId: 'p1', url: 'https://res.cloudinary.com/x/image/upload/v1/xray.jpg', category: 'X-Ray', date: d('2026-10-01T08:00:00Z'), createdAt: d('2026-10-01T08:00:00Z') }],
    appointment: [
        { id: 'a1', clinicId: C, patientId: 'p1', patientName: 'Aliyev Vali', doctorId: 'doc-1', doctorName: 'Dr. Karimov Bobur', date: '2026-10-01', time: '10:00', duration: 30, type: 'Davolash', status: 'Completed', notes: "Bajarilgan ishlar:\n- Plomba (Tish #16) [300 000 UZS]", sentToCashierAt: null, bookedAt: d('2026-09-30T10:00:00Z') },
        { id: 'a2', clinicId: C, patientId: 'p4', patientName: 'Karimova Nigora', doctorId: 'doc-2', doctorName: 'Dr. Aliyeva Nodira', date: '2026-09-20', time: '11:00', duration: 60, type: 'Ortopediya', status: 'Completed', notes: "Bajarilgan ishlar:\n- Koronka (Tish #36) [1 500 000 UZS]" },
    ],
    transaction: [
        // p1: 300k plomba — 100k to'lab, 200k qarz (isDebt), keyin 50k qarz yopilgan (forDate saqlangan)
        { id: 't1', clinicId: C, patientId: 'p1', patientName: 'Aliyev Vali', doctorId: 'doc-1', doctorName: 'Dr. Karimov Bobur', date: '2026-10-01', amount: 100000, type: 'Cash', service: "Plomba|300 000||TOTAL|300 000 (Qisman to'lov)", status: 'Paid', discountAmount: 0, discountPercent: 0, isDebt: false, forDate: null, createdAt: d('2026-10-01T09:00:00Z') },
        { id: 't2', clinicId: C, patientId: 'p1', patientName: 'Aliyev Vali', doctorId: 'doc-1', doctorName: 'Dr. Karimov Bobur', date: '2026-10-01', amount: 150000, type: 'Cash', service: 'Plomba|300 000||TOTAL|300 000 (Qarz)', status: 'Pending', discountAmount: 0, discountPercent: 0, isDebt: true, forDate: null },
        { id: 't3', clinicId: C, patientId: 'p1', patientName: 'Aliyev Vali', doctorId: 'doc-1', doctorName: 'Dr. Karimov Bobur', date: '2026-10-05', amount: 50000, type: 'UzcardTerminal', service: 'Plomba|300 000||TOTAL|300 000 (Qarz) (Qarzdorlik yopildi)', status: 'Paid', isDebt: false, forDate: '2026-10-01' },
        // p1: avans 100k (balance)
        { id: 't4', clinicId: C, patientId: 'p1', patientName: 'Aliyev Vali', doctorId: '', date: '2026-10-01', amount: 100000, type: 'Cash', service: 'Avans', status: 'Paid', isDebt: false },
        // p4: belgisiz eski qarz (legacy) + muddati o'tgan
        { id: 't5', clinicId: C, patientId: 'p4', patientName: 'Karimova Nigora', doctorId: 'doc-2', date: '2026-09-20', amount: 500000, type: 'Cash', service: 'Koronka', status: 'Pending', isDebt: false },
        { id: 't6', clinicId: C, patientId: 'p4', patientName: 'Karimova Nigora', doctorId: 'doc-2', date: '2026-08-01', amount: 70000, type: 'Cash', service: 'Konsultatsiya', status: 'Overdue', isDebt: false },
        // bemor id siz eski qarz — yagona "Karimova Nigora" ga qo'shiladi
        { id: 't7', clinicId: C, patientId: null, patientName: 'Karimova Nigora', doctorId: 'doc-2', date: '2026-07-01', amount: 30000, type: 'Cash', service: 'Plomba', status: 'Pending', isDebt: false },
        // bemor id siz, ismi ikki bemorda — alohida qator (hech kimga qo'shilmaydi)
        { id: 't8', clinicId: C, patientId: null, patientName: 'Rustamov Ali', doctorId: 'doc-2', date: '2026-07-02', amount: 40000, type: 'Cash', service: 'Plomba', status: 'Pending', isDebt: false },
        // bo'lib to'lash: boshlang'ich to'lov va marker
        { id: 't9', clinicId: C, patientId: 'p4', patientName: 'Karimova Nigora', doctorId: 'doc-2', date: '2026-09-20', amount: 500000, type: 'Card', service: "Bo'lib to'lash (Koronka) — boshlang'ich to'lov", status: 'Paid', forDate: '2026-09-20' },
        { id: 't10', clinicId: C, patientId: 'p2', patientName: 'Rustamov Ali', doctorId: 'doc-2', date: '2026-09-21', amount: 0, type: 'Cash', service: "Koronka (Bo'lib to'lashga o'tkazildi)", status: 'Paid' },
        // avansdan to'lov, yangi to'lov usuli
        { id: 't11', clinicId: C, patientId: 'p1', patientName: 'Aliyev Vali', doctorId: 'doc-1', date: '2026-10-02', amount: 20000, type: 'Balance', service: 'Konsultatsiya', status: 'Paid' },
        { id: 't12', clinicId: C, patientId: 'p2', patientName: 'Rustamov Ali', doctorId: 'doc-deleted', date: '2026-10-03', amount: 80000, type: 'CashCollection', service: 'Konsultatsiya', status: 'Pending' },
    ],
    installmentPlan: [
        { id: 'plan-1', clinicId: C, patientId: 'p4', doctorId: 'doc-2', service: 'Koronka', totalAmount: 1500000, totalPaid: 500000, startDate: '2026-09-20', endDate: '2026-12-20', status: 'Active' },
        { id: 'plan-2', clinicId: C, patientId: 'p2', doctorId: null, service: 'Koronka', totalAmount: 900000, totalPaid: 900000, startDate: '2026-06-01', endDate: '2026-08-01', status: 'Completed' },
    ],
    installmentItem: [
        { id: 'it-1', planId: 'plan-1', expectedDate: '2026-10-20', amount: 500000, status: 'Pending', paidDate: null, transactionId: null },
        { id: 'it-2', planId: 'plan-1', expectedDate: '2026-11-20', amount: 500000, status: 'Pending', paidDate: null, transactionId: null },
    ],
    labOrder: [{ id: 'lab-1', clinicId: C, technicianId: 'tech-1', patientName: 'Karimova Nigora', doctorName: 'Dr. Aliyeva Nodira', workType: 'Koronka', price: 200000, status: 'Delivered', orderedAt: d('2026-09-21T09:00:00Z'), deadline: '2026-09-28' }],
    expense: [
        { id: 'ex-1', clinicId: C, category: 'Lab', amount: 200000, date: '2026-09-28', description: 'Zubtex', labOrderId: 'lab-1', method: null, branchId: 'br-1' },
        { id: 'ex-2', clinicId: C, category: 'Salary', amount: 5000000, date: '2026-10-01', description: 'Oylik', doctorId: 'doc-1', method: 'Cash' },
    ],
    cashRegisterDay: [{ id: 'crd-1', clinicId: C, date: '2026-10-01', shift: 1, expectedCash: 100000, countedCash: 100000, handedOver: 0, closedAt: d('2026-10-01T18:00:00Z'), closedByName: 'Admin', shiftStart: 'x', shiftEnd: 'y' }],
    cashMovement: [{ id: 'cm-1', clinicId: C, date: '2026-10-01', type: 'Encashment', amount: 50000, method: 'Cash', note: '', createdAt: d('2026-10-01T17:00:00Z'), createdByName: 'Admin' }],
    cashAuditLog: [{ id: 'ca-1', clinicId: C, date: '2026-10-01', action: 'Close', entityType: 'CashRegisterDay', entityId: 'crd-1', summary: 'Yopildi', afterClose: false, createdAt: d('2026-10-01T18:00:00Z'), userName: 'Admin' }],
    recall: [{ id: 'rc-1', clinicId: C, patientId: 'p1', doctorId: 'doc-1', dueDate: '2027-04-01', kind: 'checkup', status: 'planned', note: '' }],
    inventoryItem: [{ id: 'inv-1', clinicId: C, name: 'Kompozit', unit: 'dona', quantity: 10, minQuantity: 2, price: 50000 }],
    inventoryLog: [{ id: 'il-1', itemId: 'inv-1', type: 'OUT', quantity: 1, patientId: 'p1', date: d('2026-10-01T10:00:00Z'), cost: 50000 }],
};

const matches = (row: any, where: any): boolean => Object.entries(where || {}).every(([k, v]: [string, any]) => {
    if (k === 'patient') return dataset.patient.some(p => p.id === row.patientId && p.clinicId === v.clinicId);
    if (k === 'plan') return dataset.installmentPlan.some(p => p.id === row.planId && p.clinicId === v.clinicId);
    if (k === 'item') return dataset.inventoryItem.some(p => p.id === row.itemId && p.clinicId === v.clinicId);
    if (v && typeof v === 'object' && Array.isArray(v.in)) return v.in.includes(row[k]);
    return row[k] === v;
});

export const fakePrisma: any = new Proxy({}, {
    get: (_t, model: string) => ({
        findMany: async ({ where }: any = {}) => (dataset[model] || []).filter(r => matches(r, where)).map(r => ({ ...r })),
        findUnique: async ({ where }: any) => (dataset[model] || []).find(r => r.id === where.id) || null,
    }),
});
