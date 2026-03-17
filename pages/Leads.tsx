import React, { useState } from 'react';
import { 
    Search, Plus, MoreHorizontal, MessageSquare, Phone, Calendar as CalendarIcon, 
    Facebook, RefreshCw, CheckCircle, X, ExternalLink, Trash2, Filter, 
    ChevronDown, UserPlus, ArrowRight, Settings, Activity, Shield 
} from 'lucide-react';
import { Lead, Doctor, Appointment, ServiceCategory, Service, Clinic } from '../types';
import { api, isDemoMode } from '../services/api';

interface LeadsProps {
    leads: Lead[];
    doctors: Doctor[];
    categories: ServiceCategory[];
    services: Service[];
    currentClinic?: Clinic;
    onAddLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    onUpdateLead: (id: string, data: Partial<Lead>) => Promise<void>;
    onDeleteLead: (id: string) => Promise<void>;
    onConvertLead: (leadId: string, appointmentData: Partial<Appointment>) => Promise<void>;
}

const STAGES = [
    { id: 'New', label: 'Yangi', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
    { id: 'Contacted', label: 'Bog\'lanildi', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    { id: 'Thinking', label: 'O\'ylab ko\'radi', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
    { id: 'Booked', label: 'Qabulga yozildi', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
    { id: 'Cancelled', label: 'Rad etdi', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
];

export const Leads: React.FC<LeadsProps> = ({
    leads,
    doctors,
    categories,
    services,
    currentClinic,
    onAddLead,
    onUpdateLead,
    onDeleteLead,
    onConvertLead
}) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
    const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
    const [isFBLoading, setIsFBLoading] = useState(false);
    const [facebookPages, setFacebookPages] = useState<any[]>([]);
    const [isFBPageModalOpen, setIsFBPageModalOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'clinicId'>>({
        name: '',
        phone: '+998',
        service: '',
        source: '',
        status: 'New',
        notes: ''
    });

    // Appt Data for Conversion
    const [apptData, setApptData] = useState({
        doctorId: '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        type: 'Konsultatsiya',
        categoryId: '',
        duration: 60,
        notes: ''
    });

    const filteredLeads = leads.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone.includes(searchTerm)
    );

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onAddLead({
            name: formData.name,
            phone: formData.phone,
            service: formData.service || undefined,
            source: formData.source || undefined,
            notes: formData.notes || undefined,
            status: 'New',
            clinicId: '' // This gets overwritten by the parent
        });
        setIsAddModalOpen(false);
        setFormData({ name: '', phone: '+998', service: '', source: '', notes: '' });
    };

    const moveLead = (leadId: string, newStatus: string) => {
        onUpdateLead(leadId, { status: newStatus as any });
    };

    const handleConvertClick = (leadId: string) => {
        setConvertingLeadId(leadId);
        setApptData(prev => ({
            ...prev,
            doctorId: doctors.length > 0 ? doctors[0].id : '',
            categoryId: categories.length > 0 ? categories[0].id : '',
        }));
        setIsConvertModalOpen(true);
    };

    const handleConvertSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!convertingLeadId) return;
        if (!apptData.doctorId) {
            alert('Iltimos, shifokorni tanlang!');
            return;
        }

        await onConvertLead(convertingLeadId, {
            doctorId: apptData.doctorId,
            date: apptData.date,
            time: apptData.time,
            type: apptData.type,
            duration: Number(apptData.duration),
        });

        setIsConvertModalOpen(false);
        setConvertingLeadId(null);
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedLeadId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);

        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '0.4';
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedLeadId(null);
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '1';
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, statusId: string) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || draggedLeadId;

        if (id) {
            if (statusId === 'Booked') {
                handleConvertClick(id);
            } else {
                moveLead(id, statusId);
            }
        }
        setDraggedLeadId(null);
    };

    // Handle Facebook Redirect success (for popup flow)
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'FB_CONNECTED') {
                handleFetchFBPages();
            }
        };

        window.addEventListener('message', handleMessage);

        // Also check if this instance IS a popup
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connected') === 'true' && window.opener) {
            // Give user time to see the success message
            setTimeout(() => {
                window.opener.postMessage({ type: 'FB_CONNECTED' }, '*');
                window.close();
            }, 2000);
        }

        return () => window.removeEventListener('message', handleMessage);
    }, [currentClinic?.id]);

    // Handle initial 'connected' param if page was reloaded manually (fallback)
    React.useEffect(() => {
        if (!currentClinic?.id) return;
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connected') === 'true' && !window.opener) {
            handleFetchFBPages();
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [currentClinic?.id]);

    const handleFetchFBPages = async () => {
        if (!currentClinic?.id) return;
        setIsFBLoading(true);
        try {
            const pages = await api.facebook.getPages(currentClinic.id);
            setFacebookPages(pages);
            setIsFBPageModalOpen(true);
        } catch (error) {
            console.error('Failed to fetch FB pages:', error);
            alert('Facebook sahifalarini yuklashda xatolik yuz berdi');
        } finally {
            setIsFBLoading(false);
        }
    };

    const handleConnectFB = async () => {
        if (!currentClinic?.id) {
            alert('Klinika ID topilmadi. Tizimdan chiqib qaytadan kiring.');
            return;
        }

        // In demo mode, skip real Facebook OAuth and show mock page selection
        if (isDemoMode()) {
            setIsFBLoading(true);
            try {
                const pages = await api.facebook.getPages(currentClinic.id);
                setFacebookPages(pages);
                setIsFBPageModalOpen(true);
            } catch (error: any) {
                console.error('FB Demo pages error:', error);
                alert(`Facebook sahifalarini yuklashda xatolik: ${error.message}`);
            } finally {
                setIsFBLoading(false);
            }
            return;
        }
        
        setIsFBLoading(true);
        try {
            const { url } = await api.facebook.getAuthUrl(currentClinic.id);
            const width = 600;
            const height = 700;
            const left = Math.max(0, (window.screen.width / 2) - (width / 2));
            const top = Math.max(0, (window.screen.height / 2) - (height / 2));
            window.open(
                url,
                'FacebookLogin',
                `width=700,height=850,left=${left},top=${top},status=yes,scrollbars=yes`
            );
        } catch (error: any) {
            console.error('FB Connect error:', error);
            alert(`Facebook ulanishda xatolik: ${error.message}`);
        } finally {
            setIsFBLoading(false);
        }
    };


    const handleSelectFBPage = async (page: any) => {
        if (!currentClinic?.id) return;
        try {
            await api.facebook.selectPage({
                clinicId: currentClinic.id,
                pageId: page.id,
                pageAccessToken: page.access_token,
                pageName: page.name
            });
            setIsFBPageModalOpen(false);
            alert('Sahifa muvaffaqiyatli bog\'landi!');
            window.location.reload();
        } catch (error) {
            console.error('Failed to select FB page:', error);
            alert('Sahifani saqlashda xatolik yuz berdi');
        }
    };

    // For popup flow success/auth UI
    const urlParams = new URLSearchParams(window.location.search);
    const isPopupSuccess = urlParams.get('connected') === 'true' && !!window.opener;

    if (isPopupSuccess) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 p-6 text-center">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Muvaffaqiyatli ulandi!</h1>
                <p className="text-gray-500 dark:text-gray-400">Facebook hisobingiz tizimga bog'landi. Ushbu oyna hozir yopiladi...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm shrink-0">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                            Lidlar <span className="text-[#1B6AFB] dark:text-blue-400">Voronkasi</span>
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Potensial mijozlar bilan ishlash</p>
                    </div>

                    {/* Facebook Integration Quick Status */}
                    <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-gray-100 dark:border-gray-700">
                        {currentClinic?.facebookPageId ? (
                            <div className="flex items-center gap-2 group">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold border border-blue-100/50 dark:border-blue-800/50 transition-all">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                    <Facebook className="w-3.5 h-3.5 fill-current" />
                                    <span>{currentClinic.facebookPageName}</span>
                                </div>
                                <button
                                    onClick={() => handleFetchFBPages()}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                    title="Sahifani almashtirish"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleConnectFB}
                                disabled={isFBLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] hover:bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 active:scale-95"
                            >
                                {isFBLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4 fill-current" />}
                                <span>Facebook-ni ulash</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Qidiruv..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-[#1B6AFB]/20 outline-none transition-all dark:text-white"
                        />
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-[#1B6AFB] hover:bg-blue-600 active:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">Yangi Lid</span>
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-max h-full">
                    {STAGES.map(stage => {
                        const columnLeads = filteredLeads.filter(l => l.status === stage.id);

                        const isDragOverTarget = draggedLeadId !== null;

                        return (
                            <div
                                key={stage.id}
                                className="w-80 flex flex-col bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage.id)}
                            >
                                <div className={`p-3 border-b border-gray-200/50 dark:border-gray-700/50 rounded-t-xl transition-colors ${isDragOverTarget ? 'bg-gray-100 dark:bg-gray-700/50' : ''}`}>
                                    <div className="flex items-center justify-between pointer-events-none">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${stage.color}`}>
                                            {stage.label}
                                        </span>
                                        <span className="text-xs font-medium text-gray-500 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full shadow-sm border border-gray-100 dark:border-gray-700">
                                            {columnLeads.length}
                                        </span>
                                    </div>
                                </div>

                                <div className={`flex-1 p-3 space-y-3 overflow-y-auto min-h-[500px] transition-colors ${isDragOverTarget ? 'bg-gray-100/30 dark:bg-gray-800/50 ring-2 ring-inset ring-blue-500/20 rounded-b-xl' : ''}`}>
                                    {columnLeads.map(lead => (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead.id)}
                                            onDragEnd={handleDragEnd}
                                            className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow group relative cursor-grab active:cursor-grabbing"
                                        >
                                            <div className="flex justify-between items-start mb-2 pointer-events-none">
                                                <h4 className="font-bold text-gray-900 dark:text-white text-sm">{lead.name}</h4>
                                                <button
                                                    onClick={() => onDeleteLead(lead.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="flex flex-col gap-1.5 mb-3">
                                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                                    <Phone className="w-3.5 h-3.5 mr-1.5 text-gray-400 text-blue-500" />
                                                    {lead.phone}
                                                </div>
                                                {lead.service && (
                                                    <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded w-fit">
                                                        Murojaat: {lead.service}
                                                    </span>
                                                )}
                                                {lead.source && (
                                                    <span className="text-[10px] text-gray-400">
                                                        Manba: {lead.source}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Stage transition buttons */}
                                            <div className="pt-3 border-t border-gray-50 dark:border-gray-700/50 flex flex-wrap gap-1">
                                                {STAGES.filter(s => s.id !== stage.id).map(s => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => s.id === 'Booked' ? handleConvertClick(lead.id) : moveLead(lead.id, s.id)}
                                                        className={`text-[10px] items-center gap-1 font-medium px-2 py-1 rounded-md transition-colors ${s.id === 'Booked'
                                                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                                            : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`
                                                        }
                                                    >
                                                        {s.id === 'Booked' ? <UserPlus className="w-3 h-3 inline-block mr-0.5" /> : <ArrowRight className="w-3 h-3 inline-block mr-0.5" />}
                                                        {s.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {columnLeads.length === 0 && (
                                        <div className="h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center">
                                            <span className="text-xs text-gray-400">Bo'sh</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Yangi Lid Qo'shish</h2>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Mijoz Ismi *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Telefon Raqami *
                                </label>
                                <input
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Qiziqayotgan Xizmat (Ixtiyoriy)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Masalan: Implant, Breket"
                                    value={formData.service}
                                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Murojaat Manbasi (Source)
                                </label>
                                <select
                                    value={formData.source}
                                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white"
                                >
                                    <option value="">Tanlang...</option>
                                    <option value="Instagram">Instagram</option>
                                    <option value="Telegram">Telegram</option>
                                    <option value="Tavsiya">Tavsiya</option>
                                    <option value="Tashqari">Tashqaridan keldi (Banner)</option>
                                    <option value="Boshqa">Boshqa</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Qo'shimcha Izoh
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white resize-none"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-[#1B6AFB] text-white rounded-xl hover:bg-blue-600 font-medium shadow-sm transition-all"
                                >
                                    Saqlash
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isConvertModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bemorga Aylantirish</h2>
                                <p className="text-sm text-gray-500">Mijozni tizimga qo'shib qabulga yozish</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsConvertModalOpen(false);
                                    setConvertingLeadId(null);
                                }}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleConvertSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shifokorni tanlang *</label>
                                <select
                                    required
                                    value={apptData.doctorId}
                                    onChange={(e) => setApptData({ ...apptData, doctorId: e.target.value })}
                                    className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="">— Shifokor tanlang —</option>
                                    {doctors.map((d) => (
                                        <option key={d.id} value={d.id}>Dr. {d.lastName} {d.firstName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sana *</label>
                                    <input
                                        type="date"
                                        required
                                        value={apptData.date}
                                        onChange={e => setApptData({ ...apptData, date: e.target.value })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vaqt *</label>
                                    <input
                                        type="time"
                                        required
                                        value={apptData.time}
                                        onChange={e => setApptData({ ...apptData, time: e.target.value })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            {categories.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Xizmat kategoriyasi</label>
                                    <select
                                        value={apptData.categoryId}
                                        onChange={(e) => setApptData({ ...apptData, categoryId: e.target.value, type: '' })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Barcha kategoriyalar</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Muolaja turi</label>
                                    <select
                                        value={apptData.type}
                                        onChange={e => {
                                            const service = services.find(s => s.name === e.target.value);
                                            setApptData({
                                                ...apptData,
                                                type: e.target.value,
                                                duration: service?.duration || apptData.duration
                                            });
                                        }}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        {services
                                            .filter(s => !apptData.categoryId || (s as any).categoryId === apptData.categoryId)
                                            .map(s => (
                                                <option key={s.id} value={s.name}>{s.name}</option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Davomiylik (daq)</label>
                                    <input
                                        type="number"
                                        required
                                        value={apptData.duration}
                                        onChange={e => setApptData({ ...apptData, duration: Number(e.target.value) })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsConvertModalOpen(false);
                                        setConvertingLeadId(null);
                                    }}
                                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm transition-all"
                                >
                                    Mijozga Aylantirish
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Facebook Page Selection Modal */}
            {isFBPageModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Facebook Sahifasini Tanlang</h2>
                                <p className="text-sm text-gray-500">Lidlar tushadigan sahifani biriktiring</p>
                            </div>
                            <button
                                onClick={() => setIsFBPageModalOpen(false)}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {facebookPages.map((page) => (
                                <button
                                    key={page.id}
                                    onClick={() => handleSelectFBPage(page)}
                                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-100 dark:border-gray-700 rounded-xl transition-all group"
                                >
                                    <div className="flex items-center gap-3 text-left">
                                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400">
                                            <Facebook className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {page.name}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">ID: {page.id}</div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                                        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                                    </div>
                                </button>
                            ))}

                            {facebookPages.length === 0 && (
                                <div className="py-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                    <Facebook className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">Hech qanday sahifa topilmadi</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-6 border-t dark:border-gray-700">
                            <button
                                onClick={() => setIsFBPageModalOpen(false)}
                                className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-bold transition-colors"
                            >
                                Yopish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
