import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button, Modal } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { tLabel } from '../i18n/labels';
import { isDemoMode } from '../services/api';
import { formatDateToISO, formatDobDDMMYYYY } from '../utils/dateUtils';
import { IMPORT_ERRORS, downloadRowsAsXlsx, readImportFile, runImport } from '../services/patientImport';
import {
    ColumnMapping, EMPTY_TOTALS, ImportField, ImportTable, ImportTotals, MAX_FILE_ROWS, NameOrder, PreparedRow, SheetData,
    autoMapColumns, buildTable, cellText, detectNameOrder, isMappingReady, prepareRows, problemRowsSheet, rowLabel, sheetsCompatible,
} from '../utils/patientImportParse';

interface PatientImportModalProps {
    onClose: () => void;
    /** Bemorlar qo'shildi (yuklash tugadi yoki yarmida to'xtab, oyna yopildi) — ro'yxatni yangilash uchun */
    onImported: (created: number) => void;
}

type Step = 1 | 2 | 3 | 4;
type SheetChoice = 'all' | number;
type Tone = 'success' | 'neutral' | 'warning';
interface RunState { status: 'idle' | 'running' | 'done' | 'error'; totals: ImportTotals; error: string }
interface Problem { row: PreparedRow; reason: string }

const IDLE: RunState = { status: 'idle', totals: EMPTY_TOTALS, error: '' };
const FIELD_ORDER: ImportField[] = ['fullName', 'phone', 'lastName', 'firstName', 'secondaryPhone', 'dob', 'gender', 'address', 'note'];
const PROBLEMS_SHOWN = 50;
const PREVIEW_ROWS = 3;
const NAME_ORDER_SAMPLE = 200;
const ACCEPTED_FILES = '.xlsx,.xls,.csv';
const NO_PATIENTS_ERROR = 'Faylda bemorlar topilmadi';
const SELECT_CLASS = 'w-full h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 outline-none';
const TONE_CLASS: Record<Tone, string> = {
    success: 'border-success-200 bg-success-50 text-success-700 dark:border-success-700/40 dark:bg-success-700/10 dark:text-success-200',
    neutral: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200',
    warning: 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-700/40 dark:bg-warning-700/10 dark:text-warning-200',
};

const pickSheets = (sheets: SheetData[], choice: SheetChoice): SheetData[] => (choice === 'all' ? sheets : sheets.slice(choice, choice + 1));
/** Ustunlari bir xil varaqlar birga yuklanadi; aks holda eng ko'p qatorli varaq tanlanadi */
const defaultSheetChoice = (sheets: SheetData[]): SheetChoice => (sheets.length > 1 && sheetsCompatible(sheets)
    ? 'all'
    : sheets.reduce((best, sheet, i) => (sheet.rows.length > sheets[best].rows.length ? i : best), 0));
const guessNameOrder = (table: ImportTable, mapping: ColumnMapping): NameOrder => (mapping.fullName === undefined
    ? 'lastFirst'
    : detectNameOrder(table.rows.slice(0, NAME_ORDER_SAMPLE).map(r => cellText(r.cells[mapping.fullName as number]))));
const patientName = (row: PreparedRow): string => `${row.row.lastName || ''} ${row.row.firstName || ''}`.trim() || '—';

/** `step` qadamlar sonidan katta bo'lsa — hammasi bajarilgan */
const Stepper: React.FC<{ step: number; labels: string[] }> = ({ step, labels }) => (
    <ol className="flex items-center gap-2 mb-6">
        {labels.map((label, i) => {
            const done = i + 1 < step;
            const current = i + 1 === step;
            const dot = done ? 'bg-success text-white' : current ? 'bg-primary text-white ring-4 ring-primary-100 dark:ring-primary-900/50' : 'bg-gray-100 text-gray-400 dark:bg-gray-800';
            return (
                <li key={label} aria-current={current ? 'step' : undefined} className="flex items-center gap-2 flex-1 last:flex-none min-w-0">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${dot}`}>
                        {done ? <Check className="w-4 h-4" /> : i + 1}
                    </span>
                    <span className={`text-xs font-semibold ${current ? 'shrink-0 text-gray-900 dark:text-white' : 'hidden sm:inline truncate text-gray-400'}`}>{label}</span>
                    {i + 1 < labels.length && <span className={`h-0.5 flex-1 min-w-3 rounded-full transition-colors duration-500 ${done ? 'bg-success' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </li>
            );
        })}
    </ol>
);

const Progress: React.FC<{ done: number; total: number; label: string; hint?: string }> = ({ done, total, label, hint }) => {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div className="py-8 text-center animate-fade-in">
            <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</p>
            <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-4 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${Math.max(percent, 4)}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-500 tabular-nums" data-testid="import-progress">{done} / {total}</p>
            {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
    );
};

const StatTile: React.FC<{ id: string; value: number; label: string; hint: string; tone: Tone }> = ({ id, value, label, hint, tone }) => (
    <div className={`rounded-xl border p-4 ${TONE_CLASS[tone]}`}>
        <p className="text-3xl font-extrabold tabular-nums leading-none" data-testid={`import-stat-${id}`}>{value}</p>
        <p className="mt-2 text-sm font-semibold">{label}</p>
        <p className="text-xs opacity-75">{hint}</p>
    </div>
);

const ErrorBox: React.FC<{ message: string; children?: React.ReactNode }> = ({ message, children }) => (
    <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 dark:border-danger-700/40 dark:bg-danger-700/10 p-4 animate-fade-in">
        <p className="flex items-start gap-2 text-sm font-medium text-danger-700 dark:text-danger-200">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{message}</span>
        </p>
        {children}
    </div>
);

export const PatientImportModal: React.FC<PatientImportModalProps> = ({ onClose, onImported }) => {
    const { t } = useLanguage();
    const [step, setStep] = useState<Step>(1);
    const [source, setSource] = useState<{ fileName: string; sheets: SheetData[] } | null>(null);
    const [sheetChoice, setSheetChoice] = useState<SheetChoice>(0);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [nameOrder, setNameOrder] = useState<NameOrder>('lastFirst');
    const [reading, setReading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [fileError, setFileError] = useState('');
    const [check, setCheck] = useState<RunState>(IDLE);
    const [load, setLoad] = useState<RunState>(IDLE);
    // Oyna yopilsa yoki orqaga qaytilsa, davom etayotgan tekshiruv to'xtaydi
    const runIdRef = useRef(0);
    useEffect(() => () => { runIdRef.current = -1; }, []);
    // Qadam almashganda fokus yo'qolib qolmasin (klaviatura va ekran o'quvchi yangi qadam boshidan davom etadi)
    const bodyRef = useRef<HTMLDivElement>(null);
    useEffect(() => { bodyRef.current?.focus(); }, [step, check.status, load.status]);

    const table = useMemo(() => buildTable(source ? pickSheets(source.sheets, sheetChoice) : []), [source, sheetChoice]);
    const prepared = useMemo(() => prepareRows(table, mapping, nameOrder), [table, mapping, nameOrder]);
    const payload = useMemo(() => prepared.rows.map(r => r.row), [prepared]);
    const importing = load.status === 'running';

    const fieldLabels: Record<ImportField, string> = {
        fullName: t("auto.F.I.O (to'liq ism)"), lastName: t('auto.Familiya'), firstName: t('auto.Ism'),
        phone: t('auto.Telefon'), secondaryPhone: t("auto.Qo'shimcha telefon"), dob: t("auto.Tug'ilgan sana"),
        gender: t('auto.Jins'), address: t('auto.Manzil'), note: t('auto.Izoh'),
    };
    const stepLabels = [t('auto.Fayl'), t('auto.Ustunlar'), t('auto.Tekshirish'), t('auto.Yuklash')];

    const applySheets = (sheets: SheetData[], choice: SheetChoice) => {
        const next = buildTable(pickSheets(sheets, choice));
        const auto = autoMapColumns(next);
        setSheetChoice(choice);
        setMapping(auto);
        setNameOrder(guessNameOrder(next, auto));
        return next;
    };

    const openFile = async (file: File | undefined) => {
        if (!file || reading) return;
        setReading(true);
        setFileError('');
        try {
            const sheets = await readImportFile(file);
            if (sheets.length === 0) throw new Error(NO_PATIENTS_ERROR);
            const next = applySheets(sheets, defaultSheetChoice(sheets));
            if (next.rows.length === 0) throw new Error(NO_PATIENTS_ERROR);
            if (next.rows.length > MAX_FILE_ROWS) throw new Error(IMPORT_ERRORS.tooBig);
            setSource({ fileName: file.name, sheets });
            setStep(2);
        } catch (e: any) {
            setFileError(e?.message || IMPORT_ERRORS.unreadable);
        } finally {
            setReading(false);
        }
    };

    const setField = (field: ImportField, value: string) => {
        // Bitta ustun — bitta maydon: boshqa maydonda tanlangan bo'lsa, u yerdan olinadi
        const others = Object.fromEntries(Object.entries(mapping).filter(([key, col]) => key !== field && String(col) !== value));
        const next: ColumnMapping = value === '' ? others : { ...others, [field]: Number(value) };
        setMapping(next);
        if (field === 'fullName') setNameOrder(guessNameOrder(table, next));
    };

    const run = async (dryRun: boolean, resumeFrom: ImportTotals = EMPTY_TOTALS) => {
        const setState = dryRun ? setCheck : setLoad;
        runIdRef.current += 1;
        const runId = runIdRef.current;
        // Faqat tekshiruv bekor qilinadi. Haqiqiy yuklash boshlangan bo'lsa oxirigacha boradi
        // (sahifadan chiqib ketilsa ham) — ro'yxat yarim yuklangan holda qolmasin.
        const isCancelled = () => dryRun && runIdRef.current !== runId;
        setState({ status: 'running', totals: resumeFrom, error: '' });
        try {
            const totals = await runImport(payload, dryRun, {
                resumeFrom, isCancelled,
                onProgress: progress => { if (!isCancelled()) setState({ status: 'running', totals: progress, error: '' }); },
            });
            if (isCancelled()) return;
            setState({ status: 'done', totals, error: '' });
            if (!dryRun && totals.created > 0) onImported(totals.created);
        } catch (e: any) {
            if (!isCancelled()) setState(prev => ({ status: 'error', totals: prev.totals, error: e?.message || IMPORT_ERRORS.failed }));
        }
    };

    const startCheck = () => { setStep(3); run(true); };
    const startLoad = () => { setStep(4); run(false); };
    const backToColumns = () => { runIdRef.current += 1; setCheck(IDLE); setStep(2); };
    const close = () => {
        if (importing) return; // yuklash paytida oyna yopilmaydi — yarmida qolmasin
        if (load.status === 'error' && load.totals.created > 0) onImported(load.totals.created);
        onClose();
    };

    const problemsOf = (totals: ImportTotals): Problem[] => totals.invalid
        .map(p => ({ row: prepared.rows[p.index], reason: tLabel(t, p.reason) }))
        .filter(p => !!p.row);
    const downloadProblems = (totals: ImportTotals) => downloadRowsAsXlsx(
        problemRowsSheet(table, problemsOf(totals), { row: t('auto.Qator'), reason: t('auto.Sabab') }, mapping.dob),
        `xato_qatorlar_${formatDateToISO(new Date())}.xlsx`, t('auto.Xato qatorlar'));
    const downloadSample = () => downloadRowsAsXlsx([
        [t('auto.Familiya'), t('auto.Ism'), t('auto.Telefon'), t("auto.Tug'ilgan sana"), t('auto.Jins'), t('auto.Manzil'), t('auto.Izoh')],
        ['Karimov', 'Aziz', '+998 90 123 45 67', '12.04.1985', t('auto.Erkak'), 'Toshkent sh., Chilonzor t.', ''],
        ['Karimova', 'Malika', '93 987 65 43', '23.08.1992', t('auto.Ayol'), '', ''],
    ], 'bemorlar_namuna.xlsx', t('auto.Bemorlar'));

    const columnLabel = (index: number): string => {
        const col = table.columns[index];
        const name = col.header || t('auto.{c} ustuni').replace('{c}', col.letter);
        return col.sample ? `${name} · ${col.sample}` : name;
    };

    const renderTiles = (totals: ImportTotals, done: boolean) => (
        <div className="grid grid-cols-3 gap-3" role="status">
            <StatTile id="add" tone="success" value={totals.created}
                label={done ? t("auto.Qo'shildi") : t("auto.Qo'shiladi")} hint={t('auto.yangi bemor')} />
            <StatTile id="existing" tone="neutral" value={totals.duplicates + prepared.repeated.length}
                label={done ? t("auto.Ro'yxatda bor edi") : t("auto.Ro'yxatda bor")}
                hint={done ? t("auto.o'tkazib yuborildi") : t("auto.o'tkazib yuboriladi")} />
            <StatTile id="problems" tone={totals.invalid.length > 0 ? 'warning' : 'neutral'} value={totals.invalid.length}
                label={t('auto.Xato qatorlar')} hint={done ? t("auto.qo'shilmadi") : t("auto.qo'shilmaydi")} />
        </div>
    );

    const renderProblems = (totals: ImportTotals) => {
        const problems = problemsOf(totals);
        if (problems.length === 0) return null;
        return (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-sm" data-testid="import-problems">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wider text-gray-500">
                            <tr><th className="px-3 py-2 w-24">{t('auto.Qator')}</th><th className="px-3 py-2">{t('auto.Bemor')}</th><th className="px-3 py-2">{t('auto.Sabab')}</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {problems.slice(0, PROBLEMS_SHOWN).map(p => (
                                <tr key={`${p.row.sheet}:${p.row.fileRow}`}>
                                    <td className="px-3 py-2 tabular-nums text-gray-500">{rowLabel(table, p.row)}</td>
                                    <td className="px-3 py-2 text-gray-900 dark:text-white">{patientName(p.row)}</td>
                                    <td className="px-3 py-2 text-warning-700 dark:text-warning-200">{p.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                    <span className="text-xs text-gray-500">
                        {problems.length > PROBLEMS_SHOWN
                            ? t('auto.Yana {n} ta xato qator bor').replace('{n}', String(problems.length - PROBLEMS_SHOWN))
                            : t("auto.Faylni tuzatib, qayta yuklash mumkin — bor bemorlar ikki marta qo'shilmaydi")}
                    </span>
                    <button type="button" onClick={() => downloadProblems(totals)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300">
                        <Download className="w-3.5 h-3.5" /> {t('auto.Xato qatorlarni yuklab olish')}
                    </button>
                </div>
            </div>
        );
    };

    const renderFileStep = () => (
        <div className="space-y-4 animate-fade-in">
            <label
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files?.[0]); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-all focus-within:ring-2 focus-within:ring-primary-500 ${dragging
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 scale-[1.01]'
                    : 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20 hover:bg-primary-100/60 dark:hover:bg-primary-900/30'}`}
            >
                <input type="file" accept={ACCEPTED_FILES} className="sr-only" disabled={reading}
                    onChange={e => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-gray-800 shadow-sm text-primary-500">
                    {reading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </span>
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {reading ? t("auto.Fayl o'qilmoqda...") : t('auto.Faylni shu yerga tashlang yoki tanlang')}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('auto.Excel (.xlsx, .xls) yoki CSV')}</span>
            </label>
            {fileError && <ErrorBox message={tLabel(t, fileError)} />}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                    {t("auto.Faylda bemorning ismi va telefon raqami bo'lishi kerak. Qolgan ustunlar ixtiyoriy.")}
                </p>
                <button type="button" onClick={downloadSample} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300">
                    <FileSpreadsheet className="w-4 h-4" /> {t('auto.Namuna faylni yuklab olish')}
                </button>
            </div>
        </div>
    );

    const renderColumnsStep = () => (
        <div className="space-y-4 animate-fade-in">
            <p className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-white">{source?.fileName}</span>
                {' — '}{t('auto.{n} ta qator').replace('{n}', String(table.rows.length))}.{' '}
                {t("auto.Qaysi ustunda nima yozilganini tekshiring.")}
            </p>
            {source && source.sheets.length > 1 && (
                <div>
                    <label htmlFor="import-sheet" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auto.Varaq')}</label>
                    <select id="import-sheet" className={SELECT_CLASS} value={String(sheetChoice)}
                        onChange={e => applySheets(source.sheets, e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                        {sheetsCompatible(source.sheets) && <option value="all">{t('auto.Barcha varaqlar')}</option>}
                        {source.sheets.map((sheet, i) => <option key={sheet.name} value={i}>{sheet.name}</option>)}
                    </select>
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELD_ORDER.map(field => (
                    <div key={field}>
                        <label htmlFor={`import-col-${field}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{fieldLabels[field]}</label>
                        <select id={`import-col-${field}`} className={SELECT_CLASS} value={mapping[field] === undefined ? '' : String(mapping[field])}
                            onChange={e => setField(field, e.target.value)}>
                            <option value="">— {t('auto.Tanlanmagan')} —</option>
                            {table.columns.map(col => <option key={col.index} value={col.index}>{columnLabel(col.index)}</option>)}
                        </select>
                    </div>
                ))}
            </div>
            {mapping.fullName !== undefined && (
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('auto.Faylda ism qanday yozilgan')}</span>
                    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" role="radiogroup" aria-label={t('auto.Faylda ism qanday yozilgan')}>
                        {(['lastFirst', 'firstLast'] as NameOrder[]).map(order => (
                            <button key={order} type="button" role="radio" aria-checked={nameOrder === order} onClick={() => setNameOrder(order)}
                                className={`px-3 h-9 text-xs font-bold transition-colors ${nameOrder === order ? 'bg-primary text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                                {order === 'lastFirst' ? t('auto.Familiya Ism') : t('auto.Ism Familiya')}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {isMappingReady(mapping) ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{t("auto.Bemorlar shunday qo'shiladi")}</p>
                    <table className="w-full text-left text-sm" data-testid="import-preview">
                        <thead className="text-xs text-gray-500">
                            <tr><th className="px-3 py-2">{t('auto.Familiya')}</th><th className="px-3 py-2">{t('auto.Ism')}</th><th className="px-3 py-2">{t('auto.Telefon')}</th><th className="px-3 py-2">{t("auto.Tug'ilgan sana")}</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-900 dark:text-white">
                            {prepared.rows.slice(0, PREVIEW_ROWS).map(r => (
                                <tr key={`${r.sheet}:${r.fileRow}`}>
                                    <td className="px-3 py-2">{r.row.lastName || '—'}</td><td className="px-3 py-2">{r.row.firstName || '—'}</td>
                                    <td className="px-3 py-2 tabular-nums">{r.row.phone || '—'}</td><td className="px-3 py-2 tabular-nums">{formatDobDDMMYYYY(r.row.dob) || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="flex items-center gap-2 rounded-lg bg-warning-50 dark:bg-warning-700/10 px-3 py-2 text-sm text-warning-700 dark:text-warning-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {t('auto.Ism va telefon yozilgan ustunni tanlang')}
                </p>
            )}
            <div className="flex justify-between gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>{t('auto.Boshqa fayl')}</Button>
                <Button type="button" onClick={startCheck} disabled={!isMappingReady(mapping) || payload.length === 0} data-testid="import-next">{t('auto.Davom etish')}</Button>
            </div>
        </div>
    );

    const renderCheckStep = () => {
        if (check.status === 'running') return <Progress done={check.totals.sent} total={payload.length} label={t('auto.Fayl tekshirilmoqda...')} />;
        if (check.status === 'error') {
            return (
                <div className="space-y-4">
                    <ErrorBox message={tLabel(t, check.error)} />
                    <div className="flex justify-between gap-2">
                        <Button type="button" variant="secondary" onClick={backToColumns}>{t('auto.Orqaga')}</Button>
                        {!isDemoMode() && <Button type="button" onClick={() => run(true)}>{t('auto.Qayta urinish')}</Button>}
                    </div>
                </div>
            );
        }
        const invalidRows = new Set(check.totals.invalid.map(p => p.index));
        const dobUnclear = prepared.rows.filter((r, i) => r.dobUnclear && !invalidRows.has(i)).length;
        return (
            <div className="space-y-4 animate-fade-in">
                {renderTiles(check.totals, false)}
                {dobUnclear > 0 && (
                    <p className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-300" data-testid="import-dob-note">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-warning-500" />
                        {t("auto.{n} ta bemorning tug'ilgan sanasi tushunarsiz yozilgan — ular sanasiz qo'shiladi").replace('{n}', String(dobUnclear))}
                    </p>
                )}
                {renderProblems(check.totals)}
                <div className="flex justify-between gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={backToColumns}>{t('auto.Orqaga')}</Button>
                    <Button type="button" onClick={startLoad} disabled={check.totals.created === 0} data-testid="import-start">
                        {check.totals.created > 0
                            ? t("auto.{n} ta bemorni qo'shish").replace('{n}', String(check.totals.created))
                            : t("auto.Qo'shiladigan yangi bemor yo'q")}
                    </Button>
                </div>
            </div>
        );
    };

    const renderLoadStep = () => {
        if (importing) {
            return <Progress done={load.totals.sent} total={payload.length} label={t("auto.Bemorlar qo'shilmoqda...")} hint={t('auto.Tugaguncha oynani yopmang')} />;
        }
        return (
            <div className="space-y-4 animate-fade-in">
                {load.status === 'error' ? (
                    <ErrorBox message={tLabel(t, load.error)}>
                        <p className="mt-2 text-xs text-danger-700/80 dark:text-danger-200/80">
                            {t("auto.Yuklash to'xtab qoldi. Davom ettirsangiz, qo'shilgan bemorlar ikki marta qo'shilmaydi.")}
                        </p>
                    </ErrorBox>
                ) : (
                    <p className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white" data-testid="import-done">
                        <CheckCircle className="w-6 h-6 text-success" />
                        {load.totals.created > 0 ? t("auto.Bemorlar ro'yxatga qo'shildi") : t("auto.Yangi bemor qo'shilmadi")}
                    </p>
                )}
                {renderTiles(load.totals, true)}
                {renderProblems(load.totals)}
                {load.status === 'error' ? (
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={close}>{t('auto.Yopish')}</Button>
                        <Button type="button" onClick={() => run(false, load.totals)}>{t('auto.Davom ettirish')}</Button>
                    </div>
                ) : (
                    <div className="flex justify-end pt-2">
                        <Button type="button" onClick={close} data-testid="import-finish">{t('auto.Tayyor')}</Button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Modal isOpen onClose={close} title={t("auto.Bemorlarni Excel'dan yuklash")} className="max-w-2xl">
            <Stepper step={load.status === 'done' ? stepLabels.length + 1 : step} labels={stepLabels} />
            <div ref={bodyRef} tabIndex={-1} className="outline-none">
                {step === 1 && renderFileStep()}
                {step === 2 && renderColumnsStep()}
                {step === 3 && renderCheckStep()}
                {step === 4 && renderLoadStep()}
            </div>
        </Modal>
    );
};
