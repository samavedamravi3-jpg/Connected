import { env } from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '@/db';
import {profiles} from '@/db/schema';
import {identity,errorResponse,sameOrigin,resolveTarget,consumeAiQuota} from '@/lib/server';
import {parseSearchCenter,withProfileDefaults} from '@/lib/visibility';
import {callClaude,coachContext,coachMessagesSchema,buildCoachMessages,templateCoach,fallbackNote,COACH_SYSTEM,COACH_REPLY_MAX} from '@/lib/ai';

/** Whether the in-app coach can use Claude. Never returns the key or model. */
export async function GET(){return Response.json({configured:!!env.ANTHROPIC_API_KEY});}

/**
 * Approach coach: help the signed-in user plan a respectful introduction to one available person.
 * Only sender name/goal/preferences and target name/role/company/help/goal reach Claude (see coachContext).
 * Shares the daily AI quota with the icebreaker. Never sends messages on the user's behalf.
 */
export async function POST(req:Request){try{
  sameOrigin(req);const u=await identity();
  const body=z.object({personId:z.string().min(1).max(200),messages:coachMessagesSchema,latitude:z.number().nullable().optional(),longitude:z.number().nullable().optional()}).parse(await req.json());
  const db=getDb();
  const [own]=await db.select().from(profiles).where(eq(profiles.id,u.userId));
  if(!own)return Response.json({error:'Finish your profile first.'},{status:400});
  const sender=withProfileDefaults(JSON.parse(own.data) as Record<string,unknown>);
  const target=await resolveTarget(db,u.userId,body.personId,parseSearchCenter(body.latitude,body.longitude));
  if(!target.ok)return Response.json({error:'This profile is unavailable.'},{status:404});
  const context=coachContext(sender,target.person);
  const template=(reason:Parameters<typeof fallbackNote>[0])=>Response.json({text:templateCoach(context).slice(0,COACH_REPLY_MAX),source:'template',note:fallbackNote(reason)});
  if(!env.ANTHROPIC_API_KEY)return template('missing-key');
  if(!await consumeAiQuota(db,u.userId))return template('quota');
  const result=await callClaude({apiKey:env.ANTHROPIC_API_KEY,model:env.ANTHROPIC_MODEL,system:COACH_SYSTEM,maxTokens:4000,messages:buildCoachMessages(context,body.messages)});
  if(!result.ok)return template(result.reason);
  return Response.json({text:result.text.slice(0,COACH_REPLY_MAX),source:'claude',note:target.sample?'Coaching for a fictional demo profile.':undefined});
}catch(e){return errorResponse(e);}}
