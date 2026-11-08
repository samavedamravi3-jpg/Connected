import { env } from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '@/db';
import {profiles} from '@/db/schema';
import {identity,errorResponse,sameOrigin,resolveTarget,consumeAiQuota} from '@/lib/server';
import {parseSearchCenter} from '@/lib/visibility';
import {callClaude,fallbackNote,templateIcebreaker,plainClip,ICEBREAKER_SYSTEM} from "@/lib/ai";

// latitude/longitude: the caller's search area. Required for live people (radius check); demo people are exempt.
export async function POST(req:Request){try{
  sameOrigin(req);const u=await identity();
  const body=z.object({personId:z.string().max(200),latitude:z.number().nullable().optional(),longitude:z.number().nullable().optional()}).parse(await req.json());
  const db=getDb();
  const [own]=await db.select().from(profiles).where(eq(profiles.id,u.userId));
  if(!own)return Response.json({error:'Finish your profile first.'},{status:400});
  const profile=JSON.parse(own.data) as {name:string;goal:string};
  const target=await resolveTarget(db,u.userId,body.personId,parseSearchCenter(body.latitude,body.longitude));
  if(!target.ok)return Response.json({error:'This profile is unavailable.'},{status:404});
  const person=target.person;
  const fallback=templateIcebreaker(profile,person);
  const template=(reason:Parameters<typeof fallbackNote>[0])=>Response.json({text:fallback,source:'template',note:fallbackNote(reason)});
  if(!env.ANTHROPIC_API_KEY)return template('missing-key');
  if(!await consumeAiQuota(db,u.userId))return template('quota');
  const result=await callClaude({apiKey:env.ANTHROPIC_API_KEY,model:env.ANTHROPIC_MODEL,system:ICEBREAKER_SYSTEM,maxTokens:2000,messages:[{role:'user',content:JSON.stringify({sender:{name:profile.name,goal:profile.goal},recipient:{name:person.name,help:person.help}})}]});
  if(!result.ok)return template(result.reason);
  return Response.json({text:plainClip(result.text,500),source:"claude"});
}catch(e){return errorResponse(e);}}
