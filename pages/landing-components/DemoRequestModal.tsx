import React, { useState } from "react";
import { X, CheckCircle, Phone, User, Building2, MapPin } from "lucide-react";

interface DemoRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoRequestModal({ isOpen, onClose }: DemoRequestModalProps) {
  const [form, setForm] = useState({ name: "", clinic: "", phone: "+998 ", city: "" });
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clinicName: form.clinic,
          phone: form.phone,
          city: form.city,
          source: "landing",
          doctorsCount: 1,
        }),
      });
    } catch {}
    setSent(true);
  };

  const handleClose = () => {
    setForm({ name: "", clinic: "", phone: "+998 ", city: "" });
    setSent(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md" onClick={handleClose} />

      <div className="relative w-full max-w-lg z-10 rounded-3xl overflow-hidden shadow-2xl shadow-primary-900/30">

        {/* Header */}
        <div className="bg-gradient-to-br from-primary-600 via-indigo-600 to-violet-700 px-8 pt-8 pb-12 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-white/5" />
          <button
            onClick={handleClose}
            className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative z-10 space-y-2">
            <span className="text-[10px] font-black text-primary-200 uppercase tracking-[0.2em]">DentaCRM · 7 kun bepul</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
              Klinikangizni bepul<br />sinab ko'ring
            </h2>
            <p className="text-primary-100/80 text-sm">
              Ma'lumotlaringizni qoldiring — 15 daqiqada bog'lanamiz.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="bg-white px-8 py-8 -mt-5 rounded-t-3xl relative">
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-5">

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <User className="w-4 h-4 text-primary-500" /> Ism-familiya
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Aziz Karimov"
                  value={form.name}
                  onChange={set("name")}
                  className="w-full bg-gray-50 border-2 border-gray-100 focus:border-primary-500 focus:bg-white rounded-2xl px-5 py-4 text-base text-gray-800 placeholder:text-gray-300 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Building2 className="w-4 h-4 text-primary-500" /> Klinika nomi
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Asal Dental yoki Dr. Azimov"
                  value={form.clinic}
                  onChange={set("clinic")}
                  className="w-full bg-gray-50 border-2 border-gray-100 focus:border-primary-500 focus:bg-white rounded-2xl px-5 py-4 text-base text-gray-800 placeholder:text-gray-300 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Phone className="w-4 h-4 text-primary-500" /> Telefon raqam
                </label>
                <input
                  type="text"
                  required
                  placeholder="+998 90 824 29 92"
                  value={form.phone}
                  onChange={set("phone")}
                  className="w-full bg-gray-50 border-2 border-gray-100 focus:border-primary-500 focus:bg-white rounded-2xl px-5 py-4 text-base text-gray-800 font-mono placeholder:text-gray-300 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <MapPin className="w-4 h-4 text-primary-500" />
                  Shahar <span className="text-gray-400 font-normal text-xs">(ixtiyoriy)</span>
                </label>
                <input
                  type="text"
                  placeholder="Toshkent, Samarqand, Namangan..."
                  value={form.city}
                  onChange={set("city")}
                  className="w-full bg-gray-50 border-2 border-gray-100 focus:border-primary-500 focus:bg-white rounded-2xl px-5 py-4 text-base text-gray-800 placeholder:text-gray-300 outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-extrabold text-base tracking-wide transition-all active:scale-[0.98] cursor-pointer shadow-xl shadow-primary-500/25"
              >
                7 KUNLIK BEPUL SINOV BOSHLASH →
              </button>

              <p className="text-xs text-gray-400 text-center">
                Kredit karta talab etilmaydi · Istalgan vaqt bekor qilish mumkin
              </p>
            </form>
          ) : (
            <div className="text-center py-10 space-y-5">
              <div className="w-20 h-20 rounded-3xl bg-green-50 border-2 border-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-gray-900">So'rov qabul qilindi!</h3>
                <p className="text-base text-gray-500 leading-relaxed">
                  <span className="font-bold text-gray-800">{form.name}</span>, siz bilan<br />
                  <span className="font-bold text-primary-600">{form.phone}</span> orqali 15 daqiqada bog'lanamiz.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="px-8 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-bold text-gray-700 cursor-pointer transition-colors"
              >
                Yopish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
