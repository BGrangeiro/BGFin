import { INVESTMENT_TYPES, ENTRY_TYPES, entrySign, investmentTotals, localDate } from '../public/investments-model.js';

export function createInvestmentsStore(db, AppError) {
  db.exec(`CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '',
    ticker TEXT NOT NULL DEFAULT '', liquidity TEXT NOT NULL DEFAULT '', start_date TEXT NOT NULL,
    review_date TEXT, maturity_date TEXT, notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('active','closed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS investment_entries (
    id INTEGER PRIMARY KEY, investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('contribution','withdrawal','gain','loss','fee')),
    amount INTEGER NOT NULL CHECK(amount > 0), date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_investment_entries ON investment_entries(investment_id, date, id);`);
  const maxAmount = 99999999999;
  const string = (value, max, label, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new AppError(`${label}: use ${required ? 'de 1 a' : 'até'} ${max} caracteres.`);
    return value.trim();
  };
  const date = (value, label, required = false) => {
    if (!required && (value == null || value === '')) return null;
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AppError(`${label}: informe uma data válida entre 2000 e 2099.`);
    return value;
  };
  const amount = value => {
    if (!Number.isSafeInteger(value) || value < 1 || value > maxAmount) throw new AppError('Informe um valor positivo de até R$ 999.999.999,99.');
    return value;
  };
  const input = raw => {
    if (!raw || !Object.hasOwn(INVESTMENT_TYPES, raw.type) || !['active', 'closed'].includes(raw.status ?? 'active')) throw new AppError('Tipo ou situação do investimento inválidos.');
    const start_date = date(raw.start_date, 'Data inicial', true), maturity_date = date(raw.maturity_date, 'Vencimento'), review_date = date(raw.review_date, 'Próxima revisão');
    if (start_date > localDate()) throw new AppError('A data inicial não pode estar no futuro.');
    if ((maturity_date && maturity_date < start_date) || (review_date && review_date < start_date)) throw new AppError('Revisão e vencimento não podem ser anteriores ao início.');
    return { name: string(raw.name, 120, 'Nome', true), type: raw.type, institution: string(raw.institution ?? '', 120, 'Instituição'), ticker: string(raw.ticker ?? '', 40, 'Código'), liquidity: string(raw.liquidity ?? '', 160, 'Liquidez'), start_date, review_date, maturity_date, notes: string(raw.notes ?? '', 10000, 'Notas'), status: raw.status ?? 'active' };
  };
  const entryInput = raw => {
    if (!raw || !Object.hasOwn(ENTRY_TYPES, raw.kind)) throw new AppError('Tipo de movimentação inválido.');
    const day = date(raw.date, 'Data da movimentação', true);
    if (day > localDate()) throw new AppError('Registre movimentações já ocorridas. Use a próxima revisão para datas futuras.');
    return { kind: raw.kind, amount: amount(raw.amount), date: day, notes: string(raw.notes ?? '', 1000, 'Observação') };
  };
  function validateHistory(investment, entries) {
    let balance = 0;
    for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      if (e.date < investment.start_date) throw new AppError('Há movimentações anteriores à data inicial do investimento.');
      balance += entrySign(e.kind) * e.amount;
      if (!Number.isSafeInteger(balance) || balance > maxAmount) throw new AppError('O saldo ultrapassa o limite permitido.');
      if (balance < 0) throw new AppError('Essa alteração deixaria o saldo negativo no histórico. Confira valores e datas.');
    }
    if (investment.status === 'closed' && balance !== 0) throw new AppError('Para encerrar, registre o resgate ou a perda do saldo restante.');
  }
  const columns = ['name', 'type', 'institution', 'ticker', 'liquidity', 'start_date', 'review_date', 'maturity_date', 'notes', 'status', 'created_at', 'updated_at'];
  const values = i => columns.map(c => i[c]);
  const insert = db.prepare(`INSERT INTO investments (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  const insertEntry = db.prepare('INSERT INTO investment_entries (investment_id,kind,amount,date,notes) VALUES (?,?,?,?,?)');
  const atomic = fn => { db.exec('SAVEPOINT investment_write'); try { const result = fn(); db.exec('RELEASE investment_write'); return result; } catch (e) { db.exec('ROLLBACK TO investment_write; RELEASE investment_write'); throw e; } };
  const get = id => {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Investimento inválido.');
    const i = db.prepare('SELECT * FROM investments WHERE id=?').get(id);
    if (!i) throw new AppError('Investimento não encontrado.', 404);
    const entries = db.prepare('SELECT * FROM investment_entries WHERE investment_id=? ORDER BY date DESC,id DESC').all(id);
    return { ...i, entries, totals: investmentTotals(entries) };
  };
  function entryExists(i, id) { const entry = i.entries.find(e => e.id === id); if (!entry) throw new AppError('Movimentação não encontrada.', 404); return entry; }
  function active(i) { if (i.status !== 'active') throw new AppError('Reabra o investimento antes de alterar o histórico.'); }
  const touch = id => db.prepare('UPDATE investments SET updated_at=? WHERE id=?').run(new Date().toISOString(), id);
  return {
    get,
    list: () => db.prepare('SELECT id FROM investments ORDER BY status, name COLLATE NOCASE, id').all().map(i => get(i.id)),
    add(raw) {
      const i = input(raw), initial = raw.initial_amount ?? 0;
      if (initial !== 0) amount(initial);
      return atomic(() => {
        const now = new Date().toISOString();
        const id = Number(insert.run(...values({ ...i, created_at: now, updated_at: now })).lastInsertRowid);
        if (initial) insertEntry.run(id, 'contribution', initial, i.start_date, 'Aporte inicial');
        const result = get(id); validateHistory(result, result.entries); return result;
      });
    },
    update(id, raw) {
      return atomic(() => {
        const old = get(id), i = input(raw); validateHistory(i, old.entries);
        db.prepare(`UPDATE investments SET ${columns.map(c => `${c}=?`).join(',')} WHERE id=?`).run(...values({ ...i, created_at: old.created_at, updated_at: new Date().toISOString() }), id);
        return get(id);
      });
    },
    remove(id) { get(id); db.prepare('DELETE FROM investments WHERE id=?').run(id); },
    addEntry(id, raw) {
      const e = entryInput(raw);
      return atomic(() => {
        const i = get(id); active(i);
        insertEntry.run(id, e.kind, e.amount, e.date, e.notes);
        const next = get(id); validateHistory(next, next.entries); touch(id); return get(id);
      });
    },
    updateEntry(id, entryId, raw) {
      const e = entryInput(raw);
      return atomic(() => {
        const i = get(id); active(i); entryExists(i, entryId);
        validateHistory(i, i.entries.map(old => old.id === entryId ? { id: entryId, ...e } : old));
        db.prepare('UPDATE investment_entries SET kind=?,amount=?,date=?,notes=? WHERE id=? AND investment_id=?').run(e.kind, e.amount, e.date, e.notes, entryId, id);
        touch(id); return get(id);
      });
    },
    removeEntry(id, entryId) {
      return atomic(() => {
        const i = get(id); active(i); entryExists(i, entryId);
        validateHistory(i, i.entries.filter(e => e.id !== entryId));
        db.prepare('DELETE FROM investment_entries WHERE id=? AND investment_id=?').run(entryId, id); touch(id); return get(id);
      });
    },
    validateBackup(rows) {
      if (!Array.isArray(rows) || rows.length > 10000) throw new AppError('Investimentos inválidos no backup.');
      const ids = new Set(), entryIds = new Set(); let count = 0;
      const validId = (id, set) => { if (!Number.isSafeInteger(id) || id < 1 || set.has(id)) throw new AppError('Identificador de investimento ou movimentação inválido no backup.'); set.add(id); };
      const timestamp = value => {
        if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new AppError('Data de registro do investimento inválida no backup.');
        return value;
      };
      return rows.map(raw => {
        if (!raw) throw new AppError('Investimento inválido no backup.'); validId(raw.id, ids);
        const i = { ...input(raw), id: raw.id, created_at: timestamp(raw.created_at), updated_at: timestamp(raw.updated_at) };
        if (!Array.isArray(raw.entries) || (count += raw.entries.length) > 100000) throw new AppError('Histórico de investimentos inválido no backup.');
        const entries = raw.entries.map(e => {
          if (!e || e.investment_id !== i.id) throw new AppError('Vínculo da movimentação inválido no backup.'); validId(e.id, entryIds);
          return { ...entryInput(e), id: e.id, investment_id: i.id };
        });
        validateHistory(i, entries); return { ...i, entries };
      });
    },
    replace(rows) {
      // Backup restore owns the transaction and validates every section first.
      db.exec('DELETE FROM investment_entries; DELETE FROM investments;');
      const restore = db.prepare(`INSERT INTO investments (id,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`);
      const restoreEntry = db.prepare('INSERT INTO investment_entries (id,investment_id,kind,amount,date,notes) VALUES (?,?,?,?,?,?)');
      for (const i of rows) { restore.run(i.id, ...values(i)); for (const e of i.entries) restoreEntry.run(e.id, i.id, e.kind, e.amount, e.date, e.notes); }
    }
  };
}
