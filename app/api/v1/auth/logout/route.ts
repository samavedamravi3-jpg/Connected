import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';
import { apiError, json, requireAccount } from '@/lib/mobile/server';

/** POST /api/v1/auth/logout -> revokes this device's session. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { tokenHash } = await requireAccount(req, db);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
