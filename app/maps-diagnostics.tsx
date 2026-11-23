import React, { Component, useCallback, useRef, useState, type ReactNode } from 'react';
import { Clipboard, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { ScreenContainer } from '@/components/screen-container';
import { getMapDiagnosticEvents, getNativeMapDiagnostics, isIOSMapsDiagnosticsEnabled, newMapDiagnosticInstance, recordMapDiagnostic, validDiagnosticRegion } from '@/lib/ios-maps-diagnostics';
import { nativeInitializationObservation, type MapDiagnosticEvent, type NativeDiagnosticSnapshot } from '@/lib/maps-diagnostics-store';

// Public test coordinates, not the Rider's location. No GPS, route, marker or styling input.
const TEST_REGION: Region = { latitude: 5.6037, longitude: -0.187, latitudeDelta: 0.018, longitudeDelta: 0.018 };

class DiagnosticMapBoundary extends Component<{ children: ReactNode; instanceId: number }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { recordMapDiagnostic('minimal', this.props.instanceId, 'render-failed'); }
  render() {
    return this.state.failed
      ? <Text style={styles.warning}>The minimal map had a JavaScript render error. No error payload or API key is retained.</Text>
      : this.props.children;
  }
}

function MinimalDiagnosticMap({ instanceId }: { instanceId: number }) {
  const mapRef = useRef<MapView>(null);
  useFocusEffect(useCallback(() => {
    recordMapDiagnostic('minimal', instanceId, 'mounted');
    return () => recordMapDiagnostic('minimal', instanceId, 'unmounted');
  }, [instanceId]));
  return (
    <View style={styles.map} onLayout={({ nativeEvent: { layout } }) => {
      recordMapDiagnostic('minimal', instanceId, 'layout', { width: layout.width, height: layout.height, validCenter: true });
    }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={TEST_REGION}
        onMapReady={() => {
          recordMapDiagnostic('minimal', instanceId, 'ready-callback');
          try {
            void mapRef.current?.getCamera().then((camera) => {
              recordMapDiagnostic('minimal', instanceId, 'camera-read', {
                validCamera: Number.isFinite(camera.center.latitude) && Math.abs(camera.center.latitude) <= 90
                  && Number.isFinite(camera.center.longitude) && Math.abs(camera.center.longitude) <= 180 && Number.isFinite(camera.zoom),
                zoom: camera.zoom,
              });
            }).catch(() => recordMapDiagnostic('minimal', instanceId, 'camera-read-failed'));
          } catch { recordMapDiagnostic('minimal', instanceId, 'camera-read-failed'); }
        }}
        onMapLoaded={() => recordMapDiagnostic('minimal', instanceId, 'loaded-callback')}
        onRegionChangeComplete={(region) => recordMapDiagnostic('minimal', instanceId, 'region-complete', {
          validRegion: validDiagnosticRegion(region), latitudeDelta: region.latitudeDelta, longitudeDelta: region.longitudeDelta,
        })}
      />
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button}>
    <Text style={styles.buttonText}>{label}</Text>
  </TouchableOpacity>;
}

export default function MapsDiagnosticsScreen() {
  const router = useRouter();
  const enabled = isIOSMapsDiagnosticsEnabled();
  const [native, setNative] = useState<NativeDiagnosticSnapshot | null>(null);
  const [events, setEvents] = useState<MapDiagnosticEvent[]>([]);
  const [minimalInstance, setMinimalInstance] = useState<number | null>(null);
  const [homeVisual, setHomeVisual] = useState<'not checked' | 'streets visible' | 'blank'>('not checked');
  const [minimalVisual, setMinimalVisual] = useState<'not checked' | 'streets visible' | 'blank'>('not checked');
  const [copied, setCopied] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let disposed = false;
    let reading = false;
    const refresh = async () => {
      if (disposed) return;
      setEvents(getMapDiagnosticEvents());
      if (reading) return;
      reading = true;
      try {
        const snapshot = await getNativeMapDiagnostics();
        if (!disposed) setNative(snapshot);
      } finally { reading = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 1000);
    return () => { disposed = true; clearInterval(timer); setMinimalInstance(null); };
  }, [enabled]));

  if (!enabled) return <ScreenContainer style={styles.screen}>
    <View style={styles.section}>
      <Text style={styles.title}>Maps diagnostics unavailable</Text>
      <Text style={styles.text}>This screen requires the separately approved diagnostic iOS binary. It does not run on Android or the existing release.</Text>
      <Button label="Back" onPress={() => router.back()} />
    </View>
  </ScreenContainer>;

  const latestHome = events.filter((event) => event.surface === 'home').at(-1)?.instanceId;
  const homeEvents = events.filter((event) => event.surface === 'home' && event.instanceId === latestHome);
  const minimalEvents = events.filter((event) => event.surface === 'minimal' && event.instanceId === minimalInstance);
  const status = (items: MapDiagnosticEvent[]) => {
    const layout = items.filter((event) => event.name === 'layout').at(-1);
    return `Layout: ${layout ? `${layout.details.width} × ${layout.details.height}` : 'not observed'} · Ready: ${items.some((event) => event.name === 'ready-callback' || event.name === 'ready-state-observed') ? 'observed' : 'not observed'} · Tile-finish callback: ${items.some((event) => event.name === 'loaded-callback') ? 'observed' : 'not observed'}`;
  };
  const report = JSON.stringify({
    diagnosticSchema: 1,
    nativeClock: 'Native process monotonic elapsed time; compare native events only.',
    javaScriptClock: 'Separate JS session elapsed time; not synchronized with native.',
    native,
    mapEvents: events,
    visualObservations: { home: homeVisual, minimal: minimalVisual },
    limitation: 'Local key-return value and SDK callbacks do not prove server authorization or visible streets. No native SDK authorization-log capture is implemented.',
  }, null, 2);

  return <ScreenContainer style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button label="Back to Account" onPress={() => router.back()} />
      <Text style={styles.title}>iOS Maps diagnostics</Text>
      <Text style={styles.warning}>Diagnostic only—not a map fix. No ride booking is needed. No data is sent automatically.</Text>
      <Text style={styles.text}>Build: {native ? `${native.appVersion} (${native.buildNumber})` : 'native snapshot unavailable'} · Bundle: {native?.bundleIdentifier ?? 'unavailable'}</Text>
      <Text style={styles.text}>{nativeInitializationObservation(native)}</Text>
      <Text style={styles.caption}>A true key-return value means the local SDK call returned true, not that Google authorized every map request. Missing callbacks are observations, not a diagnosis.</Text>

      <View style={styles.section}>
        <Text style={styles.heading}>Normal Home map</Text>
        <Text style={styles.text}>{homeEvents.length ? status(homeEvents) : 'No Home map instance observed. The address-first Home intentionally does not mount a map; choose a destination preview without requesting a ride.'}</Text>
        <Text style={styles.caption}>The normal map’s camera, routes and realistic vehicle motion are unchanged. Its last observations remain available after you visit Account.</Text>
        <Text style={styles.text}>Your visual result: {homeVisual}</Text>
        <Button label="Home streets visible" onPress={() => setHomeVisual('streets visible')} />
        <Button label="Home map blank" onPress={() => setHomeVisual('blank')} />
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Minimal Google map</Text>
        <Text style={styles.text}>Fixed Accra camera; no custom map style, markers, route overlays, tracking inputs or location permission. It shares this process’s Google SDK initialization.</Text>
        <Text style={styles.caption}>For a minimal-first test, close and reopen the diagnostic app, then go straight to Account → iOS Maps diagnostics before opening a Home destination preview.</Text>
        <Button label={minimalInstance === null ? 'Start minimal map' : 'Restart minimal map'} onPress={() => {
          setMinimalVisual('not checked'); setCopied(false); setMinimalInstance(newMapDiagnosticInstance());
        }} />
        {minimalInstance !== null && <>
          <DiagnosticMapBoundary key={minimalInstance} instanceId={minimalInstance}>
            <MinimalDiagnosticMap instanceId={minimalInstance} />
          </DiagnosticMapBoundary>
          <Text style={styles.text}>{status(minimalEvents)}</Text>
          <Button label="Stop minimal map" onPress={() => setMinimalInstance(null)} />
          <Text style={styles.text}>Wait 45 seconds and inspect actual streets and labels. Your visual result: {minimalVisual}</Text>
          <Button label="Minimal streets visible" onPress={() => setMinimalVisual('streets visible')} />
          <Button label="Minimal map blank" onPress={() => setMinimalVisual('blank')} />
        </>}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Native event order</Text>
        <Text style={styles.caption}>All times below use the same native clock. Map creation has no JS surface label; use the minimal-first test to identify the first instance.</Text>
        {native?.events.length ? native.events.slice(-20).map((event, index) =>
          <Text key={`${index}-${event.name}-${event.elapsedMs}`} selectable style={styles.mono}>{event.elapsedMs.toFixed(1)} ms · {event.name} · {JSON.stringify(event.details)}</Text>,
        ) : <Text style={styles.text}>No native events available.</Text>}
      </View>
      <Button label={copied ? 'Report copied' : 'Copy redacted diagnostic report'} onPress={() => { Clipboard.setString(report); setCopied(true); }} />
      <Text style={styles.caption}>The report excludes the API key, personal coordinates, driver/trip identifiers and raw error payloads. SDK authorization messages are not automatically captured here. A native fatal exception cannot be caught by this JavaScript screen.</Text>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#0A0A0A' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' },
  heading: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  text: { color: '#F3F4F6', fontSize: 14, lineHeight: 21 },
  caption: { color: '#B5BCC7', fontSize: 12, lineHeight: 18, marginVertical: 6 },
  warning: { color: '#F5D778', fontSize: 14, lineHeight: 21 },
  section: { borderWidth: 1, borderColor: '#374151', borderRadius: 14, padding: 14, gap: 6 },
  button: { minHeight: 44, borderRadius: 10, backgroundColor: '#006B3F', padding: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  map: { height: 300, width: '100%', backgroundColor: '#E8EDF2', overflow: 'hidden', borderRadius: 10 },
  mono: { color: '#E5E7EB', fontSize: 11, lineHeight: 17, fontFamily: 'Menlo', marginBottom: 4 },
});
