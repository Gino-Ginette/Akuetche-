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
  { id: 'dette', icon: '💳', label: 'Remboursement de dette', h: 0 },
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
// infoPct : première alerte en % ; warnPct : seuil d'alerte en % ; cap : plafond mensuel de dépenses en FCFA (facultatif).
const DEFAULT_SETTINGS = { infoPct: 50, warnPct: 80, cap: null };
const ALERT_ICON = { critical: '⛔', warning: '⚠️', info: 'ℹ️' };
const ALERT_RANK = { critical: 0, warning: 1, info: 2 };

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
  // Créances (loans : on me doit) et dettes (debts : je dois), avec leurs paiements.
  for (const key of ['loans', 'debts']) {
    s[key] = (Array.isArray(s[key]) ? s[key] : []).filter(l =>
      l && typeof l.person === 'string' && Number.isFinite(l.amount));
    for (const l of s[key]) {
      l.id = l.id || uid();
      l.payments = (Array.isArray(l.payments) ? l.payments : []).filter(p => p && Number.isFinite(p.amount));
    }
  }
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
  return { version: 2, months: {}, cats: [], loans: [], debts: [], settings: { ...DEFAULT_SETTINGS } };
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
  const m = month(ym);
  const t = totals(m);
  const { infoPct, warnPct, cap } = state.settings;
  const out = [];
  const add = (key, level, title, detail) => out.push({ key, level, title, detail });

  if (t.spent > t.income) {
    add('over-income', 'critical', 'Vous avez dépassé votre budget',
      `Vos dépenses (${fcfa(t.spent)}) dépassent vos entrées de ${fcfa(t.spent - t.income)}.`);
  } else if (t.income > 0 && t.spent >= t.income * warnPct / 100) {
    add('near-income', 'warning', 'Vous approchez de la limite de votre budget',
      `${Math.round(t.spent / t.income * 100)} % de vos entrées sont dépensés. Il vous reste ${fcfa(t.left)}.${paceText(ym, t.left)}`);
  } else if (t.income > 0 && t.spent >= t.income * infoPct / 100) {
    add('half-income', 'info', `Vous avez dépensé ${Math.round(t.spent / t.income * 100)} % de vos entrées`,
      `Il vous reste ${fcfa(t.left)} sur ${fcfa(t.income)}.${paceText(ym, t.left)}`);
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
  // Créances et dettes : rappel sur le mois en cours uniquement.
  if (ym === ymOf(new Date())) {
    const today = todayStr();
    const names = list => [...new Set(list.map(l => l.person))].join(', ');
    const sum = list => list.reduce((s, l) => s + loanLeft(l), 0);
    for (const key of ['debts', 'loans']) {
      const debt = key === 'debts';
      const open = state[key].filter(l => loanLeft(l) > 0 && l.due);
      const late = open.filter(l => l.due < today);
      const soon = open.filter(l => l.due >= today && daysBetween(today, l.due) <= 7);
      const word = debt ? 'dette' : 'créance';
      if (late.length) {
        add(key + '-late', 'warning', late.length > 1 ? `${late.length} ${word}s en retard` : `Une ${word} en retard`,
          `${names(late)} : ${fcfa(sum(late))} à ${debt ? 'payer' : 'récupérer'}, échéance dépassée.`);
      }
      if (soon.length) {
        add(key + '-soon', 'info', debt ? 'Dette bientôt à échéance' : 'Créance bientôt à échéance',
          `${names(soon)} : ${fcfa(sum(soon))} ${debt ? 'à payer' : 'attendus'} dans les 7 jours.`);
      }
    }
  }
  if (past.length >= 2) {
    const avg = past.reduce((a, b) => a + b, 0) / past.length;
    if (avg > 0 && t.spent > avg * 1.2) {
      add('peak', 'warning', "Vous dépensez plus que d'habitude",
        `${fcfa(t.spent)} ce mois-ci contre ${fcfa(Math.round(avg))} en moyenne sur les ${past.length} mois précédents.`);
    }
  }
  return out.sort((a, b) => ALERT_RANK[a.level] - ALERT_RANK[b.level]);
}

// Jours restants dans le mois en cours (aujourd'hui compris) ; null pour un autre mois.
function daysLeftIn(ym) {
  const now = new Date();
  if (ym !== ymOf(now)) return null;
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
}
function paceText(ym, left) {
  const days = daysLeftIn(ym);
  if (!days || left <= 0) return '';
  return ` Pour tenir les ${days} jours restants, cela fait environ ${fcfa(Math.floor(left / days))} par jour.`;
}

/* ---------- Conseils ---------- */

const GENERAL_TIPS = [
  "Payez-vous en premier : mettez l'épargne de côté dès que l'argent entre, pas avec ce qui reste à la fin du mois.",
  "Notez chaque dépense le jour même, même les petites : ce sont elles qui font disparaître l'argent sans qu'on s'en rende compte.",
  "Un repère simple : environ 50 % pour les besoins (logement, nourriture, transport), 30 % pour les envies et 20 % pour l'épargne.",
  "Constituez peu à peu une réserve d'urgence équivalente à trois mois de dépenses, pour ne pas vous endetter au premier imprévu.",
  "Avant un achat non prévu, attendez 48 heures : si l'envie est toujours là et que le budget le permet, achetez.",
  "Préparez le plan du mois suivant avant de recevoir votre salaire : l'argent a ainsi une destination dès son arrivée.",
  "Regroupez vos achats de nourriture en une ou deux fois par mois : acheter en gros coûte souvent moins cher qu'au détail.",
  "Prévoyez toujours une ligne « imprévus » dans votre plan : il y en a chaque mois.",
  "Comparez votre plan et vos dépenses réelles à la fin du mois, et ajustez les montants du mois suivant.",
  "Fixez un objectif précis à votre épargne (un projet, un montant, une date) : on épargne mieux quand on sait pourquoi.",
];

// Conseils tirés des chiffres du mois, complétés par un conseil général du jour.
function tipsFor(ym) {
  const m = state.months[ym];
  const tips = [];
  if (m) {
    const t = totals(m);
    const days = daysLeftIn(ym);
    if (t.income > 0 && !t.planned) {
      tips.push("Commencez par l'onglet Planifier : répartissez vos entrées par catégorie avant de dépenser.");
    }
    if (t.income > 0 && t.planned > 0 && !t.by.epargne) {
      tips.push(`Vous n'avez pas prévu d'épargne ce mois-ci. Même 10 % de vos entrées, soit ${fcfa(Math.round(t.income / 10))}, font une différence sur l'année.`);
    }
    const free = t.income - t.planned;
    if (t.planned > 0 && free > 0) {
      tips.push(`${fcfa(free)} ne sont affectés à aucune catégorie. Donnez-leur une destination (épargne, imprévus) pour qu'ils ne partent pas en petites dépenses.`);
    }
    const owed = state.debts.reduce((s, l) => s + loanLeft(l), 0);
    if (owed > 0 && !(t.by.dette && t.by.dette.planned)) {
      tips.push(`Vous avez ${fcfa(owed)} de dettes. Prévoyez une ligne « Remboursement de dette » dans votre plan pour les solder régulièrement.`);
    }
    const offPlan = cats('expense').filter(c => t.by[c.id] && !t.by[c.id].planned);
    if (offPlan.length) {
      const sum = offPlan.reduce((s, c) => s + t.by[c.id].spent, 0);
      tips.push(`${fcfa(sum)} dépensés hors plan (${offPlan.map(c => c.label).join(', ')}). Ajoutez ces catégories à votre plan du mois prochain.`);
    }
    const top = cats('expense').filter(c => t.by[c.id] && t.by[c.id].planned > 0)
      .sort((a, b) => t.by[b.id].planned - t.by[a.id].planned)[0];
    if (top && t.income > 0 && t.by[top.id].planned >= t.income * 0.5) {
      tips.push(`« ${top.label} » prend ${Math.round(t.by[top.id].planned / t.income * 100)} % de vos entrées. Quand un seul poste pèse autant, il reste peu de marge pour le reste : gardez une réserve pour les imprévus.`);
    }
    const flexible = t.left - Math.max(0, free);
    if (days && t.pending > 0 && flexible > 0) {
      tips.push(`Il reste ${fcfa(t.pending)} dans votre plan pour ${days} jours : environ ${fcfa(Math.floor(t.pending / days))} par jour.`);
    }
    if (days && m.expenses.length) {
      const last = m.expenses.reduce((d, e) => (e.date > d ? e.date : d), '');
      const gap = Math.round((new Date(todayStr()) - new Date(last)) / 864e5);
      if (gap >= 3) tips.push(`Votre dernière dépense enregistrée date d'il y a ${gap} jours. Pensez à noter celles des derniers jours pour que le solde reste juste.`);
    }
  }
  const out = tips.slice(0, 3);
  out.push(GENERAL_TIPS[new Date().getDate() % GENERAL_TIPS.length]);
  return out;
}

function tipsHtml(ym) {
  return `
  <section class="card">
    <div class="section-head"><h2>Conseils</h2></div>
    <ul class="tips">${tipsFor(ym).map(t => `<li><span aria-hidden="true">💡</span><p>${esc(t)}</p></li>`).join('')}</ul>
  </section>`;
}

function alertsHtml(list) {
  if (!list.length) return '';
  return `
  <section class="card alerts" aria-label="Alertes">
    ${list.map(a => `
    <div class="alert ${a.level}">
      <span class="alert-ico" aria-hidden="true">${ALERT_ICON[a.level]}</span>
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
  const noNav = view === 'loans';
  $('prev').style.visibility = $('next').style.visibility = noNav ? 'hidden' : '';
  if (view === 'stats') return renderStats();
  if (view === 'loans') return renderLoans();
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
    incomesHtml(m) + trackingHtml(t) + tipsHtml(current);
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
    if (fresh) return toast(ALERT_ICON[fresh.level] + ' ' + fresh.title);
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
  if (view === 'loans') return;
  if (view === 'stats') { statsYear += delta; statsPeriod = 'year'; statsCat = 'all'; }
  else current = shift(current, delta);
  render();
}
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
$('monthLabel').addEventListener('click', () => {
  if (view === 'loans') return;
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
  a.download = `akuetche-${new Date().toISOString().slice(0, 10)}.json`;
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
  state = migrate({ months: data.months, cats: importedCats, settings: data.settings, loans: data.loans, debts: data.debts });
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
  $('aInfo').value = state.settings.infoPct;
  $('aPct').value = state.settings.warnPct;
  $('aCap').value = state.settings.cap || '';
  $('aError').hidden = true;
  alertDlg.showModal();
}
$('alertForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const pct = parseAmount($('aPct').value);
  const info = parseAmount($('aInfo').value);
  if (!(pct >= 1 && pct <= 100) || !(info >= 1 && info <= 100)) {
    $('aError').textContent = 'Les seuils doivent être compris entre 1 et 100 %.';
    $('aError').hidden = false;
    return;
  }
  const cap = parseAmount($('aCap').value);
  state.settings = { infoPct: info, warnPct: pct, cap: cap > 0 ? cap : null };
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

/* ---------- Créances et dettes ---------- */

// Les deux listes ont la même forme ; seul le vocabulaire change.
const LOAN_TEXT = {
  loans: {
    hero: 'On me doit', lent: 'Prêté', paid: 'Remboursé', caption: 'de ce que vous avez prêté est remboursé',
    none: 'Aucun prêt enregistré', add: '＋ Enregistrer un prêt', empty: "Personne ne vous doit d'argent pour le moment.",
    count: 'créance', doneTitle: 'Remboursées', doneOn: 'Remboursé', part: 'reçus sur',
    formNew: 'Nouveau prêt', formEdit: 'Modifier le prêt', who: 'À qui avez-vous prêté ?',
    amount: 'Montant prêté (FCFA)', date: 'Date du prêt', startedOn: 'Prêté le', left: 'Reste dû',
    allPaid: 'Entièrement remboursé.', payTitle: 'Enregistrer un remboursement', payBtn: 'Enregistrer le remboursement',
    paysTitle: 'Remboursements reçus', tooMuch: 'à rembourser', del: 'Supprimer le prêt à',
  },
  debts: {
    hero: 'Je dois', lent: 'Emprunté', paid: 'Payé', caption: 'de vos dettes est payé',
    none: 'Aucune dette enregistrée', add: '＋ Enregistrer une dette', empty: "Vous n'avez aucune dette en cours.",
    count: 'dette', doneTitle: 'Soldées', doneOn: 'Soldée', part: 'payés sur',
    formNew: 'Nouvelle dette', formEdit: 'Modifier la dette', who: 'À qui devez-vous ?',
    amount: 'Montant de la dette (FCFA)', date: 'Date de la dette', startedOn: 'Contractée le', left: 'Reste à payer',
    allPaid: 'Entièrement payée.', payTitle: 'Enregistrer un paiement', payBtn: 'Enregistrer le paiement',
    paysTitle: 'Paiements effectués', tooMuch: 'à payer', del: 'Supprimer la dette envers',
  },
};
let loanKind = 'loans'; // liste affichée : 'loans' (créances) ou 'debts' (dettes)
const LT = () => LOAN_TEXT[loanKind];

const loanPaid = l => l.payments.reduce((s, p) => s + p.amount, 0);
const loanLeft = l => Math.max(0, l.amount - loanPaid(l));
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
function fmtDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Texte et état de l'échéance d'une ligne non soldée.
function dueInfo(l) {
  if (!l.due) return { text: 'Sans échéance', late: false };
  const n = daysBetween(todayStr(), l.due);
  if (n < 0) return { text: `En retard de ${plural(-n, 'jour')}`, late: true };
  if (n === 0) return { text: "Échéance aujourd'hui", late: false };
  return { text: `Échéance le ${fmtDate(l.due)}`, late: false };
}

// Retire du budget les dépenses créées par des paiements de dette.
function dropExpenses(ids) {
  const set = new Set(ids.filter(Boolean));
  if (!set.size) return;
  for (const m of Object.values(state.months)) m.expenses = m.expenses.filter(e => !set.has(e.id));
}

function renderLoans() {
  $('monthLabel').textContent = 'Créances & dettes';
  const T = LT();
  const list = state[loanKind];
  const lent = list.reduce((s, l) => s + l.amount, 0);
  const paid = list.reduce((s, l) => s + Math.min(l.amount, loanPaid(l)), 0);
  const open = list.filter(l => loanLeft(l) > 0)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const done = list.filter(l => loanLeft(l) === 0);
  const late = open.filter(l => dueInfo(l).late).reduce((s, l) => s + loanLeft(l), 0);
  const pct = lent > 0 ? Math.round(paid / lent * 100) : 0;

  const row = l => {
    const left = loanLeft(l), p = loanPaid(l);
    const due = dueInfo(l);
    const sub = left === 0
      ? `${T.doneOn}${l.payments.length ? ' le ' + fmtDate(l.payments.reduce((d, x) => (x.date > d ? x.date : d), '')) : ''}`
      : (due.late ? '⚠️ ' : '') + due.text;
    return `
    <li class="row">
      <button class="body" data-act="open-loan" data-id="${l.id}">
        <span class="ico" style="--h:${hueOf(l.person)}" aria-hidden="true">${esc(l.person.trim().charAt(0).toUpperCase())}</span>
        <span class="cat-main">
          <span class="cat-top"><span class="who">${esc(l.person)}</span><b>${num(left === 0 ? l.amount : left)}</b></span>
          ${left > 0 && p > 0 ? `<span class="bar"><i style="width:${Math.round(p / l.amount * 100)}%"></i></span>` : ''}
          <span class="sub ${due.late && left > 0 ? 'late' : ''}">${esc(sub)}${left > 0 && p > 0 ? ` · ${num(p)} ${T.part} ${num(l.amount)}` : ''}</span>
        </span>
      </button>
    </li>`;
  };
  const seg = (kind, label) =>
    `<button data-act="loan-kind" data-kind="${kind}" aria-pressed="${loanKind === kind}">${label}</button>`;

  app.innerHTML = `
  <section class="summary">
    <div class="seg" role="group" aria-label="Liste affichée">${seg('loans', 'On me doit')}${seg('debts', 'Je dois')}</div>
    <div class="label">${T.hero}</div>
    <div class="big">${num(lent - paid)} <small>FCFA</small></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="bar-caption">${lent > 0 ? `${pct} % ${T.caption}` : T.none}</div>
    <div class="stats">
      <div class="stat"><span>${T.lent}</span><b>${num(lent)}</b></div>
      <div class="stat"><span>${T.paid}</span><b>${num(paid)}</b></div>
      <div class="stat"><span>En retard</span><b>${num(late)}</b></div>
    </div>
  </section>
  <button class="btn primary block big-add" data-act="add-loan">${T.add}</button>
  <section class="card">
    <div class="section-head"><h2>En cours</h2><span class="hint">${plural(open.length, T.count)}</span></div>
    ${open.length ? `<ul class="list">${open.map(row).join('')}</ul>` : `<p class="empty">${T.empty}</p>`}
  </section>
  ${done.length ? `
  <section class="card">
    <div class="section-head"><h2>${T.doneTitle}</h2><span class="hint">${fcfa(done.reduce((s, l) => s + l.amount, 0))}</span></div>
    <ul class="list done-loans">${done.map(row).join('')}</ul>
  </section>` : ''}`;
}

/* Formulaire d'un prêt ou d'une dette */

const loanDlg = $('loanDialog');
let loanId = null;
function openLoanForm(id) {
  loanId = id;
  const T = LT();
  const l = id ? state[loanKind].find(x => x.id === id) : null;
  $('loanTitle').textContent = l ? T.formEdit : T.formNew;
  $('lPersonLabel').textContent = T.who;
  $('lAmountLabel').textContent = T.amount;
  $('lDateLabel').textContent = T.date;
  $('lNote').placeholder = loanKind === 'debts' ? 'Ex. achat à crédit, prêt pour le loyer' : 'Ex. pour la scolarité';
  $('lPerson').value = l ? l.person : '';
  $('lAmount').value = l ? l.amount : '';
  $('lDate').value = l ? l.date || '' : todayStr();
  $('lDue').value = l ? l.due || '' : '';
  $('lNote').value = l ? l.note || '' : '';
  $('lError').hidden = true;
  loanDlg.showModal();
  if (!l) $('lPerson').focus();
}
$('loanForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const fail = msg => { $('lError').textContent = msg; $('lError').hidden = false; };
  const person = $('lPerson').value.trim();
  const amount = parseAmount($('lAmount').value);
  const date = $('lDate').value, due = $('lDue').value;
  if (!person) return fail('Indiquez le nom de la personne.');
  if (!(amount > 0)) return fail('Indiquez un montant supérieur à 0.');
  if (!date) return fail('Indiquez la date.');
  if (due && due < date) return fail("L'échéance ne peut pas être avant la date de départ.");
  const l = loanId && state[loanKind].find(x => x.id === loanId);
  if (l && amount < loanPaid(l)) return fail(`${fcfa(loanPaid(l))} ont déjà été payés : le montant ne peut pas être inférieur.`);
  const fields = { person, amount, date, due: due || null, note: $('lNote').value.trim() };
  if (l) Object.assign(l, fields);
  else state[loanKind].push({ id: uid(), ...fields, payments: [] });
  save();
  loanDlg.close();
  render();
  if (l) openLoan(l.id);
});
$('lCancel').addEventListener('click', () => { loanDlg.close(); if (loanId) openLoan(loanId); });
loanDlg.addEventListener('click', ev => { if (ev.target === loanDlg) loanDlg.close(); });

/* Fiche d'une créance ou d'une dette : paiements */

const detailDlg = $('loanDetail');
function openLoan(id) {
  const l = state[loanKind].find(x => x.id === id);
  if (!l) return;
  loanId = id;
  const T = LT();
  const left = loanLeft(l), paid = loanPaid(l);
  const due = dueInfo(l);
  const pays = [...l.payments].sort((a, b) => b.date.localeCompare(a.date)).map(p => `
    <li><span>${esc(fmtDate(p.date))}${p.expenseId ? ' · déduit du solde' : ''}</span><b>${num(p.amount)}</b>
      <button type="button" class="x" data-pay="${p.id}" aria-label="Supprimer ce paiement">✕</button></li>`).join('');
  $('loanDetailBody').innerHTML = `
    <h2>${esc(l.person)}</h2>
    <div class="stats detail-stats">
      <div class="stat"><span>${T.lent}</span><b>${num(l.amount)}</b></div>
      <div class="stat"><span>${T.paid}</span><b>${num(paid)}</b></div>
      <div class="stat ${left > 0 && due.late ? 'bad' : ''}"><span>${T.left}</span><b>${num(left)}</b></div>
    </div>
    <p class="meta">${T.startedOn} ${esc(fmtDate(l.date))}. ${left === 0 ? T.allPaid : (due.late ? '⚠️ ' : '') + esc(due.text) + '.'}</p>
    ${l.note ? `<p class="meta">${esc(l.note)}</p>` : ''}
    ${left > 0 ? `
    <form id="payForm" novalidate>
      <div class="field-title">${T.payTitle}</div>
      <div class="pay-line">
        <input id="pAmount" type="text" inputmode="numeric" autocomplete="off" value="${left}" aria-label="Montant (FCFA)">
        <input id="pDate" type="date" value="${todayStr()}" aria-label="Date du paiement">
      </div>
      ${loanKind === 'debts' ? `
      <label class="check-line"><input id="pDeduct" type="checkbox" checked>
        <span>Déduire aussi de mon solde du mois</span></label>` : ''}
      <p class="error" id="pError" hidden></p>
      <button type="submit" class="btn primary block">${T.payBtn}</button>
    </form>` : ''}
    ${pays ? `<div class="field-title pays-title">${T.paysTitle}</div><ul class="pays">${pays}</ul>` : ''}
    <div class="actions">
      <button type="button" class="btn danger" data-loan="delete">Supprimer</button>
      <span class="spacer"></span>
      <button type="button" class="btn" data-loan="edit">Modifier</button>
      <button type="button" class="btn" data-loan="close">Fermer</button>
    </div>`;
  if (!detailDlg.open) detailDlg.showModal();
  detailDlg.scrollTop = 0;
}
detailDlg.addEventListener('submit', ev => {
  ev.preventDefault();
  const debt = loanKind === 'debts';
  const l = state[loanKind].find(x => x.id === loanId);
  const amount = parseAmount($('pAmount').value);
  const date = $('pDate').value;
  const fail = msg => { $('pError').textContent = msg; $('pError').hidden = false; };
  if (!(amount > 0)) return fail('Indiquez le montant.');
  if (amount > loanLeft(l)) return fail(`Il ne reste que ${fcfa(loanLeft(l))} ${LT().tooMuch}.`);
  if (!date) return fail('Indiquez la date.');
  const pay = { id: uid(), amount, date };
  // Un paiement de dette est aussi une sortie d'argent : il devient une dépense du mois.
  if (debt && $('pDeduct').checked) {
    pay.expenseId = uid();
    month(date.slice(0, 7), true).expenses.push(
      { id: pay.expenseId, category: 'dette', amount, date, label: `Dette : ${l.person}` });
  }
  l.payments.push(pay);
  save();
  render();
  const left = loanLeft(l);
  if (debt) {
    toast(left === 0 ? `Vous avez payé ${fcfa(amount)}. Votre dette envers ${l.person} est soldée.`
      : `Vous avez payé ${fcfa(amount)}. Il vous reste ${fcfa(left)} à payer à ${l.person}.`);
  } else {
    toast(left === 0 ? `${l.person} a tout remboursé.` : `${fcfa(amount)} reçus. ${l.person} vous doit encore ${fcfa(left)}.`);
  }
  if (left === 0) detailDlg.close(); else openLoan(l.id);
});
detailDlg.addEventListener('click', ev => {
  if (ev.target === detailDlg) return detailDlg.close();
  const l = state[loanKind].find(x => x.id === loanId);
  const pay = ev.target.closest('[data-pay]');
  if (pay) {
    const p = l.payments.find(x => x.id === pay.dataset.pay);
    if (!confirm(p.expenseId ? 'Supprimer ce paiement ? La dépense correspondante sera aussi retirée.' : 'Supprimer ce paiement ?')) return;
    dropExpenses([p.expenseId]);
    l.payments = l.payments.filter(x => x !== p);
    save(); render(); return openLoan(l.id);
  }
  const b = ev.target.closest('[data-loan]');
  if (!b) return;
  const a = b.dataset.loan;
  if (a === 'close') return detailDlg.close();
  if (a === 'edit') { detailDlg.close(); return openLoanForm(l.id); }
  if (a === 'delete' && confirm(`${LT().del} ${l.person}, avec ses paiements ?`)) {
    dropExpenses(l.payments.map(p => p.expenseId));
    state[loanKind] = state[loanKind].filter(x => x.id !== l.id);
    save(); detailDlg.close(); render();
  }
});
app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'add-loan') openLoanForm(null);
  else if (act === 'open-loan') openLoan(el.dataset.id);
  else if (act === 'loan-kind') { loanKind = el.dataset.kind; render(); }
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
