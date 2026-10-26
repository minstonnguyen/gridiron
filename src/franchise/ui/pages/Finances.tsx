import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useF } from '../context';
import { hit, m, PageTitle, Pill } from '../bits';
import { futureCommitments, teamCap, COUNTED_LISTS } from '../../cap';

export default function Finances() {
  const f = useF();
  const { state } = f;
  const t = state.userTeam;
  const cap = teamCap(state, t);
  const fut = futureCommitments(state, t, [cap.year + 1, cap.year + 2, cap.year + 3, cap.year + 4]);
  const top = useMemo(() => Object.values(state.players).filter((p) => p.team === t && COUNTED_LISTS.has(p.list)).sort((a, b) => hit(state, b) - hit(state, a)).slice(0, 15), [state, f.version]);
  const dead = state.dead.filter((d) => d.team === t).sort((a, b) => a.year - b.year || b.amount - a.amount);
  const league = useMemo(() => state.teams.map((x) => ({ abbr: x.abbr, space: teamCap(state, x.abbr).space })).sort((a, b) => b.space - a.space), [state, f.version]);
  const rank = league.findIndex((x) => x.abbr === t) + 1;
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / cap.cap) * 100))}%`;
  return (
    <div className="space-y-4">
      <PageTitle kicker={`${cap.year} league year`} title="Finances & salary cap" />
      <section className="panel p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><div className="kicker">Cap space</div><div className={`display text-5xl ${cap.space < 0 ? 'text-[#ffb3b3]' : 'text-volt'}`}>{m(cap.space, 2)}</div><div className="text-xs text-fg-muted">{rank}{rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} most in the league</div></div>
          <div className="text-right text-sm"><div>Salary cap <b className="tabular">{m(cap.cap, 1)}</b></div><div className="text-fg-muted">Used <span className="tabular">{m(cap.used, 2)}</span></div></div>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-ink-700" role="img" aria-label="Cap usage breakdown">
          <div className="bg-ice" style={{ width: pct(cap.active) }} /><div className="bg-[#7c8cff]" style={{ width: pct(cap.reserve) }} /><div className="bg-[#ffb84d]" style={{ width: pct(cap.ps) }} /><div className="bg-[#ff6b6b]" style={{ width: pct(cap.dead) }} />
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          <li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ice" />Active roster {m(cap.active)}</li>
          <li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#7c8cff]" />Reserve lists {m(cap.reserve)}</li>
          <li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ffb84d]" />Practice squad {m(cap.ps)}</li>
          <li><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ff6b6b]" />Dead money (this career) {m(cap.dead)}</li>
        </ul>
        <p className="mt-3 text-xs text-fg-dim">The {cap.year} cap of {m(cap.cap, 1)} is the official NFL figure. Cap charges are each contract's real per-year cap numbers. Dead money and carryover already on real books are not in public data, so real cap space can differ.</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4"><div className="panel-hd mb-2">Future commitments</div>
          <table className="w-full text-sm"><thead><tr className="kicker !text-[0.6rem] text-left"><th className="py-1">Year</th><th className="text-right">Players</th><th className="text-right">Committed</th><th className="text-right">Dead</th></tr></thead>
            <tbody className="tabular">{fut.map((y) => <tr key={y.year}><td className="py-1">{y.year}</td><td className="text-right">{y.players}</td><td className="text-right">{m(y.committed)}</td><td className="text-right">{m(y.dead)}</td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-fg-dim">Future caps are not yet announced; they grow from {m(cap.cap, 1)} in later seasons.</p>
        </section>
        <section className="panel p-4"><div className="panel-hd mb-2">Biggest cap hits</div>
          <ol className="space-y-1 text-sm">{top.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link to={f.path(`/player/${p.id}`)} className="truncate hover:text-ice"><span className="mr-1 text-fg-dim">{p.pos}</span>{p.name}</Link><span className="flex items-center gap-2">{p.contract?.src === 'est_min' && <Pill>est</Pill>}<span className="tabular">{m(hit(state, p))}</span></span></li>)}</ol>
        </section>
      </div>
      <section className="panel p-4"><div className="panel-hd mb-2">Dead money from your moves</div>
        {dead.length ? <ul className="space-y-1 text-sm">{dead.map((d, i) => <li key={i} className="flex justify-between gap-2"><span>{d.year} · {d.name} <span className="text-fg-dim">({d.reason})</span></span><span className="tabular text-[#ffb3b3]">{m(d.amount, 3)}</span></li>)}</ul> : <p className="text-sm text-fg-muted">None yet.</p>}
      </section>
    </div>
  );
}
