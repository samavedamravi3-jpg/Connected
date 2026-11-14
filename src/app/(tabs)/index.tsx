import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import GorhomSheet, { BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Extrapolation, FadeIn, FadeInUp, FadeOut, FadeOutUp, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import MapView, { Circle, Marker, Polygon, Polyline, type MapStyleElement, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { LayersSheet } from '@/components/LayersSheet';
import { ClusterPin, EventPin, NodePin, YouNode, nodeAnchor } from '@/components/MapPins';
import { PersonCard } from '@/components/PersonCard';
import { Avatar, Button, Chip } from '@/components/ui';
import { HOTSPOTS, HOTSPOT_LEVELS, type Hotspot } from '@/data/hotspots';
import { AREAS, CHARLOTTE_CENTER } from '@/data/options';
import { dataSource } from '@/data/source';
import type { CommunityEvent, LatLng, NearbyPerson } from '@/data/types';
import { activeFilterCount, applyFilters, defaultFilters, isFreeToday, type Filters } from '@/lib/filters';
import { sortMyFieldFirst } from '@/lib/fieldClassifier';
import { useClusters, type MapView as MapRegion } from '@/lib/cluster';
import { approxDistance, deltaForMiles, distanceMi, travelTime } from '@/lib/geo';
import { canSeeDoor, doorActive, matchPoints, matchScore, matchStrength } from '@/lib/match';
import { ALERT_RADIUS_MI, enableNearbyAlerts, peopleWithin, useNearbyAlerts } from '@/lib/nearbyAlerts';
import { useLiveLocation, type Fix } from '@/lib/useLiveLocation';
import { useApp } from '@/state/AppState';
import { C, R, S, T, shadow } from '@/theme';

/**
 * Connected. map style: a calm lavender-gray city with white streets, so purple network nodes and
 * connection lines read clearly. Fully applied on Android (Google Maps). Apple Maps on iOS can't be
 * recolored, so a soft lavender wash (the Polygon below) gives it the same feel there.
 */
const ANDROID_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F3F1F8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E6884' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F6FB' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#8E88A6' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E7EBE6' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E4E0EE' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#8E88A6' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E9E3FA' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D6CCF5' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D9D2F2' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8E88A6' }] },
];
const WASH = Platform.OS === 'ios' ? 'rgba(246,243,253,0.42)' : 'rgba(246,243,253,0.12)';
const POOL_RADIUS_MI = 25;
const MAX_LINES = 6;
const PEEK_MIN = 96;

type IconName = ComponentProps<typeof Ionicons>['name'];
type MapLook = 'network' | 'city3d' | 'satellite';

const LOOKS: { id: MapLook; label: string; icon: IconName }[] = [
  { id: 'network', label: 'Standard', icon: 'map-outline' },
  { id: 'city3d', label: '3D city', icon: 'business-outline' },
  { id: 'satellite', label: 'Satellite', icon: 'earth-outline' },
];

/** Short place name for the header: first part before a comma, trimmed to fit. */
const shortPlace = (name: string) => {
  const first = name.split(',')[0].trim();
  return first.length > 16 ? `${first.slice(0, 15).trimEnd()}…` : first;
};

/** Approximate camera zoom for a region's latitude span (Apple uses altitude, Google uses zoom). */
const zoomFor = (latDelta: number) => ({
  altitude: Math.min(60_000, Math.max(500, latDelta * 111_000 * 1.25)),
  zoom: Math.min(19, Math.max(3, Math.log2(360 / Math.max(latDelta, 0.0005)))),
});
/** A tilted, slightly turned camera that shows buildings in 3D. */
const camera3d = (latDelta: number) => ({ pitch: 60, heading: 28, ...zoomFor(Math.min(latDelta, 0.08) * 0.75) });
type Tab = 'best' | 'doors' | 'all';
const regionFor = (c: LatLng, mi: number): Region => ({ ...c, latitudeDelta: deltaForMiles(mi), longitudeDelta: deltaForMiles(mi) });

export default function MapScreen() {
  const app = useApp();
  const { prefs, profile, blocked, setHere } = app;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [initialRegion] = useState(() => regionFor(CHARLOTTE_CENTER, prefs.travelMi));
  const regionRef = useRef<Region>(initialRegion);
  const followingRef = useRef(false);
  const lastHere = useRef<LatLng | null>(null);

  const [height, setHeight] = useState(0);
  const [live, setLive] = useState(true);
  const [following, setFollowing] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [areaName, setAreaName] = useState('Charlotte');
  const [searchCenter, setSearchCenter] = useState<LatLng>(CHARLOTTE_CENTER);
  const [mapCenter, setMapCenter] = useState<LatLng>(CHARLOTTE_CENTER);
  const [loaded, setLoaded] = useState<{ center: LatLng; people: NearbyPerson[] } | null>(null);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(prefs.travelMi));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'filters' | 'area' | null>(null);
  const sheetRef = useRef<GorhomSheet>(null);
  const sheetY = useSharedValue(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [chipEdge, setChipEdge] = useState({ start: true, end: false });
  const [tab, setTab] = useState<Tab>('best');
  const [showHotspots, setShowHotspots] = useState(true);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  const [settledPinsKey, setSettledPinsKey] = useState('');
  const [realOnly, setRealOnly] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [allEvents, setAllEvents] = useState<CommunityEvent[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [hideShareCard, setHideShareCard] = useState(false);

  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  // Map look: flat "network" map, tilted 3D city with buildings, or 3D satellite.
  const [look, setLook] = useState<MapLook>('network');
  const [showLayers, setShowLayers] = useState(false);
  const lookRef = useRef<MapLook>('network');
  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  /** Move the camera; in 3D looks keep the tilt instead of flattening to a top-down region. */
  const moveTo = useCallback((center: LatLng, delta: number, ms = 500) => {
    if (lookRef.current === 'network') {
      mapRef.current?.animateToRegion({ ...center, latitudeDelta: delta, longitudeDelta: delta }, ms);
    } else {
      mapRef.current?.animateCamera({ center, ...camera3d(delta) }, { duration: ms });
    }
  }, []);

  const flyTo = useCallback((c: LatLng, mi: number, ms = 500) => {
    moveTo(c, deltaForMiles(mi), ms);
  }, [moveTo]);

  const changeLook = (next: MapLook) => {
    setShowLayers(false);
    setLook(next);
    lookRef.current = next;
    const r = regionRef.current;
    const center = { latitude: r.latitude, longitude: r.longitude };
    if (next === 'network') mapRef.current?.animateCamera({ center, pitch: 0, heading: 0, ...zoomFor(r.latitudeDelta) }, { duration: 700 });
    else mapRef.current?.animateCamera({ center, ...camera3d(Math.min(r.latitudeDelta, 0.06)) }, { duration: 900 });
  };

  // New GPS position: center on you the first time; afterwards, move with you only in follow mode.
  const onFix = useCallback(
    (f: Fix, first: boolean) => {
      // Share your rough position with the meeting-spot finder (in memory only), not on every tiny move.
      if (!lastHere.current || distanceMi(lastHere.current, f.coord) > 0.1) {
        lastHere.current = f.coord;
        setHere({ coord: f.coord, label: 'you', isGps: true });
      }
      if (first) {
        setSearchCenter(f.coord);
        setMapCenter(f.coord);
        flyTo(f.coord, filters.distanceMi, 700);
      } else if (followingRef.current) {
        mapRef.current?.animateCamera({ center: f.coord }, { duration: 600 });
      }
    },
    [filters.distanceMi, flyTo, setHere],
  );
  const loc = useLiveLocation(live, onFix);

  // Everyone opted in within the pool radius of the search center; filtering happens locally.
  // Reloads when you sign in/out or toggle demo people, so real people appear right away.
  const sessionId = app.session?.userId ?? '';
  const showDemo = app.showDemo;
  useEffect(() => {
    let alive = true;
    dataSource.listNearbyPeople(searchCenter, POOL_RADIUS_MI).then((ps) => {
      if (alive) setLoaded({ center: searchCenter, people: ps });
    });
    return () => { alive = false; };
  }, [searchCenter, sessionId, showDemo, refreshTick]);
  // Real members move and sign up, so refresh the map every 45 seconds while signed in.
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => setRefreshTick((n) => n + 1), 45_000);
    return () => clearInterval(t);
  }, [sessionId]);
  const loading = loaded?.center !== searchCenter;
  const pool = useMemo(() => loaded?.people ?? [], [loaded]);

  // Distances update live from your GPS when you're in range; otherwise from the search area.
  const me = loc.fix && distanceMi(loc.fix.coord, searchCenter) < POOL_RADIUS_MI ? loc.fix.coord : null;
  const origin = me ?? searchCenter;

  // In-person events (live + demo) inside your travel distance, only while the Events chip is on.
  useEffect(() => {
    if (!showEvents && !app.nearbyAlerts) return;
    let alive = true;
    dataSource.listEvents({ withDemo: true }).then((r) => alive && setAllEvents(r.events.filter((e) => e.end > Date.now()))).catch(() => {});
    return () => { alive = false; };
  }, [showEvents, app.nearbyAlerts]);
  const mapEvents = useMemo(
    () => sortMyFieldFirst(showEvents ? allEvents.filter((e) => !e.online && distanceMi(origin, e.coord) <= filters.distanceMi) : [], prefs.field),
    [showEvents, allEvents, origin, filters.distanceMi, prefs.field],
  );
  const fromLabel = me ? 'away' : `from ${areaName}`;
  const placeLabel = me ? (loc.place ?? 'Your location') : areaName;

  const people = useMemo(() => {
    return applyFilters(realOnly ? pool.filter((p) => !p.isDemo) : pool, filters, blocked)
      .map((p) => ({ ...p, distanceMi: distanceMi(origin, p.coord), strength: matchStrength(p, prefs) }))
      .sort((a, b) => Number(!!prefs.field && b.field === prefs.field) - Number(!!prefs.field && a.field === prefs.field) || matchScore(b, prefs) - matchScore(a, prefs) || a.distanceMi - b.distanceMi);
  }, [pool, filters, blocked, prefs, origin, realOnly]);
  const realCount = people.filter((p) => !p.isDemo).length;

  // "Someone is nearby" alerts: real members within 1 mile of your live position, while the map is open.
  const alertPool = useMemo(() => pool.filter((p) => !blocked.includes(p.id)), [pool, blocked]);
  const liveMe = live && loc.fix ? loc.fix.coord : null;
  useNearbyAlerts(app.nearbyAlerts, liveMe, alertPool, prefs.field, allEvents, prefs);
  const closeBy = liveMe ? peopleWithin(liveMe, alertPool, prefs.field).length : 0;
  const toggleAlerts = async () => {
    if (app.nearbyAlerts) return app.setNearbyAlerts(false);
    const ok = await enableNearbyAlerts();
    if (!ok) {
      Alert.alert('Notifications are off', 'Allow notifications for this app in Settings to get nearby alerts.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    app.setNearbyAlerts(true);
    Alert.alert('Nearby alerts on', `You'll get a notification when a Connected member in your field is within ${ALERT_RADIUS_MI} mile, or a same-field event is about to start nearby, while the map is open with live location on.`);
  };
  const shareCard =
    !hideShareCard && app.backendEnabled
      ? !app.session
        ? 'signin'
        : prefs.shareMode === 'public' || !prefs.discoverable
          ? 'hidden'
          : null
      : null;
  const selected = people.find((p) => p.id === selectedId);
  const doorVisible = useCallback((p: NearbyPerson) => !!p.door && doorActive(p.door) && canSeeDoor(p.door, p, prefs, profile), [prefs, profile]);

  const best = people.filter((p) => p.strength !== 'some');
  const doors = people.filter(doorVisible);
  const listed = tab === 'best' ? best : tab === 'doors' ? doors : people;
  const strongCount = people.filter((p) => p.strength === 'strong').length;

  // Nearby pins merge into numbered clusters (supercluster); the selected person always stays visible.
  const keep = useMemo(() => (selectedId ? [selectedId] : []), [selectedId]);
  const peopleClusters = useClusters(people, region, keep);
  const eventClusters = useClusters(mapEvents, region);
  const lonePeople = useMemo(() => new Set(peopleClusters.clusters.flatMap((c) => (c.kind === 'item' ? [c.item.id] : []))), [peopleClusters.clusters]);
  const zoomInto = (center: LatLng, z: number) => moveTo(center, Math.max(0.002, (360 / 2 ** z) * 1.05), 450);

  // Your network: lines from you (or the search area) to your best nearby matches.
  const lineTargets = useMemo(() => {
    const t = people.filter((p) => p.strength !== 'some' && lonePeople.has(p.id)).slice(0, MAX_LINES);
    if (selected && !t.some((p) => p.id === selected.id)) t.push(selected);
    return t;
  }, [people, selected, lonePeople]);

  // Custom markers re-render while they change, then stop tracking for smooth panning.
  const pinsKey = `${people.map((p) => p.id + p.strength + p.coord.latitude + p.coord.longitude).join(',')}|${selectedId ?? ''}|${showHotspots}|${hotspotId ?? ''}|${peopleClusters.clusters.map((c) => (c.kind === 'item' ? c.item.id : `c${c.id}:${c.count}`)).join(',')}|${eventClusters.clusters.map((c) => (c.kind === 'item' ? c.item.id : `c${c.id}:${c.count}`)).join(',')}`;
  const hotspot = HOTSPOTS.find((h) => h.id === hotspotId);
  const peopleIn = (h: Hotspot) => people.filter((p) => distanceMi(h.center, p.coord) <= h.radiusMi).length;
  const trackPins = settledPinsKey !== pinsKey;
  useEffect(() => {
    const t = setTimeout(() => setSettledPinsKey(pinsKey), 700);
    return () => clearTimeout(t);
  }, [pinsKey]);

  const peek = Math.max(PEEK_MIN, Math.round(height * 0.15));
  const snaps = useMemo(() => [peek, Math.round(height * 0.5), Math.round(Math.min(height * 0.9, height - insets.top - 8))], [peek, height, insets.top]);
  const snap = useCallback((i: number) => sheetRef.current?.snapToIndex(i), []);
  // The map buttons and hotspot key sit 12px above the sheet and fade out as it opens past half way.
  const railStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [height * 0.12, height * 0.34], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: sheetY.value - height - 12 }],
  }));
  const chipDims = useRef({ w: 0, c: 0, x: 0 });
  const updateChipEdge = () => {
    const { w, c, x } = chipDims.current;
    const next = { start: x <= 4, end: c - w - x > 4 };
    setChipEdge((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  };
  const moved = !following && distanceMi(mapCenter, searchCenter) > 0.6;
  const fCount = activeFilterCount(filters);
  const nearCharlotte = distanceMi(searchCenter, CHARLOTTE_CENTER) < 40;

  const selectHotspot = (h: Hotspot) => {
    setSelectedId(null);
    setHotspotId(h.id);
    snap(1);
    setFollowing(false);
    const d = Math.max(0.04, (h.radiusMi / 69) * 3.2);
    moveTo({ latitude: h.center.latitude - (look === 'network' ? d * 0.22 : 0), longitude: h.center.longitude }, d, 450);
  };

  const select = (p: NearbyPerson) => {
    setHotspotId(null);
    setSelectedId(p.id);
    snap(1);
    setFollowing(false);
    const d = regionRef.current.latitudeDelta;
    // Keep the person above the half-open sheet.
    moveTo({ latitude: p.coord.latitude - (look === 'network' ? d * 0.22 : 0), longitude: p.coord.longitude }, look === 'network' ? d : Math.min(d, 0.03), 450);
  };

  const goToArea = (c: LatLng, name: string) => {
    setHere({ coord: c, label: name, isGps: false });
    setSearchCenter(c);
    setMapCenter(c);
    setAreaName(name);
    setSelectedId(null);
    setFollowing(false);
    flyTo(c, filters.distanceMi);
  };

  const recenter = async () => {
    const f = loc.fix ?? (await loc.request());
    if (!f) return setModal('area');
    setFollowing(true);
    setSelectedId(null);
    setSearchCenter(f.coord);
    setMapCenter(f.coord);
    flyTo(f.coord, Math.min(filters.distanceMi, 3), 500);
  };

  const closeCard = () => {
    setSelectedId(null);
    setHotspotId(null);
    snap(0);
  };
  const openProfile = (p: NearbyPerson) => router.push({ pathname: '/person/[id]', params: { id: p.id, d: String(p.distanceMi), from: fromLabel } });

  const wash = [
    { latitude: origin.latitude + 3, longitude: origin.longitude - 3 },
    { latitude: origin.latitude + 3, longitude: origin.longitude + 3 },
    { latitude: origin.latitude - 3, longitude: origin.longitude + 3 },
    { latitude: origin.latitude - 3, longitude: origin.longitude - 3 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F1F8' }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapType={
          look === 'satellite'
            ? Platform.OS === 'ios' ? 'hybridFlyover' : 'hybrid'
            : Platform.OS === 'ios' ? (look === 'city3d' ? 'standard' : 'mutedStandard') : 'standard'
        }
        customMapStyle={Platform.OS === 'android' && look !== 'satellite' ? ANDROID_MAP_STYLE : undefined}
        userInterfaceStyle="light"
        showsPointsOfInterests={false}
        showsBuildings={look !== 'network'}
        showsTraffic={false}
        showsIndoors={false}
        rotateEnabled={look !== 'network'}
        pitchEnabled={look !== 'network'}
        toolbarEnabled={false}
        showsCompass={look !== 'network'}
        mapPadding={{ top: insets.top + 110, right: 0, bottom: peek, left: 0 }}
        onPanDrag={() => { if (following) setFollowing(false); }}
        onRegionChangeComplete={(r) => {
          regionRef.current = r;
          setRegion({ latitude: r.latitude, longitude: r.longitude, latitudeDelta: r.latitudeDelta, longitudeDelta: r.longitudeDelta });
          setMapCenter({ latitude: r.latitude, longitude: r.longitude });
        }}
        onPress={(e) => {
          const action = (e.nativeEvent as { action?: string }).action;
          if (action !== 'marker-press' && (selectedId || hotspotId)) closeCard();
        }}
        accessibilityLabel="Map of your network nearby"
      >
        {look === 'network' ? <Polygon coordinates={wash} fillColor={WASH} strokeWidth={0} strokeColor="transparent" zIndex={0} tappable={false} /> : null}
        <Circle center={searchCenter} radius={filters.distanceMi * 1609.34} strokeColor="rgba(91,53,201,0.22)" fillColor="rgba(91,53,201,0.03)" strokeWidth={1} zIndex={1} />
        {eventClusters.clusters.map((c) =>
          c.kind === 'cluster' ? (
            <Marker
              key={`evc-${c.id}`}
              coordinate={c.coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={trackPins}
              zIndex={9}
              onPress={() => zoomInto(c.coord, eventClusters.expansionZoom(c.id))}
              accessibilityLabel={`${c.count} events. Zoom in`}
            >
              <ClusterPin count={c.count} tone="events" />
            </Marker>
          ) : (
            <Marker
              key={`ev-${c.item.id}`}
              coordinate={c.item.coord}
              anchor={{ x: 0.5, y: 0.9 }}
              tracksViewChanges={trackPins}
              zIndex={prefs.field && c.item.field === prefs.field ? 9 : 8}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: c.item.id } })}
              accessibilityLabel={`${c.item.title}, event at ${c.item.venue}`}
            >
              <EventPin category={c.item.category} />
            </Marker>
          ),
        )}
        {showHotspots
          ? HOTSPOTS.map((h) => {
              const lv = HOTSPOT_LEVELS[h.level];
              const on = h.id === hotspotId;
              return (
                <Circle
                  key={`hz-${h.id}`}
                  center={h.center}
                  radius={h.radiusMi * 1609.34}
                  fillColor={lv.fill}
                  strokeColor={lv.stroke}
                  strokeWidth={on ? 2.5 : 1}
                  zIndex={1}
                />
              );
            })
          : null}
        {showHotspots
          ? HOTSPOTS.map((h) => {
              const lv = HOTSPOT_LEVELS[h.level];
              const on = h.id === hotspotId;
              return (
                <Marker
                  key={`hl-${h.id}`}
                  coordinate={h.center}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={trackPins}
                  zIndex={5}
                  onPress={() => selectHotspot(h)}
                  accessibilityLabel={`${h.name}, ${lv.label}: ${h.kind}`}
                >
                  <View collapsable={false} style={[styles.hotLabel, on && { borderColor: lv.color }]}>
                    <View style={[styles.hotDot, { backgroundColor: lv.color }]} />
                    <Text style={styles.hotText} numberOfLines={1}>{h.name}</Text>
                  </View>
                </Marker>
              );
            })
          : null}
        {showLines
          ? lineTargets.map((p) => {
              const on = p.id === selectedId;
              return (
                <Polyline
                  key={`l-${p.id}`}
                  coordinates={[origin, p.coord]}
                  strokeColor={on ? 'rgba(91,53,201,0.9)' : p.strength === 'strong' ? 'rgba(91,53,201,0.5)' : 'rgba(91,53,201,0.3)'}
                  strokeWidth={on ? 2.5 : 1.5}
                  lineDashPattern={on ? undefined : [2, 6]}
                  zIndex={2}
                />
              );
            })
          : null}
        {loc.fix && loc.fix.accuracyM && loc.fix.accuracyM < 250 ? (
          <Circle center={loc.fix.coord} radius={loc.fix.accuracyM} strokeColor="rgba(91,53,201,0.2)" fillColor="rgba(91,53,201,0.08)" strokeWidth={1} zIndex={3} />
        ) : null}
        {peopleClusters.clusters.map((c) => {
          if (c.kind === 'cluster') {
            return (
              <Marker
                key={`pc-${c.id}`}
                coordinate={c.coord}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={trackPins}
                zIndex={13}
                onPress={() => zoomInto(c.coord, peopleClusters.expansionZoom(c.id))}
                accessibilityLabel={`${c.count} people. Zoom in`}
              >
                <ClusterPin count={c.count} />
              </Marker>
            );
          }
          const p = c.item;
          const on = p.id === selectedId;
          return (
            <Marker
              key={p.id}
              coordinate={p.coord}
              anchor={nodeAnchor(p.strength, on)}
              tracksViewChanges={trackPins}
              zIndex={on ? 30 : p.strength === 'strong' ? 12 : p.strength === 'good' ? 11 : 10}
              onPress={() => select(p)}
              accessibilityLabel={`${p.name}, ${p.role}, ${p.strength === 'strong' ? 'strong match, ' : ''}${approxDistance(p.distanceMi)} ${fromLabel}`}
            >
              <NodePin name={p.name} role={p.role} uri={p.photo} strength={p.strength} selected={on} door={doorVisible(p)} real={!p.isDemo} />
            </Marker>
          );
        })}
        {loc.fix ? (
          <Marker coordinate={loc.fix.coord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={trackPins} zIndex={40} accessibilityLabel="You are here">
            <YouNode live={loc.watching} />
          </Marker>
        ) : !loading ? (
          <Marker coordinate={searchCenter} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={40} accessibilityLabel={`Search center, ${areaName}`}>
            <View style={styles.centerMark} />
          </Marker>
        ) : null}
      </MapView>

      {/* Header: brand, short place, search, filters. Counts live in the sheet. */}
      <View style={[styles.top, { paddingTop: insets.top + S.xs }]} pointerEvents="box-none">
        <View style={[styles.header, shadow]}>
          <Pressable onPress={() => setModal('area')} accessibilityRole="button" accessibilityLabel={`Area: ${placeLabel}. Change area`} style={styles.headerMain} hitSlop={4}>
            <View style={styles.brand}>
              <Text style={styles.brandWord}>Connected</Text>
              <View style={styles.brandDot} />
            </View>
            <View style={styles.headerDivider} />
            <View style={styles.placeRow}>
              {me && loc.watching ? <View style={styles.locDot} /> : null}
              <Text style={styles.place} numberOfLines={1}>{shortPlace(placeLabel)}</Text>
              <Ionicons name="chevron-down" size={14} color={C.ink3} />
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search people" style={({ pressed }) => [styles.filterBtn, pressed && { backgroundColor: C.bg2 }]}>
            <Ionicons name="search" size={20} color={C.ink} />
          </Pressable>
          <Pressable onPress={() => setModal('filters')} accessibilityRole="button" accessibilityLabel={`Filters${fCount ? `, ${fCount} on` : ''}`} style={({ pressed }) => [styles.filterBtn, pressed && { backgroundColor: C.bg2 }]}>
            <Ionicons name="options-outline" size={20} color={C.ink} />
            {fCount ? <View style={styles.count}><Text style={styles.countText}>{fCount}</Text></View> : null}
          </Pressable>
        </View>

        {/* One row of four quick filters. Everything else (goals, fields, interests) is in Filters. */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quick}
            scrollEventThrottle={32}
            onLayout={(e) => { chipDims.current.w = e.nativeEvent.layout.width; updateChipEdge(); }}
            onContentSizeChange={(w) => { chipDims.current.c = w; updateChipEdge(); }}
            onScroll={(e) => { chipDims.current.x = e.nativeEvent.contentOffset.x; updateChipEdge(); }}
          >
            {prefs.field ? (
              <Chip
                label="My field"
                selected={filters.fields.length === 1 && filters.fields[0] === prefs.field}
                onPress={() => setFilters((f) => ({ ...f, fields: f.fields.length === 1 && f.fields[0] === prefs.field ? [] : [prefs.field!] }))}
              />
            ) : null}
            <Chip label="Events" selected={showEvents} onPress={() => setShowEvents((v) => !v)} />
            <Chip label="Real people" selected={realOnly} onPress={() => setRealOnly((v) => !v)} />
            <Chip label="Free today" selected={filters.availability === 'today'} onPress={() => setFilters((f) => ({ ...f, availability: f.availability === 'today' ? 'any' : 'today' }))} />
          </ScrollView>
          {!chipEdge.start ? (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.fade, { left: 0 }]} pointerEvents="none">
              <LinearGradient colors={['rgba(243,241,248,0.95)', 'rgba(243,241,248,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
          {chipEdge.end ? (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.fade, { right: 0 }]} pointerEvents="none">
              <LinearGradient colors={['rgba(243,241,248,0)', 'rgba(243,241,248,0.95)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
        </View>

        {/* A single status slot under the chips, so nothing stacks over the map. */}
        {moved ? (
          <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)} style={{ alignSelf: 'center' }}>
            <Pressable
              onPress={() => { setSearchCenter(mapCenter); setAreaName('this area'); setSelectedId(null); if (!loc.fix) setHere({ coord: mapCenter, label: 'this area', isGps: false }); }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pill, shadow, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="refresh" size={15} color={C.accent} />
              <Text style={styles.pillAccent}>Search this area</Text>
            </Pressable>
          </Animated.View>
        ) : shareCard ? (
          <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)} style={[styles.pill, shadow, styles.sharePill]}>
            <Pressable
              onPress={() => (shareCard === 'signin' ? router.push('/auth') : app.setPrefs({ shareMode: 'area', discoverable: true }))}
              accessibilityRole="button"
              accessibilityLabel={shareCard === 'signin' ? 'Sign in to appear on the map' : 'Show my rough area on the map'}
              style={styles.shareMain}
            >
              <Ionicons name={shareCard === 'signin' ? 'person-add-outline' : 'eye-outline'} size={15} color={C.accent} />
              <Text style={styles.pillAccent} numberOfLines={1}>{shareCard === 'signin' ? 'Sign in to appear on the map' : 'Show me on the map'}</Text>
            </Pressable>
            <Pressable onPress={() => setHideShareCard(true)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} style={styles.shareClose}>
              <Ionicons name="close" size={16} color={C.ink3} />
            </Pressable>
          </Animated.View>
        ) : app.nearbyAlerts && closeBy ? (
          <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)} style={[styles.pill, shadow, { alignSelf: 'center' }]} accessibilityLiveRegion="polite">
            <View style={styles.nearDot} />
            <Text style={styles.pillText}>{closeBy} same-field member{closeBy === 1 ? '' : 's'} within {ALERT_RADIUS_MI} mile</Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Two map buttons, plus the assistant. They ride just above the sheet and fade out when it opens. */}
      <Animated.View style={[styles.rail, railStyle]} pointerEvents="box-none">
        <Pressable onPress={() => router.push('/assistant')} accessibilityRole="button" accessibilityLabel="Ask the Connected assistant" style={({ pressed }) => [styles.askBtn, shadow, pressed && { opacity: 0.85 }]}>
          <Ionicons name="sparkles" size={17} color={C.white} />
        </Pressable>
        <View style={[styles.controls, shadow]}>
          <ControlButton icon={following ? 'locate' : 'locate-outline'} active={following} label={following ? 'Following your location' : 'Center on my location'} onPress={recenter} />
          <View style={styles.controlDivider} />
          <ControlButton icon="layers-outline" active={showLayers || look !== 'network'} label="Layers" onPress={() => setShowLayers(true)} />
        </View>
      </Animated.View>

      {/* Hotspot key: only while hotspots are on; compact, bottom-left above the sheet. */}
      {showHotspots ? (
        <Animated.View style={[styles.key, shadow, railStyle]} pointerEvents="none">
          {(['high', 'medium', 'emerging'] as const).map((lvl) => (
            <View key={lvl} style={styles.keyRow}>
              <View style={[styles.keySwatch, { backgroundColor: HOTSPOT_LEVELS[lvl].fill, borderColor: HOTSPOT_LEVELS[lvl].color }]} />
              <Text style={styles.keyText}>{HOTSPOT_LEVELS[lvl].label}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {height ? (
        <GorhomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snaps}
          animatedPosition={sheetY}
          enableDynamicSizing={false}
          onChange={setSheetIndex}
          backgroundStyle={styles.sheetBg}
          handleIndicatorStyle={styles.handle}
          handleStyle={styles.handleHit}
        >
          <BottomSheetView style={{ flex: 1 }}>
            {selected || hotspot ? (
              <View style={styles.sheetHead}>
                <Pressable onPress={closeCard} accessibilityRole="button" style={styles.backRow} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color={C.accent} />
                  <Text style={[T.label, { color: C.accent }]}>Your network</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.sheetHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.sheetTitle}>Your network nearby</Text>
                  <Text style={styles.sheetMeta}>Within {filters.distanceMi} mi</Text>
                </View>
                <Text style={styles.sheetCounts} numberOfLines={1}>
                  {loading ? 'Loading your network…' : `${strongCount} strong · ${realCount} real member${realCount === 1 ? '' : 's'}${people.length > realCount ? ` · ${people.length - realCount} demo` : ''}`}
                </Text>
                <View style={styles.tabs} accessibilityRole="tablist">
                  {([['best', 'Best matches', best.length], ['doors', 'Open Doors', doors.length], ['all', 'Everyone', people.length]] as const).map(([id, label, n]) => {
                    const on = tab === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => { setTab(id); if (sheetIndex === 0) snap(1); }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        style={[styles.tab, on && styles.tabOn]}
                      >
                        <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
                        <Text style={[styles.tabCount, on && { color: C.accent }]}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {loc.perm === 'undetermined' || loc.perm === 'denied' ? (
                  <View style={styles.permRow}>
                    <Ionicons name="locate-outline" size={18} color={C.accent} />
                    <Text style={[T.small, { flex: 1, color: C.ink2 }]}>
                      {loc.perm === 'denied' ? 'Location is off. Distances are from the area you picked.' : 'Turn on location for live distances. Only you see it.'}
                    </Text>
                    {loc.perm === 'undetermined'
                      ? <Button label="Turn on" small onPress={recenter} />
                      : <Button label="Settings" small variant="secondary" onPress={() => Linking.openSettings()} />}
                  </View>
                ) : null}
              </View>
            )}
            <BottomSheetScrollView key={selectedId ?? hotspotId ?? tab} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {selected ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm }}>
              <PersonCard
                embedded
                person={selected}
                distanceFromLabel={fromLabel}
                travel={travelTime(selected.distanceMi)}
                prefs={prefs}
                profile={profile}
                onClose={closeCard}
                onOpen={() => openProfile(selected)}
              />
            </View>
          ) : hotspot ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm, gap: S.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                <View style={[styles.hotIcon, { backgroundColor: HOTSPOT_LEVELS[hotspot.level].fill, borderColor: HOTSPOT_LEVELS[hotspot.level].color }]}>
                  <Ionicons name="flame" size={20} color={HOTSPOT_LEVELS[hotspot.level].color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hotTitle}>{hotspot.name}</Text>
                  <Text style={[T.small, { color: HOTSPOT_LEVELS[hotspot.level].color, fontWeight: '700' }]}>{HOTSPOT_LEVELS[hotspot.level].label} · {hotspot.kind}</Text>
                </View>
              </View>
              <Text style={[T.body, { fontSize: 15, lineHeight: 22 }]}>{hotspot.why}</Text>
              <View style={styles.hotFacts}>
                <View style={styles.hotFact}>
                  <Text style={styles.hotFactNum}>{peopleIn(hotspot)}</Text>
                  <Text style={styles.hotFactLabel}>people here in your network</Text>
                </View>
                <View style={styles.hotFactDivider} />
                <View style={styles.hotFact}>
                  <Text style={styles.hotFactNum}>{approxDistance(distanceMi(origin, hotspot.center)).replace('about ', '')}</Text>
                  <Text style={styles.hotFactLabel}>{me ? 'from you' : `from ${areaName}`}</Text>
                </View>
              </View>
              <Text style={T.small}>Busiest: {hotspot.peak}</Text>
              <Button
                label={`See people in ${hotspot.name}`}
                icon="people-outline"
                onPress={() => {
                  setHotspotId(null);
                  setTab('all');
                  goToArea(hotspot.center, hotspot.name);
                  snap(1);
                }}
              />
              <Text style={T.small}>Hub levels are demo estimates of where offices, campuses and meetups cluster. The people count comes from opted-in profiles.</Text>
            </View>
          ) : listed.length ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.xs }}>
              {listed.map((p) => {
                const door = doorVisible(p);
                const tags = matchPoints(p, prefs).slice(0, 2);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => select(p)}
                    onLongPress={() => openProfile(p)}
                    accessibilityRole="button"
                    accessibilityHint="Shows them on the map. Long press to open their profile."
                    style={({ pressed }) => [styles.contact, pressed && { backgroundColor: C.bg2 }]}
                  >
                    <Avatar name={p.name} uri={p.photo} size={46} ring={p.strength === 'strong'} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.contactName} numberOfLines={1}>{p.name}</Text>
                        {p.strength === 'strong' ? <Text style={styles.strong}>Strong match</Text> : null}
                      </View>
                      <Text style={styles.contactRole} numberOfLines={1}>{p.role} · {p.org}</Text>
                      {tags.length ? (
                        <View style={styles.tagRow}>
                          {tags.map((t) => <Text key={t.text} style={styles.tag} numberOfLines={1}>{t.text}</Text>)}
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.contactRight}>
                      <Text style={styles.dist}>{p.distanceMi < 10 ? p.distanceMi.toFixed(1) : Math.round(p.distanceMi)} mi</Text>
                      <Text style={styles.travel}>{travelTime(p.distanceMi)}</Text>
                      {door ? <Text style={styles.doorText}>Open Door</Text> : isFreeToday(p) ? <Text style={styles.freeText}>Free today</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              <Text style={[T.small, { textAlign: 'center', paddingVertical: S.md }]}>Shown at their neighborhood, never a live location · demo profiles are marked</Text>
            </View>
          ) : loading ? null : (
            <View style={styles.empty}>
              <Ionicons name={tab === 'doors' ? 'enter-outline' : 'git-network-outline'} size={22} color={C.ink3} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.emptyTitle}>
                  {tab === 'doors' ? 'No Open Doors right now' : tab === 'best' && people.length ? 'No strong matches in range' : nearCharlotte ? 'No one matches here yet' : 'No one nearby yet'}
                </Text>
                <Text style={T.small}>
                  {tab === 'doors' ? 'They appear when someone posts one for people like you.' : nearCharlotte ? 'Try a wider distance or fewer filters.' : 'This demo only has profiles in Charlotte, NC.'}
                </Text>
              </View>
              {tab !== 'all' && people.length ? (
                <Button label="See everyone" small variant="secondary" onPress={() => setTab('all')} />
              ) : nearCharlotte ? (
                <Button label="Clear" small variant="secondary" onPress={() => setFilters(defaultFilters(POOL_RADIUS_MI))} />
              ) : (
                <Button label="Charlotte" small onPress={() => goToArea(CHARLOTTE_CENTER, 'Charlotte')} />
              )}
            </View>
          )}
            </BottomSheetScrollView>
          </BottomSheetView>
        </GorhomSheet>
      ) : null}

      <LayersSheet
        visible={showLayers}
        onClose={() => setShowLayers(false)}
        looks={LOOKS}
        look={look}
        onLook={(id) => changeLook(id as MapLook)}
        toggles={[
          { id: 'hot', label: 'Hotspots', hint: 'Where your field gathers', icon: 'flame-outline', value: showHotspots, onChange: (v) => { setShowHotspots(v); setHotspotId(null); } },
          { id: 'lines', label: 'Connection lines', hint: 'Lines to your best matches', icon: 'git-network-outline', value: showLines, onChange: setShowLines },
          { id: 'events', label: 'Events', hint: 'In-person events nearby', icon: 'calendar-outline', value: showEvents, onChange: setShowEvents },
          { id: 'alerts', label: 'Nearby alerts', hint: 'Same-field people within 1 mile', icon: 'notifications-outline', value: app.nearbyAlerts, onChange: () => { setShowLayers(false); void toggleAlerts(); } },
          ...(loc.perm === 'granted' ? [{ id: 'live', label: 'Live location', hint: 'Keeps your position current', icon: 'location-outline' as const, value: live, onChange: setLive }] : []),
        ]}
      />

      <FilterSheet
        visible={modal === 'filters'}
        value={filters}
        resultCount={applyFilters(pool, filters, blocked).length}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters(prefs.travelMi))}
        onClose={() => {
          setModal(null);
          flyTo(searchCenter, filters.distanceMi, 400);
        }}
      />

      <Modal visible={modal === 'area'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <Pressable style={styles.scrim} onPress={() => setModal(null)} accessibilityLabel="Close">
          <Pressable style={[styles.areaBox, shadow]} onPress={() => {}}>
            <Text style={T.h2}>Where should we look?</Text>
            <View style={{ gap: 2 }}>
              <Pressable onPress={() => { setModal(null); recenter(); }} style={({ pressed }) => [styles.areaRow, pressed && { backgroundColor: C.bg2 }]} accessibilityRole="button">
                <View style={[styles.areaIcon, { backgroundColor: C.accent }]}><Ionicons name="locate" size={16} color={C.white} /></View>
                <Text style={[T.body, { fontWeight: '600' }]}>Near me</Text>
              </Pressable>
              {AREAS.map((a) => (
                <Pressable key={a.id} onPress={() => { setModal(null); goToArea(a.center, a.name); }} style={({ pressed }) => [styles.areaRow, pressed && { backgroundColor: C.bg2 }]} accessibilityRole="button">
                  <View style={styles.areaIcon}><Ionicons name="business-outline" size={16} color={C.accent} /></View>
                  <Text style={T.body}>{a.name}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ControlButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.control, pressed && { backgroundColor: C.bg2 }]}>
      <Ionicons name={icon} size={20} color={active ? C.accent : C.ink2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: S.sm },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: S.md, backgroundColor: C.bg, borderRadius: 16, paddingLeft: S.md, paddingRight: 6, minHeight: 52, borderWidth: 1, borderColor: C.line },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 48 },
  brand: { flexDirection: 'row', alignItems: 'flex-end' },
  brandWord: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  brandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginLeft: 1.5, marginBottom: 4 },
  headerDivider: { width: 1, height: 24, backgroundColor: C.line },
  place: { fontSize: 15, fontWeight: '700', color: C.ink, flexShrink: 1 },
  locDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  filterBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countText: { color: C.white, fontSize: 10, fontWeight: '800' },
  quick: { gap: S.sm, paddingHorizontal: S.md },
  nearDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1FB860' },
  askBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: S.md, bottom: 0, alignItems: 'center', gap: S.sm },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 28 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bg, paddingHorizontal: S.md, minHeight: 36, borderRadius: R.pill, borderWidth: 1, borderColor: C.line },
  pillAccent: { color: C.accent, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  pillText: { fontSize: 13, fontWeight: '700', color: C.ink },
  sharePill: { alignSelf: 'flex-start', marginLeft: S.md, paddingRight: 4, maxWidth: '88%' },
  shareMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 36 },
  shareClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  placeRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetBg: { backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  handle: { width: 40, height: 5, backgroundColor: C.line2 },
  handleHit: { paddingTop: 10, paddingBottom: 6 },
  sheetCounts: { fontSize: 13, color: C.ink3, fontWeight: '500', marginTop: -S.sm },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  key: { position: 'absolute', left: S.md, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: R.pill, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, minHeight: 32 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  keySwatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  keyText: { fontSize: 12, color: C.ink2, fontWeight: '600' },
  hotLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 8, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 7, paddingVertical: 3, shadowColor: '#2A1E5C', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  hotDot: { width: 7, height: 7, borderRadius: 4 },
  hotText: { fontSize: 11, fontWeight: '700', color: C.ink },
  hotIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hotTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  hotFacts: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: S.md },
  hotFact: { flex: 1, alignItems: 'center', gap: 2 },
  hotFactNum: { fontSize: 20, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  hotFactLabel: { fontSize: 12, color: C.ink3, textAlign: 'center' },
  hotFactDivider: { width: 1, backgroundColor: C.line },
  controls: { backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  control: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { height: 1, backgroundColor: C.line, marginHorizontal: 8 },
  centerMark: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: C.white },
  sheetHead: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.sm },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  sheetMeta: { fontSize: 13, color: C.ink3, fontWeight: '500' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  tabs: { flexDirection: 'row', backgroundColor: C.bg2, borderRadius: 12, padding: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 36, borderRadius: 9 },
  tabOn: { backgroundColor: C.bg, shadowColor: '#2A1E5C', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: C.ink3 },
  tabTextOn: { color: C.ink },
  tabCount: { fontSize: 12, fontWeight: '700', color: C.ink3, fontVariant: ['tabular-nums'] },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.accentSoft, borderRadius: 12, padding: S.sm, paddingLeft: S.md },
  contact: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.line, borderRadius: 4 },
  contactName: { fontSize: 16, fontWeight: '700', color: C.ink, flexShrink: 1 },
  contactRole: { fontSize: 13, color: C.ink2 },
  strong: { fontSize: 11, fontWeight: '700', color: C.accent, backgroundColor: C.accentSoft, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' },
  tag: { fontSize: 11, color: C.ink2, borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, maxWidth: 150 },
  contactRight: { alignItems: 'flex-end', gap: 2, minWidth: 64 },
  dist: { fontSize: 15, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  travel: { fontSize: 11, color: C.ink3 },
  doorText: { fontSize: 11, fontWeight: '700', color: C.blue },
  freeText: { fontSize: 11, fontWeight: '600', color: C.ok },
  empty: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md },
  scrim: { flex: 1, backgroundColor: 'rgba(27,23,38,0.35)', justifyContent: 'center', padding: S.lg },
  areaBox: { backgroundColor: C.bg, borderRadius: 20, padding: S.lg, gap: S.md },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 50, paddingHorizontal: S.sm, borderRadius: R.md },
  areaIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
