import { useState } from 'react';
import type { Player } from '../types';
import { useF } from './context';
import { Btn, Modal, m } from './bits';
import { releaseImpact } from '../cap';
import { activateIR, canAddPS, claim, elevate, freeAgentAsk, isPS, LIMITS, movePS, placeIR, promote, release, signFA, waiversApply } from '../roster';
import { keyDates, longDate } from '../calendar';

/** Every roster action available for a player, with the CBA rule enforced by the engine. */
export function PlayerActions({ p, compact = false }: { p: Player; compact?: boolean }) {
  const f = useF();
  const { state } = f;
  const [rel, setRel] = useState(false);
  const [sign, setSign] = useState(false);
  const own = p.team === state.userTeam;
  const size = compact ? '!px-2 !py-1 !text-xs' : '';
  const b: JSX.Element[] = [];
  if (own && p.list === 'active') {
    b.push(<Btn key="rel" tone="danger" className={size} onClick={() => setRel(true)}>Release</Btn>);
    if (p.injury) b.push(<Btn key="ir" className={size} onClick={() => f.act((s) => placeIR(s, p.id))}>Place on IR</Btn>);
    if (!compact) b.push(<Btn key="ps" className={size} onClick={() => f.act((s) => { const r = movePS(s, p.id); return r.ok ? { ok: true, message: `${p.name} moved to the practice squad.` } : r; })}>Move to practice squad</Btn>);
  }
  if (own && isPS(p)) {
    b.push(<Btn key="pro" tone="primary" className={size} onClick={() => f.act((s) => { const r = promote(s, p.id); return r.ok ? { ok: true, message: `${p.name} signed to the 53-man roster.` } : r; })}>Sign to 53</Btn>);
    b.push(<Btn key="elev" className={size} onClick={() => f.act((s) => elevate(s, p.id, !p.elevated))}>{p.elevated ? 'Cancel elevation' : `Elevate (${p.elevations}/${LIMITS.elevPerPlayer})`}</Btn>);
    b.push(<Btn key="rel" tone="danger" className={size} onClick={() => setRel(true)}>Release</Btn>);
  }
  if (own && ['ir', 'ir_return', 'pup', 'nfi'].includes(p.list)) {
    b.push(<Btn key="act" className={size} onClick={() => f.act((s) => { const r = activateIR(s, p.id); return r.ok ? { ok: true, message: `${p.name} activated.` } : r; })}>Activate</Btn>);
    b.push(<Btn key="rel" tone="danger" className={size} onClick={() => setRel(true)}>Release</Btn>);
  }
  if (p.list === 'fa') b.push(<Btn key="sign" tone="primary" className={size} onClick={() => setSign(true)}>Sign</Btn>);
  if (p.list === 'waivers' && p.waiver && p.waiver.from !== state.userTeam) {
    const claimed = p.waiver.claims.includes(state.userTeam);
    b.push(<Btn key="claim" tone={claimed ? 'default' : 'primary'} disabled={claimed} className={size} onClick={() => f.act((s) => { const r = claim(s, p.id); return r.ok ? { ok: true, message: `Claim submitted. Waivers clear ${longDate(p.waiver!.until)} at 4:00 p.m. ET.` } : r; })}>{claimed ? 'Claim submitted' : 'Claim'}</Btn>);
  }
  return (
    <>
      <div className="flex flex-wrap gap-1.5">{b.length ? b : !compact && <span className="text-sm text-fg-dim">No roster actions available for this player.</span>}</div>
      {rel && <ReleaseModal p={p} onClose={() => setRel(false)} />}
      {sign && <SignModal p={p} onClose={() => setSign(false)} />}
    </>
  );
}

function ReleaseModal({ p, onClose }: { p: Player; onClose: () => void }) {
  const f = useF();
  const imp = releaseImpact(f.state, p);
  const waivers = waiversApply(f.state, p);
  const vest = keyDates(f.state.games).vestedWaivers;
  return (
    <Modal title={`Release ${p.name}?`} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-fg-muted">{imp.year} cap hit now</dt><dd className="tabular text-right">{m(imp.capHitBefore, 3)}</dd>
        <dt className="text-fg-muted">Stays on {imp.year} cap (paid + accelerated)</dt><dd className="tabular text-right text-[#ffb3b3]">{m(imp.deadThisYear, 3)}</dd>
        <dt className="text-fg-muted">Dead money {imp.year + 1}</dt><dd className="tabular text-right text-[#ffb3b3]">{m(imp.deadNextYear, 3)}</dd>
        <dt className="text-fg-muted">Cap savings {imp.year}</dt><dd className="tabular text-right text-volt">{m(imp.savingsThisYear, 3)}</dd>
        <dt className="text-fg-muted">Guaranteed salary still owed</dt><dd className="tabular text-right">{m(imp.guaranteedOwed, 3)}</dd>
      </dl>
      <p className="mt-3 text-xs text-fg-muted">
        {imp.postJune1 ? 'In season (after June 1): salary already paid stays on this year’s cap, and signing-bonus proration for future years moves to next year’s cap. ' : 'Before June 1: all remaining signing-bonus proration accelerates onto this year’s cap. '}
        {isPS(p) ? 'Practice-squad players are not subject to waivers.' : waivers ? `He goes on waivers; if another club claims him, it takes over his remaining salary (your dead money stays).` : `As a vested veteran he becomes a free agent immediately${f.state.date < vest ? ` (vested veterans are subject to waivers from ${longDate(vest)})` : ''}.`}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="danger" onClick={() => { const r = f.act((s) => { const x = release(s, p.id); return x.ok ? { ok: true, message: `${p.name} released.` } : x; }); if (r.ok) onClose(); }}>Release player</Btn>
      </div>
    </Modal>
  );
}

function SignModal({ p, onClose }: { p: Player; onClose: () => void }) {
  const f = useF();
  const ask = freeAgentAsk(f.state, p);
  const [apy, setApy] = useState(ask.toFixed(3));
  const [list, setList] = useState<'active' | 'ps'>('active');
  const psOk = canAddPS(f.state, f.state.userTeam, p);
  return (
    <Modal title={`Sign ${p.name}`} onClose={onClose}>
      <p className="text-sm text-fg-muted">In-season free agents sign one-year deals. His agent is asking for <b className="text-fg">${ask.toFixed(3)}M</b> per season; the cap charge is prorated for the weeks remaining. Full multi-year negotiation arrives in Phase 4.</p>
      <div className="mt-3 flex gap-2">
        <Btn tone={list === 'active' ? 'primary' : 'default'} onClick={() => setList('active')}>53-man roster</Btn>
        <Btn tone={list === 'ps' ? 'primary' : 'default'} disabled={!psOk.ok} title={psOk.ok ? '' : psOk.error} onClick={() => setList('ps')}>Practice squad</Btn>
      </div>
      {list === 'active' && (
        <label className="mt-3 block text-sm"><span className="kicker mb-1 block">Salary offer ($M per season)</span>
          <input type="number" step="0.005" min={0} value={apy} onChange={(e) => setApy(e.target.value)} className="w-40 rounded-md border border-line bg-ink-800 px-3 py-2 tabular" /></label>
      )}
      {list === 'ps' && <p className="mt-3 text-xs text-fg-muted">Practice-squad pay is the CBA weekly rate ({p.exp >= 4 ? 'veteran' : 'standard'}).</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" onClick={() => { const r = f.act((s) => { const x = signFA(s, p.id, { list, apy: list === 'active' ? Number(apy) : undefined }); return x.ok ? { ok: true, message: `${p.name} signed.` } : x; }); if (r.ok) onClose(); }}>Offer contract</Btn>
      </div>
    </Modal>
  );
}
