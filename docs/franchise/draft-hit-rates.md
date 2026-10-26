# Draft Hit Rates: Calibration Study for GRIDIRON Franchise Mode

This study sets the targets the Franchise Mode draft must reproduce. When the AI (or you) drafts by consensus big board, the simulated careers of drafted players have to land in the same outcome buckets, at the same rates, as real NFL draft classes.

Machine-readable outputs ship with the app:
- `src/franchise/calibration/draftHitRates.json`: outcomes by round and position, franchise-QB rate, second-contract rate.
- `src/franchise/calibration/pickValue.json`: relative value of picks 1–256.
- `src/franchise/calibration/combineDist.json`: combine means, SDs and participation by position group.

## Data and Method

- **Classes:** the 2005–2019 drafts (n = 3,817 picks). 2019 is the last class with at least five completed NFL seasons, the minimum needed to judge an outcome. Each class covers the full 7 rounds.
- **Source:** [nflverse `draft_picks`](https://github.com/nflverse/nflverse-data/releases/tag/draft_picks), which carries Pro-Football-Reference career fields: First-Team All-Pro selections, Pro Bowls, seasons as primary starter, games, and Approximate Value (`w_av`, `dr_av`, `car_av`).
- **Position groups:** QB, RB, WR, TE, OT, IOL, EDGE, IDL, LB, CB, S. They are assigned from [nflverse `players`](https://github.com/nflverse/nflverse-data/releases/tag/players), using `pff_position` with the listed draft position as a fallback.
  - A small residual "DB" bucket (picks with no finer position) is folded into CB in the sim.
- **Second contract:** [nflverse `historical_contracts`](https://github.com/nflverse/nflverse-data/releases/tag/contracts) (OverTheCap). A second contract counts if the player was later paid at least 5% of the cap by any team, after his rookie deal ended.

### Outcome tiers

Tiers are mutually exclusive, and each player takes the highest one he reaches.

| Tier | Definition |
|---|---|
| Elite | 1+ AP First-Team All-Pro |
| Pro Bowl | 2+ Pro Bowls (no First-Team All-Pro) |
| Starter | 4+ seasons as primary starter, or 1 Pro Bowl |
| Contributor | 2–3 seasons started, or 48+ games |
| Bust | fewer than 2 seasons started and fewer than 48 games |

## Results by Round

| Round | n | Elite | Pro Bowl | Starter | Contributor | Bust | Starter or better |
|---|---|---|---|---|---|---|---|
| R1 picks 1–10 | 150 | 27.3% | 17.3% | 38.0% | 10.7% | 6.7% | 82.7% |
| R1 picks 11–32 | 328 | 15.9% | 14.6% | 38.1% | 23.2% | 8.2% | 68.6% |
| R2 | 477 | 6.1% | 7.5% | 35.0% | 31.0% | 20.3% | 48.6% |
| R3 | 534 | 4.5% | 4.1% | 23.8% | 32.6% | 35.0% | 32.4% |
| R4 | 552 | 2.9% | 2.4% | 17.0% | 34.2% | 43.5% | 22.3% |
| R5 | 545 | 2.6% | 1.3% | 14.1% | 26.8% | 55.2% | 18.0% |
| R6–7 | 1,231 | 0.8% | 0.5% | 7.8% | 21.3% | 69.6% | 9.1% |

## Franchise Quarterbacks

A franchise QB here means 6+ seasons as primary starter AND (2+ Pro Bowls OR a First-Team All-Pro).

| Draft slot | QBs | Franchise QB | Multi-year starter (4+) | Who hit |
|---|---|---|---|---|
| R1 picks 1–10 | 27 | 33.3% | 77.8% | Alex Smith, Matt Ryan, Matthew Stafford, Cam Newton, Jared Goff, Patrick Mahomes, Baker Mayfield, Sam Darnold, Josh Allen |
| R1 picks 11–32 | 16 | 12.5% | 50.0% | Aaron Rodgers, Lamar Jackson |
| R2 | 18 | 16.7% | 22.2% | Andy Dalton, Geno Smith, Derek Carr |
| R3 | 20 | 5.0% | 10.0% | Russell Wilson |
| R4 | 18 | 11.1% | 16.7% | Kirk Cousins, Dak Prescott |
| R5–7 | 76 | 0% | ~4% | — |
| All QBs | 175 | 8.6% | — | 15 total |

Takeaways for the sim:
- Only 1 in 12 drafted QBs becomes a franchise QB, and only 1 in 4 first-round QBs does.
- A late-first-round QB is roughly a coin flip to bust (43.8% bust rate).
- Several "hits" took years and changed teams first, or broke out late (Darnold, Geno Smith, Mayfield). The development model must allow late breakouts, not only rookie-contract success.

## Position Groups (Starter-or-Better Rate)

| Group | R1 1–10 | R1 11–32 | R2 | R3 | R4 | R5 | R6–7 |
|---|---|---|---|---|---|---|---|
| QB | 81% | 50% | 22% | 15% | 17% | 0% | 10% |
| RB | 92% | 57% | 33% | 21% | 17% | 11% | 5% |
| WR | 72% | 61% | 45% | 27% | 8% | 22% | 7% |
| TE | 100% (n=3) | 77% | 45% | 34% | 30% | 31% | 13% |
| OT | 95% | 81% | 56% | 30% | 18% | 21% | 11% |
| IOL | 50% (n=6) | 83% | 78% | 52% | 29% | 14% | 18% |
| EDGE | 71% | 56% | 37% | 30% | 29% | 15% | 3% |
| IDL | 87% | 72% | 42% | 39% | 34% | 20% | 12% |
| LB | 92% | 68% | 70% | 39% | 27% | 14% | 6% |
| CB | 80% | 71% | 43% | 20% | 12% | 17% | 4% |
| S | 100% (n=6) | 83% | 52% | 41% | 29% | 36% | 12% |

Patterns:
- Offensive line, linebacker and safety picks keep their value deepest into the draft.
- QB, WR and CB fall off the fastest by round.
- Cells with n < 15 are noisy. The sim shrinks each position×round cell toward its round average, weighted by sample size.

## Second Contracts

Share of picks later paid at least 5% of the cap on a second contract:

| R1 1–10 | R1 11–32 | R2 | R3 | R4 | R5 | R6–7 |
|---|---|---|---|---|---|---|
| 61.3% | 48.5% | 30.0% | 15.5% | 8.5% | 5.7% | 2.4% |

## Pick Value Curve

This is the mean Approximate Value a pick produced for the team that drafted it (`dr_av`). It is smoothed with a 9-pick rolling mean, forced to decline with each later pick, and indexed to pick 1 = 1.00.

| Pick | 1 | 10 | 32 | 64 | 100 | 150 | 224 |
|---|---|---|---|---|---|---|---|
| Relative value | 1.00 | 0.83 | 0.63 | 0.39 | 0.27 | 0.19 | 0.11 |

The curve is much flatter than the old Jimmy Johnson trade chart, which values pick 32 at about 20% of pick 1. That matches performance-based studies:
- [PerThirtySix](https://perthirtysix.com/essay/nfl-draft-expected-value) finds pick 32 keeps 36–67% of pick 1's value, depending on the model.
- [A 2025 Frontiers study](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1628223/abstract) puts the last first-round pick at about 56% of the first.

AI front offices will trade using a mix of this curve and each team's own trade chart, which is a front-office personality trait.

## Comparison to Published Research

| Finding here | Published | Agreement |
|---|---|---|
| R1 starter-or-better 68.6–82.7%; bust 6.7–8.2% | [Windy City Gridiron](https://www.windycitygridiron.com/2023/3/29/23659586/the-nfl-draft-research-project-starters-and-impact-players-edge-rushers-premium-players-top-picks): R1 regular starter 69%, failed 5% | Close; our bust bar is slightly stricter |
| R6–7 bust 69.6% | Same source: R7 failed 62% | Close; we pool R6 and R7 |
| First-round QB franchise rate 26% (11/43); late-R1 QB bust 44% | [Bill Barnwell's study via SI](https://www.si.com/nfl/giants/onsi/nfl-draft-quarterback-hostory-new-york-giants): 44.4% of R1 QBs were disappointments, about 38% franchise-level or better; [Harvard Sports Analysis](https://harvardsportsanalysis.org/2011/05/drafting-an-nfl-qb/): 39% elite / 39% bust | Our "franchise" bar is stricter than "franchise-level"; bust rates agree |
| Pick 32 ≈ 0.63 × pick 1 | [Chase Stuart's AV chart](https://www.footballperspective.com/creating-a-nfl-draft-value-chart-part-i/): pick 1 = 34.6 AV, pick 32 = 12.5 (0.36); [PerThirtySix](https://perthirtysix.com/essay/nfl-draft-expected-value): 0.36–0.67 | Inside the published range; ours uses value to the drafting team |

## How the Sim Uses These Numbers

1. **Hidden truth, noisy view.** Every prospect gets a hidden "true" career outcome: a potential ceiling plus a development path. It is drawn so that, for each position and draft slot, the outcome tiers match the tables above.
2. **Scouts see the truth through noise.** Consensus boards and your scouts rank prospects from what they can observe, plus error that depends on each scout's Judging Ability and Knowledge and on how much he has seen the player.
   - The noise is tuned so that drafting strictly by consensus reproduces the real hit rates. Better scouting beats consensus; bad scouting does worse.
3. **Development is uncertain.** A player's ceiling is never guaranteed.
   - Work ethic, coaching, playing time and injuries move him toward or away from it.
   - Late breakouts (the Geno Smith path) and early flameouts are both modeled.
4. **Calibration test.** A test harness drafts 30 simulated classes by consensus. Each round's and each position's outcome mix must fall within the 95% confidence interval of these real rates. The QB franchise rate must fall within 4–14% overall and 15–40% in round one.
   - Phase 1 reproduces the round-level tier mix for current rookies' hidden ceilings.
   - The full draft test runs in Phase 2.

## Caveats

- **Pro Bowls are inflated.** Alternates, replacements and fan voting mean a Pro Bowl is a noisier signal than All-Pro. That is why "starter" needs 4+ seasons started, and why "Elite" means All-Pro.
- **QB samples are small.** There are 16–27 QBs per first-round bucket, so a single player moves a rate by 4–6 points. The sim uses the pooled rates (8.6% overall, 26% round one) as the main target.
- **Era.** 2005–2019 includes the pre-2011 rookie-wage era, when top-10 picks were expensive enough that teams gave them extra chances. A pre- vs. post-2011 sensitivity table has not been run yet; it is a Phase 2 to-do.
- **Positions.** Position assignment uses modern PFF labels, so some 3-4 OLBs count as EDGE and some hybrid DBs as S.
