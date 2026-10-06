import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { TeamLogo } from '@/components/Img';
import { recordStr, statusLabel, vivid } from '@/lib/format';
import type { GameSide, GameSummary } from '@/types/api';

function Side({ s, winner, final, align }: { s: GameSide; winner: boolean; final: boolean; align: 'l' | 'r' }) {
  return (
    <div className={clsx('flex min-w-0 flex-1 items-center gap-3', align === 'r' && 'flex-row-reverse text-right')}>
      <TeamLogo src={s.logo} abbr={s.abbr} size={44} />
      <div className="min-w-0">
        <div className={clsx('display truncate text-xl', final && !winner && 'text-fg-muted')}>{s.nickname ?? s.abbr}</div>
        <div className="kicker !text-[0.62rem]">{s.abbr} · {recordStr(s.record)}</div>
      </div>
      {final && <div className={clsx('display tabular ml-auto text-3xl', align === 'r' && 'ml-0 mr-auto', !winner && 'text-fg-muted')}>{s.score}</div>}
    </div>
  );
}

export function GameCard({ g, compact }: { g: GameSummary; compact?: boolean }) {
  const final = g.status === 'final';
  const aw = final && (g.away.score ?? 0) > (g.home.score ?? 0);
  const hw = final && (g.home.score ?? 0) > (g.away.score ?? 0);
  const ac = vivid(g.away.primary, g.away.secondary), hc = vivid(g.home.primary, g.home.secondary);
  return (
    <Link
      to={`/game/${g.id}`}
      className="panel group block overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-white/20"
      aria-label={`${g.away.name} at ${g.home.name}, ${statusLabel(g)}`}
    >
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${ac}, transparent 45%, transparent 55%, ${hc})` }} />
      <div className={clsx('flex items-center gap-3', compact ? 'p-3' : 'p-4')}>
        <Side s={g.away} winner={aw} final={final} align="l" />
        <div className="shrink-0 px-1 text-center">
          <div className="display text-sm text-fg-dim">@</div>
        </div>
        <Side s={g.home} winner={hw} final={final} align="r" />
      </div>
      <div className="flex items-center justify-between border-t border-white/5 bg-black/20 px-4 py-1.5">
        <span className={clsx('kicker !text-[0.65rem]', final ? 'text-fg' : g.status === 'scheduled' ? 'text-ice' : 'text-[#ffd166]')}>{statusLabel(g)}</span>
        <span className="kicker !text-[0.6rem] truncate pl-2">{g.stadium ?? ''}</span>
      </div>
    </Link>
  );
}
