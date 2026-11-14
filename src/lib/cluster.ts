import { useMemo } from 'react';
import Supercluster from 'supercluster';
import type { LatLng } from '@/data/types';

export type MapView = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type Clustered<T> =
  | { kind: 'item'; item: T }
  | { kind: 'cluster'; id: number; count: number; coord: LatLng };

/** Web-mercator style zoom level for a map region (rounded so small pans don't re-cluster). */
export const zoomLevel = (r: MapView) => Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 0.0001)));

/**
 * Groups nearby pins into numbered clusters with supercluster. Items listed in `keepIds` (the selected
 * person, say) are never absorbed into a cluster. Pass `region = null` to skip clustering.
 */
export function useClusters<T extends { id: string; coord: LatLng }>(items: T[], region: MapView | null, keepIds: string[] = []) {
  const keepKey = keepIds.join('|');
  const index = useMemo(() => {
    const idx = new Supercluster<{ id: string }>({ radius: 52, maxZoom: 16, minPoints: 2 });
    idx.load(
      items
        .filter((i) => !keepKey.split('|').includes(i.id))
        .map((i) => ({ type: 'Feature' as const, properties: { id: i.id }, geometry: { type: 'Point' as const, coordinates: [i.coord.longitude, i.coord.latitude] } })),
    );
    return idx;
  }, [items, keepKey]);

  const hasRegion = !!region;
  const zoom = region ? zoomLevel(region) : 0;
  const north = region ? region.latitude + region.latitudeDelta * 0.8 : 0;
  const south = region ? region.latitude - region.latitudeDelta * 0.8 : 0;
  const east = region ? region.longitude + region.longitudeDelta * 0.8 : 0;
  const west = region ? region.longitude - region.longitudeDelta * 0.8 : 0;

  const out = useMemo<Clustered<T>[]>(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const kept = items.filter((i) => keepKey.split('|').includes(i.id)).map((item): Clustered<T> => ({ kind: 'item', item }));
    if (!hasRegion) return items.map((item) => ({ kind: 'item', item }));
    const feats = index.getClusters([Math.max(-180, west), Math.max(-85, south), Math.min(180, east), Math.min(85, north)], zoom);
    const shown = feats.flatMap((f): Clustered<T>[] => {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string };
      if (props.cluster && props.cluster_id !== undefined) return [{ kind: 'cluster', id: props.cluster_id, count: props.point_count ?? 0, coord: { latitude: lat, longitude: lng } }];
      const item = props.id ? byId.get(props.id) : undefined;
      return item ? [{ kind: 'item', item }] : [];
    });
    return [...shown, ...kept];
  }, [index, items, keepKey, zoom, north, south, east, west, hasRegion]);

  /** Zoom level that breaks a cluster apart, for tap-to-expand. */
  const expansionZoom = (clusterId: number) => {
    try {
      return index.getClusterExpansionZoom(clusterId);
    } catch {
      return Math.min(zoom + 2, 18);
    }
  };
  return { clusters: out, expansionZoom, zoom };
}
