/**
 * Content guardrails. `checkText` blocks slurs, sexual content, harassment and threats before
 * anything is sent or saved. It is a first line of defense: the same rules run inside Supabase
 * (supabase/schema.sql) so a modified client cannot bypass them, and an optional AI check
 * (`aiModerate`) catches what a word list can't.
 *
 * It also catches tricks: leetspeak ("k1ll"), spaced-out letters ("k i l l"), punctuation between
 * letters ("f.u.c.k"), stretched letters ("fuuuck"), accents and zero-width characters.
 */
import { WORDS } from './moderationWords';

export type ModerationResult = { ok: true } | { ok: false; reason: 'slurs' | 'sexual' | 'harassment' | 'threats' | 'ai' };

/** Friendly message to show when text is blocked. */
export const BLOCKED_TITLE = 'Let’s keep it respectful';
export const BLOCKED_MESSAGE = 'That message includes language that isn’t allowed in Connected. Please reword it and try again.';

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

/** Lowercase letters and single spaces only. Mirrors moderation_normalize() in schema.sql. */
export function normalize(input: string): string {
  let t = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[​-‏⁠﻿­]/g, '')
    .toLowerCase();
  t = t.replace(/[0134578@$!|+9]/g, (c) => LEET[c] ?? c);
  t = t.replace(/[^a-z]+/g, ' ').trim();
  // Join runs of 3+ single letters: "k i l l" -> "kill".
  const tokens = t.split(' ');
  const out: string[] = [];
  let run = '';
  const flush = () => {
    if (run.length >= 3) out.push(run);
    else if (run) out.push(...run.split(''));
    run = '';
  };
  for (const tok of tokens) {
    if (tok.length === 1) run += tok;
    else {
      flush();
      out.push(tok);
    }
  }
  flush();
  // Collapse stretched letters: "fuuuck" -> "fuck".
  return out.join(' ').replace(/(.)\1{2,}/g, '$1');
}

const compiled = (Object.keys(WORDS) as (keyof typeof WORDS)[]).map((reason) => ({
  reason,
  re: new RegExp(`\\b(?:${WORDS[reason].join('|')})\\b`),
}));

export function checkText(text: string | null | undefined): ModerationResult {
  if (!text || !text.trim()) return { ok: true };
  const n = normalize(text);
  for (const { reason, re } of compiled) if (re.test(n)) return { ok: false, reason };
  return { ok: true };
}

/** First blocked value among several fields, or ok. */
export function checkAll(...texts: (string | null | undefined)[]): ModerationResult {
  for (const t of texts) {
    const r = checkText(t);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Backstop for data layers: throws a friendly error if any text is blocked. */
export function assertClean(...texts: (string | null | undefined)[]): void {
  if (!checkAll(...texts).ok) throw new Error(BLOCKED_MESSAGE);
}

/** Turns a Supabase error from the moderation trigger into the friendly message. */
export function dbError(error: { message?: string }): Error {
  return error.message?.includes('content_blocked') ? new Error(BLOCKED_MESSAGE) : (error as unknown as Error);
}

/**
 * Optional second check by Claude through the server proxy. Runs only when the proxy is configured,
 * and fails open (returns ok) on any error or timeout so a network problem never blocks people.
 */
export async function aiModerate(text: string): Promise<ModerationResult> {
  const base = process.env.EXPO_PUBLIC_ASSISTANT_URL;
  if (!base || !text.trim()) return { ok: true };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const res = await fetch(base.replace(/\/assistant\/?$/, '') + '/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': process.env.EXPO_PUBLIC_ASSISTANT_TOKEN ?? '' },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: true };
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === false ? { ok: false, reason: 'ai' } : { ok: true };
  } catch {
    return { ok: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Local check, then the AI check when configured. Use before sending free text. */
export async function moderate(text: string): Promise<ModerationResult> {
  const local = checkText(text);
  if (!local.ok) return local;
  return aiModerate(text);
}
