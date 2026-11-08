import { upcomingCharlotteEvents } from '@/lib/local-events';
import { snapToArea } from '@/lib/mobile/model';
import { apiError, json } from '@/lib/mobile/server';

/**
 * GET /api/v1/events -> real, upcoming Charlotte listings curated from organizer pages (see lib/local-events.ts),
 * shaped like the app's CommunityEvent. Not a live ticket feed: each carries its source link and check date.
 */
export async function GET() {
  try {
    const events = upcomingCharlotteEvents().map((e) => ({
      id: e.id,
      title: e.title,
      category: /hack/i.test(e.title) ? 'hackathon' : /career|job|resume/i.test(e.title) ? 'career' : 'networking',
      host: e.sourceName ?? 'Event organizer',
      venue: e.address ? `${e.venue} · ${e.address}` : e.venue,
      areaName: snapToArea({ latitude: e.lat, longitude: e.lng }).areaName,
      coord: { latitude: e.lat, longitude: e.lng },
      start: Date.parse(e.time),
      end: Date.parse(e.endsAt || e.time),
      cost: 'See organizer',
      description: e.description,
      sourceUrl: e.sourceUrl,
      checkedAt: e.checkedAt,
      isDemo: false,
    }));
    return json({ events });
  } catch (e) {
    return apiError(e);
  }
}
