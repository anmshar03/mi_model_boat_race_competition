import { loadResults } from './sheet.js?v=3';

const select = selector => document.querySelector(selector);
const content = select('#race-content');
const refresh = select('#refresh');
const connection = select('#connection');
const views = [...document.querySelectorAll('.views a')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const SYNC_INTERVAL_MS = 12000;
const RETRY_INTERVAL_MS = 10000;
const CACHE_KEY = 'Model-boat-race:results:v1';
const dash = '—';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const text = (value, fallback = dash) => escape(value || fallback);
const hasValue = value => Boolean(value?.trim()) && !/^#(?:N\/A|REF!|VALUE!|DIV\/0!|ERROR!|NAME\?|NUM!|NULL!)$/.test(value.trim());
const pill = (label, tone = '') => `<span class="pill ${tone}">${text(label)}</span>`;
const rowHtml = (cells, labels) => `<tr role="row">${cells.map((cell, index) =>
  `<td role="cell"><span class="cell-label" aria-hidden="true">${labels[index]}</span>${cell}</td>`).join('')}</tr>`;
const empty = message => `<div class="notice">${escape(message)}</div>`;

function playMotion(elements, keyframes, options) {
  if (reducedMotion.matches) return;
  try {
    window.Motion?.animate(elements, keyframes, options);
  } catch (error) {
    console.warn('Animation unavailable', error);
  }
}

function animateEntrance(elements, delay = 0) {
  playMotion(elements, {
    opacity: [0.8, 1],
    transform: ['translateY(6px)', 'none'],
  }, { duration: 0.26, ease: 'easeOut', delay });
}

const cached = readCache();
const snapshot = cached?.data ?? {};
const serialized = Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, JSON.stringify(value)]));
let pending = false;
let firstCheckFinished = false;
let timer;
let view = '';
const filters = { raceSearch: '', round: '' };

function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (saved?.data && Number.isFinite(Date.parse(saved.updatedAt)) && Object.values(saved.data).every(Array.isArray)) {
      delete saved.data.teams;
      return saved;
    }
  } catch {
    // Browser storage can be disabled. Live results still work.
  }
}

function showUpdatedAt(updatedAt) {
  select('#last-check').textContent = 'Last updated ' + new Date(updatedAt).toLocaleString();
}

const fixtures = {
  standings: ['Rank', 'Team', 'Played', 'Wins', 'Losses', 'Avg. time', 'Playoff status'],
  races: ['Race', 'Time slot', 'Round', 'Lane 1', 'Time', 'Lane 2', 'Time', 'Recorded winner', 'Time check'],
};

function table(headers, rows, layout) {
  if (!rows.length) return empty('No matching entries.');
  return `<div class="table-wrap ${layout}" tabindex="0" role="region" aria-label="Results table"><table role="table">
    <thead role="rowgroup"><tr role="row">${headers.map(header => `<th role="columnheader" scope="col">${header}</th>`).join('')}</tr></thead>
    <tbody role="rowgroup">${rows.join('')}</tbody>
  </table></div>`;
}

function panel(title, body) {
  return `<section class="panel"><header class="panel-header"><h2>${title}</h2></header>${body}</section>`;
}

function standingsTable(rows) {
  const headers = fixtures.standings;
  return table(headers, rows.map(([rank, name, played, wins, losses, time, status]) => {
    const first = [`<span class="rank ${rank === '1' ? 'leader' : ''}">${text(rank)}</span>`,
      `<span class="team-name">${text(name)}</span>`];
    const average = `<span class="time">${text(time)}</span>`;
    const qualification = /^qualified\b/i.test(status || '');
    return rowHtml([...first, text(played), text(wins), text(losses), average,
      status ? pill(status, qualification ? 'good' : '') : dash], headers);
  }), 'table-standings');
}

function races() {
  const rounds = [...new Set(snapshot.races.map(row => row[2]).filter(Boolean))];
  if (!rounds.includes(filters.round)) filters.round = '';
  return panel('Group-stage schedule',
    `<div class="controls">
      <label>Team <input id="race-search" type="search" placeholder="Search teams" value="${escape(filters.raceSearch)}"></label>
      <label>Round <select id="round"><option value="">All rounds</option>${rounds.map(round =>
      `<option ${round === filters.round ? 'selected' : ''}>${escape(round)}</option>`).join('')}</select></label>
    </div><div id="filtered-results"></div>`);
}

function raceRows() {
  const term = filters.raceSearch.trim().toLowerCase();
  const rows = snapshot.races.filter(row => (!filters.round || row[2] === filters.round) &&
    [row[3], row[5]].some(name => (name || '').toLowerCase().includes(term)));
  return table(fixtures.races, rows.map(([id, slot, round, lane1, time1, lane2, time2, winner, check]) => {
    const discrepancy = hasValue(winner) && hasValue(check) && [lane1, lane2].includes(check) && check !== winner;
    return rowHtml([`<strong>${text(id)}</strong>`, text(slot), text(round), text(lane1),
      `<span class="time">${text(time1)}</span>`, text(lane2), `<span class="time">${text(time2)}</span>`,
      hasValue(winner) ? pill(winner, 'good') : pill('Pending'), discrepancy ? pill(check, 'warm') : text(check)],
    fixtures.races);
  }), 'table-races');
}

function bracket() {
  const stages = snapshot.bracket.map(stage => `<section class="bracket-stage"><h3>${text(stage.title)}</h3>
    ${stage.matches.map(match => `<article class="match"><header><strong>${text(match.title)}</strong><small>${text(match.slot)}</small></header>
      ${match.lanes.map(lane => `<div class="match-team"><span>${text(lane.seed)}</span>
        <strong class="${hasValue(lane.name) && lane.name === match.winner ? 'win' : ''}">${text(lane.name, 'TBD')}</strong>
        <span class="time">${text(lane.time)}</span></div>`).join('')}
      <p>Recorded winner <strong>${hasValue(match.winner) ? text(match.winner) : dash}</strong></p></article>`).join('')}
    </section>`).join('');
  return panel('Playoff bracket', `<div class="bracket">${stages}</div>`);
}

function renderMetrics() {
  if (snapshot.roster) select('#team-count').textContent = snapshot.roster.filter(row => hasValue(row[1])).length;
  if (snapshot.races) {
    const decided = snapshot.races.filter(row => hasValue(row[7])).length;
    select('#group-progress').textContent = `${decided} of ${snapshot.races.length}`;
  }
  if (snapshot.standings) {
    select('#playoff-count').textContent = snapshot.standings.filter(row => /^qualified\b/i.test(row[6] || '')).length;
  }
  if (snapshot.bracket) {
    const winner = snapshot.bracket.at(-1)?.matches[0]?.winner;
    select('#champion-name').textContent = hasValue(winner)
      ? winner.replace(/^Team \d+\s*[-–—]\s*/i, '') || winner
      : 'To be decided';
  }
}

function renderView({ navigate = false } = {}) {
  const next = location.hash.slice(1);
  const pages = {
    races,
    standings: () => panel('Group-stage standings', standingsTable(snapshot.standings)),
    bracket,
  };
  if (next !== 'race-content' || !view) view = Object.hasOwn(pages, next) ? next : 'races';
  for (const link of views) {
    if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (!snapshot[view]) {
    content.innerHTML = firstCheckFinished ? empty('This view is temporarily unavailable. Use Refresh results to try again.') : '';
    return;
  }
  const focused = document.activeElement;
  const firstRender = content.querySelector('.panel') === null;
  const control = focused?.matches('#race-search, #round') ? focused.id : '';
  const scroll = content.querySelector('.table-wrap')?.scrollLeft || 0;
  content.innerHTML = pages[view]();
  if (navigate || firstRender) animateEntrance(content.firstElementChild);
  if (view === 'races') {
    const filtered = select('#filtered-results');
    const update = () => { filtered.innerHTML = raceRows(); };
    select('#race-search').addEventListener('input', event => { filters.raceSearch = event.target.value; update(); });
    select('#round').addEventListener('change', event => { filters.round = event.target.value; update(); });
    update();
  }
  if (!navigate) {
    const scroller = content.querySelector('.table-wrap');
    if (scroller) scroller.scrollLeft = scroll;
    if (control) {
      const replacement = document.getElementById(control);
      replacement?.focus({ preventScroll: true });
      if (replacement?.type === 'search' && focused.selectionStart != null) {
        replacement.setSelectionRange(focused.selectionStart, focused.selectionEnd);
      }
    }
  }
}

function status(state, label) {
  if (connection.dataset.state === state) return;
  connection.dataset.state = state;
  connection.textContent = label;
}

async function sync({ manual = false } = {}) {
  if (pending) return;
  clearTimeout(timer);
  pending = true;
  refresh.setAttribute('aria-busy', 'true');
  if (manual) {
    playMotion(refresh.firstElementChild, {
      transform: ['rotate(0deg)', 'rotate(360deg)'],
    }, { duration: 0.38, ease: 'easeOut' });
  }
  let changed = false;
  try {
    const { received, complete } = await loadResults((key, data) => {
      const incoming = JSON.stringify(data);
      if (incoming === serialized[key]) return;
      snapshot[key] = data;
      serialized[key] = incoming;
      changed = true;
      renderMetrics();
      if (view === key) renderView();
    });
    if (changed) {
      const updatedAt = new Date().toISOString();
      showUpdatedAt(updatedAt);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: snapshot, updatedAt }));
      } catch {
        // Results remain available for this visit when browser storage is unavailable.
      }
    }
    if (complete) status('live', 'Live');
    else if (received || Object.keys(snapshot).length) status('stale', 'Delayed');
    else status('error', 'Unavailable');
  } finally {
    pending = false;
    firstCheckFinished = true;
    if (!snapshot[view]) renderView();
    refresh.removeAttribute('aria-busy');
    if (!document.hidden) {
      const delay = connection.dataset.state === 'live' ? SYNC_INTERVAL_MS : RETRY_INTERVAL_MS;
      timer = setTimeout(sync, delay);
    }
  }
}

window.addEventListener('hashchange', () => {
  if (location.hash !== '#race-content') renderView({ navigate: true });
});
document.querySelector('main').addEventListener('click', event => {
  const link = event.target.closest('.views a');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  requestAnimationFrame(() => select('.views').scrollIntoView({ block: 'start' }));
});
refresh.addEventListener('click', () => sync({ manual: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else sync();
});
if (!reducedMotion.matches && window.Motion) {
  animateEntrance(document.querySelectorAll('.metric'), window.Motion.stagger(0.045));
}
if (cached) {
  renderMetrics();
  showUpdatedAt(cached.updatedAt);
}
renderView();
sync();
