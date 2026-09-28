import { STATUSES, PRIORITIES, localDay, localMinute, overdue, dueReminder, matchesPeriod, sortNotes } from './notes-model.js';

export function createNotesPanel({ api, icon, escape, toast, onRender }) {
  let records = [], loaded = false, error = '', saving = false, editing = null, refreshId = 0;
  const filters = { view: 'board', search: '', period: 'all', priority: 'all', category: 'all' };
  const $ = selector => document.querySelector(selector);
  const active = () => location.hash === '#notes';
  const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const dateTime = value => `${formatDate(value.slice(0, 10))} às ${value.slice(11)}`;
  const selectOptions = (options, value) => Object.entries(options).map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('');
  const action = (name, label, symbol, id = '', cls = 'icon-button') => `<button type="button" class="${cls}" data-note-action="${name}" data-id="${id}" aria-label="${escape(label)}" title="${escape(label)}">${icon(symbol)}${cls.includes('button ') ? escape(label) : ''}</button>`;
  async function refresh() {
    if (saving) return;
    const id = ++refreshId;
    try { const next = await api('/notes'); if (id === refreshId) { records = next; loaded = true; error = ''; } }
    catch (e) { if (id === refreshId) error = e.message; }
  }
  function render() {
    if (error) return `<section class="panel notes-error" role="alert"><h2>Não foi possível carregar as anotações</h2><p>${escape(error)}</p>${action('retry', 'Tentar novamente', 'repeat', '', 'button secondary')}</section>`;
    if (!loaded) return '<div class="loading">Carregando seu espaço…</div>';
    const tasks = records.filter(n => n.kind !== 'note'), done = tasks.filter(n => n.status === 'done').length;
    const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const categories = [...new Set(records.map(n => n.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return `<section class="notes-overview" aria-label="Resumo das tarefas">
      <div class="notes-intro"><h2>Tarefas</h2><div class="notes-progress"><span>${done} de ${tasks.length} tarefas concluídas</span><strong>${percent}%</strong><progress value="${percent}" max="100" aria-label="Progresso das tarefas"></progress></div></div>
      <div class="notes-summary"><div>${icon('calendar')}<strong>${tasks.filter(n => matchesPeriod(n, 'today')).length}</strong><span>Para hoje</span></div><div>${icon('clock')}<strong>${tasks.filter(n => n.status === 'doing').length}</strong><span>Em andamento</span></div><div class="${tasks.some(n => overdue(n)) ? 'has-overdue' : ''}">${icon('flag')}<strong>${tasks.filter(n => overdue(n)).length}</strong><span>Em atraso</span></div></div>
    </section><div id="notes-reminders">${reminders()}</div>
    <section class="notes-workspace" aria-label="Anotações e tarefas"><div class="notes-toolbar"><div class="notes-views" aria-label="Visualização">${[['board', 'Quadro', 'grid'], ['list', 'Lista', 'list'], ['notebook', 'Caderno', 'notebook']].map(([key, label, symbol]) => `<button class="${filters.view === key ? 'selected' : ''}" data-note-action="view" data-view="${key}" aria-pressed="${filters.view === key}">${icon(symbol)}${label}${key === 'notebook' ? `<span>${records.filter(n => n.kind === 'note').length}</span>` : ''}</button>`).join('')}</div><span class="notes-total">${records.length} ${records.length === 1 ? 'registro' : 'registros'}</span></div>
    <div class="notes-filters"><div class="search-box">${icon('search')}<input id="notes-search" class="filter-input" type="search" placeholder="Buscar título, anotação ou checklist…" aria-label="Buscar anotações" value="${escape(filters.search)}"></div><select id="notes-category" class="filter-input" aria-label="Filtrar categoria"><option value="all">Todas as categorias</option>${categories.map(c => `<option value="${escape(c)}" ${filters.category === c ? 'selected' : ''}>${escape(c)}</option>`).join('')}</select><select id="notes-priority" class="filter-input" aria-label="Filtrar prioridade"><option value="all">Todas as prioridades</option>${selectOptions(PRIORITIES, filters.priority)}</select></div>
    <div class="notes-periods" ${filters.view === 'notebook' ? 'hidden' : ''}>${[['all', 'Todas'], ['today', 'Hoje'], ['week', 'Próximos 7 dias'], ['overdue', 'Atrasadas']].map(([key, label]) => `<button data-note-action="period" data-period="${key}" class="${filters.period === key ? 'selected' : ''}" aria-pressed="${filters.period === key}">${label}</button>`).join('')}</div><div id="notes-results">${results()}</div></section>
    `;
  }
  function reminders() {
    const due = records.filter(n => dueReminder(n));
    return due.length ? `<section class="notes-reminder-banner" aria-label="Lembretes pendentes" role="status"><div class="reminder-heading">${icon('bell')}<strong>${due.length === 1 ? 'Você tem um lembrete' : `Você tem ${due.length} lembretes`}</strong><span>Horário local · avisos enquanto a plataforma estiver aberta</span></div>${due.map(n => `<div class="reminder-row"><button data-note-action="edit" data-id="${n.id}">${escape(n.title)}<small>${dateTime(n.reminder_at)}</small></button>${action('seen', 'Marcar lembrete como visto', 'check', n.id)}</div>`).join('')}</section>` : '';
  }
  function results() {
    const query = filters.search.trim().toLocaleLowerCase('pt-BR');
    const items = sortNotes(records.filter(n => (filters.view === 'notebook' ? n.kind === 'note' : n.kind !== 'note') && (filters.category === 'all' || n.category === filters.category) && (filters.priority === 'all' || n.priority === filters.priority) && (filters.view === 'notebook' || matchesPeriod(n, filters.period)) && `${n.title} ${n.content} ${n.category} ${n.checklist.map(c => c.text).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query)));
    const hasFilter = query || filters.category !== 'all' || filters.priority !== 'all' || (filters.view !== 'notebook' && filters.period !== 'all');
    const empty = `<div class="notes-empty">${icon(filters.view === 'notebook' ? 'notebook' : 'spark')}<h3>${hasFilter ? 'Nenhum resultado' : filters.view === 'notebook' ? 'Nenhuma anotação cadastrada' : 'Nenhuma tarefa cadastrada'}</h3><p>${hasFilter ? 'Experimente outra busca ou limpe os filtros.' : filters.view === 'notebook' ? 'Adicione uma anotação.' : 'Adicione uma tarefa e defina o prazo.'}</p>${action(hasFilter ? 'clear' : filters.view === 'notebook' ? 'new-note' : 'new-task', hasFilter ? 'Limpar filtros' : filters.view === 'notebook' ? 'Criar anotação' : 'Criar primeira tarefa', 'plus', '', 'button secondary')}</div>`;
    if (filters.view === 'board') return `<div class="notes-board">${Object.entries(STATUSES).map(([status, label]) => { const group = items.filter(n => n.status === status); return `<section class="notes-column ${status}" aria-label="${label}"><div class="notes-column-heading"><h2><i></i>${label}<span>${group.length}</span></h2>${action('new-task', `Adicionar em ${label}`, 'plus', status)}</div><div class="notes-column-body">${group.map(card).join('') || `<div class="column-empty">${icon(status === 'done' ? 'check' : status === 'doing' ? 'clock' : 'plus')}<p>${status === 'done' ? 'Nenhuma tarefa concluída.' : status === 'doing' ? 'Nenhuma tarefa em andamento.' : 'Nenhuma tarefa pendente.'}</p></div>`}</div></section>`; }).join('')}</div>${items.length ? '' : empty}`;
    return items.length ? `<div class="${filters.view === 'notebook' ? 'notes-notebook' : 'notes-list'}">${items.map(card).join('')}</div>` : empty;
  }
  function card(n) {
    const checked = n.checklist.filter(c => c.done).length;
    return `<article class="note-card ${n.status === 'done' && n.kind !== 'note' ? 'is-done' : ''} ${n.pinned ? 'is-pinned' : ''}"><div class="note-card-top"><div class="note-tags"><span class="note-priority ${n.priority}"><i></i>${PRIORITIES[n.priority]}</span>${n.kind === 'reminder' ? `<span class="note-kind">${icon('bell')}Lembrete</span>` : ''}</div><div class="row-actions">${action('pin', n.pinned ? 'Desafixar' : 'Fixar no topo', 'pin', n.id)}${action('edit', `Editar ${n.title}`, 'edit', n.id)}</div></div>
      <button class="note-title" data-note-action="edit" data-id="${n.id}">${escape(n.title)}</button>${n.category ? `<span class="note-category">${escape(n.category)}</span>` : ''}${n.content ? `<p class="note-excerpt">${escape(n.content)}</p>` : ''}
      ${n.checklist.length ? `<div class="note-checklist"><div class="checklist-heading"><span>Checklist</span><span>${checked}/${n.checklist.length}</span></div><progress value="${checked}" max="${n.checklist.length}" aria-label="Checklist de ${escape(n.title)}"></progress>${n.checklist.slice(0, 4).map((item, i) => `<label class="note-check ${item.done ? 'checked' : ''}"><input type="checkbox" data-note-check="${n.id}" data-index="${i}" ${item.done ? 'checked' : ''}><span>${escape(item.text)}</span></label>`).join('')}${n.checklist.length > 4 ? `<button class="link-button" data-note-action="edit" data-id="${n.id}">Ver mais ${n.checklist.length - 4} itens</button>` : ''}</div>` : ''}
      <div class="note-dates">${n.scheduled_date ? `<span>${icon('calendar')}Fazer ${formatDate(n.scheduled_date)}</span>` : ''}${n.due_date ? `<span class="${overdue(n) ? 'overdue-date' : ''}">${icon('flag')}${overdue(n) ? 'Atrasada · ' : 'Até '}${formatDate(n.due_date)}</span>` : ''}${n.reminder_at ? `<span>${icon('bell')}${dateTime(n.reminder_at)}${n.reminder_seen ? ' · visto' : ''}</span>` : ''}</div>
      <div class="note-card-footer">${n.kind !== 'note' ? `<select data-note-status="${n.id}" aria-label="Status de ${escape(n.title)}">${selectOptions(STATUSES, n.status)}</select>${action(n.status === 'done' ? 'reopen' : 'complete', n.status === 'done' ? 'Reabrir' : 'Concluir', n.status === 'done' ? 'repeat' : 'check', n.id, 'button secondary small')}` : `<span>Atualizada em ${formatDate(localDay(new Date(n.updated_at)))}</span>${action('delete', `Excluir ${n.title}`, 'trash', n.id)}`}</div></article>`;
  }
  function modal(kind = 'task', note = null, status = 'todo') {
    editing = note;
    const n = note || { kind, status, priority: 'medium', title: '', content: '', checklist: [] };
    $('#notes-modal-content').innerHTML = `<div class="modal-header"><div><h2 id="notes-modal-title">${note ? 'Editar registro' : kind === 'note' ? 'Nova anotação' : kind === 'reminder' ? 'Novo lembrete' : 'Nova tarefa'}</h2></div>${action('close', 'Fechar', 'close')}</div><div class="modal-body"><form id="note-form"><div class="note-form-grid"><label class="field">Tipo<select name="kind" id="note-kind">${selectOptions({ task: 'Tarefa', reminder: 'Lembrete', note: 'Anotação livre' }, n.kind)}</select></label><label class="field">Prioridade<select name="priority">${selectOptions(PRIORITIES, n.priority)}</select></label></div><label class="field">Título<input name="title" required maxlength="160" autofocus placeholder="O que você quer fazer ou lembrar?" value="${escape(n.title)}"></label><label class="field">Anotações<textarea name="content" maxlength="20000" rows="5" placeholder="Texto da anotação">${escape(n.content)}</textarea></label><div class="note-form-grid"><label class="field">Categoria <span class="field-hint">Opcional</span><input name="category" maxlength="60" list="note-categories" placeholder="Ex.: pessoal, trabalho, estudos" value="${escape(n.category || '')}"><datalist id="note-categories">${[...new Set(['Pessoal', 'Trabalho', 'Estudos', ...records.map(r => r.category).filter(Boolean)])].map(c => `<option value="${escape(c)}">`).join('')}</datalist></label><label class="field" id="note-status-field">Status<select name="status">${selectOptions(STATUSES, n.status)}</select></label></div>
      <div id="note-schedule"><div class="note-form-grid"><label class="field">Dia que vou fazer<input type="date" name="scheduled_date" min="2000-01-01" max="2099-12-31" value="${n.scheduled_date || ''}"></label><label class="field">Prazo final<input type="date" name="due_date" min="2000-01-01" max="2099-12-31" value="${n.due_date || ''}"></label></div><label class="field">Lembrar em<input type="datetime-local" name="reminder_at" min="2000-01-01T00:00" max="2099-12-31T23:59" value="${n.reminder_at || ''}"><span class="field-hint">O aviso aparece na plataforma enquanto ela estiver aberta ou na próxima vez que você acessar. Usa o horário deste computador.</span></label></div>
      <label class="field">Checklist <span class="field-hint">Um passo por linha · até 50 itens</span><textarea name="checklist" rows="3" placeholder="Pesquisar referências&#10;Separar os materiais&#10;Começar o primeiro passo">${escape(n.checklist.map(c => c.text).join('\n'))}</textarea></label><label class="note-pin-field"><input name="pinned" type="checkbox" ${n.pinned ? 'checked' : ''}>${icon('pin')} Fixar no topo</label><div id="note-form-error" class="form-error" role="alert" hidden></div><div class="modal-actions">${note ? action('delete', 'Excluir', 'trash', note.id, 'button danger') : ''}<button type="button" class="button secondary" data-note-action="close">Cancelar</button><button type="submit" class="button primary">${note ? 'Salvar alterações' : 'Salvar registro'}</button></div></form></div>`;
    toggleKind(); $('#notes-modal').showModal();
  }
  function toggleKind() {
    const form = $('#note-form'), isNote = form.elements.kind.value === 'note';
    $('#note-schedule').hidden = isNote; $('#note-status-field').hidden = isNote;
    for (const name of ['scheduled_date', 'due_date', 'reminder_at']) form.elements[name].disabled = isNote;
    form.elements.reminder_at.required = form.elements.kind.value === 'reminder';
  }
  function redraw() { if (active() || location.hash === '#overview' || !location.hash) onRender(); }
  function redrawResults() { if ($('#notes-results')) $('#notes-results').innerHTML = results(); }
  async function update(n, changes) {
    if (saving) return false;
    saving = true; ++refreshId;
    try {
      const next = await api(`/notes/${n.id}`, { method: 'PUT', body: JSON.stringify({ ...n, ...changes }) });
      records = records.map(r => r.id === n.id ? next : r); redraw(); return true;
    } catch (e) { toast(e.message, true); redraw(); return false; }
    finally { saving = false; }
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-note-action]'); if (!button || saving) return;
    const name = button.dataset.noteAction, n = records.find(r => r.id === Number(button.dataset.id));
    if (name === 'close') $('#notes-modal').close();
    else if (name === 'new-task') modal('task', null, STATUSES[button.dataset.id] ? button.dataset.id : 'todo');
    else if (name === 'new-note') modal('note');
    else if (name === 'new-reminder') modal('reminder');
    else if (name === 'edit' && n) modal(n.kind, n);
    else if (name === 'pin' && n) await update(n, { pinned: !n.pinned });
    else if (name === 'complete' && n) { if (await update(n, { status: 'done' })) toast('Mais uma conquista! Tarefa concluída.'); }
    else if (name === 'reopen' && n) await update(n, { status: 'todo' });
    else if (name === 'seen' && n) await update(n, { reminder_seen: true });
    else if (name === 'view') { filters.view = button.dataset.view; redraw(); }
    else if (name === 'period') { filters.period = button.dataset.period; redraw(); }
    else if (name === 'clear') { Object.assign(filters, { search: '', priority: 'all', category: 'all', period: 'all' }); redraw(); }
    else if (name === 'retry') { await refresh(); redraw(); }
    else if (name === 'delete' && n) {
      if ($('#notes-modal').open) $('#notes-modal').close();
      $('#notes-modal-content').innerHTML = `<div class="modal-header"><div><h2 id="notes-modal-title">Excluir registro?</h2><p>“${escape(n.title)}” será removido. Esta ação não pode ser desfeita.</p></div></div><div class="modal-body"><div id="note-delete-error" class="form-error" role="alert" hidden></div><div class="modal-actions"><button class="button secondary" data-note-action="close">Cancelar</button><button class="button danger" data-note-action="confirm-delete" data-id="${n.id}">Excluir registro</button></div></div>`;
      $('#notes-modal').showModal();
    } else if (name === 'confirm-delete' && n) {
      saving = true; ++refreshId; button.disabled = true;
      try { await api(`/notes/${n.id}`, { method: 'DELETE' }); records = records.filter(r => r.id !== n.id); $('#notes-modal').close(); redraw(); toast('Registro excluído.'); }
      catch (e) { $('#note-delete-error').textContent = e.message; $('#note-delete-error').hidden = false; }
      finally { saving = false; button.disabled = false; }
    }
  });
  document.addEventListener('input', event => { if (event.target.id === 'notes-search') { filters.search = event.target.value; redrawResults(); } });
  document.addEventListener('change', async event => {
    const el = event.target;
    if (el.id === 'notes-category' || el.id === 'notes-priority') { filters[el.id === 'notes-category' ? 'category' : 'priority'] = el.value; redrawResults(); }
    else if (el.id === 'note-kind') toggleKind();
    else if (el.dataset.noteStatus || el.dataset.noteCheck) {
      const n = records.find(r => r.id === Number(el.dataset.noteStatus || el.dataset.noteCheck)); if (!n) return;
      if (saving) { if (el.dataset.noteStatus) el.value = n.status; else el.checked = n.checklist[Number(el.dataset.index)].done; return; }
      el.disabled = true;
      await update(n, el.dataset.noteStatus ? { status: el.value } : { checklist: n.checklist.map((c, i) => i === Number(el.dataset.index) ? { ...c, done: el.checked } : c) });
    }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'note-form') return;
    event.preventDefault(); if (saving) return;
    const form = event.target, values = Object.fromEntries(new FormData(form)), submit = form.querySelector('[type="submit"]');
    const oldItems = [...(editing?.checklist || [])];
    const checklist = values.checklist.split('\n').map(s => s.trim()).filter(Boolean).map(text => { const index = oldItems.findIndex(c => c.text === text); return { text, done: index < 0 ? false : oldItems.splice(index, 1)[0].done }; });
    const payload = { ...values, pinned: values.pinned === 'on', reminder_seen: editing?.reminder_seen || false, checklist };
    if (values.kind === 'note') Object.assign(payload, { status: 'todo', scheduled_date: null, due_date: null, reminder_at: null, reminder_seen: false });
    saving = true; ++refreshId; submit.disabled = true; $('#note-form-error').hidden = true;
    try {
      const next = await api(`/notes${editing ? '/' + editing.id : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      records = editing ? records.map(r => r.id === editing.id ? next : r) : [next, ...records];
      filters.view = next.kind === 'note' ? 'notebook' : filters.view === 'notebook' ? 'board' : filters.view;
      Object.assign(filters, { search: '', priority: 'all', category: 'all', period: 'all' });
      $('#notes-modal').close(); redraw(); toast('Registro salvo neste computador.');
    } catch (e) { $('#note-form-error').textContent = e.message; $('#note-form-error').hidden = false; }
    finally { saving = false; submit.disabled = false; }
  });
  $('#notes-modal').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  let day = localDay(), minute = localMinute();
  function tick() {
    if (document.hidden || !active() || saving) return;
    const nextDay = localDay(), nextMinute = localMinute();
    if (day !== nextDay) { day = nextDay; redraw(); }
    if (minute !== nextMinute) { minute = nextMinute; if ($('#notes-reminders')) $('#notes-reminders').innerHTML = reminders(); }
  }
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', tick);
  return { refresh, render,
    agendaError: () => error ? '<p class="form-error">Não foi possível carregar os lembretes. Recarregue a página.</p>' : '',
    agenda: () => records.filter(n=>n.status!=='done').flatMap(n=>{
      const dates = [n.scheduled_date,n.due_date,n.reminder_at && (!n.reminder_seen || n.reminder_at.slice(0,10)===localDay()) ? n.reminder_at : null].filter(Boolean);
      const date = dates.find(d=>d.slice(0,10)===localDay()) || dates.filter(d=>d.slice(0,10)<localDay()).sort()[0];
      return date ? [{title:n.title,date,page:'notes',label:n.kind==='reminder'?'Lembrete':n.kind==='task'?'Tarefa':'Anotação'}] : [];
    })
  };
}
