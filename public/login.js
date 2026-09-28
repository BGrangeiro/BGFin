const form = document.querySelector('#login-form');
const password = document.querySelector('#password');
const error = document.querySelector('#login-error');
const submit = form.querySelector('[type=submit]');
async function authRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}
document.querySelector('#toggle-password').addEventListener('click', event => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'Ocultar' : 'Mostrar';
  event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  event.currentTarget.setAttribute('aria-pressed', String(visible));
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Entrando…';
  try {
    const { response, data } = await authRequest('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.elements.username.value, password: password.value })
    });
    if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
    const session = await authRequest('/api/auth/session');
    if (session.response.status === 401) throw new Error('O navegador não manteve seu acesso. Permita os cookies deste site e tente novamente.');
    if (!session.response.ok) throw new Error('Não foi possível confirmar o acesso. Tente novamente.');
    password.value = '';
    // Replacing only the fragment is a same-document navigation and leaves the login form open.
    if (location.pathname === '/') location.reload();
    else location.replace('/' + location.hash);
  } catch (failure) {
    error.textContent = failure.name === 'AbortError' ? 'O servidor demorou para responder. Verifique se o Persona está aberto e tente novamente.' : failure instanceof TypeError ? 'Não foi possível conectar. Verifique se o Persona está aberto e tente novamente.' : failure.message;
    error.hidden = false;
    password.focus();
  } finally {
    submit.disabled = false;
    submit.textContent = 'Entrar';
  }
});
