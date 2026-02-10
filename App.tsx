
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, Calendar as CalendarIcon,
  DollarSign, Settings as SettingsIcon, Menu, X, Moon, Sun, LogOut,
  Building2, Shield, Activity, RefreshCw, AlertTriangle, Loader2, Package, MessageSquare, Star
} from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { PatientDetails } from './pages/PatientDetails';
import { Calendar } from './pages/Calendar';
import { Finance } from './pages/Finance';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { DoctorsAnalytics } from './pages/DoctorsAnalytics';
import { Inventory } from './pages/Inventory';
import { NavItem, UserRole, Patient, Appointment, Transaction, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, InventoryItem, ServiceCategory } from './types';
import { ToastContainer, ToastMessage } from './components/Common';
import { InstallPWAButton } from './components/InstallPWAButton';
import { api } from './services/api';

// --- Router Logic ---
enum Route {
  DASHBOARD = 'dashboard',
  PATIENTS = 'patients',
  PATIENT_DETAILS = 'patient_details',
  CALENDAR = 'calendar',
  FINANCE = 'finance',
  SETTINGS = 'settings',
  DOCTORS_ANALYTICS = 'doctors_analytics',
  INVENTORY = 'inventory',
  // Super Admin Routes
  SAAS_DASHBOARD = 'saas_dashboard',
}

// Navigation for Clinic Admin and Doctors
const CLINIC_NAVIGATION: NavItem[] = [
  { id: Route.DASHBOARD, label: 'Boshqaruv Paneli', icon: LayoutDashboard, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: Route.PATIENTS, label: 'Bemorlar', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: Route.CALENDAR, label: 'Kalendar', icon: CalendarIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: Route.FINANCE, label: 'Moliya', icon: DollarSign, roles: [UserRole.CLINIC_ADMIN] }, // Admin only
  { id: Route.DOCTORS_ANALYTICS, label: 'Shifokorlar', icon: Activity, roles: [UserRole.CLINIC_ADMIN] }, // Admin only
  { id: Route.INVENTORY, label: 'Ombor', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: Route.SETTINGS, label: 'Sozlamalar', icon: SettingsIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
];

// Navigation for Super Admin
const SUPER_ADMIN_NAVIGATION: NavItem[] = [
  { id: Route.SAAS_DASHBOARD, label: 'SaaS Dashboard', icon: Building2, roles: [UserRole.SUPER_ADMIN] },
  // Reuse settings? Or make specific settings. For now just Dashboard which contains tabs.
];

import { BottomNav } from './components/BottomNav';

const App: React.FC = () => {
  // --- Global State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<Route>(Route.DASHBOARD);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.CLINIC_ADMIN);
  const [userName, setUserName] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>(''); // For doctor role
  const [receptionistId, setReceptionistId] = useState<string>(''); // For receptionist role
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data Store
  // Data Store
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  // Super Admin Data Store
  const [clinics, setClinics] = useState<Clinic[]>([]);
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
          if (storedClinicId) {
            setClinicId(storedClinicId);
          }
          if (storedDoctorId) {
            setDoctorId(storedDoctorId);
          }
          if (storedReceptionistId) {
            setReceptionistId(storedReceptionistId);
          }
          setIsAuthenticated(true);
          if (role === UserRole.SUPER_ADMIN) {
            setCurrentRoute(Route.SAAS_DASHBOARD);
          } else {
            setCurrentRoute(Route.DASHBOARD);
          }
        }
      } catch (e) {
        console.error('Failed to parse stored auth', e);
        localStorage.removeItem('dentalflow_auth');
        sessionStorage.removeItem('dentalflow_auth');
      }
    }

    const handleAuthError = () => {
      handleLogout();
    };

    window.addEventListener('auth:unauthorized', handleAuthError);
    return () => window.removeEventListener('auth:unauthorized', handleAuthError);
  }, []);

  // Load Data
  // Load Data
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Check if demo mode
        const storedAuth = sessionStorage.getItem('dentalflow_auth') || localStorage.getItem('dentalflow_auth');
        const isDemo = storedAuth ? JSON.parse(storedAuth).isDemo : false;

        if (isDemo && clinicId === 'demo-clinic-1') {
          // Load demo data
          const { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_SERVICES, DEMO_DOCTORS, DEMO_CLINIC, DEMO_PLAN, DEMO_CATEGORIES } = await import('./services/demoData');

          setPatients(DEMO_PATIENTS);
          setAppointments(DEMO_APPOINTMENTS);
          setTransactions(DEMO_TRANSACTIONS);
          setServices(DEMO_SERVICES);
          setCategories(DEMO_CATEGORIES);
          setDoctors(DEMO_DOCTORS);
          setClinics([DEMO_CLINIC]);
          setPlans([DEMO_PLAN]);
          setInventoryItems([]);
        } else if (userRole === UserRole.SUPER_ADMIN) {
          const [clns, plns] = await Promise.all([
            api.clinics.getAll(),
            api.plans.getAll()
          ]);
          setClinics(clns);
          setPlans(plns);
        } else if (clinicId) {
          const [pts, appts, txs, svcs, docs, recs, clns, plns, invItems, cats, revs] = await Promise.all([
            api.patients.getAll(clinicId),
            api.appointments.getAll(clinicId),
            api.transactions.getAll(clinicId),
            api.services.getAll(clinicId),
            api.doctors.getAll(clinicId),
            api.receptionists.getAll(clinicId),
            api.clinics.getAll(),
            api.plans.getAll(),
            api.inventory.getAll(clinicId),
            api.categories.getAll(clinicId),
            api.reviews.getAll(clinicId)
          ]);
          setPatients(pts);
          setAppointments(appts);
          setTransactions(txs);
          setServices(svcs);
          setDoctors(docs);
          setReceptionists(recs);
          setClinics(clns);
          setPlans(plns);
          setInventoryItems(invItems);
          // @ts-ignore
          setCategories(cats);
          setReviews(revs || []);
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
    if (clinicIdParam) {
      setClinicId(clinicIdParam);
    }
    if (doctorIdParam) {
      setDoctorId(doctorIdParam);
    }
    if (receptionistIdParam) {
      setReceptionistId(receptionistIdParam);
    }
    setIsAuthenticated(true);
    // Set default route based on role
    if (role === UserRole.SUPER_ADMIN) {
      setCurrentRoute(Route.SAAS_DASHBOARD);
    } else {
      setCurrentRoute(Route.DASHBOARD);
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
  };

  const retryLoadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (userRole === UserRole.SUPER_ADMIN) {
        const [clns, plns] = await Promise.all([
          api.clinics.getAll(),
          api.plans.getAll()
        ]);
        setClinics(clns);
        setPlans(plns);
      } else if (clinicId) {
        const [pts, appts, txs, svcs, docs, recs, clns, plns, invItems, cats, revs] = await Promise.all([
          api.patients.getAll(clinicId),
          api.appointments.getAll(clinicId),
          api.transactions.getAll(clinicId),
          api.services.getAll(clinicId),
          api.doctors.getAll(clinicId),
          api.receptionists.getAll(clinicId),
          api.clinics.getAll(),
          api.plans.getAll(),
          api.inventory.getAll(clinicId),
          api.categories.getAll(clinicId),
          api.reviews.getAll(clinicId)
        ]);
        setPatients(pts);
        setAppointments(appts);
        setTransactions(txs);
        setServices(svcs);
        setDoctors(docs);
        setReceptionists(recs);
        setClinics(clns);
        setPlans(plns);
        setInventoryItems(invItems);
        setCategories(cats);
        // @ts-ignore
        setReviews(revs || []);
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
  // Patient Actions
  const addPatient = async (patient: Omit<Patient, 'id'>) => {
    try {
      // Safety check for clinicId
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
    } catch (e: any) {
      console.error('Add patient error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
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
      if (selectedPatientId === id) setCurrentRoute(Route.PATIENTS);
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  // Appointment Actions
  // Appointment Actions
  const addAppointment = async (appt: Omit<Appointment, 'id'>) => {
    try {
      const newAppt = await api.appointments.create({ ...appt, clinicId });

      // FIX: Check if appointment already exists (backend might return existing one if deduped)
      setAppointments(prev => {
        const exists = prev.find(a => a.id === newAppt.id);
        if (exists) {
          // Update existing
          return prev.map(a => a.id === newAppt.id ? newAppt : a);
        }
        // Add new
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
      throw e; // Re-throw to allow component to handle it (e.g. stop state reset)
    }
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    try {
      console.log('Updating transaction:', id, data);
      // Only send the fields we want to update
      const updateData = { ...data };
      const updated = await api.transactions.update(id, updateData);
      setTransactions(prev => prev.map(t => t.id === id ? updated : t));
      addToast('success', 'To\'lov holati yangilandi.');
    } catch (e: any) {
      console.error('Transaction update error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  // Settings Actions
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

  // Super Admin Actions
  // Super Admin Actions
  const addClinic = async (clinic: Omit<Clinic, 'id'>) => {
    try {
      const newClinic = await api.clinics.create(clinic);
      setClinics(prev => [...prev, newClinic]);
      addToast('success', 'Yangi klinika yaratildi!');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const updateClinic = async (id: string, data: Partial<Clinic>) => {
    try {
      const updated = await api.clinics.update(id, data);
      setClinics(prev => prev.map(c => c.id === id ? updated : c));
      addToast('success', 'Klinika ma\'lumotlari yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const updatePlan = async (id: string, data: Partial<SubscriptionPlan>) => {
    try {
      const updated = await api.plans.update(id, data);
      setPlans(prev => prev.map(p => p.id === id ? updated : p));
      addToast('success', 'Tarif rejasi yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deleteClinic = async (id: string) => {
    try {
      await api.clinics.delete(id);
      setClinics(prev => prev.filter(c => c.id !== id));
      addToast('info', 'Klinika o\'chirildi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
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

  // --- Navigation ---
  const handleNavigate = (route: Route) => {
    setCurrentRoute(route);
    setIsSidebarOpen(false);
  };

  const handlePatientClick = (id: string) => {
    setSelectedPatientId(id);
    setCurrentRoute(Route.PATIENT_DETAILS);
  };

  // Content Renderer
  const renderContent = () => {
    if (userRole === UserRole.SUPER_ADMIN) {
      // Super Admin View
      return <SuperAdminDashboard
        clinics={clinics}
        plans={plans}
        onAddClinic={addClinic}
        onUpdateClinic={updateClinic}
        onUpdatePlan={updatePlan}
        onDeleteClinic={deleteClinic}
      />;
    }

    // Standard Clinic View
    switch (currentRoute) {
      case Route.DASHBOARD:
        return <Dashboard patients={patients} appointments={appointments} transactions={transactions} reviews={reviews} userRole={userRole} doctorId={doctorId} />;
      case Route.PATIENTS:
        return <Patients patients={patients} onPatientClick={handlePatientClick} onAddPatient={addPatient} onDeletePatient={deletePatient} />;
      case Route.PATIENT_DETAILS:
        return (
          <PatientDetails
            patientId={selectedPatientId}
            patients={patients}
            appointments={appointments}
            transactions={transactions}
            doctors={doctors}
            services={services}
            categories={categories}
            currentClinic={clinics.find(c => c.id === clinicId)}
            plans={plans}
            onBack={() => {
              setSelectedPatientId(null);
              setCurrentRoute(Route.PATIENTS);
            }}
            onUpdatePatient={updatePatient}
            onAddTransaction={addTransaction}
            onUpdateTransaction={updateTransaction}
            onAddAppointment={addAppointment}
            onUpdateAppointment={updateAppointment}
          />
        );
      case Route.CALENDAR:
        return <Calendar
          appointments={appointments}
          patients={patients}
          doctors={doctors}
          services={services}
          categories={categories}
          onAddAppointment={addAppointment}
          onUpdateAppointment={updateAppointment}
          onDeleteAppointment={deleteAppointment}
          userRole={userRole}
          doctorId={doctorId}
          currentClinic={clinics.find(c => c.id === clinicId)}
          plans={plans}
        />;
      case Route.DOCTORS_ANALYTICS:
        return <DoctorsAnalytics
          doctors={doctors}
          appointments={appointments}
          services={services}
          transactions={transactions}
          reviews={reviews}
        />;
      case Route.FINANCE:
        return <Finance
          userRole={userRole}
          transactions={transactions}
          appointments={appointments}
          services={services}
          patients={patients}
          onPatientClick={handlePatientClick}
          doctorId={doctorId}
          doctors={doctors}
        />;
      case Route.SETTINGS:
        return <Settings
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
          currentClinic={clinics.find(c => c.id === clinicId)}
          plans={plans}
          reviews={reviews}
        />;
      case Route.INVENTORY:
        return <Inventory
          items={inventoryItems}
          userName={userName}
          onAddItem={addInventoryItem}
          onUpdateStock={updateInventoryStock}
          onDeleteItem={deleteInventoryItem}
        />;
      default: return <Dashboard patients={patients} appointments={appointments} transactions={transactions} userRole={userRole} doctorId={doctorId} />;
    }
  };

  // Select navigation based on role
  const CURRENT_NAVIGATION = userRole === UserRole.SUPER_ADMIN ? SUPER_ADMIN_NAVIGATION : CLINIC_NAVIGATION;
  const currentNav = CURRENT_NAVIGATION.find(n => n.id === currentRoute);

  // --- Main Render ---
  if (!isAuthenticated) {
    return (
      <>
        <SignIn onLogin={handleLogin} />
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <InstallPWAButton />

      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="flex items-center gap-2 font-bold text-xl text-blue-600 dark:text-blue-400">
          <span className="p-1 rounded bg-blue-600 text-white">DC</span> DentaCRM
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 font-bold text-xl text-blue-600 dark:text-blue-400">
              {userRole === UserRole.SUPER_ADMIN ? (
                <>
                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white">
                    <Shield className="w-5 h-5" />
                  </div>
                  SuperAdmin
                </>
              ) : (
                <>
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  DentaCRM
                </>
              )}
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {CURRENT_NAVIGATION.filter(nav => nav.roles.includes(userRole)).map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id as Route)}
                className={`flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-colors group
                  ${(currentRoute === item.id || (currentRoute === Route.PATIENT_DETAILS && item.id === Route.PATIENTS))
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
              >
                <item.icon className={`w-5 h-5 mr-3 ${(currentRoute === item.id || (currentRoute === Route.PATIENT_DETAILS && item.id === Route.PATIENTS)) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500'}`} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center overflow-hidden">
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs uppercase ${userRole === UserRole.SUPER_ADMIN ? 'bg-purple-600' : 'bg-blue-600'}`}>
                  {userName ? userName.slice(0, 2) : 'A'}
                </div>
                <div className="ml-3 truncate">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={userName}>{userName}</p>
                  <p className="text-xs text-gray-500 capitalize">{userRole === UserRole.SUPER_ADMIN ? 'SaaS Owner' : userRole === UserRole.CLINIC_ADMIN ? 'Administrator' : userRole === UserRole.RECEPTIONIST ? 'Resepshn' : 'Shifokor'}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-red-500 ml-2"
                title="Chiqish"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="lg:ml-64 min-h-screen flex flex-col">
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 hidden lg:flex items-center justify-between px-8 sticky top-0 z-20">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            {userRole === UserRole.SUPER_ADMIN ? 'Super Admin' : (currentRoute === Route.PATIENT_DETAILS ? 'Bemor Profili' : currentNav?.label)}
          </h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
            <span className="font-bold text-xl text-gray-900 dark:text-white">DentaCRM</span>
            {clinicId === 'demo-clinic-1' && (
              <span className="px-2 py-1 text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full border border-blue-200 dark:border-blue-800">
                🧪 DEMO MODE
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-8 overflow-x-hidden pb-24 lg:pb-8">
          {renderContent()}
        </div>
      </main>

      <BottomNav
        currentRoute={currentRoute}
        onNavigate={(route) => handleNavigate(route)}
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

export default App;
