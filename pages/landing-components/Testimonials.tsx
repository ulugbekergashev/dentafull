import React from "react";
import { Star, Quote } from "lucide-react";

const reviews = [
  {
    name: "Dr. Sarvar Azimov",
    role: "Bosh shifokor, 'Asal Dental'",
    city: "Toshkent",
    initials: "SA",
    quote: "Shifokorlarning oylik foiz ulushini qo'lda hisoblashga 3 kun ketardi, hozir tizim 1 soniyada tayyorlab beradi.",
  },
  {
    name: "Dr. Nargiza Umarova",
    role: "Ortodont, 'Premium Dent'",
    city: "Samarqand",
    initials: "NU",
    quote: "Telegram bot va SMS eslatmalar tufayli bemorlarning kelmaslik foizi 45% ga qisqardi. Tizim o'zi avtomat ishlaydi.",
  },
  {
    name: "Dr. Elyor Rasulov",
    role: "Klinika direktori, 'Zamin Stom'",
    city: "Buxoro",
    initials: "ER",
    quote: "Elektron tish xaritasini telefonimdan ko'ra olaman. Yangi shifokorlar tizimni atigi 1 kunda o'rgandi.",
  },
];

const stats = [
  { value: "30+",   label: "Faol klinikalar" },
  { value: "4K+",   label: "Bemor kartasi" },
  { value: "98.4%", label: "Mijozlar qoniqishi" },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-20 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
          <span className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-bold text-blue-700 uppercase tracking-widest">
            Mijozlar fikri
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Stomatologlar biz haqimizda
          </h2>
        </div>

        {/* Stats — mobile: 3 col, desktop: 3 col */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {stats.map((s) => (
            <div key={s.label} className="bg-blue-50 border border-blue-100 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-center">
              <span className="text-2xl sm:text-4xl font-extrabold text-blue-700 font-mono block">{s.value}</span>
              <span className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-1 block leading-tight">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Review cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {reviews.map((rev, i) => (
            <div
              key={i}
              className="bg-slate-50 border border-slate-100 rounded-3xl p-6 flex flex-col justify-between hover:shadow-md transition-all duration-300"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <Quote className="w-5 h-5 text-slate-200" />
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  "{rev.quote}"
                </p>
              </div>

              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-xs shrink-0">
                  {rev.initials}
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">{rev.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{rev.role}</p>
                  <span className="text-[9px] text-blue-600 font-bold">📍 {rev.city}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
