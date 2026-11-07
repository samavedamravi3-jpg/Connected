import { and, gt, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import { profiles,meetups } from '@/db/schema';
import { identity,errorResponse,clearExpiredLocations,blocksFor } from '@/lib/server';
import { hiddenFor } from '@/lib/visibility';
import {people,events} from '@/lib/network';
export async function GET(req:Request){try {const url=new URL(req.url);if(url.searchParams.get('demo')==='true')return Response.json({people,events});const user=await identity();const db=getDb();const now=Date.now();await clearExpiredLocations(db,now);const hidden=hiddenFor(await blocksFor(db,user.userId),user.userId);const rows=await db.select().from(profiles).where(and(gt(profiles.visibleUntil,now),ne(profiles.id,user.userId)));const allEvents=await db.select().from(meetups);return Response.json({people:rows.filter(r=>!hidden.has(r.id)&&r.lat!==null&&r.lng!==null).map(r=>{const p=JSON.parse(r.data);return {id:r.id,name:p.name,role:p.role,company:p.company,industry:p.industry,help:p.help,goal:p.goal,lat:r.lat,lng:r.lng,color:'#bfb4dd',available:true,sample:false,venue:'Agree on a public place after connecting'};}),events:allEvents.map(e=>({...JSON.parse(e.data),id:e.id,sample:false,attendees:0}))});}catch(e){return errorResponse(e);}}
