# BALANCE

All numbers come from `npm run sim -- --runs 5000 --seed 1` (stake 0, House Wheel, real wheel physics, multi-threaded). Every tunable lives in `src/game/balance.ts`.

## Targets (EV bot)

| Target | Required | Result |
|---|---|---|
| Deadline 1 pass rate | ≥ 95% | **95.0%** ✅ |
| Full-run win rate | 8–20% | **18.8%** ✅ |
| deposit-every-spin loses by Deadline 4–5 | median death D4–5 | **D5** (49.2% still alive after paying D5) ✅ |
| No single artifact pushes win rate above 60% | ≤ 60% | **max 41.0%** (Trapdoor Lever) ✅ |

## Final results — 5000 runs per policy

| policy | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | win | avg paid | bankrupts/run | avg tray @ bankrupt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deposit-every-spin | 96.3% | 90.8% | 81.1% | 67.5% | 49.2% | 26.2% | 9.8% | 2.4% | **2.4%** | 4.23 | 6.74 | $0 |
| ride-to-3 | 93.6% | 86.4% | 77.9% | 66.9% | 51.3% | 31.4% | 14.0% | 4.3% | **4.3%** | 4.26 | 6.67 | $308 |
| ride-to-5 | 90.3% | 82.9% | 75.5% | 65.9% | 53.1% | 36.5% | 18.6% | 6.6% | **6.6%** | 4.30 | 6.75 | $676 |
| ev | 95.0% | 90.2% | 83.6% | 76.4% | 67.3% | 53.0% | 35.4% | 18.8% | **18.8%** | 5.20 | 9.24 | $676 |

"Dn" = share of runs that paid Deadline n. Riding is required: blind depositing wins 2.4%, blind riding wins 4–7%, and *judging when to ride* (EV) wins 18.8%.

**Combo frequency (per spin):** ECHO ~20%, NEIGHBORS ~32%, HAT TRICK ~6–7% for riders (0.6% for depositors — a Deposit resets the cash run), DEAD AIR 0.2–0.6%.

**Artifact pick ↔ win (EV bot, runs that ever acquired it; baseline 18.8%):**
top — Trapdoor Lever 41.0%, Laugh Track 35.2%, Snake Eyes 31.0%, The Missing 'A' 29.2%, Dead Man's Watch 28.7%, Loaded Flapper 28.4%, Second Ring 27.6%;
bottom — TV Dinner 15.6%, Cracked Mirror 15.3%, Black Cat 15.1%, House Edge 13.6%, Lucky Sock 8.7%.
Most picked: Cue Card 50%, Hollow Tooth 40%, Lucky Penny 36%.

## Bot policies (`sim/bot.ts`)

All bots use the public Game API with real physics; a "player" releases in the sweet spot 50% of the time.

- **deposit-every-spin** — deposits whenever the Tray holds anything.
- **ride-to-N** (3, 5) — deposits after N spins of riding.
- **ev** — deposits when `P(bankrupt) × Tray × caution` exceeds the expected value of keeping the Streak for the next ≤3 spins; secures the Debt when it can; picks Marathon when the Debt is out of reach of Standard.
- **Simple shop heuristics** (all policies) — buy the best-scoring artifact, install Cash wedges over the worst non-Bankrupt wedge, gild the best Cash wedge, narrow Bankrupts, reroll when rich; accept "obviously good" Producer bargains; convert 50% of surplus.

## Iteration log

| # | Change | EV D1 | EV win | dep-every median death | Note |
|---|---|---|---|---|---|
| 0 | Brief values only | 88–90% | 59% | D6 | Late game unloseable |
| 1 | Bot inspection | — | — | — | Shop bot deleted both Bankrupts by D2 → riding risk-free, Trays of $25k–$43k, single wedges gilded to $5000 |
| 2 | Remove escalates +2/use; Bankrupt removal ×3 cost | 94% | 51% | D6 | Still removed by D2 |
| 3 | **Bankrupts are Network property** (no Remove/overwrite, narrow floor 10°) | 94% | 24.5% | D6 | Risk is permanent; the gamble works |
| 4 | Start Vault $200, artifact prices +2 | 95% | 26.7% | D6 | D1 fixed |
| 5 | Max 2 gilds per wedge, gild +2/use | 95% | 20.0% | D5–6 | |
| 6 | Interest cap $30+$20·d, start Tokens 2, resize 3 | 96% | 20.3% | D5 | |
| 7 | Artifact prices +3 | 96% | 17.6% | D5 | Converged (500-run check) |
| 8 | Full 5000-run verification | 95.0% | 18.8% | D5 | Targets met |

## Tuned values (vs. brief)

| Key | Value | Brief? |
|---|---|---|
| debtBase / debtGrowth | 450 / 1.7 | brief |
| streakStep | 0.25 | brief |
| packages | 6/+4, 8/+2, 11/+0 & Bankrupt | brief |
| tokenRate / interestRate | $50 / 10% | brief |
| interestCap | $30 + $20 × Deadline | tuned |
| startVault / startTokens | $200 / 2 | tuned |
| artifactPriceAdd | +3 Tokens | tuned |
| removeCost / escalation | 3 / +2 per use | tuned |
| bankruptRemovable | false (narrow floor 10°) | tuned (deviation) |
| gildCost / escalation / maxGild | 3 / +2 / 2 | tuned |
| resizeCost | 3 | tuned |
| sweet spot | centre 0.76, half-width 0.055 | tuned |

## Notes / known balance issues

- NEIGHBORS fires on ~32% of spins (geometry of 2° windows on 15° wedges). It is roughly EV-neutral, so it adds variance rather than power; the brief's 2° was kept.
- Lucky Sock and House Edge are weak picks; Laugh Track and Snake Eyes are strong but well under the 60% ceiling.
- The bot's shop and bargain play is simple; skilled humans should beat 18.8%. Stakes 1–3 exist to absorb that.
