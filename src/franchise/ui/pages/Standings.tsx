import { useMemo } from 'react';
import clsx from 'clsx';
import { TeamLogo } from '@/components/Img';
import { useF } from '../context';
import { PageTitle } from '../bits';
import { divisions, rank, seeds, standings } from '../../standings';

export default function Standings() {
  const f = useF();
  const { state } = f;
  const { rows, divs, sd } = useMemo(() => ({ rows: standings(state), divs: divisions(state), sd: state.playoffSeeds ?? seeds(state) }), [state, f.version]);
  const team = (a: string) => state.teams.find((t) => t.abbr === a)!;
  const seedOf = (a: string) => { for (const c of ['AFC', 'NFC'] as const) { const i = sd[c].indexOf(a); if (i >= 0) return i + 1; } return null; };
  return (
    <div>
      <PageTitle kicker={state.playoffSeeds ? 'Final regular-season seeding' : 'If the season ended today'} title="Standings" />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {(['AFC', 'NFC'] as const).map((c) => (
          <section key={c} className="panel p-3"><div className="panel-hd mb-2">{c} playoff picture</div>
            <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">{sd[c].map((a, i) => (
              <li key={a} className={clsx('flex items-center gap-2 rounded px-2 py-1 text-sm', a === state.userTeam && 'bg-volt/10')}>
                <span className="w-4 tabular text-fg-dim">{i + 1}</span><TeamLogo src={team(a).logo} abbr={a} size={20} /><span className="font-semibold">{a}</span>
                <span className="ml-auto tabular text-fg-muted">{rows[a].w}-{rows[a].l}{rows[a].t ? `-${rows[a].t}` : ''}</span>{i === 0 && <span className="text-[0.65rem] text-volt">BYE</span>}
              </li>))}</ol>
          </section>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Object.entries(divs).sort(([a], [b]) => a.localeCompare(b)).map(([d, teams]) => (
          <section key={d} className="panel overflow-x-auto p-3">
            <div className="panel-hd mb-1">{d}</div>
            <table className="w-full min-w-[460px] text-sm">
              <thead><tr className="kicker !text-[0.58rem] text-left"><th className="py-1">Team</th><th>W-L-T</th><th>Pct</th><th>Div</th><th>Conf</th><th className="text-right">PF</th><th className="text-right">PA</th><th className="text-right">Diff</th><th className="text-right">Strk</th></tr></thead>
              <tbody className="tabular">
                {rank(state, teams, rows, true).map((a) => { const r = rows[a]; const s = seedOf(a); return (
                  <tr key={a} className={clsx(a === state.userTeam && 'bg-volt/10')}>
                    <td className="py-1"><span className="flex items-center gap-2"><TeamLogo src={team(a).logo} abbr={a} size={20} /><span className="font-semibold">{a}</span>{s && <span className="text-[0.65rem] text-ice">#{s}</span>}</span></td>
                    <td>{r.w}-{r.l}-{r.t}</td><td>{r.pct.toFixed(3).replace(/^0/, '')}</td><td>{r.divW}-{r.divL}{r.divT ? `-${r.divT}` : ''}</td><td>{r.confW}-{r.confL}{r.confT ? `-${r.confT}` : ''}</td>
                    <td className="text-right">{r.pf}</td><td className="text-right">{r.pa}</td><td className={clsx('text-right', r.pf - r.pa > 0 ? 'text-volt' : r.pf - r.pa < 0 ? 'text-[#ffb3b3]' : '')}>{r.pf - r.pa > 0 ? '+' : ''}{r.pf - r.pa}</td><td className="text-right">{r.streak}</td>
                  </tr>); })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="mt-3 text-xs text-fg-dim">Tiebreakers applied: win percentage, head-to-head, division record, conference record, strength of victory, strength of schedule, point differential, then a coin toss. The common-games step is not yet modelled.</p>
    </div>
  );
}
