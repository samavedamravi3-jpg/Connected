// The profile option ids the app offers (src/data/options.ts), shared with the profile-write edge function so the server
// can allowlist them. No imports and no runtime APIs. src/lib/__tests__/profileOptions.test.ts fails when this drifts
// from the app's catalog or from the database check constraints (supabase/migrations/20261116175809_review_fixes.sql).

export const FIELD_IDS = ['finance', 'tech', 'health', 'energy', 'design', 'public', 'education'] as const;
export const STATUS_IDS = ['student', 'early', 'experienced', 'changing', 'between'] as const;
export const MODE_IDS = ['seeking', 'offering', 'both'] as const;
export const MEET_MODE_IDS = ['inperson', 'video', 'either'] as const;
export const SHARE_MODE_IDS = ['area', 'public'] as const;
export const GOAL_IDS = ['mentorship', 'advice', 'peers', 'collab', 'recruiting', 'other'] as const;
export const CHALLENGE_IDS = ['start', 'network', 'interviews', 'resume', 'credentials', 'switching', 'hiring', 'skills', 'team'] as const;
export const TRAIT_IDS = ['firstgen', 'immigrant', 'switcher', 'senior', 'near', 'hiring'] as const;
export const FOOD_IDS = ['coffee', 'tea', 'bakery', 'mediterranean', 'mexican', 'indian', 'japanese', 'chinese', 'thai', 'italian', 'american', 'caribbean'] as const;
export const DIET_IDS = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free', 'no_alcohol'] as const;
export const AVAILABILITY_IDS = ['today', 'week', 'evenings', 'weekends'] as const;

/** Single-choice columns: the value must be one of these ids (or null where nullable). */
export const ENUM_COLUMNS: Record<string, { ids: readonly string[]; nullable: boolean }> = {
  status: { ids: STATUS_IDS, nullable: true },
  field: { ids: FIELD_IDS, nullable: true },
  from_field: { ids: FIELD_IDS, nullable: true },
  mode: { ids: MODE_IDS, nullable: false },
  meet_mode: { ids: MEET_MODE_IDS, nullable: false },
  share_mode: { ids: SHARE_MODE_IDS, nullable: false },
};

/** Multi-choice columns: every item must be one of these ids. */
export const ENUM_LISTS: Record<string, readonly string[]> = {
  goals: GOAL_IDS, challenges: CHALLENGE_IDS, want_traits: TRAIT_IDS, foods: FOOD_IDS, diet: DIET_IDS, availability: AVAILABILITY_IDS,
};

/** Suggested chips. Anything else in these lists is a custom chip and gets the server's AI review. */
export const INTERESTS = [
  'Fintech', 'Data & analytics', 'AI', 'Cybersecurity', 'Product', 'UX research', 'Startups', 'Sustainability',
  'Public health', 'Community work', 'Sales', 'Investing', 'Teaching', 'Writing', 'Hackathons', 'Open source',
];
export const SKILLS = [
  'Excel', 'SQL', 'Python', 'JavaScript', 'Figma', 'Project management', 'Public speaking', 'Customer service',
  'Spanish', 'Research', 'Writing', 'Financial modeling', 'Clinical care', 'CAD', 'Marketing', 'Teaching',
];
export const LANGUAGES = ['English', 'Spanish', 'Mandarin', 'Hindi', 'Arabic', 'French', 'Vietnamese', 'Portuguese', 'Korean', 'Polish', 'Russian', 'Yoruba', 'Tagalog'];
export const CHIP_CATALOG: Record<'interests' | 'skills' | 'languages', readonly string[]> = { interests: INTERESTS, skills: SKILLS, languages: LANGUAGES };

/** Area names the app itself writes (map areas and the "this area" placeholder): no AI review needed. */
export const AREA_NAMES = ['Uptown', 'South End', 'NoDa', 'Plaza Midwood', 'Dilworth', 'University City', 'SouthPark', 'Ballantyne', 'this area'];

/** Comparison key for labels: NFKC, trimmed, single spaces, case-insensitive (SQL: public.label_key). */
export const labelKey = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
