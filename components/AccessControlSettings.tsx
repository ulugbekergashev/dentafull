import React, { useEffect, useMemo, useState } from 'react';
import {
   Users, User, Calendar as CalendarIcon, Banknote, Wallet, Target, IdCard, Package, FlaskConical,
   ListOrdered, MessageSquare, Settings as SettingsIcon, ChevronDown, Lock, Eye, Pencil, Check,
   AlertTriangle, Loader2, Shield,
} from 'lucide-react';
import { Clinic } from '../types';
import { api } from '../services/api';
import {
   PermRole, PermLevel, RolePerms, PERM_LEVELS, presetPerms, resolveRolePerms, buildAccessControl,
} from '../utils/permissions';
import {
   PERM_MATRIX, MatrixGroup, MatrixRow, MatrixIcon, GroupAgg, GroupAction,
   readRow, writeRow, rowSignature, rowHasRole, groupHasRole, groupClosed, groupSame, groupAgg, applyGroup, isWarn, levelOf,
} from '../utils/permissionMatrix';

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
const OPT_ICONS: Record<MatrixIcon, React.ElementType> = { eye: Eye, pen: Pencil, check: Check, user: User, users: Users };

const ROLES: { id: PermRole; name: string }[] = [
   { id: 'receptionist', name: 'Resepshn' },
   { id: 'doctor', name: 'Shifokor' },
];
const roleName = (role: PermRole) => ROLES.find(r => r.id === role)!.name;

const LEVEL_ORDER: PermLevel[] = ['standard', 'simple', 'full'];
const LEVEL_DESC: Record<PermLevel, string> = {
   standard: "Hozirgacha qanday ishlagan bo'lsa, shunday",
   simple: "Faqat kundalik ish — o'chirish va xavfli pul amallari yopiq",
   full: "Hamma bo'lim va amallar ochiq",
};
const levelLabel = (l: PermLevel) => PERM_LEVELS.find(x => x.id === l)!.label;

const AGG_LABEL: Record<GroupAgg, string> = { full: "To'liq", view: "Faqat ko'radi", none: "Yo'q", mixed: 'Aralash' };
const GROUP_ACTIONS: { id: GroupAction; label: string }[] = [
   { id: 'full', label: "To'liq" },
   { id: 'standard', label: 'Standart' },
   { id: 'view', label: "Faqat ko'radi" },
   { id: 'none', label: "Yo'q" },
];
function groupActionDesc(g: MatrixGroup, a: GroupAction): string {
   const menu = g.rows.some(r => r.kind === 'gate');
   if (a === 'full') return "Bo'limdagi hamma amal ochiq";
   if (a === 'standard') return "Shu bo'limni standart holatga qaytaradi";
   if (a === 'view') return menu ? "Ko'radi, hech narsani o'zgartirmaydi" : "Faqat summalarni ko'radi";
   return menu ? "Bo'lim menyuda ham chiqmaydi" : "Pulga oid hech bir amal yo'q";
}

type Tone = 'none' | 'view' | 'edit' | 'warn' | 'off';
const CHIP: Record<Tone, string> = {
   none: 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400',
   view: 'bg-primary-50 border-primary-200 text-primary-700 dark:bg-primary-900/20 dark:border-primary-800 dark:text-primary-300',
   edit: 'bg-primary-200 border-primary-300 text-primary-900 dark:bg-primary-800/60 dark:border-primary-700 dark:text-primary-100',
   warn: 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200',
   off: 'bg-gray-50 border-dashed border-gray-200 text-gray-400 dark:bg-gray-800/40 dark:border-gray-700 dark:text-gray-500',
};
const GROUP_CHIP: Record<GroupAgg, string> = {
   full: 'border-primary-300 text-primary-900 dark:border-primary-700 dark:text-primary-200',
   view: 'border-primary-200 text-primary-700 dark:border-primary-800 dark:text-primary-300',
   none: 'border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400',
   mixed: 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200',
};
const DOT: Record<Tone | 'std', string> = {
   none: 'bg-white border-gray-300 dark:bg-gray-800 dark:border-gray-500',
   view: 'bg-primary-50 border-primary-300 dark:bg-primary-900/40 dark:border-primary-600',
   edit: 'bg-primary-300 border-primary-500 dark:bg-primary-600 dark:border-primary-400',
   warn: 'bg-amber-200 border-amber-500 dark:bg-amber-700 dark:border-amber-400',
   off: 'bg-gray-100 border-gray-300',
   std: 'bg-white border-dashed border-gray-400 dark:bg-gray-800',
};
const GROUP_DOT: Record<GroupAction, string> = { full: DOT.edit, standard: DOT.std, view: DOT.view, none: DOT.none };

// Kompyuterda: nom + ikki rol ustuni
const COLS = 'grid grid-cols-[minmax(0,1fr)_200px_200px] xl:grid-cols-[minmax(0,1fr)_232px_232px] items-center gap-x-4 px-5 lg:px-6';

type Pop =
   | { kind: 'row'; group: string; row: string; role: PermRole; up: boolean }
   | { kind: 'group'; group: string; role: PermRole; up: boolean }
   | { kind: 'level'; role: PermRole; up: boolean };
type PopTarget =
   | { kind: 'row'; group: string; row: string; role: PermRole }
   | { kind: 'group'; group: string; role: PermRole }
   | { kind: 'level'; role: PermRole };
const samePop = (a: PopTarget, b: PopTarget) =>
   a.kind === b.kind && a.role === b.role
   && (a.kind === 'level' || (a as any).group === (b as any).group)
   && (a.kind !== 'row' || (a as any).row === (b as any).row);

interface ChipView {
   label: string;
   tone: Tone;
   group?: GroupAgg;
   icon?: React.ElementType;
   changed: boolean;
   disabled: boolean;
   aria: string;
   title?: string;
   target: PopTarget;
}
type CellView = { type: 'na'; text: string } | { type: 'fixed'; text: string } | ({ type: 'chip' } & ChipView);

interface MenuItem { key: string; label: string; desc: string; selected: boolean; dot: string; onPick: () => void }
interface MenuView { title: string; sub: string; items: MenuItem[] }

const MenuList: React.FC<{ menu: MenuView; large?: boolean }> = ({ menu, large }) => (
   <>
      <p className={`px-2 pt-1.5 font-bold text-gray-900 dark:text-white ${large ? 'text-[15px]' : 'text-[13px]'}`}>{menu.title}</p>
      {menu.sub && <p className="px-2 pt-0.5 pb-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">{menu.sub}</p>}
      <div className="flex flex-col gap-0.5 pt-1.5">
         {menu.items.map(it => (
            <button
               key={it.key}
               type="button"
               onClick={it.onPick}
               aria-pressed={it.selected}
               autoFocus={it.selected}
               className={`flex w-full items-start gap-2.5 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${large ? 'min-h-[52px] p-2.5' : 'min-h-[44px] p-2'} ${it.selected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
            >
               <span className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border-[1.5px] ${it.dot}`} />
               <span className="flex-1 min-w-0">
                  <span className={`block font-semibold text-gray-900 dark:text-white ${large ? 'text-[14.5px]' : 'text-[13.5px]'}`}>{it.label}</span>
                  <span className={`block leading-snug text-gray-500 dark:text-gray-400 ${large ? 'text-[12.5px]' : 'text-xs'}`}>{it.desc}</span>
               </span>
               {it.selected && <Check className="mt-0.5 w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" />}
            </button>
         ))}
      </div>
   </>
);

// Ruxsatlar: rollar ustunlarda, har katakda bitta tanlov (Yo'q / Ko'radi / O'zgartiradi ...).
// Saqlash formati o'zgarmagan — utils/permissionMatrix.ts o'sha harflar va bayroqlarga yozadi.
// Klinika egasining ruxsatlari cheklanmaydi va bu yerda sozlanmaydi.
export const AccessControlSettings: React.FC<AccessControlSettingsProps> = ({ currentClinic, doctorCount, receptionistCount }) => {
   const initial = useMemo<Record<PermRole, RolePerms>>(() => ({
      doctor: resolveRolePerms('doctor', currentClinic?.accessControl),
      receptionist: resolveRolePerms('receptionist', currentClinic?.accessControl),
   }), [currentClinic?.id, currentClinic?.accessControl]);

   const [draft, setDraft] = useState(initial);
   const [pop, setPop] = useState<Pop | null>(null);
   const [closed, setClosed] = useState<Record<string, boolean>>({});
   const [mobileRole, setMobileRole] = useState<PermRole>('receptionist');
   const [saving, setSaving] = useState(false);
   const [saved, setSaved] = useState(false);
   useEffect(() => { setDraft(initial); }, [initial]);

   useEffect(() => {
      if (!pop) return;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
   }, [pop]);

   const staffCount = (role: PermRole) => role === 'doctor' ? doctorCount : receptionistCount;

   const change = (role: PermRole, fn: (p: RolePerms) => void) => {
      setSaved(false);
      setPop(null);
      setDraft(prev => {
         const next = JSON.parse(JSON.stringify(prev)) as Record<PermRole, RolePerms>;
         fn(next[role]);
         return next;
      });
   };
   const applyLevel = (role: PermRole, level: PermLevel) => {
      setSaved(false);
      setPop(null);
      setDraft(prev => ({ ...prev, [role]: presetPerms(role, level) }));
   };

   const openPop = (target: PopTarget, e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      // Pastda joy qolmasa ro'yxat tepaga ochiladi
      const up = window.innerHeight - r.bottom < 330 && r.top > 330;
      setPop(cur => (cur && samePop(cur, target) ? null : { ...target, up } as Pop));
   };
   const isOpen = (target: PopTarget) => !!pop && samePop(pop, target);

   const rowChanged = (g: MatrixGroup, r: MatrixRow, role: PermRole) =>
      rowSignature(g, r, draft[role]) !== rowSignature(g, r, initial[role]);

   const changes = useMemo(() => {
      const count: Record<PermRole, number> = { receptionist: 0, doctor: 0 };
      for (const role of ROLES.map(x => x.id)) {
         for (const g of PERM_MATRIX) for (const r of g.rows) {
            if (rowHasRole(g, r, role) && rowSignature(g, r, draft[role]) !== rowSignature(g, r, initial[role])) count[role]++;
         }
      }
      return count;
   }, [draft, initial]);
   const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
   const totalChanges = changes.receptionist + changes.doctor;

   const rowCell = (g: MatrixGroup, r: MatrixRow, role: PermRole): CellView => {
      const fixed = r.fixed?.[role];
      if (fixed) return { type: 'fixed', text: groupClosed(g, draft[role]) ? '—' : fixed };
      if (!rowHasRole(g, r, role)) return { type: 'na', text: '' };
      const perms = draft[role];
      const read = readRow(g, r, perms);
      const off = r.kind !== 'gate' && groupClosed(g, perms);
      const warn = !off && isWarn(r, read);
      const tone: Tone = off ? 'off' : warn ? 'warn' : read.opt.tone;
      const icon = off ? undefined : warn ? AlertTriangle : read.opt.icon ? OPT_ICONS[read.opt.icon] : undefined;
      return {
         type: 'chip', tone, icon,
         label: off ? 'Yopiq' : read.opt.label,
         changed: rowChanged(g, r, role),
         disabled: off,
         aria: `${r.name}, ${roleName(role)}: ${off ? "bo'lim yopiq" : read.opt.label}`,
         title: off ? `${g.name} yopiq — avval bo'limni oching` : read.opt.desc,
         target: { kind: 'row', group: g.id, row: r.id, role },
      };
   };
   const groupCell = (g: MatrixGroup, role: PermRole): CellView => {
      if (g.rows.length === 1) return rowCell(g, g.rows[0], role);
      if (!groupHasRole(g, role)) return { type: 'na', text: "Bu rolda yo'q" };
      const agg = groupAgg(g, role, draft[role]);
      return {
         type: 'chip', tone: 'none', group: agg,
         label: AGG_LABEL[agg],
         changed: g.rows.some(r => rowHasRole(g, r, role) && rowChanged(g, r, role)),
         disabled: false,
         aria: `${g.name}, ${roleName(role)}: ${AGG_LABEL[agg]}`,
         title: "Butun bo'limni birdaniga o'zgartirish",
         target: { kind: 'group', group: g.id, role },
      };
   };

   const menuFor = (p: Pop): MenuView | null => {
      if (p.kind === 'level') {
         const cur = levelOf(p.role, draft[p.role]);
         return {
            title: `Shablon · ${roleName(p.role)}`,
            sub: "Butun ustunni birdaniga o'zgartiradi",
            items: LEVEL_ORDER.map(l => ({
               key: l, label: levelLabel(l), desc: LEVEL_DESC[l], selected: cur === l,
               dot: l === 'full' ? DOT.edit : l === 'standard' ? DOT.std : DOT.view,
               onPick: () => applyLevel(p.role, l),
            })),
         };
      }
      const g = PERM_MATRIX.find(x => x.id === p.group);
      if (!g) return null;
      if (p.kind === 'group') {
         const agg = groupAgg(g, p.role, draft[p.role]);
         const isStd = groupSame(g, p.role, draft[p.role], presetPerms(p.role, 'standard'));
         return {
            title: `${g.name} · ${roleName(p.role)}`,
            sub: `Hozir: ${AGG_LABEL[agg]}${isStd ? ' · standart holatda' : ''}`,
            items: GROUP_ACTIONS.map(a => ({
               key: a.id, label: a.label, desc: groupActionDesc(g, a.id),
               selected: a.id !== 'standard' && a.id === agg,
               dot: GROUP_DOT[a.id],
               onPick: () => change(p.role, perms => applyGroup(g, p.role, perms, a.id)),
            })),
         };
      }
      const r = g.rows.find(x => x.id === p.row);
      if (!r) return null;
      const read = readRow(g, r, draft[p.role]);
      const items: MenuItem[] = r.opts.map((o, i) => ({
         key: o.id, label: o.label, desc: o.desc, selected: !read.custom && read.index === i,
         dot: DOT[r.warnFrom != null && i >= r.warnFrom ? 'warn' : o.tone],
         onPick: () => change(p.role, perms => writeRow(g, r, perms, o)),
      }));
      // Eski jadvalda qo'lda belgilangan holat — tanlanmaguncha shunday qoladi
      if (read.custom) items.unshift({ key: 'custom', label: read.opt.label, desc: read.opt.desc, selected: true, dot: DOT[read.opt.tone], onPick: () => setPop(null) });
      return { title: `${r.name} · ${roleName(p.role)}`, sub: r.hint || g.name, items };
   };
   const menu = pop ? menuFor(pop) : null;

   const handleSave = async () => {
      if (!currentClinic?.id || !dirty) return;
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

   const renderChip = (c: ChipView) => {
      const Icon = c.icon;
      const open = isOpen(c.target);
      const colors = c.group ? `border-[1.5px] border-dashed bg-white dark:bg-gray-800 ${GROUP_CHIP[c.group]}` : `border ${CHIP[c.tone]}`;
      return (
         <button
            type="button"
            onClick={e => openPop(c.target, e)}
            disabled={c.disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={c.aria}
            title={c.title}
            className={`relative flex h-10 w-full items-center gap-1.5 rounded-xl pl-3 pr-2.5 text-[13.5px] font-semibold transition-[filter] hover:brightness-[.97] disabled:cursor-not-allowed disabled:hover:brightness-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${colors}`}
         >
            {Icon && <Icon className="w-[15px] h-[15px] shrink-0" />}
            <span className="flex-1 min-w-0 truncate text-left">{c.label}</span>
            <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
            {c.changed && <span aria-hidden="true" className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-800" />}
         </button>
      );
   };

   // desk: kompyuterdagi jadval — ro'yxat katak ostida ochiladi; telefonda pastdan chiqadi
   const renderCell = (cell: CellView, key: string, desk: boolean) => {
      if (cell.type === 'na') return <span key={key} className="pl-1 text-[12.5px] text-gray-400 dark:text-gray-500">{cell.text}</span>;
      if (cell.type === 'fixed') {
         return (
            <span key={key} title="Resepshn har doim barcha bemorlarni ko'radi" className="inline-flex h-10 items-center px-3 text-[13.5px] font-semibold text-gray-500 dark:text-gray-400">
               {cell.text}
            </span>
         );
      }
      const open = desk && isOpen(cell.target) && !!menu;
      return (
         <div key={key} className="relative min-w-0">
            {renderChip(cell)}
            {open && pop && (
               <div role="dialog" aria-label={menu!.title} className={`absolute right-0 z-50 w-[300px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-xl ${pop.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
                  <MenuList menu={menu!} />
               </div>
            )}
         </div>
      );
   };

   const levelButton = (role: PermRole, desk: boolean) => {
      const level = levelOf(role, draft[role]);
      const target: PopTarget = { kind: 'level', role };
      const open = isOpen(target);
      return (
         <div className="relative self-start">
            <button
               type="button"
               onClick={e => openPop(target, e)}
               aria-haspopup="dialog"
               aria-expanded={open}
               aria-label={`${roleName(role)} shabloni: ${level ? levelLabel(level) : "qo'lda sozlangan"}`}
               className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${level ? 'border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}
            >
               {level ? levelLabel(level) : "Qo'lda sozlangan"}
               <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>
            {desk && open && menu && (
               <div role="dialog" aria-label={menu.title} className="absolute left-0 top-full mt-1.5 z-50 w-[300px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-xl">
                  <MenuList menu={menu} />
               </div>
            )}
         </div>
      );
   };

   const groupTitle = (g: MatrixGroup) => {
      const Icon = MODULE_ICONS[g.id] || Shield;
      const note = g.note || (g.rows.length === 1 ? g.rows[0].hint : undefined);
      return (
         <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
               <Icon className="w-[17px] h-[17px]" />
            </span>
            <span className="ml-1 flex min-w-0 flex-col">
               <span className="text-[15px] font-bold text-gray-900 dark:text-white">{g.name}</span>
               {note && <span className="text-[12.5px] text-gray-500 dark:text-gray-400">{note}</span>}
            </span>
         </>
      );
   };
   const groupHead = (g: MatrixGroup) => {
      const multi = g.rows.length > 1;
      const expanded = multi && !closed[g.id];
      return multi ? (
         <button
            type="button"
            onClick={() => { setPop(null); setClosed(c => ({ ...c, [g.id]: !c[g.id] })); }}
            aria-expanded={expanded}
            className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 rounded-lg"
         >
            <ChevronDown className={`w-[18px] h-[18px] shrink-0 text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            {groupTitle(g)}
         </button>
      ) : (
         <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2">
            <span className="w-[18px] shrink-0" />
            {groupTitle(g)}
         </div>
      );
   };

   const anyExpanded = PERM_MATRIX.some(g => g.rows.length > 1 && !closed[g.id]);
   const toggleAll = () => {
      setPop(null);
      setClosed(anyExpanded ? Object.fromEntries(PERM_MATRIX.map(g => [g.id, true])) : {});
   };

   const mobileGroups = PERM_MATRIX.filter(g => groupHasRole(g, mobileRole));
   const mobileMissing = PERM_MATRIX.filter(g => !groupHasRole(g, mobileRole)).map(g => g.name);
   const changeParts = ROLES.filter(r => changes[r.id] > 0).map(r => `${r.name}: ${changes[r.id]}`).join(', ');

   return (
      <div className="space-y-4">
         <section className="md:rounded-2xl md:border md:border-gray-200 md:dark:border-gray-700 md:bg-white md:dark:bg-gray-800 md:shadow-sm">
            <div className="flex items-start justify-between gap-6 md:px-5 lg:px-6 md:pt-5 pb-3">
               <div className="max-w-3xl">
                  <h2 className="text-[17px] font-bold text-gray-900 dark:text-white">Ruxsatlar</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-gray-600 dark:text-gray-400">
                     Har bir rol qaysi bo'limni ko'radi va nimani o'zgartiradi — bitta jadvalda. Ko'rmaydigan bo'lim xodim menyusida chiqmaydi. Sozlama butun klinikaga, hamma filialga bitta.
                  </p>
               </div>
               <button
                  type="button"
                  onClick={toggleAll}
                  className="hidden md:inline-flex h-9 shrink-0 items-center rounded-[10px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
               >
                  {anyExpanded ? "Hammasini yig'ish" : 'Hammasini ochish'}
               </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:px-5 lg:px-6 pb-4 text-[12.5px] text-gray-600 dark:text-gray-400">
               <span className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${CHIP.edit}`}><Pencil className="w-3.5 h-3.5" />O'zgartiradi</span>
               <span className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${CHIP.view}`}><Eye className="w-3.5 h-3.5" />Ko'radi</span>
               <span className="inline-flex items-center gap-2">
                  <span className={`inline-flex h-6 items-center rounded-lg border px-2 text-xs font-semibold ${CHIP.none}`}>Yo'q</span>
                  <span className="hidden sm:inline">ko'rmaydi; bo'lim yopilsa, menyuda ham chiqmaydi</span>
               </span>
               <span className="inline-flex items-center gap-2">
                  <span className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${CHIP.warn}`}><AlertTriangle className="w-3.5 h-3.5" />Ruxsat</span>
                  <span className="hidden sm:inline">xavfli amal ochiq</span>
               </span>
               <span className="inline-flex items-center gap-1.5 md:ml-auto text-gray-500 dark:text-gray-400"><Lock className="w-3.5 h-3.5" />Klinika egasi cheklanmaydi</span>
            </div>

            {/* Kompyuter va planshet: rollar yonma-yon */}
            <div className="hidden md:block">
               <div className={`${COLS} min-h-[68px] border-y border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 lg:sticky lg:top-28 ${pop?.kind === 'level' ? 'z-[45]' : 'z-20'}`}>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Bo'lim</span>
                  {ROLES.map(r => (
                     <div key={r.id} className="flex flex-col gap-1.5 py-2.5">
                        <div className="flex items-baseline gap-2">
                           <span className="text-[14.5px] font-bold text-gray-900 dark:text-white">{r.name}</span>
                           {staffCount(r.id) !== undefined && <span className="text-xs text-gray-500 dark:text-gray-400">{staffCount(r.id)} xodim</span>}
                        </div>
                        {levelButton(r.id, true)}
                     </div>
                  ))}
               </div>

               {PERM_MATRIX.map(g => {
                  const expanded = g.rows.length > 1 && !closed[g.id];
                  return (
                     <React.Fragment key={g.id}>
                        <div className={`${COLS} min-h-[60px] border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40`}>
                           {groupHead(g)}
                           {ROLES.map(r => renderCell(groupCell(g, r.id), r.id, true))}
                        </div>
                        {expanded && g.rows.map(row => (
                           <div key={row.id} className={`${COLS} min-h-[58px] border-t border-gray-100 dark:border-gray-700/60`}>
                              <div className="min-w-0 py-2 pl-[70px]">
                                 <div className="text-sm font-medium text-gray-900 dark:text-white">{row.name}</div>
                                 {row.hint && <div className="text-[12.5px] text-gray-500 dark:text-gray-400">{row.hint}</div>}
                              </div>
                              {ROLES.map(r => renderCell(rowCell(g, row, r.id), r.id, true))}
                           </div>
                        ))}
                     </React.Fragment>
                  );
               })}
            </div>

            {/* Telefon: bitta rol, tanlov pastdan chiqadi */}
            <div className="md:hidden space-y-3">
               <div role="group" aria-label="Rol" className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                  {ROLES.map(r => {
                     const sel = r.id === mobileRole;
                     return (
                        <button
                           key={r.id}
                           type="button"
                           aria-pressed={sel}
                           onClick={() => { setPop(null); setMobileRole(r.id); }}
                           className={`flex min-h-[48px] flex-1 flex-col items-center justify-center rounded-lg ${sel ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
                        >
                           <span className={`text-sm font-bold ${sel ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{r.name}</span>
                           {staffCount(r.id) !== undefined && <span className="text-xs text-gray-500 dark:text-gray-400">{staffCount(r.id)} xodim</span>}
                        </button>
                     );
                  })}
               </div>
               <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-gray-600 dark:text-gray-400">{roleName(mobileRole)} uchun shablon</span>
                  {levelButton(mobileRole, false)}
               </div>
               {mobileGroups.map(g => {
                  const expanded = g.rows.length > 1 && !closed[g.id];
                  const rows = expanded ? g.rows.filter(r => rowHasRole(g, r, mobileRole) || !!r.fixed?.[mobileRole]) : [];
                  return (
                     <div key={g.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex items-center gap-2.5 px-2.5 py-2">
                           {groupHead(g)}
                           <div className="w-[156px] shrink-0">{renderCell(groupCell(g, mobileRole), 'g', false)}</div>
                        </div>
                        {rows.map(row => (
                           <div key={row.id} className="flex min-h-[58px] items-center gap-2.5 border-t border-gray-100 dark:border-gray-700/60 py-1.5 pl-3.5 pr-2.5">
                              <div className="min-w-0 flex-1">
                                 <div className="text-sm font-medium text-gray-900 dark:text-white">{row.name}</div>
                                 {row.hint && <div className="text-xs text-gray-500 dark:text-gray-400">{row.hint}</div>}
                              </div>
                              <div className="w-[156px] shrink-0">{renderCell(rowCell(g, row, mobileRole), 'c', false)}</div>
                           </div>
                        ))}
                     </div>
                  );
               })}
               {mobileMissing.length > 0 && (
                  <p className="px-1 text-[13px] leading-snug text-gray-500 dark:text-gray-400">{roleName(mobileRole)}da yo'q bo'limlar: {mobileMissing.join(', ')}</p>
               )}
            </div>

            <p className="mt-3 md:mt-0 md:border-t border-gray-200 dark:border-gray-700 md:px-5 lg:px-6 md:py-3.5 px-1 text-xs text-gray-500 dark:text-gray-400">
               Qo'shish, tahrirlash, o'chirish va pulga oid amallar serverda ham tekshiriladi — tugmani yashirish bilan cheklanib qolmaydi.
            </p>
         </section>

         {/* Saqlash — pastda doim ko'rinib turadi */}
         <div className="sticky bottom-20 lg:bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-4 py-3 shadow-lg">
            <span className={`text-sm ${saved ? 'text-emerald-600' : dirty ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}>
               {saved ? 'Saqlandi — sahifa yangilanmoqda...'
                  : dirty ? (totalChanges > 0 ? `${totalChanges} ta o'zgarish saqlanmagan · ${changeParts}` : "O'zgarishlar saqlanmagan")
                     : "O'zgarishlar yo'q"}
            </span>
            <div className="flex gap-2">
               <button
                  type="button"
                  onClick={() => { setPop(null); setDraft(initial); setSaved(false); }}
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

         {/* Ochiq ro'yxatni yopish: kompyuterda — bo'sh joyni bosish, telefonda — xira fon */}
         {pop && (
            <button type="button" tabIndex={-1} aria-label="Ro'yxatni yopish" onClick={() => setPop(null)} className="hidden md:block fixed inset-0 z-40 cursor-default" />
         )}
         {pop && menu && (
            <div className="md:hidden">
               <button type="button" tabIndex={-1} aria-label="Ro'yxatni yopish" onClick={() => setPop(null)} className="fixed inset-0 z-[60] bg-gray-900/40" />
               <div role="dialog" aria-label={menu.title} className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-w-lg rounded-t-3xl bg-white dark:bg-gray-800 px-3 pt-2 pb-6 shadow-2xl">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-600" />
                  <MenuList menu={menu} large />
               </div>
            </div>
         )}
      </div>
   );
};
