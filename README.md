# Size Curve Radar — token-radar-01 v6

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Johnleys1/token-radar-01-v6/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Johnleys1/token-radar-01-v6/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: what a pre-token protocol's token would be worth if its
record stayed as it is, and what a reader should do to farm it.

## Method

- **Value model:** pooled OLS `log(mcap) = 6.965 + 0.522 · log(TVL)`, fitted on
  the 128 token protocols in the sealed snapshot. A flat multiple (slope 1) is
  the baseline the curve is tested against, not the model.
- **Held-out edge:** walk-forward ×1.55 (curve 35.4% vs flat 22.9% within a
  factor of 2) and leave-one-out ×1.14 (32.0% vs 28.1%). Both blind tests are
  shown on the dashboard, as multipliers over the flat multiple.
- **Terms:** growth, maturity and breadth were each tested on both blind tests
  and dropped — none beat the pure curve on hit rate *and* median log error in
  both tests. The board is the pure size curve.
- **Range honesty:** every row carries a rank range from 200 bootstrap refits
  of the curve, shown on the row.
- **Token odds:** peer launch rates by age cohort (tracked under 1 year 6.2%,
  1–2 years 12.0%, 2–4 years 19.0%, 4+ years 27.0%) calibrate each row.
- **Farm plans:** every one of the 230 rows carries a costed plan for a $5,000
  deposit over 30 days (bridge + gas + 0.30% DEX fee + slippage + exit) against
  an expected farmer reward of 5% of implied value shared pro-rata by TVL,
  ending in a net $/hour verdict.

## Run

Node 22, standard library only, no install, no network:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
```

Reads the snapshot, writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory. Two runs of the
same input are byte-identical.

## Board

230 pre-token rows, watchlist 40/40, ranked strictly descending by implied
value. Dashboard: sortable/filterable board, per-row detail with the farm
plan, a live-anchors tab with the 128 token protocols the curve was fitted on,
and the validation panel.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2vn3gr8z&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
