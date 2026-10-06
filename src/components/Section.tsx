import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Section({ title, kicker, action, children, id }: { title: string; kicker?: string; action?: { to: string; label: string }; children: ReactNode; id?: string }) {
  const hid = id ?? title.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <section aria-labelledby={hid} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h2 id={hid} className="display text-2xl sm:text-3xl">{title}</h2>
        </div>
        {action && <Link to={action.to} className="kicker flex items-center gap-1 hover:text-fg">{action.label}<ChevronRight className="h-3.5 w-3.5" /></Link>}
      </div>
      {children}
    </section>
  );
}
