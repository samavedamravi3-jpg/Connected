/**
 * Assistant help inside a chat: suggested replies, a meetup plan, good questions, and polishing your draft.
 * Suggestions only: nothing is sent until the person edits and taps Send.
 *
 * - Claude (when EXPO_PUBLIC_ASSISTANT_URL points at the proxy in /server): uses the existing /assistant route.
 *   Only the other person's public profile, your preferences and the last few messages of this chat are sent.
 * - Built-in fallback: templates from both profiles, no network.
 */
import { AREAS, availabilityLabel } from '@/data/options';
import type { Message, Person, Prefs, Profile } from '@/data/types';
import { aiAllowed } from './aiConsent';
import { firstName, fullName, sharedInterests } from './match';

export type AssistKind = 'reply' | 'plan' | 'question' | 'polish';
export const ASSIST_KINDS: { id: AssistKind; label: string }[] = [
  { id: 'reply', label: 'Suggest a reply' },
  { id: 'plan', label: 'Plan a meetup' },
  { id: 'question', label: 'Ask something good' },
  { id: 'polish', label: 'Polish my draft' },
];

export type AssistCtx = { person: Person | null; name: string; prefs: Prefs; profile: Profile; messages: Message[]; draft: string };
export type AssistResult = { suggestions: string[]; source: 'claude' | 'built-in'; note?: string };

const sentence = (s: string) => s.replace(/\s+/g, ' ').trim();

export function builtInAssist(kind: AssistKind, c: AssistCtx): AssistResult {
  const first = firstName(c.name);
  const p = c.person;
  const topic = (p && sharedInterests(p, c.prefs)[0]) ?? p?.helpsWith[0] ?? 'what you’re working on';
  const area = p?.areaName && AREAS.some((a) => a.name === p.areaName) ? p.areaName : 'a café nearby';
  const when = p?.availability[0] ? availabilityLabel(p.availability[0]).toLowerCase() : 'this week';
  const lastTheirs = [...c.messages].reverse().find((m) => m.from === 'them')?.text ?? '';
  const out = (suggestions: string[], note?: string): AssistResult => ({ suggestions: suggestions.map(sentence), source: 'built-in', note });

  switch (kind) {
    case 'reply':
      return out(
        lastTheirs.includes('?')
          ? [`Good question! Honestly, I’m still figuring that out. What worked for you when you were starting?`, `Thanks for asking, ${first}. Short answer: I’m focused on ${topic.toLowerCase()} right now.`, `Happy to share more. Would it be easier to talk it through over coffee?`]
          : [`Thanks, ${first}, that’s really helpful.`, `That makes sense. Could you tell me a bit more about ${topic.toLowerCase()}?`, `Really appreciate it. Would you be up for a quick coffee ${when}?`],
      );
    case 'plan':
      return out([
        `Would ${when} work for a 30-minute coffee? Somewhere public in ${area} is easy for me.`,
        `I’m free ${when}. Want to pick a spot in ${area}? A library or café works great.`,
        `How about we meet at a café in ${area}? Let me know a day and time that suits you.`,
      ]);
    case 'question':
      return out(p?.questions.length ? p.questions.slice(0, 3) : [`What do you wish you’d known when you were starting out?`, `How did you get into ${topic.toLowerCase()}?`, `What’s one thing I should focus on in the next few months?`]);
    case 'polish': {
      const d = sentence(c.draft);
      if (!d) return out([], 'Write a draft in the box first, then tap Polish.');
      const body = d.replace(/^(hi|hey|hello)[^,.!]*[,.!]\s*/i, '');
      const cap = body.charAt(0).toUpperCase() + body.slice(1);
      const ended = /[.!?]$/.test(cap) ? cap : `${cap}.`;
      return out([`Hi ${first}! ${ended}`, `Hope your week’s going well, ${first}. ${ended} Thanks!`, ended.split(/(?<=[.!?])\s/)[0]]);
    }
  }
}

const TASK: Record<AssistKind, string> = {
  reply: 'Suggest 3 short, natural replies I could send next in this chat.',
  plan: 'Suggest 3 short messages proposing a low-pressure meetup at a public place (café, library), with a day/time framed as a question.',
  question: 'Suggest 3 thoughtful, specific questions I could ask this person, based on their profile and our chat.',
  polish: 'Rewrite my draft 3 ways: friendlier, more concise, and more specific. Keep my meaning.',
};

/** Claude via the existing proxy, else the built-in templates. */
export async function chatAssist(kind: AssistKind, c: AssistCtx): Promise<AssistResult> {
  const url = process.env.EXPO_PUBLIC_ASSISTANT_URL;
  // Nothing leaves the phone unless the user allowed AI suggestions in Privacy & data.
  if (!url || !aiAllowed() || (kind === 'polish' && !c.draft.trim())) return builtInAssist(kind, c);
  const p = c.person;
  const context = [
    `ME: ${fullName(c.profile) || 'the user'}; ${c.profile.org || ''}; goals ${c.prefs.goals.join(', ') || 'n/a'}; interests ${c.prefs.interests.join(', ') || 'n/a'}.`,
    p ? `THEM: ${p.name}, ${p.role} at ${p.org}, ${p.areaName}. Helps with: ${p.helpsWith.join('; ')}. Bio: ${p.bio}` : `THEM: ${c.name}`,
    `CHAT (latest last):\n${c.messages.slice(-10).map((m) => `${m.from === 'me' ? 'Me' : firstName(c.name)}: ${m.text}`).join('\n') || '(no messages yet)'}`,
    kind === 'polish' ? `MY DRAFT: ${c.draft}` : '',
  ].join('\n\n');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': process.env.EXPO_PUBLIC_ASSISTANT_TOKEN ?? '' },
      body: JSON.stringify({ messages: [{ role: 'user', content: `${TASK[kind]} Reply with exactly 3 options, one per line, no numbering, no quotes, each under 200 characters.` }], context }),
      signal: ctrl.signal,
    });
    if (!res.ok) return builtInAssist(kind, c);
    const data = (await res.json()) as { text?: string };
    const lines = (data.text ?? '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“]|["”]$/g, '').trim()).filter((l) => l.length > 3).slice(0, 3);
    return lines.length ? { suggestions: lines, source: 'claude' } : builtInAssist(kind, c);
  } catch {
    return builtInAssist(kind, c);
  } finally {
    clearTimeout(timer);
  }
}
