import { FIELDS, GOALS, venueById } from '@/data/options';
import type { OpenDoor, Person, Prefs, Profile } from '@/data/types';

export type DoorState = 'live' | 'upcoming' | 'expired' | 'ended';

export function doorState(d: OpenDoor, now = Date.now()): DoorState {
  if (d.endedAt) return 'ended';
  if (now > d.end) return 'expired';
  return now >= d.start ? 'live' : 'upcoming';
}
export const doorActive = (d?: OpenDoor) => !!d && ['live', 'upcoming'].includes(doorState(d));

/** The exact venue is only shown when the viewer matches who the host chose to share with. */
export function canSeeDoor(d: OpenDoor, host: Person, prefs: Prefs, profile: Profile): boolean {
  return d.audience.some((a) => {
    if (a === 'anyone') return true;
    if (a === 'students') return profile.status === 'student';
    if (a === 'early') return profile.status === 'early';
    if (a === 'changing') return profile.status === 'changing' || profile.status === 'between';
    if (a === 'same-field') return prefs.field === host.field;
    return false;
  });
}

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
export const sharedInterests = (p: Person, prefs: Prefs) => p.interests.filter((i) => lower(prefs.interests).includes(i.toLowerCase()));
/** Skills they have that you said you're interested in or also have. */
export const sharedSkills = (p: Person, prefs: Prefs) => p.skills.filter((s) => lower(prefs.skills).includes(s.toLowerCase()));
export const goalOverlap = (p: Person, prefs: Prefs) => prefs.goals.filter((g) => p.offers.includes(g));

export function matchReasons(p: Person, prefs: Prefs, distance?: number): string[] {
  const r: string[] = [];
  const first = firstName(p.name);
  if (prefs.field === p.field) r.push(`You're both in ${fieldLabelShort(p.field)}.`);
  const g = goalOverlap(p, prefs);
  if (g.length) r.push(`${first} offers ${g.map((x) => GOALS.find((y) => y.id === x)?.label.toLowerCase()).join(' and ')}, which you're looking for.`);
  const si = sharedInterests(p, prefs);
  if (si.length) r.push(`You share an interest in ${listJoin(si)}.`);
  const ss = sharedSkills(p, prefs);
  if (ss.length) r.push(`You both list ${listJoin(ss)} as a skill.`);
  if (prefs.mode !== 'offering' && p.status === 'experienced') r.push(`${first} has years of experience in ${p.fieldPhrase}.`);
  if (distance !== undefined && distance <= prefs.travelMi) r.push(`Within the ${prefs.travelMi} mi you said you'd travel.`);
  return r;
}

export function matchScore(p: Person, prefs: Prefs): number {
  return (prefs.field === p.field ? 3 : 0) + goalOverlap(p, prefs).length * 2 + sharedInterests(p, prefs).length + sharedSkills(p, prefs).length * 0.5;
}

export type Tone = 'friendly' | 'direct' | 'short';

export function conversationStarter(p: Person, prefs: Prefs, profile: Profile, tone: Tone, doorVisible: boolean): string {
  const first = firstName(p.name);
  const me = firstName(profile.name);
  const who = describeMe(profile, prefs);
  const intro = me ? `I'm ${me}${who ? `, ${who}` : ''}` : who ? `I'm ${who}` : "I'm new to the area";
  const goal = goalPhrase(p, prefs);
  const shared = sharedInterests(p, prefs)[0];
  const door = doorVisible && p.door && doorActive(p.door) ? p.door : undefined;
  const ask = door
    ? `Would you be open to a ${door.lengthMin}-minute chat at your Open Door at ${venueById(door.venueId).name}?`
    : p.meets === 'video'
      ? 'Would you be open to a short video call sometime this week?'
      : 'Would you be open to a quick coffee chat at a public spot sometime soon?';

  if (tone === 'short') return `Hi ${first}, ${intro}. I'm ${goal}. ${ask} Thanks either way!`;
  if (tone === 'direct')
    return `Hi ${first}, ${intro}, and I'm ${goal}. I'd really value your take on ${lowerFirst(p.helpsWith[0])}. ${ask}`;
  return `Hi ${first}, ${intro}. I'm ${goal}, and I noticed you ${p.hook}.${shared ? ` It looks like we're both into ${shared.toLowerCase()}, too.` : ''} I'd love to hear how you got started. ${ask}`;
}

function goalPhrase(p: Person, prefs: Prefs): string {
  const g = goalOverlap(p, prefs)[0] ?? prefs.goals[0];
  switch (g) {
    case 'mentorship': return `looking for a mentor in ${p.fieldPhrase}`;
    case 'advice': return `looking for advice on a career in ${p.fieldPhrase}`;
    case 'peers': return `hoping to meet other people working in ${p.fieldPhrase}`;
    case 'collab': return 'looking for people to build a project with';
    case 'recruiting': return `trying to understand how hiring works in ${p.fieldPhrase}`;
    case 'other': return prefs.goalOther.trim() ? lowerFirst(prefs.goalOther.trim().replace(/\.$/, '')) : `hoping to learn more about ${p.fieldPhrase}`;
    default: return `hoping to learn more about ${p.fieldPhrase}`;
  }
}

function describeMe(profile: Profile, prefs: Prefs): string {
  const org = profile.org.trim();
  const field = prefs.field ? fieldLabelShort(prefs.field) : '';
  switch (profile.status) {
    case 'student': return `a student${org ? ` at ${org}` : field ? ` interested in ${field}` : ''}`;
    case 'early': return `early in my career${field ? ` in ${field}` : ''}${org ? ` at ${org}` : ''}`;
    case 'experienced': return `working in ${field || 'my field'}${org ? ` at ${org}` : ''}`;
    case 'changing': return `in the middle of a career change${field ? ` into ${field}` : ''}`;
    case 'between': return 'between jobs right now';
    default: return '';
  }
}

export const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? '';
export const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?';
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const listJoin = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '').toLowerCase() : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`.toLowerCase());
export function fieldLabelShort(id: string): string {
  const l = FIELDS.find((f) => f.id === id)?.label ?? id;
  return l.split(' & ')[0].toLowerCase();
}
