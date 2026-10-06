import clsx from 'clsx';
import { Info } from 'lucide-react';
import { RatingNumber } from '@/components/Rating';
import type { KeyMatchup, MatchupResponse, TeamLite, UnitEdge } from '@/types/api';

function EdgeTag({ edge, away, home }: { edge: UnitEdge['edge']; away: TeamLite; home: TeamLite }) {
  if (edge === 'unavailable') return <span className="kicker !text-[0.6rem] text-fg-dim">DATA UNAVAILABLE</span>;
  if (edge === 'even') return <span className="kicker !text-[0.62rem] text-fg-muted">EVEN</span>;
  const t = edge === 'away' ? away : home;
  return <span className="kicker !text-[0.62rem] font-bold">{t.abbr} EDGE</span>;
}

export function UnitRow({ u, away, home, ac, hc }: { u: UnitEdge; away: TeamLite; home: TeamLite; ac: string; hc: string }) {
  const a = u.away ?? 0, h = u.home ?? 0;
  const span = 40; // bars show 60–100 range
  const aw = u.away == null ? 0 : Math.max(4, Math.min(100, ((a - 60) / span) * 100));
  const hw = u.home == null ? 0 : Math.max(4, Math.min(100, ((h - 60) / span) * 100));
  return (
    <div className="grid grid-cols-[3rem_1fr_7.5rem_1fr_3rem] items-center gap-2 py-1.5 sm:grid-cols-[3.5rem_1fr_9rem_1fr_3.5rem]" title={`${away.abbr}: ${u.awayPlayers.join(', ') || '—'}\n${home.abbr}: ${u.homePlayers.join(', ') || '—'}`}>
      <RatingNumber value={u.away} className={clsx('text-right text-2xl', u.edge === 'home' && 'opacity-60')} animate={false} />
      <div className="flex h-2.5 justify-end overflow-hidden rounded-l-full bg-ink-600/60">
        <div className="h-full rounded-l-full transition-[width] duration-700" style={{ width: `${aw}%`, background: `linear-gradient(270deg, ${ac}, ${ac}55)`, opacity: u.edge === 'home' ? 0.5 : 1 }} />
      </div>
      <div className="text-center leading-tight">
        <div className="display text-base sm:text-lg">{u.unit}</div>
        <EdgeTag edge={u.edge} away={away} home={home} />
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-r-full bg-ink-600/60">
        <div className="h-full rounded-r-full transition-[width] duration-700" style={{ width: `${hw}%`, background: `linear-gradient(90deg, ${hc}, ${hc}55)`, opacity: u.edge === 'away' ? 0.5 : 1 }} />
      </div>
      <RatingNumber value={u.home} className={clsx('text-2xl', u.edge === 'away' && 'opacity-60')} animate={false} />
    </div>
  );
}

export function MatchupEdgePanel({ m, away, home, ac, hc }: { m: MatchupResponse; away: TeamLite; home: TeamLite; ac: string; hc: string }) {
  const o = m.overall;
  const leader = o.edge === 'away' ? away : o.edge === 'home' ? home : null;
  return (
    <section className="panel p-4 sm:p-6" aria-labelledby="edge-h">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="edge-h" className="panel-hd">{m.label}</h2>
          <div className="display mt-1 text-3xl sm:text-4xl">
            {o.edge === 'unavailable' ? 'DATA UNAVAILABLE' : leader ? <><span style={{ color: o.edge === 'away' ? ac : hc }}>{leader.abbr}</span> EDGE <span className="text-fg-muted">+{Math.abs(o.margin ?? 0).toFixed(1)}</span></> : 'DEAD EVEN'}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center"><div className="kicker">{away.abbr} TEAM</div><RatingNumber value={o.away} className="text-4xl" /></div>
          <div className="text-center"><div className="kicker">{home.abbr} TEAM</div><RatingNumber value={o.home} className="text-4xl" /></div>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-[3rem_1fr_7.5rem_1fr_3rem] gap-2 sm:grid-cols-[3.5rem_1fr_9rem_1fr_3.5rem]">
        <span className="kicker text-right">{away.abbr}</span><span /><span /><span /><span className="kicker">{home.abbr}</span>
      </div>
      <div className="divide-y divide-white/5">
        {m.units.map((u) => <UnitRow key={u.unit} u={u} away={away} home={home} ac={ac} hc={hc} />)}
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-fg-dim"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{m.disclaimer} Unit score = average GRIDIRON rating of the projected starters in that unit.</p>
    </section>
  );
}

export function KeyMatchups({ items, ac, hc, away }: { items: KeyMatchup[]; ac: string; hc: string; away: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((k) => {
        const oc = k.offenseTeam === away ? ac : hc, dc = k.offenseTeam === away ? hc : ac;
        return (
          <div key={k.title} className="panel p-3">
            <div className="display truncate text-base">{k.title}</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="text-center"><div className="kicker !text-[0.58rem]">OFF</div><RatingNumber value={k.offense} className="text-2xl" animate={false} /></div>
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-ink-600">
                {k.offense != null && k.defense != null && (
                  <>
                    <div style={{ width: `${(k.offense / (k.offense + k.defense)) * 100}%`, background: oc }} />
                    <div className="flex-1" style={{ background: dc }} />
                  </>
                )}
              </div>
              <div className="text-center"><div className="kicker !text-[0.58rem]">DEF</div><RatingNumber value={k.defense} className="text-2xl" animate={false} /></div>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="kicker !text-[0.6rem]" style={{ color: k.edge === 'offense' ? oc : k.edge === 'defense' ? dc : undefined }}>
                {k.edge === 'unavailable' ? 'DATA UNAVAILABLE' : k.edge === 'even' ? 'EVEN' : k.edge === 'offense' ? `${k.offenseTeam} OFFENSE EDGE` : `${k.defenseTeam} DEFENSE EDGE`}
              </span>
              <span className="truncate pl-2 text-[10px] text-fg-dim">{k.note}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
