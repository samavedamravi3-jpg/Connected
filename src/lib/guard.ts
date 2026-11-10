import { Alert } from 'react-native';
import { BLOCKED_MESSAGE, BLOCKED_TITLE, checkAll, moderate } from './moderation';

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
    if (t && !(await moderate(t)).ok) {
      Alert.alert(BLOCKED_TITLE, BLOCKED_MESSAGE);
      return false;
    }
  }
  return true;
}
