'use strict';

/* ---------- Catégories ---------- */

// h = teinte de la pastille d'icône.
const EXPENSE_CATS = [
  { id: 'nourriture', icon: '🍲', label: 'Alimentation', h: 28 },
  { id: 'logement', icon: '🏠', label: 'Logement', h: 205 },
  { id: 'transport', icon: '🚕', label: 'Transport', h: 48 },
  { id: 'factures', icon: '💡', label: 'Factures', h: 55 },
  { id: 'communication', icon: '📱', label: 'Internet & crédit', h: 230 },
  { id: 'sante', icon: '💊', label: 'Santé', h: 350 },
  { id: 'education', icon: '🎓', label: 'Éducation', h: 260 },
  { id: 'famille', icon: '👪', label: 'Aide familiale', h: 320 },
  { id: 'habillement', icon: '👗', label: 'Habillement', h: 290 },
  { id: 'beaute', icon: '💄', label: 'Beauté', h: 305 },
  { id: 'loisirs', icon: '🎉', label: 'Loisirs', h: 15 },
  { id: 'vacances', icon: '🏖️', label: 'Vacances', h: 190 },
  { id: 'tontine', icon: '🤝', label: 'Tontine', h: 140 },
  { id: 'cotisation', icon: '🪙', label: 'Cotisation', h: 75 },
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
// warnPct : seuil d'alerte en % ; cap : plafond mensuel de dépenses en FCFA (facultatif).
const DEFAULT_SETTINGS = { warnPct: 80, cap: null };

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

let state = load();
let current = ymOf(new Date());
let view = 'home';                // 'home' | 'plan' | 'expenses' | 'stats'
let statsYear = new Date().getFullYear();
let statsCat = 'all';             // filtre de la courbe
let statsPeriod = 'year';         // 'year' ou 'AAAA-MM' pour la répartition

// Un mois contient : incomes (entrées), budgets (le plan, un montant par catégorie)
// et expenses (dépenses datées, déduites du plan et du solde).
function migrate(s) {
  s.version = 2;
  if (!Array.isArray(s.cats)) s.cats = [];
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  for (const [ym, m] of Object.entries(s.months)) {
    m.incomes = m.incomes || [];
    m.budgets = m.budgets || [];
    for (const i of m.incomes) {
      if (i.category) continue;
      const c = INCOME_CATS.find(c => i.label.trim().toLowerCase().startsWith(c.label.toLowerCase()));
      if (c) i.category = c.id;
    }
    // Ancien format (dépenses planifiées à cocher) : la prévision devient une ligne du plan,
    // et ce qui était coché devient une dépense.
    const out = [];
    for (const e of m.expenses || []) {
      if (!('done' in e)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) e.date = ym + '-01';
        out.push(e);
        continue;
      }
      const category = e.category || 'autre';
      if (e.planned !== false) {
        const b = m.budgets.find(b => b.category === category);
        if (b) b.amount += e.amount;
        else m.budgets.push({ id: uid(), category, amount: e.amount });
      }
      if (e.done) out.push({ id: e.id || uid(), category, amount: e.actual ?? e.amount, date: ym + '-01', label: e.label });
    }
    m.expenses = out;
  }
  return s;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && typeof s.months === 'object' && s.months) return migrate(s);
  } catch (e) { /* données absentes ou illisibles */ }
  return { version: 2, months: {}, cats: [], settings: { ...DEFAULT_SETTINGS } };
}

function save() {
  // On ne conserve pas les mois vides.
  for (const [ym, m] of Object.entries(state.months)) {
    if (!m.incomes.length && !m.expenses.length && !m.budgets.length) delete state.months[ym];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function month(ym, create) {
  let m = state.months[ym];
  if (!m) {
    m = { incomes: [], budgets: [], expenses: [] };
    if (create) state.months[ym] = m;
  }
  return m;
}

/* ---------- Calculs ---------- */

function byCategory(expenses) {
  const by = {};
  for (const e of expenses) {
    const id = catOf('expense', e.category).id;
    by[id] = by[id] || { planned: 0, spent: 0 };
    by[id].spent += e.amount;
  }
  return by;
}

// Par catégorie : montant planifié et montant dépensé.
function catStats(m) {
  const by = byCategory(m.expenses);
  for (const b of m.budgets) {
    const id = catOf('expense', b.category).id;
    by[id] = by[id] || { planned: 0, spent: 0 };
    by[id].planned += b.amount;
  }
  return by;
}

function totals(m) {
  const income = m.incomes.reduce((s, i) => s + i.amount, 0);
  const planned = m.budgets.reduce((s, b) => s + b.amount, 0);
  const spent = m.expenses.reduce((s, e) => s + e.amount, 0);
  const by = catStats(m);
  // Ce qu'il reste à dépenser dans le plan.
  const pending = Object.values(by).reduce((s, b) => s + Math.max(0, b.planned - b.spent), 0);
  return { income, planned, spent, pending, by, left: income - spent };
}

/* ---------- Alertes ---------- */

// Renvoie les alertes du mois, les plus graves d'abord.
function alertsFor(ym) {
  const m = state.months[ym];
  if (!m) return [];
  const t = totals(m);
  const { warnPct, cap } = state.settings;
  const out = [];
  const add = (key, level, title, detail) => out.push({ key, level, title, detail });

  if (t.spent > t.income) {
    add('over-income', 'critical', 'Vous avez dépassé votre budget',
      `Vos dépenses (${fcfa(t.spent)}) dépassent vos entrées de ${fcfa(t.spent - t.income)}.`);
  } else if (t.income > 0 && t.spent >= t.income * warnPct / 100) {
    add('near-income', 'warning', 'Vous approchez de la limite de votre budget',
      `${Math.round(t.spent / t.income * 100)} % de vos entrées sont dépensés. Il vous reste ${fcfa(t.left)}.`);
  }
  if (cap > 0) {
    if (t.spent > cap) {
      add('over-cap', 'critical', 'Plafond de dépenses dépassé',
        `Vous avez dépensé ${fcfa(t.spent)} pour un plafond de ${fcfa(cap)} : ${fcfa(t.spent - cap)} de trop.`);
    } else if (t.spent >= cap * warnPct / 100) {
      add('near-cap', 'warning', 'Vous approchez de votre plafond',
        `${Math.round(t.spent / cap * 100)} % du plafond de ${fcfa(cap)} sont atteints. Marge restante : ${fcfa(cap - t.spent)}.`);
    }
  }
  if (t.income > 0 && t.planned > t.income) {
    add('plan-over', 'warning', 'Votre plan dépasse vos entrées',
      `Vous avez planifié ${fcfa(t.planned)} pour ${fcfa(t.income)} d'entrées : ${fcfa(t.planned - t.income)} de trop.`);
  }
  for (const c of cats('expense')) {
    const b = t.by[c.id];
    if (!b || !(b.planned > 0)) continue;
    if (b.spent > b.planned) {
      add('cat-over-' + c.id, 'critical', `${c.label} : budget dépassé`,
        `${fcfa(b.spent)} dépensés pour ${fcfa(b.planned)} planifiés (+${fcfa(b.spent - b.planned)}).`);
    } else if (b.spent < b.planned && b.spent >= b.planned * warnPct / 100) {
      add('cat-near-' + c.id, 'warning', `${c.label} : budget presque épuisé`,
        `${Math.round(b.spent / b.planned * 100)} % utilisés. Il reste ${fcfa(b.planned - b.spent)} sur ${fcfa(b.planned)}.`);
    }
  }
  // Mois plus dépensier que d'habitude : comparaison avec les 6 mois précédents.
  const past = [];
  for (let i = 1; i <= 6; i++) {
    const pm = state.months[shift(ym, -i)];
    if (pm) past.push(totals(pm).spent);
  }
  if (past.length >= 2) {
    const avg = past.reduce((a, b) => a + b, 0) / past.length;
    if (avg > 0 && t.spent > avg * 1.2) {
      add('peak', 'warning', "Vous dépensez plus que d'habitude",
        `${fcfa(t.spent)} ce mois-ci contre ${fcfa(Math.round(avg))} en moyenne sur les ${past.length} mois précédents.`);
    }
  }
  return out.sort((a, b) => (a.level === 'critical' ? 0 : 1) - (b.level === 'critical' ? 0 : 1));
}

function alertsHtml(list) {
  if (!list.length) return '';
  return `
  <section class="card alerts" aria-label="Alertes">
    ${list.map(a => `
    <div class="alert ${a.level}">
      <span class="alert-ico" aria-hidden="true">${a.level === 'critical' ? '⛔' : '⚠️'}</span>
      <div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div>
    </div>`).join('')}
  </section>`;
}

/* ---------- Affichage ---------- */

const $ = id => document.getElementById(id);
const app = $('app');
const ico = c => `<span class="ico" style="--h:${c.h}" aria-hidden="true">${esc(c.icon)}</span>`;

function todayStr() {
  const d = new Date();
  return ymOf(d) + '-' + String(d.getDate()).padStart(2, '0');
}
function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function render() {
  document.querySelectorAll('.tabs button').forEach(b =>
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
  if (view === 'stats') return renderStats();
  $('monthLabel').textContent = monthName(current);
  const m = month(current);
  const t = totals(m);
  if (view === 'plan') app.innerHTML = planHtml(m, t);
  else if (view === 'expenses') app.innerHTML = expensesHtml(m, t);
  else app.innerHTML = homeHtml(m, t);
}

/* Accueil : solde, alertes, entrées et suivi du plan */

function homeHtml(m, t) {
  return summaryHtml(t) + alertsHtml(alertsFor(current)) +
    `<button class="btn primary block big-add" data-act="add-expense">＋ Enregistrer une dépense</button>` +
    incomesHtml(m) + trackingHtml(t);
}

function summaryHtml(t) {
  const pct = t.income > 0 ? Math.min(100, Math.round(t.spent / t.income * 100)) : (t.spent > 0 ? 100 : 0);
  const over = t.left < 0;
  const afterPlan = t.left - t.pending;
  let note = '';
  if (t.pending > 0) {
    note = afterPlan < 0
      ? `<p class="note warn">Il reste ${fcfa(t.pending)} à dépenser dans votre plan : il manquera ${fcfa(-afterPlan)}.</p>`
      : `<p class="note">Il reste ${fcfa(t.pending)} à dépenser dans votre plan. Après cela, il vous restera ${fcfa(afterPlan)}.</p>`;
  }
  return `
  <section class="summary">
    <div class="label">Solde disponible</div>
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

// Pour chaque catégorie : ce qui a été dépensé sur ce qui était planifié.
function trackingHtml(t) {
  const list = cats('expense').filter(c => t.by[c.id]);
  if (!list.length) {
    return `
    <section class="card starter">
      <div class="section-head"><h2>Suivi du plan</h2></div>
      <p>Vous n'avez pas encore planifié ce mois.</p>
      <button class="btn block" data-act="go-plan">Planifier ${esc(monthName(current, false))}</button>
    </section>`;
  }
  const rows = list.map(c => {
    const { planned, spent } = t.by[c.id];
    const over = planned > 0 && spent > planned;
    const pct = planned > 0 ? Math.min(100, Math.round(spent / planned * 100)) : 100;
    let status;
    if (!planned) status = `<span class="tag">hors plan</span>`;
    else if (over) status = `<span class="st over">⚠️ dépassé de ${num(spent - planned)}</span>`;
    else status = `<span class="st">reste <b>${num(planned - spent)}</b></span>`;
    return `
    <li class="row">
      <button class="body track" data-act="add-expense" data-cat="${esc(c.id)}" aria-label="Enregistrer une dépense : ${esc(c.label)}">
        ${ico(c)}
        <span class="cat-main">
          <span class="cat-top"><span>${esc(c.label)}</span>${status}</span>
          <span class="bar ${over || !planned ? 'over' : ''}"><i style="width:${pct}%"></i></span>
          <span class="sub">${num(spent)} dépensés${planned ? ' sur ' + num(planned) : ''}</span>
        </span>
      </button>
    </li>`;
  }).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Suivi du plan</h2><span class="hint">touchez pour dépenser</span></div>
    <ul class="list">${rows}</ul>
  </section>`;
}

/* Planifier : un montant par catégorie pour le mois */

function planHtml(m, t) {
  const free = t.income - t.planned;
  const prev = shift(current, -1);
  const pm = state.months[prev];
  const rows = m.budgets.map(b => {
    const c = catOf('expense', b.category);
    return `
    <li class="row">
      <button class="body" data-act="edit-budget" data-id="${b.id}">
        ${ico(c)}
        <span class="txt"><span class="name">${esc(c.label)}</span></span>
        <span class="amt">${num(b.amount)}</span>
      </button>
    </li>`;
  }).join('');
  let starter = '';
  if (!m.budgets.length && pm && pm.budgets.length) {
    starter = `<button class="btn primary block" data-act="copy">Copier le plan de ${esc(monthName(prev, false))}</button>`;
  }
  return `
  <section class="card plan-sum">
    <h2>Planifier ${esc(monthName(current))}</h2>
    <div class="stats">
      <div class="stat"><span>Entrées</span><b>${num(t.income)}</b></div>
      <div class="stat"><span>Planifié</span><b>${num(t.planned)}</b></div>
      <div class="stat ${free < 0 ? 'bad' : ''}"><span>${free < 0 ? 'Dépassement' : 'Non affecté'}</span><b>${num(Math.abs(free))}</b></div>
    </div>
    ${free < 0 ? `<p class="note warn-text">⚠️ Votre plan dépasse vos entrées de ${fcfa(-free)}.</p>` : ''}
  </section>
  ${incomesHtml(m)}
  <section class="card">
    <div class="section-head"><h2>Mon plan de dépenses</h2><button class="add-btn" data-act="add-budget">+ Ajouter</button></div>
    ${rows ? `<ul class="list">${rows}</ul>` : '<p class="empty">Fixez un montant par catégorie : alimentation, transport, cotisation…</p>'}
    ${starter}
  </section>`;
}

/* Dépenses : enregistrées jour par jour */

function expensesHtml(m, t) {
  const sorted = m.expenses.map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.i - a.i).map(x => x.e);
  const days = [];
  for (const e of sorted) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else days.push({ date: e.date, items: [e] });
  }
  const groups = days.map(d => `
    <section class="card">
      <div class="day-head"><h3>${esc(dayLabel(d.date))}</h3><span>${num(d.items.reduce((s, e) => s + e.amount, 0))}</span></div>
      <ul class="list">${d.items.map(e => {
        const c = catOf('expense', e.category);
        return `
        <li class="row">
          <button class="body" data-act="edit-expense" data-id="${e.id}">
            ${ico(c)}
            <span class="txt">
              <span class="name">${esc(e.label)}</span>
              ${e.label !== c.label ? `<span class="sub">${esc(c.label)}</span>` : ''}
            </span>
            <span class="amt">${num(e.amount)}</span>
          </button>
        </li>`;
      }).join('')}</ul>
    </section>`).join('');
  return `
  <section class="card plan-sum">
    <div class="section-head"><h2>Dépenses de ${esc(monthName(current, false))}</h2><span class="hint">${fcfa(t.spent)}</span></div>
    <button class="btn primary block big-add" data-act="add-expense">＋ Enregistrer une dépense</button>
  </section>
  ${groups || '<section class="card"><p class="empty">Aucune dépense enregistrée ce mois-ci.</p></section>'}`;
}

/* ---------- Formulaire d'ajout / modification ---------- */

const dlg = $('itemDialog');
let editing = null;   // { kind: 'income' | 'budget' | 'expense', id: string | null }
let selCat = null;    // catégorie choisie dans le formulaire
let newIcon = ICON_CHOICES[0];
const catKind = () => (editing.kind === 'income' ? 'income' : 'expense');
const listOf = (m, kind) => m[{ income: 'incomes', budget: 'budgets', expense: 'expenses' }[kind]];

const TITLES = {
  income: ['Nouvelle entrée', "Modifier l'entrée"],
  budget: ['Ajouter au plan', 'Modifier le plan'],
  expense: ['Nouvelle dépense', 'Modifier la dépense'],
};

function openItem(kind, id, presetCat) {
  editing = { kind, id };
  const m = month(current);
  const item = id ? listOf(m, kind).find(x => x.id === id) : null;
  let catId = item ? (item.carried ? 'report' : item.category) : presetCat;
  if (!item && kind === 'budget') {
    // Première catégorie qui n'est pas encore dans le plan.
    const used = new Set(m.budgets.map(b => catOf('expense', b.category).id));
    catId = (cats('expense').find(c => !used.has(c.id)) || {}).id;
  }
  editing.kind = kind;
  const cat = catOf(catKind(), catId);
  selCat = cat.id;

  $('itemTitle').textContent = TITLES[kind][item ? 1 : 0];
  $('fAmountLabel').textContent = kind === 'budget' ? 'Montant prévu pour le mois' : 'Montant';
  $('fAmount').value = item ? item.amount : '';
  $('noteWrap').hidden = kind === 'budget';
  // Une note identique au nom de la catégorie n'est pas une vraie note.
  $('fLabel').value = item && item.label && item.label !== cat.label ? item.label : '';
  $('fLabel').placeholder = kind === 'expense' ? 'Ex. marché, taxi, carburant moto' : 'Ex. salaire de décembre';
  $('dateWrap').hidden = kind !== 'expense';
  $('fDate').value = item && item.date ? item.date : (current === ymOf(new Date()) ? todayStr() : current + '-01');
  $('fDelete').hidden = !item;
  $('fError').hidden = true;
  $('newCat').hidden = true;
  renderCatGrid();
  dlg.showModal();
  dlg.scrollTop = 0;
  if (!item) $('fAmount').focus();
}

function renderCatGrid() {
  const tiles = cats(catKind())
    .filter(c => !c.hidden || c.id === selCat)
    .map(c => `
      <button type="button" class="cat-tile" role="radio" aria-checked="${c.id === selCat}" data-cat="${esc(c.id)}">
        ${ico(c)}<span>${esc(c.label)}</span>
      </button>`).join('');
  $('catGrid').innerHTML = tiles + `
      <button type="button" class="cat-tile new" data-cat="+">
        <span class="ico plus" aria-hidden="true">+</span><span>Nouvelle</span>
      </button>`;
  $('delCat').hidden = !catOf(catKind(), selCat).custom;
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
  const exists = cats(catKind()).find(c => c.label.toLowerCase() === label.toLowerCase());
  if (exists) {
    selCat = exists.id;
  } else {
    const c = { id: 'c' + uid(), kind: catKind(), label, icon: newIcon };
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
  const c = catOf(catKind(), selCat);
  if (!c.custom || !confirm(`Supprimer la catégorie « ${c.label} » ? Les lignes qui l'utilisent passeront dans « Autres ».`)) return;
  state.cats = state.cats.filter(x => x.id !== c.id);
  save();
  selCat = catOf(catKind(), null).id;
  renderCatGrid();
  render();
});

$('itemForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const { kind, id } = editing;
  const amount = parseAmount($('fAmount').value);
  const fail = msg => { $('fError').textContent = msg; $('fError').hidden = false; };
  if (!(amount > 0)) return fail('Indiquez un montant supérieur à 0.');
  const cat = catOf(catKind(), selCat);
  const category = cat.id;
  const label = $('fLabel').value.trim() || cat.label;
  const m = month(current, true);

  if (kind === 'income') {
    const item = id && m.incomes.find(x => x.id === id);
    if (item) Object.assign(item, { label, amount, category });
    else m.incomes.push({ id: uid(), label, amount, category });
  } else if (kind === 'budget') {
    const clash = m.budgets.find(b => b.id !== id && catOf('expense', b.category).id === category);
    if (clash) return fail(`« ${cat.label} » est déjà dans votre plan. Touchez sa ligne pour modifier le montant.`);
    const item = id && m.budgets.find(x => x.id === id);
    if (item) Object.assign(item, { amount, category });
    else m.budgets.push({ id: uid(), category, amount });
  } else {
    const date = $('fDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Indiquez la date de la dépense.');
    const before = new Set(alertsFor(current).map(a => a.key));
    if (id) m.expenses = m.expenses.filter(x => x.id !== id);
    const ym = date.slice(0, 7);
    const target = month(ym, true);
    target.expenses.push({ id: id || uid(), category, amount, date, label });
    save();
    dlg.close();
    render();
    // Message : nouvelle alerte s'il y en a une, sinon ce qu'il reste dans la catégorie.
    const fresh = ym === current && alertsFor(current).find(a => !before.has(a.key));
    if (fresh) return toast((fresh.level === 'critical' ? '⛔ ' : '⚠️ ') + fresh.title);
    const b = totals(target).by[category];
    let msg = `${fcfa(amount)} déduits.`;
    if (ym !== current) msg += ` Dépense classée en ${monthName(ym)}.`;
    else if (b.planned > 0) msg += ` ${cat.label} : reste ${fcfa(Math.max(0, b.planned - b.spent))} sur ${fcfa(b.planned)}.`;
    else msg += ` ${cat.label} n'est pas dans votre plan.`;
    return toast(msg);
  }
  save();
  dlg.close();
  render();
});

$('fCancel').addEventListener('click', () => dlg.close());
$('fDelete').addEventListener('click', () => {
  if (!confirm('Supprimer cette ligne ?')) return;
  const m = month(current);
  const key = { income: 'incomes', budget: 'budgets', expense: 'expenses' }[editing.kind];
  m[key] = m[key].filter(x => x.id !== editing.id);
  save();
  dlg.close();
  render();
});

/* ---------- Actions ---------- */

function setView(v) {
  if (v === view) return;
  view = v;
  if (view === 'stats') { statsYear = Number(current.slice(0, 4)); statsPeriod = 'year'; statsCat = 'all'; }
  render();
  window.scrollTo(0, 0);
}

app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const { act, id, cat } = el.dataset;
  if (act === 'add-income') openItem('income', null);
  else if (act === 'add-budget') openItem('budget', null);
  else if (act === 'add-expense') openItem('expense', null, cat);
  else if (act === 'edit-income') openItem('income', id);
  else if (act === 'edit-budget') openItem('budget', id);
  else if (act === 'edit-expense') openItem('expense', id);
  else if (act === 'go-plan') setView('plan');
  else if (act === 'copy') copyPrevious();
});

// Reprend le plan (et les entrées habituelles) du mois précédent.
function copyPrevious() {
  const prev = shift(current, -1);
  const pm = state.months[prev];
  if (!pm || (!pm.budgets.length && !pm.incomes.length)) return toast(`Rien à copier : ${monthName(prev)} n'a pas de plan.`);
  const m = month(current);
  if ((m.incomes.length || m.budgets.length) &&
      !confirm(`Compléter ${monthName(current)} avec le plan de ${monthName(prev)} ?`)) return;
  const target = month(current, true);
  if (!target.incomes.some(i => !i.carried)) {
    for (const i of pm.incomes) {
      if (i.carried) continue; // un report n'est pas une entrée récurrente
      target.incomes.push({ id: uid(), label: i.label, amount: i.amount, category: i.category });
    }
  }
  const used = new Set(target.budgets.map(b => catOf('expense', b.category).id));
  for (const b of pm.budgets) {
    if (used.has(catOf('expense', b.category).id)) continue;
    target.budgets.push({ id: uid(), category: b.category, amount: b.amount });
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

function step(delta) {
  if (view === 'stats') { statsYear += delta; statsPeriod = 'year'; statsCat = 'all'; }
  else current = shift(current, delta);
  render();
}
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
$('monthLabel').addEventListener('click', () => {
  if (view === 'stats') { statsYear = new Date().getFullYear(); statsPeriod = 'year'; }
  else current = ymOf(new Date());
  render();
});
document.querySelector('.tabs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});

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
  else if (a === 'alerts') openAlertSettings();
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
  state = migrate({ months: data.months, cats: importedCats, settings: data.settings });
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

/* ---------- Réglage des alertes ---------- */

const alertDlg = $('alertDialog');
function openAlertSettings() {
  $('aPct').value = state.settings.warnPct;
  $('aCap').value = state.settings.cap || '';
  $('aError').hidden = true;
  alertDlg.showModal();
}
$('alertForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const pct = parseAmount($('aPct').value);
  if (!(pct >= 1 && pct <= 100)) {
    $('aError').textContent = 'Le seuil doit être compris entre 1 et 100 %.';
    $('aError').hidden = false;
    return;
  }
  const cap = parseAmount($('aCap').value);
  state.settings = { warnPct: pct, cap: cap > 0 ? cap : null };
  save();
  alertDlg.close();
  render();
  toast('Alertes mises à jour.');
});
$('aCancel').addEventListener('click', () => alertDlg.close());
alertDlg.addEventListener('click', ev => { if (ev.target === alertDlg) alertDlg.close(); });

/* ---------- Tableau de bord ---------- */

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const ymAt = (year, i) => year + '-' + String(i + 1).padStart(2, '0');
let chart = null; // géométrie de la courbe affichée, pour l'infobulle

function compact(n) {
  const f = (v, d) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
  if (n >= 1e6) return f(n / 1e6, 1) + ' M';
  if (n >= 1e3) return f(n / 1e3, n < 1e4 ? 1 : 0) + ' k';
  return String(n);
}
function niceMax(v) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(k => k * p).find(c => c >= v);
}

// Dépenses de chaque mois de l'année ; null pour un mois sans aucune donnée.
function yearSeries(year, catId) {
  return MONTH_LETTERS.map((_, i) => {
    const m = state.months[ymAt(year, i)];
    if (!m) return null;
    return m.expenses.reduce((s, e) =>
      s + (catId === 'all' || catOf('expense', e.category).id === catId ? e.amount : 0), 0);
  });
}

function renderStats() {
  $('monthLabel').textContent = 'Année ' + statsYear;
  const months = MONTH_LETTERS.map((_, i) => state.months[ymAt(statsYear, i)]).filter(Boolean);
  if (!months.length) {
    chart = null;
    app.innerHTML = `
      <section class="card starter"><p>Aucune donnée pour ${statsYear}. Utilisez les flèches en haut pour changer d'année.</p></section>`;
    return;
  }
  const income = months.reduce((s, m) => s + totals(m).income, 0);
  const spent = months.reduce((s, m) => s + totals(m).spent, 0);
  app.innerHTML = `
  <section class="summary">
    <div class="label">Dépensé en ${statsYear}</div>
    <div class="big">${num(spent)} <small>FCFA</small></div>
    <div class="stats">
      <div class="stat"><span>Entrées</span><b>${num(income)}</b></div>
      <div class="stat"><span>Moyenne / mois</span><b>${num(Math.round(spent / months.length))}</b></div>
      <div class="stat"><span>Reste</span><b>${num(income - spent)}</b></div>
    </div>
  </section>
  ${trendHtml()}
  ${breakdownHtml()}`;
}

function trendHtml() {
  const used = cats('expense').filter(c =>
    MONTH_LETTERS.some((_, i) => (state.months[ymAt(statsYear, i)]?.expenses || [])
      .some(e => catOf('expense', e.category).id === c.id)));
  if (statsCat !== 'all' && !used.some(c => c.id === statsCat)) statsCat = 'all';
  const vals = yearSeries(statsYear, statsCat);
  const known = vals.filter(v => v != null);
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  const max = Math.max(...known);
  const peak = max > 0 ? vals.indexOf(max) : -1;

  let insight = 'Aucune dépense payée sur cette période.';
  if (peak >= 0) {
    insight = `Pic en ${monthName(ymAt(statsYear, peak), false)} : ${fcfa(max)}.`;
    if (known.length >= 2 && max > avg) {
      insight += ` C'est ${Math.round((max / avg - 1) * 100)} % de plus que votre moyenne mensuelle (${fcfa(Math.round(avg))}).`;
    }
  }
  const options = [`<option value="all">Toutes les catégories</option>`]
    .concat(used.map(c => `<option value="${esc(c.id)}" ${c.id === statsCat ? 'selected' : ''}>${esc(c.icon)} ${esc(c.label)}</option>`));
  const rows = vals.map((v, i) => v == null ? '' :
    `<tr><td>${esc(monthName(ymAt(statsYear, i), false))}</td><td>${num(v)}</td></tr>`).join('');
  return `
  <section class="card">
    <div class="section-head"><h2>Évolution des dépenses</h2></div>
    <select class="filter" id="statsCat" aria-label="Catégorie affichée">${options.join('')}</select>
    <div class="chart-wrap" id="trend">${lineChartSvg(vals, peak, known.length >= 2 ? avg : null)}<div class="chart-tip" hidden></div></div>
    <p class="insight">${esc(insight)}</p>
    <details class="table-view"><summary>Voir les chiffres</summary>
      <table><thead><tr><th>Mois</th><th>Dépensé (FCFA)</th></tr></thead><tbody>${rows}</tbody></table>
    </details>
  </section>`;
}

function lineChartSvg(vals, peak, avg) {
  const W = Math.max(280, Math.min(app.clientWidth, 560) - 32);
  const H = 200, pl = 40, pr = 14, pt = 30, pb = 26;
  const top = niceMax(Math.max(0, ...vals.filter(v => v != null)));
  const x = i => pl + (W - pl - pr) * i / 11;
  const y = v => pt + (H - pt - pb) * (1 - v / top);
  chart = { vals, x, y, W, H, pt, pb, year: statsYear };

  let g = '';
  for (const tick of [0, top / 2, top]) {
    g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(tick)}" y2="${y(tick)}"/>
      <text class="axis" x="${pl - 6}" y="${y(tick) + 4}" text-anchor="end">${compact(tick)}</text>`;
  }
  g += MONTH_LETTERS.map((l, i) =>
    `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${l}</text>`).join('');
  if (avg != null && avg > 0) {
    g += `<line class="avg" x1="${pl}" x2="${W - pr}" y1="${y(avg)}" y2="${y(avg)}"/>`;
  }
  // La courbe s'interrompt sur les mois sans donnée.
  let d = '', pen = false;
  vals.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  g += `<path class="line" d="${d}"/>`;
  g += `<line class="cross" id="cross" y1="${pt}" y2="${H - pb}" x1="0" x2="0" visibility="hidden"/>`;
  g += vals.map((v, i) => v == null ? '' :
    `<circle class="dot ${i === peak ? 'peak' : ''}" cx="${x(i)}" cy="${y(v)}" r="${i === peak ? 6 : 4}"/>`).join('');
  if (peak >= 0) {
    const anchor = peak <= 1 ? 'start' : peak >= 10 ? 'end' : 'middle';
    const dx = anchor === 'start' ? -6 : anchor === 'end' ? 6 : 0;
    g += `<text class="peak-label" x="${x(peak) + dx}" y="${y(vals[peak]) - 12}" text-anchor="${anchor}">Pic : ${compact(vals[peak])}</text>`;
  }
  const legend = avg != null && avg > 0
    ? `<div class="legend"><span class="key line-key"></span>Dépenses du mois<span class="key avg-key"></span>Moyenne mensuelle</div>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
    aria-label="Courbe des dépenses par mois en ${statsYear}">${g}</svg>${legend}`;
}

function breakdownHtml() {
  const withData = MONTH_LETTERS.map((_, i) => ymAt(statsYear, i)).filter(ym => state.months[ym]);
  if (statsPeriod !== 'year' && !withData.includes(statsPeriod)) statsPeriod = 'year';
  const expenses = (statsPeriod === 'year' ? withData : [statsPeriod]).flatMap(ym => state.months[ym].expenses);
  const by = byCategory(expenses);
  const list = cats('expense').filter(c => by[c.id] && by[c.id].spent > 0)
    .sort((a, b) => by[b.id].spent - by[a.id].spent);
  const total = list.reduce((s, c) => s + by[c.id].spent, 0);
  const top = list.length ? by[list[0].id].spent : 1;
  const rows = list.map(c => {
    const v = by[c.id].spent;
    return `
    <div class="cat">
      ${ico(c)}
      <div class="cat-main">
        <div class="cat-top"><span>${esc(c.label)}</span><span><b>${num(v)}</b> · ${Math.round(v / total * 100)} %</span></div>
        <div class="bar chart-bar"><i style="width:${Math.max(2, v / top * 100)}%"></i></div>
      </div>
    </div>`;
  }).join('');
  const options = [`<option value="year">Toute l'année ${statsYear}</option>`].concat(withData.map(ym =>
    `<option value="${ym}" ${ym === statsPeriod ? 'selected' : ''}>${esc(monthName(ym))}</option>`));
  let insight = '';
  if (list.length) {
    const c = list[0];
    insight = `<p class="insight">Votre plus gros poste est « ${esc(c.label)} » : ${Math.round(by[c.id].spent / total * 100)} % de vos dépenses${list.length > 1 ? `, devant « ${esc(list[1].label)} »` : ''}.</p>`;
  }
  return `
  <section class="card">
    <div class="section-head"><h2>Où va mon argent</h2><span class="hint">FCFA · part du total</span></div>
    <select class="filter" id="statsPeriod" aria-label="Période">${options.join('')}</select>
    ${rows || '<p class="empty">Aucune dépense payée sur cette période.</p>'}
    ${insight}
  </section>`;
}

app.addEventListener('change', ev => {
  if (ev.target.id === 'statsCat') { statsCat = ev.target.value; render(); }
  else if (ev.target.id === 'statsPeriod') { statsPeriod = ev.target.value; render(); }
});

// Infobulle de la courbe : le mois le plus proche du doigt ou du pointeur.
function showTip(ev) {
  const wrap = ev.target.closest('#trend');
  if (!wrap || !chart) return;
  const svg = wrap.querySelector('svg');
  const box = svg.getBoundingClientRect();
  const px = (ev.clientX - box.left) * chart.W / box.width;
  let best = -1;
  chart.vals.forEach((v, i) => {
    if (v != null && (best < 0 || Math.abs(chart.x(i) - px) < Math.abs(chart.x(best) - px))) best = i;
  });
  if (best < 0) return;
  const cx = chart.x(best);
  const cross = svg.querySelector('#cross');
  cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
  const tip = wrap.querySelector('.chart-tip');
  tip.innerHTML = `<b>${num(chart.vals[best])} FCFA</b><span>${esc(monthName(ymAt(chart.year, best)))}</span>`;
  tip.hidden = false;
  const left = Math.min(Math.max(cx * box.width / chart.W - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
  tip.style.left = left + 'px';
}
function hideTip() {
  const wrap = document.getElementById('trend');
  if (!wrap) return;
  wrap.querySelector('.chart-tip').hidden = true;
  wrap.querySelector('#cross')?.setAttribute('visibility', 'hidden');
}
app.addEventListener('pointermove', showTip);
app.addEventListener('pointerdown', ev => (ev.target.closest('#trend') ? showTip(ev) : hideTip()));
app.addEventListener('pointerleave', hideTip);
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (view === 'stats') render(); }, 150);
});

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
