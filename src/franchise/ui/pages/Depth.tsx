import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Lock, Unlock, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import type { PosGroup } from '../../types';
import { useF } from '../context';
import { Btn, PageTitle, Pill, PlayerStars } from '../bits';
import { STARTERS } from '../../attributes';
import { autoDepth, isPS, syncDepth } from '../../roster';

const GROUPS = Object.keys(STARTERS) as PosGroup[];

export default function Depth() {
  const f = useF();
  const { state } = f;
  const team = state.userTeam;
  syncDepth(state, team);
  const d = state.depth[team] ?? ({} as Record<string, string[]>);
  const move = (g: PosGroup, i: number, dir: -1 | 1) => f.act((s) => {
    const list = [...(s.depth[team][g] ?? [])];
    const j = i + dir; if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    s.depth[team][g] = list; s.userDepthLocked = true;
  });
  return (
    <div>
      <PageTitle kicker="Game plan" title="Depth chart" right={
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => f.act((s) => { autoDepth(s, team); return { ok: true, message: 'Depth chart rebuilt from your staff’s ratings.' }; })}><Wand2 className="h-4 w-4" />Auto-fill</Btn>
          <Btn tone={state.userDepthLocked ? 'primary' : 'default'} onClick={() => f.act((s) => { s.userDepthLocked = !s.userDepthLocked; })}>
            {state.userDepthLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}{state.userDepthLocked ? 'Locked (your order)' : 'Staff manage order'}
          </Btn>
        </div>} />
      <p className="mb-3 text-sm text-fg-muted">Starters (highlighted) play the most snaps and drive the result. Injured players are skipped on game day. When unlocked, your staff re-sort each position before every game.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g} className="panel p-3" aria-label={`${g} depth`}>
            <div className="mb-2 flex items-center justify-between"><span className="display text-xl">{g}</span><span className="kicker !text-[0.6rem]">{STARTERS[g]} starter{STARTERS[g] > 1 ? 's' : ''}</span></div>
            <ol className="space-y-1">
              {(d[g] ?? []).map((id: string, i: number) => {
                const p = state.players[id]; if (!p) return null;
                return (
                  <li key={id} className={clsx('flex items-center gap-2 rounded-md px-2 py-1 text-sm', i < STARTERS[g] ? 'bg-ice/10' : 'bg-ink-800/60')}>
                    <span className="w-5 text-right tabular text-fg-dim">{i + 1}</span>
                    <Link to={f.path(`/player/${p.id}`)} className="min-w-0 flex-1 truncate font-semibold hover:text-ice">{p.name}</Link>
                    {p.injury && <Pill tone="red">Inj</Pill>}{isPS(p) && <Pill>{p.elevated ? 'PS↑' : 'PS'}</Pill>}
                    <span className="hidden sm:inline"><PlayerStars s={state} p={p} which="ca" /></span>
                    <button aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(g, i, -1)} className="rounded p-1 text-fg-muted hover:bg-white/5 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button aria-label={`Move ${p.name} down`} disabled={i === (d[g]?.length ?? 0) - 1} onClick={() => move(g, i, 1)} className="rounded p-1 text-fg-muted hover:bg-white/5 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
