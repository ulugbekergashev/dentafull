import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '../Common';
import { api } from '../../services/api';
import { compressPhoto, DEV_TASK_PHOTOS_MAX, DEV_TASK_TEXT_MAX, DevTask, DevTaskProduct } from '../../utils/devTasks';
import type { DevTaskLabels } from './devTaskLabels';

interface DevTaskFormProps {
    product: DevTaskProduct;
    L: DevTaskLabels;
    onSaved: (task: DevTask) => void;
    onCancel: () => void;
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Yangi vazifa: matn, ixtiyoriy klinika nomi va rasmlar (yuklashdan oldin siqiladi) */
export const DevTaskForm: React.FC<DevTaskFormProps> = ({ product, L, onSaved, onCancel }) => {
    const [text, setText] = useState('');
    const [clinicName, setClinicName] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [uploading, setUploading] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const addFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setError('');
        const room = DEV_TASK_PHOTOS_MAX - photos.length - uploading;
        const picked = Array.from(files).slice(0, Math.max(0, room));
        setUploading(n => n + picked.length);
        await Promise.all(picked.map(async file => {
            try {
                const small = await compressPhoto(file);
                const { url } = await api.devTasks.uploadPhoto(small);
                setPhotos(list => (list.length < DEV_TASK_PHOTOS_MAX ? [...list, url] : list));
            } catch (e) {
                setError(errorText(e, "Rasmni yuklab bo'lmadi"));
            } finally {
                setUploading(n => n - 1);
            }
        }));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim() || saving || uploading > 0) return;
        setSaving(true);
        setError('');
        try {
            const task = await api.devTasks.create({ product, text: text.trim(), clinicName: clinicName.trim(), photos });
            onSaved(task);
        } catch (err) {
            setError(errorText(err, "Saqlab bo'lmadi"));
        } finally {
            setSaving(false);
        }
    };

    const canAddMore = photos.length + uploading < DEV_TASK_PHOTOS_MAX;

    return (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{L.text}</span>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    maxLength={DEV_TASK_TEXT_MAX}
                    rows={4}
                    autoFocus
                    placeholder={L.textPlaceholder}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
            </label>
            <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{L.clinic}</span>
                <input
                    value={clinicName}
                    onChange={e => setClinicName(e.target.value)}
                    maxLength={120}
                    placeholder={L.clinicPlaceholder}
                    className="mt-1 h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
            </label>
            <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{L.photos}</span>
                <div className="mt-1 flex flex-wrap gap-2">
                    {photos.map(url => (
                        <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <button
                                type="button"
                                onClick={() => setPhotos(list => list.filter(u => u !== url))}
                                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                                aria-label={L.remove}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                    {Array.from({ length: uploading }).map((_, i) => (
                        <div key={`up-${i}`} className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        </div>
                    ))}
                    {canAddMore && (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-500 hover:border-primary-400 hover:text-primary-600"
                        >
                            <ImagePlus className="h-5 w-5" />
                            {L.addPhoto}
                        </button>
                    )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{L.photoHint(DEV_TASK_PHOTOS_MAX)}</p>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onCancel}>{L.cancel}</Button>
                <Button type="submit" disabled={!text.trim() || saving || uploading > 0}>
                    {uploading > 0 ? L.uploading : L.save}
                </Button>
            </div>
        </form>
    );
};
