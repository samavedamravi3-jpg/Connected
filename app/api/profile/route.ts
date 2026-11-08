import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { profiles } from '@/db/schema';
import { identity, profileSchema, errorResponse, sameOrigin, clearExpiredLocations } from '@/lib/server';
import { coarseLocation } from '@/lib/network';
import { isDiscoverable, scrubLocation, withProfileDefaults } from '@/lib/visibility';
export async function GET() { try { const user=await identity(); const db=getDb(); const now=Date.now(); await clearExpiredLocations(db,now,user.userId); const rows=await db.select().from(profiles).where(eq(profiles.id,user.userId)); const row=rows[0]; const live=!!row&&isDiscoverable(row.visibleUntil,now); const data=row?withProfileDefaults(JSON.parse(row.data) as Record<string,unknown>):null; return Response.json({user:{name:user.displayName},profile:data?(live?{...data,discovery:true}:scrubLocation(data)):null,visibleUntil:live?row.visibleUntil:0}); }catch(e){return errorResponse(e);} }
export async function PUT(req:Request) { try {sameOrigin(req);const user=await identity();const p=profileSchema.parse(await req.json());const loc=p.discovery?coarseLocation(p.latitude!,p.longitude!):[null,null];const profile={...p,latitude:loc[0],longitude:loc[1]};const visibleUntil=p.discovery?Date.now()+3600000:0;const record={id:user.userId,data:JSON.stringify(profile),lat:loc[0],lng:loc[1],visibleUntil,updatedAt:Date.now()};await getDb().insert(profiles).values(record).onConflictDoUpdate({target:profiles.id,set:record});return Response.json({profile,visibleUntil});}catch(e){return errorResponse(e);} }
