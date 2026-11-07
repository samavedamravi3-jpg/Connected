import { eq,and } from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '@/db';
import {savedItems,blocks} from '@/db/schema';
import {identity,errorResponse,sameOrigin} from '@/lib/server';
export async function GET(){try{const u=await identity(),db=getDb();return Response.json({items:await db.select().from(savedItems).where(eq(savedItems.userId,u.userId)),blocked:(await db.select().from(blocks).where(eq(blocks.userId,u.userId))).map(b=>b.personId)});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);const u=await identity();const d=z.object({itemId:z.string().max(200),kind:z.enum(['person','event','block']),remove:z.boolean().optional()}).parse(await req.json());const db=getDb();if(d.kind==='block'){if(d.remove)await db.delete(blocks).where(and(eq(blocks.userId,u.userId),eq(blocks.personId,d.itemId)));else await db.insert(blocks).values({id:`${u.userId}:${d.itemId}`,userId:u.userId,personId:d.itemId}).onConflictDoNothing();}else {if(d.remove)await db.delete(savedItems).where(and(eq(savedItems.userId,u.userId),eq(savedItems.itemId,d.itemId)));else await db.insert(savedItems).values({id:`${u.userId}:${d.itemId}`,userId:u.userId,itemId:d.itemId,kind:d.kind}).onConflictDoNothing();}return Response.json({ok:true});}catch(e){return errorResponse(e);}}
