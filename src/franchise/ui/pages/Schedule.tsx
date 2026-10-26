import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { TeamLogo } from '@/components/Img';
import { useF } from '../context';
import { Btn, PageTitle, Pill } from '../bits';
import { shortDate, DOW, weekday } from '../../calendar';
import { roundName } from '../../engine';
import type { Game } from '../../types';

export default function Schedule() {
  const f = useF();
  const { state } = f;
  const [mode, setMode] = useState<'mine' | 'league'>('mine');
  const weeks = useMemo(() => [...new Set(state.games.map((g) => g.week))].sort((a, b) => a - b), [state, f.version]);
  const current = state.games.filter((g) => !g.result).sort((a, b) => a.date.localeCompare(b.date))[0]?.week ?? weeks[weeks.length - 1];
  const [week, setWeek] = useState(current);
  const logo = (a: string) => state.teams.find((t) => t.abbr === a)?.logo;
  const list = mode === 'mine'
    ? state.games.filter((g) => g.home === state.userTeam || g.away === state.userTeam).sort((a, b) => a.date.localeCompare(b.date))
    : state.games.filter((g) => g.week === week).sort((a, b) => a.date.localeCompare(b.date));
  const row = (g: Game) => {
    const r = g.result;
    const mine = g.home === state.userTeam || g.away === state.userTeam;
    const us = g.home === state.userTeam ? r?.home : r?.away, them = g.home === state.userTeam ? r?.away : r?.home;
    const res = r && mine ? (us! > them! ? 'W' : us! < them! ? 'L' : 'T') : null;
    return (
      <li key={g.id} className={clsx('flex flex-wrap items-center gap-3 px-3 py-2', mine && mode === 'league' && 'bg-ice/5')}>
        <span className="w-24 shrink-0 text-xs text-fg-muted">{g.type === 'REG' ? `Week ${g.week}` : roundName(g.type)}<br />{DOW[weekday(g.date)]} {shortDate(g.date)}</span>
        <span className="flex min-w-[220px] flex-1 items-center gap-2">
          <TeamLogo src={logo(g.away)} abbr={g.away} size={24} /><span className={clsx('font-semibold', r && r.away > r.home && 'text-volt')}>{g.away}</span>
          <span className="tabular">{r ? r.away : ''}</span><span className="text-fg-dim">{g.neutral ? 'vs' : '@'}</span>
          <TeamLogo src={logo(g.home)} abbr={g.home} size={24} /><span className={clsx('font-semibold', r && r.home > r.away && 'text-volt')}>{g.home}</span>
          <span className="tabular">{r ? r.home : ''}</span>{r?.ot && <span className="text-xs text-fg-muted">OT</span>}
        </span>
        {res && <Pill tone={res === 'W' ? 'volt' : res === 'L' ? 'red' : 'muted'}>{res}</Pill>}
        {r ? <Pill tone={r.real ? 'ice' : 'amber'}>{r.real ? 'Real result' : 'Simulated'}</Pill> : g.date === state.date ? <Pill tone="volt">Today</Pill> : <span className="text-xs text-fg-dim">Upcoming</span>}
      </li>
    );
  };
  return (
    <div>
      <PageTitle kicker={`${state.season} season`} title="Schedule & results" right={
        <div className="flex flex-wrap gap-1.5">
          <Btn tone={mode === 'mine' ? 'primary' : 'default'} onClick={() => setMode('mine')}>My games</Btn>
          <Btn tone={mode === 'league' ? 'primary' : 'default'} onClick={() => setMode('league')}>League week</Btn>
          {mode === 'league' && <select aria-label="Week" value={week} onChange={(e) => setWeek(Number(e.target.value))} className="rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm">
            {weeks.map((w) => <option key={w} value={w}>{w <= 18 ? `Week ${w}` : roundName(state.games.find((g) => g.week === w)!.type)}</option>)}</select>}
        </div>} />
      <p className="mb-3 text-xs text-fg-dim">Real results are the actual NFL scores before your career began. Every game from your start date on is simulated by the Phase 1 results model, calibrated to real 2016–2025 scoring.</p>
      <ul className="panel divide-y divide-line">{list.map(row)}</ul>
    </div>
  );
}
