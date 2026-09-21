export const FIRST_MONTH = '2026-09';
export const FIRST_DATE = '2026-09-10';
export function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}
// Closing day 10 stays in the previous period. September includes the initial days.
export function periodMonth(date) {
  const month = date.slice(0, 7);
  return date <= '2026-09-10' && date >= FIRST_DATE ? FIRST_MONTH
    : Number(date.slice(8, 10)) <= 10 ? shiftMonth(month, -1) : month;
}
export function periodRange(month) {
  return { start: month === FIRST_MONTH ? FIRST_DATE : `${month}-11`, end: `${shiftMonth(month, 1)}-10` };
}
export function periodDueDate(month, day) {
  const calendarMonth = day <= 10 ? shiftMonth(month, 1) : month;
  const [year, number] = calendarMonth.split('-').map(Number);
  return `${calendarMonth}-${String(Math.min(day, new Date(Date.UTC(year, number, 0)).getUTCDate())).padStart(2, '0')}`;
}
