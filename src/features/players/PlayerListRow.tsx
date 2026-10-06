import { Link } from 'react-router-dom';
import { Headshot } from '@/components/Img';
import { ConfidencePill, RatingBadge, TierTag } from '@/components/Rating';
import { vivid } from '@/lib/format';
import type { PlayerListItem } from '@/types/api';

export function PlayerListRow({ p, rank, showConfidence }: { p: PlayerListItem; rank?: number; showConfidence?: boolean }) {
  return (
    <Link to={`/player/${p.id}`} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]">
      {rank != null && <span className="display tabular w-6 text-right text-lg text-fg-dim">{rank}</span>}
      <div className="relative">
        <Headshot src={p.headshot} alt="" width={96} className="h-11 w-11 rounded-full bg-ink-700" />
        <span className="absolute inset-0 rounded-full ring-2" style={{ ['--tw-ring-color' as string]: vivid(p.teamPrimary) + '99' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold group-hover:text-white">{p.name}</div>
        <div className="kicker !text-[0.62rem]">{p.ratingPosition ?? p.position} · {p.team ?? 'FA'}{p.jersey != null ? ` · #${p.jersey}` : ''}{p.positionRank ? ` · ${p.ratingPosition} #${p.positionRank}` : ''}</div>
      </div>
      <div className="hidden text-right sm:block">
        <TierTag tier={p.tier} className="!text-[0.6rem]" />
        {showConfidence && <div className="mt-0.5"><ConfidencePill c={p.confidence} /></div>}
      </div>
      <RatingBadge value={p.overall} size="sm" />
    </Link>
  );
}
