import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { openDatabase, AppError } from './lib/database.js';
import { createDailyVerse } from './lib/verse.js';
import { createQuiz } from './lib/quiz.js';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp({ databasePath = process.env.DB_PATH || resolve(root, 'data', 'saldo.sqlite'), dailyVerse = createDailyVerse(), quiz = createQuiz() } = {}) {
  const store = openDatabase(databasePath);
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const body = async req => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Envie dados no formato JSON.', 415);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 15 * 1024 * 1024) throw new AppError('Arquivo muito grande. Limite: 15 MB.', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AppError('JSON inválido.'); }
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      if (!/^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$|^\[::1\](:\d+)?$/.test(host)) throw new AppError('Acesso permitido apenas pelo endereço local.', 403);
      if ((req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Origem não permitida.', 403);
      const url = new URL(req.url, `http://${host}`);
      const path = url.pathname;
      if (path === '/api/verse' && req.method === 'GET') return send(res, 200, await dailyVerse());
      if (path === '/api/quiz' && req.method === 'GET') return send(res, 200, await quiz());
      if (path === '/api/state' && req.method === 'GET') return send(res, 200, store.list(url.searchParams.get('month')));
      if (path === '/api/investments' && req.method === 'GET') return send(res, 200, store.investments.list());
      if (path === '/api/investments' && req.method === 'POST') return send(res, 201, store.investments.add(await body(req)));
      const investment = path.match(/^\/api\/investments\/(\d+)$/);
      const investmentEntries = path.match(/^\/api\/investments\/(\d+)\/entries$/);
      const investmentEntry = path.match(/^\/api\/investments\/(\d+)\/entries\/(\d+)$/);
      if (investment && req.method === 'GET') return send(res, 200, store.investments.get(Number(investment[1])));
      if (investment && req.method === 'PUT') return send(res, 200, store.investments.update(Number(investment[1]), await body(req)));
      if (investment && req.method === 'DELETE') { store.investments.remove(Number(investment[1])); return send(res, 200, { ok: true }); }
      if (investmentEntries && req.method === 'POST') return send(res, 201, store.investments.addEntry(Number(investmentEntries[1]), await body(req)));
      if (investmentEntry && req.method === 'PUT') return send(res, 200, store.investments.updateEntry(Number(investmentEntry[1]), Number(investmentEntry[2]), await body(req)));
      if (investmentEntry && req.method === 'DELETE') return send(res, 200, store.investments.removeEntry(Number(investmentEntry[1]), Number(investmentEntry[2])));
      if (path === '/api/personal' && req.method === 'GET') return send(res,200,store.personal.list());
      if (path === '/api/personal/tabs' && req.method === 'POST') return send(res,201,store.personal.addTab(await body(req)));
      if (path === '/api/personal/tabs/order' && req.method === 'PUT') return send(res,200,store.personal.reorderTabs(await body(req)));
      if (path === '/api/personal/items' && req.method === 'POST') return send(res,201,store.personal.add(await body(req)));
      if (path === '/api/personal/folders' && req.method === 'POST') return send(res,201,store.personal.addFolder(await body(req)));
      const folderRoute = path.match(/^\/api\/personal\/folders\/(\d+)$/);
      if (folderRoute && req.method === 'PUT') return send(res,200,store.personal.updateFolder(Number(folderRoute[1]),await body(req)));
      if (folderRoute && req.method === 'DELETE') {store.personal.removeFolder(Number(folderRoute[1]));return send(res,200,{ok:true});}
      const personalRoute = path.match(/^\/api\/personal\/(tabs|items)\/(\d+)$/);
      if (personalRoute) {
        const id=Number(personalRoute[2]), tab=personalRoute[1]==='tabs';
        if (req.method === 'PUT') return send(res,200,tab?store.personal.renameTab(id,await body(req)):store.personal.update(id,await body(req)));
        if (req.method === 'DELETE') { if(tab)store.personal.removeTab(id);else store.personal.remove(id);return send(res,200,{ok:true}); }
      }
      if (path === '/api/notes' && req.method === 'GET') return send(res, 200, store.notes.list());
      if (path === '/api/notes' && req.method === 'POST') return send(res, 201, store.notes.add(await body(req)));
      const note = path.match(/^\/api\/notes\/(\d+)$/);
      if (note && req.method === 'PUT') return send(res, 200, store.notes.update(Number(note[1]), await body(req)));
      if (note && req.method === 'DELETE') { store.notes.remove(Number(note[1])); return send(res, 200, { ok: true }); }
      if (path === '/api/backup' && req.method === 'GET') {
        res.setHeader('Content-Disposition', `attachment; filename="persona-backup-${new Date().toISOString().slice(0,10)}.json"`);
        return send(res, 200, store.exportData());
      }
      if (path === '/api/restore' && req.method === 'POST') return send(res, 200, store.restoreData(await body(req)));
      if (path === '/api/transactions' && req.method === 'POST') return send(res, 201, store.addTransaction(await body(req)));
      if (path === '/api/bills' && req.method === 'POST') return send(res, 201, store.addBill(await body(req)));
      if (path === '/api/debts' && req.method === 'POST') return send(res, 201, store.addDebt(await body(req)));
      const debt = path.match(/^\/api\/debts\/(\d+)$/);
      const debtPay = path.match(/^\/api\/debts\/(\d+)\/pay$/);
      if (debtPay && req.method === 'POST') return send(res, 201, store.payDebt(Number(debtPay[1]), await body(req)));
      if (debt && req.method === 'PUT') return send(res, 200, store.updateDebt(Number(debt[1]), await body(req)));
      if (debt && req.method === 'DELETE') { store.deleteDebt(Number(debt[1])); return send(res, 200, { ok: true }); }
      const tx = path.match(/^\/api\/transactions\/(\d+)$/);
      const bill = path.match(/^\/api\/bills\/(\d+)$/);
      const pay = path.match(/^\/api\/bills\/(\d+)\/pay$/);
      if (pay && req.method === 'POST') return send(res, 201, store.payBill(Number(pay[1]), await body(req)));
      if (tx && req.method === 'PUT') return send(res, 200, store.updateTransaction(Number(tx[1]), await body(req)));
      if (bill && req.method === 'PUT') return send(res, 200, store.updateBill(Number(bill[1]), await body(req)));
      if ((tx || bill) && req.method === 'DELETE') { if (tx) store.deleteTransaction(Number(tx[1])); else store.deleteBill(Number(bill[1])); return send(res, 200, { ok: true }); }
      if (path.startsWith('/api/')) throw new AppError('Operação não encontrada.', 404);
      const files = { '/debts-model.js': 'debts-model.js', '/debts.css': 'debts.css', '/personal-library.js': 'personal-library.js', '/personal.js': 'personal.js', '/date-picker.js': 'date-picker.js', '/responsive.css': 'responsive.css', '/': 'index.html', '/app.js': 'app.js', '/investments.js': 'investments.js', '/investments-model.js': 'investments-model.js', '/investments.css': 'investments.css', '/notes.js': 'notes.js', '/notes-model.js': 'notes-model.js', '/period.js': 'period.js', '/styles.css': 'styles.css', '/notes.css': 'notes.css', '/favicon.svg': 'favicon.svg' };
      if (!files[path] || !['GET','HEAD'].includes(req.method)) throw new AppError('Página não encontrada.', 404);
      const data = await readFile(resolve(root, 'public', files[path]));
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': `${types[extname(files[path])]} ; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      send(res, error.status || 500, { error: error instanceof AppError ? error.message : 'Não foi possível concluir. Tente novamente.' });
    }
  });
  server.on('close', () => store.close());
  return { server, store };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const { server } = createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso. Escolha outra com a variável PORT.` : error.message); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(`Persona está pronto: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
