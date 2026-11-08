import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { accounts, loginCodes, sessions } from '@/db/schema';
import { hashCode, hashToken, randomToken, safeEqual } from '@/lib/mobile/crypto';
import { CODE_MAX_ATTEMPTS, LIMITS, SESSION_TTL_MS, emailSchema } from '@/lib/mobile/model';
import { HttpError, apiError, authSecret, body, clientIp, getMember, json, rateLimit } from '@/lib/mobile/server';

/** POST /api/v1/auth/verify {email, code} -> {token, accountId, isNew, onboarded}. Codes are single-use, 5 tries max. */
export async function POST(req: Request) {
  try {
    const input = await body(req, z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }));
    const db = getDb();
    const now = Date.now();
    const secret = authSecret(req);
    await rateLimit(db, `verify-ip:${clientIp(req)}`, LIMITS.codeVerifyPerIp, now);

    const [row] = await db.select().from(loginCodes).where(eq(loginCodes.email, input.email));
    if (!row || row.expiresAt <= now) throw new HttpError(400, 'That code has expired. Ask for a new one.');
    if (row.attempts >= CODE_MAX_ATTEMPTS) {
      await db.delete(loginCodes).where(eq(loginCodes.email, input.email));
      throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');
    }
    if (!safeEqual(row.codeHash, await hashCode(secret, input.email, input.code))) {
      await db.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.email, input.email));
      const left = CODE_MAX_ATTEMPTS - row.attempts - 1;
      throw new HttpError(400, left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.');
    }
    await db.delete(loginCodes).where(eq(loginCodes.email, input.email));

    let [account] = await db.select().from(accounts).where(eq(accounts.email, input.email));
    const isNew = !account;
    if (!account) {
      account = { id: `u_${crypto.randomUUID()}`, email: input.email, createdAt: now };
      await db.insert(accounts).values(account).onConflictDoNothing();
      [account] = await db.select().from(accounts).where(eq(accounts.email, input.email));
    }
    const token = randomToken();
    await db.insert(sessions).values({ tokenHash: await hashToken(token), accountId: account.id, createdAt: now, expiresAt: now + SESSION_TTL_MS, lastSeenAt: now });
    const member = await getMember(db, account.id);
    return json({ token, accountId: account.id, email: account.email, isNew, onboarded: !!member?.onboarded, expiresAt: now + SESSION_TTL_MS });
  } catch (e) {
    return apiError(e);
  }
}
