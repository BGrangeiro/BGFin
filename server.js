import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { openDatabase, AppError } from './lib/database.js';
import { createDailyVerse } from './lib/verse.js';
import { createQuiz } from './lib/quiz.js';
import { createAuth } from './lib/auth.js';
import { createChatService } from './lib/chat.js';
import { createAiProvider } from './lib/ai.js';
import { createAiSettings } from './lib/ai-settings.js';
import { runtimeConfig, loadAccounts, validateRequestOrigin, clientAddress } from './lib/config.js';
import { databaseFiles } from './lib/data-paths.js';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp({ databasePath = process.env.DB_PATH || resolve(root, 'data', 'saldo.sqlite'), dailyVerse = createDailyVerse(), quiz = createQuiz(), aiProvider = createAiProvider({AppError}), aiProviderFactory, config = runtimeConfig(), auth = createAuth({ accounts: loadAccounts(config.accountsFile), secureCookies: config.secureCookies, clientAddress: req => clientAddress(req, config) }) } = {}) {
  // Preserve all existing records as Bruno's workspace; Ana gets her own database.
  const primaryStore = openDatabase(databasePath);
  const filesByUser = databaseFiles(databasePath);
  const stores = new Map([['bruno', primaryStore]]);
  const aiSettings=createAiSettings({directory:databasePath===':memory:'?null:resolve(dirname(databasePath),'ai-config'),fallback:aiProvider,AppError,providerFactory:aiProviderFactory});
  const chat = createChatService({getProvider:id=>aiSettings.provider(id),AppError});
  function userStore(id) {
    if (!['bruno', 'ana'].includes(id)) throw new AppError('Conta não autorizada.', 403);
    if (!stores.has(id)) {
      stores.set(id, openDatabase(filesByUser[id]));
    }
    return stores.get(id);
  }
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const body = async (req, limit = 15 * 1024 * 1024) => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Envie dados no formato JSON.', 415);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw new AppError('Conteúdo maior que o limite permitido.', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AppError('JSON inválido.'); }
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (req.url === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        primaryStore.db.prepare('SELECT 1').get();
        return send(res, 200, { ok: true });
      }
      const origin = validateRequestOrigin(req, config);
      const url = new URL(req.url, origin);
      const path = url.pathname;
      if (path === '/api/auth/login' && req.method === 'POST') return send(res, 200, { user: await auth.login(req, res, await body(req, 4096)) });
      const currentUser = auth.user(req);
      if (path.startsWith('/api/') && !currentUser) throw new AppError('Entre na sua conta para continuar.', 401);
      if (path.startsWith('/api/') && req.headers['x-persona-user'] && req.headers['x-persona-user'] !== currentUser.id) throw new AppError('A conta foi alterada. Entre novamente para continuar.', 401);
      if (path === '/api/auth/logout' && req.method === 'POST') { auth.logout(req, res); return send(res, 200, { ok: true }); }
      if (path === '/api/auth/session' && req.method === 'GET') return send(res, 200, { user: currentUser });
      if (path === '/login' && currentUser && ['GET', 'HEAD'].includes(req.method)) { res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }); return res.end(); }
      const store = currentUser ? userStore(currentUser.id) : null;
      if (path === '/api/chat' && req.method === 'GET') return send(res,200,{status:chat.status(currentUser.id),messages:store.chat.list()});
      if (path === '/api/chat/config' && req.method === 'POST') return send(res,200,{status:await aiSettings.configure(currentUser.id,await body(req,4096))});
      if (path === '/api/chat' && req.method === 'POST') return send(res,201,await chat.send(store,currentUser.id,await body(req,16384)));
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
      if (path === '/api/preferences' && req.method === 'GET') return send(res,200,store.preferences.list());
      if (path === '/api/preferences' && req.method === 'PUT') return send(res,200,store.preferences.update(await body(req)));
      if (path === '/api/personal' && req.method === 'GET') return send(res,200,store.personal.list());
      if (path === '/api/personal/tabs' && req.method === 'POST') return send(res,201,store.personal.addTab(await body(req)));
      if (path === '/api/personal/tabs/order' && req.method === 'PUT') return send(res,200,store.personal.reorderTabs(await body(req)));
      if (path === '/api/personal/items' && req.method === 'POST') return send(res,201,store.personal.add(await body(req)));
      if (path === '/api/personal/folders' && req.method === 'POST') return send(res,201,store.personal.addFolder(await body(req)));
      const folderRoute = path.match(/^\/api\/personal\/folders\/(\d+)$/);
      if (folderRoute && req.method === 'PUT') return send(res,200,store.personal.updateFolder(Number(folderRoute[1]),await body(req)));
      if (folderRoute && req.method === 'DELETE') {store.personal.removeFolder(Number(folderRoute[1]));return send(res,200,{ok:true});}
      if (path === '/api/personal/schedule' && req.method === 'PUT') return send(res,200,store.personal.saveSchedule(await body(req)));
      const studyReviewRoute = path.match(/^\/api\/personal\/items\/(\d+)\/review$/);
      if (studyReviewRoute && req.method === 'POST') return send(res,200,store.personal.reviewStudy(Number(studyReviewRoute[1]),await body(req)));
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
      const files = { '/chat-voice.js':'chat-voice.js', '/chat.js':'chat.js', '/chat.css':'chat.css', '/login': 'login.html', '/login.js': 'login.js', '/login.css': 'login.css', '/schedule.js':'schedule.js', '/schedule-model.js':'schedule-model.js', '/schedule.css':'schedule.css', '/study-model.js':'study-model.js', '/study-reviews.js':'study-reviews.js', '/studies.css':'studies.css', '/navigation.js':'navigation.js', '/fitness.js':'fitness.js', '/fitness-model.js':'fitness-model.js', '/fitness.css':'fitness.css', '/debts-model.js': 'debts-model.js', '/debts.css': 'debts.css', '/personal-library.js': 'personal-library.js', '/personal.js': 'personal.js', '/date-picker.js': 'date-picker.js', '/responsive.css': 'responsive.css', '/': currentUser ? 'index.html' : 'login.html', '/app.js': 'app.js', '/investments.js': 'investments.js', '/investments-model.js': 'investments-model.js', '/investments.css': 'investments.css', '/notes.js': 'notes.js', '/notes-model.js': 'notes-model.js', '/period.js': 'period.js', '/styles.css': 'styles.css', '/notes.css': 'notes.css', '/favicon.svg': 'favicon.svg' };
      if (!files[path] || !['GET','HEAD'].includes(req.method)) throw new AppError('Página não encontrada.', 404);
      const data = await readFile(resolve(root, 'public', files[path]));
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': `${types[extname(files[path])]} ; charset=utf-8`, 'Cache-Control': extname(files[path]) === '.html' ? 'no-store' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      send(res, error.status || 500, { error: error instanceof AppError ? error.message : 'Não foi possível concluir. Tente novamente.' });
    }
  });
  server.on('close', () => { for (const store of stores.values()) store.close(); });
  return { server, store: primaryStore };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const config = runtimeConfig(), { port, host } = config;
  const { server } = createApp({ config });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso. Escolha outra com a variável PORT.` : error.message); process.exit(1); });
  server.listen(port, host, () => console.log(`Persona está pronto: ${config.publicOrigin || `http://${host}:${port}`}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
