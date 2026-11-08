import { and, gt, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import { profiles,meetups } from '@/db/schema';
import { identity,errorResponse,clearExpiredLocations,blocksFor } from '@/lib/server';
import { hiddenFor, parseSearchCenter, withinVisibility, withProfileDefaults } from '@/lib/visibility';
import {people,events} from '@/lib/network';

// Live discovery needs ?latitude=&longitude= for the area being searched. The center is rounded to the same coarse
// grid as stored profiles and each person is shown only if it falls inside the visibility radius they chose.
// This bounds the search area; it is not proof of the searcher's physical position.
const SEARCH_NOTE = 'Shows people whose chosen discovery distance covers this search area. The search area is approximate and not verified.';

export async function GET(req:Request){try {
  const url=new URL(req.url);
  if(url.searchParams.get('demo')==='true')return Response.json({people,events});
  const user=await identity();
  const center=parseSearchCenter(url.searchParams.get('latitude'),url.searchParams.get('longitude'));
  if(!center)return Response.json({error:'Choose a search area (latitude and longitude) to see live members.'},{status:400});
  const db=getDb();const now=Date.now();
  await clearExpiredLocations(db,now);
  const hidden=hiddenFor(await blocksFor(db,user.userId),user.userId);
  const rows=await db.select().from(profiles).where(and(gt(profiles.visibleUntil,now),ne(profiles.id,user.userId)));
  const allEvents=await db.select().from(meetups);
  const found=rows.filter(r=>!hidden.has(r.id)&&r.lat!==null&&r.lng!==null).map(r=>({row:r,p:withProfileDefaults(JSON.parse(r.data) as Record<string,unknown>)})).filter(({row,p})=>withinVisibility(center,{lat:row.lat,lng:row.lng,visibilityKm:p.visibilityKm}));
  return Response.json({
    searchCenter:center,note:SEARCH_NOTE,
    people:found.map(({row:r,p})=>({id:r.id,name:p.name,role:p.role,company:p.company,industry:p.industry,help:p.help,goal:p.goal,lat:r.lat,lng:r.lng,color:'#bfb4dd',available:true,sample:false,venue:'Agree on a public place after connecting',visibilityKm:p.visibilityKm,meetingStyle:p.meetingStyle,experience:p.experience,availability:p.availability,photoUrl:p.photoUrl,socials:p.socials})),
    events:allEvents.map(e=>({...JSON.parse(e.data),id:e.id,sample:false,attendees:0})),
  });
}catch(e){return errorResponse(e);}}
