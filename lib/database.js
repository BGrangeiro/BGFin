import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { FIRST_MONTH, FIRST_DATE, periodMonth, periodRange, periodDueDate } from '../public/period.js';

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
export function debtInput(input) {
  if (!input) throw new AppError('Informe os dados da dívida.');
  const total = amount(input.amount);
  const initial = input.initial_paid ?? 0;
  if (!Number.isSafeInteger(initial) || initial < 0 || initial > total) throw new AppError('O valor já pago deve estar entre zero e o total da dívida.');
  const installment = input.installment_amount ?? 0;
  if (!Number.isSafeInteger(installment) || installment < 0 || installment > total) throw new AppError('A parcela mensal deve estar entre zero e o total da dívida.');
  const installmentDay = input.installment_day ?? 10;
  if (!Number.isInteger(installmentDay) || installmentDay < 1 || installmentDay > 31) throw new AppError('O dia da parcela deve estar entre 1 e 31.');
  return { description: text(input.description, 100, 'Nome da dívida'), amount: total, initial_paid: initial,
    installment_amount: installment, installment_day: installmentDay, start_month: validMonth(input.start_month ?? FIRST_MONTH),
    creditor: typeof input.creditor === 'string' ? input.creditor.trim().slice(0, 100) : '',
    category: category(input.category), due_date: input.due_date ? validDate(input.due_date) : null,
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
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_debt ON transactions(debt_id); PRAGMA user_version = 3; PRAGMA optimize;');
  const exists = (table, id) => {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Registro inválido.');
    const record = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!record) throw new AppError('Registro não encontrado.', 404);
    return record;
  };
  const atomic = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const api = {
    db,
    listDebts() {
      const payments = db.prepare('SELECT * FROM transactions WHERE debt_id IS NOT NULL ORDER BY date DESC, id DESC').all();
      return db.prepare('SELECT * FROM debts ORDER BY due_date IS NULL, due_date, id DESC').all().map(d => {
        const history = payments.filter(p => p.debt_id === d.id);
        const paid = d.initial_paid + history.reduce((sum, p) => sum + p.amount, 0);
        return { ...d, paid, remaining: d.amount - paid, payments: history };
      });
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
        const paidBefore = d.initial_paid + d.payments.filter(p => p.date < period.start).reduce((sum,p) => sum+p.amount,0);
        const paid = d.payments.filter(p => p.date >= period.start && p.date <= period.end).reduce((sum,p) => sum+p.amount,0);
        const scheduled = Math.min(d.installment_amount, Math.max(0,d.amount-paidBefore));
        return { ...d, due_date: periodDueDate(month,d.installment_day), scheduled, month_paid: paid, month_remaining: Math.max(0,scheduled-paid) };
      }).filter(d => d.scheduled > 0 || d.month_paid > 0);
      const categories = [...new Set([...CATEGORIES, ...db.prepare('SELECT category FROM transactions UNION SELECT category FROM bills UNION SELECT category FROM debts').all().map(r => r.category)])];
      const totals = transactions.reduce((a, t) => { a[t.type] += t.amount; return a; }, { income: 0, expense: 0 });
      const pending = bills.filter(b => !b.payment_id).reduce((sum, b) => sum + b.amount, 0);
      return { month, period, transactions, bills, debts, monthlyDebts, categories, totals: { ...totals, pending, balance: totals.income - totals.expense, projected: totals.income - totals.expense - pending } };
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
      const result = db.prepare('INSERT INTO debts(description,amount,initial_paid,creditor,category,due_date,notes,installment_amount,installment_day,start_month) VALUES (?,?,?,?,?,?,?,?,?,?)').run(d.description,d.amount,d.initial_paid,d.creditor,d.category,d.due_date,d.notes,d.installment_amount,d.installment_day,d.start_month);
      return { id: Number(result.lastInsertRowid), ...d };
    },
    updateDebt(id, input) {
      exists('debts', id);
      const d = debtInput(input);
      const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM transactions WHERE debt_id=?').get(id).paid;
      if (d.initial_paid + paid > d.amount) throw new AppError('O total não pode ser menor que os pagamentos já registrados.');
      db.prepare('UPDATE debts SET description=?,amount=?,initial_paid=?,creditor=?,category=?,due_date=?,notes=?,installment_amount=?,installment_day=?,start_month=? WHERE id=?').run(d.description,d.amount,d.initial_paid,d.creditor,d.category,d.due_date,d.notes,d.installment_amount,d.installment_day,d.start_month,id);
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
    exportData() { return { version: 3, exported_at: new Date().toISOString(), debts: db.prepare('SELECT * FROM debts').all(), bills: db.prepare('SELECT * FROM bills').all(), transactions: db.prepare('SELECT * FROM transactions').all() }; },
    restoreData(input) {
      if (!input || ![1,2,3].includes(input.version) || !Array.isArray(input.bills) || !Array.isArray(input.transactions) || input.bills.length > 10000 || input.transactions.length > 100000 || (input.version >= 2 && (!Array.isArray(input.debts) || input.debts.length > 10000))) throw new AppError('Arquivo de backup inválido ou incompatível.');
      const ids = new Set();
      const debtMap = new Map();
      const debts = (input.version >= 2 ? input.debts : []).map(raw => {
        if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || debtMap.has(raw.id)) throw new AppError('Identificador de dívida inválido no backup.');
        const d = { id: raw.id, ...debtInput(raw) }; debtMap.set(d.id, { ...d, paid: d.initial_paid }); return d;
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
        const insertDebt = db.prepare('INSERT INTO debts(id,description,amount,initial_paid,creditor,category,due_date,notes,installment_amount,installment_day,start_month) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        for (const d of debts) insertDebt.run(d.id,d.description,d.amount,d.initial_paid,d.creditor,d.category,d.due_date,d.notes,d.installment_amount,d.installment_day,d.start_month);
        const insertBill = db.prepare('INSERT INTO bills(id,description,amount,category,due_day,start_month) VALUES (?,?,?,?,?,?)');
        const insertTx = db.prepare('INSERT INTO transactions(id,description,type,amount,category,date,notes,bill_id,bill_month,debt_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
        for (const b of bills) insertBill.run(b.id,b.description,b.amount,b.category,b.due_day,b.start_month);
        for (const t of transactions) insertTx.run(t.id,t.description,t.type,t.amount,t.category,t.date,t.notes,t.bill_id,t.bill_month,t.debt_id);
        return { bills: bills.length, transactions: transactions.length, debts: debts.length };
      });
    },
    close() { db.close(); }
  };
  return api;
}
