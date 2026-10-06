import { PlayerNode } from '@/features/players/PlayerCard';
import type { Slot, TeamLineup } from '@/types/api';

type Pt = { x: number; y: number };

function offenseLayout(slots: Slot[]): (Slot & Pt)[] {
  const pos: Record<string, Pt> = {
    LT: { x: 32, y: 26 }, LG: { x: 41, y: 26 }, C: { x: 50, y: 26 }, RG: { x: 59, y: 26 }, RT: { x: 68, y: 26 },
    TE: { x: 78, y: 29 }, WR1: { x: 7, y: 24 }, WR2: { x: 93, y: 24 }, WR3: { x: 20, y: 36 },
    QB: { x: 50, y: 50 }, RB: { x: 50, y: 75 },
  };
  return slots.map((s) => ({ ...s, ...(pos[s.key] ?? { x: 50, y: 90 }) }));
}

function spread(n: number, from: number, to: number) {
  if (n <= 1) return [(from + to) / 2];
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

function defenseLayout(slots: Slot[]): (Slot & Pt)[] {
  const edge = slots.filter((s) => s.key.startsWith('EDGE'));
  const dl = slots.filter((s) => s.key.startsWith('DL'));
  const lb = slots.filter((s) => s.key.startsWith('LB'));
  const cb = slots.filter((s) => s.key.startsWith('CB'));
  const sf = slots.filter((s) => s.key.startsWith('S'));
  const front = [edge[0], ...dl, edge[1]].filter(Boolean) as Slot[];
  const fx = spread(front.length, front.length >= 5 ? 26 : 30, front.length >= 5 ? 74 : 70);
  const lx = spread(lb.length, lb.length >= 3 ? 30 : 38, lb.length >= 3 ? 70 : 62);
  const cx = [7, 93];
  const sx = spread(sf.length, 34, 66);
  return [
    ...front.map((s, i) => ({ ...s, x: fx[i], y: 73 })),
    ...lb.map((s, i) => ({ ...s, x: lx[i], y: 49 })),
    ...cb.map((s, i) => ({ ...s, x: cx[i] ?? 50, y: 63 })),
    ...sf.map((s, i) => ({ ...s, x: sx[i], y: 22 })),
  ];
}

export function Field({ lineup, unit, color }: { lineup: TeamLineup; unit: 'OFFENSE' | 'DEFENSE'; color: string }) {
  const nodes = unit === 'OFFENSE' ? offenseLayout(lineup.offense) : defenseLayout(lineup.defense);
  const los = unit === 'OFFENSE' ? 13 : 87;
  return (
    <div className="scrollbar-thin -mx-2 overflow-x-auto px-2 pb-2">
      <div
        className="turf relative mx-auto h-[500px] min-w-[780px] sm:h-[560px] overflow-hidden rounded-xl border border-white/10 lg:h-[600px]"
        role="group"
        aria-label={`${lineup.team.name} ${unit.toLowerCase()} formation`}
        style={{ boxShadow: `inset 0 -120px 160px -80px ${color}55, inset 0 0 0 1px rgba(255,255,255,0.04)` }}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <line key={i} x1="0" x2="100" y1={i * 10} y2={i * 10} stroke="rgba(255,255,255,0.10)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
          ))}
          {Array.from({ length: 50 }, (_, i) => (
            <g key={`h${i}`}>
              <line x1="38" x2="39.4" y1={i * 2} y2={i * 2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="60.6" x2="62" y1={i * 2} y2={i * 2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          <line x1="0" x2="100" y1={los} y2={los} stroke="#5ad8ff" strokeOpacity="0.75" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <rect x="0" y={los - 1.5} width="100" height="3" fill="#5ad8ff" opacity="0.06" />
        </svg>
        <div className="kicker absolute left-3 text-[0.6rem] text-ice/80" style={{ top: `calc(${los}% - 18px)` }}>LINE OF SCRIMMAGE</div>
        <div className="absolute right-3 top-3 text-right">
          <div className="kicker text-white/70">{lineup.team.nickname ?? lineup.team.abbr} {unit}</div>
          <div className="kicker !text-[0.6rem] text-white/50">
            {unit === 'DEFENSE' ? `BASE ${lineup.front}` : '11 PERSONNEL (3WR · 1TE · 1RB)'} · DEPTH {lineup.depthSeason} WK {lineup.depthWeek ?? '—'}
          </div>
        </div>
        {nodes.map((n) => (
          <div key={n.key} className="absolute -translate-x-1/2 -translate-y-1/2 animate-rise" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <PlayerNode p={n.player} label={n.label} teamColor={color} />
          </div>
        ))}
      </div>
    </div>
  );
}
