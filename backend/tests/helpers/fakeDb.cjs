// Xotiradagi soxta baza — Prisma'ning testlarda ishlatiladigan qismini takrorlaydi.
// Haqiqiy bazaga ulanmaydi. Model birinchi murojaatda o'zi paydo bo'ladi:
//   const db = createFakeDb({ clinic: [{ id: 'c1', name: 'Test' }] });
//   await db.supportUser.create({ data: { chatId: '1' } });
//
// Bilmagan shartga duch kelsa XATO tashlaydi — test jimgina noto'g'ri natija
// bilan "o'tib ketmasligi" uchun.
const crypto = require('crypto');

const isPlain = (v) => v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);
const cmp = (a, b) => (a instanceof Date ? a.getTime() : a) - (b instanceof Date ? b.getTime() : b);

function matchField(value, cond) {
  if (!isPlain(cond)) {
    if (cond instanceof Date && value instanceof Date) return cond.getTime() === value.getTime();
    return (value ?? null) === (cond ?? null);
  }
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case 'equals': return (value ?? null) === (arg ?? null);
      case 'not': return !matchField(value, arg);
      case 'in': return arg.includes(value);
      case 'notIn': return !arg.includes(value);
      case 'gt': return value != null && cmp(value, arg) > 0;
      case 'gte': return value != null && cmp(value, arg) >= 0;
      case 'lt': return value != null && cmp(value, arg) < 0;
      case 'lte': return value != null && cmp(value, arg) <= 0;
      case 'contains': return typeof value === 'string' && value.toLowerCase().includes(String(arg).toLowerCase());
      case 'startsWith': return typeof value === 'string' && value.startsWith(arg);
      case 'endsWith': return typeof value === 'string' && value.endsWith(arg);
      case 'mode': return true;
      default: throw new Error(`soxta baza bu shartni bilmaydi: ${op}`);
    }
  });
}

function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'AND') return [].concat(cond).every((w) => matches(row, w));
    if (key === 'OR') return cond.some((w) => matches(row, w));
    if (key === 'NOT') return ![].concat(cond).some((w) => matches(row, w));
    return matchField(row[key], cond);
  });
}

function applyData(row, data) {
  const next = { ...row };
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    if (isPlain(val) && 'increment' in val) next[key] = (Number(next[key]) || 0) + val.increment;
    else if (isPlain(val) && 'decrement' in val) next[key] = (Number(next[key]) || 0) - val.decrement;
    else if (isPlain(val) && 'set' in val) next[key] = val.set;
    else next[key] = val;
  }
  return next;
}

function pick(row, select) {
  if (!row || !select) return row ? { ...row } : row;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
}

function sortRows(rows, orderBy) {
  const orders = [].concat(orderBy || []).flatMap((o) => Object.entries(o));
  if (!orders.length) return rows;
  return [...rows].sort((a, b) => {
    for (const [field, dir] of orders) {
      const av = a[field], bv = b[field];
      const d = av == null && bv == null ? 0 : av == null ? -1 : bv == null ? 1
        : typeof av === 'string' ? av.localeCompare(bv) : cmp(av, bv);
      if (d) return dir === 'desc' ? -d : d;
    }
    return 0;
  });
}

function createModel(initial = []) {
  let rows = initial.map((r) => ({ ...r }));
  const withDefaults = (data) => {
    const now = new Date();
    return { id: data.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now, ...data };
  };
  const model = {
    _rows: () => rows,
    async findMany({ where, orderBy, take, skip, select } = {}) {
      let out = sortRows(rows.filter((r) => matches(r, where)), orderBy);
      if (skip) out = out.slice(skip);
      if (take != null) out = out.slice(0, take);
      return out.map((r) => pick(r, select));
    },
    async findFirst(args = {}) { return (await model.findMany({ ...args, take: 1 }))[0] ?? null; },
    async findUnique({ where, select } = {}) { return pick(rows.find((r) => matches(r, where)) ?? null, select); },
    async count({ where } = {}) { return rows.filter((r) => matches(r, where)).length; },
    async create({ data, select }) {
      const row = withDefaults(data);
      rows.push(row);
      return pick(row, select);
    },
    async createMany({ data }) {
      for (const d of data) rows.push(withDefaults(d));
      return { count: data.length };
    },
    async update({ where, data, select }) {
      const i = rows.findIndex((r) => matches(r, where));
      if (i < 0) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      rows[i] = { ...applyData(rows[i], data), updatedAt: new Date() };
      return pick(rows[i], select);
    },
    async updateMany({ where, data }) {
      let count = 0;
      rows = rows.map((r) => {
        if (!matches(r, where)) return r;
        count++;
        return { ...applyData(r, data), updatedAt: new Date() };
      });
      return { count };
    },
    async upsert({ where, create, update }) {
      const found = rows.find((r) => matches(r, where));
      return found ? model.update({ where, data: update }) : model.create({ data: create });
    },
    async delete({ where }) {
      const i = rows.findIndex((r) => matches(r, where));
      if (i < 0) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
      return rows.splice(i, 1)[0];
    },
    async deleteMany({ where } = {}) {
      const before = rows.length;
      rows = rows.filter((r) => !matches(r, where));
      return { count: before - rows.length };
    },
  };
  return model;
}

function createFakeDb(seed = {}) {
  const models = {};
  return new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string' || name === 'then') return undefined;
      if (name === '$transaction') return async (arg) => (typeof arg === 'function' ? arg(this) : Promise.all(arg));
      if (!models[name]) models[name] = createModel(seed[name]);
      return models[name];
    },
  });
}

/** Repo testlarining umumiy yuritgichi: `ok` / `FAIL` va "N/N o'tdi" */
async function runTests(tests) {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
  }
  console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} o'tdi`);
  process.exitCode = failed ? 1 : 0;
}

module.exports = { createFakeDb, runTests };
