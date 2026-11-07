import { z } from 'zod';
import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import type { getDb } from '@/db';
import { blocks, profiles } from '@/db/schema';
export const profileSchema = z.object({name:z.string().trim().min(1).max(60),role:z.string().trim().min(1).max(80),company:z.string().trim().max(80),industry:z.enum(['Technology','Finance','Design','Entrepreneurship','Marketing']),goal:z.string().trim().min(5).max(500),help:z.array(z.string().max(60)).max(6),interests:z.array(z.string().max(60)).max(6),discovery:z.boolean(),latitude:z.number().min(-90).max(90).nullable(),longitude:z.number().min(-180).max(180).nullable()}).refine(p=>!p.discovery||(p.latitude!==null&&p.longitude!==null),'Choose a location before turning on discovery.');
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
