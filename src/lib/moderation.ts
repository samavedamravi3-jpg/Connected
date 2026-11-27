/**
 * Content guardrails in the app. The rules themselves live in supabase/functions/_shared/moderationRules.ts, shared
 * with the `profile-write` edge function and (generated) the database triggers, so a modified app cannot bypass them.
 * This file adds what only the app needs: friendly per-field messages and the optional AI pre-check for chat text.
 *
 * Layers, honestly:
 *   - Every surface: these rules here (instant feedback) and the same rules in the database (authoritative).
 *   - Profile text (org, "A little about you", "can offer"): also a contextual AI check on the server before it is
 *     public. If that check can't run, the text is kept as a private draft, never published.
 *   - Chat, connection notes, experience: rules are authoritative; the AI check below is a best-effort extra in the app.
 * Nothing here is evasion-proof.
 */
import { assistantUrl } from './assistantUrl';
import { checkText, PROFILE_TEXT, profileRuleErrors, type FieldError, type FieldKind, type Reason, type RuleResult } from '../../supabase/functions/_shared/moderationRules';
import type { Experience } from '@/data/types';

export { checkText, normalize, normalizeRaw, profileRuleErrors, PROFILE_TEXT, type FieldError, type FieldKind } from '../../supabase/functions/_shared/moderationRules';

export type ModerationResult = RuleResult | { ok: false; reason: 'ai' | 'ai_unavailable' };

/** Generic fallback text (kept for older call sites and errors from the database trigger). */
export const BLOCKED_TITLE = 'Let’s keep it respectful';
export const BLOCKED_MESSAGE = 'That message includes language, links, contact details or offers that aren’t allowed in Connected. Please reword it and try again.';
export const UNAVAILABLE_MESSAGE = 'We couldn’t check that text right now. Please try again in a moment.';

/** How each profile column is named in messages. */
export const FIELD_LABELS: Record<string, string> = {
  first_name: 'Your first name', last_name: 'Your last name', org: 'School or workplace', intro: '“A little about you”', offer: '“What you could help with”',
  area_name: 'Your area', interests: 'Your interests', skills: 'Your skills', languages: 'Your languages', goals: 'What you’re looking for',
};

/** A message that says what is wrong in this field, without repeating the text back. */
export function fieldMessage(reason: FieldError | 'ai_unavailable', label = 'That text', kind: FieldKind = 'text'): string {
  if (kind === 'name' && reason === 'contact') return `${label} can only be a name: no links, emails, phone numbers or handles.`;
  switch (reason) {
    case 'contact': return `${label} can’t include links, emails, phone numbers or social handles. People reach you through Connected.`;
    case 'scams': return `${label} can’t include payment requests, investment or crypto pitches, requests for codes or passwords, or asking people to move off Connected.`;
    case 'sexual': return `${label} can’t include sexual content or dating requests.`;
    case 'drugs': return `${label} can’t offer drugs or weapons.`;
    case 'doxxing': return `${label} can’t include someone’s address or ID, card or account numbers.`;
    case 'too_long': return `${label} is too long. Shorten it a little.`;
    case 'invalid': return `${label} couldn’t be saved. Edit it and try again.`;
    case 'ai': return `${label} doesn’t fit Connected’s community guidelines. Please reword it.`;
    case 'ai_unavailable': return UNAVAILABLE_MESSAGE;
    default: return `${label} includes language that isn’t allowed on Connected. Please reword it.`;
  }
}

/** Profile save refused by our rules or by the server's review. `fields` maps column -> reason. */
export class ContentRejectedError extends Error {
  fields: Record<string, FieldError>;
  constructor(fields: Record<string, FieldError>) {
    super(Object.values(messagesFor(fields))[0] ?? 'Some of your profile details weren’t accepted. Edit your profile, then try again.');
    this.fields = fields;
  }
}

/** Per-column messages for a profile row, from the shared rules (instant feedback before saving). */
export function profileFieldMessages(row: Record<string, unknown>): Record<string, string> {
  return messagesFor(profileRuleErrors(row));
}
export function messagesFor(errors: Record<string, FieldError>): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).map(([col, r]) => [col, fieldMessage(r, FIELD_LABELS[col] ?? 'That text', PROFILE_TEXT[col]?.kind ?? 'text')]));
}

/** First problem in an experience entry: title and organisation are name-like, description and skills free text. */
export function experienceProblem(e: Pick<Experience, 'title' | 'org' | 'description' | 'skills'>): string | null {
  const checks: [string, string, FieldKind][] = [['The title', e.title, 'name'], ['The organization', e.org, 'name'], ['The description', e.description, 'text'], ...e.skills.map((s): [string, string, FieldKind] => ['A skill', s, 'text'])];
  for (const [label, t, kind] of checks) {
    const r = checkText(t, kind);
    if (!r.ok) return fieldMessage(r.reason, label, kind);
  }
  return null;
}

/** First blocked value among several free-text values, or ok. */
export function checkAll(...texts: (string | null | undefined)[]): RuleResult {
  for (const t of texts) {
    const r = checkText(t);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Backstop for data layers: throws a friendly error if any text is blocked. */
export function assertClean(...texts: (string | null | undefined)[]): void {
  const r = checkAll(...texts);
  if (!r.ok) throw new Error(fieldMessage(r.reason, 'That message'));
}

/** Turns a Supabase error from a moderation trigger into the friendly message. */
export function dbError(error: { message?: string }): Error {
  return error.message?.includes('content_blocked') ? new Error(BLOCKED_MESSAGE) : (error as unknown as Error);
}

export type { Reason };

/**
 * Best-effort AI check through the server proxy, for chat, connection notes and experience text. Not authoritative:
 * the database rules are. Profile text is checked on the server instead (profile-write), where a missing provider keeps
 * the text as an unpublished draft. Here, with no proxy configured the check is skipped (`skipped: true`), and an error
 * or timeout refuses the text (the user can retry).
 */
export async function aiModerate(text: string): Promise<ModerationResult & { skipped?: boolean }> {
  const base = assistantUrl();
  if (!base) return { ok: true, skipped: true };
  if (!text.trim()) return { ok: true };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const res = await fetch(base.replace(/\/assistant\/?$/, '') + '/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': process.env.EXPO_PUBLIC_ASSISTANT_TOKEN ?? '' },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: 'ai_unavailable' };
    const data = (await res.json()) as { ok?: unknown };
    if (data.ok === true) return { ok: true };
    return data.ok === false ? { ok: false, reason: 'ai' } : { ok: false, reason: 'ai_unavailable' };
  } catch {
    return { ok: false, reason: 'ai_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

/** Text with money, contact or urgency hints is "borderline": only that goes to the best-effort AI check. */
export const BORDERLINE =
  /\b(money|pay|paid|payment|invest\w*|crypto|bitcoin|usdt|wallet|profit|earn\w*|income|loan|cash|deal|offer|opportunit\w*|hiring|recruit\w*|telegram|whatsapp|snap\w*|text me|call me|contact me|link|click|account|password|code|verify|urgent|free|win|won|prize|reward|dot|regret|date|single)\b/i;

/** Local rules, then the best-effort AI check for borderline text. Use before sending chat or connection text. */
export async function moderate(text: string): Promise<ModerationResult> {
  const local = checkText(text);
  if (!local.ok) return local;
  return BORDERLINE.test(text) ? aiModerate(text) : { ok: true };
}
