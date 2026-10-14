/** "14 Oct" for a shift that starts and ends on the same day, "14 Oct – 15 Oct"
 *  for one that runs past midnight. */
export function shiftDateRange(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const s = fmt(start);
  const e = fmt(end);
  return s === e ? s : `${s} – ${e}`;
}
