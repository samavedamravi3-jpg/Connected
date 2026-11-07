import {z} from 'zod';
import {getDb} from '@/db';
import {meetups} from '@/db/schema';
import {identity,errorResponse,sameOrigin} from '@/lib/server';
export async function POST(req:Request){try{sameOrigin(req);const u=await identity();const d=z.object({title:z.string().trim().min(3).max(100),category:z.string().max(40),venue:z.string().trim().min(3).max(150),time:z.string().datetime(),description:z.string().trim().min(10).max(1000),lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).parse(await req.json());if(Date.parse(d.time)<=Date.now())return Response.json({error:'Choose a future date and time.'},{status:400});const record={id:crypto.randomUUID(),owner:u.userId,data:JSON.stringify({...d,color:'#c7c1e7'}),createdAt:Date.now()};await getDb().insert(meetups).values(record);return Response.json({event:{...d,id:record.id,color:'#c7c1e7',sample:false,attendees:0}});}catch(e){return errorResponse(e);}}
