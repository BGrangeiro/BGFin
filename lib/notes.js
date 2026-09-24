// Independent of financial periods: notes use calendar dates and local reminder times.
export function createNotesStore(db, AppError) {
  db.exec(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK(kind IN ('task','reminder','note')),
    status TEXT NOT NULL CHECK(status IN ('todo','doing','done')),
    priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
    category TEXT NOT NULL DEFAULT '', scheduled_date TEXT, due_date TEXT, reminder_at TEXT,
    reminder_seen INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
    checklist TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  );`);
  const decode = row => ({ ...row, pinned: Boolean(row.pinned), reminder_seen: Boolean(row.reminder_seen), checklist: JSON.parse(row.checklist) });
  const string = (value, max, label, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new AppError(`${label}: ${required ? 'preencha com' : 'use até'} ${max} caracteres${required ? ' ou menos' : ''}.`);
    return value.trim();
  };
  const date = (value, label) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AppError(`${label}: informe uma data válida entre 2000 e 2099.`);
    return value;
  };
  const timestamp = value => {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new AppError('Data de registro inválida no backup.');
    return value;
  };
  function input(raw) {
    if (!raw || !['task', 'reminder', 'note'].includes(raw.kind) || !['todo', 'doing', 'done'].includes(raw.status) || !['low', 'medium', 'high'].includes(raw.priority)) throw new AppError('Tipo, status ou prioridade inválidos.');
    const scheduled_date = date(raw.scheduled_date, 'Dia planejado'), due_date = date(raw.due_date, 'Prazo final');
    if (scheduled_date && due_date && due_date < scheduled_date) throw new AppError('O prazo final deve ser igual ou posterior ao dia planejado.');
    const reminder_at = raw.reminder_at || null;
    if (reminder_at !== null && (typeof reminder_at !== 'string' || !/^20\d{2}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(reminder_at) || !date(reminder_at.slice(0, 10), 'Lembrete'))) throw new AppError('Informe uma data e horário válidos para o lembrete.');
    if (raw.kind === 'reminder' && !reminder_at) throw new AppError('Escolha quando deseja receber o lembrete.');
    for (const field of ['pinned', 'reminder_seen']) if (raw[field] !== undefined && typeof raw[field] !== 'boolean') throw new AppError('Opção inválida.');
    const checklist = raw.checklist ?? [];
    if (!Array.isArray(checklist) || checklist.length > 50) throw new AppError('Use até 50 itens no checklist.');
    return {
      title: string(raw.title, 160, 'Título', true), content: string(raw.content ?? '', 20000, 'Anotações'),
      kind: raw.kind, status: raw.status, priority: raw.priority, category: string(raw.category ?? '', 60, 'Categoria'),
      scheduled_date, due_date, reminder_at, pinned: raw.pinned ?? false, reminder_seen: raw.reminder_seen ?? false,
      checklist: checklist.map(item => {
        if (!item || typeof item.done !== 'boolean') throw new AppError('Item de checklist inválido.');
        return { text: string(item.text, 200, 'Item do checklist', true), done: item.done };
      })
    };
  }
  const columns = ['title', 'content', 'kind', 'status', 'priority', 'category', 'scheduled_date', 'due_date', 'reminder_at', 'reminder_seen', 'pinned', 'checklist', 'created_at', 'updated_at', 'completed_at'];
  const values = n => columns.map(key => key === 'checklist' ? JSON.stringify(n[key]) : ['pinned', 'reminder_seen'].includes(key) ? Number(n[key]) : n[key]);
  const insert = db.prepare(`INSERT INTO notes (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  const get = id => {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Anotação inválida.');
    const row = db.prepare('SELECT * FROM notes WHERE id=?').get(id);
    if (!row) throw new AppError('Anotação não encontrada.', 404);
    return decode(row);
  };
  return {
    list: () => db.prepare('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC, id DESC').all().map(decode),
    add(raw) {
      const n = input(raw), now = new Date().toISOString();
      const result = insert.run(...values({ ...n, created_at: now, updated_at: now, completed_at: n.status === 'done' ? now : null }));
      return get(Number(result.lastInsertRowid));
    },
    update(id, raw) {
      const old = get(id), n = input(raw), now = new Date().toISOString();
      if (old.reminder_at !== n.reminder_at) n.reminder_seen = false;
      const next = { ...n, created_at: old.created_at, updated_at: now, completed_at: n.status === 'done' ? old.completed_at || now : null };
      db.prepare(`UPDATE notes SET ${columns.map(key => `${key}=?`).join(',')} WHERE id=?`).run(...values(next), id);
      return get(id);
    },
    remove(id) { get(id); db.prepare('DELETE FROM notes WHERE id=?').run(id); },
    validateBackup(rows) {
      if (!Array.isArray(rows) || rows.length > 10000) throw new AppError('Anotações inválidas no backup.');
      const ids = new Set();
      return rows.map(raw => {
        if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || ids.has(raw.id)) throw new AppError('Identificador de anotação inválido no backup.');
        ids.add(raw.id);
        const n = input(raw);
        const completed_at = raw.completed_at == null ? null : timestamp(raw.completed_at);
        if ((n.status === 'done') !== Boolean(completed_at)) throw new AppError('Conclusão da anotação inválida no backup.');
        return { ...n, id: raw.id, created_at: timestamp(raw.created_at), updated_at: timestamp(raw.updated_at), completed_at };
      });
    },
    replace(rows) {
      // Called only after validation, inside the shared backup transaction.
      db.exec('DELETE FROM notes');
      const restore = db.prepare(`INSERT INTO notes (id,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`);
      for (const n of rows) restore.run(n.id, ...values(n));
    }
  };
}
