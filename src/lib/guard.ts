import { Alert } from 'react-native';
import { BLOCKED_TITLE, checkAll, fieldMessage, moderate } from './moderation';

/** Sync rules check with an alert that names the field (`label`, e.g. "That skill"). Returns true when the text is fine. */
export function allowedNow(label: string, ...texts: (string | null | undefined)[]): boolean {
  const r = checkAll(...texts);
  if (r.ok) return true;
  Alert.alert(BLOCKED_TITLE, fieldMessage(r.reason, label));
  return false;
}

/** Rules plus the best-effort AI check (see moderate). Returns true when everything is fine. */
export async function allowed(label: string, ...texts: (string | null | undefined)[]): Promise<boolean> {
  if (!allowedNow(label, ...texts)) return false;
  for (const t of texts) {
    const r = t ? await moderate(t) : null;
    if (r && !r.ok) {
      if (r.reason === 'ai_unavailable') Alert.alert('Try again in a moment', fieldMessage('ai_unavailable'));
      else Alert.alert(BLOCKED_TITLE, fieldMessage(r.reason, label));
      return false;
    }
  }
  return true;
}
