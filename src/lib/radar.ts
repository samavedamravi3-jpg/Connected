/**
 * Conversation Radar: what people nearby are open to talking about.
 * Topics come only from what each person put on their profile (things they help with, mentoring in their field,
 * interests). Nothing is inferred or invented. Bubble positions are around the group's rough area, never a person.
 */
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ChallengeId, LatLng, NearbyPerson } from '@/data/types';
import { fieldLabelShort } from './match';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type RadarTopic = { id: string; label: string; icon: IconName; people: NearbyPerson[]; at: LatLng };

const HELP_TOPIC: Record<ChallengeId, { label: string; icon: IconName }> = {
  start: { label: 'Where to start', icon: 'compass-outline' },
  network: { label: 'Meeting people in the field', icon: 'people-outline' },
  interviews: { label: 'Interview prep', icon: 'mic-outline' },
  resume: { label: 'Resume feedback', icon: 'document-text-outline' },
  credentials: { label: 'Credentials from abroad', icon: 'globe-outline' },
  switching: { label: 'Switching careers', icon: 'swap-horizontal-outline' },
  hiring: { label: 'How hiring works', icon: 'briefcase-outline' },
  skills: { label: 'What to learn next', icon: 'bulb-outline' },
  team: { label: 'Looking for people to build with', icon: 'construct-outline' },
};

export function radarTopics(people: NearbyPerson[], max = 6): RadarTopic[] {
  const map = new Map<string, { label: string; icon: IconName; people: NearbyPerson[] }>();
  const add = (id: string, label: string, icon: IconName, p: NearbyPerson) => {
    const t = map.get(id) ?? { label, icon, people: [] };
    if (!t.people.some((x) => x.id === p.id)) t.people.push(p);
    map.set(id, t);
  };
  for (const p of people) {
    for (const h of p.helpTags) add(`help:${h}`, HELP_TOPIC[h].label, HELP_TOPIC[h].icon, p);
    if (p.offers.includes('mentorship')) add(`field:${p.field}`, `Breaking into ${fieldLabelShort(p.field)}`, 'trending-up-outline', p);
    for (const i of p.interests) add(`int:${i.toLowerCase()}`, i, 'sparkles-outline', p);
  }
  const ranked = [...map.entries()]
    .map(([id, t]) => ({ id, ...t }))
    .filter((t) => t.people.length >= (people.length > 6 ? 2 : 1))
    .sort((a, b) => b.people.length - a.people.length || a.label.localeCompare(b.label))
    .slice(0, max);

  // Spread bubbles on a small ring around the middle of each topic's group so labels don't stack.
  return ranked.map((t, i) => {
    const lat = t.people.reduce((n, p) => n + p.coord.latitude, 0) / t.people.length;
    const lng = t.people.reduce((n, p) => n + p.coord.longitude, 0) / t.people.length;
    const angle = (i / Math.max(1, ranked.length)) * Math.PI * 2;
    return { ...t, at: { latitude: lat + Math.sin(angle) * 0.006, longitude: lng + Math.cos(angle) * 0.008 } };
  });
}
