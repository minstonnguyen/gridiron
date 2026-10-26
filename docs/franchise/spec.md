# GRIDIRON Franchise Mode — Requirements Spec

An American-football management simulation in the depth of Football Manager, built into the GRIDIRON site (minstonnguyen.github.io/gridiron). You are GM **and** Head Coach of any of the 32 NFL teams, starting on the live NFL calendar.

Status: requirements locked after 8 rounds of decisions (Oct 21, 2026). Nothing built yet.

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| Platform | Static GitHub Pages site, simulation runs in the browser (Web Workers), saves in IndexedDB |
| Saves | Multiple slots + autosave + export/import file; optional **Ironman** (single non-reloadable save) |
| Editor | **None** — pure simulation |
| Role | GM + Head Coach (everything: roster, cap, draft, scouting, staff, game plans, play calls) |
| Team choice | Pick any of the 32 real teams; owner expectations scale with roster + market |
| Start point | Live NFL calendar (today's real rosters/contracts, mid-2026 season) |
| Reality link | Diverges immediately — real results never enter a save |
| Cap & contracts | Realistic-but-simplified: real contracts, cap hits, guarantees, proration, dead money, tags, rookie scale; skip obscure mechanics |
| League evolution | Cap growth only (realistic annual growth); 2026 rules otherwise frozen |
| Fog of war | Full: prospects, other teams' veterans, and even your own players are shown as staff estimates; potential never exact |
| Draft classes 2027–2031 | Real prospect names (2027 big boards, 2028–2031 recruiting rankings) with simulated development, declare decisions, injuries and busts |
| Draft classes 2032+ | Generated forever, same distributions and hit rates |
| College season | Real 2026 college stats up to the save date, simulated after; weekly box scores, bowls, CFP, injuries, early declarations |
| Scouting staff | Full FM-style: hire/fire scouts with attributes, biases, regional/positional knowledge, salaries, budget, assignments |
| Pre-draft | Combine + pro days, all-star games (Senior/Shrine Bowl), interviews + medicals, limited top-30 visits |
| Draft | Full live war room: 7 rounds, AI boards by need/scheme, live trade up/down with incoming offers, pick-value chart, future picks, UDFA frenzy |
| Free agency | Full negotiation: agents, player priorities (money, role, contender, coach, location), rival offers, legal tampering window, counter-offers on years/guarantees/bonus/incentives |
| AI teams | Distinct front offices (analytics vs old-school, win-now vs rebuild, draft vs FA, cap discipline, trade aggression); AI-AI trades; GMs fired and replaced |
| Personalities | Full FM-style: traits, morale, leadership groups, mentoring, holdouts, trade requests, media pressure, contract-year effects, chemistry |
| Roster rules | Full NFL: 53-man, 16-man practice squad + veteran exceptions + poaching, 48 gameday actives, IR with return slots, PUP/NFI, waivers, cutdown day, trade deadline |
| Coaching staff | Full: coordinators, position coaches, S&C, medical; attributes, schemes, reputations; poaching, coaching trees |
| Schemes | Base schemes per side + custom tendencies/formations/play mix; player-scheme fit; opponents scout your tendencies |
| In-game control | Hybrid: weekly game plan; sim pauses at key moments (4th downs, 2-minute, red zone, challenges, timeouts); take over any snap; sim to end |
| Match engine | Play-by-play, **text** broadcast log + stats (no 2D field) |
| Sim detail | Full detail for **every** game, including AI vs AI (seasons may take several minutes) |
| Training | Full: weekly practice plan (intensity/install/film/conditioning), individual focus, position changes, rookie curves, injury-load tradeoff, realistic aging |
| Owner & media | Full pressure: owner goals, budgets, patience, firing → take another job; weekly press conferences; fan sentiment → revenue |
| Injuries | Calibrated to real NFL injury data by position/type/severity; re-injury risk, playing hurt, practice load, medical staff, rare career-altering injuries |
| Calibration | Strict, with automated test reports published on a Data Sources-style page |
| Interface | FM-style hub: inbox + news feed, dense customizable tables, comparisons, "Continue" day-by-day; GRIDIRON dark broadcast look |
| Build | Phased releases, each deployed and playable |

### Real-person guardrail (minors)
Real names are used for all prospects, including current high-school minors, per the owner's call. For any real person who is a minor **as of data import**: football outcomes only (development, injuries, combine, draft position, busts). **No generated off-field events** (arrests, suspensions for conduct, scandals, invented character flags). Adults get the full personality/character system.

---

## 2. Data sources (all public, no fabricated "real" facts)

| Data | Source | Notes |
|---|---|---|
| NFL rosters, players, depth, injuries, play-by-play 2016–2026 | nflverse (already in GRIDIRON DB) | Seeds current ratings and calibration |
| Contracts | nflverse `contracts` (OverTheCap) | Cap hits, guarantees, years; simplified to our cap model |
| Draft history + careers | nflverse draft picks + player outcomes | Hit-rate research and draft-value curves |
| Combine history | nflverse combine | Athletic trait distributions by position |
| College stats | CollegeFootballData.com API (free key, GitHub secret, CI only) | Real 2026 stats up to save start |
| 2027 prospects | Public draft big boards | Names, positions, schools, consensus ranks |
| 2028–2031 prospects | Public recruiting rankings (composite stars/ranks, size) | Names, positions, schools, starting trait priors |
| Coaches/staff | Public staff listings | Real current HC/coordinators seeded |

Rules carried over from GRIDIRON: never fabricate a real-world fact. Anything simulated is clearly in-save only; unknowns become sim priors, not invented "real" data.

---

## 3. Calibration targets (research required before tuning)

Each target gets a research memo, an automated test (sim N seasons, assert within real range), and a row on the calibration report page.

1. **Draft hit rates by position × round** — starter/Pro Bowl/All-Pro/bust rates 2000–2022 classes, using snaps, AV, second contracts. Franchise-QB rate must be very low, even in round 1.
2. **Development & aging curves** by position (peak age, decline rate, late bloomers).
3. **League stat ranges** — completion %, YPA, YPC, sack rate, INT rate, penalties, points/game, 4th-down attempts, two-minute behaviour, home-field effect.
4. **Injury rates** — by position, type, severity, games missed, re-injury.
5. **Contract market** — APY by position/tier, guarantees %, cap growth range.
6. **Draft-trade value** — empirical pick value (not just the Jimmy Johnson chart).
7. **Combine distributions** by position, and their (weak) correlation to outcomes.
8. **Coaching/GM turnover** rates; holdout and trade-request frequency.

---

## 4. Phased build plan

Each phase ships to github.io as a playable, saved, tested increment.

**Phase 1 — League foundation.** Save system (slots, Ironman, export/import), live-calendar league import (rosters, contracts, staff), attribute model from real stats with fog-of-war estimates, cap engine, full roster rules, FM-style inbox/hub, Continue-day loop, schedule.

**Phase 2 — Scouting & draft.** Prospect database (2027 real board, 2028–2031 recruits, 2032+ generator), hidden development paths, scout staff + assignments + budget, college season (real stats → sim), all-star games, combine/pro days, interviews/medicals, top-30 visits, live 7-round war room with AI boards and draft-day trades, UDFA signing. Hit-rate calibration tests.

**Phase 3 — Match engine & coaching.** Snap-by-snap text engine, schemes + custom tendencies, scheme fit, opponent tendency scouting, hybrid in-game control, coaching staff and trees, full training system, injury model. League-stat calibration tests.

**Phase 4 — Player movement & AI.** Full FA negotiation with agents and tampering window, trades (AI-AI too), distinct AI front offices, tags/tenders/options, waivers/poaching, AI cap management, trade deadline.

**Phase 5 — The human layer.** Personalities, morale, leadership, mentoring, holdouts, trade requests, press conferences, media narratives, fan sentiment, owner goals/budget/patience, firing and job market, awards, Hall of Fame, history/records.

---

## 5. Open items to settle as we build

- **Decided:** attributes use the FM-style 1–20 scale; overall current/potential ability is shown as 0.5–5 stars, relative to your staff's knowledge (fog of war). Hidden true values are never shown.
- Exact attribute list per position (Phase 1 ships a position-specific set; refined in Phase 3).
- Scheme catalogue (which named offensive/defensive families ship first).
- Browser performance budget for "full detail every game" — target and fallback if a season exceeds ~5 minutes.
- **Decided:** saves live in browser IndexedDB (named slots, Ironman single slot, gzip export/import).
- Save size limits in IndexedDB for 20+ season careers (history compression).
- Terms of use for recruiting/big-board sources; refresh cadence for new classes.
