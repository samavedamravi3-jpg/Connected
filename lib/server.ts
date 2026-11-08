import { z } from 'zod';
import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import type { getDb } from '@/db';
import { aiUsage, blocks, profiles } from '@/db/schema';
import { people } from '@/lib/network';
import { AI_DAILY_LIMIT } from '@/lib/ai';
import { canReach, isBlockedPair, isDiscoverable, withProfileDefaults } from '@/lib/visibility';
export { profileSchema } from '@/lib/visibility';
export async function identity() { const u=await getChatGPTUser(); if(!u) throw new Error('UNAUTHORIZED'); return u; }
export function errorResponse(e:unknown) { if(e instanceof z.ZodError) return Response.json({error:e.issues[0]?.message??'Check your input.'},{status:400}); if(e instanceof Error&&e.message==='UNAUTHORIZED')return Response.json({error:'Sign in to save your profile and connect.'},{status:401}); if(e instanceof Error&&e.message==='FORBIDDEN_ORIGIN')return Response.json({error:'This request came from another site and was refused.'},{status:403}); console.error('Connected request failed',e instanceof Error?e.message:'Unknown error'); return Response.json({error:'Could not save that right now. Please try again.'},{status:500}); }
export function sameOrigin(req:Request) { const origin=req.headers.get('origin'); if(origin&&origin!==new URL(req.url).origin) throw new Error('FORBIDDEN_ORIGIN'); }

type Db = ReturnType<typeof getDb>;

/**
 * Lazily erase the stored coarse location of every profile whose discovery window has closed
 * (or only `userId`'s, when given). Runs on read paths; there is no scheduled job.
 * The `visible_until <= now` guard means a concurrent fresh opt-in is never wiped.
 */
export async function clearExpiredLocations(db:Db, now=Date.now(), userId?:string) {
  const hasLocation = or(isNotNull(profiles.lat), isNotNull(profiles.lng), sql`json_extract(${profiles.data},'$.latitude') IS NOT NULL`, sql`json_extract(${profiles.data},'$.longitude') IS NOT NULL`);
  const expired = and(lte(profiles.visibleUntil, now), hasLocation, userId ? eq(profiles.id, userId) : undefined);
  await db.update(profiles).set({ lat:null, lng:null, data:sql`json_set(${profiles.data},'$.latitude',NULL,'$.longitude',NULL,'$.discovery',json('false'))` }).where(expired);
}

/** Block rows in either direction involving `userId`. */
export function blocksFor(db:Db, userId:string) {
  return db.select({userId:blocks.userId,personId:blocks.personId}).from(blocks).where(or(eq(blocks.userId,userId),eq(blocks.personId,userId)));
}

/** Block rows in either direction between `a` and `b`. */
export function blocksBetween(db:Db, a:string, b:string) {
  return db.select({userId:blocks.userId,personId:blocks.personId}).from(blocks).where(or(and(eq(blocks.userId,a),eq(blocks.personId,b)),and(eq(blocks.userId,b),eq(blocks.personId,a))));
}

export type TargetProfile = { name:string; role:string; company:string; industry:string; help:string[]; goal:string } & Record<string, unknown>;
export type TargetResult = { ok:true; sample:boolean; person:TargetProfile } | { ok:false; reason:'self'|'blocked'|'unavailable'|'out-of-range' };

/**
 * Shared availability check for new requests, icebreaker drafts and coaching:
 * not yourself, no block in either direction, demo person or a live profile that is still discoverable
 * and whose chosen visibility radius covers the caller's (client-supplied, coarse) search center.
 */
export async function resolveTarget(db:Db, userId:string, personId:string, center:[number,number]|null, now=Date.now()): Promise<TargetResult> {
  if (personId === userId) return { ok:false, reason:'self' };
  if (isBlockedPair(await blocksBetween(db, userId, personId), userId, personId)) return { ok:false, reason:'blocked' };
  const demo = people.find(p => p.id === personId);
  if (demo) return { ok:true, sample:true, person:demo };
  const [row] = await db.select().from(profiles).where(eq(profiles.id, personId));
  if (!row || !isDiscoverable(row.visibleUntil, now)) return { ok:false, reason:'unavailable' };
  const data = withProfileDefaults(JSON.parse(row.data) as TargetProfile);
  if (!canReach(center, { sample:false, lat:row.lat, lng:row.lng, visibilityKm:data.visibilityKm })) return { ok:false, reason:'out-of-range' };
  return { ok:true, sample:false, person:data };
}

/** Consume one call from the per-user daily AI quota shared by icebreaker and coach. False when exhausted. */
export async function consumeAiQuota(db:Db, userId:string, now=new Date()) {
  const usageId = `${userId}:${now.toISOString().slice(0,10)}`;
  await db.insert(aiUsage).values({ id:usageId, count:0 }).onConflictDoNothing();
  const updated = await db.update(aiUsage).set({ count:sql`${aiUsage.count}+1` }).where(sql`${aiUsage.id}=${usageId} AND ${aiUsage.count}<${AI_DAILY_LIMIT}`).returning();
  return updated.length > 0;
}
