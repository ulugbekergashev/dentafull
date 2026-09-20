import React, { useMemo, useState } from 'react';
import { Card } from './Common';
import { AlertCircle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { Appointment, Transaction } from '../types';
import { CHART_COLORS } from '../utils/chartColors';
import { useLanguage } from '../context/LanguageContext';

// Qabullar grafiklari. Ilgari ular Bosh sahifada, kunlik jadval va qarzlar
// ostida turardi. Endi klinika egasi ularni Moliya → Hisobot da, o'sha
// sahifaning davr filtri bilan ko'radi. Shifokorda Hisobot yo'q — unga
// Bosh sahifada ko'rsatiladi.

interface TrendChartsProps {
  /** Tanlangan davrdagi qabullar */
  appointments: Appointment[];
  /** Tanlangan davrdagi to'lovlar — grafikka faqat to'langanlari tushadi */
  transactions: Transaction[];
  showFinance?: boolean;
}

/** Moliyaviy oqim (kunma-kun tushum va tashriflar) va xizmatlar taqsimoti */
export const TrendCharts: React.FC<TrendChartsProps> = ({ appointments: filteredAppointments, transactions: filteredTransactions, showFinance = true }) => {
  const { t } = useLanguage();

  // Dynamic Service Data from Appointments
  const SERVICE_DATA = useMemo(() => {
    const serviceCount = new Map<string, number>();

    filteredAppointments.forEach(app => {
      const count = serviceCount.get(app.type) || 0;
      serviceCount.set(app.type, count + 1);
    });

    const colors = CHART_COLORS;

    return Array.from(serviceCount.entries())
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAppointments]);

  // Dynamic Chart Data Aggregation
  const trendData = useMemo(() => {
    const dataMap = new Map<string, { revenue: number, appointments: number }>();

    // Kun bo'yicha guruhlanadi. To'lov sanasi ko'pincha vaqt bilan keladi
    // ("2026-09-03T12:25:00.000Z"), qabulniki esa faqat kun — ilgari ular alohida
    // nuqtalar bo'lib chizilardi: tushum va qabullar bir kunga to'g'ri kelmasdi,
    // o'qda esa xom vaqt satrlari chiqardi.
    const dayOf = (date: string) => String(date).slice(0, 10);

    // Aggregate Transactions (faqat to'langanlari)
    filteredTransactions.forEach(t => {
      if (t.status !== 'Paid') return;
      const day = dayOf(t.date);
      const current = dataMap.get(day) || { revenue: 0, appointments: 0 };
      dataMap.set(day, { ...current, revenue: current.revenue + t.amount });
    });

    // Aggregate Appointments
    filteredAppointments.forEach(a => {
      const day = dayOf(a.date);
      const current = dataMap.get(day) || { revenue: 0, appointments: 0 };
      dataMap.set(day, { ...current, appointments: current.appointments + 1 });
    });

    // Convert to Array & Sort
    const result = Array.from(dataMap.entries())
      .map(([date, data]) => ({ name: date, ...data }))
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());

    // If no data, return empty or a placeholder
    return result.length > 0 ? result : [];
  }, [filteredTransactions, filteredAppointments]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Revenue Chart */}
      {showFinance && <Card className="p-8 lg:col-span-2 rounded-[2rem]">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black text-gray-900 dark:text-white">
            {t('dashboard.financialFlow')}
          </h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" /> {t('dashboard.income')}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
              <div className="w-2.5 h-2.5 rounded-full bg-success" /> {t('dashboard.visits')}
            </div>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAppts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" dark:stroke="#374151" strokeOpacity={0.4} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
                dy={10}
              />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', borderRadius: '16px', border: 'none', color: '#fff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: '#9CA3AF', marginBottom: '0.5rem', fontWeight: 'bold' }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="#2563EB"
                strokeWidth={4}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="appointments"
                stroke="#059669"
                strokeWidth={4}
                fillOpacity={1}
                fill="url(#colorAppts)"
                activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          {trendData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm font-medium">
              {t("auto.Ma'lumotlar mavjud emas")}
            </div>
          )}
        </div>
      </Card>}

      {/* Service Distribution */}
      <Card className="p-8 rounded-[2rem]">
        <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">{t('dashboard.serviceDistribution')}</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={SERVICE_DATA}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={8}
                dataKey="value"
                stroke="none"
              >
                {SERVICE_DATA.map((entry, index) => (
                  <Cell key={`cell - ${index} `} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                formatter={(value) => <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{value}</span>}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', borderRadius: '16px', border: 'none', color: '#fff' }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

/** Qabullar intensivligi: joriy oy kunlari yoki oxirgi 12 oy bo'yicha */
export const IntensityChart: React.FC<{ appointments: Appointment[] }> = ({ appointments }) => {
  const { t } = useLanguage();
  const [intensityView, setIntensityView] = useState<'month' | 'year'>('year');

  // Seasonal Intensity Data
  const intensityData = useMemo(() => {
    const uzMonths = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
    const now = new Date();

    if (intensityView === 'month') {
      // Current Month Daily Distribution
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const days: { [key: string]: number } = {};

      for (let i = 1; i <= daysInMonth; i++) {
        days[i.toString()] = 0;
      }

      appointments.forEach(a => {
        const d = new Date(a.date);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          days[d.getDate().toString()]++;
        }
      });

      return Object.entries(days).map(([name, count]) => ({ name, count }));
    } else {
      // Last 12 Months Overview
      const result: { name: string, count: number, monthIndex: number, year: number }[] = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        result.push({
          name: uzMonths[d.getMonth()],
          count: 0,
          monthIndex: d.getMonth(),
          year: d.getFullYear()
        });
      }

      appointments.forEach(a => {
        const apptDate = new Date(a.date);
        const item = result.find(r => r.monthIndex === apptDate.getMonth() && r.year === apptDate.getFullYear());
        if (item) {
          item.count++;
        }
      });

      return result;
    }
  }, [appointments, intensityView]);

  return (
    <Card className="p-8 rounded-[2rem]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">
            {t('auto.Qabullar')} <span className="text-danger">{t('auto.Intensivligi')}</span>
          </h3>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
            {intensityView === 'month' ? t('dashboard.byMonthDays') : t('dashboard.byLast12')}
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setIntensityView('month')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${intensityView === 'month'
              ? 'bg-white dark:bg-gray-700 text-danger shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {t('auto.OYLIK')}
          </button>
          <button
            onClick={() => setIntensityView('year')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${intensityView === 'year'
              ? 'bg-white dark:bg-gray-700 text-danger shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {t('auto.YILLIK')}
          </button>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={intensityData}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FB7185" stopOpacity={1} />
                <stop offset="100%" stopColor="#E11D48" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" dark:stroke="#374151" strokeOpacity={0.4} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 9, fontWeight: 700 }}
              interval={intensityView === 'month' ? 1 : 0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.05)', radius: [8, 8, 4, 4] }}
              contentStyle={{ backgroundColor: '#1F2937', borderRadius: '12px', border: 'none', color: '#fff' }}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
            />
            <Bar
              dataKey="count"
              fill="url(#barGradient)"
              radius={[8, 8, 4, 4]}
              barSize={intensityView === 'month' ? 12 : 32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-6 flex items-start gap-3 text-xs text-gray-500 font-medium bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
        <div className="p-1.5 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-rose-500" />
        </div>
        <p className="leading-relaxed">
          {intensityView === 'year'
            ? t("auto.Yillik tahlil klinika faolligini oylar kesimida ko'rsatadi. Kunlik tahlilga o'tish uchun tepadan «OYLIK» tugmasini bosing.")
            : t("auto.Joriy oy uchun kunlik qabullar soni. Bu qaysi kunlarda klinika yuklamasi yuqori ekanini ko'rsatadi.")}
        </p>
      </div>
    </Card>
  );
};
