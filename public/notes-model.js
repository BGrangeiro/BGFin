export const STATUSES = { todo: 'A fazer', doing: 'Fazendo', done: 'Feito' };
export const PRIORITIES = { high: 'Alta', medium: 'Média', low: 'Baixa' };
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localMinute(date = new Date()) {
  return `${localDay(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export const overdue = (n, day = localDay()) => n.kind !== 'note' && n.status !== 'done' && Boolean(n.due_date && n.due_date < day);
export const dueReminder = (n, now = localMinute()) => n.status !== 'done' && !n.reminder_seen && Boolean(n.reminder_at && n.reminder_at <= now);
export function matchesPeriod(n, period, day = localDay()) {
  if (period === 'all') return true;
  if (n.kind === 'note' || n.status === 'done') return false;
  if (period === 'overdue') return overdue(n, day);
  const dates = [n.scheduled_date, n.due_date, n.reminder_at?.slice(0, 10)].filter(Boolean);
  if (period === 'today') return dates.includes(day);
  const end = new Date(`${day}T12:00:00`); end.setDate(end.getDate() + 6);
  return dates.some(date => date >= day && date <= localDay(end));
}
export function sortNotes(items) {
  const priority = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.due_date || '9999').localeCompare(b.due_date || '9999') || priority[a.priority] - priority[b.priority] || b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
}
