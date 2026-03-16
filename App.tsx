
import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar as CalendarIcon,
  DollarSign, Settings as SettingsIcon, Menu, X, Moon, Sun, LogOut,
  Building2, Shield, Activity, RefreshCw, AlertTriangle, Loader2, Package, Search, UserCheck, Plus, Edit, Trash2
} from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { PatientDetails } from './pages/PatientDetails';
import { Calendar } from './pages/Calendar';
import { Finance } from './pages/Finance';
import { Leads } from './pages/Leads';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { DoctorsAnalytics } from './pages/DoctorsAnalytics';
import { DoctorDetails } from './pages/DoctorDetails';
import { Inventory } from './pages/Inventory';
import { NavItem, UserRole, Patient, Appointment, Transaction, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, InventoryItem, ServiceCategory, Lead } from './types';
import { ToastContainer, ToastMessage } from './components/Common';
import { InstallPWAButton } from './components/InstallPWAButton';
import { BottomNav } from './components/BottomNav';
import { api } from './services/api';

// Navigation config for Clinic Admin and Doctors
const CLINIC_NAVIGATION: NavItem[] = [
  { id: 'dashboard', label: 'Boshqaruv Paneli', icon: LayoutDashboard, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR] },
  { id: 'leads', label: 'Lidlar', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'patients', label: 'Bemorlar', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'calendar', label: 'Kalendar', icon: CalendarIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'finance', label: 'Moliya', icon: DollarSign, roles: [UserRole.CLINIC_ADMIN] },
  { id: 'doctors', label: 'Shifokorlar', icon: Activity, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'inventory', label: 'Ombor', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'settings', label: 'Sozlamalar', icon: SettingsIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
];

const SUPER_ADMIN_NAVIGATION: NavItem[] = [
  { id: 'admin', label: 'SaaS Dashboard', icon: Building2, roles: [UserRole.SUPER_ADMIN] },
];

// Helper: get page label from path
const getPageLabel = (pathname: string): string => {
  if (pathname === '/' || pathname === '/dashboard') return 'Boshqaruv Paneli';
  if (pathname === '/leads') return 'Lidlar';
  if (pathname.startsWith('/patients/')) return 'Bemor Profili';
  if (pathname === '/patients') return 'Bemorlar';
  if (pathname === '/calendar') return 'Kalendar';
  if (pathname === '/finance') return 'Moliya';
  if (pathname === '/doctors') return 'Shifokorlar';
  if (pathname === '/inventory') return 'Ombor';
  if (pathname === '/settings') return 'Sozlamalar';
  if (pathname === '/admin') return 'Super Admin';
  return 'DentaCRM';
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- Global State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.CLINIC_ADMIN);
  const [userName, setUserName] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [receptionistId, setReceptionistId] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data Store
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentClinic, setCurrentClinic] = useState<Clinic | undefined>();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [searchBarTerm, setSearchBarTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Search logic
  const searchResults = useMemo(() => {
    if (!searchBarTerm.trim() || searchBarTerm.length < 2) return { patients: [], doctors: [] };

    const term = searchBarTerm.toLowerCase();
    const filteredPatients = patients.filter(p =>
      p.firstName.toLowerCase().includes(term) ||
      p.lastName.toLowerCase().includes(term) ||
      p.phone.includes(term)
    ).slice(0, 5);

    const filteredDoctors = doctors.filter(d =>
      d.firstName.toLowerCase().includes(term) ||
      d.lastName.toLowerCase().includes(term) ||
      d.specialty.toLowerCase().includes(term)
    ).slice(0, 3);

    return { patients: filteredPatients, doctors: filteredDoctors };
  }, [searchBarTerm, patients, doctors]);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Check for stored session on mount
  useEffect(() => {
    const storedAuth = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
    if (storedAuth) {
      try {
        const { role, name, clinicId: storedClinicId, doctorId: storedDoctorId, receptionistId: storedReceptionistId } = JSON.parse(storedAuth);
        if (role && name) {
          setUserRole(role);
          setUserName(name);
          if (storedClinicId) setClinicId(storedClinicId);
          if (storedDoctorId) setDoctorId(storedDoctorId);
          if (storedReceptionistId) setReceptionistId(storedReceptionistId);
          setIsAuthenticated(true);
          // Fetch current clinic info if not in demo mode
          if (storedClinicId && role !== UserRole.SUPER_ADMIN) {
            api.clinics.getById(storedClinicId).then(setCurrentClinic).catch(console.error);
          } else if (role !== UserRole.SUPER_ADMIN && !storedClinicId) {
            // Fallback or demo clinic
            api.clinics.getAll().then(list => {
              if (list.length > 0) setCurrentClinic(list[0]);
            });
          }
        }
      } catch (e) {
        console.error('Failed to parse stored auth', e);
        localStorage.removeItem('dentalflow_auth');
        sessionStorage.removeItem('dentalflow_auth');
      }
    }

    const handleAuthError = () => handleLogout();
    window.addEventListener('auth:unauthorized', handleAuthError);
    return () => window.removeEventListener('auth:unauthorized', handleAuthError);
  }, []);

  // Load Data
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const storedAuth = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        const isDemo = storedAuth ? JSON.parse(storedAuth).isDemo : false;

        if (isDemo && clinicId === 'demo-clinic-1') {
          const { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_SERVICES, DEMO_DOCTORS, DEMO_CLINIC, DEMO_PLAN, DEMO_CATEGORIES } = await import('./services/demoData');
          setCurrentClinic(DEMO_CLINIC);
          setPatients(DEMO_PATIENTS);
          setAppointments(DEMO_APPOINTMENTS);
          setTransactions(DEMO_TRANSACTIONS);
          setServices(DEMO_SERVICES);
          setCategories(DEMO_CATEGORIES);
          setDoctors(DEMO_DOCTORS);
          setPlans([DEMO_PLAN]);
          setInventoryItems([]);
        } else if (userRole === UserRole.SUPER_ADMIN) {
          const [plns, clns] = await Promise.all([
            api.plans.getAll(),
            api.clinics.getAll()
          ]);
          setPlans(plns);
          setClinics(clns);
        } else if (clinicId) {
          const [pts, appts, txs, svcs, docs, recs, plns, invItems, cats, revs, leadsData, clinicData] = await Promise.all([
            api.patients.getAll(clinicId),
            api.appointments.getAll(clinicId),
            api.transactions.getAll(clinicId),
            api.services.getAll(clinicId),
            api.doctors.getAll(clinicId),
            api.receptionists.getAll(clinicId),
            api.plans.getAll(),
            api.inventory.getAll(clinicId),
            api.categories.getAll(clinicId),
            api.reviews.getAll(clinicId),
            api.leads.getAll(clinicId),
            api.clinics.getById(clinicId)
          ]);
          setCurrentClinic(clinicData);
          setPatients(pts);
          setAppointments(appts);
          setTransactions(txs);
          setServices(svcs);
          setDoctors(docs);
          setReceptionists(recs);
          setPlans(plns);
          setInventoryItems(invItems);
          // @ts-ignore
          setCategories(cats);
          setReviews(revs || []);
          setLeads(leadsData || []);
        }
      } catch (error: any) {
        console.error('Failed to load data:', error);
        if (error.message === 'Session expired') {
          handleLogout();
        } else {
          setError('Ma\'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [isAuthenticated, clinicId, userRole]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Theme toggle
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // --- Auth Actions ---
  const handleLogin = (role: UserRole, name: string, clinicIdParam?: string, doctorIdParam?: string, receptionistIdParam?: string) => {
    setUserRole(role);
    setUserName(name);
    if (clinicIdParam) setClinicId(clinicIdParam);
    if (doctorIdParam) setDoctorId(doctorIdParam);
    if (receptionistIdParam) setReceptionistId(receptionistIdParam);
    setIsAuthenticated(true);

    // Navigate based on role
    if (role === UserRole.SUPER_ADMIN) {
      navigate('/admin');
    } else if (role === UserRole.RECEPTIONIST) {
      navigate('/patients');
    } else {
      navigate('/');
    }
    addToast('success', `Xush kelibsiz, ${name}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem('dentalflow_auth');
    sessionStorage.removeItem('dentalflow_auth');
    setIsAuthenticated(false);
    setUserRole(UserRole.CLINIC_ADMIN);
    setUserName('');
    setClinicId('');
    setDoctorId('');
    setReceptionistId('');
    navigate('/login');
  };

  const retryLoadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (userRole === UserRole.SUPER_ADMIN) {
        const [plns, clns] = await Promise.all([
          api.plans.getAll(),
          api.clinics.getAll()
        ]);
        setPlans(plns);
        setClinics(clns);
      } else if (clinicId) {
        const [pts, appts, txs, svcs, docs, recs, plns, invItems, cats, revs, leadsData] = await Promise.all([
          api.patients.getAll(clinicId),
          api.appointments.getAll(clinicId),
          api.transactions.getAll(clinicId),
          api.services.getAll(clinicId),
          api.doctors.getAll(clinicId),
          api.receptionists.getAll(clinicId),
          api.plans.getAll(),
          api.inventory.getAll(clinicId),
          api.categories.getAll(clinicId),
          api.reviews.getAll(clinicId),
          api.leads.getAll(clinicId)
        ]);
        setPatients(pts);
        setAppointments(appts);
        setTransactions(txs);
        setServices(svcs);
        setDoctors(docs);
        setReceptionists(recs);
        setPlans(plns);
        setInventoryItems(invItems);
        setCategories(cats);
        // @ts-ignore
        setReviews(revs || []);
        setLeads(leadsData || []);
      }
      addToast('success', 'Ma\'lumotlar muvaffaqiyatli yuklandi!');
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Ma\'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Actions ---
  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Patient Actions
  const addPatient = async (patient: Omit<Patient, 'id'>) => {
    try {
      let activeClinicId = clinicId;
      if (!activeClinicId) {
        const stored = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.clinicId) activeClinicId = parsed.clinicId;
        }
      }
      if (!activeClinicId) {
        addToast('error', 'Klinika aniqlanmadi. Iltimos sahafani yangilang.');
        return;
      }
      const newPatient = await api.patients.create({ ...patient, clinicId: activeClinicId });
      setPatients(prev => {
        if (prev.find(p => p.id === newPatient.id)) return prev;
        return [newPatient, ...prev];
      });
      addToast('success', `Bemor ${patient.firstName} muvaffaqiyatli qo'shildi!`);
      return newPatient;
    } catch (e: any) {
      console.error('Add patient error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const updatePatient = async (id: string, data: Partial<Patient>) => {
    try {
      const updated = await api.patients.update(id, data);
      setPatients(prev => prev.map(p => p.id === id ? updated : p));
      addToast('success', 'Bemor ma\'lumotlari yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deletePatient = async (id: string) => {
    try {
      await api.patients.delete(id);
      setPatients(prev => prev.filter(p => p.id !== id));
      addToast('info', 'Bemor o\'chirildi.');
      navigate('/patients');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  // Appointment Actions
  const addAppointment = async (appt: Omit<Appointment, 'id'>) => {
    try {
      const newAppt = await api.appointments.create({ ...appt, clinicId });
      setAppointments(prev => {
        const exists = prev.find(a => a.id === newAppt.id);
        if (exists) return prev.map(a => a.id === newAppt.id ? newAppt : a);
        return [...prev, newAppt];
      });
      addToast('success', 'Uchrashuv belgilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const updateAppointment = async (id: string, data: Partial<Appointment>) => {
    try {
      const updated = await api.appointments.update(id, data);
      setAppointments(prev => prev.map(a => a.id === id ? updated : a));
      addToast('success', 'Uchrashuv yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deleteAppointment = async (id: string) => {
    try {
      await api.appointments.delete(id);
      setAppointments(prev => prev.filter(a => a.id !== id));
      addToast('info', 'Uchrashuv bekor qilindi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  // Transaction Actions
  const addTransaction = async (tx: Omit<Transaction, 'id'>) => {
    try {
      const newTx = await api.transactions.create({ ...tx, clinicId });
      setTransactions(prev => {
        if (prev.find(t => t.id === newTx.id)) return prev;
        return [newTx, ...prev];
      });
      addToast('success', 'To\'lov qabul qilindi.');
    } catch (e: any) {
      console.error('Add transaction error:', e);
      addToast('error', e.message || 'To\'lovni saqlashda xatolik yuz berdi');
      throw e;
    }
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    try {
      console.log('Updating transaction:', id, data);
      const updated = await api.transactions.update(id, { ...data });
      setTransactions(prev => prev.map(t => t.id === id ? updated : t));
      addToast('success', 'To\'lov holati yangilandi.');
    } catch (e: any) {
      console.error('Transaction update error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  // Leads Actions
  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newLead = await api.leads.create({ ...lead, clinicId });
      setLeads(prev => [newLead, ...prev]);
      addToast('success', 'Yangi lid qo\'shildi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const updateLead = async (id: string, data: Partial<Lead>) => {
    try {
      const updated = await api.leads.update(id, data);
      setLeads(prev => prev.map(l => l.id === id ? updated : l));
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await api.leads.delete(id);
      setLeads(prev => prev.filter(l => l.id !== id));
      addToast('info', 'Lid o\'chirildi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const convertLeadToPatient = async (leadId: string, appointmentData: Partial<Appointment>) => {
    try {
      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      // 1. Create Patient
      const nameParts = lead.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      const newPatient = await api.patients.create({
        firstName,
        lastName,
        phone: lead.phone,
        dob: '',
        gender: 'Male',
        status: 'Active',
        lastVisit: 'Never',
        medicalHistory: lead.notes || '',
        clinicId,
      });

      setPatients(prev => {
        if (prev.find(p => p.id === newPatient.id)) return prev;
        return [newPatient, ...prev];
      });

      // 2. Schedule Appointment
      const doctor = doctors.find(d => d.id === appointmentData.doctorId);
      if (doctor) {
        await addAppointment({
          patientId: newPatient.id,
          patientName: `${newPatient.lastName} ${newPatient.firstName}`,
          doctorId: doctor.id,
          doctorName: `Dr. ${doctor.lastName} ${doctor.firstName}`,
          type: appointmentData.type || 'Konsultatsiya',
          date: appointmentData.date || new Date().toISOString().split('T')[0],
          time: appointmentData.time || '12:00',
          duration: appointmentData.duration || 60,
          status: 'Pending',
          notes: lead.service ? `Qiziqish bildirdi: ${lead.service}` : '',
          clinicId,
        });
      }

      // 3. Update Lead Status
      await updateLead(leadId, { status: 'Booked' });

      addToast('success', 'Lid mijozga aylantirildi va qabulga yozildi!');
    } catch (e: any) {
      addToast('error', e.message || 'Lidni aylantirishda xatolik yuz berdi');
    }
  };

  // Settings Actions
  const addService = async (service: Omit<Service, 'id' | 'clinicId'>) => {
    try {
      const newService = await api.services.create({ ...service, duration: service.duration || 60, clinicId });
      setServices(prev => {
        if (prev.find(s => s.id === newService.id)) return prev;
        return [...prev, newService];
      });
      addToast('success', 'Yangi xizmat qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateService = async (index: number, service: Partial<Service>) => {
    const serviceToUpdate = services[index];
    if (serviceToUpdate && serviceToUpdate.id) {
      try {
        const updated = await api.services.update(serviceToUpdate.id, { ...service, duration: service.duration || 60 });
        setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
        addToast('success', 'Xizmat yangilandi.');
      } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
    }
  };

  const addDoctor = async (doctor: Omit<Doctor, 'id'>) => {
    try {
      const newDoc = await api.doctors.create({ ...doctor, clinicId });
      setDoctors(prev => {
        if (prev.find(d => d.id === newDoc.id)) return prev;
        return [...prev, newDoc];
      });
      addToast('success', 'Yangi shifokor qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateDoctor = async (id: string, data: Partial<Doctor>) => {
    try {
      const updated = await api.doctors.update(id, data);
      setDoctors(prev => prev.map(d => d.id === id ? updated : d));
      addToast('success', 'Shifokor ma\'lumotlari yangilandi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const deleteDoctor = async (id: string) => {
    try {
      await api.doctors.delete(id);
      setDoctors(prev => prev.filter(d => d.id !== id));
      addToast('info', 'Shifokor o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const addReceptionist = async (receptionist: Omit<Receptionist, 'id'>) => {
    try {
      const newRec = await api.receptionists.create({ ...receptionist, clinicId });
      setReceptionists(prev => [...prev, newRec]);
      addToast('success', 'Yangi resepshn qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateReceptionist = async (id: string, data: Partial<Receptionist>) => {
    try {
      const updated = await api.receptionists.update(id, data);
      setReceptionists(prev => prev.map(r => r.id === id ? updated : r));
      addToast('success', 'Resepshn ma\'lumotlari yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deleteReceptionist = async (id: string) => {
    try {
      await api.receptionists.delete(id);
      setReceptionists(prev => prev.filter(r => r.id !== id));
      addToast('info', 'Resepshn o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };



  // Inventory Actions
  const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newItem = await api.inventory.create({ ...item, clinicId });
      setInventoryItems(prev => [...prev, newItem]);
      addToast('success', 'Material qo\'shildi!');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateInventoryStock = async (id: string, data: { change: number; type: 'IN' | 'OUT'; note?: string; userName: string }) => {
    try {
      const updated = await api.inventory.updateStock(id, data);
      setInventoryItems(prev => prev.map(item => item.id === id ? updated : item));
      addToast('success', 'Miqdor yangilandi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const deleteInventoryItem = async (id: string) => {
    try {
      await api.inventory.delete(id);
      setInventoryItems(prev => prev.filter(item => item.id !== id));
      addToast('info', 'Material o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  // Category Actions
  const addCategory = async (category: Omit<ServiceCategory, 'id' | 'clinicId'>) => {
    try {
      const newCategory = await api.categories.create({ ...category, clinicId });
      setCategories(prev => [...prev, newCategory]);
      addToast('success', 'Kategoriya qo\'shildi!');
    } catch (e) { addToast('error', 'Xatolik yuz berdi'); }
  };

  const deleteCategory = async (id: string) => {
    try {
      await api.categories.delete(id);
      setCategories(prev => prev.filter(c => c.id !== id));
      addToast('info', 'Kategoriya o\'chirildi.');
    } catch (e) { addToast('error', 'Xatolik yuz berdi'); }
  };

  // --- Super Admin Actions ---
  const addClinic = async (clinic: Omit<Clinic, 'id'>) => {
    try {
      const newClinic = await api.clinics.create(clinic);
      setClinics(prev => [...prev, newClinic]);
      addToast('success', 'Yangi klinika yaratildi!');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateClinic = async (id: string, data: Partial<Clinic>) => {
    try {
      const updated = await api.clinics.update(id, data);
      setClinics(prev => prev.map(c => c.id === id ? updated : c));
      addToast('success', 'Klinika yangilandi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const deleteClinic = async (id: string) => {
    try {
      await api.clinics.delete(id);
      setClinics(prev => prev.filter(c => c.id !== id));
      addToast('info', "Klinika o'chirildi.");
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updatePlan = async (id: string, data: Partial<SubscriptionPlan>) => {
    try {
      const updated = await api.plans.update(id, data);
      setPlans(prev => prev.map(p => p.id === id ? updated : p));
      addToast('success', 'Tarif yangilandi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  // --- Navigation ---
  const handlePatientClick = (id: string) => {
    navigate(`/patients/${id}`);
  };

  // Select navigation
  const CURRENT_NAVIGATION = userRole === UserRole.SUPER_ADMIN ? SUPER_ADMIN_NAVIGATION : CLINIC_NAVIGATION;

  // --- Main Render ---
  if (!isAuthenticated) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<SignIn onLogin={handleLogin} />} />
          <Route path="*" element={<SignIn onLogin={handleLogin} />} />
        </Routes>
        <InstallPWAButton />
      </>
    );
  }

  // Loading Screen
  if (isLoading && !error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Ma'lumotlar yuklanmoqda...</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Iltimos, kuting</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Xatolik yuz berdi</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={retryLoadData}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Yuklanmoqda...' : 'Qayta yuklash'}
            </button>
            <button
              onClick={handleLogout}
              className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
            >
              Chiqish
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
            Ma'lumotlaringiz xavfsiz. Bu faqat ulanish muammosi.
          </p>
        </div>
      </div>
    );
  }

  const pageLabel = getPageLabel(location.pathname);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <InstallPWAButton />

      {/* Mobile Header (Hidden on Desktop) */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="flex items-center gap-2 font-bold text-xl text-[#1B6AFB] dark:text-blue-400">
          <div className="w-8 h-8 rounded-[8px] overflow-hidden shadow-sm">
            <img src="/logo-icon.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          DentaCRM
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Sidebar Drawer (Hidden on Desktop) */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full pb-16">
          <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 font-bold text-xl text-[#1B6AFB] dark:text-blue-400">
              <div className="w-8 h-8 rounded-[8px] overflow-hidden shadow-sm">
                <img src="/logo-icon.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              DentaCRM
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="ml-auto p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {CURRENT_NAVIGATION.filter(nav => nav.roles.includes(userRole)).map((item) => {
              const to = item.id === 'dashboard' ? '/' : `/${item.id}`;
              return (
                <NavLink
                  key={item.id}
                  to={to}
                  end={item.id === 'dashboard'}
                  onClick={() => setIsSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-colors group ${isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'))
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`
                  }
                >
                  <item.icon className={`w-5 h-5 mr-3 ${location.pathname === to || (item.id === 'patients' && location.pathname.startsWith('/patients'))
                    ? 'text-[#1B6AFB] dark:text-blue-400'
                    : 'text-gray-400 group-hover:text-gray-500'
                    }`} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center overflow-hidden flex-1 mr-2">
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs uppercase ${userRole === UserRole.SUPER_ADMIN ? 'bg-purple-600' : 'bg-[#1B6AFB]'}`}>
                  {userName ? userName.slice(0, 2) : 'A'}
                </div>
                <div className="ml-3 truncate">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={userName}>{userName}</p>
                  <p className="text-xs text-gray-500 capitalize">{userRole === UserRole.SUPER_ADMIN ? 'SaaS Owner' : userRole === UserRole.CLINIC_ADMIN ? 'Administrator' : userRole === UserRole.RECEPTIONIST ? 'Resepshn' : 'Shifokor'}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 flex-shrink-0" title="Chiqish">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop Top Navbar (Hidden on Mobile) */}
      <header className="hidden lg:block fixed top-0 inset-x-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
        {/* Center container for alignment with main content */}
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14">
          {/* Top Row: Logo, Search, Actions */}
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <div className="flex items-center gap-3 font-extrabold text-[#1B6AFB] dark:text-blue-400 text-2xl tracking-tight">
                <div className="w-10 h-10 rounded-[10px] overflow-hidden shadow-md">
                  <img src="/logo-icon.png" alt="DentaCRM" className="w-full h-full object-cover" />
                </div>
                DentaCRM
              </div>

              {clinicId === 'demo-clinic-1' && (
                <span className="px-2 py-1 text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-[#1B6AFB] dark:text-blue-400 rounded-full border border-blue-200 dark:border-blue-800">
                  🧪 DEMO MODE
                </span>
              )}

              {/* Search and Branch Control */}
              <div className="flex items-center gap-3 ml-4 bg-gray-50 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Bemor yoki shifokor..."
                    value={searchBarTerm}
                    onChange={(e) => setSearchBarTerm(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    className="pl-9 pr-4 py-2 w-72 bg-white dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 placeholder-gray-400 transition-all outline-none"
                  />

                  {/* Search Results Dropdown */}
                  {isSearchFocused && searchBarTerm.length >= 2 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsSearchFocused(false)}></div>
                      <div className="absolute top-full left-0 mt-2 w-[340px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                        {searchResults.patients.length === 0 && searchResults.doctors.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Natija topilmadi</p>
                            <p className="text-xs text-gray-500 mt-1">Boshqa so'z bilan urinib ko'ring</p>
                          </div>
                        ) : (
                          <div className="max-h-[420px] overflow-y-auto no-scrollbar py-2">
                            {searchResults.patients.length > 0 && (
                              <div className="px-2 mb-2">
                                <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  <Users className="w-3 h-3" />
                                  Bemorlar
                                </div>
                                {searchResults.patients.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      navigate(`/patients/${p.id}`);
                                      setSearchBarTerm('');
                                      setIsSearchFocused(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#1B6AFB]/5 dark:hover:bg-blue-400/10 group transition-all text-left"
                                  >
                                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs shrink-0 group-hover:scale-110 transition-transform">
                                      {p.firstName[0]}{p.lastName[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                        {p.firstName} {p.lastName}
                                      </p>
                                      <p className="text-[11px] text-gray-500 truncate">{p.phone}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}

                            {searchResults.doctors.length > 0 && (
                              <div className="px-2 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                                <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  <Activity className="w-3 h-3" />
                                  Shifokorlar
                                </div>
                                {searchResults.doctors.map(d => (
                                  <button
                                    key={d.id}
                                    onClick={() => {
                                      navigate(`/doctors/${d.id}`);
                                      setSearchBarTerm('');
                                      setIsSearchFocused(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#1B6AFB]/5 dark:hover:bg-blue-400/10 group transition-all text-left"
                                  >
                                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0 group-hover:scale-110 transition-transform">
                                      {d.firstName[0]}{d.lastName[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                        Dr. {d.firstName} {d.lastName}
                                      </p>
                                      <p className="text-[11px] text-gray-500 truncate">{d.specialty}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700/50 text-center">
                          <p className="text-[10px] text-gray-400 font-medium">Barcha natijalarni ko'rish uchun "Enter" ni bosing</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>


              </div>
            </div>

            <div className="flex items-center gap-5">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {new Date().toLocaleDateString('uz-UZ', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* User Profile Info */}
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700 ml-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm uppercase shadow-sm ${userRole === UserRole.SUPER_ADMIN ? 'bg-purple-600' : 'bg-[#1B6AFB]'}`}>
                  {userName ? userName.slice(0, 2) : 'A'}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{userName}</span>
                  <span className="text-xs text-gray-500 capitalize leading-tight">
                    {userRole === UserRole.SUPER_ADMIN ? 'SaaS Owner' : userRole === UserRole.CLINIC_ADMIN ? 'Administrator' : userRole === UserRole.RECEPTIONIST ? 'Resepshn' : 'Shifokor'}
                  </span>
                </div>
                <button onClick={handleLogout} className="ml-2 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Chiqish">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Navigation Links */}
        <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/80">
          <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14">
            <div className="h-12 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {CURRENT_NAVIGATION.filter(nav => nav.roles.includes(userRole)).map((item) => {
                const to = item.id === 'dashboard' ? '/' : `/${item.id}`;
                return (
                  <NavLink
                    key={item.id}
                    to={to}
                    end={item.id === 'dashboard'}
                    className={({ isActive }) => {
                      const active = isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'));
                      return `relative flex items-center h-12 px-4 text-sm font-medium transition-colors whitespace-nowrap group ${active
                        ? 'text-[#1B6AFB] dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`
                    }}
                  >
                    {({ isActive }) => {
                      const active = isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'));
                      return (
                        <>
                          <item.icon className={`w-4 h-4 mr-2 ${active ? 'text-[#1B6AFB] dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                          {item.label}
                          {active && (
                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#1B6AFB] dark:bg-blue-400 rounded-t-full"></span>
                          )}
                        </>
                      );
                    }}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 lg:pt-28 min-h-screen flex flex-col items-center">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14 py-4 sm:py-6 lg:py-8 flex-1 overflow-x-hidden pb-24 lg:pb-8">
          <Routes>

            <>
              {/* Role-based default routes */}
              {userRole === UserRole.SUPER_ADMIN ? (
                <>
                  <Route path="/" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin" element={
                    <SuperAdminDashboard
                      clinics={clinics}
                      plans={plans}
                      onAddClinic={addClinic}
                      onUpdateClinic={updateClinic}
                      onUpdatePlan={updatePlan}
                      onDeleteClinic={deleteClinic}
                    />
                  } />
                </>
              ) : userRole === UserRole.RECEPTIONIST ? (
                <Route path="/" element={<Navigate to="/patients" replace />} />
              ) : (
                <Route path="/" element={
                  <Dashboard
                    patients={patients}
                    appointments={appointments}
                    transactions={transactions}
                    reviews={reviews}
                    userRole={userRole}
                    doctorId={doctorId}
                    doctors={doctors}
                  />
                } />
              )}

              <Route path="/patients" element={
                <Patients
                  patients={patients}
                  doctors={doctors}
                  appointments={appointments}
                  transactions={transactions}
                  onPatientClick={handlePatientClick}
                  onAddPatient={addPatient}
                  onDeletePatient={deletePatient}
                  onUpdatePatient={updatePatient}
                />
              } />

              <Route path="/leads" element={
                <Leads
                  leads={leads}
                  doctors={doctors}
                  categories={categories}
                  services={services}
                  currentClinic={currentClinic}
                  onAddLead={addLead}
                  onUpdateLead={updateLead}
                  onDeleteLead={deleteLead}
                  onConvertLead={convertLeadToPatient}
                />
              } />

              <Route path="/patients/:patientId" element={
                <PatientDetails
                  patientId={null}
                  patients={patients}
                  appointments={appointments}
                  transactions={transactions}
                  doctors={doctors}
                  services={services}
                  categories={categories}
                  currentClinic={currentClinic}
                  plans={plans}
                  userRole={userRole}
                  onBack={() => navigate('/patients')}
                  onUpdatePatient={updatePatient}
                  onAddTransaction={addTransaction}
                  onUpdateTransaction={updateTransaction}
                  onAddAppointment={addAppointment}
                  onUpdateAppointment={updateAppointment}
                />
              } />

              <Route path="/calendar" element={
                <Calendar
                  appointments={appointments}
                  patients={patients}
                  doctors={doctors}
                  services={services}
                  categories={categories}
                  onAddAppointment={addAppointment}
                  onUpdateAppointment={updateAppointment}
                  onDeleteAppointment={deleteAppointment}
                  onAddPatient={addPatient}
                  userRole={userRole}
                  doctorId={doctorId}
                  currentClinic={currentClinic}
                  plans={plans}
                  onPatientClick={handlePatientClick}
                />
              } />

              <Route path="/finance" element={
                <Finance
                  userRole={userRole}
                  transactions={transactions}
                  appointments={appointments}
                  services={services}
                  patients={patients}
                  onPatientClick={handlePatientClick}
                  doctorId={doctorId}
                  doctors={doctors}
                />
              } />

              <Route path="/doctors" element={
                <DoctorsAnalytics
                  doctors={doctors}
                  appointments={appointments}
                  services={services}
                  transactions={transactions}
                  reviews={reviews}
                />
              } />

              <Route path="/doctors/:doctorId" element={
                <DoctorDetails
                  doctorId="" // Will be handled by useParams in a wrapper or directly if we use useParams inside DoctorDetails, but wait, let's just make DoctorDetails use useParams or pass a wrapper.
                  doctors={doctors}
                  appointments={appointments}
                  transactions={transactions}
                  patients={patients}
                  services={services}
                  onBack={() => navigate('/doctors')}
                  onPatientClick={handlePatientClick}
                />
              } />

              <Route path="/inventory" element={
                <Inventory
                  items={inventoryItems}
                  userName={userName}
                  onAddItem={addInventoryItem}
                  onUpdateStock={updateInventoryStock}
                  onDeleteItem={deleteInventoryItem}
                />
              } />

              <Route path="/settings" element={
                <Settings
                  userRole={userRole}
                  services={services}
                  categories={categories}
                  doctors={doctors}
                  receptionists={receptionists}
                  onAddService={addService}
                  onUpdateService={updateService}
                  onAddCategory={addCategory}
                  onDeleteCategory={deleteCategory}
                  onAddDoctor={addDoctor}
                  onUpdateDoctor={updateDoctor}
                  onDeleteDoctor={deleteDoctor}
                  onAddReceptionist={addReceptionist}
                  onUpdateReceptionist={updateReceptionist}
                  onDeleteReceptionist={deleteReceptionist}
                  plans={plans}
                  reviews={reviews}
                />
              } />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          </Routes>
        </div>
      </main>

      <BottomNav
        userRole={userRole}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return <AppContent />;
};

export default App;
