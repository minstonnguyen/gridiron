import { Link, useParams } from 'react-router-dom';
import { Headshot, TeamLogo } from '@/components/Img';
import { useF } from '../context';
import { age, Attr, Empty, hit, LIST_LABEL, Pill, Stars, m } from '../bits';
import { PlayerActions } from '../actions';
import { estimate, knowledgeOf, starRange } from '../../fog';
import { attrDefsFor, PERSONALITY } from '../../attributes';
import { shortDate } from '../../calendar';
import { teamName } from '../../engine';

const ftIn = (h: number | null) => (h ? `${Math.floor(h / 12)}'${h % 12}"` : '—');

export default function PlayerPage() {
  const { pid = '' } = useParams();
  const f = useF();
  const { state } = f;
  const p = state.players[pid];
  if (!p) return <Empty>Player not found in this league.</Empty>;
  const team = state.teams.find((t) => t.abbr === p.team);
  const k = knowledgeOf(state, p);
  const defs = attrDefsFor(p.group);
  const own = p.team === state.userTeam;
  const years = (p.contract?.years ?? []).filter((y) => y.year >= state.season - 0).sort((a, b) => a.year - b.year);
  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-4 p-4" style={{ ['--team' as any]: team?.color ?? '#5ad8ff' }}>
        <Headshot src={p.headshot} alt={p.name} width={240} className="h-24 w-24 shrink-0 rounded-xl bg-ink-700" />
        <div className="min-w-0 flex-1">
          <div className="kicker">{p.pos}{p.jersey != null ? ` · #${p.jersey}` : ''} · {LIST_LABEL[p.list]}</div>
          <h1 className="display text-4xl">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            {team ? <span className="flex items-center gap-1.5"><TeamLogo src={team.logo} abbr={team.abbr} size={20} />{team.name}</span> : <span>Free agent</span>}
            <span>Age {age(p, state.date) ?? '—'}</span><span>{ftIn(p.ht)}, {p.wt ?? '—'} lb</span>
            <span>{p.college ?? '—'}</span>
            <span>{p.draft?.year ? `${p.draft.year} draft · Rd ${p.draft.round}, #${p.draft.pick}` : 'Undrafted'}</span>
            <span>{p.exp} season{p.exp === 1 ? '' : 's'}{p.vet ? ' · vested' : ''}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.injury && <Pill tone="red">{p.injury.type} injury · {p.injury.seasonEnding ? 'out for season' : `out ${p.injury.gamesOut} game${p.injury.gamesOut === 1 ? '' : 's'}`} (simulated)</Pill>}
            {p.elevated && <Pill tone="volt">Elevated for next game</Pill>}
            {p.list === 'waivers' && p.waiver && <Pill tone="amber">On waivers from {p.waiver.from} until {shortDate(p.waiver.until)}</Pill>}
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3"><span className="kicker">Ability</span><Stars range={starRange(state, p, 'ca')} label="Current ability" /></div>
          <div className="flex items-center justify-between gap-3"><span className="kicker">Potential</span><Stars range={starRange(state, p, 'pa')} label="Potential" /></div>
          <div className="text-right text-xs text-fg-dim">Staff knowledge {Math.round(k)}%</div>
        </div>
      </div>

      <div className="panel p-4"><div className="panel-hd mb-2">Roster actions</div><PlayerActions p={p} /></div>

      <div className="grid gap-4 lg:grid-cols-3">
        {([['Technical', defs.technical], ['Mental', defs.mental], ['Physical', defs.physical]] as const).map(([title, list]) => (
          <section key={title} className="panel p-4" aria-label={`${title} attributes`}>
            <div className="panel-hd mb-2">{title}</div>
            <ul className="space-y-1">
              {list.map((d) => (
                <li key={d.key} className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted" title={d.evidence?.length ? `Evidence: ${d.evidence.join(', ')}` : undefined}>{d.label}</span>
                  <Attr range={estimate(state, p, p.attrs[d.key] ?? 10, d.key)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-xs text-fg-dim">Attributes use a 1–20 scale. Values are your staff's estimates shown as ranges; ranges narrow as your staff learn more about a player (your own roster, opponents you face, and a better Director of Pro Scouting).</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="panel-hd mb-2">Personality <span className="normal-case tracking-normal text-fg-dim">(simulated)</span></div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {PERSONALITY.map((d) => <li key={d.key} className="flex justify-between text-sm"><span className="text-fg-muted">{d.label}</span><Attr range={estimate(state, p, p.personality[d.key] ?? 10, `pers:${d.key}`, 20, own ? 1.2 : 1.8)} /></li>)}
          </ul>
        </section>
        <section className="panel p-4">
          <div className="panel-hd mb-2">What the estimate is built on (real data)</div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-fg-muted">GRIDIRON rating</dt><dd className="text-right tabular">{p.basis.rating != null ? `${p.basis.rating} (${p.basis.ratingSeason}, ${p.basis.games ?? 0} games)` : 'No qualifying games'}</dd>
            <dt className="text-fg-muted">Contract APY percentile at position</dt><dd className="text-right tabular">{p.basis.apyPct != null ? `${Math.round(p.basis.apyPct)}th` : '—'}</dd>
            <dt className="text-fg-muted">Real depth chart rank</dt><dd className="text-right tabular">{p.basis.depthRank ?? '—'}</dd>
            <dt className="text-fg-muted">Draft capital (pick value)</dt><dd className="text-right tabular">{p.basis.draftValue != null ? p.basis.draftValue.toFixed(2) : '—'}</dd>
            <dt className="text-fg-muted">Combine measurements</dt><dd className="text-right">{p.basis.combine ? 'Yes' : 'Not tested'}</dd>
          </dl>
          <Link to={`/player/${p.id}`} className="mt-2 inline-block text-xs text-ice underline">Open real GRIDIRON scouting profile</Link>
        </section>
      </div>

      <section className="panel overflow-x-auto p-4">
        <div className="panel-hd mb-2">Contract {p.contract?.src === 'otc' ? '(OverTheCap via nflverse)' : p.contract?.src === 'est_min' ? '(no public deal — CBA minimum assumed)' : p.contract ? '(signed in this career)' : ''}</div>
        {p.contract ? (
          <>
            <p className="mb-2 text-sm text-fg-muted">{p.contract.type ?? 'Contract'} · {p.contract.years_total ?? years.length} yrs{p.contract.value != null ? ` · ${m(p.contract.value)} total` : ''}{p.contract.apy != null ? ` · ${m(p.contract.apy)} APY` : ''}{p.contract.guaranteed_total != null ? ` · ${m(p.contract.guaranteed_total)} guaranteed` : ''} · expires after {p.contract.expires}</p>
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="kicker !text-[0.6rem] text-left"><th className="py-1">Year</th><th className="text-right">Base</th><th className="text-right">Prorated bonus</th><th className="text-right">Roster/option</th><th className="text-right">Guaranteed</th><th className="text-right">Cap hit</th></tr></thead>
              <tbody className="divide-y divide-line tabular">
                {years.map((y) => (
                  <tr key={y.year} className={y.void ? 'text-fg-dim' : ''}>
                    <td className="py-1">{y.year}{y.void ? ' (void)' : ''}</td><td className="text-right">{m(y.base, 3)}</td><td className="text-right">{m(y.prorated, 3)}</td>
                    <td className="text-right">{m(y.roster + y.option, 3)}</td><td className="text-right">{m(y.guaranteed, 3)}</td><td className="text-right font-semibold">{m(y.cap, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.team && <p className="mt-2 text-xs text-fg-dim">Current cap hit: {m(hit(state, p), 3)}.</p>}
          </>
        ) : <p className="text-sm text-fg-muted">No contract.</p>}
      </section>

      <section className="panel p-4">
        <div className="panel-hd mb-2">History in this career</div>
        {p.history.length ? (
          <ul className="space-y-1 text-sm">{p.history.slice(0, 40).map((h, i) => <li key={i}><span className="mr-2 text-fg-dim">{shortDate(h.date)}</span>{h.text}</li>)}</ul>
        ) : <p className="text-sm text-fg-muted">Nothing yet. {p.team ? `Currently with the ${teamName(state, p.team)}.` : ''}</p>}
      </section>
    </div>
  );
}
