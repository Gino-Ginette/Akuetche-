'use strict';

/* ---------- Catégories ---------- */

// h = teinte de la pastille d'icône.
const EXPENSE_CATS = [
  { id: 'nourriture', icon: '🍲', label: 'Alimentation', h: 28 },
  { id: 'logement', icon: '🏠', label: 'Logement', h: 205 },
  { id: 'transport', icon: '🚕', label: 'Transport', h: 48 },
  { id: 'factures', icon: '💡', label: 'Factures', h: 55 },
  { id: 'communication', icon: '📱', label: 'Crédit & internet', h: 230 },
  { id: 'sante', icon: '💊', label: 'Santé', h: 350 },
  { id: 'education', icon: '🎓', label: 'Éducation', h: 260 },
  { id: 'famille', icon: '👪', label: 'Aide familiale', h: 320 },
  { id: 'habillement', icon: '👗', label: 'Habillement', h: 290 },
  { id: 'loisirs', icon: '🎉', label: 'Loisirs', h: 15 },
  { id: 'vacances', icon: '🏖️', label: 'Vacances', h: 190 },
  { id: 'tontine', icon: '🤝', label: 'Tontine', h: 140 },
  { id: 'cadeau', icon: '🎁', label: 'Cadeau', h: 335 },
  { id: 'epargne', icon: '🏦', label: 'Épargne', h: 165 },
  { id: 'autre', icon: '📦', label: 'Autres', h: 30 },
];
const INCOME_CATS = [
  { id: 'salaire', icon: '💼', label: 'Salaire', h: 165 },
  { id: 'commerce', icon: '🛍️', label: 'Commerce', h: 28 },
  { id: 'prime', icon: '🏅', label: 'Prime', h: 48 },
  { id: 'don', icon: '🎁', label: 'Don reçu', h: 335 },
  { id: 'tontine', icon: '🤝', label: 'Tontine', h: 140 },
  { id: 'remboursement', icon: '↩️', label: 'Remboursement', h: 230 },
  { id: 'report', icon: '📅', label: 'Report', h: 205, hidden: true },
  { id: 'autre', icon: '💰', label: 'Autres', h: 90 },
];
const ICON_CHOICES = ['🛒', '🍽️', '☕', '⛽', '🏍️', '🚌', '✈️', '🔧', '💧', '💻', '📚', '👶', '🏥', '⛪',
  '💇', '👟', '⚽', '🎵', '🐔', '🌾', '🐶', '🏋️', '💍', '🧾', '💰', '💼', '🛍️', '⭐'];

/* ---------- Données ---------- */

const STORAGE_KEY = 'mon-budget-v1';

let state = load();
let current = ymOf(new Date());

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && typeof s.months === 'object' && s.months) {
      if (!Array.isArray(s.cats)) s.cats = [];
      // Entrées créées avant l'arrivée des catégories : on déduit la catégorie du libellé.
      for (const m of Object.values(s.months)) {
        for (const i of m.incomes || []) {
          if (i.category) continue;
          const c = INCOME_CATS.find(c => i.label.trim().toLowerCase().startsWith(c.label.toLowerCase()));
          if (c) i.category = c.id;
        }
      }
      return s;
    }
  } catch (e) { /* données absentes ou illisibles */ }
  return { version: 1, months: {}, cats: [] };
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

function hueOf(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// Catégories prédéfinies suivies des catégories personnelles, « Autres » en dernier.
function cats(kind) {
  const base = kind === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const custom = state.cats.filter(c => c.kind === kind).map(c => ({ ...c, h: hueOf(c.id), custom: true }));
  return [...base.slice(0, -1), ...custom, base[base.length - 1]];
}
function catOf(kind, id) {
  const list = cats(kind);
  return list.find(c => c.id === id) || list[list.length - 1];
}

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
const ico = c => `<span class="ico" style="--h:${c.h}" aria-hidden="true">${esc(c.icon)}</span>`;

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
  <section class="summary">
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
  const rows = m.incomes.map(i => {
    const c = catOf('income', i.carried ? 'report' : i.category);
    return `
    <li class="row">
      <button class="body" data-act="edit-income" data-id="${i.id}">
        ${ico(c)}
        <span class="txt">
          <span class="name">${esc(i.label)}</span>
          ${i.label !== c.label ? `<span class="sub">${esc(c.label)}</span>` : ''}
        </span>
        <span class="amt">${num(i.amount)}</span>
      </button>
    </li>`;
  }).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Entrées</h2><button class="add-btn" data-act="add-income">+ Ajouter</button></div>
    ${rows ? `<ul class="list">${rows}</ul>` : '<p class="empty">Salaire, commerce, dons reçus…</p>'}
  </section>`;
}

function expensesHtml(m) {
  // Les dépenses à payer d'abord, celles déjà cochées ensuite.
  const sorted = [...m.expenses].sort((a, b) => a.done - b.done);
  const rows = sorted.map(e => {
    const c = catOf('expense', e.category);
    const unplanned = e.planned === false;
    let amt = num(e.done ? paid(e) : e.amount);
    if (e.done && !unplanned && e.actual != null && e.actual !== e.amount) {
      const diff = e.actual - e.amount;
      amt += `<small class="${diff > 0 ? 'over' : 'under'}">prévu ${num(e.amount)} (${diff > 0 ? '+' : '−'}${num(Math.abs(diff))})</small>`;
    }
    const sub = (e.label !== c.label ? esc(c.label) : '') + (unplanned ? '<span class="tag">imprévu</span>' : '');
    return `
    <li class="row ${e.done ? 'done' : ''}">
      <button class="tick" role="checkbox" aria-checked="${e.done}" data-act="toggle" data-id="${e.id}"
        aria-label="${e.done ? 'Décocher' : 'Marquer comme payée'} : ${esc(e.label)}"><i>✓</i></button>
      <button class="body" data-act="edit-expense" data-id="${e.id}">
        ${ico(c)}
        <span class="txt">
          <span class="name">${esc(e.label)}</span>
          ${sub ? `<span class="sub">${sub}</span>` : ''}
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
    const id = catOf('expense', e.category).id;
    by[id] = by[id] || { planned: 0, spent: 0 };
    by[id].planned += plannedAmount(e);
    by[id].spent += paid(e);
  }
  const rows = cats('expense').filter(c => by[c.id]).map(c => {
    const { planned, spent } = by[c.id];
    const over = spent > planned;
    const pct = planned > 0 ? Math.min(100, Math.round(spent / planned * 100)) : (spent > 0 ? 100 : 0);
    return `
    <div class="cat">
      ${ico(c)}
      <div class="cat-main">
        <div class="cat-top"><span>${esc(c.label)}</span><span>${num(spent)} / ${num(planned)}</span></div>
        <div class="bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
      </div>
    </div>`;
  }).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Par catégorie</h2><span class="hint">dépensé / planifié</span></div>
    ${rows}
  </section>`;
}

/* ---------- Formulaire d'ajout / modification ---------- */

const dlg = $('itemDialog');
let editing = null;   // { kind: 'income' | 'expense', id: string | null }
let selCat = null;    // catégorie choisie dans le formulaire
let newIcon = ICON_CHOICES[0];

function openItem(kind, id) {
  editing = { kind, id };
  const m = month(current);
  const item = id ? (kind === 'income' ? m.incomes : m.expenses).find(x => x.id === id) : null;
  const isExpense = kind === 'expense';
  const unplanned = item && item.planned === false;
  const cat = catOf(kind, item ? (item.carried ? 'report' : item.category) : null);
  selCat = cat.id;

  $('itemTitle').textContent = (item ? 'Modifier ' : 'Nouvelle ') + (isExpense ? (item ? 'la dépense' : 'dépense') : (item ? "l'entrée" : 'entrée'));
  $('fAmount').value = item ? item.amount : '';
  // Une note identique au nom de la catégorie n'est pas une vraie note.
  $('fLabel').value = item && item.label !== cat.label ? item.label : '';
  $('fLabel').placeholder = isExpense ? 'Ex. loyer de décembre, carburant moto' : 'Ex. salaire de décembre';
  $('expenseFields').hidden = !isExpense;
  $('fDone').checked = !!(item && item.done);
  $('fDoneLabel').textContent = item ? 'Payée' : 'Déjà payée (dépense imprévue)';
  $('fActual').value = item && item.actual != null ? item.actual : '';
  $('fDelete').hidden = !item;
  $('fError').hidden = true;
  $('newCat').hidden = true;
  dlg.dataset.unplanned = unplanned ? '1' : '';
  renderCatGrid();
  syncActual();
  dlg.showModal();
  dlg.scrollTop = 0;
  if (!item) $('fAmount').focus();
}

function renderCatGrid() {
  const tiles = cats(editing.kind)
    .filter(c => !c.hidden || c.id === selCat)
    .map(c => `
      <button type="button" class="cat-tile" role="radio" aria-checked="${c.id === selCat}" data-cat="${esc(c.id)}">
        ${ico(c)}<span>${esc(c.label)}</span>
      </button>`).join('');
  $('catGrid').innerHTML = tiles + `
      <button type="button" class="cat-tile new" data-cat="+">
        <span class="ico plus" aria-hidden="true">+</span><span>Nouvelle</span>
      </button>`;
  $('delCat').hidden = !catOf(editing.kind, selCat).custom;
}

$('catGrid').addEventListener('click', ev => {
  const b = ev.target.closest('[data-cat]');
  if (!b) return;
  if (b.dataset.cat === '+') return openNewCat();
  selCat = b.dataset.cat;
  $('newCat').hidden = true;
  renderCatGrid();
});

function openNewCat() {
  newIcon = ICON_CHOICES[0];
  $('ncName').value = '';
  renderIconGrid();
  $('newCat').hidden = false;
  $('ncName').focus();
  $('newCat').scrollIntoView({ block: 'nearest' });
}
function renderIconGrid() {
  $('ncIcons').innerHTML = ICON_CHOICES.map(i =>
    `<button type="button" role="radio" aria-checked="${i === newIcon}" data-icon="${i}">${i}</button>`).join('');
}
$('ncIcons').addEventListener('click', ev => {
  const b = ev.target.closest('[data-icon]');
  if (!b) return;
  newIcon = b.dataset.icon;
  renderIconGrid();
});
function addCat() {
  const label = $('ncName').value.trim();
  if (!label) return $('ncName').focus();
  const exists = cats(editing.kind).find(c => c.label.toLowerCase() === label.toLowerCase());
  if (exists) {
    selCat = exists.id;
  } else {
    const c = { id: 'c' + uid(), kind: editing.kind, label, icon: newIcon };
    state.cats.push(c);
    save();
    selCat = c.id;
  }
  $('newCat').hidden = true;
  renderCatGrid();
}
$('ncAdd').addEventListener('click', addCat);
$('ncCancel').addEventListener('click', () => { $('newCat').hidden = true; });
$('ncName').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); addCat(); }
});
$('delCat').addEventListener('click', () => {
  const c = catOf(editing.kind, selCat);
  if (!c.custom || !confirm(`Supprimer la catégorie « ${c.label} » ? Les lignes qui l'utilisent passeront dans « Autres ».`)) return;
  state.cats = state.cats.filter(x => x.id !== c.id);
  save();
  selCat = catOf(editing.kind, null).id;
  renderCatGrid();
  render();
});

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
  const amount = parseAmount($('fAmount').value);
  const fail = msg => { $('fError').textContent = msg; $('fError').hidden = false; };
  if (!(amount > 0)) return fail('Indiquez un montant supérieur à 0.');
  const cat = catOf(editing.kind, selCat);
  const category = cat.id;
  const label = $('fLabel').value.trim() || cat.label;

  const m = month(current, true);
  if (editing.kind === 'income') {
    const item = editing.id && m.incomes.find(x => x.id === editing.id);
    if (item) Object.assign(item, { label, amount, category });
    else m.incomes.push({ id: uid(), label, amount, category });
  } else {
    const done = $('fDone').checked;
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
    target.incomes.push({ id: uid(), label: i.label, amount: i.amount, category: i.category });
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
  else m.incomes.unshift({ id: uid(), label: `Report de ${monthName(prev, false)}`, amount: left, category: 'report', carried: true });
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
  const importedCats = (Array.isArray(data.cats) ? data.cats : []).filter(c =>
    c && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.icon === 'string' &&
    (c.kind === 'income' || c.kind === 'expense'));
  state = { version: 1, months: data.months, cats: importedCats };
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
