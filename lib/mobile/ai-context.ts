// Builds the allow-listed context the mobile AI routes send to Claude (via lib/ai.ts coachContext).
// Sender: own name, goals (including their own "something else" text) and meeting preferences.
// Target: only public fields. Never photos, socials, locations, emails or account ids.
import type { MemberPrefs, MemberProfileFields, PublicMember } from './model';

const GOAL_WORDS: Record<string, string> = {
  mentorship: 'a mentor', advice: 'career advice', peers: 'peers at a similar stage', collab: 'collaborators',
  recruiting: 'insight into how hiring works', other: 'a useful conversation',
};
const FIELD_WORDS: Record<string, string> = {
  finance: 'finance and banking', tech: 'technology', health: 'healthcare', energy: 'energy and engineering',
  design: 'design and marketing', public: 'public service', education: 'education',
};
const words = (ids: string[]) => ids.map((g) => GOAL_WORDS[g] ?? g).join(', ');

export function senderForAi(profile: MemberProfileFields, prefs: MemberPrefs) {
  const field = prefs.field ? ` in ${FIELD_WORDS[prefs.field]}` : '';
  const other = prefs.goals.includes('other') && prefs.goalOther ? ` (${prefs.goalOther})` : '';
  return {
    name: profile.name,
    goal: `Looking for ${words(prefs.goals) || 'a useful conversation'}${field}${other}.`,
    meetingStyle: prefs.meetMode === 'inperson' ? 'In person' : prefs.meetMode === 'video' ? 'Online' : 'Either',
    experience: profile.status === 'student' ? 'Student' : profile.status === 'experienced' ? 'Experienced' : 'Early career',
    availability: prefs.availability.includes('today') ? 'Now' : prefs.availability.includes('week') ? 'This week' : 'Flexible',
  };
}

export function targetForAi(pub: PublicMember) {
  return {
    name: pub.name,
    role: pub.role,
    company: pub.org,
    help: [...pub.helpsWith, ...pub.offers.map((g) => GOAL_WORDS[g] ?? g)].slice(0, 6),
    goal: pub.lookingFor.length ? `Looking for ${words(pub.lookingFor)}.` : '',
  };
}
