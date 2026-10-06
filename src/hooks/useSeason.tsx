import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMeta } from './useData';
import type { MetaResponse } from '@/types/api';

interface Ctx { season: number | undefined; week: number | undefined; setSeason: (s: number) => void; setWeek: (w: number) => void; meta: MetaResponse | undefined }
const SeasonCtx = createContext<Ctx>({ season: undefined, week: undefined, setSeason: () => {}, setWeek: () => {}, meta: undefined });

/** Global season/week selection. Defaults to CURRENT_SEASON and current week reported by the data layer. */
export function SeasonProvider({ children }: { children: ReactNode }) {
  const { data: meta } = useMeta();
  const [season, setSeasonState] = useState<number>();
  const [week, setWeek] = useState<number>();
  useEffect(() => {
    if (meta && season == null) {
      setSeasonState(meta.currentSeason);
      setWeek(meta.currentWeek ?? meta.weeksBySeason[meta.currentSeason]?.[0]);
    }
  }, [meta, season]);
  const value = useMemo<Ctx>(() => ({
    season, week, meta, setWeek,
    setSeason: (s: number) => {
      setSeasonState(s);
      const weeks = meta?.weeksBySeason[s] ?? [];
      setWeek(s === meta?.currentSeason ? meta?.currentWeek ?? weeks[0] : weeks[0]);
    },
  }), [season, week, meta]);
  return <SeasonCtx.Provider value={value}>{children}</SeasonCtx.Provider>;
}
export const useSeason = () => useContext(SeasonCtx);
