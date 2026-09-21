import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { openDatabase, AppError } from './lib/database.js';
import { createDailyVerse } from './lib/verse.js';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp({ databasePath = process.env.DB_PATH || resolve(root, 'data', 'saldo.sqlite'), dailyVerse = createDailyVerse() } = {}) {
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
      if (path === '/api/state' && req.method === 'GET') return send(res, 200, store.list(url.searchParams.get('month')));
      if (path === '/api/backup' && req.method === 'GET') {
        res.setHeader('Content-Disposition', `attachment; filename="bgfin-backup-${new Date().toISOString().slice(0,10)}.json"`);
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
      const files = { '/': 'index.html', '/app.js': 'app.js', '/period.js': 'period.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg' };
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
  server.listen(port, '127.0.0.1', () => console.log(`BGFIN está pronto: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
