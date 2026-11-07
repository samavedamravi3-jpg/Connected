import type { Area, AudienceId, AvailabilityId, EventCategory, FieldId, GoalId, StatusId, Venue } from './types';

export const CHARLOTTE_CENTER = { latitude: 35.2271, longitude: -80.8431 };

export const FIELDS: { id: FieldId; label: string }[] = [
  { id: 'finance', label: 'Finance & banking' },
  { id: 'tech', label: 'Technology' },
  { id: 'health', label: 'Healthcare' },
  { id: 'energy', label: 'Energy & engineering' },
  { id: 'design', label: 'Design & marketing' },
  { id: 'public', label: 'Public service & nonprofits' },
  { id: 'education', label: 'Education' },
];

export const INTERESTS = [
  'Fintech', 'Data & analytics', 'AI', 'Cybersecurity', 'Product', 'UX research', 'Startups', 'Sustainability',
  'Public health', 'Community work', 'Sales', 'Investing', 'Teaching', 'Writing', 'Hackathons', 'Open source',
];

export const SKILLS = [
  'Excel', 'SQL', 'Python', 'JavaScript', 'Figma', 'Project management', 'Public speaking', 'Customer service',
  'Spanish', 'Research', 'Writing', 'Financial modeling', 'Clinical care', 'CAD', 'Marketing', 'Teaching',
];

export const GOALS: { id: GoalId; label: string; hint: string; verb: string }[] = [
  { id: 'mentorship', label: 'Mentorship', hint: 'Someone further along to learn from', verb: 'looking for a mentor' },
  { id: 'advice', label: 'Career advice', hint: 'A quick, honest take on your next step', verb: 'looking for career advice' },
  { id: 'peers', label: 'Peers', hint: 'People at your stage to swap notes with', verb: 'hoping to meet peers' },
  { id: 'collab', label: 'Collaborators', hint: 'Build a project or join a team', verb: 'looking for collaborators' },
  { id: 'recruiting', label: 'Recruiting insights', hint: 'How hiring actually works here', verb: 'trying to understand how hiring works' },
  { id: 'other', label: 'Something else', hint: 'Tell us in a few words', verb: 'hoping to connect' },
];

export const STATUSES: { id: StatusId; label: string }[] = [
  { id: 'student', label: 'Student' },
  { id: 'early', label: 'Early career' },
  { id: 'experienced', label: 'Experienced' },
  { id: 'changing', label: 'Changing careers' },
  { id: 'between', label: 'Between jobs' },
];

export const AUDIENCES: { id: AudienceId; label: string }[] = [
  { id: 'anyone', label: 'Anyone on Connected' },
  { id: 'students', label: 'Students' },
  { id: 'early', label: 'Early career' },
  { id: 'changing', label: 'Career changers' },
  { id: 'same-field', label: 'People in my field' },
];

export const AVAILABILITY: { id: AvailabilityId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'evenings', label: 'Evenings' },
  { id: 'weekends', label: 'Weekends' },
];

export const TRAVEL_MI = [1, 3, 5, 10, 25];

export const EVENT_CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: 'networking', label: 'Networking' },
  { id: 'career', label: 'Career' },
  { id: 'hackathon', label: 'Hackathons' },
];

export const AREAS: Area[] = [
  { id: 'uptown', name: 'Uptown', center: { latitude: 35.2271, longitude: -80.8431 } },
  { id: 'southend', name: 'South End', center: { latitude: 35.212, longitude: -80.859 } },
  { id: 'noda', name: 'NoDa', center: { latitude: 35.2465, longitude: -80.804 } },
  { id: 'plazamidwood', name: 'Plaza Midwood', center: { latitude: 35.223, longitude: -80.803 } },
  { id: 'dilworth', name: 'Dilworth', center: { latitude: 35.205, longitude: -80.848 } },
  { id: 'university', name: 'University City', center: { latitude: 35.307, longitude: -80.733 } },
  { id: 'southpark', name: 'SouthPark', center: { latitude: 35.153, longitude: -80.827 } },
  { id: 'ballantyne', name: 'Ballantyne', center: { latitude: 35.053, longitude: -80.849 } },
];

/** Public, staffed places suitable for a first conversation. */
export const VENUES: Venue[] = [
  { id: 'main-library', name: 'Main Library', area: 'Uptown', detail: 'Ground-floor seating near the entrance', coord: { latitude: 35.2273, longitude: -80.8395 } },
  { id: 'railtrail-cafe', name: 'Rail Trail café patio', area: 'South End', detail: 'Public patio by the light-rail stop', coord: { latitude: 35.2125, longitude: -80.8575 } },
  { id: 'noda-coffee', name: 'Coffee shop on N. Davidson St', area: 'NoDa', detail: 'Front tables, open seating', coord: { latitude: 35.2468, longitude: -80.8035 } },
  { id: 'campus-library', name: 'University campus library', area: 'University City', detail: 'Public first floor', coord: { latitude: 35.3058, longitude: -80.7322 } },
  { id: 'food-hall', name: 'Camp North End food hall', area: 'Camp North End', detail: 'Shared tables by the main doors', coord: { latitude: 35.2445, longitude: -80.8352 } },
  { id: 'southpark-library', name: 'SouthPark regional library', area: 'SouthPark', detail: 'Lobby study tables', coord: { latitude: 35.152, longitude: -80.829 } },
];

export const fieldLabel = (id: FieldId | null | undefined) => FIELDS.find((f) => f.id === id)?.label ?? 'Not set';
export const goalLabel = (id: GoalId) => GOALS.find((g) => g.id === id)?.label ?? id;
export const statusLabel = (id: StatusId | null | undefined) => STATUSES.find((s) => s.id === id)?.label ?? 'Not set';
export const audienceLabel = (id: AudienceId) => AUDIENCES.find((a) => a.id === id)?.label ?? id;
export const availabilityLabel = (id: AvailabilityId) => AVAILABILITY.find((a) => a.id === id)?.label ?? id;
export const venueById = (id: string) => VENUES.find((v) => v.id === id) ?? VENUES[0];
