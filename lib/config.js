import { readFileSync } from 'node:fs';
import { isIP, BlockList } from 'node:net';
import { ACCOUNTS } from './auth-accounts.js';
import { AppError } from './database.js';

export function runtimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  let publicOrigin = null;
  if (env.PUBLIC_ORIGIN) {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PUBLIC_ORIGIN deve conter somente protocolo e domínio.');
    publicOrigin = url.origin;
  }
  if (production && !publicOrigin?.startsWith('https://')) throw new Error('Em produção, configure PUBLIC_ORIGIN com https://seu-dominio.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve estar entre 1 e 65535.');
  return { production, publicOrigin, secureCookies: publicOrigin?.startsWith('https://') || false, trustProxy: env.TRUST_PROXY === '1', host: env.HOST || '127.0.0.1', port, accountsFile: env.AUTH_ACCOUNTS_FILE || null };
}

export function loadAccounts(file) {
  if (!file) return ACCOUNTS;
  const accounts = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(accounts) || accounts.length !== 2 || new Set(accounts.map(item => item?.id)).size !== 2 || accounts.some(item => !['bruno', 'ana'].includes(item?.id) || typeof item.name !== 'string' || !item.name.trim() || !/^[a-f0-9]{32}$/.test(item.salt) || !/^[a-f0-9]{128}$/.test(item.hash))) throw new Error('Arquivo de contas inválido. Gere-o com npm run accounts.');
  return accounts;
}

export function validateRequestOrigin(req, config) {
  const host = req.headers.host || '';
  const allowed = config.publicOrigin ? host.toLowerCase() === new URL(config.publicOrigin).host : /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$|^\[::1\](:\d+)?$/.test(host);
  if (!allowed) throw new AppError('Endereço de acesso não permitido.', 403);
  const origin = config.publicOrigin || `http://${host}`;
  const crossSite = req.headers['sec-fetch-site'] === 'cross-site';
  // Cross-site links can open the site, but cannot submit forms or call the API.
  const navigation = ['GET', 'HEAD'].includes(req.method) && req.headers['sec-fetch-mode'] === 'navigate';
  if ((req.headers.origin && req.headers.origin !== origin) || (crossSite && !navigation)) throw new AppError('Origem não permitida.', 403);
  return origin;
}

const proxies = new BlockList();
proxies.addSubnet('127.0.0.0', 8); proxies.addSubnet('10.0.0.0', 8); proxies.addSubnet('172.16.0.0', 12); proxies.addSubnet('192.168.0.0', 16);
proxies.addAddress('::1', 'ipv6'); proxies.addSubnet('fc00::', 7, 'ipv6');
export function clientAddress(req, config) {
  const remote = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const type = isIP(remote) === 6 ? 'ipv6' : 'ipv4';
  const forwarded = req.headers['x-persona-client-ip'];
  if (config.trustProxy && isIP(remote) && proxies.check(remote, type) && typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  return remote;
}
