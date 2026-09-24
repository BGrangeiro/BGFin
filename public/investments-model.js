export const INVESTMENT_TYPES = { fixed: 'Renda fixa', treasury: 'Tesouro Direto', stock: 'Ações', reit: 'Fundos imobiliários', fund: 'Fundos / ETFs', crypto: 'Criptomoedas', savings: 'Poupança', other: 'Outro' };
export const ENTRY_TYPES = { contribution: 'Aporte', withdrawal: 'Resgate', gain: 'Ganho', loss: 'Perda', fee: 'Taxa / imposto' };
export const entrySign = kind => ['contribution', 'gain'].includes(kind) ? 1 : -1;
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function investmentTotals(entries) {
  const totals = { contribution: 0, withdrawal: 0, gain: 0, loss: 0, fee: 0, balance: 0, result: 0 };
  for (const entry of entries) { totals[entry.kind] += entry.amount; totals.balance += entrySign(entry.kind) * entry.amount; }
  totals.result = totals.gain - totals.loss - totals.fee;
  return totals;
}
export function investmentAlerts(records, day = localDate()) {
  const end = new Date(`${day}T12:00:00`); end.setDate(end.getDate() + 7);
  return records.filter(i => i.status === 'active').flatMap(i => [
    ...(i.review_date ? [{ id: i.id, name: i.name, date: i.review_date, kind: 'review', label: 'Revisar / movimentar' }] : []),
    ...(i.maturity_date ? [{ id: i.id, name: i.name, date: i.maturity_date, kind: 'maturity', label: 'Vencimento' }] : [])
  ]).filter(a => a.date <= localDate(end)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}
