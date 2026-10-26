import { useF } from '../context';
import { PageTitle, Pill } from '../bits';
import { STAFF_ATTRS } from '../../staff';

export default function StaffPage() {
  const f = useF();
  const { state } = f;
  const mine = state.staff.filter((s) => s.team === state.userTeam);
  const hcs = state.staff.filter((s) => s.role === 'Head Coach' && s.team !== state.userTeam).sort((a, b) => a.team.localeCompare(b.team));
  return (
    <div className="space-y-4">
      <PageTitle kicker="Backroom" title="Staff" />
      <p className="text-sm text-fg-muted">Coordinators, position coaches, trainers and scouts are generated people with fictional names, because no reliable public list of every NFL assistant exists. Head coaches around the league are real. Hiring, firing and coaching trees arrive in Phase 3.</p>
      <section className="panel overflow-x-auto p-3">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="kicker !text-[0.58rem] text-left"><th className="px-2 py-1">Role</th><th className="px-2">Name</th>{STAFF_ATTRS.map((a) => <th key={a.key} className="px-1 text-center" title={a.label}>{a.label.split(' ').map((w) => w[0]).join('')}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {mine.map((s) => (
              <tr key={s.id}><td className="px-2 py-1.5 text-fg-muted">{s.role}</td><td className="px-2 font-semibold">{s.name} {s.role === 'Head Coach' ? <Pill tone="volt">You</Pill> : !s.real && <Pill>Generated</Pill>}</td>
                {STAFF_ATTRS.map((a) => { const v = s.attrs[a.key]; return <td key={a.key} className={`px-1 text-center tabular font-display font-bold ${v >= 15 ? 'text-volt' : v >= 11 ? 'text-ice' : v >= 7 ? 'text-fg' : 'text-[#ff9f8a]'}`}>{v}</td>; })}</tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-fg-dim">{STAFF_ATTRS.map((a) => `${a.label.split(' ').map((w) => w[0]).join('')} = ${a.label}`).join(' · ')}. Your Director of Pro Scouting's Judging Ability narrows the attribute ranges you see.</p>
      </section>
      <section className="panel p-3"><div className="panel-hd mb-2">Head coaches around the league (real)</div>
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">{hcs.map((s) => <li key={s.id}><span className="mr-2 font-display font-bold text-fg-muted">{s.team}</span>{s.name}</li>)}</ul>
      </section>
    </div>
  );
}
