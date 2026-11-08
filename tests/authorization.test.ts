import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDiscoverable,scrubLocation,hiddenFor,isBlockedPair,visibleRequests,canTransition,counterpart,profileSchema,withProfileDefaults,isAllowedSocialUrl,isAllowedPhotoUrl,parseSearchCenter,withinVisibility,canReach,coarse,kmBetween,DEFAULT_VISIBILITY_KM,VISIBILITY_KM} from '../lib/visibility.ts';
import {coarseLocation,distanceKm} from '../lib/network.ts';

const legacy={name:'Ana',role:'Student',company:'',industry:'Design',goal:'Find a mentor',help:[],interests:[],discovery:false,latitude:null,longitude:null};

test('profiles saved before preferences existed still validate and get documented defaults',()=>{
  const p=profileSchema.parse(legacy);
  assert.equal(p.visibilityKm,1.6);assert.equal(p.meetingStyle,'Either');assert.equal(p.experience,'Student');assert.equal(p.availability,'Flexible');
  assert.equal(p.photoUrl,'');assert.deepEqual(p.socials,{linkedin:'',instagram:'',github:''});assert.equal(p.onboardingVersion,1);
  assert.equal(profileSchema.parse({...legacy,onboardingVersion:2}).onboardingVersion,2);
  assert.deepEqual(withProfileDefaults(legacy).socials,{linkedin:'',instagram:'',github:''});
  assert.equal(withProfileDefaults(legacy).visibilityKm,DEFAULT_VISIBILITY_KM);
});

test('preference values are limited to the allowed choices',()=>{
  for(const km of VISIBILITY_KM)assert.equal(profileSchema.safeParse({...legacy,visibilityKm:km}).success,true);
  for(const km of [0,1,2,100,-1.6])assert.equal(profileSchema.safeParse({...legacy,visibilityKm:km}).success,false,`${km} km rejected`);
  assert.equal(profileSchema.safeParse({...legacy,meetingStyle:'Anywhere'}).success,false);
  assert.equal(profileSchema.safeParse({...legacy,experience:'Expert'}).success,false);
  assert.equal(profileSchema.safeParse({...legacy,availability:'Later'}).success,false);
});

test('stored preferences that fail policy are replaced on read',()=>{
  const d=withProfileDefaults({...legacy,visibilityKm:999,meetingStyle:'x',photoUrl:'javascript:alert(1)',socials:{linkedin:'https://evil.example/in/a',github:'https://github.com/ok'},onboardingVersion:'2'});
  assert.equal(d.visibilityKm,1.6);assert.equal(d.meetingStyle,'Either');assert.equal(d.photoUrl,'');assert.equal(d.onboardingVersion,1);
  assert.deepEqual(d.socials,{linkedin:'',instagram:'',github:'https://github.com/ok'});
});

test('social links: HTTPS on the exact provider domain or a subdomain only',()=>{
  for(const [p,u] of [['linkedin','https://linkedin.com/in/a'],['linkedin','https://www.linkedin.com/in/a'],['instagram','https://instagram.com/a'],['github','https://github.com/a'],['github','https://gist.github.com/a'],['github','']] as const)assert.equal(isAllowedSocialUrl(p,u),true,u);
  for(const [p,u] of [['linkedin','http://linkedin.com/in/a'],['linkedin','https://evillinkedin.com/a'],['linkedin','https://linkedin.com.evil.com/a'],['linkedin','https://user:pw@linkedin.com/a'],['linkedin','javascript:alert(1)//linkedin.com'],['github','https://instagram.com/a'],['instagram','linkedin.com/a'],['github','https://github.com/'+'a'.repeat(300)]] as const)assert.equal(isAllowedSocialUrl(p,u),false,u);
  assert.equal(profileSchema.safeParse({...legacy,socials:{linkedin:'https://evil.com'}}).success,false);
});

test('photos: HTTPS or base64 JPEG/PNG/WebP data URL, no SVG, at most 180000 chars',()=>{
  for(const u of ['','https://cdn.example.com/me.jpg','data:image/png;base64,iVBORw0KGgo=','data:image/jpeg;base64,/9j/4AAQ','data:image/webp;base64,UklGRg=='])assert.equal(isAllowedPhotoUrl(u),true,u.slice(0,40));
  for(const u of ['http://cdn.example.com/me.jpg','https://cdn.example.com/me.svg','https://cdn.example.com/me.SVG','data:image/svg+xml;base64,PHN2Zz4=','data:image/gif;base64,R0lGOD','data:image/png;base64,<script>','data:text/html;base64,PGgxPg==','javascript:alert(1)','https://u:p@cdn.example.com/a.png','data:image/png;base64,'+'A'.repeat(180000)])assert.equal(isAllowedPhotoUrl(u),false,u.slice(0,40));
  assert.equal(isAllowedPhotoUrl('data:image/png;base64,'+'A'.repeat(180000-22)),true,'exactly at the limit');
});

test('local location math matches lib/network exactly',()=>{
  for(const [a,b] of [[40.74151237,-73.98954321],[35.2271,-80.8431],[-33.8688,151.2093]])assert.deepEqual(coarse(a,b),coarseLocation(a,b));
  assert.equal(kmBetween([40.7415,-73.9895],[35.2271,-80.8431]),distanceKm([40.7415,-73.9895],[35.2271,-80.8431]));
});

test('search center must be valid and is rounded to the coarse grid',()=>{
  assert.deepEqual(parseSearchCenter('40.74151','-73.98954'),[40.74,-73.99]);
  assert.deepEqual(parseSearchCenter(40.74151,-73.98954),[40.74,-73.99]);
  for(const [a,b] of [[null,null],['',''],['abc','1'],['91','0'],['0','181'],[NaN,0],[Infinity,0],[undefined,1]])assert.equal(parseSearchCenter(a,b),null,`${a},${b}`);
});

test('a live person is reachable only inside the radius they chose (default 1.6 km); demo people are exempt',()=>{
  const at={lat:40.74,lng:-73.99};
  const near:[number,number]=[40.75,-73.99];   // ~1.1 km north
  const mid:[number,number]=[40.765,-73.99];   // ~2.8 km north
  assert.equal(withinVisibility(near,at),true,'default radius covers ~1.1 km');
  assert.equal(withinVisibility(mid,at),false,'default radius excludes ~2.8 km');
  assert.equal(withinVisibility(mid,{...at,visibilityKm:4.8}),true,'4.8 km radius covers ~2.8 km');
  assert.equal(withinVisibility(near,{...at,visibilityKm:0.8}),false,'0.8 km radius excludes ~1.1 km');
  assert.equal(withinVisibility(mid,{...at,visibilityKm:999}),false,'invalid stored radius falls back to 1.6 km');
  assert.equal(withinVisibility(near,{lat:null,lng:null}),false,'no stored location is never reachable');
  assert.equal(canReach(null,{sample:false,...at}),false,'live target needs a search center');
  assert.equal(canReach(mid,{sample:false,...at}),false);
  assert.equal(canReach(near,{sample:false,...at}),true);
  assert.equal(canReach(null,{sample:true,lat:null,lng:null}),true,'demo people are exempt from radius');
  assert.equal(canReach([35.2,-80.8],{sample:true,...at}),true);
});

const A='user-a',B='user-b',C='user-c';
const pending=(id:string,sender:string,recipient:string)=>({id,sender,recipient,status:'pending'});

test('discovery closes exactly at the one-hour boundary',()=>{const now=1_000_000;assert.equal(isDiscoverable(now+1,now),true);assert.equal(isDiscoverable(now,now),false);assert.equal(isDiscoverable(0,now),false);});

test('expired profile loses its stored coarse location but keeps other fields',()=>{const data={name:'Ana',goal:'Find a mentor',latitude:40.74,longitude:-73.99,discovery:true};const s=scrubLocation(data);assert.equal(s.latitude,null);assert.equal(s.longitude,null);assert.equal(s.discovery,false);assert.equal(s.name,'Ana');assert.equal(data.latitude,40.74,'input is not mutated');});

test('blocks hide people in both directions and only for the people involved',()=>{const blocks=[{userId:A,personId:B}];assert.deepEqual([...hiddenFor(blocks,A)],[B]);assert.deepEqual([...hiddenFor(blocks,B)],[A]);assert.equal(hiddenFor(blocks,C).size,0);assert.equal(isBlockedPair(blocks,A,B),true);assert.equal(isBlockedPair(blocks,B,A),true);assert.equal(isBlockedPair(blocks,A,C),false);});

test('conversations with a blocked counterpart are hidden from both sides',()=>{const reqs=[pending('1',B,A),pending('2',A,C),pending('3',B,C)];const blocks=[{userId:A,personId:B}];assert.deepEqual(visibleRequests(reqs,blocks,A).map(r=>r.id),['2']);assert.deepEqual(visibleRequests(reqs,blocks,B).map(r=>r.id),['3']);assert.deepEqual(visibleRequests(reqs,blocks,C).map(r=>r.id),['2','3']);});

test('a user never sees requests they are not part of',()=>{assert.deepEqual(visibleRequests([pending('x',B,C)],[],A),[]);assert.equal(counterpart(pending('y',A,B),A),B);assert.equal(counterpart(pending('y',A,B),B),A);});

test('request transitions are limited to the right participant',()=>{const r=pending('1',A,B);assert.equal(canTransition(r,A,'cancelled',[]),true);assert.equal(canTransition(r,B,'cancelled',[]),false);assert.equal(canTransition(r,B,'accepted',[]),true);assert.equal(canTransition(r,B,'declined',[]),true);assert.equal(canTransition(r,A,'accepted',[]),false,'sender cannot accept own request');assert.equal(canTransition(r,C,'declined',[]),false,'outsider cannot act');assert.equal(canTransition({...r,status:'accepted'},B,'declined',[]),false,'only pending requests move');assert.equal(canTransition(undefined,B,'accepted',[]),false);});

test('a block in either direction prevents acceptance but still allows clean-up',()=>{const r=pending('1',A,B);for(const blocks of [[{userId:A,personId:B}],[{userId:B,personId:A}]]){assert.equal(canTransition(r,B,'accepted',blocks),false);assert.equal(canTransition(r,B,'declined',blocks),true);assert.equal(canTransition(r,A,'cancelled',blocks),true);}assert.equal(canTransition(r,B,'accepted',[{userId:A,personId:C}]),true,'unrelated blocks do not interfere');});
