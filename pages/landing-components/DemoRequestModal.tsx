import React, { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, CheckCircle, Phone, User, Building2, MapPin, Users, AlertCircle, Loader2 } from "lucide-react";
import { API_URL } from "../../services/api";
import { useLandingCopy } from "./useLandingCopy";
import { LANDING_CONST } from "./content";
import { markDemoSubmitted } from "./hooks/useDemoPopupTrigger";

interface DemoRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Status = "idle" | "loading" | "success" | "error";

/** Kiritilgan matndan +998 dan keyingi 9 ta raqamni ajratib oladi */
const toDigits = (raw: string) => {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  return d.slice(0, 9);
};

/** 901234567 -> "+998 90 123 45 67" */
const formatPhone = (d: string) => {
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return `+998${parts.length ? " " + parts.join(" ") : " "}`;
};

const FIELD =
  "w-full bg-slate-50 border-2 border-slate-100 focus:border-primary-500 focus:bg-white rounded-2xl " +
  "px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 outline-none transition-all";

export default function DemoRequestModal({ isOpen, onClose }: DemoRequestModalProps) {
  const { c } = useLandingCopy();
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: "", clinic: "", city: "", doctorsCount: 1 });
  const [digits, setDigits] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [phoneError, setPhoneError] = useState(false);

  const set = (k: "name" | "clinic" | "city") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Escape bilan yopish + fon aylanmasligi
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => firstFieldRef.current?.focus(), 60);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    onClose();
    // Yopilish animatsiyasi tugagach tozalaymiz — aks holda matn "sakrab" ketadi
    setTimeout(() => {
      if (status === "success") {
        setForm({ name: "", clinic: "", city: "", doctorsCount: 1 });
        setDigits("");
      }
      setStatus((s) => (s === "error" ? "idle" : s));
    }, 300);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.length !== 9) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStatus("loading");

    try {
      // DIQQAT: nisbiy manzil ("/api/...") ishlamaydi — frontend Vercel'da,
      // backend Railway'da. Vercel barcha noma'lum yo'llarni index.html ga
      // qaytaradi, natijada so'rov 200 OK bilan HTML olib keladi va lid
      // jimgina yo'qoladi. API_URL ikkalasini to'g'ri bog'laydi.
      const res = await fetch(`${API_URL}/public/demo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          clinicName: form.clinic.trim(),
          phone: `+998${digits}`,
          city: form.city.trim(),
          source: "landing",
          doctorsCount: form.doctorsCount,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data && data.success === false) throw new Error(data.message || "rejected");

      markDemoSubmitted();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onMouseDown={handleClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg my-auto z-10 rounded-3xl overflow-hidden shadow-2xl shadow-primary-900/30"
          >
            {/* Sarlavha */}
            <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-700 px-6 sm:px-8 pt-7 pb-12 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5" aria-hidden="true" />
              <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-white/5" aria-hidden="true" />
              <button
                onClick={handleClose}
                aria-label={c.modal.closeAria}
                className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="relative z-10 space-y-2">
                <span className="text-[10px] font-black text-primary-200 uppercase tracking-[0.2em]">
                  {c.modal.badge}
                </span>
                <h2 id={titleId} className="text-2xl sm:text-3xl font-extrabold text-white leading-tight lp-balance">
                  {c.modal.title}
                </h2>
                <p className="text-primary-100/85 text-sm">{c.modal.sub}</p>
              </div>
            </div>

            {/* Tana */}
            <div className="bg-white px-6 sm:px-8 py-7 -mt-5 rounded-t-3xl relative max-h-[65vh] overflow-y-auto">
              {status === "success" ? (
                <div className="text-center py-8 space-y-5">
                  <div className="w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-extrabold text-slate-900">{c.modal.successTitle}</h3>
                    <p className="text-base text-slate-500 leading-relaxed">
                      {c.modal.successBody(form.name.trim(), formatPhone(digits))}
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="px-8 py-3 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 cursor-pointer transition-colors"
                  >
                    {c.modal.close}
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <label htmlFor="lp-name" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <User className="w-4 h-4 text-primary-500" /> {c.modal.name}
                    </label>
                    <input
                      id="lp-name"
                      ref={firstFieldRef}
                      type="text"
                      required
                      autoComplete="name"
                      placeholder={c.modal.namePlaceholder}
                      value={form.name}
                      onChange={set("name")}
                      className={FIELD}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="lp-clinic" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Building2 className="w-4 h-4 text-primary-500" /> {c.modal.clinic}
                    </label>
                    <input
                      id="lp-clinic"
                      type="text"
                      required
                      placeholder={c.modal.clinicPlaceholder}
                      value={form.clinic}
                      onChange={set("clinic")}
                      className={FIELD}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="lp-phone" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Phone className="w-4 h-4 text-primary-500" /> {c.modal.phone}
                    </label>
                    <input
                      id="lp-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      aria-invalid={phoneError}
                      aria-describedby={phoneError ? "lp-phone-err" : undefined}
                      placeholder={c.modal.phonePlaceholder}
                      value={formatPhone(digits)}
                      onChange={(e) => {
                        setDigits(toDigits(e.target.value));
                        if (phoneError) setPhoneError(false);
                      }}
                      className={`${FIELD} font-mono ${phoneError ? "border-red-300 focus:border-red-500" : ""}`}
                    />
                    {phoneError && (
                      <p id="lp-phone-err" className="flex items-start gap-1.5 text-xs text-red-600 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {c.modal.phoneError}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="lp-doctors" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <Users className="w-4 h-4 text-primary-500" /> {c.modal.doctors}
                      </label>
                      <select
                        id="lp-doctors"
                        value={form.doctorsCount}
                        onChange={(e) => setForm((f) => ({ ...f, doctorsCount: Number(e.target.value) }))}
                        className={`${FIELD} cursor-pointer`}
                      >
                        {c.modal.doctorOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="lp-city" className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <MapPin className="w-4 h-4 text-primary-500" />
                        {c.modal.city}{" "}
                        <span className="text-slate-400 font-normal text-xs">{c.modal.cityOptional}</span>
                      </label>
                      <input
                        id="lp-city"
                        type="text"
                        placeholder={c.modal.cityPlaceholder}
                        value={form.city}
                        onChange={set("city")}
                        className={FIELD}
                      />
                    </div>
                  </div>

                  {status === "error" && (
                    <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 space-y-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {c.modal.errorTitle}
                      </p>
                      <p className="text-xs text-red-600 leading-relaxed">
                        {c.modal.errorBody}{" "}
                        <a href={LANDING_CONST.phoneHref} className="font-bold underline whitespace-nowrap">
                          {LANDING_CONST.phone}
                        </a>
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full py-4 min-h-[52px] rounded-2xl bg-primary-600 hover:bg-primary-700 disabled:opacity-70
                               disabled:cursor-not-allowed text-white font-extrabold text-base tracking-wide transition-all
                               active:scale-[0.98] cursor-pointer shadow-xl shadow-primary-500/25 flex items-center justify-center gap-2
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    {status === "loading" ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {c.modal.sending}
                      </>
                    ) : status === "error" ? (
                      c.modal.retry
                    ) : (
                      c.modal.submit
                    )}
                  </button>

                  <p className="text-xs text-slate-400 text-center">{c.modal.note}</p>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
