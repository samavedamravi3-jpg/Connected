/**
 * Collab Circles: small meetups (3 to 5 people) around one topic, at a public place.
 * These are DEMO circles made from the built-in demo profiles, always labeled as demo.
 * Real circles need a backend table (circles + seats) so members see each other; joining here stays on this phone.
 */
import type { FieldId } from './types';

export type Circle = {
  id: string;
  topic: string;
  /** One honest line on what the group will do. */
  blurb: string;
  field?: FieldId;
  venueId: string;
  start: number;
  lengthMin: number;
  /** Total seats, 3 to 5. */
  seats: number;
  /** Demo person ids already seated (the host first). */
  members: string[];
  isDemo: true;
};

const HOUR = 3_600_000;

/** Next occurrence of a weekday (0 = Sunday) at a local hour, at least a few hours out. */
function next(day: number, hour: number, now: number) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  let add = (day - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() < now + 3 * HOUR) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

export function buildDemoCircles(now: number): Circle[] {
  return [
    { id: 'c-internship', topic: 'First internship coffee', blurb: 'Swap notes on applications, résumés and what recruiters look for.', field: 'finance', venueId: 'campus-library', start: next(6, 10, now), lengthMin: 60, seats: 5, members: ['jordan', 'kevin', 'grace'], isDemo: true },
    { id: 'c-switch', topic: 'Career switchers’ table', blurb: 'Tell your switch story out loud and get honest feedback.', venueId: 'noda-coffee', start: next(3, 18, now), lengthMin: 75, seats: 4, members: ['samuel', 'elena', 'ade'], isDemo: true },
    { id: 'c-build', topic: 'Looking for a designer', blurb: 'Builders and designers pairing up on side projects.', field: 'design', venueId: 'food-hall', start: next(4, 19, now), lengthMin: 90, seats: 5, members: ['aisha', 'daniel'], isDemo: true },
    { id: 'c-health', topic: 'Breaking into healthcare', blurb: 'Clinical and non-clinical paths, credentials, and first jobs.', field: 'health', venueId: 'main-library', start: next(2, 17, now), lengthMin: 60, seats: 4, members: ['priya', 'marcus'], isDemo: true },
    { id: 'c-energy', topic: 'Clean energy careers', blurb: 'Engineers and career changers talking grid, solar and how to get in.', field: 'energy', venueId: 'railtrail-cafe', start: next(5, 17, now), lengthMin: 60, seats: 3, members: ['nia', 'carlos'], isDemo: true },
  ];
}
