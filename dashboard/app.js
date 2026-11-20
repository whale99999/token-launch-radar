// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, filters, a per-protocol
// detail view with the model's own inputs, and each protocol's farm plan.
// No network: every byte it shows ships in data.js.
//
// The page recomputes every row with impliedOf() — the same arithmetic as
// lib/model.ts impliedValue() — and checks the number board.json carries, so
// the page's code and the board's data are visibly the same model. The farm
// plan is the same derivation main.ts writes to board.json: category, chains,
// TVL and age decide the action, the capital, the hold and every cost and
// time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', watchlistOnly: false, sort: 'implied', dir: -1, selected: null };
  var tbody = document.getElementById('rows');
  var emptyBox = document.getElementById('empty');
  var table = document.getElementById('board');
  var countEl = document.getElementById('count');
  var dialog = document.getElementById('detail');
  var detailBody = document.getElementById('detail-body');

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // --- the model, in the page, exactly as lib/model.ts states it ------------
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = 1 + Math.min(Math.max(chains - 1, 0), model.chain_max_extra) * model.chain_step;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * chainMult));
  }

  // --- the farm plan, in the page, exactly as lib/model.ts states it --------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the deposit open so it earns yield and counts as usage.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open through at least one fee cycle.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and leave the shares untouched.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and put the bridged funds to work in its app the same day.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position, then close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one small position on a market that resolves within two weeks.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares for the full hold period.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it so the balance is visible on-chain.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the full hold period.';
    if (c.indexOf('liquid') >= 0) return 'Deposit $' + capital + ' of the liquid staking asset into ' + name + ' on ' + chain + ' and keep the receipt token.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open for the full hold period.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow $25 of USDC against the deposit on ' + name + ', repay it a week later, and keep the borrow receipt in your log.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $25 of USDC for another asset inside ' + name + ' on ' + chain + ' once a week, alternating the direction each time.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open a second small position on ' + name + ' in the opposite direction and close both before the weekend.';
    if (c.indexOf('prediction') >= 0) return 'Place a second $10 position on a different ' + name + ' market and let it resolve instead of cashing out early.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the rewards ' + name + ' pays out instead of withdrawing them, so the stake compounds in the same wallet.';
    return 'Do one extra on-chain action on ' + name + ' each week — a swap, a vote, or a small deposit — and record its transaction hash.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the $' + capital + ' you plan to farm, and write its seed phrase on paper and store it offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $25 of the same capital and $2 of gas', time: '10 minutes a week' },
      { text: 'Repeat one qualifying action on ' + p.name + ' every week — a deposit, a borrow, a swap or a vote — so the wallet shows steady use.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot of the protocol.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page from its official site and claim only from the link it publishes.", cost: 'no fee to check, and never pay anyone to claim', time: '10 minutes' },
      { text: 'Write the wallet address, the dates and every transaction hash in a farm log, then plan the exit: withdraw half first and check the funds arrive.', cost: 'nothing but the log, plus about $2 of gas to exit', time: '10 minutes' }
    ].map(stepText);
  }

  // --- filtering and sorting -------------------------------------------------
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = a.chains ? a.chains.length : 0; bv = b.chains ? b.chains.length : 0; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // --- rendering -------------------------------------------------------------
  function rowHtml(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    var pct = Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100));
    var chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'an unnamed chain';
    var tag = r.watchlist ? '<span class="watch-tag">WATCHLIST</span>' : '';
    return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
      '<td><span class="num rank-badge">' + r.rank + '</span></td>' +
      '<td><div class="name"><b>' + esc(r.name) + tag + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chains) + '</span></div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + growthClass + '">' + growth + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num">' + (r.chains ? r.chains.length : 0) + '</td>' +
      '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
      '<td><span class="pill">no token</span></td></tr>';
  }
  function liveRowHtml(r) {
    var chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
    return '<tr tabindex="0">' +
      '<td><span class="num rank-badge">live</span></td>' +
      '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chains) + '</span></div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
      '<td class="num">—</td><td class="num">' + (r.chains ? r.chains.length : 0) + '</td>' +
      '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
      '<td><span class="pill live">already trades</span></td></tr>';
  }

  function renderBoard() {
    var list = sortedRows(filteredRows());
    var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd || 1 : 1;
    tbody.innerHTML = list.map(function (r) { return rowHtml(r, maxImplied); }).join('');
    table.style.display = '';
    emptyBox.hidden = list.length !== 0;
    countEl.textContent = list.length + ' of ' + DATA.board_size + ' pre-token rows shown';
    document.querySelectorAll('#board thead th button').forEach(function (btn) {
      var arrow = btn.querySelector('.arrow');
      if (arrow) arrow.remove();
      if (btn.getAttribute('data-sort') === state.sort) {
        var s = document.createElement('span');
        s.className = 'arrow';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = state.dir < 0 ? ' ↓' : ' ↑';
        btn.appendChild(s);
      }
    });
  }
  function renderLive() {
    tbody.innerHTML = DATA.live.map(liveRowHtml).join('');
    table.style.display = '';
    emptyBox.hidden = true;
    countEl.textContent = DATA.live.length + ' live-token protocols — market caps, not models';
    document.querySelector('#board caption').textContent = 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.';
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    var chains = row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain';
    var multBar = function (label, value, max) {
      var w = Math.max(4, Math.round((value / max) * 100));
      return '<div class="mrow"><span>' + label + '</span><div class="bar" aria-hidden="true"><i style="width:' + w + '%"></i></div><span class="num">' + value.toFixed(2) + 'x</span></div>';
    };
    detailBody.innerHTML =
      '<div class="detail-head"><div><span class="brand-name">RANK ' + row.rank + ' OF ' + DATA.board_size + (row.watchlist ? ' · WATCHLIST' : '') + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc(chains) + '</p></div>' +
      '<button class="close" type="button" id="detail-close">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value</h3><div class="equation">' +
      '<div><span>TVL</span><b class="num">' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Seven-day growth</span><b class="num">' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b class="num">' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Chains</span><b class="num">' + (row.chains ? row.chains.length : 0) + '</b></div>' +
      '<div class="total"><span>Implied value</span><b class="num">' + fmtUsd(row.implied_value_usd) + '</b></div></div>' +
      '<div class="mult-bars">' + multBar('Growth multiplier', row.growth_multiplier, 2.2) + multBar('Maturity multiplier', row.maturity_multiplier, 1) + multBar('Chain multiplier', row.chain_multiplier, 1.2) + '</div>' +
      '<p class="sub">Model ' + esc(DATA.model_version) + ': the page recomputes this row as ' + fmtUsd(recomputed) +
      (matches ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') +
      ' This is an estimate, not a price.</p></section>' +
      '<section class="detail-section"><h3>Farm plan — 7 steps</h3><ol class="steps">' +
      steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
      }).join('') + '</ol></section>';
    document.getElementById('detail-close').addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    if (state.tab === 'live') renderLive();
    else renderBoard();
    if (state.selected) openDetail(state.selected);
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('p')) state.selected = params.get('p');
  }

  // --- static facts ----------------------------------------------------------
  document.getElementById('meta-snapshot').textContent = 'Snapshot ' + DATA.as_of;
  document.getElementById('meta-model').textContent = DATA.model_version + ' model';
  document.getElementById('fact-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
  document.getElementById('fact-board').textContent = String(DATA.board_size);
  document.getElementById('fact-early').textContent = String(DATA.early_size);
  document.getElementById('fact-live').textContent = String(DATA.live_size);
  document.getElementById('fact-top').textContent = DATA.rows.length ? fmtUsd(DATA.rows[0].implied_value_usd) : '—';
  var m = DATA.model;
  document.getElementById('formula').textContent =
    'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')' +
    ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')' +
    ' x (1 + 0.04 x min(max(chains - 1, 0), ' + m.chain_max_extra + ')) )';

  // --- controls --------------------------------------------------------------
  var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
  var catSel = document.getElementById('category');
  categories.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });
  var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    chainSel.appendChild(o);
  });
  var search = document.getElementById('q');
  var watchOnly = document.getElementById('watchlist-only');
  var tabPre = document.getElementById('tab-pre');
  var tabLive = document.getElementById('tab-live');
  readHash();
  search.value = state.q;
  catSel.value = state.category;
  chainSel.value = state.chain;
  watchOnly.checked = state.watchlistOnly;
  tabPre.setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
  tabLive.setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');

  search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
  catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
  chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
  watchOnly.addEventListener('change', function () { state.watchlistOnly = watchOnly.checked; writeHash(); render(); });
  tabPre.addEventListener('click', function () {
    state.tab = 'pre-token';
    tabPre.setAttribute('aria-pressed', 'true'); tabLive.setAttribute('aria-pressed', 'false');
    document.querySelector('#board caption').textContent = 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.';
    render();
  });
  tabLive.addEventListener('click', function () {
    state.tab = 'live';
    tabPre.setAttribute('aria-pressed', 'false'); tabLive.setAttribute('aria-pressed', 'true');
    render();
  });
  document.getElementById('clear-filters').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false;
    search.value = ''; catSel.value = 'all'; chainSel.value = 'all'; watchOnly.checked = false;
    writeHash(); render();
  });
  document.querySelectorAll('#board thead th button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = -1; }
      render();
    });
  });
  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr && tr.getAttribute('data-slug')) openDetail(tr.getAttribute('data-slug'));
  });
  tbody.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'TR') {
      e.preventDefault();
      var slug = e.target.getAttribute('data-slug');
      if (slug) openDetail(slug);
    }
  });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });

  render();
})();
