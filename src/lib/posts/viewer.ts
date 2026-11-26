import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AREAS, CHARLOTTE_CENTER } from '@/data/options';
import type { Area } from '@/data/types';
import { useApp } from '@/state/AppState';
import { nearestArea, type ViewerRelation } from './model';
import { usePostsLocal } from './store';

export type AreaSource = 'manual' | 'location' | 'default';
export type LocPerm = 'checking' | 'granted' | 'denied' | 'undetermined';

/**
 * The neighborhood Nearby uses for discovery: your manual choice, else the neighborhood you're in (from location,
 * if already allowed; never prompted here), else Uptown. Only the neighborhood is kept, never coordinates.
 */
export function useViewerArea(): { area: Area; source: AreaSource; perm: LocPerm; radiusMi: number } {
  const app = useApp();
  const local = usePostsLocal();
  const [perm, setPerm] = useState<LocPerm>('checking');
  const [located, setLocated] = useState<Area | null>(null);

  useEffect(() => {
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then(async ({ status }) => {
        if (!alive) return;
        setPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
        if (status !== 'granted') return;
        const last = (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
        if (alive && last) setLocated(nearestArea({ latitude: last.coords.latitude, longitude: last.coords.longitude }));
      })
      .catch(() => alive && setPerm('denied'));
    return () => { alive = false; };
  }, []);

  const manual = local.areaId ? AREAS.find((a) => a.id === local.areaId) : undefined;
  const fromHere = app.here?.isGps ? nearestArea(app.here.coord) : null;
  const area = manual ?? located ?? fromHere ?? nearestArea(CHARLOTTE_CENTER);
  return { area, source: manual ? 'manual' : located || fromHere ? 'location' : 'default', perm, radiusMi: local.radiusMi };
}

/** Your relationship to a post's author, from the existing connection-request rules. */
export function useRelation(authorId: string | undefined, isAuthor: boolean): ViewerRelation {
  const app = useApp();
  const reqs = authorId ? app.requests.filter((r) => r.personId === authorId) : [];
  return {
    isAuthor,
    connected: reqs.some((r) => r.status === 'accepted'),
    pending: reqs.some((r) => r.status === 'requested'),
    blocked: !!authorId && (app.blocked.includes(authorId) || app.muted.includes(authorId)),
    signedIn: !app.backendEnabled || !!app.session,
  };
}
