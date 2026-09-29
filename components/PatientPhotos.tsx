import React, { useState, useEffect } from 'react';
import { Camera, Upload, Trash2, X, ZoomIn } from 'lucide-react';
import { Button, Card, Modal, Input, Select, Badge } from './Common';
import { PatientPhoto } from '../types';
import { API_URL, isDemoMode } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const BASE_URL = API_URL.replace('/api', '');

/**
 * Demo rejimda suratlar serverga yuklanmaydi: sessiya davomida brauzer xotirasida
 * turadi (sahifa yangilansa yo'qoladi). Rasm manzili — brauzerdagi blob: havola.
 */
const demoPhotos: Record<string, PatientPhoto[]> = {};
const photoSrc = (url: string) => (/^(https?:|blob:|data:)/.test(url) ? url : `${BASE_URL}${url}`);

interface PatientPhotosProps {
    patientId: string;
    clinicId: string;
    token: string;
    /** Ruxsatlar: surat yuklash va o'chirish (ko'rish ruxsati sahifa darajasida tekshiriladi) */
    canUpload?: boolean;
    canDelete?: boolean;
    /** Ro'yxat yangilanganda (yuklash/o'chirish) — bemor kartasidagi yakunlash tekshiruvi uchun */
    onPhotosChange?: (photos: PatientPhoto[]) => void;
}

/** Bemorning suratlari ro'yxati (serverdan) */
export const fetchPatientPhotos = async (patientId: string, token: string): Promise<PatientPhoto[]> => {
    if (isDemoMode()) return [...(demoPhotos[patientId] || [])];
    const response = await fetch(`${API_URL}/patients/${patientId}/photos`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};

export const PatientPhotos: React.FC<PatientPhotosProps> = ({ patientId, clinicId, token, canUpload = true, canDelete = true, onPhotosChange }) => {
    const { t } = useLanguage();
    const [photos, setPhotosState] = useState<PatientPhoto[]>([]);
    const setPhotos = (list: PatientPhoto[]) => { setPhotosState(list); onPhotosChange?.(list); };
    const [loading, setLoading] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [viewPhoto, setViewPhoto] = useState<PatientPhoto | null>(null);

    useEffect(() => {
        fetchPhotos();
    }, [patientId]);

    const fetchPhotos = async () => {
        if (isDemoMode()) {
            setPhotos([...(demoPhotos[patientId] || [])]);
            setLoading(false);
            return;
        }
        try {
            const response = await fetch(`${API_URL}/patients/${patientId}/photos`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPhotos(data);
            } else {
                const text = await response.text();
                try {
                    const errorData = JSON.parse(text);
                    console.error('Fetch photos error details:', errorData);
                } catch (e) {
                    console.error('Fetch photos non-JSON error:', text);
                }
            }
        } catch (error) {
            console.error('Failed to fetch photos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (photoId: string) => {
        if (!confirm(t('patients.details.photos.deleteConfirm'))) return;

        if (isDemoMode()) {
            demoPhotos[patientId] = (demoPhotos[patientId] || []).filter(p => p.id !== photoId);
            setPhotos(photos.filter(p => p.id !== photoId));
            if (viewPhoto?.id === photoId) setViewPhoto(null);
            return;
        }

        try {
            const response = await fetch(`${API_URL}/photos/${photoId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                setPhotos(photos.filter(p => p.id !== photoId));
                if (viewPhoto?.id === photoId) setViewPhoto(null);
            } else {
                alert('Failed to delete photo');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const categories = photoCategories(t);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('patients.details.photos.title')}</h3>
                {canUpload && (
                    <Button onClick={() => setIsUploadModalOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        {t('patients.details.photos.uploadBtn')}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">{t('common.loading')}</div>
            ) : photos.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <Camera className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500">{t('patients.details.photos.noPhotos')}</p>
                    {canUpload && (
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsUploadModalOpen(true)}>
                            {t('patients.details.photos.uploadFirst')}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map(photo => (
                        <div key={photo.id} className="group relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all">
                            <img
                                src={photoSrc(photo.url)}
                                alt={photo.description || 'Patient photo'}
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => setViewPhoto(photo)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                                <div className="flex justify-end">
                                    {canDelete && (
                                        <button
                                            onClick={() => handleDelete(photo.id)}
                                            className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <span className="inline-block px-2 py-1 bg-black/60 text-white text-xs rounded mb-1">
                                        {categories.find(c => c.value === photo.category)?.label || photo.category}
                                    </span>
                                    {photo.description && (
                                        <p className="text-white text-xs truncate">{photo.description}</p>
                                    )}
                                    <p className="text-gray-300 text-[10px]">
                                        {new Date(photo.date).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <PhotoUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                patientId={patientId}
                token={token}
                onUploaded={fetchPhotos}
            />

            {/* View Photo Modal */}
            {viewPhoto && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setViewPhoto(null)}>
                    <button
                        className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
                        onClick={() => setViewPhoto(null)}
                    >
                        <X className="w-8 h-8" />
                    </button>

                    <div className="max-w-4xl max-h-[90vh] relative" onClick={e => e.stopPropagation()}>
                        <img
                            src={photoSrc(viewPhoto.url)}
                            alt={viewPhoto.description || 'Full view'}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md text-white p-4 rounded-b-lg transform translate-y-full sm:translate-y-0">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium text-lg">
                                        {categories.find(c => c.value === viewPhoto.category)?.label}
                                    </h4>
                                    {viewPhoto.description && (
                                        <p className="text-gray-300 mt-1">{viewPhoto.description}</p>
                                    )}
                                    <p className="text-gray-400 text-sm mt-1">
                                        {new Date(viewPhoto.date).toLocaleString()}
                                    </p>
                                </div>
                                {canDelete && (
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => handleDelete(viewPhoto.id)}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        {t('common.delete')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const photoCategories = (t: (key: any) => string) => [
    { value: 'Before', label: t('patients.details.photos.catBefore') },
    { value: 'After', label: t('patients.details.photos.catAfter') },
    { value: 'X-Ray', label: t('patients.details.photos.catXRay') },
    { value: 'Other', label: t('patients.details.photos.catOther') }
];

interface PhotoUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    patientId: string;
    token: string;
    /** Surat saqlangandan keyin (oyna o'zi yopiladi) */
    onUploaded: () => void | Promise<void>;
    defaultCategory?: string;
}

/**
 * Surat yuklash oynasi. "Suratlar" tabida ham, qabulni yakunlash panelida ham
 * (xizmat surat talab qilganda) shu oyna ochiladi.
 */
export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({ isOpen, onClose, patientId, token, onUploaded, defaultCategory = 'Before' }) => {
    const { t } = useLanguage();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(defaultCategory);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (isOpen) setCategory(defaultCategory);
    }, [isOpen, defaultCategory]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleCloseModal = () => {
        onClose();
        setSelectedFile(null);
        setPreviewUrl(null);
        setDescription('');
        setCategory(defaultCategory);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        if (isDemoMode()) {
            const now = new Date().toISOString();
            (demoPhotos[patientId] ||= []).unshift({
                id: `demo-photo-${Date.now()}`, patientId, url: URL.createObjectURL(selectedFile),
                description, category, date: now, createdAt: now,
            });
            await onUploaded();
            handleCloseModal();
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('photo', selectedFile);
        formData.append('description', description);
        formData.append('category', category);

        try {
            const response = await fetch(`${API_URL}/patients/${patientId}/photos`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                await onUploaded();
                handleCloseModal();
            } else {
                const text = await response.text();
                try {
                    const errorData = JSON.parse(text);
                    console.error('Server error details:', errorData);
                    alert(`Failed to upload photo: ${errorData.details || errorData.error || 'Unknown error'}`);
                } catch (e) {
                    console.error('Server non-JSON error:', text);
                    alert(`Failed to upload photo: Server returned non-JSON response. Check console for details.`);
                }
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error uploading photo');
        } finally {
            setUploading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleCloseModal}
            title={t('patients.details.photos.uploadModalTitle')}
        >
            <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer relative">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {previewUrl ? (
                        <div className="relative h-48 mx-auto">
                            <img src={previewUrl} alt="Preview" className="h-full mx-auto object-contain rounded" />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewUrl(null);
                                    setSelectedFile(null);
                                }}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="py-4">
                            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                            <p className="text-sm text-gray-500">{t('patients.details.photos.clickToSelect')}</p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG</p>
                        </div>
                    )}
                </div>

                <Select
                    label={t('patients.details.photos.category')}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    options={photoCategories(t)}
                />

                <Input
                    label={t('patients.details.photos.description')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('patients.details.photos.descPlaceholder')}
                />

                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="secondary" onClick={handleCloseModal}>{t('common.cancel')}</Button>
                    <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
                        {uploading ? t('common.loading') : t('patients.details.photos.uploadBtn')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
