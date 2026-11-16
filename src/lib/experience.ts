/** Pure helpers for the Experience section: limits, validation, dates and skill merging. */
import type { Experience } from '@/data/types';
import { uniqueLabels } from './lists';

export const EXP_LIMITS = { title: 120, org: 120, description: 1000, skills: 15, skill: 40, entries: 30 } as const;

export const newExperienceId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

export const emptyExperience = (): Experience => ({ id: newExperienceId(), title: '', org: '', start: '', end: null, description: '', skills: [] });

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (s: string) => MONTH.test(s);

/** Accepts "2021-06", "6/2021", "06/2021", "Jun 2021", "June 2021" or "2021". Returns 'YYYY-MM' or null. */
export function parseMonth(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  if (MONTH.test(t)) return t;
  let m = /^(\d{1,2})[/-](\d{4})$/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = /^([a-z]{3})[a-z]*\.?,? (\d{4})$/.exec(t);
  if (m && names.includes(m[1])) return `${m[2]}-${String(names.indexOf(m[1]) + 1).padStart(2, '0')}`;
  m = /^(\d{4})$/.exec(t);
  if (m) return `${m[1]}-01`;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtMonth = (s: string) => (isMonth(s) ? `${MONTHS[+s.slice(5) - 1]} ${s.slice(0, 4)}` : s);
export const fmtRange = (e: Pick<Experience, 'start' | 'end'>) => `${fmtMonth(e.start)} – ${e.end ? fmtMonth(e.end) : 'Present'}`;

/** Newest first; current roles on top. */
export const sortExperiences = (xs: Experience[]) =>
  [...xs].sort((a, b) => (b.end ?? '9999-12').localeCompare(a.end ?? '9999-12') || b.start.localeCompare(a.start));

/** Returns an error message, or null when the entry can be saved. */
export function validateExperience(e: Experience): string | null {
  if (!e.title.trim()) return 'Add a title.';
  if (!e.org.trim()) return 'Add an organization.';
  if (e.title.length > EXP_LIMITS.title || e.org.length > EXP_LIMITS.org) return 'Title and organization must be 120 characters or fewer.';
  if (!isMonth(e.start)) return 'Add a start date like 06/2021.';
  if (e.end !== null && !isMonth(e.end)) return 'Add an end date like 08/2023, or mark it as present.';
  if (e.end !== null && e.end < e.start) return 'The end date can’t be before the start date.';
  if (e.description.length > EXP_LIMITS.description) return 'Keep the description under 1000 characters.';
  if (e.skills.length > EXP_LIMITS.skills || e.skills.some((s) => s.length > EXP_LIMITS.skill)) return 'Up to 15 skills, 40 characters each.';
  return null;
}

/** Trims, clamps and dedupes anything that came from outside (resume import, backend). */
export function cleanExperience(raw: Partial<Experience> & { id?: string }): Experience {
  const skills = uniqueLabels((raw.skills ?? []).map((s) => String(s).trim().slice(0, EXP_LIMITS.skill)));
  return {
    id: raw.id || newExperienceId(),
    title: String(raw.title ?? '').trim().slice(0, EXP_LIMITS.title),
    org: String(raw.org ?? '').trim().slice(0, EXP_LIMITS.org),
    start: parseMonth(String(raw.start ?? '')) ?? '',
    end: raw.end ? parseMonth(String(raw.end)) : null,
    description: String(raw.description ?? '').trim().slice(0, EXP_LIMITS.description),
    skills: skills.slice(0, EXP_LIMITS.skills),
  };
}

/** Every text field of an entry, for moderation. */
export const experienceTexts = (e: Experience) => [e.title, e.org, e.description, ...e.skills];

/** Declared skills plus the skills named in experience, deduped case-insensitively. */
export const effectiveSkills = (skills: string[], experience: Experience[] = []): string[] => uniqueLabels([...skills, ...experience.flatMap((e) => e.skills)]);

const STOP = new Set(['senior', 'junior', 'lead', 'intern', 'assistant', 'associate', 'the', 'and', 'of', 'at', 'for', 'a', 'an', 'to', 'in']);
/** Meaningful lowercase words in a job title ("Software Engineering Intern" -> software, engineering). */
export const titleWords = (title: string) => title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w));
