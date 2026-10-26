// Small, fast, serialisable PRNG (sfc32). The full state lives in the save, so a save replays deterministically.
export class Rng {
  s: number[];
  constructor(state: number[]) { this.s = state.slice(0, 4).map((x) => x >>> 0); }
  static fromSeed(seed: string): Rng {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    const next = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
    const r = new Rng([next(), next(), next(), next()]);
    for (let i = 0; i < 15; i++) r.next();
    return r;
  }
  next(): number {
    let [a, b, c, d] = this.s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    this.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return (t >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  normal(mu = 0, sd = 1): number {
    const u = Math.max(1e-12, this.next()), v = this.next();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick<T>(xs: T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  weighted<T>(items: [T, number][]): T {
    const tot = items.reduce((s, [, w]) => s + w, 0);
    let x = this.next() * tot;
    for (const [it, w] of items) { if ((x -= w) <= 0) return it; }
    return items[items.length - 1][0];
  }
  state(): number[] { return this.s.slice(); }
}

/** Stable hash of a string to [-1, 1] — used for per-player fixed scouting bias, so estimates don't flicker. */
export function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export function normCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
