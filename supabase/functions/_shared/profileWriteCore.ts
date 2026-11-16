// Pure rules and the request flow for the profile-write edge function: which columns the app may send, their types and
// option ids, which text needs the AI review, and the order of checks. No Deno or Node APIs (the database, the review
// and the log are injected), so node:test covers it (src/lib/__tests__/profileWrite.test.ts).
import { PROFILE_LISTS, PROFILE_TEXT, profileRuleErrors, type FieldError } from './moderationRules.ts';
import { AI_FIELDS, type AiField, type Verdict } from './moderationAi.ts';
import { AREA_NAMES, CHIP_CATALOG, ENUM_COLUMNS, ENUM_LISTS, labelKey } from './profileOptions.ts';

const BOOLS = ['discoverable', 'show_experience'];
const COORDS = { area_lat: 90, area_lng: 180 } as const;
/** Everything else (id, badges, hidden, timestamps, unknown keys) is dropped: the user id comes from the token. */
export const WRITABLE = [...Object.keys(PROFILE_TEXT), ...PROFILE_LISTS, ...BOOLS, ...Object.keys(COORDS)];

/** Allowlisted, type-checked columns plus the rule, length and option-id problems per column. */
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
  // Option columns take only the app's ids (the database check constraints say the same).
  for (const [k, { ids, nullable }] of Object.entries(ENUM_COLUMNS)) {
    if (k in row && !(row[k] === null ? nullable : ids.includes(row[k] as string))) errors[k] = 'invalid';
  }
  for (const [k, ids] of Object.entries(ENUM_LISTS)) {
    const v = row[k];
    if (k in row && !(Array.isArray(v) && v.every((x) => ids.includes(x)))) errors[k] = 'invalid';
  }
  return { row, errors };
}

type Published = Partial<Record<AiField, unknown>> | null;
const isChips = (f: string): f is keyof typeof CHIP_CATALOG => f in CHIP_CATALOG;

/** Custom chips in `next` that are neither in the app's catalog nor public already. */
export function newCustomChips(next: unknown, catalog: readonly string[], published: unknown): string[] {
  if (!Array.isArray(next)) return [];
  const known = new Set([...catalog, ...(Array.isArray(published) ? published : [])].filter((x) => typeof x === 'string').map(labelKey));
  return next.filter((x): x is string => typeof x === 'string' && !known.has(labelKey(x)));
}

/** What the AI review sees for one column, or '' when nothing in it needs a review (unchanged, empty or catalog). */
export function reviewText(row: Record<string, unknown>, current: Published, f: AiField): string {
  if (isChips(f)) return newCustomChips(row[f], CHIP_CATALOG[f], current?.[f]).join(', ');
  const v = row[f];
  if (typeof v !== 'string' || v.trim() === '' || v === (current?.[f] ?? '')) return '';
  return f === 'area_name' && AREA_NAMES.includes(v) ? '' : v;
}

/** AI-reviewed columns with something new to review. Unchanged text isn't re-checked. */
export function aiFieldsToCheck(row: Record<string, unknown>, current: Published): AiField[] {
  return (Object.keys(AI_FIELDS) as AiField[]).filter((f) => reviewText(row, current, f) !== '');
}

/** The row to publish while `held` columns wait for review: text keeps its public value; lists drop only the new custom chips. */
export function withHeld(row: Record<string, unknown>, current: Published, held: AiField[]): Record<string, unknown> {
  const out = { ...row };
  for (const f of held) {
    if (isChips(f)) out[f] = (row[f] as string[]).filter((x) => !newCustomChips([x], CHIP_CATALOG[f], current?.[f]).length);
    else out[f] = current?.[f] ?? (f === 'area_name' ? null : '');
  }
  return out;
}

export const reviewFields = (row: Record<string, unknown>, current: Published, cols: AiField[]) =>
  Object.fromEntries(cols.map((c) => [c, reviewText(row, current, c)])) as Partial<Record<AiField, string>>;
const pickRaw = (row: Record<string, unknown>, cols: string[]) => Object.fromEntries(cols.map((c) => [c, row[c]]));

// ---------------------------------------------------------------------------------------------------------------
// The request flow (index.ts wires the real database, review and log into it)
// ---------------------------------------------------------------------------------------------------------------

export type LogRow = { field: string; decision: 'published' | 'rejected' | 'held'; reason: string };
/**
 * Why text was held as a draft, sent to the app in the 202 body so it can say whether retrying soon helps.
 * not_configured: no GROQ_API_KEY secret; provider_error: the review ran but failed (network, timeout, redirect,
 * non-200 incl. 429/5xx, malformed answer); rate_limited: over the hourly AI review limit.
 */
export type DraftReason = 'not_configured' | 'provider_error' | 'rate_limited';
/** Decision-log reasons (moderation_events.reason); the first two are the values logged before DraftReason existed. */
const LOG_REASON: Record<DraftReason, string> = { rate_limited: 'ai_limit', provider_error: 'ai_unavailable', not_configured: 'ai_not_configured' };
export type WriteDeps = {
  /** profile_write_rate: atomic per-user counter in the database. true = allowed, false = over the limit, null = error. */
  rate(kind: 'write' | 'ai'): Promise<boolean | null>;
  readCurrent(cols: string): Promise<{ data: Published; error: unknown }>;
  /** 'not_configured' = no usable review endpoint; null = the review ran but failed or answered badly. */
  review(fields: Partial<Record<AiField, string>>): Promise<Verdict[] | null | 'not_configured'>;
  upsert(row: Record<string, unknown>): Promise<{ error: { message?: string; code?: string } | null }>;
  saveDraft(fields: Record<string, unknown>): Promise<{ error: unknown }>;
  clearDraft(): Promise<void>;
  log(rows: LogRow[]): Promise<void>;
};
export type WriteResult = { status: number; body: object };

/**
 * One save. Order: the per-user write limit FIRST (every request counts, including refused ones), then the body,
 * allowlist and rules, then (only when something needs review) the lower AI limit and the review, then the write.
 * Over the AI limit the new text is held as a private draft (202), exactly like an unavailable review.
 */
export async function handleProfileWrite(deps: WriteDeps, readBody: () => Promise<unknown>): Promise<WriteResult> {
  const allowed = await deps.rate('write');
  if (allowed === null) return { status: 503, body: { error: 'Couldn’t save right now.' } };
  if (!allowed) return { status: 429, body: { error: 'rate_limited' } };

  let body: { row?: unknown } | null;
  try {
    body = (await readBody()) as { row?: unknown } | null;
  } catch {
    return { status: 400, body: { error: 'Body must be JSON.' } };
  }
  const { row, errors } = pickRow(body?.row);
  if (Object.keys(errors).length) {
    await deps.log(Object.entries(errors).map(([field, reason]) => ({ field, decision: 'rejected', reason })));
    return { status: 422, body: { status: 'rejected', fields: errors } };
  }

  const { data: current, error: readErr } = await deps.readCurrent(Object.keys(AI_FIELDS).join(', '));
  if (readErr) return { status: 503, body: { error: 'Couldn’t save right now.' } };
  const check = aiFieldsToCheck(row, current);
  let held: AiField[] = [];
  let heldReason: DraftReason = 'provider_error';
  if (check.length) {
    const aiAllowed = await deps.rate('ai');
    if (aiAllowed === null) return { status: 503, body: { error: 'Couldn’t save right now.' } };
    // Over the AI cap: no review is spent, and the new text waits as a private draft. The rest still saves, so a
    // privacy change (e.g. pausing discovery) is never blocked by someone's place-name or chip edits.
    const answer = aiAllowed ? await deps.review(reviewFields(row, current, check)) : null;
    if (!aiAllowed) heldReason = 'rate_limited';
    else if (answer === 'not_configured') heldReason = 'not_configured';
    const verdicts = Array.isArray(answer) ? answer : null;
    const blocked = verdicts?.filter((v) => v.decision === 'block') ?? [];
    if (blocked.length) {
      await deps.log(blocked.map((v) => ({ field: v.field, decision: 'rejected', reason: `ai:${v.category}` })));
      return { status: 422, body: { status: 'rejected', fields: Object.fromEntries(blocked.map((v) => [v.field, 'ai'])) } };
    }
    if (!verdicts) held = check;
  }

  const { error: writeErr } = await deps.upsert(withHeld(row, current, held));
  if (writeErr) {
    // The DB trigger or a constraint refused it (rules out of sync, or a limit): nothing is published.
    if (writeErr.message?.includes('content_blocked') || /^2[23]/.test(writeErr.code ?? '')) return { status: 422, body: { status: 'rejected', fields: {} } };
    return { status: 503, body: { error: 'Couldn’t save right now.' } };
  }
  if (held.length) {
    const { error } = await deps.saveDraft(pickRaw(row, held));
    if (error) return { status: 503, body: { error: 'Couldn’t save right now.' } };
    await deps.log(held.map((field) => ({ field, decision: 'held', reason: LOG_REASON[heldReason] })));
    return { status: 202, body: { status: 'draft', held, reason: heldReason } };
  }
  await deps.clearDraft();
  await deps.log(check.map((field) => ({ field, decision: 'published', reason: 'ai:none' })));
  return { status: 200, body: { status: 'published' } };
}
