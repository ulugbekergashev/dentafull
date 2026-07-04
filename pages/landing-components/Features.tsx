import React from "react";
import {
  FolderHeart, CalendarCheck, BellRing, MessageSquareCode,
  Wallet, Layers, PhoneIncoming, ShieldCheck
} from "lucide-react";

const features = [
  {
    icon: FolderHeart,
    title: "Elektron Bemor Kartasi",
    desc: "To'liq tibbiy tarix, rentgen suratlari, tish xaritasi va retseptlar — xavfsiz bulutda.",
    iconBg: "bg-primary-50", iconColor: "text-primary-600", border: "hover:border-primary-200",
  },
  {
    icon: CalendarCheck,
    title: "Aqlli Qabul va Taqvim",
    desc: "Shifokorlar yuklamasini optimallashtiruvchi vizual jadval. Ko'p shifokor — bitta ekran.",
    iconBg: "bg-teal-50", iconColor: "text-teal-600", border: "hover:border-teal-200",
  },
  {
    icon: BellRing,
    title: "Avtomatik SMS-Eslatmalar",
    desc: "Qabul eslatmalari va Recall xabarlari avtomat yuboriladi. Kelmaslik 40% kamayadi.",
    iconBg: "bg-purple-50", iconColor: "text-purple-600", border: "hover:border-purple-200",
  },
  {
    icon: MessageSquareCode,
    title: "Telegram Bot",
    desc: "Klinikangizning shaxsiy boti. Bemorlar navbatga yoziladi, natijalarini o'zlari oladi.",
    iconBg: "bg-sky-50", iconColor: "text-sky-600", border: "hover:border-sky-200",
  },
  {
    icon: Wallet,
    title: "Kassa va Moliya",
    desc: "Kunlik tushum, shifokor ulushi, qarzdorlar va bo'lib to'lash — hammasi bitta joyda.",
    iconBg: "bg-green-50", iconColor: "text-green-600", border: "hover:border-green-200",
  },
  {
    icon: Layers,
    title: "Materiallar Ombori",
    desc: "Har bir muolajaga sarflangan materiallar avtomatik hisoblanadi. Kam qolsa — signal.",
    iconBg: "bg-amber-50", iconColor: "text-amber-600", border: "hover:border-amber-200",
  },
  {
    icon: PhoneIncoming,
    title: "IP-Telefoniya",
    desc: "Bemor qo'ng'iroq qilganda ekranda ismi, qarzdorligi va oxirgi qabul ma'lumoti chiqadi.",
    iconBg: "bg-rose-50", iconColor: "text-rose-600", border: "hover:border-rose-200",
  },
  {
    icon: ShieldCheck,
    title: "Ma'lumotlar Xavfsizligi",
    desc: "HIPAA standartiga mos shifrlash. Har bir rol uchun alohida kirish darajasi.",
    iconBg: "bg-indigo-50", iconColor: "text-indigo-600", border: "hover:border-indigo-200",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-xs font-bold text-primary-700 uppercase tracking-widest">
            Nega aynan DentaCRM?
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Hamma narsa — bitta tizimda
          </h2>
          <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
            Qog'ozbozlik bilan xayrlashing. Klinikangizning har bir bo'limini bitta ekrandan boshqaring.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`group bg-white rounded-2xl border border-gray-100 ${f.border} shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col gap-4`}
              >
                <div className={`w-11 h-11 ${f.iconBg} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 ${f.iconColor}`} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-gray-900 leading-snug">{f.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
