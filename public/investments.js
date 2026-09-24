import { INVESTMENT_TYPES, ENTRY_TYPES, entrySign, investmentAlerts, localDate } from './investments-model.js';

export function createInvestmentsPanel({ api, icon, escape, cash, parseAmount, amountInput, toast, onRender }) {
  const $ = selector => document.querySelector(selector);
  let records = [], loaded = false, error = '', saving = false, selected = null, refreshId = 0, mutation = null;
  const filters = { search: '', type: 'all', status: 'active' };
  const dateLabel = date => date ? date.split('-').reverse().join('/') : 'Não definido';
  const options = (map, value) => Object.entries(map).map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${escape(label)}</option>`).join('');
  const action = (name, label, symbol, id = '', cls = 'button secondary small', extra = '') => `<button type="button" class="${cls}" data-investment-action="${name}" data-id="${id}" ${extra} aria-label="${escape(label)}">${icon(symbol)}${cls === 'icon-button' ? '' : escape(label)}</button>`;
  const metric = (label, value, hint, featured = false) => `<div class="metric ${featured ? 'featured' : ''}"><div class="metric-top">${label}</div><div class="metric-value">${cash(value)}</div><div class="metric-note">${hint}</div></div>`;
  async function refresh() {
    const id = ++refreshId;
    try { const next = await api('/investments'); if (id === refreshId) { records = next; loaded = true; error = ''; } }
    catch (e) { if (id === refreshId) error = e.message; }
  }
  function render() {
    const due = investmentAlerts(records).filter(a => a.date <= localDate());
    $('#investment-count').textContent = error ? '' : new Set(due.map(a => a.id)).size || '';
    if (error) return `<section class="panel investment-empty" role="alert"><h2>Não foi possível carregar os investimentos</h2><p>${escape(error)}</p>${action('retry', 'Tentar novamente', 'repeat')}</section>`;
    if (!loaded) return '<div class="loading">Carregando sua carteira…</div>';
    const investment = records.find(i => i.id === selected);
    return `<div class="investments-space">${investment ? detail(investment) : portfolio()}</div>`;
  }
  function portfolio() {
    const total = key => records.reduce((sum, i) => sum + i.totals[key], 0);
    return `<div class="investment-intro"><div><span class="investment-eyebrow">SUA CARTEIRA</span><h2>Um lugar para acompanhar o que cresce.</h2><p>Registre os valores, acompanhe os resultados e planeje seu próximo passo.</p></div><span class="investment-manual">${icon('edit')}Atualização manual · em reais</span></div>
      <div class="metrics investment-metrics">${metric('Saldo atual da carteira', total('balance'), 'Conforme os registros de todos os investimentos', true)}${metric('Total aplicado', total('contribution'), 'Soma dos aportes, incluindo os já resgatados')}${metric('Resultado acumulado', total('result'), 'Ganhos − perdas − taxas / impostos')}${metric('Total resgatado', total('withdrawal'), 'Valores retirados dos investimentos')}</div>
      ${alerts()}
      <section class="investment-workspace"><div class="section-toolbar"><div><h2>Meus investimentos</h2><p>${records.filter(i => i.status === 'active').length} ativos · ${records.filter(i => i.status === 'closed').length} encerrados</p></div><span class="investment-scope">Carteira completa · todos os períodos</span></div>
      <div class="investment-filters"><div class="search-box">${icon('search')}<input id="investment-search" class="filter-input" type="search" placeholder="Buscar nome, instituição ou código…" aria-label="Buscar investimentos" value="${escape(filters.search)}"></div><select id="investment-type" class="filter-input" aria-label="Filtrar tipo de investimento"><option value="all">Todos os tipos</option>${options(INVESTMENT_TYPES, filters.type)}</select><select id="investment-status" class="filter-input" aria-label="Filtrar situação do investimento">${options({ active: 'Ativos', closed: 'Encerrados', all: 'Todos os investimentos' }, filters.status)}</select></div>
      <div id="investment-results">${results()}</div></section><p class="investment-footnote">Os registros desta carteira não criam entradas ou saídas em Movimentações. Cotações, juros e impostos não são calculados automaticamente.</p>`;
  }
  function alerts() {
    const items = investmentAlerts(records), day = localDate();
    if (!items.length) return '';
    return `<section class="investment-alerts" aria-label="Revisões e vencimentos próximos"><div class="investment-alert-heading">${icon('calendar')}<h2>Próximos passos</h2><span>Pendências e próximos 7 dias</span></div>${items.map(a => `<button class="investment-alert-row" data-investment-action="open" data-id="${a.id}"><span><strong>${escape(a.name)}</strong><small>${a.label}</small></span><span class="${a.date < day ? 'investment-overdue' : ''}">${a.date < day ? 'Pendente · ' : a.date === day ? 'Hoje · ' : ''}${dateLabel(a.date)} ${icon('arrow')}</span></button>`).join('')}<p>Os avisos aparecem aqui ao acessar o sistema. Ajuste a próxima revisão depois de conferir o investimento.</p></section>`;
  }
  function results() {
    const query = filters.search.trim().toLocaleLowerCase('pt-BR');
    const items = records.filter(i => (filters.status === 'all' || i.status === filters.status) && (filters.type === 'all' || i.type === filters.type) && `${i.name} ${i.institution} ${i.ticker}`.toLocaleLowerCase('pt-BR').includes(query));
    if (!items.length) return `<section class="panel investment-empty">${icon('up')}<h3>${records.length ? 'Nenhum investimento nesta seleção' : 'Sua carteira começa com o primeiro investimento'}</h3><p>${records.length ? 'Altere a busca ou os filtros para encontrar seus registros.' : 'Pode ser uma reserva, uma ação ou outro investimento. Cada um terá seu próprio histórico e suas notas.'}</p>${action(records.length ? 'clear' : 'new', records.length ? 'Limpar filtros' : 'Adicionar investimento', 'plus')}</section>`;
    return `<div class="investment-grid">${items.map(i => `<article class="panel investment-card"><div class="investment-card-top"><span class="category-tag">${INVESTMENT_TYPES[i.type]}</span><span class="pill ${i.status === 'closed' ? 'paid' : ''}">${i.status === 'active' ? 'Ativo' : 'Encerrado'}</span></div><h3><button data-investment-action="open" data-id="${i.id}">${escape(i.name)}</button></h3><p class="investment-institution">${escape(i.institution || 'Instituição não informada')}${i.ticker ? ` · ${escape(i.ticker)}` : ''}</p><span class="investment-label">Saldo atual</span><div class="investment-balance">${cash(i.totals.balance)}</div><div class="investment-result ${i.totals.result < 0 ? 'negative' : 'positive'}"><span>Resultado acumulado</span><strong>${cash(i.totals.result)}</strong></div><dl class="investment-card-dates"><div><dt>Próxima revisão</dt><dd class="${i.status === 'active' && i.review_date && i.review_date <= localDate() ? 'investment-overdue' : ''}">${dateLabel(i.review_date)}</dd></div><div><dt>Vencimento</dt><dd>${dateLabel(i.maturity_date)}</dd></div></dl><div class="investment-card-bottom">${action('open', 'Ver investimento', 'arrow', i.id)}${action('edit', `Editar ${i.name}`, 'edit', i.id, 'icon-button')}</div></article>`).join('')}</div>`;
  }
  function detail(i) {
    const t = i.totals;
    return `<div class="investment-detail-nav">${action('back', 'Voltar à carteira', 'arrow')}<span class="pill">${i.status === 'active' ? 'Ativo' : 'Encerrado'}</span></div><section class="panel investment-detail-head"><div><span class="investment-eyebrow">${INVESTMENT_TYPES[i.type]}</span><h2>${escape(i.name)}</h2><p>${escape(i.institution || 'Instituição não informada')}${i.ticker ? ` · ${escape(i.ticker)}` : ''}</p></div>${action('edit', 'Editar investimento', 'edit', i.id)}</section>
      <div class="metrics investment-metrics">${metric('Saldo atual', t.balance, 'Valor registrado na carteira', true)}${metric('Total aplicado', t.contribution, 'Todos os aportes registrados')}${metric('Resultado acumulado', t.result, 'Ganhos − perdas − taxas / impostos')}${metric('Total resgatado', t.withdrawal, 'Todos os valores retirados')}</div>
      <div class="investment-detail-grid"><section class="panel investment-information"><div class="investment-section-title"><h2>Planejamento e condições</h2>${action('edit', 'Editar condições', 'edit', i.id, 'icon-button')}</div><dl><div><dt>Início do investimento</dt><dd>${dateLabel(i.start_date)}</dd></div><div><dt>Próxima revisão / movimentação</dt><dd class="${i.status === 'active' && i.review_date && i.review_date <= localDate() ? 'investment-overdue' : ''}">${dateLabel(i.review_date)}</dd></div><div><dt>Vencimento</dt><dd>${dateLabel(i.maturity_date)}</dd></div><div><dt>Liquidez / prazo para resgatar</dt><dd>${escape(i.liquidity || 'Não informado')}</dd></div></dl></section>
      <section class="panel investment-information"><div class="investment-section-title"><h2>Minhas notas</h2>${action('edit', 'Editar notas', 'notebook', i.id)}</div><p class="investment-notes">${escape(i.notes || 'Anote sua estratégia, objetivo, taxa contratada, quantidade de cotas ou condições deste investimento.')}</p></section></div>
      <section class="panel investment-history"><div class="investment-history-heading"><div><h2>Histórico do investimento</h2><p>Registre as mudanças de valor e os valores que entram ou saem.</p></div></div>${i.status === 'active' ? `<div class="investment-entry-actions">${Object.entries(ENTRY_TYPES).map(([kind, label]) => action('entry', kind === 'gain' ? 'Registrar ganho' : kind === 'loss' ? 'Registrar perda' : label, kind === 'gain' ? 'up' : kind === 'loss' ? 'down' : kind === 'fee' ? 'bag' : 'arrows', i.id, `button ${kind === 'gain' ? 'primary' : 'secondary'} small`, `data-kind="${kind}"`)).join('')}</div>` : '<p class="investment-footnote">Reabra o investimento em Editar investimento para alterar o histórico.</p>'}
      <div class="investment-breakdown"><span>Ganhos: ${cash(t.gain)}</span><span>Perdas: ${cash(t.loss)}</span><span>Taxas / impostos: ${cash(t.fee)}</span></div>
      ${i.entries.length ? `<div class="table-wrap"><table><thead><tr><th>Movimentação</th><th>Data</th><th class="text-right">Valor</th><th class="text-right">Ações</th></tr></thead><tbody>${i.entries.map(e => `<tr><td><strong>${ENTRY_TYPES[e.kind]}</strong>${e.notes ? `<small class="investment-entry-note">${escape(e.notes)}</small>` : ''}</td><td class="date-cell">${dateLabel(e.date)}</td><td class="amount ${entrySign(e.kind) > 0 ? 'income-text' : 'expense-text'}">${entrySign(e.kind) > 0 ? '+' : '−'} ${cash(e.amount)}</td><td>${i.status === 'active' ? `<div class="row-actions">${action('edit-entry', `Editar ${ENTRY_TYPES[e.kind].toLowerCase()}`, 'edit', i.id, 'icon-button', `data-entry-id="${e.id}"`)}${action('delete-entry', `Excluir ${ENTRY_TYPES[e.kind].toLowerCase()}`, 'trash', i.id, 'icon-button', `data-entry-id="${e.id}"`)}</div>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="investment-empty"><p>Nenhuma movimentação. Registre um aporte para começar.</p></div>'}
      <p class="investment-footnote">Saldo = aportes + ganhos − resgates − perdas − taxas / impostos. Ganhos e perdas representam a variação em reais, não o saldo total do investimento.</p></section>
      <div class="investment-detail-footer"><p>Controle manual em reais. Estes registros não alteram o saldo mensal de Finanças.</p>${action('delete', 'Excluir investimento', 'trash', i.id, 'button secondary small')}</div>`;
  }
  function showModal(title, subtitle, body) {
    $('#investments-modal-content').innerHTML = `<div class="modal-header"><div><h2 id="investments-modal-title">${escape(title)}</h2><p>${escape(subtitle)}</p></div>${action('close', 'Fechar', 'close', '', 'icon-button')}</div><div class="modal-body">${body}</div>`;
    if (!$('#investments-modal').open) $('#investments-modal').showModal();
  }
  const formEnd = label => `<div id="investment-form-error" class="form-error" role="alert" hidden></div><div class="modal-actions">${action('close', 'Cancelar', 'close', '', 'button secondary')}<button type="submit" class="button primary">${label}</button></div>`;
  const dateField = (name, label, value, required = false, max = '2099-12-31') => `<label class="field">${label}<input name="${name}" type="date" min="2000-01-01" max="${max}" value="${escape(value || '')}" ${required ? 'required' : ''}></label>`;
  function edit(i = null) {
    mutation = async values => {
      const saved = await api(`/investments${i ? '/' + i.id : ''}`, { method: i ? 'PUT' : 'POST', body: JSON.stringify({ ...values, ...(!i ? { initial_amount: !values.initial_amount.trim() || /^0+(,0{1,2})?$/.test(values.initial_amount.trim()) ? 0 : parseAmount(values.initial_amount) } : {}) }) });
      selected = saved.id;
    };
    showModal(i ? 'Editar investimento' : 'Adicionar investimento', 'Cada investimento tem seu espaço, suas condições e seu histórico.', `<form id="investment-form">
      <label class="field">Nome do investimento<input name="name" required maxlength="120" placeholder="Ex.: CDB reserva, ações ou Bitcoin" value="${escape(i?.name || '')}" autofocus></label>
      <div class="field-row"><label class="field">Tipo<select name="type">${options(INVESTMENT_TYPES, i?.type || 'fixed')}</select></label><label class="field">Onde está investido (opcional)<input name="institution" maxlength="120" placeholder="Onde está investido" value="${escape(i?.institution || '')}"></label></div>
      <div class="field-row"><label class="field">Código / ticker <span class="field-hint">Opcional</span><input name="ticker" maxlength="40" placeholder="Ex.: PETR4, BTC" value="${escape(i?.ticker || '')}"></label>${dateField('start_date', 'Data inicial', i?.start_date || localDate(), true, localDate())}</div>
      ${!i ? '<label class="field">Aporte inicial (R$)<input name="initial_amount" inputmode="decimal" placeholder="0,00"><span class="field-hint">Opcional. Informe o capital aplicado; registre ganhos e perdas no histórico após salvar.</span></label>' : ''}
      <div class="field-row">${dateField('review_date', 'Data para revisar / mexer novamente', i?.review_date)}${dateField('maturity_date', 'Vencimento (opcional)', i?.maturity_date)}</div>
      <label class="field">Liquidez / condições de resgate <span class="field-hint">Opcional</span><input name="liquidity" maxlength="160" placeholder="Ex.: diária, D+2 ou somente no vencimento" value="${escape(i?.liquidity || '')}"></label>
      <label class="field">Notas e particularidades<textarea name="notes" rows="5" maxlength="10000" placeholder="Objetivo, estratégia, taxa contratada, quantidades, riscos ou algo para lembrar…">${escape(i?.notes || '')}</textarea></label>
      ${i ? `<label class="field">Situação<select name="status">${options({ active: 'Ativo', closed: 'Encerrado' }, i.status)}</select><span class="field-hint">Para encerrar, o saldo deve estar zerado. O histórico será mantido.</span></label>` : ''}
      <p class="field-hint">Controle manual em reais. A carteira tem saldo próprio e não gera lançamentos em Finanças.</p>${formEnd(i ? 'Salvar alterações' : 'Adicionar investimento')}</form>`);
  }
  const entryHints = {
    contribution: 'Dinheiro novo que você aplicou. Aumenta o saldo e o total aplicado.',
    withdrawal: 'Valor que saiu do investimento. Reduz o saldo e aumenta o total resgatado. Se houver rendimento ainda não registrado, registre o ganho antes do resgate.',
    gain: 'Informe apenas o ganho, não o saldo total. Ex.: de R$ 1.000 para R$ 1.050, registre R$ 50. Esse ganho permanece no investimento; se você o retirou, registre também um resgate.',
    loss: 'Informe apenas a redução em reais. Ex.: de R$ 1.000 para R$ 950, registre R$ 50 de perda.',
    fee: 'Taxa ou imposto descontado do próprio investimento. Reduz o saldo e o resultado. Se o ganho informado já é líquido, não registre o mesmo desconto novamente.'
  };
  function entryModal(i, kind = 'contribution', entry = null) {
    mutation = values => api(`/investments/${i.id}/entries${entry ? '/' + entry.id : ''}`, { method: entry ? 'PUT' : 'POST', body: JSON.stringify({ ...values, amount: parseAmount(values.amount) }) });
    showModal(entry ? 'Editar movimentação' : 'Registrar movimentação', i.name, `<form id="investment-form"><label class="field">Tipo de movimentação<select name="kind" id="investment-entry-kind">${options(ENTRY_TYPES, entry?.kind || kind)}</select></label><p id="investment-entry-hint" class="investment-form-explanation">${entryHints[entry?.kind || kind]}</p><p class="field-hint">Saldo atual: ${cash(i.totals.balance)}</p><div class="field-row"><label class="field">Valor (R$)<input name="amount" inputmode="decimal" required placeholder="0,00" value="${amountInput(entry?.amount)}" autofocus></label>${dateField('date', 'Data da movimentação', entry?.date || localDate(), true, localDate())}</div><label class="field">Observação <span class="field-hint">Opcional</span><textarea name="notes" maxlength="1000" placeholder="O que aconteceu neste investimento?">${escape(entry?.notes || '')}</textarea></label>${formEnd(entry ? 'Salvar alterações' : 'Registrar movimentação')}</form>`);
  }
  function confirm(title, message, fn) { mutation = fn; showModal(title, message, `<form id="investment-form">${formEnd('Confirmar exclusão')}</form>`); }
  function close() { if (!saving) $('#investments-modal').close(); }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-investment-action]'); if (!target || saving) return;
    const { investmentAction: name } = target.dataset, id = Number(target.dataset.id), i = records.find(i => i.id === id);
    if (name === 'close') close();
    else if (name === 'new') edit();
    else if (name === 'retry') { await refresh(); onRender(); }
    else if (name === 'back') { selected = null; onRender(); }
    else if (name === 'clear') { filters.search = ''; filters.type = 'all'; filters.status = 'all'; onRender(); }
    else if (name === 'open' && i) { selected = id; onRender(); }
    else if (name === 'edit' && i) edit(i);
    else if (name === 'entry' && i) entryModal(i, target.dataset.kind);
    else if (name === 'edit-entry' && i) { const e = i.entries.find(e => e.id === Number(target.dataset.entryId)); if (e) entryModal(i, e.kind, e); }
    else if (name === 'delete-entry' && i) confirm('Excluir movimentação?', 'O saldo e o resultado serão recalculados. A exclusão só será aceita se mantiver o histórico sem saldo negativo.', () => api(`/investments/${i.id}/entries/${Number(target.dataset.entryId)}`, { method: 'DELETE' }));
    else if (name === 'delete' && i) confirm('Excluir investimento?', `“${i.name}” será removido com todas as suas notas e ${i.entries.length} movimentações. Essa ação não pode ser desfeita.`, async () => { await api(`/investments/${i.id}`, { method: 'DELETE' }); selected = null; });
  });
  document.addEventListener('input', event => { if (event.target.id === 'investment-search') { filters.search = event.target.value; $('#investment-results').innerHTML = results(); } });
  document.addEventListener('change', event => {
    if (event.target.id === 'investment-entry-kind') $('#investment-entry-hint').textContent = entryHints[event.target.value];
    else if (['investment-type', 'investment-status'].includes(event.target.id)) { filters[event.target.id === 'investment-type' ? 'type' : 'status'] = event.target.value; $('#investment-results').innerHTML = results(); }
  });
  $('#investments-modal').addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return;
    const form = event.target, submit = form.querySelector('[type=submit]'); saving = true; submit.disabled = true;
    $('#investment-form-error').hidden = true;
    ++refreshId; // Discard any read that started before this mutation.
    try {
      await mutation(Object.fromEntries(new FormData(form)));
      saving = false; close(); toast('Investimento salvo.');
      await refresh(); onRender();
    } catch (e) { $('#investment-form-error').textContent = e.message; $('#investment-form-error').hidden = false; }
    finally { saving = false; submit.disabled = false; }
  });
  $('#investments-modal').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('#investments-modal').addEventListener('click', event => { if (event.target === $('#investments-modal')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } });
  let observedDate = localDate();
  setInterval(() => { const day = localDate(); if (day !== observedDate) { observedDate = day; if (location.hash === '#investments' && !saving) onRender(); } }, 30000);
  return { render, refresh, agendaError: () => error ? '<p class="form-error">Não foi possível carregar os avisos de investimentos. Recarregue a página.</p>' : '', agenda: () => investmentAlerts(records).filter(a=>a.date<=localDate()).map(a=>({title:a.name,date:a.date,label:a.label,page:'investments'})) };
}
