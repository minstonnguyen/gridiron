import { useF } from '../context';
import { Empty, PageTitle, Pill } from '../bits';
import { shortDate } from '../../calendar';

export default function NewsPage() {
  const { state } = useF();
  return (
    <div>
      <PageTitle kicker="Around the league" title="League news" />
      {state.news.length === 0 ? <Empty>No news yet.</Empty> : (
        <ul className="panel divide-y divide-line">
          {state.news.slice(0, 200).map((n) => (
            <li key={n.id} className="px-4 py-2.5"><div className="flex items-center gap-2 text-xs text-fg-dim">{shortDate(n.date)}{n.team && <Pill tone={n.team === state.userTeam ? 'volt' : 'muted'}>{n.team}</Pill>}<Pill tone="amber">Simulated</Pill></div>
              <div className="font-semibold">{n.headline}</div>{n.body && <p className="text-sm text-fg-muted">{n.body}</p>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
