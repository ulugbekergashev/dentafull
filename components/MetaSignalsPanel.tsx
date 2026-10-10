import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button, Card } from './Common';
import { api } from '../services/api';
import { MetaSignalsStatus } from '../types';

// SuperAdmin > Lidlar: Meta'ga lid signallarini ulash. Bir marta sozlanadi va keyin
// deyarli ochilmaydi, shuning uchun "Tashqi lid manbasi" paneli kabi yig'ilgan holda turadi.

const SETUP_STEPS = [
  'Events Manager → pikselingiz → Settings → Conversions API → Generate access token. Tokenni shu yerga qo\'ying.',
  'Ads Manager → Audiences → Custom audience → Website → hodisa: CrmContact, 180 kun. Bu — sizda allaqachon bor odamlar.',
  'Har bir ad set → Audience → Exclude → shu auditoriyani tanlang. Shundan keyin u o\'zi to\'lib boradi, qayta sozlash kerak emas.',
];

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const MetaSignalsPanel: React.FC = () => {
  const [status, setStatus] = useState<MetaSignalsStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    api.adminMetaSignals.status()
      .then((s) => { if (!isCancelled) setStatus(s); })
      .catch(() => { /* panel "ulanmagan" ko'rinishida qoladi */ });
    return () => { isCancelled = true; };
  }, []);

  const connect = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await api.adminMetaSignals.connect(token.trim());
      setStatus(result);
      setSyncedCount(result.synced);
      setToken('');
    } catch (err: any) {
      setError(err?.message || 'Ulab bo\'lmadi');
    } finally {
      setIsSaving(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Meta\'ga signal yuborish to\'xtaydi. Davom etasizmi?')) return;
    setIsSaving(true);
    setError(null);
    try {
      setStatus(await api.adminMetaSignals.disconnect());
      setSyncedCount(null);
    } catch (err: any) {
      setError(err?.message || 'Uzib bo\'lmadi');
    } finally {
      setIsSaving(false);
    }
  };

  const isConnected = !!status?.connected;
  const badge = isConnected
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-left
                   bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800
                   border border-gray-200 dark:border-gray-700 transition-colors"
      >
        <Activity className="w-4 h-4 text-primary-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Reklama uchun Meta signallari</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge}`}>{isConnected ? 'ulangan' : 'ulanmagan'}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          ochish <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2">
          <Activity className="w-5 h-5 text-primary-500 mt-0.5" />
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Reklama uchun Meta signallari
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge}`}>{isConnected ? 'ulangan' : 'ulanmagan'}</span>
            </h4>
            <p className="text-xs text-gray-500 max-w-xl">
              Meta'ga lid deb faqat sotuvchi "Bog'lashildi", "O'ylamoqda" yoki "Oldi"ga o'tkazgan odam aytiladi —
              reklama shundaylarni qidiradi. "Bekor"ga o'tgani hech qachon aytilmaydi. Ariza qoldirganlar va
              mijozlar esa "bizda bor" deb bildiriladi, ularga reklama qayta ko'rsatilmasin.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Yopish"
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          yopish <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {isConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {syncedCount !== null && (
              <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle className="w-4 h-4" /> Ulandi. {syncedCount} ta lid va mijoz Meta'ga bildirildi.
              </p>
            )}
            {status?.last && (
              status.last.ok ? (
                <p className="text-gray-500">Oxirgi signal: {formatWhen(status.last.at)} — Meta qabul qildi</p>
              ) : (
                <p className="flex items-start gap-1.5 text-red-600">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  Oxirgi signal ({formatWhen(status.last.at)}) qabul qilinmadi: {status.last.error}
                </p>
              )
            )}
          </div>
          <Button variant="danger" onClick={disconnect} disabled={isSaving}>
            <Trash2 className="w-4 h-4 mr-2" /> Uzish
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Conversions API tokeni (EAA...)"
            aria-label="Conversions API tokeni"
            className="flex-1 min-w-[240px] px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-primary-500"
          />
          <Button onClick={connect} disabled={isSaving || !token.trim()}>
            {isSaving ? 'Tekshirilmoqda...' : 'Ulash'}
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <ol className="mt-4 space-y-1.5 text-xs text-gray-500 dark:text-gray-400 list-decimal list-inside">
        {SETUP_STEPS.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </Card>
  );
};
