import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Calibration, FranchiseState, Seed } from '../types';
import { advanceDay, blockers, userGameOn } from '../engine';
import { readSave, writeSave } from '../storage';
import draftHitRates from '../calibration/draftHitRates.json';
import pickValue from '../calibration/pickValue.json';
import combineDist from '../calibration/combineDist.json';

/** Seed + calibration are static files written by scripts/franchise/export_seed.py at deploy time. */
let seedP: Promise<{ seed: Seed; cal: Calibration }> | null = null;
export function loadSeed() {
  if (!seedP) {
    seedP = (async () => {
      const get = async (f: string) => {
        const r = await fetch(`./data/franchise/${f}`, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`Franchise data file ${f} is missing (HTTP ${r.status}). The site may still be deploying.`);
        return r.json();
      };
      const [seed, cal] = await Promise.all([get('seed.json'), get('calibration.json')]);
      cal.draftHitRates ??= draftHitRates; cal.pickValue ??= pickValue; cal.combineDist ??= combineDist;
      return { seed, cal };
    })();
    seedP.catch(() => { seedP = null; });
  }
  return seedP;
}

export type Stop = 'day' | 'game' | 'week';
export type ActResult = { ok: true; message?: string } | { ok: false; error: string };

interface Ctx {
  state: FranchiseState; cal: Calibration; seed: Seed; version: number;
  /** Run a mutation against the live save, then autosave. */
  act: (fn: (s: FranchiseState) => ActResult | void) => ActResult;
  cont: (stop: Stop) => Promise<void>;
  busy: boolean; progress: string | null; blocked: string[];
  toast: { text: string; ok: boolean } | null; setToast: (t: { text: string; ok: boolean } | null) => void;
  path: (p: string) => string;
}
const C = createContext<Ctx | null>(null);
export const useF = () => { const c = useContext(C); if (!c) throw new Error('useF outside provider'); return c; };

export function FranchiseProvider({ saveId, children, fallback }: { saveId: string; children: ReactNode; fallback: (s: { error?: string }) => ReactNode }) {
  const [data, setData] = useState<{ state: FranchiseState; seed: Seed; cal: Calibration } | null>(null);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [{ seed, cal }, state] = await Promise.all([loadSeed(), readSave(saveId)]);
        if (!live) return;
        if (!state) { setError('This save no longer exists on this device.'); return; }
        setData({ state, seed, cal });
      } catch (e: any) { if (live) setError(e.message ?? String(e)); }
    })();
    return () => { live = false; };
  }, [saveId]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toast]);

  const persist = useCallback((s: FranchiseState) => {
    saving.current = saving.current.then(() => writeSave(s)).catch((e) => setToast({ text: `Autosave failed: ${e.message ?? e}`, ok: false }));
  }, []);

  const act = useCallback((fn: (s: FranchiseState) => ActResult | void): ActResult => {
    if (!data) return { ok: false, error: 'Not loaded' };
    const r = fn(data.state) ?? { ok: true as const };
    setVersion((v) => v + 1);
    persist(data.state);
    if (!r.ok) setToast({ text: r.error, ok: false }); else if (r.message) setToast({ text: r.message, ok: true });
    return r;
  }, [data, persist]);

  const cont = useCallback(async (stop: Stop) => {
    if (!data || busy) return;
    const { state, cal } = data;
    setBusy(true);
    try {
      const start = state.date;
      for (let i = 0; i < 60; i++) {
        setProgress(`Simulating ${new Date(state.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}…`);
        await new Promise((r) => setTimeout(r, 0)); // let the progress paint
        const urgentBefore = state.inbox.filter((m) => m.urgent && !m.read).length;
        const r = advanceDay(state, cal);
        if (r.blocked) { setToast({ text: r.blocked[0], ok: false }); break; }
        setVersion((v) => v + 1);
        if (stop === 'day' || state.phase === 'season_over') break;
        if (state.inbox.filter((m) => m.urgent && !m.read).length > urgentBefore) break;
        const userPlayed = r.played.some((g) => g.home === state.userTeam || g.away === state.userTeam);
        if (stop === 'game' && (userGameOn(state) || userPlayed)) break;
        if (stop === 'week' && i >= 6) break;
        if (state.date === start) break;
      }
      persist(state);
      await saving.current;
    } finally { setBusy(false); setProgress(null); setVersion((v) => v + 1); }
  }, [data, busy, persist]);

  if (!data) return <>{fallback({ error })}</>;
  const value: Ctx = {
    state: data.state, cal: data.cal, seed: data.seed, version, act, cont, busy, progress, blocked: blockers(data.state), toast, setToast,
    path: (p: string) => `/franchise/c/${saveId}${p.startsWith('/franchise') ? p.slice('/franchise'.length) : p}`,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
