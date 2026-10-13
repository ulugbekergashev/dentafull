/**
 * "Parolni almashtirish" — xodim o'z parolini o'zi almashtiradi (sarlavhadagi kalit tugmasi).
 * Demo rejimda ko'rsatilmaydi: u yerda haqiqiy hisob yo'q.
 */
import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Input, Modal } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { tLabel } from '../i18n/labels';
import { changeOwnPassword } from '../services/account';

/** Server ham shuni talab qiladi */
const MIN_PASSWORD_LENGTH = 6;

interface ChangePasswordModalProps {
  onClose: () => void;
  /** Parol almashtirildi — chaqiruvchi xabar ko'rsatadi va oynani yopadi */
  onChanged: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, onChanged }) => {
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("auto.Yangi parol kamida 6 ta belgidan iborat bo'lsin"));
      return;
    }
    if (newPassword !== repeatPassword) {
      setError(t('auto.Yangi parollar bir xil emas'));
      return;
    }
    setError('');
    setIsSaving(true);
    const result = await changeOwnPassword(currentPassword, newPassword);
    setIsSaving(false);
    if (result.ok) {
      onChanged();
      return;
    }
    // Server matni o'zbekcha keladi; lug'atda tarjimasi bo'lsa — tanlangan tilda chiqadi
    setError(result.error ? tLabel(t, result.error) : t("auto.Parolni almashtirib bo'lmadi. Qayta urinib ko'ring."));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('auto.Parolni almashtirish')} className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4" data-password-form>
        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}
        <Input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          label={t('auto.Hozirgi parol')}
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          required
          autoFocus
        />
        <Input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          label={t('auto.Yangi parol')}
          helperText={t('auto.Kamida 6 ta belgi')}
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
        />
        <Input
          type="password"
          name="repeatPassword"
          autoComplete="new-password"
          label={t('auto.Yangi parolni takrorlang')}
          value={repeatPassword}
          onChange={e => setRepeatPassword(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? t('auto.Saqlanmoqda...') : t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};
