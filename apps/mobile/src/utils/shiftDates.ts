/** One date for a shift that starts and ends on the same day, "start – end"
 *  for one that runs past midnight. `fmt` is the screen's own day formatter,
 *  so "Today – Tomorrow" and "14 Oct – 15 Oct" both come out naturally. */
export function shiftDateRange(start: string, end: string, fmt: (iso: string) => string): string {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  return sameDay ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}
