import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FlaskConical, Shield, Trash2, Upload } from 'lucide-react';
import clsx from 'clsx';
import { TeamLogo } from '@/components/Img';
import type { SaveMeta, Seed } from '../types';
import { newGame } from '../engine';
import { deleteSave, importSave, listSaves, storageEstimate, writeSave } from '../storage';
import { longDate } from '../calendar';
import { loadSeed } from './context';
import { Btn, Modal, PageTitle } from './bits';

export default function FranchiseHome() {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<SaveMeta | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const refresh = () => listSaves().then(setSaves).catch((e) => setErr(`Browser storage is unavailable: ${e.message ?? e}`));
  useEffect(() => { refresh(); storageEstimate().then(setUsage); loadSeed().then(({ seed }) => setSeed(seed)).catch((e) => setErr(e.message)); }, []);

  return (
    <div className="space-y-6">
      <PageTitle kicker="GRIDIRON Franchise Mode · Phase 1" title="Your careers" right={
        <div className="flex flex-wrap gap-2">
          <Link to="/franchise/calibration" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-white/5"><FlaskConical className="h-4 w-4" />Realism report</Link>
          <Btn onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Import save</Btn>
          <Btn tone="primary" disabled={!seed} onClick={() => setCreating(true)}>New career</Btn>
          <input ref={fileRef} type="file" accept=".gridiron,.gz,.json,application/gzip,application/json" className="hidden" aria-label="Import save file"
            onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const m = await importSave(f); await refresh(); nav(`/franchise/c/${m.id}`); } catch (x: any) { setErr(x.message); } e.target.value = ''; }} />
        </div>} />

      {err && <div role="alert" className="panel border-[#ff6b6b]/40 p-4 text-sm text-[#ffb3b3]">{err}</div>}

      <div className="panel p-5 text-sm text-fg-muted">
        <p>Take over any of the 32 clubs as General Manager and Head Coach, starting on today's date of the real {seed?.season ?? ''} season with real rosters, real contracts and real results so far.
          From your first day the league diverges: every result after today is simulated by a model calibrated to real NFL data, and you never see true player ratings — only your staff's estimates.</p>
        {seed && <p className="mt-2 text-xs text-fg-dim">League data as of {new Date(seed.generated_at).toLocaleString()} · rosters from week {seed.roster_week} · career starts {longDate(seed.start_date)}. Saves live in this browser only; export a file to back up or move a career.</p>}
      </div>

      {saves === null ? <div className="skeleton h-24" /> : saves.length === 0 ? (
        <div className="panel p-8 text-center"><div className="display text-2xl">No careers yet</div><p className="mt-1 text-sm text-fg-muted">Start a new career to pick your club.</p></div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {saves.map((s) => {
            const t = seed?.teams.find((x) => x.abbr === s.team);
            return (
              <li key={s.id} className="panel flex items-center gap-4 p-4">
                <TeamLogo src={t?.logo} abbr={s.team} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.name}</div>
                  <div className="kicker !text-[0.62rem]">{t?.name ?? s.team} · {s.coach}{s.ironman ? ' · Ironman' : ''}</div>
                  <div className="text-xs text-fg-dim">{longDate(s.date)}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Btn tone="primary" onClick={() => nav(`/franchise/c/${s.id}`)}>Continue</Btn>
                  <Btn tone="ghost" aria-label={`Delete ${s.name}`} onClick={() => setConfirmDel(s)}><Trash2 className="h-4 w-4" /></Btn>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {usage && usage.quota > 0 && <p className="text-xs text-fg-dim">Browser storage used: {(usage.usage / 1e6).toFixed(1)} MB of {(usage.quota / 1e6).toFixed(0)} MB available.</p>}

      {creating && seed && <NewCareer seed={seed} onClose={() => setCreating(false)} onCreated={(id) => nav(`/franchise/c/${id}`)} />}
      {confirmDel && (
        <Modal title="Delete career?" onClose={() => setConfirmDel(null)}>
          <p className="text-sm text-fg-muted">"{confirmDel.name}" will be permanently removed from this browser. {confirmDel.ironman ? 'This is an Ironman career; it cannot be recovered.' : 'Export it first if you want a backup.'}</p>
          <div className="mt-4 flex justify-end gap-2"><Btn onClick={() => setConfirmDel(null)}>Cancel</Btn><Btn tone="danger" onClick={async () => { await deleteSave(confirmDel.id); setConfirmDel(null); refresh(); }}>Delete</Btn></div>
        </Modal>
      )}
    </div>
  );
}

function NewCareer({ seed, onClose, onCreated }: { seed: Seed; onClose: () => void; onCreated: (id: string) => void }) {
  const [team, setTeam] = useState<string | null>(null);
  const [coach, setCoach] = useState('');
  const [name, setName] = useState('');
  const [ironman, setIronman] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byConf = useMemo(() => {
    const out: Record<string, typeof seed.teams> = {};
    for (const t of [...seed.teams].sort((a, b) => a.div.localeCompare(b.div) || a.name.localeCompare(b.name))) (out[t.div] ??= []).push(t);
    return out;
  }, [seed]);
  const record = (abbr: string) => {
    let w = 0, l = 0, tt = 0;
    for (const g of seed.schedule) {
      if (!g.result || g.type !== 'REG' || (g.home !== abbr && g.away !== abbr)) continue;
      const me = g.home === abbr ? g.result.home : g.result.away, op = g.home === abbr ? g.result.away : g.result.home;
      if (me > op) w++; else if (me < op) l++; else tt++;
    }
    return `${w}-${l}${tt ? `-${tt}` : ''}`;
  };
  const t = seed.teams.find((x) => x.abbr === team);

  const start = async () => {
    if (!team || !coach.trim()) return;
    setWorking(true); setErr(null);
    try {
      const { cal } = await loadSeed();
      await new Promise((r) => setTimeout(r, 30));
      const st = newGame(seed, cal, { team, coach: coach.trim(), name: name.trim() || `${t?.name} — ${coach.trim()}`, ironman, assistantRoster: assistant });
      await writeSave(st);
      onCreated(st.meta.id);
    } catch (e: any) { setErr(e.message ?? String(e)); setWorking(false); }
  };

  return (
    <Modal title="New career" onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <fieldset>
          <legend className="kicker mb-2">1 · Choose your club</legend>
          <div className="space-y-3">
            {Object.entries(byConf).map(([div, teams]) => (
              <div key={div}>
                <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-fg-dim">{div}</div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {teams.map((x) => (
                    <button key={x.abbr} type="button" onClick={() => setTeam(x.abbr)} aria-pressed={team === x.abbr}
                      className={clsx('flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs', team === x.abbr ? 'border-volt bg-volt/10' : 'border-line hover:bg-white/5')}>
                      <TeamLogo src={x.logo} abbr={x.abbr} size={24} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{x.nickname ?? x.abbr}</span><span className="tabular text-fg-dim">{record(x.abbr)}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="kicker mb-1 block">2 · Your name (Head Coach &amp; GM)</span>
            <input value={coach} onChange={(e) => setCoach(e.target.value)} maxLength={40} className="w-full rounded-md border border-line bg-ink-800 px-3 py-2" placeholder="e.g. Jordan Reyes" /></label>
          <label className="block text-sm"><span className="kicker mb-1 block">Career name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-full rounded-md border border-line bg-ink-800 px-3 py-2" placeholder={t ? `${t.name} — ${coach || 'you'}` : ''} /></label>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ironman} onChange={(e) => setIronman(e.target.checked)} className="mt-1" />
          <span><b>Ironman</b> — one save that autosaves continuously. No copies, no reloading earlier states.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={assistant} onChange={(e) => setAssistant(e.target.checked)} className="mt-1" />
          <span><b>Let the Assistant GM handle roster emergencies</b> — fill injured spots and keep the roster legal automatically. You can change this later.</span></label>
        {t && <p className="flex items-center gap-2 text-xs text-fg-muted"><Shield className="h-4 w-4" />You replace {t.head_coach ?? 'the head coach'} at the {t.name}. Owner expectations are set from the club's current roster and record.</p>}
        {err && <p role="alert" className="text-sm text-[#ffb3b3]">{err}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" disabled={!team || !coach.trim() || working} onClick={start}>{working ? 'Building league…' : 'Start career'}</Btn>
      </div>
    </Modal>
  );
}
