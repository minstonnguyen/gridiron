import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Headshot } from '@/components/Img';
import type { Player, PosGroup } from '../../types';
import { useF } from '../context';
import { age, Btn, Empty, hit, LIST_LABEL, PageTitle, Pill, PlayerStars } from '../bits';
import { PlayerActions } from '../actions';
import { counts, isPS, LIMITS, freeAgentAsk } from '../../roster';
import { starRange } from '../../fog';
import { STARTERS } from '../../attributes';

const GROUPS = Object.keys(STARTERS) as PosGroup[];
const TABS = [
  { k: 'active', label: 'Active 53' }, { k: 'ps', label: 'Practice squad' }, { k: 'reserve', label: 'Reserve lists' },
  { k: 'fa', label: 'Free agents' }, { k: 'waivers', label: 'Waiver wire' },
] as const;
type Tab = (typeof TABS)[number]['k'];

export default function Squad() {
  const f = useF();
  const { state } = f;
  const [tab, setTab] = useState<Tab>('active');
  const [group, setGroup] = useState<PosGroup | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const c = counts(state, state.userTeam);
  const depthRank = useMemo(() => {
    const r: Record<string, number> = {};
    for (const ids of Object.values(state.depth[state.userTeam] ?? {})) (ids as string[]).forEach((id, i) => { r[id] = i + 1; });
    return r;
  }, [state, f.version]);

  const rows = useMemo(() => {
    const all = Object.values(state.players);
    let list: Player[];
    if (tab === 'active') list = all.filter((p) => p.team === state.userTeam && p.list === 'active');
    else if (tab === 'ps') list = all.filter((p) => p.team === state.userTeam && isPS(p));
    else if (tab === 'reserve') list = all.filter((p) => p.team === state.userTeam && ['ir', 'ir_return', 'pup', 'nfi'].includes(p.list));
    else if (tab === 'fa') list = all.filter((p) => p.list === 'fa');
    else list = all.filter((p) => p.list === 'waivers');
    if (group !== 'ALL') list = list.filter((p) => p.group === group);
    if (q.trim()) { const n = q.trim().toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(n)); }
    if (tab === 'fa' || tab === 'waivers') {
      const mid = (p: Player) => { const [a, b] = starRange(state, p, 'ca'); return a + b; };
      return list.sort((a, b) => mid(b) - mid(a)).slice(0, 150);
    }
    return list.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (depthRank[a.id] ?? 99) - (depthRank[b.id] ?? 99));
  }, [state, f.version, tab, group, q, depthRank]);

  return (
    <div>
      <PageTitle kicker="Roster" title="Squad" right={
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill tone={c.active > LIMITS.active ? 'red' : 'ice'}>53-man: {c.active}/{LIMITS.active}</Pill>
          <Pill tone={c.ps > LIMITS.ps ? 'red' : 'muted'}>PS: {c.ps}/{LIMITS.ps}{c.psIntl ? ` +${c.psIntl} IPP` : ''}</Pill>
          <Pill tone={c.psVets > LIMITS.psVets ? 'red' : 'muted'}>PS vets: {c.psVets}/{LIMITS.psVets}</Pill>
          <Pill>Elevated: {c.elevated}/{LIMITS.elevPerGame}</Pill>
          <Pill>IR returns used: {state.irReturns[state.userTeam] ?? 0}/{LIMITS.irReturns}</Pill>
        </div>} />
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => <Btn key={t.k} role="tab" aria-selected={tab === t.k} tone={tab === t.k ? 'primary' : 'default'} onClick={() => setTab(t.k)}>{t.label}</Btn>)}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="grp">Position group</label>
        <select id="grp" value={group} onChange={(e) => setGroup(e.target.value as any)} className="rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm">
          <option value="ALL">All positions</option>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" aria-label="Search players by name" className="rounded-md border border-line bg-ink-800 px-3 py-1.5 text-sm" />
        {(tab === 'fa' || tab === 'waivers') && <span className="text-xs text-fg-dim">Sorted by your staff's estimate of current ability (top 150).{tab === 'fa' && ' The pool is every player on a 2025 or 2026 NFL roster who is not on one now; public data does not record retirements, so a few may have retired.'}</span>}
      </div>
      {rows.length === 0 ? <Empty>No players.</Empty> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="kicker !text-[0.62rem] text-left">
              <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Player</th><th className="px-2 py-2">Age</th><th className="px-2 py-2">Exp</th>
              <th className="px-2 py-2">Ability</th><th className="px-2 py-2">Potential</th>
              <th className="px-2 py-2 text-right">{tab === 'fa' ? 'Asking' : 'Cap hit'}</th><th className="px-2 py-2">{tab === 'fa' ? 'Last team' : 'Thru'}</th>
              <th className="px-2 py-2">Status</th><th className="px-3 py-2">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-1.5"><span className="font-display font-bold text-fg-muted">{p.pos}</span>{tab === 'active' && depthRank[p.id] && <span className="ml-1 text-[0.68rem] text-fg-dim">#{depthRank[p.id]}</span>}</td>
                  <td className="px-3 py-1.5">
                    <Link to={f.path(`/player/${p.id}`)} className="flex items-center gap-2 hover:text-ice">
                      <Headshot src={p.headshot} alt="" width={64} className="h-7 w-7 shrink-0 rounded-full bg-ink-700" />
                      <span className="font-semibold">{p.name}</span>{p.jersey != null && <span className="text-xs text-fg-dim">#{p.jersey}</span>}
                    </Link>
                  </td>
                  <td className="tabular px-2 py-1.5">{age(p, state.date) ?? '—'}</td>
                  <td className="tabular px-2 py-1.5">{p.exp}</td>
                  <td className="px-2 py-1.5"><PlayerStars s={state} p={p} which="ca" /></td>
                  <td className="px-2 py-1.5"><PlayerStars s={state} p={p} which="pa" /></td>
                  <td className="tabular px-2 py-1.5 text-right">{tab === 'fa' ? `$${freeAgentAsk(state, p).toFixed(2)}M` : `$${hit(state, p).toFixed(2)}M`}</td>
                  <td className="tabular px-2 py-1.5 text-fg-muted">{tab === 'fa' ? (p.lastTeam ? `${p.lastTeam}${p.lastSeason ? ` '${String(p.lastSeason).slice(2)}` : ''}` : '—') : p.contract?.expires ?? '—'}{p.contract?.src === 'est_min' && tab !== 'fa' && <span className="ml-1 text-[0.65rem] text-fg-dim" title="No public contract — CBA minimum assumed">est</span>}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {p.injury && <Pill tone="red">{p.injury.type} · {p.injury.seasonEnding ? 'season' : `${p.injury.gamesOut} gm`}</Pill>}
                      {p.elevated && <Pill tone="volt">Elevated</Pill>}
                      {tab !== 'active' && <Pill>{LIST_LABEL[p.list]}</Pill>}
                      {p.list === 'waivers' && p.waiver && <span className="text-[0.7rem] text-fg-dim">from {p.waiver.from}</span>}
                    </div>
                  </td>
                  <td className={clsx('px-3 py-1.5')}><PlayerActions p={p} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
