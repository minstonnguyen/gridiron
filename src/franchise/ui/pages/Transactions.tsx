import { useState } from 'react';
import { useF } from '../context';
import { Btn, Empty, PageTitle, Pill } from '../bits';
import { shortDate } from '../../calendar';

export default function Transactions() {
  const { state } = useF();
  const [mine, setMine] = useState(true);
  const list = state.transactions.filter((t) => !mine || t.team === state.userTeam);
  return (
    <div>
      <PageTitle kicker="Wire" title="Transactions" right={<div className="flex gap-1.5"><Btn tone={mine ? 'primary' : 'default'} onClick={() => setMine(true)}>My club</Btn><Btn tone={!mine ? 'primary' : 'default'} onClick={() => setMine(false)}>League</Btn></div>} />
      {list.length === 0 ? <Empty>No transactions in this career yet.</Empty> : (
        <ul className="panel divide-y divide-line">
          {list.slice(0, 300).map((t, i) => <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"><span className="w-14 text-xs text-fg-dim">{shortDate(t.date)}</span><Pill tone={t.team === state.userTeam ? 'volt' : 'muted'}>{t.team}</Pill><span>{t.text}</span></li>)}
        </ul>
      )}
    </div>
  );
}
