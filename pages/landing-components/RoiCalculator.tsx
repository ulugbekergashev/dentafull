import React, { useState } from "react";
import { TrendingUp, Clock, Landmark } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, Reveal, CountUp } from "./ui";

/* Hisob-kitob asoslari — matnda ham aynan shu raqamlar ochiq yozilgan */
const WORKING_DAYS = 26;
const AVG_CHECK = 300_000;
const NO_SHOW_RATE = 0.12;
const RECOVERY_RATE = 0.7;
const BILLING_UPLIFT = 0.08;
const MINUTES_PER_PATIENT = 25;
/** Taqqoslash uchun o'rta tarif narxi */
const REFERENCE_PRICE = 290_000;

export default function RoiCalculator() {
  const { c, fmt } = useLandingCopy();
  const [doctors, setDoctors] = useState(4);
  const [daily, setDaily] = useState(6);

  const monthlyPatients = doctors * daily * WORKING_DAYS;
  const timeSavedHours = Math.round((monthlyPatients * MINUTES_PER_PATIENT) / 60);
  const workDaysSaved = Math.max(1, Math.round(timeSavedHours / 8));
  const recoveredPatients = Math.round(monthlyPatients * NO_SHOW_RATE * RECOVERY_RATE);
  const recoveredRevenue = recoveredPatients * AVG_CHECK;
  const billingAdded = Math.round(monthlyPatients * AVG_CHECK * BILLING_UPLIFT);
  const totalGain = recoveredRevenue + billingAdded;
  const timesPrice = Math.max(1, Math.round(totalGain / REFERENCE_PRICE));

  const slider =
    "w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2";

  return (
    <Section id="calculator" bg="white" border>
      <SectionHeader badge={c.roi.badge} title={c.roi.title} subtitle={c.roi.sub} className="mb-14" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Kiritish paneli */}
        <Reveal className="lg:col-span-5">
          <div className="h-full bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-center gap-8">
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest">{c.roi.inputsTitle}</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center gap-3 text-sm">
                <label htmlFor="roi-doctors" className="font-semibold text-slate-600">
                  {c.roi.doctorsLabel}
                </label>
                <span className="px-3 py-1 bg-white border border-primary-200 rounded-lg font-bold text-primary-700 whitespace-nowrap">
                  {c.roi.doctorsValue(doctors)}
                </span>
              </div>
              <input
                id="roi-doctors"
                type="range"
                min={1}
                max={25}
                value={doctors}
                onChange={(e) => setDoctors(Number(e.target.value))}
                className={slider}
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>1</span>
                <span>12</span>
                <span>25</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center gap-3 text-sm">
                <label htmlFor="roi-patients" className="font-semibold text-slate-600">
                  {c.roi.patientsLabel}
                </label>
                <span className="px-3 py-1 bg-white border border-indigo-200 rounded-lg font-bold text-indigo-700 whitespace-nowrap">
                  {c.roi.patientsValue(daily)}
                </span>
              </div>
              <input
                id="roi-patients"
                type="range"
                min={1}
                max={15}
                value={daily}
                onChange={(e) => setDaily(Number(e.target.value))}
                className={slider}
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>1</span>
                <span>8</span>
                <span>15</span>
              </div>
            </div>

            <p className="p-3.5 rounded-2xl bg-white border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
              {c.roi.note}
            </p>
          </div>
        </Reveal>

        {/* Natijalar */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5 items-stretch">
          <Reveal delay={0.06}>
            <div className="h-full bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{c.roi.timeTitle}</h3>
                  <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{c.roi.timeDesc}</p>
                </div>
              </div>
              <div className="mt-8">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 block">
                  <CountUp value={timeSavedHours} format={fmt} />{" "}
                  <span className="text-xs text-slate-400 font-medium">{c.roi.timeUnit}</span>
                </span>
                <span className="text-[11px] text-emerald-600 font-bold mt-1 block">{c.roi.timeSub(workDaysSaved)}</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="h-full bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{c.roi.patientsTitle}</h3>
                  <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{c.roi.patientsDesc}</p>
                </div>
              </div>
              <div className="mt-8">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 block">
                  +<CountUp value={recoveredPatients} format={fmt} />{" "}
                  <span className="text-xs text-slate-400 font-medium">{c.roi.patientsUnit}</span>
                </span>
                <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
                  {c.roi.patientsSub(fmt(recoveredRevenue))}
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.18} className="sm:col-span-2">
            <div className="bg-gradient-to-br from-primary-50 to-indigo-50 border border-primary-200 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-left shadow-sm">
              <div className="space-y-3 max-w-md">
                <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-700">
                  <Landmark className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{c.roi.totalTitle}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">{c.roi.totalDesc}</p>
                </div>
              </div>

              <div className="shrink-0 text-center sm:text-right space-y-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-primary-800 block">
                  +<CountUp value={totalGain} format={fmt} /> {c.roi.totalCurrency}
                </span>
                <span className="text-[11px] text-slate-500 block font-bold uppercase tracking-wider">
                  {c.roi.totalLabel}
                </span>
                <span className="px-3 py-1 rounded-full bg-primary-100 text-[11px] text-primary-800 font-bold inline-block mt-2">
                  {c.roi.timesBadge(timesPrice)}
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
