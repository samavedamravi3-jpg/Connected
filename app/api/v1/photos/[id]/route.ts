import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { photos } from '@/db/schema';

/**
 * GET /api/v1/photos/:id -> the image bytes. The id is a random UUID that is only handed out through
 * signed-in API responses and changes on every upload, so the URL works as an unguessable capability
 * (React Native's <Image> can't easily send auth headers). Deleted photos 404 immediately.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [p] = await getDb().select().from(photos).where(eq(photos.id, id));
  if (!p) return new Response('Not found', { status: 404 });
  const bytes = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': p.mime,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
