import { useEffect, useState } from 'react';

export function useMedia(query: string) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
export const useCanHover = () => useMedia('(hover: hover) and (pointer: fine)');
export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');

/** Animated count-up for rating numbers (disabled under reduced motion). */
export function useCountUp(target: number | null, ms = 700) {
  const reduced = useReducedMotion();
  const [v, setV] = useState<number | null>(reduced ? target : target == null ? null : 0);
  useEffect(() => {
    if (target == null) { setV(null); return; }
    if (reduced) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}
