// The day's sports fixtures for the FDJ betting terminal.
// Fully DETERMINISTIC per day (seeded PRNG, no Math.random / Date) so the same
// day always yields the same card — safe in the build sandbox and stable across
// reloads. matchesForDay returns a mix of finished matches (for Mode B ticket
// settlement) and upcoming matches (for Mode A bet placement, some kicking off
// soon so the clock crosses their kickoff during the day — the judge-the-clock).

import type { MatchInfo, BetPick } from '../types';

/** Counter time at the start of each day, 'HH:MM'. */
export const START_CLOCK: string = '08:00';

/** Minutes the clock advances per client served (~7 min). */
export const CLOCK_STEP_MIN: number = 7;

// --- clock helpers -----------------------------------------------------------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Advance the counter clock by one client (~7 min), as 'HH:MM'. */
export function nextClock(clock: string): string {
  return fromMinutes(toMinutes(clock) + CLOCK_STEP_MIN);
}

/** True if `kickoff` is at or before the current `clock` (match already started). */
export function hasStarted(kickoff: string, clock: string): boolean {
  return toMinutes(kickoff) <= toMinutes(clock);
}

// --- deterministic PRNG (mulberry32) ----------------------------------------

function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rint(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- data --------------------------------------------------------------------

const TEAMS: readonly string[] = [
  'Paris SG', 'Marseille', 'Lyon', 'Lille', 'Monaco', 'Lens', 'Rennes', 'Nice',
  'Nantes', 'Strasbourg', 'Real Madrid', 'Barcelone', 'Bayern', 'Liverpool',
  'Juventus', 'Milan AC', 'Man City', 'Chelsea', 'Dortmund', 'Porto', 'Ajax',
  'Naples', 'Inter', 'Séville', 'Benfica', 'Atlético',
];

/** Plausible decimal odds, rounded to 2 decimals. */
function genOdds(rng: () => number): MatchInfo['odds'] {
  const round2 = (x: number): number => Math.round(x * 100) / 100;
  return {
    a: round2(1.4 + rng() * 2.4), // 1.40 .. 3.80
    draw: round2(2.8 + rng() * 1.2), // 2.80 .. 4.00
    b: round2(1.8 + rng() * 3.4), // 1.80 .. 5.20
  };
}

/**
 * The day's betting card, deterministic per `day`:
 *   - 3 finished matches (status 'done', with finalScore) for Mode B settlement,
 *     kicked off early in the morning so they read as already started/finished.
 *   - several upcoming matches for Mode A; the first few kick off just after the
 *     opening clock so the advancing clock crosses them mid-day (judge-the-clock).
 */
export function matchesForDay(day: number): MatchInfo[] {
  const rng = seeded(day * 101 + 7);
  const names = shuffled(TEAMS, rng);
  let ni = 0;
  const team = (): string => names[ni++ % names.length];

  const matches: MatchInfo[] = [];

  // Finished matches (Mode B) — played earlier this morning, varied each day.
  const doneKickoffs: string[] = [];
  let dt = 255 + rint(rng, 60); // ~04:15..05:15
  for (let i = 0; i < 3; i++) {
    doneKickoffs.push(fromMinutes(Math.min(465, dt))); // never past 07:45
    dt += 45 + rint(rng, 55);
  }
  doneKickoffs.forEach((kickoff, i) => {
    matches.push({
      id: `m${day}-d${i}`,
      teamA: team(),
      teamB: team(),
      kickoff,
      status: 'done',
      finalScore: { a: rint(rng, 4), b: rint(rng, 4) },
      odds: genOdds(rng),
    });
  });

  // Upcoming matches (Mode A), varied per day:
  //  - a couple in the morning "crossing window" (08:10..09:05) so the advancing
  //    clock can cross them mid-day (the judge-the-clock tension), and
  //  - several later in the day, spread across the afternoon/evening.
  const upcomingMins: number[] = [];
  let ct = 490 + rint(rng, 15); // ~08:10
  const nCross = 2 + rint(rng, 2); // 2-3 morning matches
  for (let i = 0; i < nCross; i++) {
    upcomingMins.push(ct);
    ct += 12 + rint(rng, 20);
  }
  let lt = 600 + rint(rng, 90); // ~10:00..11:30
  for (let i = 0; i < 4; i++) {
    upcomingMins.push(lt);
    lt += 110 + rint(rng, 140);
  }
  upcomingMins.forEach((mins, i) => {
    matches.push({
      id: `m${day}-u${i}`,
      teamA: team(),
      teamB: team(),
      kickoff: fromMinutes(mins),
      status: 'upcoming',
      odds: genOdds(rng),
    });
  });

  return matches;
}

/** Find a match in the day's card by id (safe undefined if absent). */
export function matchById(day: number, id: string): MatchInfo | undefined {
  return matchesForDay(day).find((m) => m.id === id);
}

/** Outcome implied by a final score: home win 'A', away win 'B', else 'draw'. */
export function outcomeFromScore(score: { a: number; b: number }): BetPick {
  if (score.a > score.b) return 'A';
  if (score.a < score.b) return 'B';
  return 'draw';
}
