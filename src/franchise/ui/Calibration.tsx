import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import hit from '../calibration/draftHitRates.json';
import { PageTitle } from './bits';

interface Report {
  generated_at: string; seed_generated_at: string; seasons_simulated: number; seconds_per_season: number; failed: number;
  checks: { name: string; target: string; value: string; pass: boolean }[];
  unit: { name: string; pass: boolean; detail?: string }[];
}
const TIERS = ['elite', 'pro_bowl', 'starter', 'contributor', 'bust'] as const;
const TL: Record<string, string> = { elite: 'Elite', pro_bowl: 'Pro Bowl', starter: 'Starter', contributor: 'Contributor', bust: 'Bust' };
const BUCKETS = ['R1 top10', 'R1 11-32', 'R2', 'R3', 'R4', 'R5', 'R6-7'];
const pct = (x: number | undefined) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const H = hit as any;

const LIT = [
  ['Windy City Gridiron — NFL Draft research project (starters and impact players)', 'https://www.windycitygridiron.com/2023/3/29/23659586/the-nfl-draft-research-project-starters-and-impact-players-edge-rushers-premium-players-top-picks'],
  ['Harvard Sports Analysis — Drafting an NFL QB', 'https://harvardsportsanalysis.org/2011/05/drafting-an-nfl-qb/'],
  ['Per Thirty Six — NFL draft expected value', 'https://perthirtysix.com/essay/nfl-draft-expected-value'],
  ['Football Perspective — Creating a draft value chart', 'https://www.footballperspective.com/creating-a-nfl-draft-value-chart-part-i/'],
  ['Frontiers in Sports and Active Living (2025) — draft position and career outcomes', 'https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1628223/abstract'],
];

export default function CalibrationPage() {
  const [rep, setRep] = useState<Report | null | 'missing'>(null);
  const [pos, setPos] = useState('QB');
  useEffect(() => { fetch('./data/franchise/calibration-report.json').then((r) => (r.ok ? r.json() : 'missing')).then(setRep).catch(() => setRep('missing')); }, []);
  const byPos = H.by_position[pos] ?? {};
  return (
    <div className="space-y-5">
      <Link to="/franchise" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Your careers</Link>
      <PageTitle kicker="Franchise Mode" title="Realism report" />
      <p className="max-w-3xl text-sm text-fg-muted">Everything the simulation produces is checked against real NFL data. The draft study below sets how often prospects hit by round and position; the model checks and rules tests are re-run on every deploy, and any check that misses its target is flagged here and in the build log.</p>

      <section className="panel p-4">
        <div className="panel-hd mb-1">Draft outcomes by round — real classes {H.classes} (n = {H.n.toLocaleString()})</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="kicker !text-[0.6rem] text-left"><th className="py-1">Draft slot</th><th className="text-right">n</th>{TIERS.map((t) => <th key={t} className="text-right">{TL[t]}</th>)}<th className="text-right">Starter+</th><th className="text-right">2nd contract</th></tr></thead>
            <tbody className="tabular divide-y divide-line">
              {BUCKETS.map((b) => { const r = H.overall[b]; return (
                <tr key={b}><td className="py-1 font-semibold">{b}</td><td className="text-right text-fg-muted">{r.n}</td>{TIERS.map((t) => <td key={t} className="text-right">{pct(r[t])}</td>)}
                  <td className="text-right text-volt">{pct(r.elite + r.pro_bowl + r.starter)}</td><td className="text-right">{pct(H.second_contract_5pct[b])}</td></tr>); })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-fg-dim">Tiers: {TIERS.map((t) => `${TL[t]} = ${H.definitions[t]}`).join('; ')}. Second contract = later paid at least 5% of the cap after the rookie deal. Data: nflverse draft_picks (Pro-Football-Reference career fields) and OverTheCap historical contracts.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="panel-hd mb-1">Franchise quarterbacks are rare</div>
          <p className="mb-2 text-xs text-fg-muted">{H.franchise_qb.definition}.</p>
          <table className="w-full text-sm"><thead><tr className="kicker !text-[0.6rem] text-left"><th className="py-1">Slot</th><th className="text-right">QBs</th><th className="text-right">Franchise</th><th className="text-right">Multi-year starter</th></tr></thead>
            <tbody className="tabular divide-y divide-line">{BUCKETS.map((b) => { const r = H.franchise_qb.by_bucket[b]; return r ? (
              <tr key={b}><td className="py-1">{b}</td><td className="text-right">{r.n}</td><td className="text-right text-volt">{pct(r.franchise)}</td><td className="text-right">{pct(r.multi_year_starter)}</td></tr>) : null; })}</tbody></table>
          <p className="mt-2 text-xs text-fg-dim">Only {H.franchise_qb.overall ? pct(H.franchise_qb.overall.franchise) : '8.6%'} of all drafted QBs become franchise starters. Hits in the study include {Object.values(H.franchise_qb.by_bucket).flatMap((x: any) => x.names ?? []).slice(0, 10).join(', ')}.</p>
        </section>
        <section className="panel p-4">
          <div className="mb-1 flex items-center justify-between gap-2"><span className="panel-hd">By position</span>
            <select aria-label="Position" value={pos} onChange={(e) => setPos(e.target.value)} className="rounded-md border border-line bg-ink-800 px-2 py-1 text-sm">{Object.keys(H.by_position).filter((p) => p !== 'DB').map((p) => <option key={p}>{p}</option>)}</select></div>
          <table className="w-full text-sm"><thead><tr className="kicker !text-[0.6rem] text-left"><th className="py-1">Slot</th><th className="text-right">n</th><th className="text-right">Elite+PB</th><th className="text-right">Starter+</th><th className="text-right">Bust</th></tr></thead>
            <tbody className="tabular divide-y divide-line">{BUCKETS.map((b) => { const r = byPos[b]; return r ? (
              <tr key={b}><td className="py-1">{b}</td><td className="text-right text-fg-muted">{r.n}</td><td className="text-right">{pct(r.elite + r.pro_bowl)}</td><td className="text-right text-volt">{pct(r.elite + r.pro_bowl + r.starter)}</td><td className="text-right">{pct(r.bust)}</td></tr>) : null; })}</tbody></table>
          <p className="mt-2 text-xs text-fg-dim">Small cells are shrunk toward the round average (k = 20) before the sim uses them, so a single lucky class does not drive outcomes.</p>
        </section>
      </div>

      <section className="panel p-4">
        <div className="panel-hd mb-2">Simulation model checks</div>
        {rep === null ? <div className="skeleton h-24" /> : rep === 'missing' ? <p className="text-sm text-fg-muted">The model check report has not been published yet.</p> : (
          <>
            <p className="mb-2 text-xs text-fg-muted">{rep.seasons_simulated} full regular seasons simulated from the {new Date(rep.seed_generated_at).toLocaleDateString()} league seed on {new Date(rep.generated_at).toLocaleString()} · {rep.failed === 0 ? 'all checks passed' : `${rep.failed} failed`}.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
              <thead><tr className="kicker !text-[0.6rem] text-left"><th className="py-1">Check (real NFL 2016–2025 target)</th><th className="text-right">Target</th><th className="text-right">Simulated</th><th className="w-8" /></tr></thead>
              <tbody className="tabular divide-y divide-line">{rep.checks.map((c) => (
                <tr key={c.name}><td className="py-1">{c.name}</td><td className="text-right text-fg-muted">{c.target}</td><td className={clsx('text-right font-semibold', c.pass ? 'text-volt' : 'text-[#ffb3b3]')}>{c.value}</td>
                  <td className="text-right">{c.pass ? <CheckCircle2 className="ml-auto h-4 w-4 text-volt" aria-label="pass" /> : <XCircle className="ml-auto h-4 w-4 text-[#ff6b6b]" aria-label="fail" />}</td></tr>))}</tbody>
            </table></div>
            <div className="panel-hd mb-1 mt-4">Rules tests</div>
            <ul className="space-y-1 text-sm">{rep.unit.map((u) => <li key={u.name} className="flex items-start gap-2">{u.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-volt" aria-label="pass" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#ff6b6b]" aria-label="fail" />}<span>{u.name}{u.detail && <span className="text-fg-dim"> — {u.detail}</span>}</span></li>)}</ul>
          </>
        )}
      </section>

      <section className="panel p-4">
        <div className="panel-hd mb-2">Published research that agrees</div>
        <ul className="list-disc space-y-1 pl-5 text-sm">{LIT.map(([t, u]) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="text-ice underline">{t}</a></li>)}</ul>
      </section>
    </div>
  );
}
