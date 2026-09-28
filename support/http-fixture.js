import { scryptSync } from 'node:crypto';
import { createApp as createServerApp } from '../server.js';
import { createAuth } from '../lib/auth.js';

// Independent test credentials: never include real passwords in test fixtures.
export const testPassword = 'Test-only-password';
export const testAccounts = ['Bruno', 'Ana'].map(name => {
  const salt = `persona-test-${name}`;
  return { id: name.toLowerCase(), name, salt, hash: scryptSync(testPassword.toLowerCase(), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex') };
});
export function createApp(options) {
  const app = createServerApp({ ...options, auth: createAuth({ accounts: testAccounts }) });
  let cookie;
  const login = async () => {
    const response = await globalThis.fetch(`http://127.0.0.1:${app.server.address().port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Bruno', password: testPassword })
    });
    if (response.status !== 200) throw new Error('Test session login failed');
    await response.json();
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { ...app, fetch: async (url, options = {}) => {
    cookie ||= login();
    return globalThis.fetch(url, { ...options, headers: { ...options.headers, Cookie: await cookie } });
  } };
}
