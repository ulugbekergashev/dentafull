import { Service } from '../types';

/**
 * Qabul izohidan (Appointment.notes) bajarilgan ishlar summasi va to'lov yozuvidagi ko'rinishdagi
 * ro'yxat ("Nom|narx||...||TOTAL|jami"). Bemor kartasi ham, Bemorlar sahifasidagi "To'lov
 * kutilmoqda" sanog'i ham shu bitta qoidadan foydalanadi (ilgari sahifa boshqacha sanardi).
 *
 * Izoh qatorlari: "- Plomba (Tish #16) [300 000 UZS]" — narxi bilan, dastur o'zi yozadi.
 * Narxsiz qator faqat "Bajarilgan ishlar:" / "Qo'shimcha (...)" sarlavhasi OSTIDAGI "- " bandi bo'lsa
 * narxnomadan topiladi (eski yozuvlar).
 *
 * Klinika (2026-10-02): qabulga yozishda qo'lda yozilgan izoh ("Periodontit Endodontiya ... 48" — reja)
 * ilgari xizmat nomi uchragani uchun bajarilgan ish deb pulga qo'shilardi: 420 000 o'rniga 750 000.
 * Erkin matn endi hech qachon summaga kirmaydi (serverdagi parseAppointmentWorks ham faqat narxli qatorni oladi).
 */
export function calculateAppointmentTotal(appointmentNotes: string, services: Service[]): { total: number; breakdown: string } {
    if (!appointmentNotes) return { total: 0, breakdown: '' };

    try {
        const sortedServices = [...(services || [])].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
        let total = 0;
        const procedures: string[] = [];
        const lines = appointmentNotes.split('\n');
        // Dastur yozgan ishlar bloki ichidamizmi ("Bajarilgan ishlar:" yoki "Qo'shimcha (11:21:54):" dan keyin)
        let inWorks = false;

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            if (trimmedLine.includes('Bajarilgan ishlar:') || trimmedLine.startsWith("Qo'shimcha")) {
                inWorks = true;
                return;
            }
            // Xizmat emas, izoh ("⚠️ Majburiy talablarsiz yakunlandi ... Sabab: ...") —
            // sababda xizmat nomi uchrasa ham narxi qo'shilmasin (denta7)
            if (trimmedLine.startsWith('⚠')) {
                return;
            }

            // 1. Narx qavs ichida [100 000 UZS]
            const priceMatch = trimmedLine.match(/\[([\d\s ]+)\s*UZS\]/i);
            if (priceMatch) {
                const priceStr = priceMatch[1].replace(/[\s ]/g, '');
                const price = parseFloat(priceStr);
                if (!isNaN(price)) {
                    total += price;
                    const nameMatch = trimmedLine.match(/^-\s*(.*?)\s*\[/);
                    const name = nameMatch ? nameMatch[1].trim() : trimmedLine;
                    procedures.push(`${name}|${price.toLocaleString().replace(/,/g, ' ')}`);
                    return;
                }
            }

            // 2. Eski format: ishlar blokidagi narxsiz "- " bandi — xizmat nomi narxnomadan.
            //    Blokdan tashqaridagi erkin matn (qabul izohi, reja) hisobga olinmaydi
            if (!inWorks || !trimmedLine.startsWith('- ')) return;
            const item = trimmedLine.substring(2).trim();
            const itemLower = item.toLowerCase();
            const service = sortedServices.find(s => s.name && itemLower.includes(s.name.toLowerCase()));
            if (service) {
                total += service.price;
                procedures.push(`${service.name}|${service.price.toLocaleString().replace(/,/g, ' ')}`);
            } else {
                procedures.push(`${item}|0`);
            }
        });

        const breakdown = procedures.join('||') + (procedures.length > 0 ? `||TOTAL|${total.toLocaleString().replace(/,/g, ' ')}` : '');
        return { total, breakdown };
    } catch (e) {
        console.error('Error calculating total', e);
        return { total: 0, breakdown: '' };
    }
}
