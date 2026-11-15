// Token Radar v2 — plain dashboard. Reads window.RADAR (written by main.ts), renders the ranked
// board, a live-token tab, the model's page, a filterable sortable table, and a per-protocol detail
// drawer with the model's own inputs and the protocol's farm plan. No network: every byte in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var drawer = document.getElementById('drawer');
  var scrim = document.getElementById('scrim');
  var state = {
    q: '', category: '', chain: '', watchOnly: false,
    sort: 'implied_desc', tab: 'board', selected: null,
  };

  // ---------- formatting ----------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30) + 'mo';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (n === null || n === undefined) ? '—' : '×' + Number(n).toFixed(3); }

  // ---------- elements ----------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }
  function pill(text, kind) { return el('span', { class: 'pill ' + kind, text: text }); }

  // ---------- header meta ----------
  function fillMeta() {
    document.getElementById('model-version').textContent = DATA.model_version;
    var ml = document.getElementById('meta-line');
    ml.textContent = 'snapshot ' + DATA.as_of + ' · ' + DATA.source +
      ' · watchlist ' + DATA.watchlist_size + ' protocols ≥ $' + (DATA.floor_usd / 1e6) + 'M TVL' +
      ' · board ' + DATA.rows.length + ' rows (' + DATA.watch_covered + ' watchlist + ' + DATA.early_size + ' early)' +
      ' · median pre-token TVL ' + fmtUsd(DATA.median_tvl);
  }

  // ---------- filters ----------
  function buildFilters() {
    var cats = new Set(); var chains = new Set();
    DATA.rows.forEach(function (r) {
      if (r.category) cats.add(r.category);
      (r.chains || []).forEach(function (c) { chains.add(c); });
    });
    var catSel = document.getElementById('category');
    Array.from(cats).sort().forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chainSel = document.getElementById('chain');
    Array.from(chains).sort().forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });

    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value.toLowerCase(); render(); });
    catSel.addEventListener('change', function (e) { state.category = e.target.value; render(); });
    chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    document.getElementById('watch-only').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });
  }

  // ---------- tabs ----------
  function buildTabs() {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        state.tab = t.dataset.tab;
        document.getElementById('controls').style.display = state.tab === 'board' ? '' : 'none';
        render();
      });
    });
  }

  // ---------- board tab ----------
  var SORTS = {
    implied_desc: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    implied_asc: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    tvl_desc: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth_desc: function (a, b) { return (b.change_7d || -999) - (a.change_7d || -999); },
    age_asc: function (a, b) { return (a.age_days === null ? 9e9 : a.age_days) - (b.age_days === null ? 9e9 : b.age_days); },
    age_desc: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
    rank_asc: function (a, b) { return a.rank - b.rank; },
  };

  function filtered() {
    var rows = DATA.rows.slice();
    if (state.q) {
      var q = state.q;
      rows = rows.filter(function (r) {
        return r.name.toLowerCase().indexOf(q) >= 0
          || r.slug.toLowerCase().indexOf(q) >= 0
          || (r.category || '').toLowerCase().indexOf(q) >= 0
          || (r.chains || []).some(function (c) { return c.toLowerCase().indexOf(q) >= 0; });
      });
    }
    if (state.category) rows = rows.filter(function (r) { return r.category === state.category; });
    if (state.chain) rows = rows.filter(function (r) { return (r.chains || []).indexOf(state.chain) >= 0; });
    if (state.watchOnly) rows = rows.filter(function (r) { return r.rank <= DATA.watchlist_size || isWatch(r); });
    rows.sort(SORTS[state.sort] || SORTS.implied_desc);
    return rows;
  }

  var watchSet = null;
  function isWatch(r) {
    if (watchSet === null) watchSet = new Set(DATA.rows.slice(0, DATA.watchlist_size).map(function (x) { return x.slug; }));
    return watchSet.has(r.slug);
  }

  function renderBoard() {
    var rows = filtered();
    var count = document.getElementById('count');
    count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
    if (rows.length === 0) {
      app.textContent = '';
      app.appendChild(el('p', { class: 'empty', text: 'No protocol matches the filter.' }));
      return;
    }
    var thead = el('thead');
    var hr = el('tr');
    [['rank', 'Rank'], ['name', 'Protocol'], ['cat', 'Sector'], ['chains', 'Chains'], ['tvl', 'TVL'],
     ['growth', '7-day'], ['age', 'Age'], ['implied', 'Implied value']].forEach(function (pair) {
      hr.appendChild(el('th', { class: pair[0] === 'implied' || pair[0] === 'tvl' ? 'num' : '', text: pair[1] }));
    });
    thead.appendChild(hr);
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', { class: 'row' + (r.rank <= 3 ? ' top' : '') });
      tr.addEventListener('click', function () { openDrawer(r.slug); });
      tr.appendChild(el('td', { class: 'rank', text: '#' + r.rank }));
      var nameCell = el('td', { class: 'name-cell' }, r.name);
      nameCell.appendChild(el('span', { class: 'slug', text: r.slug }));
      tr.appendChild(nameCell);
      var catTd = el('td');
      if (r.category) catTd.appendChild(pill(r.category, isWatch(r) ? 'watch' : 'early'));
      else catTd.appendChild(el('span', { class: 'chains-list', text: '—' }));
      tr.appendChild(catTd);
      tr.appendChild(el('td', { class: 'chains-list', text: (r.chains || []).length > 3 ? (r.chains.slice(0, 3).join(', ') + ' +' + (r.chains.length - 3)) : (r.chains || []).join(', ') || '—' }));
      tr.appendChild(el('td', { class: 'tvl-cell', text: fmtUsd(r.tvl_usd) }));
      var growthTd = el('td', { class: 'num' });
      if (r.change_7d !== null && r.change_7d !== undefined) {
        growthTd.appendChild(pill(fmtPct(r.change_7d), r.change_7d >= 0 ? 'growth-up' : 'growth-down'));
      } else growthTd.appendChild(el('span', { class: 'chains-list', text: '—' }));
      tr.appendChild(growthTd);
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'implied', text: fmtUsd(r.implied_value_usd) }));
      tbody.appendChild(tr);
    });
    var table = el('table', { class: 'grid' }, thead, tbody);
    app.textContent = '';
    app.appendChild(table);
  }

  // ---------- live tab ----------
  function renderLive() {
    app.textContent = '';
    if (!DATA.live || DATA.live.length === 0) { app.appendChild(el('p', { class: 'empty', text: 'No live-token protocols in the snapshot.' })); return; }
    var thead = el('thead', {}, el('tr', {},
      el('th', { text: 'Protocol' }), el('th', { text: 'Sector' }), el('th', { class: 'num', text: 'TVL' }),
      el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: '7-day' })));
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'row' },
        el('td', { class: 'name-cell' }, r.name, el('span', { class: 'slug', text: r.slug })),
        el('td', {}, r.category ? pill(r.category, 'live') : document.createTextNode('—')),
        el('td', { class: 'tvl-cell', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num implied', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtPct(r.change_7d) })));
    });
    app.appendChild(el('p', { class: 'tagline', text: 'These protocols already have a token: their value is the market\'s own, and they sit outside the radar\'s ranking.' }));
    app.appendChild(el('table', { class: 'grid' }, thead, tbody));
  }

  // ---------- model tab ----------
  function renderModel() {
    app.textContent = '';
    var m = DATA.model;
    var grid = el('div', { class: 'model-grid' });
    grid.appendChild(el('div', { class: 'model-card' },
      el('h3', { text: 'The formula' }),
      el('p', { text: 'Every protocol scores from its own snapshot record alone. No name is special-cased: the same function scores every row, and the board\'s ranks follow the score, never a list.' }),
      el('div', { class: 'formula', text: 'implied = base × participation^' + m.part_exp + ' × growth × longevity × focus × sector' })));
    grid.appendChild(el('div', { class: 'model-card' },
      el('h3', { text: 'The five signals' }),
      el('p', {}, el('strong', { text: 'Participation' }), document.createTextNode(' — TVL against the pre-token field\'s median (' + fmtUsd(DATA.median_tvl) + '), raised to the ' + m.part_exp + ' power so depth counts without dominating.')),
      el('p', {}, el('strong', { text: 'Growth' }), document.createTextNode(' — the 7-day TVL change, clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%], weighing ' + m.growth_weight + '.')),
      el('p', {}, el('strong', { text: 'Longevity' }), document.createTextNode(' — 1 + min(age, ' + m.maturity_days + ' days)/' + m.maturity_days + '; a protocol that has run long without a token has survived.')),
      el('p', {}, el('strong', { text: 'Focus' }), document.createTextNode(' — ×' + (1 + m.single_chain_bonus) + ' when the protocol runs on one chain: a sharper community farms harder.')),
      el('p', {}, el('strong', { text: 'Sector' }), document.createTextNode(' — the category\'s token-readiness weight, below.'))));
    var weights = el('table', { class: 'weights' });
    Object.keys(DATA.model).forEach(function (k) {
      weights.appendChild(el('tr', {}, el('td', { text: k }), el('td', { text: String(DATA.model[k]) })));
    });
    grid.appendChild(el('div', { class: 'model-card' },
      el('h3', { text: 'Constants' }),
      el('p', { text: 'Stated, not hidden — the same numbers main.ts scores with.' }),
      weights));
    app.appendChild(el('div', { class: 'section-title', text: 'The model' }));
    app.appendChild(grid);
  }

  // ---------- drawer ----------
  function openDrawer(slug) {
    var r = DATA.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    state.selected = slug;
    drawer.textContent = '';
    drawer.hidden = false; scrim.hidden = false;
    var close = el('button', { class: 'close', text: 'Close' });
    close.addEventListener('click', closeDrawer);
    scrim.onclick = closeDrawer;

    drawer.appendChild(close);
    drawer.appendChild(el('h2', { text: '#' + r.rank + ' — ' + r.name }));
    drawer.appendChild(el('div', { class: 'slug-line', text: r.slug + ' · ' + (r.category || 'uncategorised') }));

    var kv = el('dl', { class: 'kv' });
    function row(k, v) { kv.appendChild(el('dt', { text: k })); kv.appendChild(el('dd', {}, v)); }
    row('TVL', fmtUsd(r.tvl_usd));
    row('7-day change', fmtPct(r.change_7d));
    row('Listed at', r.listed_at || 'unknown');
    row('Age', fmtAge(r.age_days));
    row('Chains', (r.chains || []).join(', ') || '—');
    row('Watchlist', isWatch(r) ? 'yes — the house\'s own pre-token list' : 'no — the radar\'s early find, below the watchlist floor');
    drawer.appendChild(kv);

    drawer.appendChild(el('div', { class: 'section-title', text: 'The model\'s inputs' }));
    var kv2 = el('dl', { class: 'kv' });
    function row2(k, v) { kv2.appendChild(el('dt', { text: k })); kv2.appendChild(el('dd', {}, v)); }
    row2('Participation', fmtMult(r.participation));
    row2('Growth (' + fmtPct(r.growth_pct) + ')', fmtMult(r.growth_multiplier));
    row2('Longevity', fmtMult(r.longevity_multiplier));
    row2('Focus', fmtMult(r.focus_multiplier));
    row2('Sector', fmtMult(r.category_multiplier));
    drawer.appendChild(kv2);
    drawer.appendChild(el('div', { class: 'model-note' },
      el('strong', { text: 'Implied value ' + fmtUsd(r.implied_value_usd) + '. ' }),
      document.createTextNode('What this protocol\'s token would be worth if its record stayed as it is — the entry\'s own claim, from the snapshot\'s own figures, not a prediction that a token comes.')));

    drawer.appendChild(el('div', { class: 'section-title', text: 'How to farm it' }));
    var ol = el('ol', { class: 'farm' });
    (r.farm_steps || []).forEach(function (s) { ol.appendChild(el('li', { text: s })); });
    drawer.appendChild(ol);
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawer.hidden = true; scrim.hidden = true;
    document.body.style.overflow = '';
    state.selected = null;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  // ---------- render ----------
  function render() {
    if (state.tab === 'live') renderLive();
    else if (state.tab === 'model') renderModel();
    else renderBoard();
  }

  fillMeta();
  buildFilters();
  buildTabs();
  render();
  var board = document.getElementById('board');
  board.setAttribute('aria-busy', 'false');
})();
