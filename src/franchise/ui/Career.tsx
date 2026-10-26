import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, CalendarDays, ChevronDown, Copy, Download, FastForward, Inbox as InboxIcon, Landmark, ListOrdered, Newspaper, Play, Repeat, Trophy, Users, UserCog } from 'lucide-react';
import clsx from 'clsx';
import { TeamLogo } from '@/components/Img';
import { PageLoading } from '@/components/States';
import { FranchiseProvider, useF } from './context';
import { Btn, Modal } from './bits';
import { longDate, shortDate } from '../calendar';
import { nextUserGame, roundName, teamName } from '../engine';
import { standings, teamRecord } from '../standings';
import { copySave, exportSave } from '../storage';
import { teamCap } from '../cap';

const Inbox = lazy(() => import('./pages/Inbox'));
const Squad = lazy(() => import('./pages/Squad'));
const PlayerPage = lazy(() => import('./pages/PlayerPage'));
const Depth = lazy(() => import('./pages/Depth'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Standings = lazy(() => import('./pages/Standings'));
const Finances = lazy(() => import('./pages/Finances'));
const StaffPage = lazy(() => import('./pages/Staff'));
const NewsPage = lazy(() => import('./pages/News'));
const Transactions = lazy(() => import('./pages/Transactions'));

export default function Career() {
  const { saveId = '' } = useParams();
  return (
    <FranchiseProvider saveId={saveId} fallback={({ error }) => error ? (
      <div className="panel p-8 text-center"><div className="display text-2xl">Could not open this career</div><p className="mt-2 text-sm text-fg-muted">{error}</p><Link to="/franchise" className="mt-3 inline-block text-ice underline">Back to your careers</Link></div>
    ) : <PageLoading label="Loading career" />}>
      <Shell />
    </FranchiseProvider>
  );
}

const NAV = [
  { to: '', label: 'Inbox', icon: InboxIcon, end: true },
  { to: '/squad', label: 'Squad', icon: Users },
  { to: '/depth', label: 'Depth chart', icon: ListOrdered },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/standings', label: 'Standings', icon: Trophy },
  { to: '/finances', label: 'Finances', icon: Landmark },
  { to: '/staff', label: 'Staff', icon: UserCog },
  { to: '/news', label: 'League news', icon: Newspaper },
  { to: '/transactions', label: 'Transactions', icon: Repeat },
];

function Shell() {
  const f = useF();
  const { state } = f;
  const base = `/franchise/c/${state.meta.id}`;
  const unread = state.inbox.filter((x) => !x.read).length;
  return (
    <div className="space-y-4">
      <TopBar />
      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Franchise" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible">
            {NAV.map((n) => (
              <li key={n.label} className="shrink-0">
                <NavLink to={base + n.to} end={n.end} className={({ isActive }) => clsx('flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold', isActive ? 'bg-ice/10 text-ice' : 'text-fg-muted hover:bg-white/5 hover:text-fg')}>
                  <n.icon className="h-4 w-4" aria-hidden="true" />{n.label}
                  {n.label === 'Inbox' && unread > 0 && <span className="ml-auto rounded-full bg-volt px-1.5 text-[0.65rem] font-bold text-ink-950">{unread}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
          <SaveTools />
        </nav>
        <div className="min-w-0">
          {f.blocked.length > 0 && (
            <div role="alert" className="mb-4 rounded-lg border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold text-[#ffb3b3]"><AlertOctagon className="h-4 w-4" />Resolve before continuing</div>
              <ul className="list-disc space-y-0.5 pl-5 text-fg">{f.blocked.map((b) => <li key={b}>{b}</li>)}</ul>
              {state.phase !== 'season_over' && <Link to={base + '/squad'} className="mt-1 inline-block text-ice underline">Go to Squad</Link>}
            </div>
          )}
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route index element={<Inbox />} />
              <Route path="squad" element={<Squad />} />
              <Route path="player/:pid" element={<PlayerPage />} />
              <Route path="depth" element={<Depth />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="standings" element={<Standings />} />
              <Route path="finances" element={<Finances />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="news" element={<NewsPage />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="*" element={<Inbox />} />
            </Routes>
          </Suspense>
        </div>
      </div>
      {f.toast && (
        <div role="status" aria-live="polite" className={clsx('fixed bottom-4 left-1/2 z-[130] w-[min(92vw,520px)] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-card', f.toast.ok ? 'border-volt/40 bg-[#132012] text-fg' : 'border-[#ff6b6b]/40 bg-[#2a1214] text-[#ffd6d6]')}>{f.toast.text}</div>
      )}
    </div>
  );
}

function TopBar() {
  const f = useF();
  const { state } = f;
  const [open, setOpen] = useState(false);
  const team = state.teams.find((t) => t.abbr === state.userTeam)!;
  const rows = useMemo(() => standings(state), [state, f.version]);
  const next = nextUserGame(state);
  const cap = teamCap(state, state.userTeam);
  const nextLabel = next ? `${next.type === 'REG' ? `Wk ${next.week}` : roundName(next.type)} · ${next.home === state.userTeam ? 'vs' : '@'} ${next.home === state.userTeam ? next.away : next.home} · ${shortDate(next.date)}${next.date === state.date ? ' (today)' : ''}` : state.phase === 'season_over' ? 'Season complete' : 'No game scheduled';
  const disabled = f.busy || f.blocked.length > 0;
  return (
    <header className="panel flex flex-wrap items-center gap-4 p-3 sm:p-4" style={{ ['--team' as any]: team.color ?? '#5ad8ff' }}>
      <Link to="/franchise" className="rounded p-1 text-fg-muted hover:bg-white/5" aria-label="Back to your careers"><ArrowLeft className="h-5 w-5" /></Link>
      <TeamLogo src={team.logo} abbr={team.abbr} size={44} />
      <div className="min-w-0">
        <div className="display truncate text-2xl">{team.name}</div>
        <div className="kicker !text-[0.62rem]">{teamRecord(rows, state.userTeam)} · {state.meta.coach} · Cap space ${cap.space.toFixed(1)}M{state.meta.ironman ? ' · Ironman' : ''}</div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <div className="text-right">
          <div className="font-display text-lg font-bold" aria-live="polite">{f.progress ?? longDate(state.date)}</div>
          <div className="text-xs text-fg-muted">Next: {nextLabel}</div>
        </div>
        <div className="relative flex">
          <Btn tone="primary" disabled={disabled} onClick={() => f.cont('game')} className="rounded-r-none px-4 py-2 text-base" title={f.blocked[0]}>
            {f.busy ? <FastForward className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />}Continue
          </Btn>
          <Btn tone="primary" disabled={disabled} aria-label="More continue options" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-l-none border-l border-ink-950/30 px-2 py-2"><ChevronDown className="h-4 w-4" /></Btn>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-line bg-ink-800 shadow-card" onMouseLeave={() => setOpen(false)}>
              {([['day', 'One day'], ['game', 'To next game day'], ['week', 'One week']] as const).map(([k, l]) => (
                <button key={k} className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => { setOpen(false); f.cont(k); }}>{l}</button>
              ))}
              <div className="border-t border-line px-3 py-2 text-[0.7rem] text-fg-dim">Continue stops early for urgent inbox items.</div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SaveTools() {
  const f = useF();
  const [copyOpen, setCopyOpen] = useState(false);
  const [name, setName] = useState('');
  const doExport = async () => {
    const blob = await exportSave(f.state);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${f.state.meta.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${f.state.date}.gridiron`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2 lg:mt-3 lg:block lg:space-y-1.5 lg:pt-3">
      <div className="kicker !text-[0.6rem]">Save</div>
      <p className="hidden text-[0.7rem] text-fg-dim lg:block">Autosaves after every action.</p>
      {!f.state.meta.ironman && <Btn className="lg:w-full" onClick={() => { setName(`${f.state.meta.name} (${f.state.date})`); setCopyOpen(true); }}><Copy className="h-4 w-4" />Save a copy</Btn>}
      <Btn className="lg:w-full" onClick={doExport}><Download className="h-4 w-4" />Export file</Btn>
      {copyOpen && (
        <Modal title="Save a copy" onClose={() => setCopyOpen(false)}>
          <label className="block text-sm"><span className="kicker mb-1 block">Copy name</span><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-line bg-ink-800 px-3 py-2" /></label>
          <p className="mt-2 text-xs text-fg-muted">The copy is an independent career slot. You keep playing this one.</p>
          <div className="mt-4 flex justify-end gap-2"><Btn onClick={() => setCopyOpen(false)}>Cancel</Btn>
            <Btn tone="primary" onClick={async () => { await copySave(f.state, name || 'Copy'); setCopyOpen(false); f.setToast({ text: 'Copy saved. Find it on the careers screen.', ok: true }); }}>Save copy</Btn></div>
        </Modal>
      )}
      <p className="hidden pt-1 text-[0.7rem] text-fg-dim lg:block">Playing as {teamName(f.state, f.state.userTeam)}.</p>
    </div>
  );
}
