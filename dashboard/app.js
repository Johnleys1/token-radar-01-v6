// Size Curve Radar dashboard: renders window.RADAR (written by main.ts) with no
// network. Tabs switch the pre-token board and the live anchors; search, chain
// filter and sorting narrow the rows; clicking a row opens its detail view with
// the rank range and the costed farm plan. Hashes drive shareable views:
// #detail=<slug> opens a row, #chain=<chain> filters by chain.

(function () {
  const D = window.RADAR;
  if (!D) { document.body.textContent = 'No radar data loaded.'; return; }

  const $ = (id) => document.getElementById(id);
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const money2 = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const mult = (x) => '×' + x.toFixed(2);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const shortChains = (list) => list.length > 3 ? esc(list.slice(0, 3).join(', ')) + ' and ' + (list.length - 3) + ' more' : esc(list.join(', '));

  $('asof').textContent = D.asOf;
  $('title').textContent = D.title;
  $('modelLine').textContent = D.modelLine + '.';
  document.title = D.title;

  // ---- KPI strip
  const v = D.validation;
  const top3 = D.rows.slice(0, 3).map((r) => r.name + ' ' + money(r.implied_value_usd)).join(' · ');
  const kpis = [
    { k: 'Walk-forward edge', v: mult(v.walkForward.hitRatio), s: 'curve ' + pct(v.walkForward.curveHit) + ' vs flat ' + pct(v.walkForward.flatHit) },
    { k: 'Leave-one-out edge', v: mult(v.leaveOneOut.hitRatio), s: 'curve ' + pct(v.leaveOneOut.curveHit) + ' vs flat ' + pct(v.leaveOneOut.flatHit) },
    { k: 'Watchlist coverage', v: D.counts.watchlistCovered + '/' + D.counts.watchlist, s: D.rows.length + ' board rows · ' + D.counts.protocols + ' protocols' },
    { k: 'Model slope', v: v.slope.toFixed(3), s: 'log(mcap) on log(TVL), n=' + v.liveFitN + ' live' },
    { k: 'Top implied values', v: money(D.rows[0].implied_value_usd), s: top3 },
  ];
  $('kpis').innerHTML = kpis.map((k) =>
    '<div class="kpi"><div class="k">' + esc(k.k) + '</div><div class="v">' + esc(k.v) + '</div><div class="s">' + esc(k.s) + '</div></div>').join('');

  // ---- Validation tables
  const cmpRow = (label, c, f) =>
    '<tr><td>' + label + '</td><td class="num">' + pct(c.hit) + '</td><td class="num">' + c.logErr.toFixed(3) + '</td><td class="num">' + pct(c.medAbsErr) + '</td></tr>';
  const wfRows = cmpRow('Size curve', { hit: v.walkForward.curveHit, logErr: v.walkForward.curveLogErr, medAbsErr: v.walkForward.curveMedAbsErr }) +
    cmpRow('Flat multiple', { hit: v.walkForward.flatHit, logErr: v.walkForward.flatLogErr, medAbsErr: v.walkForward.flatMedAbsErr });
  $('wfTable').querySelector('tbody').innerHTML = wfRows;
  $('wfNote').textContent = 'Fit on ' + v.walkForward.trainN + ' token protocols first tracked before 2024-02-18; tested on the ' + v.walkForward.testN + ' first tracked on or after it.';
  $('wfEdge').textContent = 'Edge: the curve hits ' + mult(v.walkForward.hitRatio) + ' as often as the flat multiple out of sample.';
  const looRows = cmpRow('Size curve', { hit: v.leaveOneOut.curveHit, logErr: v.leaveOneOut.curveLogErr, medAbsErr: v.leaveOneOut.curveMedAbsErr }) +
    cmpRow('Flat multiple', { hit: v.leaveOneOut.flatHit, logErr: v.leaveOneOut.flatLogErr, medAbsErr: v.leaveOneOut.flatMedAbsErr });
  $('looTable').querySelector('tbody').innerHTML = looRows;
  $('looNote').textContent = 'Each of the ' + v.leaveOneOut.n + ' token protocols held out once; the curve is refit on the other ' + (v.leaveOneOut.n - 1) + ' and predicts the held-out one.';
  $('looEdge').textContent = 'Edge: the curve hits ' + mult(v.leaveOneOut.hitRatio) + ' as often as the flat multiple leave-one-out.';

  $('termTable').querySelector('tbody').innerHTML = v.terms.map((t) =>
    '<tr><td>' + esc(t.key) + '<br><span class="note small">' + esc(t.label) + '</span></td>' +
    '<td class="num">' + pct(t.wfHit) + ' / ' + t.wfLogErr.toFixed(3) + '</td>' +
    '<td class="num">' + pct(t.looHit) + ' / ' + t.looLogErr.toFixed(3) + '</td>' +
    '<td><span class="badge ' + (t.kept ? 'keep' : 'drop') + '">' + (t.kept ? 'KEPT' : 'DROPPED') + '</span><br><span class="note small">' + esc(t.reason) + '</span></td></tr>').join('');

  $('cohortTable').querySelector('tbody').innerHTML = v.cohorts.map((c) =>
    '<tr><td>' + esc(c.label) + '</td><td class="num">' + c.protocols + '</td><td class="num">' + c.withToken + '</td><td class="num">' + pct(c.launchRate) + '</td></tr>').join('') +
    '<tr><td><strong>All protocols</strong></td><td class="num">' + D.counts.protocols + '</td><td class="num">' + D.counts.live + '</td><td class="num">' + pct(v.overallLaunchRate) + '</td></tr>';
  $('rangeNote').textContent = 'Rank range: each row was re-ranked across ' + v.bootstrapRefits + ' bootstrap refits of the curve (token protocols resampled with replacement). The range on each row is its lowest–highest rank across refits — wide ranges mean the curve is unsure, and the board shows that instead of hiding it.';

  // ---- Controls
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  const chainSel = $('chainFilter');
  chains.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o); });

  let tab = 'pre';
  let query = '';
  let chain = '';
  let sort = 'implied';

  function filteredRows() {
    let rows = (tab === 'pre' ? D.rows : D.live).filter((r) => {
      if (query && !(r.name.toLowerCase().includes(query) || r.slug.toLowerCase().includes(query))) return false;
      if (chain && !r.chains.includes(chain)) return false;
      return true;
    });
    const by = {
      implied: (a, b) => (b.implied_value_usd || b.mcap_usd) - (a.implied_value_usd || a.mcap_usd),
      tvl: (a, b) => b.tvl_usd - a.tvl_usd,
      name: (a, b) => a.name.localeCompare(b.name),
      verdict: (a, b) => (b.farm ? b.farm.netPerHour : 0) - (a.farm ? a.farm.netPerHour : 0),
    };
    return rows.sort(by[sort] || by.implied);
  }

  function renderBoard() {
    const rows = filteredRows();
    const head = $('boardHead');
    const body = $('boardBody');
    if (tab === 'pre') {
      head.innerHTML = '<th>Rank</th><th>Protocol</th><th class="num">TVL</th><th class="num">Implied value</th><th class="num">Rank range</th><th class="num">Peer launch</th><th class="num">Farm $/hour</th>';
      body.innerHTML = rows.map((r) =>
        '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + (r.watchlist ? ' <span class="badge watch">WATCH</span>' : '') + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><br><span class="note small">' + esc(r.slug) + ' · ' + shortChains(r.chains) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">' + r.rank_lo + '–' + r.rank_hi + '</td><td class="num">' + pct(r.peer_launch_rate) + '</td>' +
        '<td class="num ' + (r.farm.netPerHour >= 0 ? 'pos' : 'neg') + '">' + money2(r.farm.netPerHour) + '</td></tr>').join('');
      $('boardCount').textContent = rows.length + ' of ' + D.rows.length + ' pre-token rows shown. Click a row for its farm plan. WATCH marks the 40 watchlist protocols.';
    } else {
      head.innerHTML = '<th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Multiple</th><th class="num">Curve fitted</th>';
      body.innerHTML = rows.map((r) =>
        '<tr><td><strong>' + esc(r.name) + '</strong><br><span class="note small">' + esc(r.slug) + ' · ' + shortChains(r.chains) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + r.multiple.toFixed(2) + '×</td><td class="num">' + money(r.fitted_usd) + '</td></tr>').join('');
      $('boardCount').textContent = rows.length + ' of ' + D.live.length + ' live-token anchors shown. These are the protocols the curve was fitted on — the evidence, not the ranking.';
    }
  }

  function showDetail(slug, scroll) {
    const r = D.rows.find((x) => x.slug === slug);
    const box = $('detail');
    if (!r) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const f = r.farm;
    const verdictCls = f.netPerHour >= 0 ? 'pos' : 'neg';
    const verdictTxt = f.netPerHour >= 0
      ? 'Worth farming on the numbers: about ' + money2(f.netPerHour) + ' net per active hour.'
      : 'Not worth farming on the numbers: about ' + money2(f.netPerHour) + ' net per active hour. Farm it for points only, if at all.';
    box.innerHTML =
      '<h2>' + esc(r.name) + ' <span class="note">#' + r.rank + ' · implied ' + money(r.implied_value_usd) + '</span></h2>' +
      '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · ' + shortChains(r.chains) +
      ' · TVL ' + money(r.tvl_usd) + ' · rank range ' + r.rank_lo + '–' + r.rank_hi + ' across ' + v.bootstrapRefits + ' refits' +
      ' · peer launch rate ' + pct(r.peer_launch_rate) + (r.watchlist ? ' · <span class="badge watch">WATCHLIST</span>' : '') + '</p>' +
      '<div class="costgrid">' +
      '<div class="cost"><div class="k">Bridge + gas</div><div class="v">' + money2(f.bridgeUsd + f.gasUsd) + '</div></div>' +
      '<div class="cost"><div class="k">Fees + slippage</div><div class="v">' + money2(f.dexFeeUsd + f.slippageUsd) + '</div></div>' +
      '<div class="cost"><div class="k">Expected reward</div><div class="v">' + money2(f.expectedRewardUsd) + '</div></div>' +
      '<div class="cost"><div class="k">Net (30 days)</div><div class="v">' + money2(f.netUsd) + '</div></div></div>' +
      '<ol>' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<p class="verdict ' + verdictCls + '">' + esc(verdictTxt) + ' Break-even airdrop ' + money2(f.breakEvenUsd) + ' (token near ' + money(f.breakEvenImpliedUsd) + ' implied).</p>';
    box.classList.remove('hidden');
    if (scroll) box.scrollIntoView({ block: 'nearest' });
  }

  $('boardBody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) { showDetail(tr.dataset.slug, true); location.hash = 'detail=' + tr.dataset.slug; }
  });
  $('tabPre').addEventListener('click', () => { tab = 'pre'; $('tabPre').classList.add('active'); $('tabLive').classList.remove('active'); $('detail').classList.add('hidden'); renderBoard(); });
  $('tabLive').addEventListener('click', () => { tab = 'live'; $('tabLive').classList.add('active'); $('tabPre').classList.remove('active'); $('detail').classList.add('hidden'); renderBoard(); });
  $('search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderBoard(); });
  chainSel.addEventListener('change', (e) => { chain = e.target.value; renderBoard(); });
  $('sortBy').addEventListener('change', (e) => { sort = e.target.value; renderBoard(); });

  // Hash routing for shareable views and screenshots.
  function applyHash() {
    const h = location.hash.slice(1);
    const params = new URLSearchParams(h.replace(/;/g, '&'));
    const d = params.get('detail');
    const c = params.get('chain');
    const shot = params.get('shot');
    // Compact screenshot views: hide the KPI strip and validation panel so the
    // board, detail or filtered table sits at the top of the frame.
    if (shot === 'board' || shot === 'detail' || shot === 'filtered') document.body.classList.add('shot-compact');
    if (shot === 'filtered' && !c) { chain = 'Ethereum'; chainSel.value = 'Ethereum'; }
    if (c && chains.includes(c)) { chain = c; chainSel.value = c; }
    renderBoard();
    if (d) showDetail(d, false);
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
