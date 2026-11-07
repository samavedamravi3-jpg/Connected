import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, UrlTile, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterSheet } from '@/components/FilterSheet';
import { PersonCard } from '@/components/PersonCard';
import { Avatar, Button, Chip, IconButton } from '@/components/ui';
import { AREAS, CHARLOTTE_CENTER, GOALS, fieldLabel } from '@/data/options';
import { dataSource } from '@/data/source';
import type { LatLng, NearbyPerson } from '@/data/types';
import { activeFilterCount, applyFilters, defaultFilters, type Filters } from '@/lib/filters';
import { approxDistance, deltaForMiles, distanceMi } from '@/lib/geo';
import { canSeeDoor, doorActive, firstName, matchScore } from '@/lib/match';
import { useApp } from '@/state/AppState';
import { C, R, S, T, shadow } from '@/theme';

// Free CARTO basemap built on OpenStreetMap data. Attribution is shown on the map, as their terms require.
const TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const POOL_RADIUS_MI = 25;

type Perm = 'checking' | 'undetermined' | 'granted' | 'denied';

const regionFor = (c: LatLng, mi: number): Region => ({ ...c, latitudeDelta: deltaForMiles(mi), longitudeDelta: deltaForMiles(mi) });

export default function MapScreen() {
  const app = useApp();
  const { prefs, profile, blocked } = app;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [perm, setPerm] = useState<Perm>('checking');
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [areaName, setAreaName] = useState('central Charlotte');
  const [searchCenter, setSearchCenter] = useState<LatLng>(CHARLOTTE_CENTER);
  const [mapCenter, setMapCenter] = useState<LatLng>(CHARLOTTE_CENTER);
  const [loaded, setLoaded] = useState<{ center: LatLng; people: NearbyPerson[] } | null>(null);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(prefs.travelMi));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'filters' | 'list' | 'area' | null>(null);
  const [settledPinsKey, setSettledPinsKey] = useState('');

  // Load everyone opted in within the pool radius of the search center. Filtering happens locally.
  useEffect(() => {
    let live = true;
    dataSource.listNearbyPeople(searchCenter, POOL_RADIUS_MI).then((ps) => {
      if (live) setLoaded({ center: searchCenter, people: ps });
    });
    return () => { live = false; };
  }, [searchCenter]);
  const loading = loaded?.center !== searchCenter;
  const pool = useMemo(() => loaded?.people ?? [], [loaded]);

  const people = useMemo(() => {
    const list = applyFilters(pool, filters, blocked);
    return list.sort((a, b) => matchScore(b, prefs) - matchScore(a, prefs) || a.distanceMi - b.distanceMi);
  }, [pool, filters, blocked, prefs]);

  // Distances shown to the user: from their GPS fix when nearby, otherwise from the search area.
  const distanceRef = userLoc && distanceMi(userLoc, searchCenter) < POOL_RADIUS_MI ? userLoc : searchCenter;
  const distanceFromLabel = distanceRef === userLoc ? 'from you' : `from ${areaName}`;
  const withDistance = useCallback((p: NearbyPerson) => ({ ...p, distanceMi: distanceMi(distanceRef, p.coord) }), [distanceRef]);

  const selected = people.find((p) => p.id === selectedId);
  const moved = distanceMi(mapCenter, searchCenter) > 0.6;

  // Custom pins re-render while they change, then stop tracking view changes for smooth panning.
  const pinsKey = `${people.map((p) => p.id).join(',')}|${selectedId ?? ''}`;
  const trackPins = settledPinsKey !== pinsKey;
  useEffect(() => {
    const t = setTimeout(() => setSettledPinsKey(pinsKey), 700);
    return () => clearTimeout(t);
  }, [pinsKey]);

  const goTo = useCallback((c: LatLng, label: string) => {
    setSearchCenter(c);
    setMapCenter(c);
    setAreaName(label);
    setSelectedId(null);
    mapRef.current?.animateToRegion(regionFor(c, filters.distanceMi), 450);
  }, [filters.distanceMi]);

  /** One-time location fix. No watchers, no background updates. */
  const fixOnce = useCallback(async () => {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setUserLoc(here);
    goTo(here, 'you');
  }, [goTo]);

  const locateOnce = useCallback(async () => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') status = (await Location.requestForegroundPermissionsAsync()).status;
      if (status !== 'granted') return setPerm(status === 'denied' ? 'denied' : 'undetermined');
      setPerm('granted');
      await fixOnce();
    } catch {
      setPerm('denied');
    }
  }, [fixOnce]);

  // On first open, check (without prompting) whether location was already allowed.
  const fixOnceRef = useRef(fixOnce);
  useEffect(() => { fixOnceRef.current = fixOnce; }, [fixOnce]);
  useEffect(() => {
    let live = true;
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (!live) return;
        if (status === 'granted') {
          setPerm('granted');
          return fixOnceRef.current();
        }
        setPerm(status === 'denied' ? 'denied' : 'undetermined');
      })
      .catch(() => live && setPerm('denied'));
    return () => { live = false; };
  }, []);

  const nearCharlotte = distanceMi(searchCenter, CHARLOTTE_CENTER) < 40;
  const quickGoals = GOALS.filter((g) => ['mentorship', 'advice', 'peers', 'collab'].includes(g.id));
  const fCount = activeFilterCount(filters);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg2 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(CHARLOTTE_CENTER, prefs.travelMi)}
        mapType={Platform.OS === 'android' ? 'none' : 'standard'}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        onRegionChangeComplete={(r) => setMapCenter({ latitude: r.latitude, longitude: r.longitude })}
        onPress={(e) => {
          const action = (e.nativeEvent as { action?: string }).action;
          if (action !== 'marker-press') setSelectedId(null);
        }}
        accessibilityLabel="Map of people nearby"
      >
        <UrlTile urlTemplate={TILE_URL} maximumZ={19} tileSize={256} shouldReplaceMapContent zIndex={-1} />
        <Circle center={searchCenter} radius={filters.distanceMi * 1609.34} strokeColor="rgba(91,53,201,0.35)" fillColor="rgba(91,53,201,0.06)" strokeWidth={1} />
        {userLoc ? (
          <Marker coordinate={userLoc} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title="You" accessibilityLabel="Your location">
            <View style={styles.youDot} />
          </Marker>
        ) : null}
        {people.map((p) => {
          const on = p.id === selectedId;
          const door = p.door && doorActive(p.door) && canSeeDoor(p.door, p, prefs, profile);
          return (
            <Marker
              key={p.id}
              coordinate={p.coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={trackPins}
              zIndex={on ? 10 : 1}
              onPress={() => setSelectedId(p.id)}
              accessibilityLabel={`${p.name}, ${p.role}, ${approxDistance(withDistance(p).distanceMi)} ${distanceFromLabel}`}
            >
              <View style={[styles.pin, on && styles.pinOn]}>
                <Text style={[styles.pinText, on && { color: C.white }]}>{initialsOf(p.name)}</Text>
                {door ? <View style={styles.pinBadge}><Ionicons name="enter" size={10} color={C.white} /></View> : null}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Top controls */}
      <View style={[styles.top, { paddingTop: insets.top + S.sm }]} pointerEvents="box-none">
        <View style={[styles.bar, shadow]}>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>People nearby</Text>
            <Text style={T.small} numberOfLines={1}>
              {loading ? 'Looking…' : `${people.length} within ${filters.distanceMi} mi of ${areaName}`} · demo profiles
            </Text>
          </View>
          <Pressable onPress={() => setSheet('filters')} accessibilityRole="button" accessibilityLabel={`Filters${fCount ? `, ${fCount} active` : ''}`} style={({ pressed }) => [styles.filterBtn, pressed && { backgroundColor: C.bg2 }]}>
            <Ionicons name="options-outline" size={20} color={C.ink} />
            <Text style={T.label}>Filters</Text>
            {fCount ? <View style={styles.count}><Text style={styles.countText}>{fCount}</Text></View> : null}
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
          {prefs.field ? (
            <Chip
              label={`My field`}
              selected={filters.fields.length === 1 && filters.fields[0] === prefs.field}
              onPress={() => setFilters((f) => ({ ...f, fields: f.fields.length === 1 && f.fields[0] === prefs.field ? [] : [prefs.field!] }))}
            />
          ) : null}
          <Chip label="Free today" selected={filters.availability === 'today'} onPress={() => setFilters((f) => ({ ...f, availability: f.availability === 'today' ? 'any' : 'today' }))} />
          {quickGoals.map((g) => (
            <Chip key={g.id} label={g.label} selected={filters.goals.includes(g.id)} onPress={() => setFilters((f) => ({ ...f, goals: f.goals.includes(g.id) ? f.goals.filter((x) => x !== g.id) : [...f.goals, g.id] }))} />
          ))}
        </ScrollView>
        {moved ? (
          <Pressable
            onPress={() => { setSearchCenter(mapCenter); setAreaName('this area'); setSelectedId(null); }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.searchHere, shadow, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="search" size={16} color={C.white} />
            <Text style={{ color: C.white, fontWeight: '600', fontSize: 15 }}>Search this area</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Side controls */}
      <View style={[styles.side, { top: insets.top + 150 }]}>
        <IconButton icon={perm === 'granted' ? 'navigate' : 'navigate-outline'} label="Center on my location" onPress={() => (userLoc ? goTo(userLoc, 'you') : locateOnce())} style={shadow} />
        <IconButton icon="location-outline" label="Choose an area" onPress={() => setSheet('area')} style={shadow} />
        <IconButton icon="list-outline" label="Show people as a list" onPress={() => setSheet('list')} style={shadow} />
      </View>

      {/* Bottom: selected person, location prompt, or summary */}
      <View style={styles.bottom} pointerEvents="box-none">
        {selected ? (
          <PersonCard
            person={withDistance(selected)}
            distanceFromLabel={distanceFromLabel}
            prefs={prefs}
            profile={profile}
            onClose={() => setSelectedId(null)}
            onOpen={() => router.push({ pathname: '/person/[id]', params: { id: selected.id, d: String(withDistance(selected).distanceMi), from: distanceFromLabel } })}
          />
        ) : perm === 'undetermined' || perm === 'denied' ? (
          <View style={[styles.panel, shadow]}>
            <Text style={T.h3}>{perm === 'denied' ? 'Location is off' : 'See who’s near you'}</Text>
            <Text style={T.small}>
              {perm === 'denied'
                ? `Showing ${areaName}. Pick an area, or turn on location in your phone's settings.`
                : 'We use your location once to center the map. It isn’t tracked or shared.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {perm === 'undetermined' ? <Button label="Use my location" icon="navigate" onPress={() => locateOnce()} style={{ flex: 1 }} small /> : <Button label="Open settings" variant="secondary" onPress={() => Linking.openSettings()} small style={{ flex: 1 }} />}
              <Button label="Pick an area" variant="secondary" onPress={() => setSheet('area')} small style={{ flex: 1 }} />
            </View>
          </View>
        ) : !loading && !people.length ? (
          <View style={[styles.panel, shadow]}>
            <Text style={T.h3}>{nearCharlotte ? 'No one matches here yet' : 'No one nearby yet'}</Text>
            <Text style={T.small}>
              {nearCharlotte ? 'Try a wider distance or fewer filters.' : 'This demo only has profiles in Charlotte, NC.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {nearCharlotte ? (
                <Button label="Clear filters" small variant="secondary" onPress={() => setFilters(defaultFilters(POOL_RADIUS_MI))} style={{ flex: 1 }} />
              ) : (
                <Button label="Go to Charlotte" small onPress={() => goTo(CHARLOTTE_CENTER, 'central Charlotte')} style={{ flex: 1 }} />
              )}
            </View>
          </View>
        ) : null}
        <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} accessibilityRole="link" style={styles.attrib}>
          <Text style={styles.attribText}>© OpenStreetMap contributors © CARTO</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ position: 'absolute', alignSelf: 'center', top: '50%' }} color={C.accent} /> : null}

      <FilterSheet
        visible={sheet === 'filters'}
        value={filters}
        resultCount={applyFilters(pool, filters, blocked).length}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters(prefs.travelMi))}
        onClose={() => {
          setSheet(null);
          mapRef.current?.animateToRegion(regionFor(searchCenter, filters.distanceMi), 400);
        }}
      />

      <Modal visible={sheet === 'list'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={[styles.modalHead, { paddingTop: Platform.OS === 'android' ? insets.top + S.sm : S.lg }]}>
            <View>
              <Text style={T.h2}>{people.length} people nearby</Text>
              <Text style={T.small}>Best matches first · demo profiles</Text>
            </View>
            <IconButton icon="close" label="Close list" onPress={() => setSheet(null)} />
          </View>
          <FlatList
            data={people}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: insets.bottom + S.xl }}
            ListEmptyComponent={<Text style={T.muted}>No one matches these filters.</Text>}
            renderItem={({ item }) => {
              const p = withDistance(item);
              return (
                <Pressable
                  onPress={() => { setSheet(null); router.push({ pathname: '/person/[id]', params: { id: p.id, d: String(p.distanceMi), from: distanceFromLabel } }); }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.bg2 }]}
                  accessibilityRole="button"
                >
                  <Avatar name={p.name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={T.h3} numberOfLines={1}>{p.name}</Text>
                    <Text style={T.small} numberOfLines={1}>{p.role} · {fieldLabel(p.field)}</Text>
                    <Text style={[T.small, { color: C.accent }]}>{approxDistance(p.distanceMi)} {distanceFromLabel}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.ink3} />
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      <Modal visible={sheet === 'area'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.scrim} onPress={() => setSheet(null)} accessibilityLabel="Close area picker">
          <Pressable style={[styles.areaBox, shadow]} onPress={() => {}}>
            <Text style={T.h2}>Choose an area</Text>
            <Text style={T.small}>We’ll look for people around this part of Charlotte.</Text>
            <View style={{ gap: 4 }}>
              {AREAS.map((a) => (
                <Pressable key={a.id} onPress={() => { setSheet(null); goTo(a.center, a.name); }} style={({ pressed }) => [styles.areaRow, pressed && { backgroundColor: C.bg2 }]} accessibilityRole="button">
                  <Ionicons name="location-outline" size={18} color={C.accent} />
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

const initialsOf = (n: string) => (firstName(n)[0] ?? '') + (n.split(' ')[1]?.[0] ?? '');

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: S.md, gap: S.sm, alignItems: 'stretch' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.bg, borderRadius: R.md, paddingLeft: S.lg, paddingRight: S.xs, paddingVertical: S.xs, minHeight: 56 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: S.md, borderRadius: R.sm },
  count: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countText: { color: C.white, fontSize: 12, fontWeight: '700' },
  quick: { gap: S.sm, paddingRight: S.md },
  searchHere: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.ink, paddingHorizontal: S.lg, minHeight: 42, borderRadius: R.pill },
  side: { position: 'absolute', right: S.md, gap: S.sm },
  bottom: { position: 'absolute', left: S.md, right: S.md, bottom: 4, gap: 6 },
  panel: { backgroundColor: C.bg, borderRadius: R.lg, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.line },
  attrib: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  attribText: { fontSize: 10, color: C.ink2 },
  pin: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.bg, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  pinOn: { backgroundColor: C.accent, borderColor: C.white, width: 46, height: 46, borderRadius: 23 },
  pinText: { fontSize: 13, fontWeight: '700', color: C.accent },
  pinBadge: { position: 'absolute', right: -4, top: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: C.blue, borderWidth: 2, borderColor: C.white, alignItems: 'center', justifyContent: 'center' },
  youDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.blue, borderWidth: 3, borderColor: C.white },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  scrim: { flex: 1, backgroundColor: 'rgba(27,23,38,0.35)', justifyContent: 'center', padding: S.lg },
  areaBox: { backgroundColor: C.bg, borderRadius: R.lg, padding: S.lg, gap: S.sm },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 48, paddingHorizontal: S.sm, borderRadius: R.sm },
});
