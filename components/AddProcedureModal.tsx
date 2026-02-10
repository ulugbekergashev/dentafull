import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Modal, Button, Select, Input, Badge } from './Common';
import { TeethChart } from './TeethChart';
import { Service, ServiceCategory } from '../types';

interface ProcedureItem {
    id: string;
    serviceId: number;
    serviceName: string;
    toothNumber?: number;
    price: number;
    notes?: string;
}

interface AddProcedureModalProps {
    isOpen: boolean;
    onClose: () => void;
    services?: Service[];
    categories?: ServiceCategory[];
    onAddProcedure: (procedure: Omit<ProcedureItem, 'id'>) => void; // Legacy support
    onAddProcedures?: (procedures: Omit<ProcedureItem, 'id'>[]) => void; // New batch support
}

export const AddProcedureModal: React.FC<AddProcedureModalProps> = ({
    isOpen,
    onClose,
    services = [],
    categories = [],
    onAddProcedure,
    onAddProcedures
}) => {
    // Draft Queue State
    const [queue, setQueue] = useState<Omit<ProcedureItem, 'id'>[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    // Selection State
    const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
    const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
    const [price, setPrice] = useState<string>('');
    const [notes, setNotes] = useState<string>('');

    const handleServiceChange = (serviceId: number) => {
        setSelectedServiceId(serviceId);
        const service = services.find(s => s.id === serviceId);
        if (service) {
            setPrice(service.price.toString());
        }
    };

    const addToQueue = () => {
        if (!selectedServiceId) {
            alert('Iltimos, xizmatni tanlang!');
            return;
        }

        const service = services.find(s => s.id === selectedServiceId);
        if (!service) return;

        const newItem: Omit<ProcedureItem, 'id'> = {
            serviceId: service.id,
            serviceName: service.name,
            toothNumber: selectedTooth || undefined,
            price: parseFloat(price) || 0,
            notes: notes || undefined
        };

        setQueue([...queue, newItem]);

        // Reset inputs but keep tooth selected for rapid entry
        setSelectedServiceId(null);
        setPrice('');
        setNotes('');
    };

    const removeFromQueue = (index: number) => {
        const newQueue = [...queue];
        newQueue.splice(index, 1);
        setQueue(newQueue);
    };

    const handleSaveAll = () => {
        if (queue.length === 0) {
            alert("Ro'yxat bo'sh!");
            return;
        }

        if (onAddProcedures) {
            onAddProcedures(queue);
        } else {
            // Fallback for legacy
            queue.forEach(p => onAddProcedure(p));
        }

        handleClose();
    };

    const handleClose = () => {
        setQueue([]);
        setSelectedTooth(null);
        setSelectedCategoryId('');
        setSelectedServiceId(null);
        setPrice('');
        setNotes('');
        onClose();
    };

    if (!isOpen) return null;

    // Get unique teeth numbers currently in queue for highlighting
    const queuedTeeth = Array.from(new Set(queue.map(q => q.toothNumber).filter(t => t !== undefined))) as number[];
    const highlightedTeeth = selectedTooth ? [...queuedTeeth, selectedTooth] : queuedTeeth;

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Protsedura Qo'shish" className="max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-6 min-h-[60vh] lg:h-[80vh]">

                {/* Left Side: Teeth Chart */}
                <div className="lg:w-1/2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 sm:p-4 overflow-y-auto min-h-[400px]">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-500 uppercase mb-4 sticky top-0 bg-gray-50 dark:bg-gray-800 z-10 py-2">
                        1. Tishni tanlang
                    </h4>
                    <TeethChart
                        initialData={[]}
                        // When a tooth is clicked, just update state
                        onToothClick={(tooth) => setSelectedTooth(tooth === selectedTooth ? null : tooth)}
                        selectedTooth={selectedTooth}
                    />
                    <div className="mt-4 text-center">
                        <p className="text-sm text-gray-500">
                            Tanlangan tish: {selectedTooth ? <span className="font-bold text-blue-600 px-2 py-1 bg-blue-100 rounded-md">#{selectedTooth}</span> : 'Umumiy'}
                        </p>
                    </div>
                </div>

                {/* Right Side: Actions & Queue */}
                <div className="lg:w-1/2 flex flex-col h-auto lg:h-full">

                    {/* Input Area */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 shadow-sm mb-4 shrink-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-500 uppercase mb-4 flex items-center justify-between">
                            <span>2. Xizmat qo'shish {selectedTooth ? `(#${selectedTooth})` : '(Umumiy)'}</span>
                            {selectedTooth && <button onClick={() => setSelectedTooth(null)} className="text-xs text-blue-500 hover:underline">Umumiyga o'tish</button>}
                        </h4>

                        <div className="space-y-4">
                            {categories && categories.length > 0 && (
                                <Select
                                    label="Kategoriya"
                                    value={selectedCategoryId}
                                    onChange={(e) => {
                                        setSelectedCategoryId(e.target.value);
                                        setSelectedServiceId(null);
                                        setPrice('');
                                    }}
                                >
                                    <option value="">Barcha kategoriyalar</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </Select>
                            )}

                            <Select
                                label="Xizmat"
                                value={selectedServiceId?.toString() || ''}
                                onChange={(e) => handleServiceChange(parseInt(e.target.value))}
                            >
                                <option value="">Xizmatni tanlang...</option>
                                {(services || [])
                                    .filter(s => !selectedCategoryId || (s as any).categoryId === selectedCategoryId)
                                    .map(service => (
                                        <option key={service.id} value={service.id}>
                                            {service.name} - {service.price.toLocaleString()} UZS
                                        </option>
                                    ))}
                            </Select>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Narx</label>
                                    <Input
                                        type="number"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex-[2]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Izoh</label>
                                    <Input
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Izoh..."
                                    />
                                </div>
                            </div>

                            <Button onClick={addToQueue} className="w-full" disabled={!selectedServiceId}>
                                <Plus className="w-4 h-4 mr-2" /> Ro'yxatga qo'shish
                            </Button>
                        </div>
                    </div>

                    {/* Queue List */}
                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 overflow-hidden flex flex-col">
                        <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center justify-between">
                            <span>Jami Ro'yxat ({queue.length})</span>
                            <span className="text-blue-600 font-bold">
                                {queue.reduce((sum, item) => sum + item.price, 0).toLocaleString()} UZS
                            </span>
                        </h4>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {queue.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm dashed border-2 border-gray-200 rounded-lg">
                                    <Plus className="w-8 h-8 mb-2 opacity-20" />
                                    <p>Hali hech narsa qo'shilmadi</p>
                                </div>
                            ) : (
                                queue.map((item, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3 rounded-lg flex justify-between items-center shadow-sm group">
                                        <div className="flex items-center gap-3">
                                            {item.toothNumber ? (
                                                <span className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-700 text-xs font-bold rounded-lg shrink-0">
                                                    #{item.toothNumber}
                                                </span>
                                            ) : (
                                                <span className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-600 text-xs font-bold rounded-lg shrink-0">
                                                    Um
                                                </span>
                                            )}
                                            <div>
                                                <p className="font-medium text-sm text-gray-900 dark:text-white line-clamp-1">{item.serviceName}</p>
                                                <p className="text-xs text-gray-500">{item.price.toLocaleString()} UZS</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeFromQueue(idx)}
                                            className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                            <Button variant="secondary" onClick={handleClose} className="flex-1">
                                Bekor qilish
                            </Button>
                            <Button onClick={handleSaveAll} className="flex-[2]" disabled={queue.length === 0}>
                                <ArrowRight className="w-4 h-4 mr-2" /> Saqlash va Yakunlash
                            </Button>
                        </div>
                    </div>

                </div>
            </div>
        </Modal>
    );
};
