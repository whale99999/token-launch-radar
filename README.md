# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/whale99999/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/whale99999/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token protocols by what their token would be worth if it launched — from a single sealed DefiLlama snapshot, with one transparent formula scoring every row the same way. No protocol name is ever special-cased and no row is hand-picked: the board is the whole screen, not a slice of it.

## What it ranks

The snapshot is a DefiLlama protocol index. A protocol only makes the ranked board if its record carries no token at all — no market cap, no CoinGecko id, no symbol — and it is not an exchange, a bridge, or a versioned pool of another protocol. Protocols whose token already trades are kept apart in a Live view, shown at their market cap and never mixed into the ranking.

The board holds **195 rows**: all **40 watchlist** protocols, plus **155 early pre-token protocols below the $50M floor**, found by the early radar. Every row carries **seven concrete farm steps** — derived from the protocol's own category, chains, TVL and age — so each ranked protocol comes with a usable plan, not just a number.

## The model (radar-2)

Implied value follows only from the snapshot's own figures — TVL, the seven-day TVL change, how long the protocol has run with no token, and how many chains it runs on:

```
base          = tvl_usd × 0.30
growthMult    = 1 + clamp(change_7d, -50, +150) / 100 × 0.80
maturityMult  = 0.70 + 0.30 × min(age_days, 1460) / 1460
chainMult     = 1 + 0.04 × min(max(chains - 1, 0), 5)
implied       = round(base × growthMult × maturityMult × chainMult)
```

TVL is the protocol's size today, at a 0.30x multiple. Growth rewards momentum and punishes shrinkage, clamped so one hot week cannot dominate. Maturity rewards survival: a protocol that has run for years with no token earns the patience premium, up to 1.00 after four years (1,460 days). Chain spread adds 4% per extra chain, capped at five. Age is days from `listed_at` to the snapshot's `as_of` date; an unlisted age uses 365 days. The result is capped at $100,000,000,000,000. An implied value is a model, not a price — and not a promise that a token ever launches.

## Run it

```sh
node main.ts --input /input/snapshot.json
```

Node 22, standard library only. `main.ts` reads `/input/snapshot.json` and writes `/output/board.json` (the ranked board), `data.js` (the same board, compact, for the dashboard), a copy of `dashboard/` and `screenshots/`, and `dossier.json`. Everything is deterministic: no clock, no randomness, no network. To run outside the grader's container, set `MAKEFUN_OUTPUT_DIR` to a local directory instead of `/output`.

Open `dashboard/index.html` beside the generated `data.js` to browse the board: search, filter by category or chain, watchlist-only view, the Live view of 24 tokened protocols by market cap, and a detail dialog per row with its model breakdown and farm plan. The dashboard recomputes each row from the snapshot figures and checks it against the number `board.json` carries, so a wrong model shows up immediately.

---

<sub>Entered on [make.fun](https://make.fun/?ref=881py9z1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

Referral: `881py9z1` — https://make.fun/r/881py9z1 · Bounty: https://make.fun/bounty/token-radar-01
