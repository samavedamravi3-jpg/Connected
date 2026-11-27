import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import GorhomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Extrapolation, FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutUp, SlideInDown, SlideOutDown, ZoomIn, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import MapView, { Circle, Marker, Polygon, Polyline, type MapStyleElement, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FilterSheet } from '@/components/FilterSheet';
import { NearbyRecCard } from '@/components/NearbyRecCard';
import { LayersSheet, type AlertsPanel } from '@/components/LayersSheet';
import { ClusterPin, EventPin, PersonMarker, YouNode } from '@/components/MapPins';
import { MemberLock } from '@/components/MemberLock';
import { PersonCard } from '@/components/PersonCard';
import { TextTabs } from '@/components/TextTabs';
import { Avatar, Button, Chip } from '@/components/ui';
import { HOTSPOTS, HOTSPOT_LEVELS, type Hotspot } from '@/data/hotspots';
import { AREAS, CHARLOTTE_CENTER, GOALS, fieldLabel } from '@/data/options';
import { clearSimulatedMatches, dataSource, simulateNearbyMatch } from '@/data/source';
import type { CommunityEvent, LatLng, NearbyPerson } from '@/data/types';
import { activeFilterCount, defaultFilters, isFreeToday, withinRange, type Filters } from '@/lib/filters';
import { sortMyFieldFirst } from '@/lib/fieldClassifier';
import { useClusters, type MapView as MapRegion } from '@/lib/cluster';
import { approxDistance, deltaForMiles, distanceMi, travelTime } from '@/lib/geo';
import { canSeeDoor, doorActive, matchPoints, matchScore, matchStrength } from '@/lib/match';
import { notificationState, notifyRec, turnOnNearbyAlerts, useEventAlerts, useNearbyRecommendations, type NotifState } from '@/lib/nearbyAlerts';
import { muteAlertsFor, pausedReason, sharedLabels, type NearbyRec } from '@/lib/nearbyPolicy';
import { ASK_H, CONTROLS_H, railFit } from '@/lib/mapRail';
import { radarTopics, type RadarTopic } from '@/lib/radar';
import { useLiveLocation, type Fix } from '@/lib/useLiveLocation';
import { useApp } from '@/state/AppState';
import { C, F, R, S, T, alpha, shadow } from '@/theme';
import { warn } from '@/lib/log';

/**
 * Connected. map style: a calm, cool-neutral city with white streets, so purple network nodes and
 * connection lines read clearly. Fully applied on Android (Google Maps). Apple Maps on iOS can't be
 * recolored, so a soft neutral wash (the Polygon below) gives it the same feel there.
 * Map-only cartography tints (park, water, label greys) stay local; they are not UI tokens.
 */
const MAP_BG = '#F0EFF3';
const MAP_LABEL = '#8A8794';
const ANDROID_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: MAP_BG }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#686570' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: C.bg }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: MAP_LABEL }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#DFE8E0' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: C.white }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E1DEE7' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: MAP_LABEL }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E9E7EE' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D6D2DE' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D3DDE6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: MAP_LABEL }] },
];
const WASH = alpha(C.bg, Platform.OS === 'ios' ? 0.42 : 0.12);
const ACCENT = (a: number) => alpha(C.accent, a); // map overlays
const POOL_RADIUS_MI = 25;
const MAX_LINES = 6;
const PEEK_MIN = 144;
/** Gap between the sheet's top edge and the floating rail / hub key. */
const LIFT = 12;

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
  const { prefs, profile, setHere } = app;
  const blocked = useMemo(() => [...app.blocked, ...app.muted], [app.blocked, app.muted]);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [initialRegion] = useState(() => regionFor(CHARLOTTE_CENTER, prefs.travelMi));
  const regionRef = useRef<Region>(initialRegion);
  const followingRef = useRef(false);
  const lastHere = useRef<LatLng | null>(null);

  const [height, setHeight] = useState(0);
  const [topH, setTopH] = useState(0);
  const [keyH, setKeyH] = useState(0);
  const [live, setLive] = useState(true);
  const [following, setFollowing] = useState(false);
  const [showLines, setShowLines] = useState(false);
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
  // Conversation Radar: topics people nearby are open to talking about.
  const [radarOn, setRadarOn] = useState(false);
  const [radarTopic, setRadarTopic] = useState<RadarTopic | null>(null);

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
  const loadedPool = useMemo(() => loaded?.people ?? [], [loaded]);

  // Distances update live from your GPS when you're in range; otherwise from the search area.
  const me = loc.fix && distanceMi(loc.fix.coord, searchCenter) < POOL_RADIUS_MI ? loc.fix.coord : null;
  const origin = me ?? searchCenter;

  // DEMO: "Simulate a nearby match" puts one same-field demo person 0.2 mi from you. Never persisted.
  const [sim, setSim] = useState<NearbyPerson | null>(null);
  useEffect(() => () => clearSimulatedMatches(), []);
  const pool = useMemo(() => (sim ? [sim, ...loadedPool.filter((p) => p.id !== sim.id)] : loadedPool), [loadedPool, sim]);

  // In-person events (live + demo) inside your travel distance, only while the Events chip is on.
  useEffect(() => {
    if (!showEvents && !app.nearbyAlerts) return;
    let alive = true;
    dataSource.listEvents({ withDemo: true }).then((r) => alive && setAllEvents(r.events.filter((e) => e.end > Date.now()))).catch(() => {});
    return () => { alive = false; };
  }, [showEvents, app.nearbyAlerts]);
  const { eventHidden } = app;
  const locked = app.memberLocked;
  // Live events are a real-member area; demo events stay available to everyone.
  const visibleEvents = useMemo(() => allEvents.filter((e) => !eventHidden(e) && (e.isDemo || !locked)), [allEvents, eventHidden, locked]);
  const mapEvents = useMemo(
    () => sortMyFieldFirst(showEvents ? visibleEvents.filter((e) => !e.online && distanceMi(origin, e.coord) <= filters.distanceMi) : [], prefs.field),
    [showEvents, visibleEvents, origin, filters.distanceMi, prefs.field],
  );
  const fromLabel = me ? 'away' : `from ${areaName}`;
  const placeLabel = me ? (loc.place ?? 'Your location') : areaName;

  const people = useMemo(() => {
    // Measure from the same origin the list shows (your live position, else the search area) BEFORE filtering,
    // so "Within N mi" always matches the distances on screen.
    return withinRange(realOnly ? pool.filter((p) => !p.isDemo) : pool, origin, filters, blocked)
      .map((p) => ({ ...p, strength: matchStrength(p, prefs) }))
      .sort((a, b) => Number(!!prefs.field && b.field === prefs.field) - Number(!!prefs.field && a.field === prefs.field) || matchScore(b, prefs) - matchScore(a, prefs) || a.distanceMi - b.distanceMi);
  }, [pool, filters, blocked, prefs, origin, realOnly]);
  const realCount = people.filter((p) => !p.isDemo).length;
  const topics = useMemo(() => (radarOn ? radarTopics(people) : []), [radarOn, people]);

  // Nearby recommendations ("You should connect"): real members the server says you share something with, within
  // YOUR alert radius of YOUR saved coarse area, only while this map is open with live location on. The map's search
  // distance and panned centre are never used for this.
  const liveMe = live && loc.fix ? loc.fix.coord : null;
  const mapOpen = loc.watching;
  const discovering = prefs.discoverable && prefs.shareMode === 'area';
  const paused = pausedReason({
    alertsOn: app.nearbyAlerts, signedIn: !!app.session, realMember: !app.memberLocked && app.idStatus === 'verified', discoverable: prefs.discoverable,
    sharingArea: prefs.shareMode === 'area', fieldSet: !!prefs.field, locationGranted: loc.perm === 'granted', mapLive: mapOpen,
  });
  const recs = useNearbyRecommendations(!paused, liveMe, app.session?.userId, discovering, app.nearbyCooldownH);
  useEventAlerts(app.nearbyAlerts, liveMe, prefs.field, visibleEvents);
  // A recommendation about someone you blocked or muted since is never shown.
  const realCard = recs.rec && !blocked.includes(recs.rec.id) ? recs.rec : null;

  // DEMO: a simulated card about the demo person. Never from the server, never recorded, never a real person.
  const [demoRec, setDemoRec] = useState<NearbyRec | null>(null);
  const card = demoRec ?? realCard;
  const closeBy = paused ? (sim ? 1 : 0) : recs.count + (sim ? 1 : 0);

  const [notifPerm, setNotifPerm] = useState<NotifState>('undetermined');
  useEffect(() => {
    if (showLayers) notificationState().then(setNotifPerm);
  }, [showLayers]);
  const toggleSim = async (on: boolean) => {
    if (!on) {
      clearSimulatedMatches();
      setSim(null);
      setDemoRec(null);
      return;
    }
    if (!prefs.field) return Alert.alert('Set your field first', 'Recommendations are same-field only. Pick the field you want to grow in under Profile > Preferences, then try again.');
    const at = liveMe ?? origin;
    const person = simulateNearbyMatch(prefs.field, at, 0.2);
    if (!person) return Alert.alert('No demo person', 'There isn’t a demo person in your field to place nearby.');
    setSim({ ...person, distanceMi: 0.2 });
    setShowLayers(false);
    flyTo(at, 0.6, 600);
    const labels = sharedLabels([...prefs.interests, ...prefs.skills], [...person.interests, ...person.skills]);
    const intents: NearbyRec['sharedIntents'] = prefs.goals.includes('mentorship') && person.offers.includes('mentorship') ? ['they_offer_mentorship'] : [];
    const r: NearbyRec = { id: person.id, name: person.name, distanceBucketMi: 0.5, sharedLabels: labels, sharedIntents: intents, demo: true };
    setDemoRec(r);
    // A demo notification is labelled Demo and opens the demo profile only. Not counted against real alert limits.
    const state = await notificationState();
    setNotifPerm(state);
    if (state === 'granted' && !(await notifyRec(r))) Alert.alert('Couldn’t send the notification', 'The demo card is on the map, but the notification failed. Check notification settings for this app.');
  };
  const alertsPanel: AlertsPanel = {
    items: [
      { id: 'on', label: 'Nearby alerts switched on', state: app.nearbyAlerts ? 'ok' : 'off' },
      { id: 'notif', label: 'Notifications allowed', state: notifPerm === 'granted' ? 'ok' : 'warn', hint: notifPerm === 'granted' ? undefined : notifPerm === 'blocked' ? 'Off in Settings: you’ll see the in-app card only.' : 'Optional: switch alerts on to be asked. Without it you get the in-app card.' },
      { id: 'signed', label: 'Signed in', state: app.session ? 'ok' : 'off', hint: app.session ? undefined : 'Real members only appear once you’re signed in.' },
      { id: 'verified', label: 'ID verified', state: app.idStatus === 'verified' ? 'ok' : 'off', hint: app.idStatus === 'verified' ? undefined : 'Recommendations are between real (ID-verified) members only.' },
      { id: 'share', label: 'In nearby discovery, sharing your area', state: discovering ? 'ok' : 'off', hint: discovering ? undefined : 'Turn on discovery and your rough area (about 1 km) in Profile.' },
      { id: 'field', label: 'Field set', state: prefs.field ? 'ok' : 'off', hint: prefs.field ? undefined : 'Recommendations are same-field only. Set it in Preferences.' },
      {
        id: 'map', label: 'Map open with live location', state: mapOpen ? 'ok' : 'off',
        hint: mapOpen ? undefined : loc.perm !== 'granted' ? 'Allow location while using the app.' : !live ? 'Turn on Live location above.' : 'Keep this tab open with the app on screen.',
      },
    ],
    nearby: paused ? (sim ? 1 : null) : closeBy,
    radiusMi: app.nearbyRadiusMi,
    error: recs.error,
    demo: { value: !!sim, onChange: (v) => void toggleSim(v) },
  };
  const toggleAlerts = async () => {
    if (app.nearbyAlerts) return app.setNearbyAlerts(false);
    app.setNearbyAlerts(true);
    setNotifPerm(await turnOnNearbyAlerts(app.nearbyRadiusMi));
  };
  const openCard = (r: NearbyRec) => {
    if (r.demo) {
      setDemoRec(null);
      router.push({ pathname: '/person/[id]', params: { id: r.id, nearby: 'demo' } });
    } else {
      recs.dismiss();
      router.push({ pathname: '/person/[id]', params: { id: r.id, nearby: '1' } });
    }
  };
  const notNow = (r: NearbyRec) => (r.demo ? setDemoRec(null) : recs.dismiss());
  const muteCard = (r: NearbyRec) => {
    recs.dismiss();
    if (app.session) muteAlertsFor(AsyncStorage, app.session.userId, r.id).catch((e) => warn('Could not mute alerts', e));
  };
  const shareCard =
    !hideShareCard && app.backendEnabled
      ? !app.session
        ? 'signin'
        : null
      : null;
  const selected = people.find((p) => p.id === selectedId);
  const doorVisible = useCallback((p: NearbyPerson) => !!p.door && doorActive(p.door) && canSeeDoor(p.door, p, prefs, profile), [prefs, profile]);

  const best = people.filter((p) => p.strength !== 'some');
  const doors = people.filter(doorVisible);
  const listed = tab === 'best' ? best : tab === 'doors' ? doors : people;
  // Best matches = strong + good, so the summary names both parts (e.g. "13 strong · 6 good" beside Best matches 19).
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

  // Visibility: one persistent, honest status on the map. "Visible in <area>" or "Hidden", and pause from here.
  const visible = !!app.session && prefs.discoverable && prefs.shareMode === 'area';
  const visibleArea = shortPlace(loc.place ?? (app.here && !app.here.isGps ? app.here.label : '') ?? '') || 'your area';
  const visibilityMenu = () => {
    if (!app.session) {
      return Alert.alert('You’re hidden', 'Guests never appear on the map. Sign in to choose whether people nearby can see your rough area.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/auth') },
      ]);
    }
    if (visible) {
      return Alert.alert(`Visible in ${visibleArea}`, 'People nearby see your rough area (about 1 km), never your exact location.', [
        { text: 'Keep visible', style: 'cancel' },
        { text: 'Pause visibility', style: 'destructive', onPress: () => app.setPrefs({ discoverable: false }) },
      ]);
    }
    Alert.alert('You’re hidden', 'Nobody nearby can see you right now. You can still browse and send requests.', [
      { text: 'Stay hidden', style: 'cancel' },
      { text: `Show me in ${visibleArea}`, onPress: () => app.setPrefs({ discoverable: true, shareMode: 'area' }) },
    ]);
  };

  // Custom markers re-render while they change, then stop tracking for smooth panning.
  const pinsKey = `${people.map((p) => p.id + p.strength + p.coord.latitude + p.coord.longitude).join(',')}|${selectedId ?? ''}|${showHotspots}|${hotspotId ?? ''}|${peopleClusters.clusters.map((c) => (c.kind === 'item' ? c.item.id : `c${c.id}:${c.count}`)).join(',')}|${eventClusters.clusters.map((c) => (c.kind === 'item' ? c.item.id : `c${c.id}:${c.count}`)).join(',')}`;
  const hotspot = HOTSPOTS.find((h) => h.id === hotspotId);
  const peopleIn = (h: Hotspot) => people.filter((p) => distanceMi(h.center, p.coord) <= h.radiusMi).length;
  const trackPins = settledPinsKey !== pinsKey;
  useEffect(() => {
    const t = setTimeout(() => setSettledPinsKey(pinsKey), 700);
    return () => clearTimeout(t);
  }, [pinsKey]);

  const peek = Math.max(PEEK_MIN, Math.round(height * 0.17));
  const snaps = useMemo(() => [peek, Math.round(height * 0.5), Math.round(Math.min(height * 0.9, height - insets.top - 8))], [peek, height, insets.top]);
  const snap = useCallback((i: number) => sheetRef.current?.snapToIndex(i), []);
  // The map buttons and hotspot key sit 12px above the sheet and fade out as it opens past half way.
  // They also fade when the sheet would push them up into the header/chips (short phones, status pill showing).
  // The hub key gets its own full-width row on the sheet; the rail sits on top of it. Heights are measured, not guessed.
  // At each resting position only what fits under the header shows (railFit: controls, then key, then assistant).
  const keySlot = showHotspots && keyH ? keyH + S.sm : 0;
  const fit = railFit(height - snaps[Math.min(sheetIndex, 1)] - LIFT - topH, keySlot);
  const showKey = showHotspots && (!keyH || fit.key); // mounted once to measure it
  const keyRoom = showKey ? keySlot : 0;
  const railHidden = sheetIndex === 2 || !fit.controls;
  const railTop = (fit.ask ? ASK_H : 0) + CONTROLS_H + LIFT + keyRoom;
  const railStyle = useAnimatedStyle(() => ({
    opacity: Math.min(
      interpolate(sheetY.value, [height * 0.12, height * 0.34], [0, 1], Extrapolation.CLAMP),
      // While dragging: fade out before the rail would reach the header.
      interpolate(sheetY.value, [topH + railTop - 16, topH + railTop], [0, 1], Extrapolation.CLAMP),
    ),
    transform: [{ translateY: sheetY.value - height - LIFT - keyRoom }],
  }));
  // The hub key is short, so it keeps the original fade only (visible whenever Hotspots is on and the sheet isn't expanded).
  const keyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [height * 0.12, height * 0.34], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: sheetY.value - height - LIFT }],
  }));
  const chipDims = useRef({ w: 0, c: 0, x: 0 });
  const chipRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const chipStart = useRef(false);
  const updateChipEdge = () => {
    const { w, c, x } = chipDims.current;
    const next = { start: x <= 4, end: c - w - x > 4 };
    setChipEdge((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  };
  const moved = !following && distanceMi(mapCenter, searchCenter) > 0.6;
  const fCount = activeFilterCount(filters);
  const restrictions = [
    realOnly ? 'Real people only' : '',
    filters.availability === 'today' ? 'Free today' : '',
    ...filters.fields.map((f) => `Field: ${fieldLabel(f)}`),
    ...filters.goals.map((g) => GOALS.find((x) => x.id === g)?.label ?? g),
    ...filters.interests,
    `Within ${filters.distanceMi} mi`,
  ].filter(Boolean);
  const demoAvail = pool.some((p) => p.isDemo);
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
  // Stable handler for the memoized person markers; always calls the latest `select`.
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });
  const onSelectPin = useCallback((p: NearbyPerson) => selectRef.current(p), []);

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
    <View style={{ flex: 1, backgroundColor: MAP_BG }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
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
        mapPadding={{ top: insets.top + 110, right: 0, bottom: peek + LIFT + keySlot, left: 0 }}
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
        <Circle center={origin} radius={filters.distanceMi * 1609.34} strokeColor={ACCENT(0.25)} fillColor={ACCENT(0.03)} strokeWidth={1} zIndex={1} />
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
                    <Text style={styles.hotText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{h.name}</Text>
                  </View>
                </Marker>
              );
            })
          : null}
        {selected ? (
          <Circle center={selected.coord} radius={260} strokeColor={ACCENT(0.55)} fillColor={ACCENT(0.12)} strokeWidth={1.5} zIndex={2} />
        ) : null}
        {showLines
          ? lineTargets.map((p) => {
              const on = p.id === selectedId;
              return (
                <Polyline
                  key={`l-${p.id}`}
                  coordinates={[origin, p.coord]}
                  strokeColor={on ? ACCENT(0.9) : p.strength === 'strong' ? ACCENT(0.5) : ACCENT(0.3)}
                  strokeWidth={on ? 2.5 : 1.5}
                  lineDashPattern={on ? undefined : [2, 6]}
                  zIndex={2}
                />
              );
            })
          : null}
        {topics.map((t, i) => (
          <Marker
            key={`radar-${t.id}`}
            coordinate={t.at}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={trackPins}
            zIndex={20}
            onPress={() => setRadarTopic(t)}
            accessibilityLabel={`${t.label}, ${t.people.length} people open to talking about it`}
          >
            <Animated.View entering={ZoomIn.delay(i * 70).duration(260)} collapsable={false} style={styles.topic}>
              <Ionicons name={t.icon} size={13} color={C.white} />
              <Text style={styles.topicText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t.label}</Text>
              <Text style={styles.topicCount} maxFontSizeMultiplier={1.2}>{t.people.length}</Text>
            </Animated.View>
          </Marker>
        ))}
        {loc.fix && loc.fix.accuracyM && loc.fix.accuracyM < 250 ? (
          <Circle center={loc.fix.coord} radius={loc.fix.accuracyM} strokeColor={ACCENT(0.2)} fillColor={ACCENT(0.08)} strokeWidth={1} zIndex={3} />
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
          return (
            <PersonMarker
              key={p.id}
              p={p}
              selected={p.id === selectedId}
              door={doorVisible(p)}
              settling={trackPins}
              label={`${p.name}, ${p.role}, ${p.strength === 'strong' ? 'strong match, ' : ''}${approxDistance(p.distanceMi)} ${fromLabel}`}
              onSelect={onSelectPin}
            />
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
      <View style={[styles.top, { paddingTop: insets.top + S.xs }]} pointerEvents="box-none" onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
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
            <Ionicons name="search-outline" size={20} color={C.ink} />
          </Pressable>
          <Pressable onPress={() => setModal('filters')} accessibilityRole="button" accessibilityLabel={`Filters${fCount ? `, ${fCount} on` : ''}`} style={({ pressed }) => [styles.filterBtn, pressed && { backgroundColor: C.bg2 }]}>
            <Ionicons name="options-outline" size={20} color={C.ink} />
            {fCount ? <View style={styles.count}><Text style={styles.countText}>{fCount}</Text></View> : null}
          </Pressable>
        </View>

        {/* One row of four quick filters. Everything else (goals, fields, interests) is in Filters. */}
        <View>
          <ScrollView
            ref={chipRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quick}
            scrollEventThrottle={32}
            onLayout={(e) => { chipDims.current.w = e.nativeEvent.layout.width; updateChipEdge(); }}
            onContentSizeChange={(w) => { chipDims.current.c = w; updateChipEdge(); if (!chipStart.current && w > 0) { chipStart.current = true; chipRef.current?.scrollTo({ x: 0, animated: false }); } }}
            onScroll={(e) => { chipDims.current.x = e.nativeEvent.contentOffset.x; updateChipEdge(); }}
          >
            <Pressable
              onPress={visibilityMenu}
              accessibilityRole="button"
              accessibilityLabel={visible ? `Visible in ${visibleArea}. Change visibility` : 'Hidden. Change visibility'}
              hitSlop={4}
              style={({ pressed }) => [styles.visPill, visible && styles.visPillOn, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.visDot, { backgroundColor: visible ? C.ok : C.ink3 }]} />
              <Text style={[styles.visText, visible && { color: C.ok }]} numberOfLines={1}>{visible ? `Visible in ${visibleArea}` : 'Hidden'}</Text>
            </Pressable>
            <Chip label="Radar" icon="radio-outline" selected={radarOn} onPress={() => { setRadarOn((v) => !v); setRadarTopic(null); }} />
            {prefs.field ? (
              <Chip
                label="My field"
                selected={filters.fields.length === 1 && filters.fields[0] === prefs.field}
                onPress={() => setFilters((f) => ({ ...f, fields: f.fields.length === 1 && f.fields[0] === prefs.field ? [] : [prefs.field!] }))}
              />
            ) : null}
            <Chip label={`Real people${realCount ? ` (${realCount})` : ''}`} selected={realOnly} onPress={() => setRealOnly((v) => !v)} />
            <Chip label={`Events${showEvents && mapEvents.length ? ` (${mapEvents.length})` : ''}`} selected={showEvents} onPress={() => setShowEvents((v) => !v)} />
            <Chip label="Free today" selected={filters.availability === 'today'} onPress={() => setFilters((f) => ({ ...f, availability: f.availability === 'today' ? 'any' : 'today' }))} />
            {GOALS.filter((g) => ['mentorship', 'advice', 'peers', 'collab'].includes(g.id)).map((g) => (
              <Chip key={g.id} label={g.label} selected={filters.goals.includes(g.id)} onPress={() => setFilters((f) => ({ ...f, goals: f.goals.includes(g.id) ? f.goals.filter((x) => x !== g.id) : [...f.goals, g.id] }))} />
            ))}
          </ScrollView>
          {!chipEdge.start ? (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.fade, { left: 0 }]} pointerEvents="none">
              <LinearGradient colors={[alpha(MAP_BG, 0.95), alpha(MAP_BG, 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
          {chipEdge.end ? (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.fade, { right: 0 }]} pointerEvents="none">
              <LinearGradient colors={[alpha(MAP_BG, 0), alpha(MAP_BG, 0.95)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
        </View>

        {/* A single status slot under the chips, so nothing stacks over the map. A recommendation takes priority. */}
        {card ? (
          <NearbyRecCard rec={card} onView={() => openCard(card)} onNotNow={() => notNow(card)} onMute={() => muteCard(card)} />
        ) : moved ? (
          <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)} style={{ alignSelf: 'center' }}>
            <Pressable
              onPress={() => { setSearchCenter(mapCenter); setAreaName('this area'); setSelectedId(null); if (!loc.fix) setHere({ coord: mapCenter, label: 'this area', isGps: false }); }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pill, shadow, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="refresh-outline" size={16} color={C.accent} />
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
              <Ionicons name={shareCard === 'signin' ? 'person-add-outline' : 'eye-outline'} size={16} color={C.accent} />
              <Text style={styles.pillAccent} numberOfLines={1}>{shareCard === 'signin' ? 'Sign in to appear on the map' : 'Show me on the map'}</Text>
            </Pressable>
            <Pressable onPress={() => setHideShareCard(true)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} style={styles.shareClose}>
              <Ionicons name="close" size={16} color={C.ink3} />
            </Pressable>
          </Animated.View>
        ) : (app.nearbyAlerts || sim) && closeBy ? (
          <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)} style={[styles.pill, shadow, { alignSelf: 'center' }]} accessibilityLiveRegion="polite">
            <View style={styles.nearDot} />
            <Text style={styles.pillText}>{closeBy} recommended member{closeBy === 1 ? '' : 's'} within about {app.nearbyRadiusMi} mi{sim ? ' (incl. demo)' : ''}</Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Two map buttons, plus the assistant. They ride just above the sheet and fade out when it opens. */}
      <Animated.View style={[styles.rail, railStyle]} pointerEvents={railHidden ? 'none' : 'box-none'}>
        {fit.ask ? (
          <Pressable onPress={() => router.push('/assistant')} accessibilityRole="button" accessibilityLabel="Ask the Connected assistant" style={({ pressed }) => [styles.askBtn, shadow, pressed && { backgroundColor: C.accentPressed }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.white} />
          </Pressable>
        ) : null}
        <View style={[styles.controls, shadow]}>
          <ControlButton icon={following ? 'locate' : 'locate-outline'} active={following} label={following ? 'Following your location' : 'Center on my location'} onPress={recenter} />
          <View style={styles.controlDivider} />
          <ControlButton icon="layers-outline" active={showLayers || look !== 'network'} label="Layers" onPress={() => setShowLayers(true)} />
        </View>
      </Animated.View>

      {/* Hotspot key: visible whenever Hotspots is on (not tied to the viewport); its own row just above the sheet, under the rail.
          All three labels on one line when they fit, otherwise whole items wrap (large text). It has no controls, so it
          only takes touches on its own box, and none once it has faded out with the sheet expanded. */}
      {showKey ? (
        <Animated.View style={[styles.keyRow, keyStyle]} pointerEvents={sheetIndex === 2 ? 'none' : 'box-none'} onLayout={(e) => setKeyH(Math.round(e.nativeEvent.layout.height))}>
          <View style={[styles.key, shadow]} accessible accessibilityLabel="Map key: Major hub, Active hub, Emerging spot">
            {(['high', 'medium', 'emerging'] as const).map((lvl) => (
              <View key={lvl} style={styles.keyItem}>
                <View style={[styles.keySwatch, { backgroundColor: HOTSPOT_LEVELS[lvl].fill, borderColor: HOTSPOT_LEVELS[lvl].color }]} />
                <Text style={styles.keyText}>{HOTSPOT_LEVELS[lvl].label}</Text>
              </View>
            ))}
          </View>
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
          {/* Fixed head (what the collapsed sheet shows), then ONE scroll container for everything else. No BottomSheetView
              wrapper: it is absolutely positioned and content-sized, so a list inside it never gets a bounded height. */}
          {selected || hotspot ? (
            <View style={styles.sheetHead}>
              <Pressable onPress={closeCard} accessibilityRole="button" style={styles.backRow} hitSlop={8}>
                <Ionicons name="chevron-back" size={18} color={C.accent} />
                <Text style={[T.label, { color: C.accent }]}>Your network</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.sheetHead}>
              <View style={{ gap: 1 }}>
                <Text style={styles.sheetTitle} accessibilityRole="header" numberOfLines={1}>Your network nearby</Text>
                <Text style={styles.sheetMeta} numberOfLines={1}>Within {filters.distanceMi} mi of {me ? 'you' : areaName}</Text>
              </View>
              {sheetIndex === 0 ? null : <Text style={styles.sheetCounts} numberOfLines={1}>
                {loading ? 'Loading your network…' : `${strongCount} strong · ${best.length - strongCount} good · ${realCount} real member${realCount === 1 ? '' : 's'}${people.length > realCount ? ` · ${people.length - realCount} demo` : ''}`}
              </Text>}
              <TextTabs
                tabs={[{ id: 'best', label: 'Best matches', count: best.length }, { id: 'doors', label: 'Open Doors', count: doors.length }, { id: 'all', label: 'Everyone', count: people.length }]}
                value={tab}
                onChange={(id) => { setTab(id); if (sheetIndex === 0) snap(1); }}
              />
            </View>
          )}
          {/* The sheet already ends at the tab bar's top edge (the JS tab bar is laid out below the scene, not over it, and
              pads itself for the home indicator), so the list needs breathing room only, not tab bar + inset clearance.
              Remounting per tab/detail resets the scroll to the top. */}
          <BottomSheetFlatList
            key={selectedId ?? hotspotId ?? tab}
            data={selected || hotspot ? [] : listed}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingBottom: S.xl }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
          selected ? (
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
                  <Ionicons name="flame-outline" size={20} color={HOTSPOT_LEVELS[hotspot.level].color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hotTitle}>{hotspot.name}</Text>
                  <Text style={[T.small, { color: C.ink2, fontWeight: '600' }]}>{HOTSPOT_LEVELS[hotspot.level].label} · {hotspot.kind}</Text>
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
          ) : (
            // Notices scroll away with the list instead of permanently taking the expanded viewport; scroll up to reach them.
            <View style={styles.listHead}>
              {sheetIndex !== 0 && (loc.perm === 'undetermined' || loc.perm === 'denied') ? (
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
              <MemberLock what="people nearby" />
            </View>
          )
            }
            ListFooterComponent={
              selected || hotspot || !listed.length ? undefined : (
                <Text style={[T.small, { textAlign: 'center', paddingVertical: S.md, paddingHorizontal: S.lg }]}>Shown at their neighborhood, never a live location · demo profiles are marked</Text>
              )
            }
            renderItem={({ item: p }) => {
                const door = doorVisible(p);
                const reason = matchPoints(p, prefs)[0]?.text;
                return (
                  <Pressable
                    onPress={() => select(p)}
                    onLongPress={() => openProfile(p)}
                    accessibilityRole="button"
                    accessibilityHint="Shows them on the map. Long press to open their profile."
                    style={({ pressed }) => [styles.contact, pressed && { backgroundColor: C.bg2 }]}
                  >
                    <Avatar name={p.name} uri={p.photoThumb} size={46} ring={p.strength === 'strong'} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.contactName} numberOfLines={1}>{p.name}</Text>
                        {p.isDemo ? <Text style={styles.demoPill}>Demo</Text> : null}
                      </View>
                      <Text style={styles.contactRole} numberOfLines={2}>{p.role} · {p.org}</Text>
                      {p.strength === 'strong' || reason ? (
                        <Text style={styles.reason}>
                          {p.strength === 'strong' ? <Text style={styles.strong}>Strong match{reason ? ' · ' : ''}</Text> : null}
                          {reason}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.contactRight}>
                      <Text style={styles.dist}>{p.distanceMi < 10 ? p.distanceMi.toFixed(1) : Math.round(p.distanceMi)} mi</Text>
                      <Text style={styles.travel}>{travelTime(p.distanceMi)}</Text>
                      {door ? <Text style={styles.doorText}>Open Door</Text> : isFreeToday(p) ? <Text style={styles.freeText}>Free today</Text> : null}
                    </View>
                  </Pressable>
                );
            }}
            ListEmptyComponent={
          selected || hotspot || loading ? undefined : !people.length && tab !== 'doors' ? (
            <View style={styles.emptyCard} accessibilityLiveRegion="polite">
              <Text style={styles.emptyTitle}>{realOnly ? 'No real members match yet' : 'No one matches here yet'}</Text>
              <Text style={T.small}>Active: {restrictions.join(' · ')}</Text>
              <Text style={T.small}>{realOnly && demoAvail ? 'Demo profiles are hidden. They are sample people, not real members.' : 'Try fewer filters or a wider distance.'}</Text>
              <View style={styles.emptyActions}>
                {fCount ? <Button label="Clear filters" small variant="secondary" onPress={() => setFilters(defaultFilters(filters.distanceMi))} /> : null}
                {filters.distanceMi < POOL_RADIUS_MI ? <Button label={`Widen to ${POOL_RADIUS_MI} mi`} small variant="secondary" onPress={() => setFilters((f) => ({ ...f, distanceMi: POOL_RADIUS_MI }))} /> : null}
                {realOnly && demoAvail ? <Button label="Explore demo people" small onPress={() => { if (!app.showDemo) app.setShowDemoPeople(true); setFilters(defaultFilters(filters.distanceMi)); setRealOnly(false); }} /> : null}
              </View>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name={tab === 'doors' ? 'enter-outline' : 'git-network-outline'} size={22} color={C.ink3} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.emptyTitle}>
                  {realOnly && !people.length ? 'No real members in range yet' : tab === 'doors' ? 'No Open Doors right now' : tab === 'best' && people.length ? 'No strong matches in range' : nearCharlotte ? 'No one matches here yet' : 'No one nearby yet'}
                </Text>
                <Text style={T.small}>
                  {realOnly && !people.length ? 'Demo profiles are hidden. Show them to see how Connected works, or widen the distance.' : tab === 'doors' ? 'They appear when someone posts one for people like you.' : nearCharlotte ? 'Try a wider distance or fewer filters.' : 'This demo only has profiles in Charlotte, NC.'}
                </Text>
              </View>
              {realOnly && !people.length ? (
                <Button label="Show demo" small variant="secondary" onPress={() => setRealOnly(false)} />
              ) : tab !== 'all' && people.length ? (
                <Button label="See everyone" small variant="secondary" onPress={() => setTab('all')} />
              ) : nearCharlotte ? (
                <Button label="Clear" small variant="secondary" onPress={() => setFilters(defaultFilters(POOL_RADIUS_MI))} />
              ) : (
                <Button label="Charlotte" small onPress={() => goToArea(CHARLOTTE_CENTER, 'Charlotte')} />
              )}
            </View>
          )
            }
          />
        </GorhomSheet>
      ) : null}

      <Modal visible={!!radarTopic} transparent animationType="none" onRequestClose={() => setRadarTopic(null)} statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(150)} style={styles.radarScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRadarTopic(null)} accessibilityLabel="Close topic" />
        </Animated.View>
        {radarTopic ? (
          <Animated.View entering={SlideInDown.duration(260)} exiting={SlideOutDown.duration(180)} style={[styles.radarSheet, { paddingBottom: insets.bottom + S.lg }]}>
            <View style={styles.radarHandle} />
            <View style={styles.radarHead}>
              <View style={styles.radarIcon}><Ionicons name={radarTopic.icon} size={20} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={T.h2}>{radarTopic.label}</Text>
                <Text style={T.small}>{radarTopic.people.length} {radarTopic.people.length === 1 ? 'person' : 'people'} nearby open to talking about this</Text>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {radarTopic.people.map((p, i) => (
                <Animated.View key={p.id} entering={FadeInDown.delay(i * 50).duration(240)}>
                  <Pressable
                    onPress={() => { setRadarTopic(null); openProfile(p); }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.radarRow, pressed && { opacity: 0.6 }]}
                  >
                    <Avatar name={p.name} uri={p.photoThumb ?? p.photo} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.radarName} numberOfLines={1}>{p.name}</Text>
                      <Text style={T.small} numberOfLines={1}>{p.role} · {approxDistance(p.distanceMi)}{p.isDemo ? ' · Demo' : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.ink3} />
                  </Pressable>
                </Animated.View>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Modal>

      <LayersSheet
        visible={showLayers}
        onClose={() => setShowLayers(false)}
        looks={LOOKS}
        look={look}
        onLook={(id) => changeLook(id as MapLook)}
        alerts={alertsPanel}
        legend={showHotspots ? (['high', 'medium', 'emerging'] as const).map((l) => ({ id: l, label: HOTSPOT_LEVELS[l].label, fill: HOTSPOT_LEVELS[l].fill, color: HOTSPOT_LEVELS[l].color })) : undefined}
        toggles={[
          { id: 'hot', label: 'Hotspots', hint: 'Neighborhood hubs, shown as soft areas. Not people.', icon: 'flame-outline', value: showHotspots, onChange: (v) => { setShowHotspots(v); setHotspotId(null); } },
          { id: 'radar', label: 'Conversation Radar', hint: 'Topics people nearby are open to talking about', icon: 'radio-outline', value: radarOn, onChange: (v) => { setRadarOn(v); setRadarTopic(null); } },
          { id: 'lines', label: 'Connection lines', hint: 'Lines to your best matches', icon: 'git-network-outline', value: showLines, onChange: setShowLines },
          { id: 'events', label: 'Events', hint: 'In-person events nearby', icon: 'calendar-outline', value: showEvents, onChange: setShowEvents },
          { id: 'alerts', label: 'Nearby alerts', hint: `Same-field recommendations within about ${app.nearbyRadiusMi} mi`, icon: 'notifications-outline', value: app.nearbyAlerts, onChange: () => { setShowLayers(false); void toggleAlerts(); } },
          ...(loc.perm === 'granted' ? [{ id: 'live', label: 'Live location', hint: 'Keeps your position current', icon: 'location-outline' as const, value: live, onChange: setLive }] : []),
        ]}
      />

      <FilterSheet
        visible={modal === 'filters'}
        value={filters}
        resultCount={withinRange(pool, origin, filters, blocked).length}
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
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: S.md, backgroundColor: C.surface, borderRadius: R.lg, paddingLeft: S.md, paddingRight: 4, minHeight: 52, borderWidth: 1, borderColor: C.line },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 48 },
  brand: { flexDirection: 'row', alignItems: 'flex-end' },
  brandWord: { fontFamily: F.display, fontSize: 19, color: C.ink, letterSpacing: -0.4 },
  brandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginLeft: 1.5, marginBottom: 5 },
  headerDivider: { width: 1, height: 24, backgroundColor: C.line },
  place: { fontSize: 15, fontWeight: '600', color: C.ink, flexShrink: 1 },
  locDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  filterBtn: { width: 44, height: 44, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: C.surface },
  countText: { color: C.white, fontSize: 11, lineHeight: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  quick: { gap: S.sm, paddingHorizontal: S.md, paddingVertical: 2 },
  nearDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.ok },
  askBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: S.md, bottom: 0, alignItems: 'center', gap: S.sm },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 32 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 9, paddingRight: 4, paddingVertical: 4, borderRadius: 999, backgroundColor: C.accent, maxWidth: 210, ...shadow },
  topicText: { color: C.white, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  topicCount: { color: C.accent, backgroundColor: C.white, fontSize: 11, fontWeight: '700', minWidth: 18, textAlign: 'center', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 4, paddingVertical: 1 },
  radarScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,26,33,0.3)' },
  radarSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: S.lg, paddingTop: S.sm, gap: S.md },
  radarHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line2 },
  radarHead: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  radarIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  radarRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
  radarName: { fontSize: 16, fontWeight: '600', color: C.ink },
  visPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface, maxWidth: 220 },
  visPillOn: { borderColor: alpha(C.ok, 0.45), backgroundColor: C.okSoft },
  visDot: { width: 8, height: 8, borderRadius: 4 },
  visText: { fontSize: 14, fontWeight: '600', color: C.ink2, flexShrink: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, paddingHorizontal: S.md, minHeight: 40, borderRadius: R.pill, borderWidth: 1, borderColor: C.line },
  pillAccent: { color: C.accent, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  pillText: { fontSize: 13, fontWeight: '600', color: C.ink },
  sharePill: { alignSelf: 'flex-start', marginLeft: S.md, paddingRight: 4, maxWidth: '88%' },
  shareMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 40 },
  shareClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  placeRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetBg: { backgroundColor: C.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, borderWidth: 1, borderColor: C.line },
  handle: { width: 36, height: 4, backgroundColor: C.line2 },
  handleHit: { paddingTop: 10, paddingBottom: 6 },
  sheetCounts: { fontSize: 13, lineHeight: 18, color: C.ink2, marginTop: -S.xs },
  keyRow: { position: 'absolute', left: S.md, right: S.md, bottom: 0, flexDirection: 'row' },
  key: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: S.lg, rowGap: S.xs, paddingHorizontal: S.md, paddingVertical: S.sm, backgroundColor: alpha(C.surface, 0.96), borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  keyText: { fontSize: 13, lineHeight: 18, color: C.ink2, fontWeight: '500' },
  emptyCard: { gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, marginBottom: S.lg },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.xs },
  emptyTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: C.ink },
  hotLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: alpha(C.surface, 0.95), borderRadius: R.sm, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 7, paddingVertical: 3, shadowColor: C.ink, shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  hotDot: { width: 7, height: 7, borderRadius: 4 },
  hotText: { fontSize: 11, fontWeight: '600', color: C.ink },
  hotIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hotTitle: { fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.ink },
  hotFacts: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: S.md, backgroundColor: C.surface },
  hotFact: { flex: 1, alignItems: 'center', gap: 2 },
  hotFactNum: { fontFamily: F.display, fontSize: 22, color: C.ink, fontVariant: ['tabular-nums'] },
  hotFactLabel: { fontSize: 12, lineHeight: 16, color: C.ink3, textAlign: 'center' },
  hotFactDivider: { width: 1, backgroundColor: C.line },
  controls: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  control: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { height: 1, backgroundColor: C.line, marginHorizontal: 8 },
  centerMark: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: C.white },
  sheetHead: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.sm },
  sheetTitle: { fontFamily: F.display, fontSize: 20, lineHeight: 26, color: C.ink, letterSpacing: -0.2, flexShrink: 1 },
  sheetMeta: { fontSize: 13, lineHeight: 18, color: C.ink3 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.accentSoft, borderRadius: R.md, padding: S.sm, paddingLeft: S.md },
  listHead: { paddingHorizontal: S.lg, paddingTop: S.xs, gap: S.sm },
  contact: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, paddingHorizontal: 4, marginHorizontal: S.lg, borderBottomWidth: 1, borderBottomColor: C.line },
  contactName: { fontFamily: F.displaySemi, fontSize: 17, lineHeight: 22, color: C.ink, flexShrink: 1 },
  contactRole: { fontSize: 14, lineHeight: 19, color: C.ink2 },
  reason: { fontSize: 13, lineHeight: 18, color: C.ink3 },
  strong: { fontWeight: '600', color: C.accent },
  demoPill: { fontSize: 11, fontWeight: '600', color: C.ink2, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: R.sm, overflow: 'hidden' },
  contactRight: { alignItems: 'flex-end', gap: 2, minWidth: 64 },
  dist: { fontSize: 15, fontWeight: '600', color: C.ink, fontVariant: ['tabular-nums'] },
  travel: { fontSize: 12, color: C.ink3 },
  doorText: { fontSize: 12, fontWeight: '600', color: C.blue },
  freeText: { fontSize: 12, fontWeight: '600', color: C.ok },
  empty: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md },
  scrim: { flex: 1, backgroundColor: alpha(C.ink, 0.4), justifyContent: 'center', padding: S.lg },
  areaBox: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, gap: S.md },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 50, paddingHorizontal: S.sm, borderRadius: R.md },
  areaIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
