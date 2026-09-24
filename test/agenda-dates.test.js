import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../lib/database.js';
import { parseDate, displayDate } from '../public/date-picker.js';

test('datas digitadas: valida dias reais, anos bissextos, mês e horário', () => {
  assert.equal(parseDate('29/02/2028','date'),'2028-02-29');
  for (const value of ['29/02/2027','31/04/2026','00/01/2026','01/13/2026']) assert.equal(parseDate(value,'date'),'');
  assert.equal(parseDate('23/09/2026 09:05','datetime-local'),'2026-09-23T09:05');
  assert.equal(parseDate('23/09/2026 24:00','datetime-local'),'');
  assert.equal(parseDate('09/2026','month'),'2026-09');
  assert.equal(displayDate('2026-09-23T09:05','datetime-local'),'23/09/2026 09:05');
});
test('agenda inclui meses anteriores, respeita pagamento e não depende do mês em tela', t => {
  const store=openDatabase(':memory:');t.after(()=>store.close());
  const bill=store.addBill({description:'Internet',amount:10000,category:'Moradia',due_day:20,start_month:'2026-09'});
  assert.deepEqual(store.agenda('2026-10-20').map(i=>i.date),['2026-09-20','2026-10-20']);
  store.payBill(bill.id,{month:'2026-09',date:'2026-09-20'});
  assert.deepEqual(store.agenda('2026-10-20').map(i=>i.date),['2026-10-20']);
  assert.equal(store.agenda('2026-10-19').length,0);
  assert.ok(store.agenda('2026-10-20').every(i=>!('amount' in i)));
  assert.deepEqual(store.list('2026-09').agenda,store.list('2026-12').agenda);
});
