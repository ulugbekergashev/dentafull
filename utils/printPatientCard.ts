import { Patient, Clinic, Doctor, PatientDiagnosis, ToothStatus } from '../types';
import { calcAge } from './dateUtils';

// Bemor kartasi (vipiska) — karta_namuna.html asosida, bemor ketayotganda chop etiladi.
// Yangi oynada ochiladi va avtomatik print dialogini chaqiradi.

interface ToothInfo {
    number: number;
    conditions: ToothStatus[];
    notes?: string;
}

interface ProcedureInfo {
    serviceName: string;
    date: string;
    toothNumber?: number;
}

interface PrintCardParams {
    patient: Patient;
    clinic?: Clinic;
    doctor?: Doctor;
    teeth: ToothInfo[];
    diagnoses: PatientDiagnosis[];
    procedures: ProcedureInfo[];
}

const STATUS_RU: Record<string, string> = {
    [ToothStatus.HEALTHY]: 'Здоров',
    [ToothStatus.CAVITY]: 'Кариес',
    [ToothStatus.FILLED]: 'Пломба',
    [ToothStatus.MISSING]: 'Отсутствует',
    [ToothStatus.CROWN]: 'Коронка',
    [ToothStatus.PULPITIS]: 'Пульпит',
    [ToothStatus.PERIODONTITIS]: 'Периодонтит',
    [ToothStatus.ABSCESS]: 'Абсцесс',
    [ToothStatus.PHLEGMON]: 'Флегмона',
    [ToothStatus.OSTEOMYELITIS]: 'Остеомиелит',
    [ToothStatus.ADENTIA]: 'Адентия',
    [ToothStatus.IMPLANT]: 'Имплант',
};

const UPPER_FDI = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_FDI = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
// Yoy (arch) shakli uchun vertikal siljishlar — chetki tishlar pastroq/yuqoriroq
const ARCH_OFFSETS = [15.9, 11.9, 8.5, 5.7, 3.4, 1.7, 0.5, 0, 0, 0.5, 1.7, 3.4, 5.7, 8.5, 11.9, 15.9];

const esc = (s: string | undefined | null): string =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (iso?: string): string => {
    if (!iso) return '';
    const [y, m, d] = iso.split('T')[0].split('-');
    return y && m && d ? `${d}.${m}.${y}` : iso;
};

// Kasal/holatli tish — sxemada kulrang bo'yaladi
const hasIssue = (t?: ToothInfo): boolean =>
    !!t && ((t.conditions || []).some(c => c !== ToothStatus.HEALTHY) || !!t.notes?.trim());

function teethSvg(teeth: ToothInfo[]): string {
    const byNumber = new Map(teeth.map(t => [t.number, t]));
    const toothRect = (fdi: number, x: number, y: number, labelY: number): string => {
        const fill = hasIssue(byNumber.get(fdi)) ? '#c9c9c9' : '#fff';
        return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="15" height="19" rx="5" fill="${fill}" stroke="#000" stroke-width="1"/>` +
            `<text x="${(x + 7.5).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#000">${fdi}</text></g>`;
    };

    let upper = '';
    let lower = '';
    for (let i = 0; i < 16; i++) {
        const x = 6 + i * 19.53;
        const upY = 30.1 + ARCH_OFFSETS[i];
        const loY = 23.9 - ARCH_OFFSETS[i];
        upper += toothRect(UPPER_FDI[i], x, upY, upY - 3);
        lower += toothRect(LOWER_FDI[i], x, loY, loY + 28);
    }

    return `<svg class="dcard-teeth" viewBox="0 0 320 130" width="100%" height="130">` +
        `<g>${upper}</g>` +
        `<line x1="6" y1="66" x2="314" y2="66" stroke="#000" stroke-width="0.6" stroke-dasharray="3 3"/>` +
        `<g transform="translate(0,72)">${lower}</g></svg>`;
}

export function printPatientCard({ patient, clinic, doctor, teeth, diagnoses, procedures }: PrintCardParams): void {
    const todayIso = new Date().toISOString().split('T')[0];
    const age = calcAge(patient.dob);

    const problemTeeth = teeth
        .filter(hasIssue)
        .sort((a, b) => a.number - b.number);

    const teethRows = problemTeeth.length > 0
        ? problemTeeth.map(t => {
            const labels = (t.conditions || []).filter(c => c !== ToothStatus.HEALTHY).map(c => STATUS_RU[c] || c);
            const text = [labels.join(', '), t.notes?.trim()].filter(Boolean).join(' — ');
            return `<tr><td class="num">${t.number}</td><td>${esc(text) || '&nbsp;'}</td></tr>`;
        }).join('')
        : `<tr><td class="num">—</td><td class="dcard-empty">Патологий не отмечено</td></tr>`;

    const complaints = problemTeeth
        .filter(t => t.notes?.trim())
        .map(t => `Зуб ${t.number}: ${t.notes!.trim()}`)
        .join('; ');

    const activeDiagnoses = diagnoses
        .filter(d => d.status !== 'Resolved')
        .map(d => [d.code, d.icd10?.name].filter(Boolean).join(' — '))
        .join('; ');

    const treatment = procedures
        .slice(-6)
        .map(p => `${p.serviceName}${p.toothNumber ? ` (зуб ${p.toothNumber})` : ''}`)
        .join('; ');

    const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : '';
    const contact = [patient.address, patient.phone].filter(Boolean).join(' / ');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Карта — ${esc(patient.lastName)} ${esc(patient.firstName)}</title>
<style>@page { size: A4; margin: 8mm; } body { background:#fff; margin:0; }
.dcard { font-family: 'Segoe UI', Arial, sans-serif; color: #000; background: #fff;
   width: 190mm; padding: 6mm 8mm; box-sizing: border-box; font-size: 10.5pt; line-height: 1.45; margin: 0 auto; }
.dcard * { box-sizing: border-box; }
.dcard-head { display: flex; align-items: flex-start; justify-content: space-between;
   border-bottom: 2px solid #000; padding-bottom: 3mm; margin-bottom: 4mm; }
.dcard-title { font-size: 15pt; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; margin: 0; }
.dcard-sub { font-size: 9pt; color: #444; margin: 1mm 0 0; }
.dcard-clinic { font-size: 9.5pt; font-weight: 700; text-align: right; white-space: nowrap; }
.dcard-clinic span { display: block; font-weight: 400; color: #444; font-size: 8.5pt; }
.dcard-row { margin-bottom: 2.2mm; }
.dcard-lbl { font-weight: 700; }
.dcard-val { border-bottom: 1px solid #000; display: inline-block; min-width: 30mm; padding: 0 1.5mm; }
.dcard-val.wide { display: block; min-height: 5.2mm; }
.dcard-cols { display: flex; gap: 5mm; margin: 3mm 0; align-items: flex-start; }
.dcard-col { flex: 1; min-width: 0; }
.dcard-sect { font-weight: 700; margin-bottom: 1.5mm; }
.dcard-box { border: 1px solid #000; min-height: 26mm; padding: 1.5mm 2mm; white-space: pre-wrap; word-break: break-word; }
.dcard-table { width: 100%; border-collapse: collapse; margin-top: 1.5mm; }
.dcard-table th, .dcard-table td { border: 1px solid #000; padding: 1.2mm 2mm; font-size: 9.5pt; text-align: left; vertical-align: top; }
.dcard-table th { background: #f0f0f0; font-weight: 700; }
.dcard-table td.num { width: 18mm; text-align: center; font-weight: 700; }
.dcard-foot { display: flex; justify-content: space-between; gap: 8mm; margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #000; }
.dcard-sign { flex: 1; }
.dcard-sign .line { border-bottom: 1px solid #000; height: 7mm; margin-top: 1mm; }
.dcard-sign .cap { font-size: 8pt; color: #444; margin-top: 1mm; }
.dcard-empty { color: #666; }
.dcard-teeth text { font-family: 'Segoe UI', Arial, sans-serif; }
</style></head><body>
<div class="dcard">
 <div class="dcard-head">
  <div><h1 class="dcard-title">Стоматологическая карта пациента</h1>
   <p class="dcard-sub">(Выписка при посещении)</p></div>
  <div class="dcard-clinic">${esc(clinic?.name) || 'Klinika'}<span>${esc(clinic?.phone)}</span></div>
 </div>
 <div class="dcard-row"><span class="dcard-lbl">1. ФИО пациента:</span> <span class="dcard-val" style="min-width:110mm">${esc(patient.lastName)} ${esc(patient.firstName)}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">2. Дата рождения:</span> <span class="dcard-val">${fmtDate(patient.dob) || '&nbsp;'}</span> <span class="dcard-lbl">Возраст:</span> <span class="dcard-val" style="min-width:18mm">${age ?? '&nbsp;'}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">3. Адрес / Контактный номер:</span> <span class="dcard-val" style="min-width:105mm">${esc(contact) || '&nbsp;'}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">4. Дата приёма:</span> <span class="dcard-val">${fmtDate(todayIso)}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">5. Жалобы пациента:</span><span class="dcard-val wide">${esc(complaints) || '&nbsp;'}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">6. Анамнез (кратко):</span><span class="dcard-val wide">${esc(patient.medicalHistory) || '&nbsp;'}</span></div>
 <div class="dcard-cols">
  <div class="dcard-col"><div class="dcard-sect">7. Объективный осмотр</div>
   <div class="dcard-box"></div></div>
  <div class="dcard-col"><div class="dcard-sect">8. Схема зубов (FDI)</div>
   ${teethSvg(teeth)}</div>
 </div>
 <div class="dcard-sect">9. Сведения по зубам</div>
 <table class="dcard-table"><thead><tr><th style="width:18mm;text-align:center">№ зуба</th><th>Жалобы / диагноз</th></tr></thead>
 <tbody>${teethRows}</tbody></table>
 <div class="dcard-cols">
  <div class="dcard-col"><div class="dcard-sect">10. Диагноз</div>
   <div class="dcard-box" style="min-height:18mm">${esc(activeDiagnoses)}</div></div>
  <div class="dcard-col"><div class="dcard-sect">11. Назначенное лечение</div>
   <div class="dcard-box" style="min-height:18mm">${esc(treatment)}</div></div>
 </div>
 <div class="dcard-foot">
  <div class="dcard-sign"><span class="dcard-lbl">Врач: ${esc(doctorName)}</span><div class="line"></div><div class="cap">Подпись</div></div>
  <div class="dcard-sign" style="max-width:55mm"><span class="dcard-lbl">Дата: ${fmtDate(todayIso)}</span><div class="line"></div><div class="cap">Подпись пациента</div></div>
 </div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
        alert("Chop etish oynasi ochilmadi. Brauzerda pop-up bloklangan bo'lishi mumkin.");
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
}
