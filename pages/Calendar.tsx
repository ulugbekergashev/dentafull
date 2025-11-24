
import React, { useState } from 'react';
import { Card, Button, Modal, Input, Select, Badge } from '../components/Common';
import { ChevronLeft, ChevronRight, Plus, Clock, User, FileText, XCircle, CheckCircle } from 'lucide-react';
import { Appointment, Patient, Doctor } from '../types';

interface CalendarProps {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  services: { name: string; price: number; duration: number }[];
  onAddAppointment: (appt: Omit<Appointment, 'id'>) => void;
  onUpdateAppointment: (id: string, data: Partial<Appointment>) => void;
  onDeleteAppointment: (id: string) => void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 to 20:00

export const Calendar: React.FC<CalendarProps> = ({ 
  appointments, patients, doctors, services, onAddAppointment, onUpdateAppointment, onDeleteAppointment 
}) => {
  // State
  const [currentDate, setCurrentDate] = useState(new Date()); // Start of the visible week (Monday)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  
  // Add Form State
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    type: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    duration: 60,
    notes: ''
  });

  // Open Add Modal with default values selected if available
  const openAddModal = () => {
    setFormData({
      patientId: patients.length > 0 ? patients[0].id : '',
      doctorId: doctors.length > 0 ? doctors[0].id : '',
      type: services.length > 0 ? services[0].name : '',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      duration: 60,
      notes: ''
    });
    setIsAddModalOpen(true);
  };

  // Helper: Get start of current week (Monday)
  const getStartOfWeek = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(date.setDate(diff));
    return monday;
  };

  // Helper: Get 7 days array
  const getWeekDays = (startDate: Date) => {
    const days = [];
    const start = getStartOfWeek(new Date(startDate));
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays(currentDate);

  // Handlers
  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation check
    if (!formData.patientId || !formData.doctorId) {
      alert("Iltimos, avval bemor va shifokorni tanlang!");
      return;
    }

    // Past Time Validation
    const selectedDateTime = new Date(`${formData.date}T${formData.time}`);
    const now = new Date();

    if (selectedDateTime < now) {
      alert("O'tgan vaqtga qabul belgilash mumkin emas!");
      return;
    }

    const patient = patients.find(p => p.id === formData.patientId);
    const doctor = doctors.find(d => d.id === formData.doctorId);
    
    if (!patient || !doctor) {
      alert("Bemor yoki shifokor topilmadi.");
      return;
    }

    onAddAppointment({
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorId: doctor.id,
      doctorName: `Dr. ${doctor.lastName}`,
      type: formData.type || 'Konsultatsiya',
      date: formData.date,
      time: formData.time,
      duration: Number(formData.duration),
      status: 'Pending',
      notes: formData.notes
    });
    setIsAddModalOpen(false);
  };

  const handleStatusUpdate = (status: Appointment['status']) => {
    if (selectedAppointment) {
      onUpdateAppointment(selectedAppointment.id, { status });
      setSelectedAppointment({ ...selectedAppointment, status }); // Optimistic update for modal
    }
  };

  const dayNames = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div className="flex items-center gap-4">
           <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Jadval</h1>
           <div className="flex items-center bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
              <button onClick={handlePrevWeek} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-4 text-sm font-medium min-w-[140px] text-center">
                {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button onClick={handleNextWeek} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ChevronRight className="w-4 h-4" /></button>
           </div>
         </div>
         <Button onClick={openAddModal}><Plus className="w-4 h-4 mr-2" /> Yangi Qabul</Button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        {/* Header Row */}
        <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700">
          <div className="p-4 border-r border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"></div>
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div key={i} className={`p-4 text-center border-r border-gray-100 dark:border-gray-700 last:border-0 ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                 <p className={`text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900 dark:text-white'}`}>{dayNames[day.getDay()]}</p>
                 <p className={`text-xs ${isToday ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>{day.getDate()}</p>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto relative">
           {/* Grid Background */}
           <div className="grid grid-cols-8 h-[1200px]">
              
              {/* Time Column */}
              <div className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                {HOURS.map(hour => (
                  <React.Fragment key={hour}>
                    <div className="h-12 border-b border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 p-2 text-right">{hour}:00</div>
                    <div className="h-12 border-b border-gray-100 dark:border-gray-700/50"></div>
                  </React.Fragment>
                ))}
              </div>

              {/* Days Columns */}
              {weekDays.map((day, i) => (
                <div key={i} className="border-r border-gray-100 dark:border-gray-700 last:border-0 relative">
                   {HOURS.map(hour => (
                     <React.Fragment key={hour}>
                       <div className="h-12 border-b border-gray-50 dark:border-gray-800/50"></div>
                       <div className="h-12 border-b border-gray-50 dark:border-gray-800/50"></div>
                     </React.Fragment>
                   ))}
                </div>
              ))}

              {/* Appointments Overlay */}
              {appointments.map(app => {
                  const appDate = new Date(app.date);
                  // Find which column this appointment belongs to (0-6)
                  const dayIndex = weekDays.findIndex(d => d.toDateString() === appDate.toDateString());
                  
                  if (dayIndex === -1) return null; // Not in this week

                  const [h, m] = app.time.split(':').map(Number);
                  if (isNaN(h)) return null;

                  const topOffset = ((h - 8) * 96) + (m >= 30 ? 48 : 0) + (m % 30 / 30 * 48); 
                  const height = (app.duration / 30) * 48;
                  
                  // Status Colors
                  const colors = {
                    'Confirmed': 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/60 dark:border-blue-700 dark:text-blue-200',
                    'Checked-In': 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/60 dark:border-indigo-700 dark:text-indigo-200',
                    'Completed': 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/60 dark:border-green-700 dark:text-green-200',
                    'Pending': 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/60 dark:border-yellow-700 dark:text-yellow-200',
                    'Cancelled': 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/60 dark:border-red-700 dark:text-red-300',
                    'No-Show': 'bg-gray-200 border-gray-400 text-gray-600 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-400 opacity-75'
                  }[app.status] || 'bg-gray-100';

                  return (
                    <div 
                      key={app.id}
                      onClick={() => setSelectedAppointment(app)}
                      className={`absolute m-1 p-2 rounded-md border-l-4 text-xs shadow-sm cursor-pointer hover:brightness-95 transition-all ${colors} z-10`}
                      style={{
                        top: `${topOffset}px`,
                        left: `calc(${(dayIndex + 1) * (100/8)}% + 2px)`,
                        width: `calc(${100/8}% - 4px)`,
                        height: `${height - 4}px`,
                      }}
                    >
                      <div className="font-bold truncate">{app.patientName}</div>
                      <div className="truncate opacity-75">{app.type}</div>
                      {height > 40 && (
                        <div className="flex items-center mt-1 gap-1 text-[10px]">
                           <div className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px]">{app.doctorName[0]}</div>
                           {app.time}
                        </div>
                      )}
                    </div>
                  );
              })}

           </div>
        </div>
      </div>

      {/* Add Appointment Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Yangi Qabul">
         <form onSubmit={handleAddSubmit} className="space-y-4">
            <Select 
               label="Bemor" 
               options={patients.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))}
               value={formData.patientId}
               onChange={(e) => setFormData({...formData, patientId: e.target.value})}
            />
            <Select 
               label="Shifokor" 
               options={doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))}
               value={formData.doctorId}
               onChange={(e) => setFormData({...formData, doctorId: e.target.value})}
            />
            <div className="grid grid-cols-2 gap-4">
               <Input 
                 label="Sana" 
                 type="date" 
                 min={new Date().toISOString().split('T')[0]}
                 value={formData.date} 
                 onChange={e => setFormData({...formData, date: e.target.value})} 
               />
               <Input label="Vaqt" type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <Select 
                 label="Muolaja turi" 
                 options={services.map(s => ({ value: s.name, label: s.name }))}
                 value={formData.type} 
                 onChange={e => setFormData({...formData, type: e.target.value})} 
               />
               <Input label="Davomiyligi (daq)" type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: Number(e.target.value)})} />
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Izohlar</label>
               <textarea 
                 className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm h-20 dark:border-gray-700 dark:text-white"
                 value={formData.notes}
                 onChange={e => setFormData({...formData, notes: e.target.value})}
               />
            </div>
            <div className="flex justify-end gap-2 pt-4">
               <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>Bekor qilish</Button>
               <Button type="submit">Band qilish</Button>
            </div>
         </form>
      </Modal>

      {/* Appointment Details Modal */}
      {selectedAppointment && (
        <Modal isOpen={!!selectedAppointment} onClose={() => setSelectedAppointment(null)} title="Qabul Tafsilotlari">
          <div className="space-y-6">
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedAppointment.patientName}</h3>
                   <p className="text-gray-500 text-sm">{selectedAppointment.type}</p>
                </div>
                <Badge status={selectedAppointment.status} />
             </div>

             <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                   <Clock className="w-5 h-5 text-gray-400" />
                   <span>{selectedAppointment.date}, {selectedAppointment.time} ({selectedAppointment.duration} daq)</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                   <User className="w-5 h-5 text-gray-400" />
                   <span>{selectedAppointment.doctorName}</span>
                </div>
                {selectedAppointment.notes && (
                  <div className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                     <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                     <p className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-100 dark:border-gray-700 w-full">
                        {selectedAppointment.notes}
                     </p>
                  </div>
                )}
             </div>

             <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
               {/* Action Buttons */}
               <div className="flex flex-wrap gap-2 justify-end">
                  {/* Initial States: Pending, Confirmed or Checked-In (Legacy support) */}
                  {(selectedAppointment.status === 'Pending' || selectedAppointment.status === 'Confirmed' || selectedAppointment.status === 'Checked-In') && (
                    <>
                       <Button variant="danger" className="mr-auto" onClick={() => { 
                          if(confirm('Ushbu qabulni bekor qilmoqchimisiz?')) {
                             onDeleteAppointment(selectedAppointment.id);
                             setSelectedAppointment(null);
                          }
                       }}>
                         Bekor qilish
                       </Button>
                       
                       <div className="flex gap-2">
                         <button 
                           onClick={() => handleStatusUpdate('No-Show')}
                           className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
                         >
                           <XCircle className="w-4 h-4 mr-2 text-red-500" />
                           Kelmadi
                         </button>
                         
                         <button 
                           onClick={() => handleStatusUpdate('Completed')}
                           className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                         >
                           <CheckCircle className="w-4 h-4 mr-2" />
                           Yakunlash
                         </button>
                       </div>
                    </>
                  )}
                  
                  {/* Read Only States */}
                  {(selectedAppointment.status === 'Completed' || selectedAppointment.status === 'Cancelled' || selectedAppointment.status === 'No-Show') && (
                     <Button variant="secondary" onClick={() => setSelectedAppointment(null)}>Yopish</Button>
                  )}
               </div>
             </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
