import { Alert } from 'react-native';
import { BLOCKED_MESSAGE, BLOCKED_TITLE, UNAVAILABLE_MESSAGE, checkAll, moderate } from './moderation';

/** Sync check with a friendly alert. Returns true when the text is fine. */
export function allowedNow(...texts: (string | null | undefined)[]): boolean {
  if (checkAll(...texts).ok) return true;
  Alert.alert(BLOCKED_TITLE, BLOCKED_MESSAGE);
  return false;
}

/** Local check plus the optional AI check. Returns true when everything is fine. */
export async function allowed(...texts: (string | null | undefined)[]): Promise<boolean> {
  if (!allowedNow(...texts)) return false;
  for (const t of texts) {
    const r = t ? await moderate(t) : null;
    if (r && !r.ok) {
      if (r.reason === 'ai_unavailable') Alert.alert('Try again in a moment', UNAVAILABLE_MESSAGE);
      else Alert.alert(BLOCKED_TITLE, BLOCKED_MESSAGE);
      return false;
    }
  }
  return true;
}
