import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { memberProfiles, photos } from '@/db/schema';
import { LIMITS, checkPhoto } from '@/lib/mobile/model';
import { HttpError, apiError, body, json, photoUrl, rateLimit, requireAccount, requireMember } from '@/lib/mobile/server';

/** PUT /api/v1/me/photo {base64} -> replaces the profile photo (JPEG/PNG/WebP, max 300 KB). New URL each time. */
export async function PUT(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    await requireMember(db, accountId);
    await rateLimit(db, `photo:${accountId}`, LIMITS.photoPerHour);
    const { base64 } = await body(req, z.object({ base64: z.string().min(32).max(420_000) }));
    const checked = checkPhoto(base64);
    if ('error' in checked) throw new HttpError(400, checked.error);
    const id = crypto.randomUUID();
    await db.delete(photos).where(eq(photos.accountId, accountId));
    await db.insert(photos).values({ id, accountId, mime: checked.mime, data: base64.replace(/^data:image\/[a-z]+;base64,/, ''), createdAt: Date.now() });
    await db.update(memberProfiles).set({ photoId: id }).where(eq(memberProfiles.accountId, accountId));
    return json({ photo: photoUrl(id) });
  } catch (e) {
    return apiError(e);
  }
}

/** DELETE /api/v1/me/photo -> removes the photo. */
export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    await db.delete(photos).where(eq(photos.accountId, accountId));
    await db.update(memberProfiles).set({ photoId: null }).where(eq(memberProfiles.accountId, accountId));
    return json({ photo: null });
  } catch (e) {
    return apiError(e);
  }
}
