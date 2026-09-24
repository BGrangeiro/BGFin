import { shiftMonth } from './period.js';

export const DEFAULT_DEBT_COLOR = '#537ddb';
export const debtColor = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : DEFAULT_DEBT_COLOR;
export const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export function validScheduleDate(value) {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function dateInMonth(month, day) {
  const [year, number] = month.split('-').map(Number);
  return `${month}-${String(Math.min(day, new Date(Date.UTC(year, number, 0)).getUTCDate())).padStart(2, '0')}`;
}
// One installment per calendar month, including both endpoints. The last date is exact.
export function installmentSchedule(debt) {
  const first = debt.first_installment_date, last = debt.last_installment_date;
  if (!validScheduleDate(first) || !validScheduleDate(last)) throw new Error('Informe as datas da primeira e da última parcela.');
  if (last < first) throw new Error('A última parcela não pode ser anterior à primeira.');
  const [fy, fm] = first.split('-').map(Number), [ly, lm] = last.split('-').map(Number);
  const count = (ly - fy) * 12 + lm - fm + 1;
  if (count === 1 && first !== last) throw new Error('Para uma única parcela, use a mesma data no início e no fim.');
  if (!Number.isSafeInteger(debt.amount) || debt.amount < count) throw new Error('O total deve permitir pelo menos R$ 0,01 por parcela.');
  const base = Math.floor(debt.amount / count), extra = debt.amount % count;
  let offset = 0;
  return Array.from({ length: count }, (_, index) => {
    const amount = base + (index < extra ? 1 : 0);
    const date = index === count - 1 ? last : dateInMonth(shiftMonth(first.slice(0, 7), index), Number(first.slice(8)));
    const item = { number: index + 1, date, amount, offset };
    offset += amount;
    return item;
  });
}
export function paidBeforeToday(debt, day = localDay()) {
  return installmentSchedule(debt).filter(item => item.date < day).reduce((sum, item) => sum + item.amount, 0);
}
export function installmentProgress(debt, paid = debt.paid ?? debt.initial_paid ?? 0) {
  const schedule = installmentSchedule(debt).map(item => ({ ...item,
    remaining: Math.max(0, item.amount - Math.max(0, paid - item.offset))
  }));
  return { schedule, installment_count: schedule.length,
    installments_remaining: schedule.filter(item => item.remaining > 0).length,
    installment_amount: schedule[0].amount,
    installment_min: Math.min(...schedule.map(item => item.amount)),
    installment_max: Math.max(...schedule.map(item => item.amount)),
    remaining: Math.max(0, debt.amount - paid) };
}
