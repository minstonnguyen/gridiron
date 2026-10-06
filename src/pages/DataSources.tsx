import { ExternalLink } from 'lucide-react';
import { TIER_COLORS } from '@/lib/format';
import { useMeta } from '@/hooks/useData';

const DATASETS = [
  ['Players', 'players/players.parquet', 'Identity, bio facts, draft, college, headshot URLs'],
  ['Teams', 'teams/teams_colors_logos.csv', 'Names, divisions, colors, logo URLs'],
  ['Schedules & results', 'schedules/games.csv (nflverse/nfldata)', 'Every game, kickoff, stadium, final scores'],
  ['Weekly rosters', 'weekly_rosters/roster_weekly_{season}.csv', 'Team membership and roster status by week'],
  ['Depth charts', 'depth_charts/depth_charts_{season}.csv', 'Team-published depth charts → projected starters'],
  ['Injuries', 'injuries/injuries_{season}.csv', 'Official injury report designations and practice status'],
  ['Player stats', 'stats_player/stats_player_week_{season}.csv', 'Box-score and EPA stats per player-game'],
  ['Snap counts', 'snap_counts/snap_counts_{season}.csv', 'Offense, defense and special-teams snaps'],
  ['Play-by-play', 'pbp/play_by_play_{season}.parquet', 'Success rate, EPA per play, explosive plays'],
  ['Next Gen Stats', 'nextgen_stats/ngs_{passing,rushing,receiving}.csv.gz', 'Separation, time to throw, rush yards over expected'],
  ['PFR advanced stats', 'pfr_advstats/advstats_*', 'Pressures, coverage, broken tackles, drops'],
];

export default function DataSources() {
  const meta = useMeta();
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <div className="kicker">METHODOLOGY & ATTRIBUTION</div>
        <h1 className="display text-5xl">Data sources</h1>
      </header>
      <section className="panel space-y-3 p-5 text-fg-muted">
        <p>
          All football data in GRIDIRON comes from the open <a className="text-ice hover:underline" href="https://github.com/nflverse" target="_blank" rel="noreferrer">nflverse project <ExternalLink className="inline h-3.5 w-3.5" /></a>{' '}
          (data releases at <a className="text-ice hover:underline" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">github.com/nflverse/nflverse-data</a>). Huge thanks to the nflverse maintainers and contributors.
          Data is ingested into PostgreSQL with idempotent upserts and every page reads from that database.
        </p>
        <p className="rounded-lg border border-ice/30 bg-ice/5 p-3 font-semibold text-fg">
          GRIDIRON Analytics Rating is an independent rating calculated from publicly available statistics. It is not a PFF grade, Madden rating, NFL rating, or official league rating.
        </p>
        <p>GRIDIRON is an independent fan project and is not affiliated with, endorsed by, or sponsored by the NFL, its teams, EA Sports, Pro Football Focus, ESPN or nflverse. Team names and logos belong to their respective owners and are shown for identification only.</p>
        {meta.data && <p className="text-xs text-fg-dim">Database snapshot generated {new Date(meta.data.generatedAt).toLocaleString()} · seasons {meta.data.seasons.at(-1)}–{meta.data.seasons[0]} · mode {meta.data.mode}.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="display text-3xl">Datasets</h2>
        <div className="panel divide-y divide-white/5">
          {DATASETS.map(([n, f, d]) => (
            <div key={n} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
              <div className="font-semibold">{n}</div>
              <div><code className="break-all text-xs text-ice">{f}</code><div className="text-sm text-fg-muted">{d}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-3xl">How the rating works</h2>
        <div className="panel space-y-3 p-5 text-sm text-fg-muted">
          <p>Every qualifying player gets a 0–100 rating per season, calculated <b className="text-fg">within his position group and season</b> (QB vs QBs, CB vs CBs…). Each input metric is converted to a percentile; the component scores are blended:</p>
          <ul className="grid gap-2 sm:grid-cols-5">
            {[['40%', 'Efficiency'], ['25%', 'Advanced impact'], ['20%', 'Production'], ['10%', 'Consistency'], ['5%', 'Recent form']].map(([w, l]) => (
              <li key={l} className="rounded-lg bg-ink-800 p-3 text-center"><div className="display text-3xl text-fg">{w}</div><div className="kicker">{l}</div></li>
            ))}
          </ul>
          <p>Examples: QBs use EPA per dropback, dropback success rate, CPOE, on-target %, sacks per pressure and INT avoidance; receivers use EPA per target, yards per target, target share, NGS separation and YAC over expected; pass rushers use pressures, sacks and QB hits per 100 snaps; defensive backs use yards per target and passer rating allowed; offensive linemen use team-level pass/run blocking indicators (and are therefore capped at MEDIUM confidence).</p>
          <p>When an input is missing (for example Next Gen Stats for a backup), it is omitted and its weight is redistributed across available inputs, and the rating's <b className="text-fg">confidence</b> (HIGH / MEDIUM / LOW) is reduced. Players below the minimum sample show <b className="text-fg">INSUFFICIENT DATA</b> rather than a number. All component values are stored and shown on each player's Advanced tab.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {(['GENERATIONAL', 'ELITE', 'STAR', 'ABOVE AVERAGE', 'AVERAGE', 'BELOW AVERAGE', 'DEVELOPING'] as const).map((t, i) => (
              <span key={t} className="rounded-md border px-2 py-1 font-display text-xs font-bold tracking-wider" style={{ borderColor: TIER_COLORS[t] + '66', color: TIER_COLORS[t] }}>
                {['95+', '90–94', '85–89', '80–84', '70–79', '60–69', '0–59'][i]} {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-3xl">Lineups, injuries & live games</h2>
        <div className="panel space-y-2 p-5 text-sm text-fg-muted">
          <p><b className="text-fg">Projected starters</b> come from the most recent depth chart nflverse publishes for each team. They are labelled PROJECTED STARTER and are never presented as confirmed starting lineups.</p>
          <p><b className="text-fg">Injury designations</b> (Questionable, Doubtful, Out) are shown only when they appear on the official injury report in the nflverse injuries dataset.</p>
          <p><b className="text-fg">Live data:</b> nflverse is not a live feed. GRIDIRON never shows live scores, clock or possession; games show their scheduled state until the final score is published.</p>
          <p><b className="text-fg">Matchup edges</b> compare the average ratings of projected starters by unit. They are analytics comparisons, not predictions or betting lines.</p>
        </div>
      </section>
    </div>
  );
}
