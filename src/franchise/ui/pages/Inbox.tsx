import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useF } from '../context';
import { Btn, Empty, PageTitle, Pill } from '../bits';
import { shortDate } from '../../calendar';

const KIND_TONE = { owner: 'amber', staff: 'ice', league: 'muted', medical: 'red', result: 'volt', transaction: 'ice', system: 'muted' } as const;

export default function Inbox() {
  const f = useF();
  const { state } = f;
  const [sel, setSel] = useState<string | null>(state.inbox[0]?.id ?? null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'urgent'>('all');
  const list = state.inbox.filter((x) => filter === 'all' || (filter === 'unread' ? !x.read : x.urgent));
  const m = state.inbox.find((x) => x.id === sel) ?? null;
  const open = (id: string) => { setSel(id); const x = state.inbox.find((y) => y.id === id); if (x && !x.read) f.act(() => { x.read = true; }); };
  return (
    <div>
      <PageTitle kicker="Inbox" title="Messages" right={
        <div className="flex gap-1.5">
          {(['all', 'unread', 'urgent'] as const).map((k) => <Btn key={k} tone={filter === k ? 'primary' : 'default'} onClick={() => setFilter(k)} className="capitalize">{k}</Btn>)}
          <Btn tone="ghost" onClick={() => f.act((s) => { s.inbox.forEach((x) => { x.read = true; }); })}>Mark all read</Btn>
        </div>} />
      {list.length === 0 ? <Empty>No messages here.</Empty> : (
        <div className="grid gap-3 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <ul className="panel max-h-[70vh] divide-y divide-line overflow-y-auto">
            {list.slice(0, 200).map((x) => (
              <li key={x.id}>
                <button onClick={() => open(x.id)} className={clsx('block w-full px-3 py-2.5 text-left hover:bg-white/5', sel === x.id && 'bg-ice/10')}>
                  <div className="flex items-center gap-2">
                    {!x.read && <span className="h-2 w-2 shrink-0 rounded-full bg-volt" aria-label="Unread" />}
                    <span className={clsx('truncate text-sm', !x.read ? 'font-semibold text-fg' : 'text-fg-muted')}>{x.subject}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-dim">
                    <span>{shortDate(x.date)}</span><span>·</span><span className="truncate">{x.from}</span>{x.urgent && <Pill tone="red">Urgent</Pill>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {m ? (
            <article className="panel p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2"><Pill tone={KIND_TONE[m.kind]}>{m.kind}</Pill><span className="text-xs text-fg-dim">{shortDate(m.date)} · From {m.from}</span></div>
              <h2 className="display text-2xl">{m.subject}</h2>
              <div className="mt-3 space-y-3 whitespace-pre-line text-sm leading-relaxed text-fg">{m.body}</div>
              {m.link && <Link to={f.path(m.link)} className="mt-4 inline-block rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-ice hover:bg-white/5">Open</Link>}
            </article>
          ) : <Empty>Select a message.</Empty>}
        </div>
      )}
    </div>
  );
}
