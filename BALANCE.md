# BALANCE

All numbers come from `npm run sim -- --runs 5000 --seed 1` (stake 0, House Wheel, real wheel physics, multi-threaded). Every tunable lives in `src/game/balance.ts`.

## Targets (EV bot)

| Target | Required | Result |
|---|---|---|
| Deadline 1 pass rate | ≥ 95% | **95.0%** ✅ |
| Full-run win rate | 8–20% | **18.1%** ✅ |
| deposit-every-spin loses by Deadline 4–5 | median death D4–5 | **D5** (48.3% still alive after paying D5) ✅ |
| No single artifact pushes win rate above 60% | ≤ 60% | **max 38.8%** (Trapdoor Lever) ✅ |

## Results — 5000 runs per policy (re-run after the playtest fixes)

| policy | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | win | avg paid | bankrupts/run | avg tray @ bankrupt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deposit-every-spin | 96.3% | 90.8% | 81.1% | 67.2% | 48.3% | 24.9% | 9.3% | 2.3% | **2.3%** | 4.20 | 6.72 | $0 |
| ride-to-3 | 93.6% | 86.4% | 77.8% | 66.3% | 49.9% | 29.9% | 13.1% | 4.1% | **4.1%** | 4.21 | 6.64 | $297 |
| ride-to-5 | 90.3% | 82.9% | 75.4% | 65.5% | 52.1% | 35.3% | 17.8% | 6.2% | **6.2%** | 4.26 | 6.72 | $670 |
| ev | 95.0% | 90.2% | 83.6% | 76.1% | 66.4% | 51.5% | 34.1% | 18.1% | **18.1%** | 5.15 | 9.23 | $664 |

"Dn" = share of runs that paid Deadline n. Riding is required: blind depositing wins 2.4%, blind riding wins 4–7%, and *judging when to ride* (EV) wins 18.8%.

**Combo frequency (per spin):** ECHO ~20%, NEIGHBORS ~32%, HAT TRICK ~6–7% for riders (0.6% for depositors — a Deposit resets the cash run), DEAD AIR 0.3–0.6% for riders.

**Artifact pick ↔ win (EV bot, runs that ever acquired it, n ≥ 30; baseline 18.1%):**
top — Trapdoor Lever 38.8%, Laugh Track 34.6%, Snake Eyes 29.8%, The Missing 'A' 28.4%, Second Ring 28.2%, Loaded Flapper 27.6%, Dead Man's Watch 27.2%;
bottom — Black Cat 14.9%, Ouija Board 14.8%, House Edge 12.7%, Severance Check 9.6%, Lucky Sock 8.6%.
Most picked: Cue Card 50%, Hollow Tooth 40%, Lucky Penny 36%.

Severance Check moved to the bottom of this list once its Token cap applied everywhere (the card says "Tokens are capped at 6"; before the fix the cap was only enforced once per spin). It is still well within the targets, and it is the first tuning candidate if playtesters find it too weak.

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
| 9 | Re-run after the playtest-pass rules fixes (Mannequin Hand fee on every deposit, Severance cap everywhere, Understudy shares its copy's state, Polish respects the gild cap, bargain width floor) | 95.0% | 18.1% | D5 | Targets still met; Trapdoor Lever is the top artifact at 38.8% |

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

- NEIGHBORS fires on ~32% of bot spins. With uniform releases the wheel stops within 2° of a boundary 26.4% of the time, which matches the geometry (24 boundaries × 4° of 360° = 26.7%). The extra ~5% comes from sweet-spot releases, which bias stops toward high-value wedges that sit next to other wedges. It is roughly EV-neutral, so it adds variance rather than power; the brief's 2° was kept.
- Lucky Sock and House Edge are weak picks; Laugh Track and Snake Eyes are strong but well under the 60% ceiling.
- The bot's shop and bargain play is simple; skilled humans should beat 18.8%. Stakes 1–3 exist to absorb that.
