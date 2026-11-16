/** Pure helpers for set-like string lists (chips, preferences) so each label appears once. */
import type { Prefs } from '@/data/types';
import { labelKey } from '../../supabase/functions/_shared/profileOptions';

/** Comparison key: NFKC, trimmed, single spaces, case-insensitive (shared with the profile-write function). */
export { labelKey };

/** Trims, collapses inner whitespace, drops empties and case-insensitive repeats. Keeps the first spelling and the order. */
export function uniqueLabels<T extends string>(xs: readonly T[] | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of xs ?? []) {
    if (typeof x !== 'string') continue;
    const label = x.trim().replace(/\s+/g, ' ') as T;
    const k = labelKey(label);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  return out;
}

const SET_FIELDS = ['challenges', 'wantTraits', 'languages', 'foods', 'diet', 'interests', 'skills', 'goals', 'availability'] as const;

/**
 * Dedupes the set-like lists present in `p` and the skills inside each experience entry.
 * Entries themselves are kept (distinct ids may share a title). Other fields pass through untouched.
 */
export function cleanPrefLists<P extends Partial<Prefs>>(p: P): P {
  const out: Partial<Prefs> = { ...p };
  for (const k of SET_FIELDS) if (k in p) (out as Record<string, unknown>)[k] = uniqueLabels(p[k] as string[] | undefined);
  if ('languages' in p && !out.languages!.length) out.languages = ['English'];
  if (Array.isArray(p.experience)) out.experience = p.experience.map((e) => ({ ...e, skills: uniqueLabels(e.skills) }));
  return out as P;
}
