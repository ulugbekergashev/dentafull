import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Users,
  Calendar,
  DollarSign,
  Star,
  AlertCircle,
  Package,
  Bell,
  Search,
  Activity,
  ArrowUpRight,
  Coins,
  Banknote,
  CreditCard,
  TrendingDown,
  Wallet,
  Plus,
  Download,
  Lock,
} from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import type { LandingCopy } from "./content";
import { Section, SectionHeader, Reveal } from "./ui";

type Tab = "dashboard" | "patients" | "finances" | "stock";
type Copy = LandingCopy["demo"];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  dashboard: Activity,
  patients: Users,
  finances: DollarSign,
  stock: Package,
};

const EASE = [0.16, 1, 0.3, 1] as const;

/* ── KPI kartasi ─────────────────────────────────────────────── */
function KpiCard({
  icon: Icon,
  label,
  value,
  badge,
  badgeColor,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  badge?: string;
  badgeColor?: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="relative group overflow-hidden bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
      <div
        className={`absolute -top-2 -right-2 p-3 opacity-[0.04] transition-transform duration-500 group-hover:scale-110 ${iconColor}`}
        aria-hidden="true"
      >
        <Icon className="w-16 h-16" />
      </div>
      <div className="relative z-10">
        <div className={`p-2 w-fit ${iconBg} rounded-xl`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="mt-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{label}</p>
          <h4 className="text-2xl font-extrabold text-slate-900 mt-1 leading-none">{value}</h4>
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

/* ── Boshqaruv paneli ────────────────────────────────────────── */
function DashboardTab({ d, fmt }: { d: Copy; fmt: (n: number) => string }) {
  const reduce = useReducedMotion();

  const appointments = [
    { time: "09:00", patient: "Dilnoza Karimova", doctor: "Dr. Azimov", type: d.services.filling, status: "done" },
    { time: "10:30", patient: "Akmal Toshmatov", doctor: "Dr. Umarova", type: d.services.cleaning, status: "pending" },
    { time: "11:00", patient: "Zulfiya Rahimova", doctor: "Dr. Rasulov", type: d.services.canal, status: "pending" },
    { time: "12:30", patient: "Jasur Mirzayev", doctor: "Dr. Azimov", type: d.services.implant, status: "pending" },
  ];

  const chartBars = [32, 48, 41, 65, 58, 90, 72, 85, 78, 95, 68, 88];

  const statusStyle: Record<string, string> = {
    done: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    pending: "bg-amber-50 text-amber-700 border border-amber-100",
  };
  const statusLabel: Record<string, string> = { done: d.status.done, pending: d.status.pending };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label={d.kpi.patients}
          value="342"
          badge={d.kpi.patientsBadge}
          badgeColor="bg-emerald-50 text-emerald-700"
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
        />
        <KpiCard
          icon={Calendar}
          label={d.kpi.appointments}
          value="18"
          badge={d.kpi.appointmentsBadge}
          badgeColor="bg-amber-50 text-amber-700"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        <KpiCard
          icon={DollarSign}
          label={d.kpi.revenue}
          value="84.2M"
          badge={d.kpi.revenueBadge}
          badgeColor="bg-emerald-50 text-emerald-700"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <KpiCard
          icon={Star}
          label={d.kpi.leads}
          value="7"
          badge={d.kpi.leadsBadge}
          badgeColor="bg-indigo-50 text-indigo-700"
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Grafik */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.chartTitle}</p>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                {fmt(84200000)} <span className="text-sm font-semibold text-slate-400">{d.currency}</span>
              </p>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {d.kpi.revenueBadge}
            </span>
          </div>
          {/* Ustunlar balandligi foizda beriladi, shuning uchun ular bevosita
              aniq balandlikdagi qatorning bolasi bo'lishi shart. Ilgari orada
              balandligi aniqlanmagan ustun-konteyner turardi va foiz nolga
              aylanib, grafik butunlay ko'rinmay qolgan edi. */}
          <div className="flex items-end gap-1 h-28 sm:h-40 border-b border-slate-100">
            {chartBars.map((h, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { scaleY: 0 }}
                animate={reduce ? undefined : { scaleY: 1 }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.03 }}
                style={{ height: `${h}%`, transformOrigin: "bottom" }}
                className={`flex-1 rounded-t-md transition-colors ${
                  i === 9 ? "bg-primary-600" : "bg-primary-200 hover:bg-primary-300"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-1 mt-1.5">
            {d.months.map((m, i) => (
              <span
                key={m}
                className={`flex-1 text-center text-[8px] ${
                  i === 9 ? "text-primary-600 font-bold" : "text-slate-400 font-medium"
                }`}
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Bugungi jadval */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.scheduleTitle}</p>
            <span className="text-[10px] text-primary-600 font-bold">{d.seeAll}</span>
          </div>
          <div className="space-y-2">
            {appointments.map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="text-[10px] font-bold text-slate-400 w-9 shrink-0">{a.time}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-800 truncate">{a.patient}</p>
                  <p className="text-[9px] text-slate-400 truncate">
                    {a.doctor} · {a.type}
                  </p>
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

/* ── Bemorlar ────────────────────────────────────────────────── */
function PatientsTab({ d, fmt }: { d: Copy; fmt: (n: number) => string }) {
  const [search, setSearch] = useState("");

  const patients = [
    { name: "Dilnoza Karimova", phone: "+998 90 123 45 67", lastVisit: "25.06.2026", active: true, debt: 0 },
    { name: "Akmal Toshmatov", phone: "+998 93 987 65 43", lastVisit: "24.06.2026", active: true, debt: 250000 },
    { name: "Zulfiya Rahimova", phone: "+998 99 333 22 11", lastVisit: "20.06.2026", active: false, debt: 0 },
    { name: "Jasur Mirzayev", phone: "+998 97 777 88 99", lastVisit: "18.06.2026", active: true, debt: 1200000 },
    { name: "Nodira Yusupova", phone: "+998 90 555 44 33", lastVisit: "15.06.2026", active: true, debt: 0 },
  ];

  const q = search.toLowerCase();
  const filtered = patients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(search));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-2.5">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={d.searchPlaceholder}
          aria-label={d.searchPlaceholder}
          className="flex-1 text-sm text-slate-700 outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 border-b border-slate-50">
          <span className="col-span-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {d.colPatient}
          </span>
          <span className="col-span-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.colPhone}</span>
          <span className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {d.colLastVisit}
          </span>
          <span className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.colDebt}</span>
          <span className="col-span-1" />
        </div>

        {filtered.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-12 items-center px-4 py-3 border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
          >
            <div className="col-span-4 flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700 font-extrabold text-[10px] shrink-0">
                {p.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <span className="text-[11px] font-bold text-slate-800 truncate">{p.name}</span>
            </div>
            <span className="col-span-3 text-[10px] text-slate-500">{p.phone}</span>
            <span className="col-span-2 text-[10px] text-slate-400">{p.lastVisit}</span>
            <div className="col-span-2">
              {p.debt > 0 ? (
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">
                  {fmt(p.debt)}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
                  {d.debtPaid}
                </span>
              )}
            </div>
            <div className="col-span-1 flex justify-end">
              <span
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  p.active ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500"
                }`}
              >
                {p.active ? d.active : d.inactive}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Moliya ──────────────────────────────────────────────────── */
/**
 * Tizimdagi kassa ekranining qisqartirilgan ko'rinishi: tepada amallar,
 * so'ng olti ta ko'rsatkich, keyin to'lovlar jadvali va qarzdorlar.
 * Ilgari bu yerda uchta karta va oddiy jadval turardi — u mahsulotning
 * haqiqiy moliya bo'limiga umuman o'xshamas edi.
 */
function FinancesTab({ d, fmt }: { d: Copy; fmt: (n: number) => string }) {
  const f = d.fin;

  const txns = [
    { patient: "Dilnoza Karimova", service: d.services.filling, amount: 350000, doctor: "Azimov", method: "click", paid: true },
    { patient: "Akmal Toshmatov", service: d.services.implant, amount: 3500000, doctor: "Azimov", method: "card", paid: false },
    { patient: "Zulfiya Rahimova", service: d.services.canal, amount: 400000, doctor: "Rasulov", method: "cash", paid: true },
    { patient: "Jasur Mirzayev", service: d.services.cleaning, amount: 150000, doctor: "Umarova", method: "cash", paid: true },
    { patient: "Nodira Yusupova", service: d.services.braces, amount: 200000, doctor: "Umarova", method: "card", paid: false },
  ];

  const methodLabel: Record<string, string> = {
    cash: f.methodCash,
    card: f.methodCard,
    click: f.methodClick,
  };
  const methodDot: Record<string, string> = {
    cash: "bg-emerald-500",
    card: "bg-primary-500",
    click: "bg-cyan-500",
  };

  const paid = txns.filter((t) => t.paid);
  const unpaid = txns.filter((t) => !t.paid);
  const totalIn = paid.reduce((a, t) => a + t.amount, 0);
  const cash = paid.filter((t) => t.method === "cash").reduce((a, t) => a + t.amount, 0);
  const cashless = totalIn - cash;
  const expense = 310000;
  const debt = unpaid.reduce((a, t) => a + t.amount, 0);

  const kpis = [
    { icon: Coins, label: f.kpiTotal, value: totalIn, sub: f.subPayments(paid.length), fg: "text-slate-900", bg: "bg-slate-100", ico: "text-slate-500" },
    { icon: Banknote, label: f.kpiCash, value: cash, sub: f.subCurrency, fg: "text-emerald-600", bg: "bg-emerald-50", ico: "text-emerald-600" },
    { icon: CreditCard, label: f.kpiCashless, value: cashless, sub: f.subCardClick, fg: "text-primary-600", bg: "bg-primary-50", ico: "text-primary-600" },
    { icon: TrendingDown, label: f.kpiExpense, value: expense, sub: f.subCashOut, fg: "text-red-500", bg: "bg-red-50", ico: "text-red-500" },
    { icon: Wallet, label: f.kpiLeft, value: cash - expense, sub: f.subCashBox, fg: "text-amber-600", bg: "bg-amber-50", ico: "text-amber-600" },
    { icon: AlertCircle, label: f.kpiDebt, value: debt, sub: f.subUnpaid, fg: "text-slate-900", bg: "bg-slate-100", ico: "text-slate-400" },
  ];

  const actionBtn = "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-white";

  return (
    <div className="space-y-3">
      {/* Amallar qatori */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        <span className={`${actionBtn} bg-emerald-600`}>
          <Plus className="w-3.5 h-3.5" />
          {f.actionPay}
        </span>
        <span className={`${actionBtn} bg-red-500`}>
          <TrendingDown className="w-3.5 h-3.5" />
          {f.actionExpense}
        </span>
        <span className={`${actionBtn} bg-primary-600`}>
          <Download className="w-3.5 h-3.5" />
          {f.actionCollect}
        </span>
        <span className="shrink-0 flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
          <span className="px-2.5 py-1.5 text-[11px] font-bold bg-slate-900 text-white">{f.day}</span>
          <span className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400">{f.month}</span>
        </span>
        <span className="shrink-0 ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-[11px] font-bold">
          <Lock className="w-3.5 h-3.5" />
          {f.closeDay}
        </span>
      </div>

      {/* Ko'rsatkichlar */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
              <div className={`w-7 h-7 ${k.bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-3.5 h-3.5 ${k.ico}`} />
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 leading-tight">{k.label}</p>
              <p className={`text-base font-extrabold mt-0.5 leading-none ${k.fg}`}>{fmt(k.value)}</p>
              <p className="text-[9px] text-slate-400 mt-1 truncate">{k.sub}</p>
            </div>
          );
        })}
      </div>

      {/* To'lovlar jadvali */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.tableTitle}</p>
          <p className="text-[11px] font-extrabold text-emerald-600">{fmt(totalIn)}</p>
        </div>

        <div className="hidden sm:grid grid-cols-12 px-4 py-2.5 border-b border-slate-50">
          <span className="col-span-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.colPatient}</span>
          <span className="col-span-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.colService}</span>
          <span className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.colDoctor}</span>
          <span className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.colAmount}</span>
          <span className="col-span-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{f.colMethod}</span>
        </div>

        {txns.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-2 sm:grid-cols-12 gap-1 items-center px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors"
          >
            <span className="sm:col-span-4 text-[11px] font-bold text-slate-800 truncate">{t.patient}</span>
            <span className="hidden sm:block sm:col-span-3 text-[10px] text-slate-500 truncate">{t.service}</span>
            <span className="hidden sm:block sm:col-span-2 text-[10px] text-slate-400 truncate">{t.doctor}</span>
            <span className="sm:col-span-2 text-[11px] font-bold text-slate-800 text-right sm:text-left">{fmt(t.amount)}</span>
            <span className="sm:col-span-1 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${methodDot[t.method]}`} />
              <span className="text-[9px] text-slate-500 truncate">{methodLabel[t.method]}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Qarzdorlar */}
      <div className="bg-amber-50/60 rounded-3xl border border-amber-100 p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <p className="flex items-center gap-2 text-[10px] font-bold text-amber-700 uppercase tracking-widest">
            <AlertCircle className="w-3.5 h-3.5" />
            {f.unpaidTitle}
            <span className="text-amber-500 normal-case tracking-normal">{f.unpaidCount(unpaid.length)}</span>
          </p>
          <p className="text-[11px] font-extrabold text-amber-700">{fmt(debt)}</p>
        </div>
        <div className="space-y-1.5">
          {unpaid.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">{t.patient}</p>
                <p className="text-[9px] text-slate-400 truncate">
                  {t.doctor} · {t.service}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-amber-700">{fmt(t.amount)}</span>
                <span className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[9px] font-bold">{f.pay}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Ombor ───────────────────────────────────────────────────── */
function StockTab({ d }: { d: Copy }) {
  const items = [
    { name: d.materials[0], qty: 45, min: 10 },
    { name: d.materials[1], qty: 8, min: 20 },
    { name: d.materials[2], qty: 24, min: 5 },
    { name: d.materials[3], qty: 150, min: 50 },
    { name: d.materials[4], qty: 2, min: 10 },
  ];

  const state = (qty: number, min: number) => {
    if (qty >= min * 2) return { label: d.stockEnough, cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
    if (qty >= min) return { label: d.stockLow, cls: "bg-amber-50 text-amber-700 border border-amber-100" };
    return { label: d.stockOut, cls: "bg-red-50 text-red-600 border border-red-100" };
  };

  const needOrder = items.filter((i) => i.qty < i.min).length;

  return (
    <div className="space-y-3">
      {needOrder > 0 && (
        <div className="flex items-center gap-3 p-3.5 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-[11px] font-bold text-red-600">{d.stockAlert(needOrder)}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.stockTitle}</p>
        </div>
        {items.map((item, i) => {
          const s = state(item.qty, item.min);
          const pct = Math.min(100, Math.round((item.qty / (item.min * 3)) * 100));
          return (
            <div key={i} className="px-4 py-3.5 border-b border-slate-50">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[11px] font-bold text-slate-800">{item.name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-400 shrink-0">
                  {d.stockMin}: {item.min} {d.unitPcs} · {d.stockNow}:{" "}
                  <b className="text-slate-700">
                    {item.qty} {d.unitPcs}
                  </b>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Asosiy komponent ────────────────────────────────────────── */
export default function DashboardDemo() {
  const { c, fmt } = useLandingCopy();
  const reduce = useReducedMotion();
  const [active, setActive] = useState<Tab>("dashboard");
  const d = c.demo;

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: d.tabs.dashboard },
    { id: "patients", label: d.tabs.patients },
    { id: "finances", label: d.tabs.finances },
    { id: "stock", label: d.tabs.stock },
  ];

  const panes: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab d={d} fmt={fmt} />,
    patients: <PatientsTab d={d} fmt={fmt} />,
    finances: <FinancesTab d={d} fmt={fmt} />,
    stock: <StockTab d={d} />,
  };

  return (
    <Section id="demo-dashboard" bg="slate" border>
      <SectionHeader badge={d.badge} title={d.title} subtitle={d.sub} className="mb-10" />

      <Reveal>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-300/40 overflow-hidden max-w-5xl mx-auto">
          {/* Brauzer qatori — faqat keng ekranda */}
          <div className="hidden sm:flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="flex-1 mx-3 bg-white rounded-lg px-3 py-1.5 text-[11px] text-slate-400 border border-slate-100 text-center truncate">
              {d.urlBar}
            </span>
            <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>

          {/* Ilova sarlavhasi — haqiqiy tizimdagi kabi */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center text-white font-extrabold text-sm shrink-0">
                S
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-800 truncate">{d.clinic}</p>
                <p className="text-[10px] text-emerald-500 font-semibold truncate">{d.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-50 border border-primary-100 text-[10px] font-bold text-primary-700">
                {d.smsPack} · {d.smsPackState}
              </span>
              <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>
          </div>

          {/* Bo'limlar gorizontal qatorda — tizimning o'zida ham shunday.
              Ilgari bu yerda yon panel turardi va u yuqoridagi haqiqiy
              ekran rasmlariga o'xshamas edi. */}
          <div className="flex border-b border-slate-100 bg-white overflow-x-auto no-scrollbar px-2">
            {tabs.map((t) => {
              const Icon = TAB_ICONS[t.id];
              const on = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  aria-pressed={on}
                  className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    on
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] sm:text-xs font-bold">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Asosiy maydon */}
          <div className="p-4 sm:p-5 bg-slate-50/70" style={{ minHeight: 420 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {panes[active]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
