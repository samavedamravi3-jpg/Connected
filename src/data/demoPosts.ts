/**
 * DEMO Nearby posts, written as if by the built-in demo people. Always labeled Demo in the app.
 * Photos: Unsplash photographs served by picsum.photos (Unsplash License), chosen to fit each caption.
 * Times are relative to when the app started, so the feed always has live and closing-soon examples.
 */
import { AREAS } from './options';
import type { NearbyPost, PostIntent, RadiusMi } from '../lib/posts/model';

const area = (id: string) => AREAS.find((a) => a.id === id)!;
const MIN = 60_000;
const photo = (id: number, w: number, h: number) => ({ uri: `https://picsum.photos/id/${id}/${w}/${h}`, width: w, height: h });

type Seed = { id: string; author: { id: string; name: string; role: string }; caption: string; intent: PostIntent | null; areaId: string; radiusMi: RadiusMi; agoMin: number; lastsH: 2 | 6 | 24; img: ReturnType<typeof photo>; alt: string; closed?: NearbyPost['closed'] };

const SEEDS: Seed[] = [
  { id: 'np-pitch', author: { id: 'jordan', name: 'Jordan Kim', role: 'Risk Analyst' }, caption: 'Working on a startup pitch at the student union. Anyone want to exchange feedback? I’ll be here until about 4.', intent: 'working', areaId: 'university', radiusMi: 3, agoMin: 35, lastsH: 6, img: photo(4, 1200, 900), alt: 'Someone writing notes in a notebook next to a laptop' },
  { id: 'np-interviews', author: { id: 'maya', name: 'Maya Okafor', role: 'VP, Commercial Banking' }, caption: 'Anyone down to practice finance interviews this afternoon? Happy to run a few mock questions over coffee.', intent: 'help', areaId: 'southend', radiusMi: 3, agoMin: 80, lastsH: 6, img: photo(42, 1200, 800), alt: 'A long wooden table in a quiet café with a cup of coffee' },
  { id: 'np-designer', author: { id: 'daniel', name: 'Daniel Reyes', role: 'Senior Software Engineer' }, caption: 'Building an app this weekend — looking for a designer. It’s a small tool for food pantries to track volunteers.', intent: 'collab', areaId: 'noda', radiusMi: 5, agoMin: 150, lastsH: 24, img: photo(20, 1080, 1080), alt: 'A desk covered with design sketches, color swatches and a phone' },
  { id: 'np-hackathon', author: { id: 'sofia', name: 'Sofia Alvarez', role: 'QA Engineer' }, caption: 'Just finished my first hackathon. Happy to share what I learned, especially what I’d do differently on day one.', intent: 'sharing', areaId: 'uptown', radiusMi: 5, agoMin: 25, lastsH: 24, img: photo(180, 1200, 900), alt: 'A laptop, an open notebook with handwritten notes and headphones on a wooden desk' },
  { id: 'np-event', author: { id: 'kevin', name: 'Kevin Tran', role: 'Marketing student' }, caption: 'Anyone going to tonight’s networking event? First time going alone, would be nice to walk in with someone.', intent: 'event', areaId: 'uptown', radiusMi: 3, agoMin: 50, lastsH: 6, img: photo(452, 1200, 800), alt: 'A crowd of people at an evening event under stage lights' },
  { id: 'np-resume', author: { id: 'priya', name: 'Priya Nair', role: 'Nurse Practitioner' }, caption: 'At the library until 3 with a coffee. If you’re applying to nursing programs, I can look over your personal statement.', intent: 'help', areaId: 'uptown', radiusMi: 1, agoMin: 70, lastsH: 2, img: photo(431, 1080, 1350), alt: 'A latte on a wooden table beside a small brass bell' },
  { id: 'np-study', author: { id: 'grace', name: 'Grace Liu', role: 'CPA, Financial Planner' }, caption: 'Looking for a study buddy for CFA Level 1 on weekday mornings.', intent: 'collab', areaId: 'dilworth', radiusMi: 3, agoMin: 200, lastsH: 24, img: photo(625, 1200, 900), alt: 'An empty dining table with white chairs by a sunny window', closed: 'found' },
];

export function buildDemoPosts(now: number): NearbyPost[] {
  return SEEDS.map((s) => {
    const createdAt = now - s.agoMin * MIN;
    return {
      id: s.id,
      author: { ...s.author, photo: null, isDemo: true },
      image: { ...s.img, description: s.alt },
      caption: s.caption,
      intent: s.intent,
      area: area(s.areaId),
      radiusMi: s.radiusMi,
      createdAt,
      // Keep every demo post alive for a while after launch so the feed isn't empty.
      expiresAt: Math.max(createdAt + s.lastsH * 3_600_000, now + 90 * MIN),
      closed: s.closed ?? null,
      isDemo: true,
    };
  });
}
