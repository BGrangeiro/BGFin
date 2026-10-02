import { createPreferencesStore } from './preferences.js';
import { createChatStore } from './chat.js';
import { createPersonalStore } from './personal.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createNotesStore } from './notes.js';
import { createInvestmentsStore } from './investments.js';
import { FIRST_MONTH, FIRST_DATE, periodMonth, periodRange, periodDueDate, shiftMonth } from '../public/period.js';
import { DEFAULT_DEBT_COLOR, installmentSchedule, installmentProgress, paidBeforeToday } from '../public/debts-model.js';

const DEBT_COLUMNS = ['description','amount','initial_paid','creditor','category','due_date','notes','installment_amount','installment_day','start_month','debt_type','first_installment_date','last_installment_date','color'];

export const CATEGORIES = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Trabalho', 'Salário', 'Investimentos', 'Outros'];
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validMonth(value) {
  if (typeof value !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) throw new AppError('Escolha um mês válido entre 2000 e 2099.');
  if (value < FIRST_MONTH) throw new AppError('O sistema começa em setembro de 2026.');
  return value;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AppError('Informe uma data válida entre 2000 e 2099.');
  if (value < FIRST_DATE) throw new AppError('O sistema começa em setembro de 2026.');
  return value;
}
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(`${label}: use de 1 a ${max} caracteres.`);
  return value.trim();
};
const amount = value => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 99999999999) throw new AppError('Informe um valor positivo de até R$ 999.999.999,99.');
  return value;
};
const category = value => {
  return text(value, 60, 'Categoria');
};
export function transactionInput(input) {
  if (!input || !['income', 'expense'].includes(input.type)) throw new AppError('Escolha entrada ou saída.');
  return { description: text(input.description, 100, 'Descrição'), type: input.type, amount: amount(input.amount), category: category(input.category), date: validDate(input.date), notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 500) : '' };
}
export function billInput(input) {
  if (!input || !Number.isInteger(input.due_day) || input.due_day < 1 || input.due_day > 31) throw new AppError('O vencimento deve estar entre os dias 1 e 31.');
  return { description: text(input.description, 100, 'Nome da conta'), amount: amount(input.amount), category: category(input.category), due_day: input.due_day, start_month: validMonth(input.start_month) };
}
export function debtInput(input, { allowLegacy = false } = {}) {
  if (!input) throw new AppError('Informe os dados da dívida.');
  const total = amount(input.amount);
  const type = input.debt_type ?? (input.installment_amount > 0 ? 'installment' : 'fixed');
  if (!['fixed', 'installment'].includes(type)) throw new AppError('Escolha dívida fixa ou parcelada.');
  const color = input.color ?? DEFAULT_DEBT_COLOR;
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new AppError('Escolha uma cor válida para a dívida.');
  const dated = type === 'installment' && (input.first_installment_date || input.last_installment_date || (input.debt_type && !allowLegacy));
  let schedule;
  if (dated) {
    try { schedule = installmentSchedule({ ...input, amount: total }); }
    catch (error) { throw new AppError(error.message); }
  }
  const initial = input.initial_paid ?? (schedule ? paidBeforeToday({ ...input, amount: total }) : 0);
  if (!Number.isSafeInteger(initial) || initial < 0 || initial > total) throw new AppError('O valor já pago deve estar entre zero e o total da dívida.');
  const installment = schedule ? schedule[0].amount : input.debt_type === 'fixed' ? 0 : input.installment_amount ?? 0;
  if (!Number.isSafeInteger(installment) || installment < 0 || installment > total) throw new AppError('A parcela mensal deve estar entre zero e o total da dívida.');
  const installmentDay = schedule ? Number(input.first_installment_date.slice(8)) : input.installment_day ?? 10;
  if (!Number.isInteger(installmentDay) || installmentDay < 1 || installmentDay > 31) throw new AppError('O dia da parcela deve estar entre 1 e 31.');
  return { description: text(input.description, 100, 'Nome da dívida'), amount: total, initial_paid: initial,
    installment_amount: installment, installment_day: installmentDay, start_month: schedule ? (periodMonth(input.first_installment_date) < FIRST_MONTH ? FIRST_MONTH : periodMonth(input.first_installment_date)) : validMonth(input.start_month ?? FIRST_MONTH),
    debt_type: type, color: color.toLowerCase(), first_installment_date: schedule ? input.first_installment_date : null, last_installment_date: schedule ? input.last_installment_date : null,
    creditor: typeof input.creditor === 'string' ? input.creditor.trim().slice(0, 100) : '',
    category: category(input.category), due_date: schedule ? input.last_installment_date : input.due_date ? validDate(input.due_date) : null,
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 500) : '' };
}
export function dueDate(month, day) {
  validMonth(month);
  const [year, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(day, new Date(Date.UTC(year, m, 0)).getUTCDate())).padStart(2, '0')}`;
}

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL, due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31), start_month TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY, description TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount INTEGER NOT NULL CHECK(amount > 0), category TEXT NOT NULL, date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
      bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL, bill_month TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(bill_id, bill_month)
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
      initial_paid INTEGER NOT NULL DEFAULT 0 CHECK(initial_paid >= 0 AND initial_paid <= amount),
      creditor TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, due_date TEXT, notes TEXT NOT NULL DEFAULT ''
    );`);
  if (!db.prepare('PRAGMA table_info(transactions)').all().some(c => c.name === 'debt_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN debt_id INTEGER REFERENCES debts(id) ON DELETE SET NULL;');
  }
  if (!db.prepare('PRAGMA table_info(debts)').all().some(c => c.name === 'installment_amount')) {
    db.exec("ALTER TABLE debts ADD COLUMN installment_amount INTEGER NOT NULL DEFAULT 0; ALTER TABLE debts ADD COLUMN installment_day INTEGER NOT NULL DEFAULT 10; ALTER TABLE debts ADD COLUMN start_month TEXT NOT NULL DEFAULT '2026-09';");
  }
  if (!db.prepare('PRAGMA table_info(debts)').all().some(c => c.name === 'debt_type')) {
    db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE debts ADD COLUMN debt_type TEXT NOT NULL DEFAULT 'fixed';
      ALTER TABLE debts ADD COLUMN first_installment_date TEXT;
      ALTER TABLE debts ADD COLUMN last_installment_date TEXT;
      ALTER TABLE debts ADD COLUMN color TEXT NOT NULL DEFAULT '${DEFAULT_DEBT_COLOR}';
      UPDATE debts SET debt_type='installment' WHERE installment_amount > 0;
      COMMIT;`);
  }
  const personal = createPersonalStore(db, AppError);
  if (db.prepare('PRAGMA user_version').get().user_version < 9) personal.ensureFitnessTab();
  if (db.prepare('PRAGMA user_version').get().user_version < 12) personal.ensureScheduleTab();
  const preferences = createPreferencesStore(db, AppError);
  const notes = createNotesStore(db, AppError);
  const investments = createInvestmentsStore(db, AppError);
  const chat = createChatStore(db, personal, AppError);
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_debt ON transactions(debt_id); PRAGMA user_version = 14; PRAGMA optimize;');
  const exists = (table, id) => {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Registro inválido.');
    const record = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!record) throw new AppError('Registro não encontrado.', 404);
    return record;
  };
  const atomic = fn => {
    db.exec('SAVEPOINT finance_write');
    try { const result = fn(); db.exec('RELEASE finance_write'); return result; }
    catch (error) { db.exec('ROLLBACK TO finance_write; RELEASE finance_write'); throw error; }
  };
  const api = {
    db,
    notes,
    investments,
    personal,
    preferences,
    chat,
    listDebts() {
      const payments = db.prepare('SELECT * FROM transactions WHERE debt_id IS NOT NULL ORDER BY date DESC, id DESC').all();
      return db.prepare('SELECT * FROM debts ORDER BY due_date IS NULL, due_date, id DESC').all().map(d => {
        const history = payments.filter(p => p.debt_id === d.id);
        const paid = d.initial_paid + history.reduce((sum, p) => sum + p.amount, 0);
        const progress = d.first_installment_date ? installmentProgress(d, paid) : {};
        return { ...d, ...progress, paid, remaining: d.amount - paid, payments: history };
      });
    },
    agenda(day) {
      const items = [], current = periodMonth(day);
      const bills = db.prepare('SELECT * FROM bills').all();
      const payments = new Set(db.prepare('SELECT bill_id, bill_month FROM transactions WHERE bill_id IS NOT NULL').all().map(p=>`${p.bill_id}:${p.bill_month}`));
      for (const bill of bills) {
        for (let month = bill.start_month; month <= current; month = shiftMonth(month, 1)) {
          const date = periodDueDate(month, bill.due_day);
          if (date <= day && !payments.has(`${bill.id}:${month}`)) items.push({title:bill.description,date,page:'bills',label:'Conta fixa'});
        }
      }
      for (const debt of api.listDebts().filter(d=>d.remaining>0)) {
        if (debt.schedule) {
          for (const item of debt.schedule.filter(item => item.remaining > 0 && item.date <= day)) {
            items.push({title:debt.description,date:item.date,page:'debts',label:`Parcela ${item.number} de ${debt.installment_count}`});
          }
          continue;
        }
        if (debt.due_date && debt.due_date<=day) items.push({title:debt.description,date:debt.due_date,page:'debts',label:'Prazo da dívida'});
        if (!debt.installment_amount) continue;
        for (let month=debt.start_month; month<=current; month=shiftMonth(month,1)) {
          const date=periodDueDate(month,debt.installment_day), period=periodRange(month);
          const before=debt.initial_paid+debt.payments.filter(p=>p.date<period.start).reduce((s,p)=>s+p.amount,0);
          const paid=debt.payments.filter(p=>p.date>=period.start&&p.date<=period.end).reduce((s,p)=>s+p.amount,0);
          if (date<=day && Math.min(debt.installment_amount,Math.max(0,debt.amount-before))>paid) items.push({title:debt.description,date,page:'debts',label:'Parcela da dívida'});
        }
      }
      return items;
    },
    list(month) {
      validMonth(month);
      const period = periodRange(month);
      const transactions = db.prepare('SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC').all(period.start, period.end);
      const bills = db.prepare(`SELECT b.*, t.id AS payment_id, t.date AS payment_date, t.amount AS paid_amount
        FROM bills b LEFT JOIN transactions t ON t.bill_id = b.id AND t.bill_month = ?
        WHERE b.start_month <= ? ORDER BY b.due_day, b.id`).all(month, month).map(b => ({ ...b, due_date: periodDueDate(month, b.due_day) })).sort((a,b) => a.due_date.localeCompare(b.due_date));
      const debts = api.listDebts();
      const monthlyDebts = debts.filter(d => d.installment_amount > 0 && d.start_month <= month).map(d => {
        if (d.schedule) {
          const items = d.schedule.filter(item => item.date >= period.start && item.date <= period.end);
          const paidThrough = d.initial_paid + d.payments.filter(p => p.date <= period.end).reduce((sum,p) => sum+p.amount,0);
          const before = d.initial_paid + d.payments.filter(p => p.date < period.start).reduce((sum,p) => sum+p.amount,0);
          const rest = (item, paid) => Math.max(0,item.amount-Math.max(0,paid-item.offset));
          const scheduled = items.reduce((sum,item) => sum+rest(item,before),0);
          const pending = items.reduce((sum,item) => sum+rest(item,paidThrough),0);
          const paid = d.payments.filter(p => p.date >= period.start && p.date <= period.end).reduce((sum,p) => sum+p.amount,0);
          return { ...d, due_date: items.find(item=>rest(item,paidThrough)>0)?.date ?? items[0]?.date ?? d.last_installment_date,
            scheduled, month_paid: paid, month_remaining: pending };
        }
        const paidBefore = d.initial_paid + d.payments.filter(p => p.date < period.start).reduce((sum,p) => sum+p.amount,0);
        const paid = d.payments.filter(p => p.date >= period.start && p.date <= period.end).reduce((sum,p) => sum+p.amount,0);
        const scheduled = Math.min(d.installment_amount, Math.max(0,d.amount-paidBefore));
        return { ...d, due_date: periodDueDate(month,d.installment_day), scheduled, month_paid: paid, month_remaining: Math.max(0,scheduled-paid) };
      }).filter(d => d.scheduled > 0 || d.month_paid > 0);
      const categories = [...new Set([...CATEGORIES, ...db.prepare('SELECT category FROM transactions UNION SELECT category FROM bills UNION SELECT category FROM debts').all().map(r => r.category)])];
      const totals = transactions.reduce((a, t) => { a[t.type] += t.amount; return a; }, { income: 0, expense: 0 });
      const pending = bills.filter(b => !b.payment_id).reduce((sum, b) => sum + b.amount, 0);
      const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      return { month, period, transactions, bills, debts, monthlyDebts, categories, preferences: preferences.list(), agenda: api.agenda(day), totals: { ...totals, pending, balance: totals.income - totals.expense, projected: totals.income - totals.expense - pending } };
    },
    addTransaction(input) {
      const t = transactionInput(input);
      const result = db.prepare('INSERT INTO transactions(description,type,amount,category,date,notes) VALUES (?,?,?,?,?,?)').run(t.description, t.type, t.amount, t.category, t.date, t.notes);
      return { id: Number(result.lastInsertRowid), ...t };
    },
    updateTransaction(id, input) {
      const old = exists('transactions', id);
      const t = transactionInput(input);
      if (old.bill_id && (t.type !== 'expense' || periodMonth(t.date) !== old.bill_month)) throw new AppError('Um pagamento de conta fixa deve ser uma saída no mês de referência.');
      if (old.debt_id) {
        const d = api.listDebts().find(d => d.id === old.debt_id);
        if (t.type !== 'expense' || t.amount > d.remaining + old.amount) throw new AppError('O pagamento deve ser uma saída e não pode ultrapassar o saldo da dívida.');
      }
      db.prepare('UPDATE transactions SET description=?,type=?,amount=?,category=?,date=?,notes=? WHERE id=?').run(t.description, t.type, t.amount, t.category, t.date, t.notes, id);
      return { id, ...t };
    },
    deleteTransaction(id) { exists('transactions', id); db.prepare('DELETE FROM transactions WHERE id=?').run(id); },
    addBill(input) {
      const b = billInput(input);
      const result = db.prepare('INSERT INTO bills(description,amount,category,due_day,start_month) VALUES (?,?,?,?,?)').run(b.description, b.amount, b.category, b.due_day, b.start_month);
      return { id: Number(result.lastInsertRowid), ...b };
    },
    updateBill(id, input) {
      exists('bills', id);
      const b = billInput(input);
      const firstPayment = db.prepare('SELECT MIN(bill_month) AS month FROM transactions WHERE bill_id=?').get(id).month;
      if (firstPayment && b.start_month > firstPayment) throw new AppError('O início não pode ser posterior a um pagamento existente.');
      db.prepare('UPDATE bills SET description=?,amount=?,category=?,due_day=?,start_month=? WHERE id=?').run(b.description, b.amount, b.category, b.due_day, b.start_month, id);
      return { id, ...b };
    },
    deleteBill(id) { exists('bills', id); db.prepare('DELETE FROM bills WHERE id=?').run(id); },
    payBill(id, input) {
      const month = validMonth(input?.month);
      const date = validDate(input?.date);
      if (periodMonth(date) !== month) throw new AppError('A data do pagamento deve estar no mês selecionado.');
      return atomic(() => {
        const b = exists('bills', id);
        if (b.start_month > month) throw new AppError('Essa conta ainda não estava ativa neste mês.');
        if (db.prepare('SELECT id FROM transactions WHERE bill_id=? AND bill_month=?').get(id, month)) throw new AppError('Essa conta já está paga neste mês.', 409);
        const result = db.prepare('INSERT INTO transactions(description,type,amount,category,date,bill_id,bill_month) VALUES (?,\'expense\',?,?,?,?,?)').run(b.description, b.amount, b.category, date, id, month);
        return { id: Number(result.lastInsertRowid) };
      });
    },
    addDebt(input) {
      const d = debtInput(input);
      const result = db.prepare(`INSERT INTO debts(${DEBT_COLUMNS.join(',')}) VALUES (${DEBT_COLUMNS.map(()=>'?').join(',')})`).run(...DEBT_COLUMNS.map(key=>d[key]));
      return { id: Number(result.lastInsertRowid), ...d };
    },
    updateDebt(id, input) {
      exists('debts', id);
      const d = debtInput(input);
      const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM transactions WHERE debt_id=?').get(id).paid;
      if (d.initial_paid + paid > d.amount) throw new AppError('O total não pode ser menor que os pagamentos já registrados.');
      db.prepare(`UPDATE debts SET ${DEBT_COLUMNS.map(key=>`${key}=?`).join(',')} WHERE id=?`).run(...DEBT_COLUMNS.map(key=>d[key]),id);
      return { id, ...d };
    },
    deleteDebt(id) { exists('debts', id); db.prepare('DELETE FROM debts WHERE id=?').run(id); },
    payDebt(id, input) {
      const value = amount(input?.amount), date = validDate(input?.date);
      return atomic(() => {
        exists('debts', id);
        const d = api.listDebts().find(d => d.id === id);
        if (value > d.remaining) throw new AppError('O pagamento não pode ultrapassar o saldo restante da dívida.');
        const result = db.prepare("INSERT INTO transactions(description,type,amount,category,date,notes,debt_id) VALUES (?,'expense',?,?,?,?,?)").run(d.description,value,d.category,date,typeof input.notes === 'string' ? input.notes.trim().slice(0,500) : '',id);
        return { id: Number(result.lastInsertRowid) };
      });
    },
    exportData() { return { version: 14, chat: chat.all(), preferences: preferences.list(), personal: personal.list(), exported_at: new Date().toISOString(), investments: investments.list(), notes: notes.list(), debts: db.prepare('SELECT * FROM debts').all(), bills: db.prepare('SELECT * FROM bills').all(), transactions: db.prepare('SELECT * FROM transactions').all() }; },
    restoreData(input) {
      if (!input || ![1,2,3,4,5,6,7,8,9,10,11,12,13,14].includes(input.version) || !Array.isArray(input.bills) || !Array.isArray(input.transactions) || input.bills.length > 10000 || input.transactions.length > 100000 || (input.version >= 2 && (!Array.isArray(input.debts) || input.debts.length > 10000))) throw new AppError('Arquivo de backup inválido ou incompatível.');
      const restoredPreferences = input.version >= 9 ? preferences.validate(input.preferences) : null;
      const restoredPersonal = input.version >= 6 ? personal.validateBackup(input.personal) : null;
      const restoredChat = input.version >= 13 ? chat.validateBackup(input.chat, restoredPersonal) : null;
      const restoredNotes = input.version >= 4 ? notes.validateBackup(input.notes) : null;
      const restoredInvestments = input.version >= 5 ? investments.validateBackup(input.investments) : null;
      const ids = new Set();
      const debtMap = new Map();
      const debts = (input.version >= 2 ? input.debts : []).map(raw => {
        if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || debtMap.has(raw.id)) throw new AppError('Identificador de dívida inválido no backup.');
        const d = { id: raw.id, ...debtInput(raw, { allowLegacy: true }) }; debtMap.set(d.id, { ...d, paid: d.initial_paid }); return d;
      });
      const billMap = new Map();
      const bills = input.bills.map(raw => {
        if (!Number.isSafeInteger(raw.id) || raw.id < 1 || ids.has(raw.id)) throw new AppError('Identificador de conta inválido no backup.');
        ids.add(raw.id);
        const b = { id: raw.id, ...billInput(raw) }; billMap.set(b.id, b); return b;
      });
      ids.clear();
      const payments = new Set();
      const transactions = input.transactions.map(raw => {
        if (!Number.isSafeInteger(raw.id) || raw.id < 1 || ids.has(raw.id)) throw new AppError('Identificador de lançamento inválido no backup.');
        ids.add(raw.id);
        const t = { id: raw.id, ...transactionInput(raw), bill_id: raw.bill_id ?? null, bill_month: raw.bill_month ?? null, debt_id: raw.debt_id ?? null };
        if (t.debt_id !== null) {
          const d = debtMap.get(t.debt_id);
          if (!d || t.bill_id !== null || t.type !== 'expense' || d.paid + t.amount > d.amount) throw new AppError('Pagamento de dívida inválido no backup.');
          d.paid += t.amount;
        }
        if (t.bill_id !== null) {
          const b = billMap.get(t.bill_id);
          if (!b || t.type !== 'expense' || validMonth(t.bill_month) !== periodMonth(t.date) || b.start_month > t.bill_month || payments.has(`${t.bill_id}/${t.bill_month}`)) throw new AppError('Pagamento de conta inválido no backup.');
          payments.add(`${t.bill_id}/${t.bill_month}`);
        } else t.bill_month = null;
        return t;
      });
      return atomic(() => {
        db.exec('DELETE FROM transactions; DELETE FROM bills; DELETE FROM debts;');
        const insertDebt = db.prepare(`INSERT INTO debts(id,${DEBT_COLUMNS.join(',')}) VALUES (?,${DEBT_COLUMNS.map(()=>'?').join(',')})`);
        for (const d of debts) insertDebt.run(d.id,...DEBT_COLUMNS.map(key=>d[key]));
        const insertBill = db.prepare('INSERT INTO bills(id,description,amount,category,due_day,start_month) VALUES (?,?,?,?,?,?)');
        const insertTx = db.prepare('INSERT INTO transactions(id,description,type,amount,category,date,notes,bill_id,bill_month,debt_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
        for (const b of bills) insertBill.run(b.id,b.description,b.amount,b.category,b.due_day,b.start_month);
        for (const t of transactions) insertTx.run(t.id,t.description,t.type,t.amount,t.category,t.date,t.notes,t.bill_id,t.bill_month,t.debt_id);
        if (restoredPersonal !== null) { personal.replace(restoredPersonal); if (input.version < 9) personal.ensureFitnessTab(); if (input.version < 12) personal.ensureScheduleTab(); }
        if (restoredChat !== null) chat.replace(restoredChat);
        if (restoredPreferences !== null) preferences.replace(restoredPreferences);
        if (restoredNotes !== null) notes.replace(restoredNotes);
        if (restoredInvestments !== null) investments.replace(restoredInvestments);
        return { bills: bills.length, transactions: transactions.length, debts: debts.length, notes: notes.list().length, investments: investments.list().length };
      });
    },
    close() { db.close(); }
  };
  return api;
}
