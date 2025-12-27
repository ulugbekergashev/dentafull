import React, { useState, useEffect } from 'react';
import { Camera, Upload, Trash2, X, ZoomIn } from 'lucide-react';
import { Button, Card, Modal, Input, Select, Badge } from './Common';
import { PatientPhoto } from '../types';

interface PatientPhotosProps {
    patientId: string;
    clinicId: string;
    token: string;
}

export const PatientPhotos: React.FC<PatientPhotosProps> = ({ patientId, clinicId, token }) => {
    const [photos, setPhotos] = useState<PatientPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('Before');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [viewPhoto, setViewPhoto] = useState<PatientPhoto | null>(null);

    useEffect(() => {
        fetchPhotos();
    }, [patientId]);

    const fetchPhotos = async () => {
        try {
            const response = await fetch(`http://localhost:3001/api/patients/${patientId}/photos`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPhotos(data);
            }
        } catch (error) {
            console.error('Failed to fetch photos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('photo', selectedFile);
        formData.append('description', description);
        formData.append('category', category);

        try {
            const response = await fetch(`http://localhost:3001/api/patients/${patientId}/photos`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                await fetchPhotos();
                handleCloseModal();
            } else {
                alert('Failed to upload photo');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error uploading photo');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (photoId: string) => {
        if (!confirm('Rostdan ham bu rasmni o\'chirmoqchimisiz?')) return;

        try {
            const response = await fetch(`http://localhost:3001/api/photos/${photoId}`, {
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

    const handleCloseModal = () => {
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        setPreviewUrl(null);
        setDescription('');
        setCategory('Before');
    };

    const categories = [
        { value: 'Before', label: 'Davolashdan oldin' },
        { value: 'After', label: 'Davolashdan keyin' },
        { value: 'X-Ray', label: 'Rentgen' },
        { value: 'Other', label: 'Boshqa' }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Bemor rasmlari</h3>
                <Button onClick={() => setIsUploadModalOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Rasm yuklash
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Yuklanmoqda...</div>
            ) : photos.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <Camera className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500">Rasmlar mavjud emas</p>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsUploadModalOpen(true)}>
                        Birinchi rasmni yuklash
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map(photo => (
                        <div key={photo.id} className="group relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all">
                            <img
                                src={`http://localhost:3001${photo.url}`}
                                alt={photo.description || 'Patient photo'}
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => setViewPhoto(photo)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => handleDelete(photo.id)}
                                        className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
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

            {/* Upload Modal */}
            <Modal
                isOpen={isUploadModalOpen}
                onClose={handleCloseModal}
                title="Rasm yuklash"
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
                                <p className="text-sm text-gray-500">Rasm tanlash uchun bosing</p>
                                <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG</p>
                            </div>
                        )}
                    </div>

                    <Select
                        label="Kategoriya"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        options={categories}
                    />

                    <Input
                        label="Izoh (ixtiyoriy)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Masalan: Yuqori o'ng 6-tish"
                    />

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={handleCloseModal}>Bekor qilish</Button>
                        <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
                            {uploading ? 'Yuklanmoqda...' : 'Yuklash'}
                        </Button>
                    </div>
                </div>
            </Modal>

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
                            src={`http://localhost:3001${viewPhoto.url}`}
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
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleDelete(viewPhoto.id)}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    O'chirish
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
