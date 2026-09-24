import React, { useEffect, useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Modal, Button, Input } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { formatDobDDMMYYYY } from '../utils/dateUtils';

interface WaiveAppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    patientName: string;
    date: string;
    /** Qabul narxi — chegirma sifatida yoziladi */
    amount: number;
    onConfirm: (reason: string) => Promise<void>;
}

const QUICK_REASONS = ['waive.reason.free', 'waive.reason.warranty', 'waive.reason.mistake'] as const;

/** Tugagan qabulni pul olmasdan yopish (faqat klinika admini) */
export const WaiveAppointmentModal: React.FC<WaiveAppointmentModalProps> = ({ isOpen, onClose, patientName, date, amount, onConfirm }) => {
    const { t } = useLanguage();
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

    const confirm = async () => {
        setSaving(true);
        try {
            await onConfirm(reason);
            onClose();
        } catch {
            // xatolik toast orqali ko'rsatiladi
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('waive.title')} className="max-w-md">
            <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm">
                    <p className="font-semibold text-gray-900 dark:text-white">{patientName}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                        {formatDobDDMMYYYY(date)}{amount > 0 && <> · <span className="tabular-nums">{amount.toLocaleString()} UZS</span></>}
                    </p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{t('waive.desc')}</p>
                <div>
                    <Input label={t('waive.reason')} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('waive.reasonPlaceholder')} maxLength={80} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {QUICK_REASONS.map(key => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setReason(t(key))}
                                className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600"
                            >
                                {t(key)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-2 pt-2">
                    <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>{t('auto.Bekor')}</Button>
                    <Button className="flex-1" onClick={confirm} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
                        {t('waive.confirm')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
