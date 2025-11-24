import React, { useState } from 'react';
import { ArrowLeft, Calendar, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { TeethChart } from '../components/TeethChart';
import { ToothStatus, Patient, Appointment, Transaction } from '../types';

interface PatientDetailsProps {
  patientId: string | null;
  patients: Patient[];
  appointments: Appointment[];
  transactions: Transaction[];
  onBack: () => void;
  onUpdatePatient: (id: string, data: Partial<Patient>) => void;
  onAddTransaction: (tx: Omit<Transaction, 'id'>) => void;
  onAddAppointment: (appt: Omit<Appointment, 'id'>) => void;
}

export const PatientDetails: React.FC<PatientDetailsProps> = ({ 
  patientId, patients, appointments, transactions, 
  onBack, onUpdatePatient, onAddTransaction, onAddAppointment 
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'appointments' | 'payments'>('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  
  const patient = patients.find(p => p.id === patientId);
  
  // Edit Form State
  const [editFormData, setEditFormData] = useState<Partial<Patient>>({});
  // Payment Form State
  const [paymentData, setPaymentData] = useState({ amount: '', service: '', type: 'Cash' });

  if (!patient) {
    return <div className="p-8 text-center">Bemor topilmadi <Button onClick={onBack}>Ortga</Button></div>;
  }

  // Filter related data
  const patientAppointments = appointments.filter(a => a.patientId === patient.id);
  const patientTransactions = transactions.filter(t => t.patientName.includes(patient.firstName)); // Simple match for demo

  const handleEditOpen = () => {
    setEditFormData(patient);
    setIsEditModalOpen(true);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePatient(patient.id, editFormData);
    setIsEditModalOpen(false);
  };

  const handlePaymentSave = (e: React.FormEvent) => {
    e.preventDefault();
    onAddTransaction({
      patientName: `${patient.firstName} ${patient.lastName}`,
      date: new Date().toISOString().split('T')[0],
      amount: Number(paymentData.amount),
      service: paymentData.service,
      type: paymentData.type as any,
      status: 'Paid'
    });
    setIsPaymentModalOpen(false);
    setPaymentData({ amount: '', service: '', type: 'Cash' });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Top Nav */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="!p-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bemor Profili</h1>
      </div>

      {/* Header Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
           <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-200 flex items-center justify-center text-3xl font-bold flex-shrink-0">
              {patient.firstName[0]}{patient.lastName[0]}
           </div>
           <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              <div className="space-y-1">
                 <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{patient.firstName} {patient.lastName}</h2>
                 <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <span className="capitalize">{patient.gender === 'Male' ? 'Erkak' : 'Ayol'}</span> • {patient.dob ? (new Date().getFullYear() - new Date(patient.dob).getFullYear()) : 'N/A'} yosh
                 </p>
                 <div className="pt-2">
                    <Badge status={patient.status} />
                 </div>
              </div>
              
              <div className="space-y-3 text-sm">
                 <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <Phone className="w-4 h-4" /> {patient.phone}
                 </div>
                 <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <MapPin className="w-4 h-4" /> Tashkent, Uzbekistan
                 </div>
                 <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <Clock className="w-4 h-4" /> Oxirgi tashrif: {patient.lastVisit}
                 </div>
              </div>

              <div className="flex md:justify-end items-start">
                 <Button variant="secondary" size="sm" onClick={handleEditOpen}>
                    <Edit className="w-4 h-4 mr-2" /> Tahrirlash
                 </Button>
              </div>
           </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
         <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: 'overview', label: 'Umumiy', icon: User },
              { id: 'chart', label: 'Tish Kartasi', icon: Activity },
              { id: 'appointments', label: 'Qabullar', icon: Calendar },
              { id: 'payments', label: 'To\'lovlar', icon: CreditCard },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                  ${activeTab === tab.id 
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <tab.icon className={`
                  -ml-0.5 mr-2 h-4 w-4
                  ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}
                `} />
                {tab.label}
              </button>
            ))}
         </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
         
         {/* Overview Tab */}
         {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card className="p-6 space-y-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                     <FileText className="w-5 h-5" /> Tibbiy Tarix
                  </h3>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800">
                     <p className="text-yellow-800 dark:text-yellow-200 font-medium">Allergiya va Kasalliklar</p>
                     <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        {patient.medicalHistory || 'Ma\'lumot yo\'q.'}
                     </p>
                  </div>
                  <div>
                     <p className="font-medium mb-2 text-gray-700 dark:text-gray-300">Klinik Izohlar</p>
                     <textarea 
                        className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                        rows={4}
                        placeholder="Klinik izoh qo'shish..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                     />
                     <div className="mt-2 flex justify-end">
                        <Button size="sm" onClick={() => {
                           if(noteText) {
                             onUpdatePatient(patient.id, { medicalHistory: patient.medicalHistory ? patient.medicalHistory + '\n' + noteText : noteText });
                             setNoteText('');
                           }
                        }}>Saqlash</Button>
                     </div>
                  </div>
               </Card>
               <Card className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Kutilayotgan Qabullar</h3>
                  {patientAppointments.filter(a => a.status === 'Pending' || a.status === 'Confirmed').length > 0 ? (
                     <div className="space-y-3">
                        {patientAppointments.filter(a => a.status === 'Pending' || a.status === 'Confirmed').map(app => (
                           <div key={app.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                              <div className="flex items-center gap-3">
                                 <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded text-blue-600">
                                    <Calendar className="w-4 h-4" />
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{app.date} soat {app.time}</p>
                                    <p className="text-xs text-gray-500">{app.type} - {app.doctorName}</p>
                                 </div>
                              </div>
                              <Badge status={app.status} />
                           </div>
                        ))}
                     </div>
                  ) : (
                     <div className="text-center py-6">
                        <p className="text-gray-500 text-sm mb-4">Kutilayotgan qabullar yo'q.</p>
                        <Button variant="secondary" onClick={() => alert('Iltimos, Kalendardan foydalaning.')}>Yangi Qabul</Button>
                     </div>
                  )}
               </Card>
            </div>
         )}

         {/* Dental Chart Tab */}
         {activeTab === 'chart' && (
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Odontogramma</h3>
                  <div className="flex gap-2">
                     <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2"/> Chop etish</Button>
                     <Button size="sm" onClick={() => alert('Faqat vizual saqlandi (Mock)')}>O'zgarishlarni Saqlash</Button>
                  </div>
               </div>
               <TeethChart initialData={[
                {id: 1, number: 3, status: ToothStatus.FILLED},
                {id: 2, number: 14, status: ToothStatus.CAVITY},
                {id: 3, number: 30, status: ToothStatus.MISSING},
               ]} />
            </div>
         )}

         {/* Appointments Tab */}
         {activeTab === 'appointments' && (
            <Card className="overflow-hidden">
               <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                     <tr>
                        <th className="p-4 font-medium text-gray-500">Sana</th>
                        <th className="p-4 font-medium text-gray-500">Muolaja</th>
                        <th className="p-4 font-medium text-gray-500">Shifokor</th>
                        <th className="p-4 font-medium text-gray-500">Davomiylik</th>
                        <th className="p-4 font-medium text-gray-500">Status</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                     {patientAppointments.map(app => (
                        <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                           <td className="p-4 text-gray-900 dark:text-white font-medium">{app.date} {app.time}</td>
                           <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                           <td className="p-4 text-gray-600 dark:text-gray-300">{app.doctorName}</td>
                           <td className="p-4 text-gray-600 dark:text-gray-300">{app.duration} daq</td>
                           <td className="p-4"><Badge status={app.status} /></td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               {patientAppointments.length === 0 && <div className="p-8 text-center text-gray-500">Qabullar tarixi topilmadi.</div>}
            </Card>
         )}

         {/* Payments Tab */}
         {activeTab === 'payments' && (
            <Card className="overflow-hidden">
               <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <div>
                     <p className="text-sm text-gray-500">Jami Xarajat</p>
                     <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {patientTransactions.reduce((acc, t) => acc + t.amount, 0).toLocaleString()} UZS
                     </p>
                  </div>
                  <Button size="sm" onClick={() => setIsPaymentModalOpen(true)}>To'lov Qilish</Button>
               </div>
               <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                     <tr>
                        <th className="p-4 font-medium text-gray-500">Sana</th>
                        <th className="p-4 font-medium text-gray-500">Xizmat</th>
                        <th className="p-4 font-medium text-gray-500">Usul</th>
                        <th className="p-4 font-medium text-gray-500">Summa</th>
                        <th className="p-4 font-medium text-gray-500">Status</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                     {patientTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                           <td className="p-4 text-gray-900 dark:text-white">{t.date}</td>
                           <td className="p-4 text-gray-600 dark:text-gray-300">{t.service}</td>
                           <td className="p-4 text-gray-600 dark:text-gray-300">{t.type === 'Cash' ? 'Naqd' : t.type === 'Card' ? 'Karta' : 'Sug\'urta'}</td>
                           <td className="p-4 text-gray-900 dark:text-white font-medium">{t.amount.toLocaleString()} UZS</td>
                           <td className="p-4"><Badge status={t.status} /></td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               {patientTransactions.length === 0 && <div className="p-8 text-center text-gray-500">To'lovlar tarixi topilmadi.</div>}
            </Card>
         )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Profilni Tahrirlash">
         <form onSubmit={handleEditSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
               <Input label="Ism" value={editFormData.firstName || ''} onChange={e => setEditFormData({...editFormData, firstName: e.target.value})} />
               <Input label="Familiya" value={editFormData.lastName || ''} onChange={e => setEditFormData({...editFormData, lastName: e.target.value})} />
            </div>
            <Input label="Telefon" value={editFormData.phone || ''} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} />
            <div className="flex justify-end gap-2 pt-4">
               <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>Bekor qilish</Button>
               <Button type="submit">Saqlash</Button>
            </div>
         </form>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="To'lov Qabul Qilish">
         <form onSubmit={handlePaymentSave} className="space-y-4">
            <Input label="Xizmat Nomi" value={paymentData.service} onChange={e => setPaymentData({...paymentData, service: e.target.value})} placeholder="masalan: Tozalash" required />
            <Input label="Summa" type="number" value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} placeholder="0.00" required />
            <Select 
               label="To'lov Usuli"
               value={paymentData.type}
               onChange={e => setPaymentData({...paymentData, type: e.target.value})}
               options={[
                  {value: 'Cash', label: 'Naqd'},
                  {value: 'Card', label: 'Karta'},
                  {value: 'Insurance', label: 'Sug\'urta'}
               ]}
            />
            <div className="flex justify-end gap-2 pt-4">
               <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>Bekor qilish</Button>
               <Button type="submit">Qabul qilish</Button>
            </div>
         </form>
      </Modal>
    </div>
  );
};