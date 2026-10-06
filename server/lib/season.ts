/** CURRENT_SEASON: Jan–Feb belong to the previous calendar year's season; from March the upcoming season is current.
 * The services then verify against data actually present in the database. */
export function seasonForDate(d = new Date()): number {
  return d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1;
}
export const CURRENT_SEASON = Number(process.env.GRIDIRON_CURRENT_SEASON ?? seasonForDate());
