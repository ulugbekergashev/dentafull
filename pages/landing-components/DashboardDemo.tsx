import React, { useState } from "react";
import {
  Users, Calendar, DollarSign, TrendingUp, Star,
  CheckCircle, Clock, AlertCircle, Package, Bell,
  ChevronRight, Search, MoreHorizontal, Activity,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";

type Tab = "dashboard" | "patients" | "finances" | "stock";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Boshqaruv paneli", icon: Activity },
  { id: "patients",  label: "Bemorlar",         icon: Users },
  { id: "finances",  label: "Moliya",            icon: DollarSign },
  { id: "stock",     label: "Materiallar ombori",icon: Package },
];

/* ── KPI Card ────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, badge, badgeColor, iconBg, iconColor }:
  { icon: React.ElementType; label: string; value: string; badge?: string; badgeColor?: string; iconBg: string; iconColor: string }
) {
  return (
    <div className="relative group overflow-hidden bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
      <div className={`absolute -top-2 -right-2 p-3 opacity-[0.04] transition-transform duration-500 group-hover:scale-110 ${iconColor}`}>
        <Icon className="w-16 h-16" />
      </div>
      <div className="relative z-10">
        <div className={`p-2 w-fit ${iconBg} rounded-xl`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="mt-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">{label}</p>
          <h3 className="text-2xl font-black text-gray-900 mt-1 leading-none">{value}</h3>
          {badge && (
            <div className="mt-2.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard Tab ───────────────────────────────────────────── */
function DashboardTab() {
  const appointments = [
    { time: "09:00", patient: "Dilnoza Karimova",   doctor: "Dr. Azimov",  type: "Plomba",          status: "Completed" },
    { time: "10:30", patient: "Akmal Toshmatov",    doctor: "Dr. Umarova", type: "Tish tozalash",   status: "Pending" },
    { time: "11:00", patient: "Zulfiya Rahimova",   doctor: "Dr. Rasulov", type: "Kanal (Pulpit)",  status: "Pending" },
    { time: "12:30", patient: "Jasur Mirzayev",     doctor: "Dr. Azimov",  type: "Implant",         status: "Pending" },
    { time: "14:00", patient: "Nodira Yusupova",    doctor: "Dr. Umarova", type: "Breket sozlash",  status: "Pending" },
  ];

  const chartBars = [32, 48, 41, 65, 58, 90, 72, 85, 78, 95, 68, 88];
  const months    = ["Yan","Fev","Mar","Apr","May","Iyn","Iyl","Avg","Sen","Okt","Noy","Dek"];

  const statusStyle: Record<string, string> = {
    Completed: "bg-green-50 text-green-700 border border-green-100",
    Pending:   "bg-amber-50  text-amber-700  border border-amber-100",
    Cancelled: "bg-red-50    text-red-700    border border-red-100",
  };
  const statusLabel: Record<string, string> = {
    Completed: "Tugallandi",
    Pending:   "Kutilmoqda",
    Cancelled: "Bekor",
  };

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users}       label="Jami bemorlar"    value="342"   badge="+8 faol"     badgeColor="bg-green-50 text-green-700" iconBg="bg-primary-50"   iconColor="text-primary-600" />
        <KpiCard icon={Calendar}    label="Bugungi qabullar" value="18"    badge="4 kutilmoqda" badgeColor="bg-amber-50 text-amber-700" iconBg="bg-purple-50" iconColor="text-purple-600" />
        <KpiCard icon={DollarSign}  label="Oy daromadi"      value="84.2M" badge="+12% ↑"      badgeColor="bg-green-50 text-green-700" iconBg="bg-green-50"  iconColor="text-green-600" />
        <KpiCard icon={Star}        label="Yangi lidlar"     value="7"     badge="Yangi"        badgeColor="bg-indigo-50 text-indigo-700" iconBg="bg-indigo-50" iconColor="text-indigo-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Daromad dinamikasi</p>
              <p className="text-xl font-black text-gray-900 mt-0.5">84,200,000 <span className="text-sm font-semibold text-gray-400">so'm</span></p>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <ArrowUpRight className="w-3.5 h-3.5" />+12%
            </span>
          </div>
          <div className="flex items-end gap-1 h-24">
            {chartBars.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className={`w-full rounded-sm transition-all ${i === 9 ? 'bg-primary-600' : 'bg-primary-100 hover:bg-primary-300'}`}
                  style={{ height: `${h}%` }}
                />
                <span className="text-[7px] text-gray-400 font-medium">{months[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Appointment list */}
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bugungi jadval</p>
            <span className="text-[10px] text-primary-600 font-bold cursor-pointer hover:underline">Hammasi →</span>
          </div>
          <div className="space-y-2">
            {appointments.slice(0,4).map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <span className="text-[10px] font-bold text-gray-400 w-9 shrink-0">{a.time}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-gray-800 truncate">{a.patient}</p>
                  <p className="text-[9px] text-gray-400 truncate">{a.doctor} · {a.type}</p>
                </div>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${statusStyle[a.status]}`}>
                  {statusLabel[a.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Patients Tab ────────────────────────────────────────────── */
function PatientsTab() {
  const [search, setSearch] = useState("");
  const patients = [
    { name: "Dilnoza Karimova",  phone: "+998 90 123 45 67", lastVisit: "2026-06-25", status: "Active",   debt: 0 },
    { name: "Akmal Toshmatov",   phone: "+998 93 987 65 43", lastVisit: "2026-06-24", status: "Active",   debt: 250000 },
    { name: "Zulfiya Rahimova",  phone: "+998 99 333 22 11", lastVisit: "2026-06-20", status: "Inactive", debt: 0 },
    { name: "Jasur Mirzayev",    phone: "+998 97 777 88 99", lastVisit: "2026-06-18", status: "Active",   debt: 1200000 },
    { name: "Nodira Yusupova",   phone: "+998 90 555 44 33", lastVisit: "2026-06-15", status: "Active",   debt: 0 },
  ];
  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2.5">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Bemor ismi yoki telefon..."
          className="flex-1 text-sm text-gray-700 outline-none bg-transparent placeholder:text-gray-400"
        />
      </div>
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-50">
          <span className="col-span-4 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Bemor</span>
          <span className="col-span-3 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Telefon</span>
          <span className="col-span-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Oxirgi qabul</span>
          <span className="col-span-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest">Qarz</span>
          <span className="col-span-1" />
        </div>
        {filtered.map((p, i) => (
          <div key={i} className="grid grid-cols-12 items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
            <div className="col-span-4 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700 font-black text-[10px] shrink-0">
                {p.name.split(' ').map(n => n[0]).join('').slice(0,2)}
              </div>
              <span className="text-[11px] font-bold text-gray-800 truncate">{p.name}</span>
            </div>
            <span className="col-span-3 text-[10px] text-gray-500 font-mono">{p.phone}</span>
            <span className="col-span-2 text-[10px] text-gray-400">{p.lastVisit}</span>
            <div className="col-span-2">
              {p.debt > 0
                ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">{(p.debt/1000).toFixed(0)}K</span>
                : <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">To'liq</span>}
            </div>
            <div className="col-span-1 flex justify-end">
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${p.status==='Active' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500'}`}>
                {p.status==='Active' ? 'Faol' : 'Nofaol'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Finances Tab ────────────────────────────────────────────── */
function FinancesTab() {
  const txns = [
    { patient: "Dilnoza Karimova",  service: "Plomba",           amount: 350000,   status: "Paid",    date:"2026-06-25", doctor:"Dr. Azimov" },
    { patient: "Akmal Toshmatov",   service: "Implant",          amount: 3500000,  status: "Pending", date:"2026-06-25", doctor:"Dr. Azimov" },
    { patient: "Zulfiya Rahimova",  service: "Kanal tozalash",   amount: 400000,   status: "Paid",    date:"2026-06-24", doctor:"Dr. Rasulov" },
    { patient: "Jasur Mirzayev",    service: "Tish tozalash",    amount: 150000,   status: "Paid",    date:"2026-06-23", doctor:"Dr. Umarova" },
    { patient: "Nodira Yusupova",   service: "Breket sozlash",   amount: 200000,   status: "Pending", date:"2026-06-22", doctor:"Dr. Umarova" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { l:"Oy daromadi",   v:"84,200,000", sub:"+12%", c:"text-green-600", bg:"bg-green-50 border-green-100" },
          { l:"Xarajat",       v:"31,500,000", sub:"-4%",  c:"text-red-500",   bg:"bg-red-50 border-red-100" },
          { l:"Sof foyda",     v:"52,700,000", sub:"",     c:"text-primary-600",  bg:"bg-primary-50 border-primary-100" },
        ].map(s => (
          <div key={s.l} className={`rounded-2xl border p-4 ${s.bg}`}>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.l}</p>
            <p className={`text-lg font-black mt-1 ${s.c}`}>{s.v}</p>
            {s.sub && <p className={`text-[10px] font-bold mt-1 ${s.c}`}>{s.sub}</p>}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-50">
          {(["Bemor","Xizmat","Shifokor","Summa","Holat"] as const).map((h,i) => {
            const spans = ["col-span-4","col-span-3","col-span-2","col-span-2","col-span-1"] as const;
            return <span key={h} className={`${spans[i]} text-[9px] font-bold text-gray-400 uppercase tracking-widest`}>{h}</span>;
          })}
        </div>
        {txns.map((t, i) => (
          <div key={i} className="grid grid-cols-12 items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
            <span className="col-span-4 text-[11px] font-bold text-gray-800 truncate">{t.patient}</span>
            <span className="col-span-3 text-[10px] text-gray-500 truncate">{t.service}</span>
            <span className="col-span-2 text-[10px] text-gray-400 truncate">{t.doctor.replace('Dr. ','')}</span>
            <span className="col-span-2 text-[11px] font-bold text-gray-800">{(t.amount/1000).toFixed(0)}K</span>
            <div className="col-span-1">
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${t.status==='Paid'?'bg-green-50 text-green-700 border border-green-100':'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                {t.status==='Paid'?'To\'langan':'Kutilmoqda'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stock Tab ───────────────────────────────────────────────── */
function StockTab() {
  const items = [
    { name:"Kompozit plomba (Filtek Ultimate)", qty:45, min:10, unit:"sht" },
    { name:"Anesteziya (Ultracain DS)",          qty:8,  min:20, unit:"sht" },
    { name:"Dental implantlar (Osstem)",         qty:24, min:5,  unit:"sht" },
    { name:"Sterilizatsiya paketi",              qty:150,min:50, unit:"sht" },
    { name:"Ortodontik yoy (0.16)",              qty:2,  min:10, unit:"sht" },
  ];
  const getStatus = (qty: number, min: number) => {
    if (qty >= min * 2) return { label:"Yetarli",      cls:"bg-green-50 text-green-700 border border-green-100" };
    if (qty >= min)     return { label:"Kam qoldi",    cls:"bg-amber-50 text-amber-700 border border-amber-100" };
    return                     { label:"Tugamoqda!",   cls:"bg-red-50 text-red-600 border border-red-100" };
  };
  const needOrder = items.filter(i => i.qty < i.min).length;
  return (
    <div className="space-y-3">
      {needOrder > 0 && (
        <div className="flex items-center gap-3 p-3.5 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-[11px] font-bold text-red-600">Sotib olish buyurtmasi kerak: {needOrder} ta mahsulot</span>
        </div>
      )}
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kam qolgan materiallarni avtomat aniqlash</p>
        </div>
        {items.map((item, i) => {
          const s = getStatus(item.qty, item.min);
          const pct = Math.min(100, Math.round((item.qty / (item.min * 3)) * 100));
          return (
            <div key={i} className="px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-gray-800">{item.name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 60 ? 'bg-green-400' : pct > 30 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-400 font-mono shrink-0">
                  Min: {item.min} {item.unit} · Hozir: <b className="text-gray-700">{item.qty} {item.unit}</b>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function DashboardDemo() {
  const [active, setActive] = useState<Tab>("dashboard");

  const tabContent: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab />,
    patients:  <PatientsTab />,
    finances:  <FinancesTab />,
    stock:     <StockTab />,
  };

  return (
    <section id="demo-dashboard" className="py-20 bg-gray-50 relative border-y border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
          <span className="px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-xs font-bold text-primary-700 uppercase tracking-widest">
            Interaktiv demo
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Haqiqiy DentaCRM interfeysi
          </h2>
          <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
            Quyida DentaCRM ning haqiqiy boshqaruv panelini sinab ko'ring.
          </p>
        </div>

        {/* Browser mockup */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl shadow-slate-200/60 overflow-hidden max-w-5xl mx-auto">

          {/* Browser bar — desktop only */}
          <div className="hidden sm:flex items-center gap-2.5 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex gap-1.5">
              {["bg-red-400","bg-amber-400","bg-green-400"].map(c => (
                <div key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />
              ))}
            </div>
            <div className="flex-1 mx-3 bg-white rounded-lg px-3 py-1.5 text-[11px] text-gray-400 font-mono border border-gray-100 text-center">
              app.dentacrm.uz / dashboard
            </div>
            <Bell className="w-4 h-4 text-gray-400" />
          </div>

          {/* Mobile header */}
          <div className="sm:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center text-white font-black text-xs">S</div>
              <div>
                <p className="text-xs font-black text-gray-800">SmilePro</p>
                <p className="text-[9px] text-green-500 font-semibold">● Klinika rahbari</p>
              </div>
            </div>
            <Bell className="w-4 h-4 text-gray-400" />
          </div>

          {/* Mobile tab bar */}
          <div className="sm:hidden flex border-b border-gray-100 bg-white overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              const on = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`flex-1 min-w-fit flex flex-col items-center gap-1 px-3 py-2.5 text-center transition-all cursor-pointer border-b-2 ${on ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] font-bold whitespace-nowrap">{t.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          {/* App shell — desktop: sidebar + content, mobile: content only */}
          <div className="flex" style={{ minHeight: 420 }}>

            {/* Sidebar — desktop only */}
            <div className="hidden sm:flex w-48 shrink-0 bg-white border-r border-gray-100 p-3 flex-col gap-1">
              <div className="flex items-center gap-2 p-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center text-white font-black text-sm">S</div>
                <div>
                  <p className="text-[10px] font-black text-gray-800 leading-tight">SmilePro</p>
                  <p className="text-[8px] text-green-500 font-semibold">● Klinika rahbari</p>
                </div>
              </div>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-1">Boshqaruv paneli</p>
              {TABS.map(t => {
                const Icon = t.icon;
                const on = active === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActive(t.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${on ? 'bg-primary-600 text-white shadow-sm shadow-primary-200' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${on ? 'text-white' : 'text-gray-400'}`} />
                    <span className={`text-[10px] font-bold ${on ? 'text-white' : 'text-gray-700'}`}>{t.label}</span>
                  </button>
                );
              })}
              <div className="mt-auto p-2.5 bg-primary-50 border border-primary-100 rounded-xl">
                <p className="text-[8px] font-black text-primary-700 uppercase tracking-wide">SMS Paket xizmati</p>
                <p className="text-[9px] text-primary-500 font-semibold mt-0.5">Faol</p>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 p-4 sm:p-5 bg-gray-50/70 overflow-auto">
              {tabContent[active]}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
