/** Original GRIDIRON mark: a "G" carved from yard lines. */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" />
      <path d="M6 9.5h20M6 16h20M6 22.5h20" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.5" />
      <path d="M21.5 11a7.2 7.2 0 1 0 1.7 7.6H16.4" stroke="#5ad8ff" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-fg" aria-label="GRIDIRON home">
      <LogoMark />
      <span className="display text-[1.55rem] tracking-[0.08em] italic">GRID<span className="text-ice">IRON</span></span>
    </span>
  );
}
