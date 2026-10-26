// League calendar helpers. All dates are New York (league) calendar dates as YYYY-MM-DD strings.
export const parseDate = (d: string) => new Date(d + 'T12:00:00Z');
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = parseDate(d); x.setUTCDate(x.getUTCDate() + n); return fmtDate(x); };
export const weekday = (d: string) => parseDate(d).getUTCDay(); // 0 = Sunday
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const longDate = (d: string) =>
  parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const shortDate = (d: string) => parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export interface KeyDates {
  tradeDeadline: string; vestedWaivers: string; regEnd: string; wildCard: string; divisional: string; conference: string; superBowl: string;
}

/**
 * Key dates derived from the season's real schedule using the NFL's published rules, so future seasons work
 * without hard-coded years:
 *  - trade deadline: the Tuesday after Week 9 (Nov 10, 2026 per the official NFL calendar)
 *  - vested veterans subject to waivers from the following day
 *  - Wild Card Saturday = 6 days after the final regular-season Sunday; Divisional +7; Championships the Sunday after;
 *    Super Bowl two weeks after the Championships (Jan 16 / Jan 23 / Jan 31 / Feb 14, 2027 per the official calendar).
 */
export function keyDates(games: { week: number; type: string; date: string }[]): KeyDates {
  const reg = games.filter((g) => g.type === 'REG');
  const lastOf = (w: number) => reg.filter((g) => g.week === w).map((g) => g.date).sort().pop()!;
  const w9 = lastOf(9);
  let td = addDays(w9, 1);
  while (weekday(td) !== 2) td = addDays(td, 1);
  const regEnd = reg.map((g) => g.date).sort().pop()!;
  let lastSunday = regEnd;
  while (weekday(lastSunday) !== 0) lastSunday = addDays(lastSunday, -1);
  const wildCard = addDays(lastSunday, 6);
  const divisional = addDays(wildCard, 7);
  const conference = addDays(divisional, 8);
  const superBowl = addDays(conference, 14);
  return { tradeDeadline: td, vestedWaivers: addDays(td, 1), regEnd, wildCard, divisional, conference, superBowl };
}
