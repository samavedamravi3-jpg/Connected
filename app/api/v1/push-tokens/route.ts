import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { pushTokens } from '@/db/schema';
import { pushTokenSchema } from '@/lib/mobile/model';
import { apiError, body, json, requireAccount } from '@/lib/mobile/server';

/** POST /api/v1/push-tokens {token, platform} -> register this device for alerts (moves the token to this account). */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { token, platform } = await body(req, pushTokenSchema);
    const row = { token, accountId, platform, updatedAt: Date.now() };
    await db.insert(pushTokens).values(row).onConflictDoUpdate({ target: pushTokens.token, set: row });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** DELETE /api/v1/push-tokens {token} -> stop alerts on this device (e.g. on sign-out). */
export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { token } = await body(req, z.object({ token: z.string().max(200) }));
    await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.accountId, accountId)));
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
