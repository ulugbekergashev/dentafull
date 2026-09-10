import React from "react";
import { Check, X, Minus } from "lucide-react";
import { useLandingCopy } from "./useLandingCopy";
import { Section, SectionHeader, Reveal } from "./ui";

type Row = { label: string; paper: number; excel: number; denta: number };
type Legend = { no: string; partial: string; yes: string };

/** 0 — yo'q, 1 — qisman, 2 — bor. Rang yolg'iz ma'no tashimasin uchun belgi + matn. */
function Mark({ level, labels }: { level: number; labels: Legend }) {
  const map = [
    { cls: "bg-slate-100 text-slate-400", Icon: X, text: labels.no },
    { cls: "bg-amber-50 text-amber-600", Icon: Minus, text: labels.partial },
    { cls: "bg-emerald-50 text-emerald-600", Icon: Check, text: labels.yes },
  ];
  const { cls, Icon, text } = map[level] ?? map[0];

  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${cls}`} title={text}>
      <Icon className="w-4 h-4" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Qog'oz / Excel / DentaCRM taqqoslash jadvali. */
export default function Comparison() {
  const { c } = useLandingCopy();
  const rows = c.compare.rows as Row[];
  const legend = c.compare.legend as Legend;
  const [paper, excel, denta] = c.compare.cols;

  return (
    <Section id="compare" bg="white" border>
      <SectionHeader badge={c.compare.badge} title={c.compare.title} subtitle={c.compare.sub} className="mb-12" />

      {/* Keng ekran — jadval */}
      <Reveal className="hidden md:block max-w-4xl mx-auto">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th scope="col" className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <span className="sr-only">{c.compare.title}</span>
                </th>
                <th scope="col" className="py-4 px-4 text-center text-xs font-bold text-slate-500">
                  {paper}
                </th>
                <th scope="col" className="py-4 px-4 text-center text-xs font-bold text-slate-500">
                  {excel}
                </th>
                <th scope="col" className="py-4 px-4 text-center text-xs font-extrabold text-primary-700 bg-primary-50">
                  {denta}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-slate-100">
                  <th scope="row" className="py-3.5 px-5 text-sm font-medium text-slate-700 text-left">
                    {r.label}
                  </th>
                  <td className="py-3.5 px-4 text-center">
                    <Mark level={r.paper} labels={legend} />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Mark level={r.excel} labels={legend} />
                  </td>
                  <td className="py-3.5 px-4 text-center bg-primary-50/60">
                    <Mark level={r.denta} labels={legend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      {/* Mobil — kartalar */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">{r.label}</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: paper, level: r.paper, hl: false },
                { label: excel, level: r.excel, hl: false },
                { label: denta, level: r.denta, hl: true },
              ].map((col) => (
                <div
                  key={col.label}
                  className={`flex flex-col items-center gap-1.5 py-2 rounded-xl ${
                    col.hl ? "bg-primary-50" : "bg-slate-50"
                  }`}
                >
                  <Mark level={col.level} labels={legend} />
                  <span className={`text-[10px] font-bold ${col.hl ? "text-primary-700" : "text-slate-500"}`}>
                    {col.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
