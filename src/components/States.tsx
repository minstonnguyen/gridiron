import { AlertTriangle, DatabaseZap, RefreshCw, SearchX, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const e = error instanceof ApiError ? error : null;
  const db = e?.code === 'database_unavailable';
  const net = e?.code === 'network';
  const nf = e?.status === 404 || e?.code === 'not_found';
  const Icon = db ? DatabaseZap : net ? WifiOff : nf ? SearchX : AlertTriangle;
  const title = db ? 'Database unavailable' : net ? 'Data service unreachable' : nf ? 'Data unavailable' : 'Something went wrong';
  const body = db
    ? 'The GRIDIRON database did not respond. Try again in a moment.'
    : net ? 'Check your connection — the API could not be reached.'
    : nf ? 'This record is not in the GRIDIRON database (it may be outside the synced seasons).'
    : e?.message || 'The API returned an unexpected error.';
  return (
    <div role="alert" className={`panel flex ${compact ? 'p-4' : 'p-8'} flex-col items-center gap-3 text-center`}>
      <Icon className="h-7 w-7 text-[#ff9f5a]" aria-hidden="true" />
      <div className="display text-xl">{title}</div>
      <p className="max-w-md text-sm text-fg-muted">{body}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="panel stripe flex flex-col items-center gap-2 p-8 text-center">
      {icon}
      <div className="display text-lg tracking-wider text-fg-muted">{title}</div>
      {children && <div className="max-w-md text-sm text-fg-dim">{children}</div>}
    </div>
  );
}

export const DataUnavailable = ({ label = 'DATA UNAVAILABLE', className = '' }: { label?: string; className?: string }) => (
  <span className={`kicker text-fg-dim ${className}`}>{label}</span>
);
