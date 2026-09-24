import React, { useEffect, useMemo, useState } from 'react';
import {
   Users, Calendar as CalendarIcon, Banknote, Wallet, Target, IdCard, Package, FlaskConical,
   ListOrdered, MessageSquare, Settings as SettingsIcon, ChevronDown, Lock, CheckCircle2, MinusCircle,
   AlertTriangle, Loader2, Shield,
} from 'lucide-react';
import { Clinic } from '../types';
import { api } from '../services/api';
import {
   PermRole, PermLevel, RolePerms, ModulePerm, PermModuleDef, PERM_ACTIONS, PERM_LEVELS,
   modulesForRole, presetPerms, resolveRolePerms, buildAccessControl, matchingLevel, countPerms,
} from '../utils/permissions';

interface AccessControlSettingsProps {
   currentClinic?: Clinic;
   doctorCount?: number;
   receptionistCount?: number;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
   patients: Users, calendar: CalendarIcon, money: Banknote, finance: Wallet, leads: Target,
   doctors: IdCard, inventory: Package, lab: FlaskConical, queue: ListOrdered,
   messages: MessageSquare, settings: SettingsIcon,
};

const ROLES: { id: PermRole; name: string }[] = [
   { id: 'receptionist', name: 'Resepshn' },
   { id: 'doctor', name: 'Shifokor' },
];

const CODE: Record<string, string> = { view: 'v', create: 'c', edit: 'e', delete: 'd', export: 'x' };
const ORDER = 'vcedx';

type Rule = { tone: 'allow' | 'deny' | 'warn'; text: string };

/** Tanlangan ruxsatlarning eng muhimlari — oddiy tilda, o'ng ustun uchun */
function summarize(role: PermRole, p: RolePerms): Rule[] {
   const rules: Rule[] = [];
   const has = (mid: string, sid: string, code: string) => !!p[mid]?.on && (p[mid].cells[sid] || '').includes(code);
   const sp = (mid: string, id: string) => p[mid]?.sp[id];

   if (p.patients?.on) {
      if (role === 'doctor') {
         rules.push(p.patients.scope === 'all'
            ? { tone: 'allow', text: "Klinikadagi barcha bemor va qabullarni ko'radi" }
            : { tone: 'deny', text: "Faqat o'ziga biriktirilgan bemor va qabullarni ko'radi" });
      }
      if (has('patients', 'card', 'd')) rules.push({ tone: 'warn', text: "Bemor kartasini o'chira oladi" });
      else rules.push({ tone: 'deny', text: "Bemor kartasini o'chira olmaydi" });
      if (!has('patients', 'history', 'v')) rules.push({ tone: 'deny', text: "Kasallik tarixini ko'rmaydi" });
      if (sp('patients', 'phone') !== true) rules.push({ tone: 'deny', text: "Telefon raqamlari yulduzcha bilan ko'rinadi" });
   } else {
      rules.push({ tone: 'deny', text: "Bemorlar bo'limiga kira olmaydi" });
   }

   if (sp('money', 'payCreate')) rules.push({ tone: 'allow', text: "Bemordan to'lov qabul qiladi" });
   else rules.push({ tone: 'deny', text: "To'lov qabul qilmaydi — faqat kassaga yuboradi" });
   if (sp('money', 'payEdit')) rules.push({ tone: 'warn', text: "To'lovni tahrirlay oladi" });
   if (sp('money', 'payDelete')) rules.push({ tone: 'warn', text: "To'lovni o'chira oladi" });
   else rules.push({ tone: 'deny', text: "To'lovni o'chira olmaydi" });
   const discount = Number(sp('money', 'discount')) || 0;
   if (discount >= 100) rules.push({ tone: 'warn', text: 'Chegirma — cheklovsiz' });
   else if (discount > 0) rules.push({ tone: 'allow', text: `Chegirma — ${discount}% gacha` });
   else rules.push({ tone: 'deny', text: 'Chegirma bera olmaydi' });
   if (sp('money', 'waive')) rules.push({ tone: 'warn', text: 'Qabulni bepul deb yopa oladi' });
   if (sp('money', 'backdate')) rules.push({ tone: 'warn', text: "O'tgan sanaga to'lov yoza oladi" });
   else rules.push({ tone: 'deny', text: "O'tgan sanaga to'lov yoza olmaydi" });
   if (sp('money', 'amounts') !== true) rules.push({ tone: 'deny', text: "Bosh sahifada tushum summalarini ko'rmaydi" });

   if (role === 'receptionist') {
      if (!p.finance?.on) rules.push({ tone: 'deny', text: 'Kassaga kira olmaydi' });
      else {
         if (has('finance', 'reports', 'v')) rules.push({ tone: 'warn', text: "Hisobotni (tushum va foyda) ko'radi" });
         if (sp('finance', 'reopen')) rules.push({ tone: 'warn', text: 'Yopilgan kunni qayta ocha oladi' });
      }
      if (has('settings', 'services', 'e')) rules.push({ tone: 'warn', text: "Xizmat narxlarini o'zgartira oladi" });
      if (has('doctors', 'list', 'd')) rules.push({ tone: 'warn', text: "Xodimlarni qo'sha va o'chira oladi" });
      if (p.messages?.on && sp('messages', 'bulk')) rules.push({ tone: 'warn', text: "Ko'p bemorga birdaniga SMS yubora oladi" });
   }
   return rules;
}

const RULE_STYLE: Record<Rule['tone'], { icon: React.ElementType; cls: string }> = {
   allow: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
   deny: { icon: MinusCircle, cls: 'text-gray-400 dark:text-gray-500' },
   warn: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
};

const Switch: React.FC<{ on: boolean; onToggle: () => void; label: string; disabled?: boolean }> = ({ on, onToggle, label, disabled }) => (
   <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
   >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
   </button>
);

// Ruxsatlar: shifokor va resepshn qaysi bo'limga kiradi va ichida nima qila oladi.
// Klinika egasining ruxsatlari cheklanmaydi va bu yerda sozlanmaydi.
export const AccessControlSettings: React.FC<AccessControlSettingsProps> = ({ currentClinic, doctorCount, receptionistCount }) => {
   const initial = useMemo<Record<PermRole, RolePerms>>(() => ({
      doctor: resolveRolePerms('doctor', currentClinic?.accessControl),
      receptionist: resolveRolePerms('receptionist', currentClinic?.accessControl),
   }), [currentClinic?.id, currentClinic?.accessControl]);

   const [draft, setDraft] = useState(initial);
   const [role, setRole] = useState<PermRole>('receptionist');
   const [open, setOpen] = useState<Record<string, boolean>>({ money: true });
   const [saving, setSaving] = useState(false);
   const [saved, setSaved] = useState(false);
   useEffect(() => { setDraft(initial); }, [initial]);

   const perms = draft[role];
   const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
   const level = matchingLevel(role, perms);
   const staffCount = role === 'doctor' ? doctorCount : receptionistCount;
   const roleName = ROLES.find(r => r.id === role)!.name;
   const modules = modulesForRole(role);

   const change = (fn: (p: RolePerms) => void) => {
      setSaved(false);
      setDraft(prev => {
         const next = JSON.parse(JSON.stringify(prev)) as Record<PermRole, RolePerms>;
         fn(next[role]);
         return next;
      });
   };

   const toggleCell = (mid: string, sid: string, code: string) => change(p => {
      let cur = p[mid].cells[sid] || '';
      if (cur.includes(code)) cur = code === 'v' ? '' : cur.split(code).join('');
      else cur = cur + code + (code !== 'v' ? 'v' : '');
      p[mid].cells[sid] = ORDER.split('').filter(ch => cur.includes(ch)).join('');
   });

   const applyLevel = (l: PermLevel) => {
      setSaved(false);
      setDraft(prev => ({ ...prev, [role]: presetPerms(role, l) }));
   };

   const handleSave = async () => {
      if (!currentClinic?.id) return;
      setSaving(true);
      try {
         await api.clinics.updateAccessControl(currentClinic.id, buildAccessControl(draft));
         setSaved(true);
         // Menyu va barcha sahifalar yangi ruxsat bilan qayta yuklansin
         setTimeout(() => window.location.reload(), 800);
      } catch (error: any) {
         alert(error?.message || 'Ruxsatlarni saqlashda xatolik');
      } finally {
         setSaving(false);
      }
   };

   const rules = summarize(role, perms);
   const menuOn = modules.filter(m => m.menu && perms[m.id]?.on);
   const menuOff = modules.filter(m => m.menu && !perms[m.id]?.on);

   const renderModule = (m: PermModuleDef) => {
      const t: ModulePerm = perms[m.id];
      const Icon = MODULE_ICONS[m.id] || Shield;
      const active = !m.menu || t.on;
      const hasScope = !!m.scopeRoles?.includes(role);
      const note = m.id === 'calendar' ? (role === 'doctor' ? m.note : undefined) : m.note;
      const hasBody = m.sections.length > 0 || m.specials.length > 0 || hasScope || !!note;
      const isOpen = hasBody && !!open[m.id];
      const { on, total } = countPerms(m, t);
      const meta = !active ? "Menyuda ko'rinmaydi"
         : total === 0 ? 'Menyuda ko\'rinadi'
            : `${on} / ${total} ruxsat` + (hasScope ? (t.scope === 'all' ? ' · barcha bemorlar' : " · faqat o'z bemorlari") : '');

      return (
         <section key={m.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 min-h-[64px]">
               <button
                  type="button"
                  onClick={() => hasBody && setOpen(o => ({ ...o, [m.id]: !o[m.id] }))}
                  aria-expanded={hasBody ? isOpen : undefined}
                  disabled={!hasBody}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:cursor-default"
               >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-700'}`}>
                     <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                     <span className={`block text-[15px] font-semibold ${active ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{m.name}</span>
                     <span className="block text-[13px] text-gray-500 dark:text-gray-400 truncate">{meta}</span>
                  </span>
                  {hasBody && <ChevronDown className={`w-[18px] h-[18px] shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
               </button>
               {m.menu ? (
                  <div className="flex items-center gap-2.5 shrink-0">
                     <span className="hidden sm:inline text-[13px] text-gray-500 dark:text-gray-400 w-16 text-right">{t.on ? 'Menyuda' : 'Yashirin'}</span>
                     <Switch on={t.on} onToggle={() => change(p => { p[m.id].on = !p[m.id].on; })} label={`${m.name} — menyuda ko'rinsin`} />
                  </div>
               ) : (
                  <span className="shrink-0 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">Har doim amal qiladi</span>
               )}
            </div>

            {isOpen && (
               <div className="border-t border-gray-100 dark:border-gray-700 px-4 pt-4 pb-5 space-y-4">
                  {!active && (
                     <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
                        Bu bo'lim xodimning menyusida ko'rinmaydi. Yoqsangiz, quyidagi ruxsatlar amal qiladi.
                     </p>
                  )}
                  <div className={`space-y-4 ${active ? '' : 'opacity-50'}`}>
                     {note && <p className="text-[13px] text-gray-500 dark:text-gray-400">{note}</p>}
                     {hasScope && (
                        <div className="flex flex-wrap items-center gap-3">
                           <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">{m.scopeLabel}</span>
                           <div role="group" aria-label={m.scopeLabel} className="inline-flex gap-0.5 rounded-xl bg-gray-100 dark:bg-gray-700 p-1">
                              {([['own', "Faqat o'ziga biriktirilgan"], ['all', 'Barcha bemorlar']] as const).map(([k, label]) => (
                                 <button
                                    key={k}
                                    type="button"
                                    aria-pressed={t.scope === k}
                                    disabled={!active}
                                    onClick={() => change(p => { p[m.id].scope = k; })}
                                    className={`h-8 px-3 rounded-lg text-[13px] font-medium transition-colors ${t.scope === k ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}
                                 >
                                    {label}
                                 </button>
                              ))}
                           </div>
                        </div>
                     )}

                     {m.sections.length > 0 && (
                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                           <div className="min-w-[560px]">
                              <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,80px)] items-center min-h-[40px] bg-gray-50 dark:bg-gray-900/40 text-xs font-semibold text-gray-600 dark:text-gray-400">
                                 <span className="px-3">Bo'lim</span>
                                 {PERM_ACTIONS.map(a => <span key={a.id} className="text-center">{a.label}</span>)}
                              </div>
                              {m.sections.map(sec => (
                                 <div key={sec.id} className="grid grid-cols-[minmax(0,1fr)_repeat(5,80px)] items-center min-h-[48px] border-t border-gray-100 dark:border-gray-700">
                                    <div className="px-3 py-1.5 min-w-0">
                                       <div className="text-sm font-medium text-gray-900 dark:text-white">{sec.name}</div>
                                       {sec.hint && <div className="text-xs text-gray-500 dark:text-gray-400">{sec.hint}</div>}
                                    </div>
                                    {PERM_ACTIONS.map(a => {
                                       if (!sec.acts.includes(a.id)) return <span key={a.id} aria-hidden="true" className="text-center text-gray-300 dark:text-gray-600">—</span>;
                                       const fixed = a.id === 'view' && !!sec.fixedView;
                                       const checked = fixed || (t.cells[sec.id] || '').includes(CODE[a.id]);
                                       return (
                                          <label key={a.id} title={fixed ? "Bo'lim ochiq bo'lsa har doim ko'rinadi" : undefined} className={`flex h-10 items-center justify-center ${fixed || !active ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                             <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={fixed || !active}
                                                onChange={() => toggleCell(m.id, sec.id, CODE[a.id])}
                                                aria-label={`${sec.name}: ${a.label}`}
                                                className="h-[18px] w-[18px] rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-60"
                                             />
                                          </label>
                                       );
                                    })}
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}

                     {m.specials.length > 0 && (
                        <div className="space-y-2">
                           {m.sections.length > 0 && <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Maxsus amallar</p>}
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {m.specials.map(s => {
                                 const v = t.sp[s.id];
                                 return (
                                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 min-h-[60px]">
                                       <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                                             {s.name}
                                             {s.warn && <span className="rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">Ehtiyot</span>}
                                          </div>
                                          {s.desc && <div className="text-xs leading-snug text-gray-500 dark:text-gray-400">{s.desc}</div>}
                                       </div>
                                       {s.limit ? (
                                          <span className="flex items-center gap-1.5 shrink-0 text-sm text-gray-700 dark:text-gray-300">
                                             <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={Number(v) || 0}
                                                disabled={!active}
                                                onChange={e => {
                                                   const n = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                                                   change(p => { p[m.id].sp[s.id] = n; });
                                                }}
                                                onWheel={e => e.currentTarget.blur()}
                                                aria-label={`${s.name}, foizda`}
                                                className="w-16 h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-right text-sm dark:text-white focus:ring-2 focus:ring-primary-500/30 outline-none"
                                             />
                                             %
                                          </span>
                                       ) : (
                                          <Switch on={v === true} disabled={!active} label={s.name} onToggle={() => change(p => { p[m.id].sp[s.id] = !(p[m.id].sp[s.id] === true); })} />
                                       )}
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            )}
         </section>
      );
   };

   return (
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px] gap-5 items-start">
         {/* Rollar */}
         <aside className="space-y-3 lg:sticky lg:top-32">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Rollar</p>
            <div className="flex lg:flex-col gap-2">
               {ROLES.map(r => {
                  const sel = r.id === role;
                  const count = r.id === 'doctor' ? doctorCount : receptionistCount;
                  const modulesOn = modulesForRole(r.id).filter(m => m.menu && draft[r.id][m.id]?.on).length;
                  return (
                     <button
                        key={r.id}
                        type="button"
                        onClick={() => setRole(r.id)}
                        aria-pressed={sel}
                        className={`flex-1 lg:flex-none text-left rounded-xl border px-3.5 py-3 min-h-[56px] transition-colors ${sel ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20' : 'border-gray-200 bg-white hover:border-primary-200 dark:border-gray-700 dark:bg-gray-800'}`}
                     >
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{r.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                           {count !== undefined ? `${count} xodim · ` : ''}{modulesOn} bo'lim
                        </span>
                     </button>
                  );
               })}
            </div>
            <div className="hidden lg:flex items-start gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
               <Lock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
               <span className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  <b className="text-gray-900 dark:text-white font-semibold">Klinika egasi</b> hamma narsani ko'radi va qiladi — cheklanmaydi.
               </span>
            </div>
         </aside>

         {/* Ruxsatlar */}
         <div className="min-w-0 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
               <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{roleName}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                     {staffCount !== undefined ? `${staffCount} xodim · ` : ''}
                     {level ? `${PERM_LEVELS.find(l => l.id === level)!.label} shablon` : "Qo'lda sozlangan"}
                  </p>
               </div>
               <div className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-500 dark:text-gray-400">Shablon</span>
                  <div role="group" aria-label="Shablon" className="inline-flex gap-0.5 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                     {PERM_LEVELS.map(l => (
                        <button
                           key={l.id}
                           type="button"
                           aria-pressed={level === l.id}
                           onClick={() => applyLevel(l.id)}
                           className={`h-8 px-3.5 rounded-lg text-[13px] font-semibold transition-colors ${level === l.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'}`}
                        >
                           {l.label}
                        </button>
                     ))}
                  </div>
               </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400">
               <span><b className="font-semibold text-gray-900 dark:text-white">Standart</b> — hozirgacha qanday ishlagan bo'lsa, shunday</span>
               <span><b className="font-semibold text-gray-900 dark:text-white">Sodda</b> — faqat kundalik ish</span>
               <span>«Ko'rish» olib tashlansa, qatordagi boshqa amallar ham o'chadi</span>
            </div>

            {modules.map(renderModule)}

            {/* Saqlash — pastda doim ko'rinib turadi */}
            <div className="sticky bottom-20 lg:bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-4 py-3 shadow-lg">
               <span className={`text-sm ${saved ? 'text-emerald-600' : dirty ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}>
                  {saved ? 'Saqlandi — sahifa yangilanmoqda...' : dirty ? "O'zgarishlar saqlanmagan" : "O'zgarishlar yo'q"}
               </span>
               <div className="flex gap-2">
                  <button
                     type="button"
                     onClick={() => { setDraft(initial); setSaved(false); }}
                     disabled={!dirty || saving}
                     className="h-10 px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     Bekor qilish
                  </button>
                  <button
                     type="button"
                     onClick={handleSave}
                     disabled={!dirty || saving}
                     className="h-10 px-5 rounded-xl bg-primary-600 hover:bg-primary-700 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                     {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                     Saqlash
                  </button>
               </div>
            </div>
         </div>

         {/* Natija */}
         <aside className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-32 space-y-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div>
               <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Natija</p>
               <h3 className="text-base font-bold text-gray-900 dark:text-white">{roleName} nimani ko'radi</h3>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3.5">
               <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Menyu</p>
               <ul className="space-y-1">
                  <li className="flex items-center gap-2 text-sm text-gray-900 dark:text-white"><span className="h-1.5 w-1.5 rounded-full bg-primary-600" />Bosh sahifa</li>
                  {menuOn.map(m => (
                     <li key={m.id} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white"><span className="h-1.5 w-1.5 rounded-full bg-primary-600" />{m.name}</li>
                  ))}
               </ul>
               {menuOff.length > 0 && (
                  <p className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-[13px] text-gray-500 dark:text-gray-400">
                     Menyuda yo'q: {menuOff.map(m => m.name).join(', ')}
                  </p>
               )}
            </div>
            <div className="space-y-2">
               <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">Asosiy qoidalar</p>
               <ul className="space-y-1.5">
                  {rules.map(r => {
                     const { icon: RuleIcon, cls } = RULE_STYLE[r.tone];
                     return (
                        <li key={r.text} className="flex items-start gap-2 text-[13px] leading-snug text-gray-800 dark:text-gray-200">
                           <RuleIcon className={`w-4 h-4 mt-px shrink-0 ${cls}`} />
                           {r.text}
                        </li>
                     );
                  })}
               </ul>
            </div>
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
               Qo'shish, tahrirlash, o'chirish va pulga oid amallar serverda ham tekshiriladi — tugmani yashirish bilan cheklanib qolmaydi.
            </p>
         </aside>
      </div>
   );
};
