'use strict';

/* ---------- Données ---------- */

const STORAGE_KEY = 'mon-budget-v1';

const CATEGORIES = [
  ['logement', '🏠 Logement'],
  ['nourriture', '🍲 Nourriture'],
  ['transport', '🚕 Transport'],
  ['factures', '💡 Factures'],
  ['sante', '💊 Santé'],
  ['famille', '👪 Famille'],
  ['loisirs', '🎉 Loisirs'],
  ['epargne', '🏦 Épargne'],
  ['autre', '📦 Autre'],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);

let state = load();
let current = ymOf(new Date());

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && typeof s.months === 'object' && s.months) return s;
  } catch (e) { /* données absentes ou illisibles */ }
  return { version: 1, months: {} };
}

function save() {
  // On ne conserve pas les mois vides.
  for (const [ym, m] of Object.entries(state.months)) {
    if (!m.incomes.length && !m.expenses.length) delete state.months[ym];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function month(ym, create) {
  let m = state.months[ym];
  if (!m) {
    m = { incomes: [], expenses: [] };
    if (create) state.months[ym] = m;
  }
  return m;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Dates et formats ---------- */

function ymOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function shift(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}
function monthName(ym, withYear = true) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR',
    withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
}

const nf = new Intl.NumberFormat('fr-FR');
const num = n => nf.format(n).replace(/[  ]/g, ' ');
const fcfa = n => num(n) + ' FCFA';
const parseAmount = s => {
  const digits = String(s).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : NaN;
};
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Calculs ---------- */

const paid = e => (e.done ? (e.actual ?? e.amount) : 0);
const plannedAmount = e => (e.planned === false ? 0 : e.amount);

function totals(m) {
  const income = m.incomes.reduce((s, i) => s + i.amount, 0);
  const planned = m.expenses.reduce((s, e) => s + plannedAmount(e), 0);
  const spent = m.expenses.reduce((s, e) => s + paid(e), 0);
  // Ce qui reste à payer parmi les dépenses planifiées non cochées.
  const pending = m.expenses.reduce((s, e) => s + (e.done ? 0 : e.amount), 0);
  return { income, planned, spent, pending, left: income - spent };
}

/* ---------- Affichage ---------- */

const $ = id => document.getElementById(id);
const app = $('app');

function render() {
  $('monthLabel').textContent = monthName(current);
  const m = month(current);
  const t = totals(m);
  const isEmpty = !m.incomes.length && !m.expenses.length;
  let html = summaryHtml(t);
  if (isEmpty) html += starterHtml();
  html += incomesHtml(m) + expensesHtml(m);
  if (m.expenses.length) html += categoriesHtml(m);
  app.innerHTML = html;
}

function summaryHtml(t) {
  const pct = t.income > 0 ? Math.min(100, Math.round(t.spent / t.income * 100)) : (t.spent > 0 ? 100 : 0);
  const over = t.left < 0;
  const afterPlan = t.left - t.pending;
  let note = '';
  if (t.pending > 0) {
    note = afterPlan < 0
      ? `<p class="note warn">Il reste ${fcfa(t.pending)} de dépenses planifiées à payer : il manquera ${fcfa(-afterPlan)}.</p>`
      : `<p class="note">Il reste ${fcfa(t.pending)} de dépenses planifiées à payer. Après cela, il vous restera ${fcfa(afterPlan)}.</p>`;
  }
  return `
  <section class="card summary">
    <div class="label">Reste disponible</div>
    <div class="big ${over ? 'neg' : ''}">${num(t.left)} <small>FCFA</small></div>
    <div class="bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="bar-caption">${t.income > 0 ? pct + ' % des entrées dépensés' : 'Aucune entrée pour ce mois'}</div>
    <div class="stats">
      <div class="stat"><span>Entrées</span><b>${num(t.income)}</b></div>
      <div class="stat"><span>Planifié</span><b>${num(t.planned)}</b></div>
      <div class="stat"><span>Dépensé</span><b>${num(t.spent)}</b></div>
    </div>
    ${note}
  </section>`;
}

function starterHtml() {
  const prev = shift(current, -1);
  const pm = state.months[prev];
  if (!pm) {
    return `<section class="card starter"><p>Ce mois est vide. Ajoutez vos entrées, puis planifiez vos dépenses.</p></section>`;
  }
  const left = totals(pm).left;
  return `
  <section class="card starter">
    <p>Ce mois est vide. Vous pouvez repartir de ${esc(monthName(prev, false))}.</p>
    <button class="btn primary block" data-act="copy">Copier le plan de ${esc(monthName(prev, false))}</button>
    ${left > 0 ? `<button class="btn block" data-act="carry">Reporter le reste (${fcfa(left)})</button>` : ''}
  </section>`;
}

function incomesHtml(m) {
  const rows = m.incomes.map(i => `
    <li class="row">
      <button class="body" data-act="edit-income" data-id="${i.id}">
        <span class="txt"><span class="name">${esc(i.label)}</span></span>
        <span class="amt">${num(i.amount)}</span>
      </button>
    </li>`).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Entrées</h2><button class="add-btn" data-act="add-income">+ Ajouter</button></div>
    ${rows ? `<ul class="list">${rows}</ul>` : '<p class="empty">Salaire, ventes, dons reçus…</p>'}
  </section>`;
}

function expensesHtml(m) {
  // Les dépenses à payer d'abord, celles déjà cochées ensuite.
  const sorted = [...m.expenses].sort((a, b) => a.done - b.done);
  const rows = sorted.map(e => {
    const unplanned = e.planned === false;
    let amt = num(e.done ? paid(e) : e.amount);
    if (e.done && !unplanned && e.actual != null && e.actual !== e.amount) {
      const diff = e.actual - e.amount;
      amt += `<small class="${diff > 0 ? 'over' : 'under'}">prévu ${num(e.amount)} (${diff > 0 ? '+' : '−'}${num(Math.abs(diff))})</small>`;
    }
    return `
    <li class="row ${e.done ? 'done' : ''}">
      <button class="tick" role="checkbox" aria-checked="${e.done}" data-act="toggle" data-id="${e.id}"
        aria-label="${e.done ? 'Décocher' : 'Marquer comme payée'} : ${esc(e.label)}"><i>✓</i></button>
      <button class="body" data-act="edit-expense" data-id="${e.id}">
        <span class="txt">
          <span class="name">${esc(e.label)}</span>
          <span class="sub">${esc(CAT_LABEL[e.category] || CAT_LABEL.autre)}${unplanned ? '<span class="tag">imprévu</span>' : ''}</span>
        </span>
        <span class="amt">${amt}</span>
      </button>
    </li>`;
  }).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Dépenses</h2><button class="add-btn" data-act="add-expense">+ Ajouter</button></div>
    ${rows ? `<ul class="list">${rows}</ul>` : '<p class="empty">Planifiez vos dépenses, puis cochez-les une fois payées.</p>'}
  </section>`;
}

function categoriesHtml(m) {
  const by = {};
  for (const e of m.expenses) {
    const c = CAT_LABEL[e.category] ? e.category : 'autre';
    by[c] = by[c] || { planned: 0, spent: 0 };
    by[c].planned += plannedAmount(e);
    by[c].spent += paid(e);
  }
  const rows = CATEGORIES.filter(([k]) => by[k]).map(([k, label]) => {
    const { planned, spent } = by[k];
    const over = spent > planned;
    const pct = planned > 0 ? Math.min(100, Math.round(spent / planned * 100)) : (spent > 0 ? 100 : 0);
    return `
    <div class="cat">
      <div class="cat-top"><span>${esc(label)}</span><span>${num(spent)} / ${num(planned)}</span></div>
      <div class="bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Par catégorie</h2><span class="bar-caption">dépensé / planifié</span></div>
    ${rows}
  </section>`;
}

/* ---------- Formulaire d'ajout / modification ---------- */

const dlg = $('itemDialog');
let editing = null; // { kind: 'income' | 'expense', id: string | null }

$('fCategory').innerHTML = CATEGORIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

function openItem(kind, id) {
  editing = { kind, id };
  const m = month(current);
  const item = id ? (kind === 'income' ? m.incomes : m.expenses).find(x => x.id === id) : null;
  const isExpense = kind === 'expense';
  const unplanned = item && item.planned === false;

  $('itemTitle').textContent = (item ? 'Modifier ' : 'Nouvelle ') + (isExpense ? (item ? 'la dépense' : 'dépense') : (item ? "l'entrée" : 'entrée'));
  $('fLabel').value = item ? item.label : '';
  $('fAmount').value = item ? item.amount : '';
  $('expenseFields').hidden = !isExpense;
  $('fCategory').value = item && CAT_LABEL[item.category] ? item.category : 'autre';
  $('fDone').checked = !!(item && item.done);
  $('fDoneLabel').textContent = item ? 'Payée' : 'Déjà payée (dépense imprévue)';
  $('fActual').value = item && item.actual != null ? item.actual : '';
  $('fDelete').hidden = !item;
  $('fError').hidden = true;
  dlg.dataset.unplanned = unplanned ? '1' : '';
  syncActual();
  dlg.showModal();
  if (!item) $('fLabel').focus();
}

function syncActual() {
  const isExpense = editing && editing.kind === 'expense';
  const unplanned = dlg.dataset.unplanned === '1';
  // Le montant réel n'a de sens que pour une dépense planifiée déjà enregistrée et payée.
  $('fActualWrap').hidden = !(isExpense && editing.id && !unplanned && $('fDone').checked);
  $('fAmountLabel').textContent = isExpense && !unplanned && (editing.id || !$('fDone').checked) ? 'Montant prévu' : 'Montant';
}
$('fDone').addEventListener('change', syncActual);

$('itemForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const label = $('fLabel').value.trim();
  const amount = parseAmount($('fAmount').value);
  const fail = msg => { $('fError').textContent = msg; $('fError').hidden = false; };
  if (!label) return fail('Indiquez un libellé.');
  if (!(amount > 0)) return fail('Indiquez un montant supérieur à 0.');

  const m = month(current, true);
  if (editing.kind === 'income') {
    const item = editing.id && m.incomes.find(x => x.id === editing.id);
    if (item) Object.assign(item, { label, amount });
    else m.incomes.push({ id: uid(), label, amount });
  } else {
    const done = $('fDone').checked;
    const category = $('fCategory').value;
    const item = editing.id && m.expenses.find(x => x.id === editing.id);
    if (item) {
      let actual = null;
      if (done && item.planned !== false && $('fActual').value.trim() !== '') {
        actual = parseAmount($('fActual').value);
        if (!(actual >= 0)) return fail('Le montant réellement payé est invalide.');
        if (actual === amount) actual = null;
      }
      Object.assign(item, { label, amount, category, done, actual });
    } else {
      // Une dépense saisie comme « déjà payée » n'était pas planifiée.
      m.expenses.push({ id: uid(), label, amount, category, done, actual: null, planned: !done });
    }
  }
  save();
  dlg.close();
  render();
});

$('fCancel').addEventListener('click', () => dlg.close());
$('fDelete').addEventListener('click', () => {
  if (!confirm('Supprimer cette ligne ?')) return;
  const m = month(current);
  const key = editing.kind === 'income' ? 'incomes' : 'expenses';
  m[key] = m[key].filter(x => x.id !== editing.id);
  save();
  dlg.close();
  render();
});

/* ---------- Actions ---------- */

app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  if (act === 'add-income') openItem('income', null);
  else if (act === 'add-expense') openItem('expense', null);
  else if (act === 'edit-income') openItem('income', id);
  else if (act === 'edit-expense') openItem('expense', id);
  else if (act === 'toggle') toggle(id);
  else if (act === 'copy') copyPrevious();
  else if (act === 'carry') carryPrevious();
});

function toggle(id) {
  const e = month(current).expenses.find(x => x.id === id);
  if (!e) return;
  e.done = !e.done;
  if (!e.done) e.actual = null;
  save();
  render();
  toast(e.done
    ? `${fcfa(e.amount)} déduits. Touchez la ligne si le montant payé est différent.`
    : 'Dépense décochée.');
}

function copyPrevious() {
  const prev = shift(current, -1);
  const pm = state.months[prev];
  if (!pm) return toast(`Rien à copier : ${monthName(prev)} est vide.`);
  const m = month(current);
  if ((m.incomes.length || m.expenses.length) &&
      !confirm(`Ajouter le plan de ${monthName(prev)} aux lignes déjà présentes ?`)) return;
  const target = month(current, true);
  for (const i of pm.incomes) {
    if (i.carried) continue; // un report n'est pas une entrée récurrente
    target.incomes.push({ id: uid(), label: i.label, amount: i.amount });
  }
  for (const e of pm.expenses) {
    if (e.planned === false) continue; // les imprévus ne font pas partie du plan
    target.expenses.push({ id: uid(), label: e.label, amount: e.amount, category: e.category, done: false, actual: null, planned: true });
  }
  save();
  render();
  toast(`Plan de ${monthName(prev, false)} copié.`);
}

function carryPrevious() {
  const prev = shift(current, -1);
  const pm = state.months[prev];
  const left = pm ? totals(pm).left : 0;
  if (!(left > 0)) return toast(`Aucun reste à reporter depuis ${monthName(prev)}.`);
  const m = month(current, true);
  const existing = m.incomes.find(i => i.carried);
  if (existing) existing.amount = left;
  else m.incomes.unshift({ id: uid(), label: `Report de ${monthName(prev, false)}`, amount: left, carried: true });
  save();
  render();
  toast(`${fcfa(left)} reportés.`);
}

/* ---------- Navigation ---------- */

$('prev').addEventListener('click', () => { current = shift(current, -1); render(); });
$('next').addEventListener('click', () => { current = shift(current, 1); render(); });
$('monthLabel').addEventListener('click', () => { current = ymOf(new Date()); render(); });

/* ---------- Menu, export, import ---------- */

const menu = $('menuDialog');
$('menuBtn').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', ev => {
  if (ev.target === menu) return menu.close(); // clic sur le fond
  const b = ev.target.closest('[data-menu]');
  if (!b) return;
  const a = b.dataset.menu;
  if (a === 'import') return $('importFile').click();
  menu.close();
  if (a === 'copy') copyPrevious();
  else if (a === 'carry') carryPrevious();
  else if (a === 'export') exportData();
  else if (a === 'clear') clearMonth();
});
dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); });

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mon-budget-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Sauvegarde exportée.');
}

function validImport(d) {
  if (!d || typeof d.months !== 'object' || !d.months) return false;
  return Object.entries(d.months).every(([ym, m]) =>
    /^\d{4}-\d{2}$/.test(ym) && m && Array.isArray(m.incomes) && Array.isArray(m.expenses) &&
    [...m.incomes, ...m.expenses].every(x => x && typeof x.label === 'string' && Number.isFinite(x.amount)));
}

$('importFile').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  menu.close();
  if (!validImport(data)) return toast("Ce fichier n'est pas une sauvegarde valide.");
  const n = Object.keys(data.months).length;
  if (!confirm(`Remplacer toutes les données actuelles par cette sauvegarde (${n} mois) ?`)) return;
  for (const m of Object.values(data.months)) {
    for (const x of [...m.incomes, ...m.expenses]) if (!x.id) x.id = uid();
  }
  state = { version: 1, months: data.months };
  save();
  render();
  toast('Sauvegarde importée.');
});

function clearMonth() {
  if (!state.months[current]) return toast('Ce mois est déjà vide.');
  if (!confirm(`Supprimer toutes les lignes de ${monthName(current)} ?`)) return;
  delete state.months[current];
  save();
  render();
}

/* ---------- Divers ---------- */

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Demande au navigateur de ne pas effacer les données en cas de manque d'espace.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

render();
