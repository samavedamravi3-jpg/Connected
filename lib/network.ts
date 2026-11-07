export type Profile = { name: string; role: string; company: string; industry: string; goal: string; help: string[]; interests: string[]; discovery: boolean; latitude: number | null; longitude: number | null };
export type Person = { id: string; name: string; role: string; company: string; industry: string; help: string[]; goal: string; lat: number; lng: number; color: string; available: boolean; sample: boolean; venue: string };
export type LocalEvent = { id: string; title: string; category: string; venue: string; time: string; description: string; lat: number; lng: number; attendees: number; color: string; sample: boolean };
export type Hotspot = { id: string; title: string; subtitle: string; lat: number; lng: number; people: number; companies: string[]; color: string };
export const NYC: [number, number] = [40.7415, -73.9895];
export const industries = ['All industries', 'Technology', 'Finance', 'Design', 'Entrepreneurship', 'Marketing'];
export const helpOptions = ['Internship advice', 'Portfolio feedback', 'Career switch', 'Building a startup', 'Interview practice', 'Finding a cofounder'];
export const blankProfile: Profile = { name:'', role:'', company:'', industry:'Technology', goal:'', help:[], interests:[], discovery:false, latitude:null, longitude:null };
export const people: Person[] = [
 {id:'demo-maya',name:'Maya Chen',role:'Product Designer',company:'DoorDash',industry:'Design',help:['Portfolio feedback','Career switch'],goal:'Meet ambitious builders',lat:40.7442,lng:-73.9906,color:'#ecb27c',available:true,sample:true,venue:'Madison Square Park'},
 {id:'demo-james',name:'James Wilson',role:'Investment Banking Analyst',company:'J.P. Morgan',industry:'Finance',help:['Internship advice','Interview practice'],goal:'Learn about building a startup',lat:40.7409,lng:-73.9855,color:'#afc6e5',available:true,sample:true,venue:'Flatiron Plaza'},
 {id:'demo-priya',name:'Priya Patel',role:'Software Engineer',company:'Google',industry:'Technology',help:['Interview practice','Finding a cofounder'],goal:'Find a side-project collaborator',lat:40.7391,lng:-73.9919,color:'#bfb4dd',available:true,sample:true,venue:'Union Square north entrance'},
 {id:'demo-alex',name:'Alex Rivera',role:'Founder',company:'Earlystage',industry:'Entrepreneurship',help:['Building a startup','Finding a cofounder'],goal:'Meet a design cofounder',lat:40.7454,lng:-73.9849,color:'#b3c99d',available:true,sample:true,venue:'General Assembly lobby'},
 {id:'demo-sophie',name:'Sophie Park',role:'Brand Strategist',company:'Spotify',industry:'Marketing',help:['Career switch','Portfolio feedback'],goal:'Connect with creative people',lat:40.7368,lng:-73.9884,color:'#e5acc0',available:false,sample:true,venue:'Union Square Park'},
 {id:'demo-daniel',name:'Daniel Brooks',role:'Product Manager',company:'Notion',industry:'Technology',help:['Internship advice','Building a startup'],goal:'Help early-career builders',lat:40.7422,lng:-73.9958,color:'#dbbe82',available:true,sample:true,venue:'The Commons Chelsea'},
];
export const events: LocalEvent[] = [
 {id:'demo-event-1',title:'Builders & good coffee',category:'Technology',venue:'Devoción · Flatiron',time:'Today, 2:00 PM',description:'Bring a side project, an idea, or just your curiosity. A relaxed coffee meetup for people making things.',lat:40.7405,lng:-73.9912,attendees:18,color:'#e7c8a4',sample:true},
 {id:'demo-event-2',title:'Your first step into finance',category:'Finance',venue:'General Assembly · Flatiron',time:'Today, 4:30 PM',description:'An approachable conversation about internships, interviews, and getting started in finance.',lat:40.7449,lng:-73.9872,attendees:32,color:'#c7c1e7',sample:true},
 {id:'demo-event-3',title:'Design people, meet your people',category:'Design',venue:'The Commons · Chelsea',time:'Tomorrow, 6:00 PM',description:'Meet local designers and share work in progress. All experience levels welcome.',lat:40.7432,lng:-73.9966,attendees:24,color:'#c5d3a8',sample:true},
];
export const hotspots: Hotspot[] = [
 {id:'hotspot-flatiron',title:'Flatiron District',subtitle:'Ideas are in the air',lat:40.7429,lng:-73.9895,people:24,companies:['DoorDash','J.P. Morgan','Notion'],color:'#a38bd8'},
 {id:'hotspot-union',title:'Union Square',subtitle:'A little bit of everyone',lat:40.7366,lng:-73.9905,people:16,companies:['Spotify','Google'],color:'#a8bf83'},
 {id:'hotspot-chelsea',title:'Chelsea',subtitle:'Where creative minds meet',lat:40.746,lng:-73.998,people:12,companies:['Notion','Independent'],color:'#d3a773'},
];
export function distanceKm(a:[number,number], b:[number,number]) { const r=Math.PI/180; const dLat=(b[0]-a[0])*r,dLon=(b[1]-a[1])*r; const h=Math.sin(dLat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLon/2)**2; return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); }
export function coarseLocation(lat:number,lng:number):[number,number] { return [Math.round(lat*200)/200,Math.round(lng*200)/200]; }
export function matchPerson(p:Person, profile:Profile) { const text=profile.goal.toLowerCase(); const topics=p.help.filter(h=>profile.interests.includes(h)||h.toLowerCase().split(' ').some(w=>w.length>3&&text.includes(w))); const industry=p.industry===profile.industry; return {score:(p.available?20:0)+(industry?25:0)+topics.length*25,reason:topics.length?`Offers ${topics.join(' and ').toLowerCase()} — a fit for your next step.`:industry?`Works in ${p.industry.toLowerCase()} and offers ${p.help[0].toLowerCase()}.`:`Happy to help with ${p.help[0].toLowerCase()}.`}; }
export function initials(name:string) { return name.split(' ').map(v=>v[0]).slice(0,2).join('').toUpperCase(); }
