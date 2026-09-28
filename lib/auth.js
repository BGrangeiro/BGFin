import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ACCOUNTS } from './auth-accounts.js';
import { AppError } from './database.js';

const deriveKey = promisify(scrypt);
const COOKIE = 'persona_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const tokenHash = token => createHash('sha256').update(token).digest('hex');

export function createAuth({ accounts = ACCOUNTS, now = Date.now, secureCookies = false, clientAddress = req => req.socket.remoteAddress } = {}) {
  const sessions = new Map(), attempts = new Map();
  function cleanup() {
    const time = now();
    for (const [key, session] of sessions) if (session.expires <= time) sessions.delete(key);
    for (const [key, attempt] of attempts) if (attempt.expires <= time) attempts.delete(key);
  }
  function key(req) {
    const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? tokenHash(token) : null;
  }
  function cookie(res, token, seconds) {
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secureCookies ? '; Secure' : ''}`);
  }
  function user(req) {
    cleanup();
    return sessions.get(key(req))?.user || null;
  }
  function logout(req, res) {
    sessions.delete(key(req));
    cookie(res, '', 0);
  }
  async function login(req, res, input) {
    cleanup();
    const address = clientAddress(req);
    const attempt = attempts.get(address) || { count: 0, expires: now() + ATTEMPT_WINDOW_MS };
    if (attempt.count >= 10) {
      res.setHeader('Retry-After', Math.ceil((attempt.expires - now()) / 1000));
      throw new AppError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', 429);
    }
    attempt.count++;
    attempts.set(address, attempt);
    if (!input || typeof input.username !== 'string' || typeof input.password !== 'string' || input.username.length > 128 || input.password.length > 256) {
      throw new AppError('Usuário ou senha incorretos.', 401);
    }
    const account = accounts.find(item => item.id === input.username.trim().toLowerCase());
    // Run the same password derivation even when the username does not exist.
    const candidate = account || accounts[0];
    const derived = await deriveKey(input.password.toLowerCase(), candidate.salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (!timingSafeEqual(derived, Buffer.from(candidate.hash, 'hex')) || !account) throw new AppError('Usuário ou senha incorretos.', 401);
    attempts.delete(address);
    sessions.delete(key(req));
    const token = randomBytes(32).toString('hex'), currentUser = { id: account.id, name: account.name };
    sessions.set(tokenHash(token), { user: currentUser, expires: now() + SESSION_MS });
    cookie(res, token, SESSION_MS / 1000);
    return currentUser;
  }
  return { user, login, logout };
}
