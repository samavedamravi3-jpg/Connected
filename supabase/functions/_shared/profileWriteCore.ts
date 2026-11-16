// Pure rules for the profile-write edge function: which columns the app may send, their types, and which text needs
// the AI review. No Deno or Node APIs, so node:test covers it (src/lib/__tests__/profileWrite.test.ts).
import { PROFILE_LISTS, PROFILE_TEXT, profileRuleErrors, type FieldError } from './moderationRules.ts';
import { AI_FIELDS, type AiField } from './moderationAi.ts';

const BOOLS = ['discoverable', 'show_experience'];
const COORDS = { area_lat: 90, area_lng: 180 } as const;
/** Everything else (id, badges, hidden, timestamps, unknown keys) is dropped: the user id comes from the token. */
export const WRITABLE = [...Object.keys(PROFILE_TEXT), ...PROFILE_LISTS, ...BOOLS, ...Object.keys(COORDS)];

/** Allowlisted, type-checked columns plus the rule and length problems per column. */
export function pickRow(input: unknown): { row: Record<string, unknown>; errors: Record<string, FieldError> } {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const row: Record<string, unknown> = {};
  for (const k of WRITABLE) if (k in src) row[k] = src[k];
  const errors = profileRuleErrors(row);
  for (const k of BOOLS) if (k in row && typeof row[k] !== 'boolean') errors[k] = 'invalid';
  for (const [k, max] of Object.entries(COORDS)) {
    const v = row[k];
    if (k in row && v !== null && !(typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max)) errors[k] = 'invalid';
  }
  return { row, errors };
}

type Published = Partial<Record<AiField, unknown>> | null;

/** AI-reviewed columns whose new value is non-empty and differs from what is public now. Unchanged text isn't re-checked. */
export function aiFieldsToCheck(row: Record<string, unknown>, current: Published): AiField[] {
  return (Object.keys(AI_FIELDS) as AiField[]).filter((f) => typeof row[f] === 'string' && (row[f] as string).trim() !== '' && row[f] !== (current?.[f] ?? ''));
}

/** The row to publish while `held` columns wait for review: they keep their current public value (or empty). */
export function withHeld(row: Record<string, unknown>, current: Published, held: AiField[]): Record<string, unknown> {
  const out = { ...row };
  for (const f of held) out[f] = current?.[f] ?? '';
  return out;
}

export const pick = (row: Record<string, unknown>, cols: AiField[]) => Object.fromEntries(cols.map((c) => [c, String(row[c] ?? '')])) as Partial<Record<AiField, string>>;
