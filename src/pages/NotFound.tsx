import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="display text-8xl text-fg-dim">4TH & LONG</div>
      <p className="mt-2 text-fg-muted">That page isn't in the playbook.</p>
      <Link to="/" className="mt-6 rounded-lg bg-ice px-4 py-2 font-display font-bold tracking-wider text-ink-950">BACK HOME</Link>
    </div>
  );
}
