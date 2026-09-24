// Keep the native ISO input as the form value; offer typing and a wheel-style chooser.
export function displayDate(value, type) {
  if (!value) return '';
  const [date, time] = value.split('T'), parts = date.split('-');
  return parts.reverse().join('/') + (time ? ` ${time.slice(0, 5)}` : '');
}
export function parseDate(value, type) {
  const match = value.trim().match(type === 'month' ? /^(\d{2})\/(\d{4})$/ : type === 'datetime-local' ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, a, b, c, h, m] = match;
  const year = type === 'month' ? b : c, month = type === 'month' ? a : b, day = type === 'month' ? '01' : a;
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(+year, +month, 0).getDate() || (h !== undefined && (+h > 23 || +m > 59))) return '';
  return `${year}-${month}${type === 'month' ? '' : `-${day}`}${h === undefined ? '' : `T${h}:${m}`}`;
}
export function initDatePickers() {
  const picker = document.createElement('dialog');
  picker.className = 'date-picker'; picker.setAttribute('aria-label', 'Escolher data');
  document.body.append(picker);
  let target;
  const pad = n => String(n).padStart(2, '0');
  function open(input, text) {
    target = { input, text };
    const type = input.type, now = new Date();
    let value = input.value || `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (input.min && value < input.min) value = input.min;
    if (input.max && value > input.max) value = input.max;
    const [date, time = '12:00'] = value.split('T'), [year, month, day = '01'] = date.split('-');
    const wheel = (name, label, start, end, selected, labels) => `<label class="date-wheel"><span>${label}</span><span class="wheel-track" role="listbox" tabindex="0" data-part="${name}" data-value="${+selected}" aria-label="${label}">${Array.from({length:end-start+1}, (_, i) => `<button type="button" role="option" tabindex="-1" data-value="${i+start}" aria-selected="${i+start===+selected}">${labels?.[i] || pad(i+start)}</button>`).join('')}</span></label>`;
    picker.innerHTML = `<div class="modal-header"><div><h2>Escolher ${type==='month'?'mês':'data'}</h2><p>Deslize as colunas ou use as setas do teclado.</p></div><button type="button" data-close class="icon-button" aria-label="Fechar">×</button></div><div class="modal-body"><div class="date-wheels">${type==='month'?'':wheel('day','Dia',1,31,day)}${wheel('month','Mês',1,12,month,['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])}${wheel('year','Ano',+(input.min?.slice(0,4)||2000),+(input.max?.slice(0,4)||2099),year)}</div>${type==='datetime-local'?`<div class="date-wheels date-time">${wheel('hour','Hora',0,23,time.slice(0,2))}${wheel('minute','Minuto',0,59,time.slice(3,5))}</div>`:''}<p class="field-hint" data-preview></p><div class="modal-actions">${input.required?'':'<button type="button" class="button secondary" data-clear>Limpar</button>'}<button type="button" class="button secondary" data-close>Cancelar</button><button type="button" class="button primary" data-apply>Confirmar</button></div></div>`;
    picker.showModal(); update();
    for (const track of picker.querySelectorAll('.wheel-track')) {
      const center = () => { const option = track.querySelector('[aria-selected=true]'); track.scrollTop = option.offsetTop - 60; };
      center();
      let timer;
      track.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(() => {
        if (!track.isConnected || !picker.open) return;
        const options = [...track.children].filter(o=>!o.disabled);
        const midpoint = track.getBoundingClientRect().top + track.clientHeight/2;
        const nearest = options.reduce((a,b)=>Math.abs(a.getBoundingClientRect().top+20-midpoint)<Math.abs(b.getBoundingClientRect().top+20-midpoint)?a:b);
        track.dataset.value = nearest.dataset.value; update();
      },120); });
      track.addEventListener('click', e => { const option = e.target.closest('[role=option]'); if(option&&!option.disabled){track.dataset.value=option.dataset.value;update();center();} });
      track.addEventListener('keydown', e => { if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return; e.preventDefault(); const options=[...track.children].filter(o=>!o.disabled); const index=options.findIndex(o=>o.dataset.value===track.dataset.value); const next=e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,index+(e.key==='ArrowDown'?1:-1)));track.dataset.value=options[next].dataset.value;update();center(); });
    }
  }
  function update() {
    const parts = Object.fromEntries([...picker.querySelectorAll('.wheel-track')].map(s => [s.dataset.part, +s.dataset.value]));
    const days = new Date(parts.year, parts.month, 0).getDate();
    const daySelect = picker.querySelector('[data-part=day]');
    if (daySelect) {
      for (const option of daySelect.children) option.disabled = +option.dataset.value > days;
      if (parts.day > days) {
        daySelect.dataset.value = parts.day = days;
        daySelect.scrollTop = daySelect.children[days-1].offsetTop - 60;
      }
    }
    for (const track of picker.querySelectorAll('.wheel-track')) for (const option of track.children) option.setAttribute('aria-selected', option.dataset.value===track.dataset.value);
    const type = target.input.type;
    const value = `${parts.year}-${pad(parts.month)}${type==='month'?'':`-${pad(parts.day)}`}${type==='datetime-local'?`T${pad(parts.hour)}:${pad(parts.minute)}`:''}`;
    picker.dataset.value = value;
    const valid = (!target.input.min || value >= target.input.min) && (!target.input.max || value <= target.input.max);
    picker.querySelector('[data-apply]').disabled = !valid;
    picker.querySelector('[data-preview]').textContent = valid ? displayDate(value, type) : `Escolha entre ${displayDate(target.input.min,type)} e ${displayDate(target.input.max,type)}.`;
  }
  picker.addEventListener('change', update);
  picker.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) picker.close();
    if (e.target.closest('[data-apply], [data-clear]')) {
      target.input.value = e.target.closest('[data-clear]') ? '' : picker.dataset.value;
      target.text.value = displayDate(target.input.value, target.input.type); target.text.setCustomValidity('');
      target.input.dispatchEvent(new Event('change', {bubbles:true})); picker.close(); target.text.focus();
    }
  });
  function enhance() {
    document.querySelectorAll('input[type=date], input[type=month], input[type=datetime-local]').forEach(input => {
      if (input.dataset.enhanced) return;
      input.dataset.enhanced = 'true';
      const wrapper = document.createElement('span'); wrapper.className = 'date-control';
      const text = document.createElement('input'); text.type = 'text';
      text.placeholder = input.type==='month'?'mm/aaaa':input.type==='datetime-local'?'dd/mm/aaaa hh:mm':'dd/mm/aaaa';
      text.setAttribute('aria-label', input.getAttribute('aria-label') || input.closest('label')?.firstChild?.textContent?.trim() || 'Data');
      text.value = displayDate(input.value, input.type); text.autocomplete = 'off';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'date-open'; button.textContent = '↕'; button.setAttribute('aria-label','Escolher data por rolagem');
      input.before(wrapper); wrapper.append(text, button, input); input.hidden = true;
      input.addEventListener('invalid', e => { e.preventDefault(); text.setCustomValidity('Preencha uma data válida dentro do período permitido.'); text.reportValidity(); });
      text.addEventListener('input', () => {
        const value = parseDate(text.value, input.type); input.value = value;
        text.setCustomValidity(text.value && (!value || (input.min && value<input.min) || (input.max && value>input.max)) ? 'Informe uma data válida no formato indicado e dentro do período permitido.' : '');
      });
      text.addEventListener('change', () => input.dispatchEvent(new Event('change', {bubbles:true})));
      button.addEventListener('click', () => open(input,text));
    });
  }
  document.addEventListener('date-sync', () => {
    document.querySelectorAll('input[data-enhanced]').forEach(input => {
      input.parentElement.querySelector('input[type=text]').value = displayDate(input.value,input.type);
    });
  });
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true}); enhance();
}
