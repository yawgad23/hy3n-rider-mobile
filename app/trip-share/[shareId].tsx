import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import NativeGoogleMap from '@/components/NativeGoogleMap';
import { getRecipientSharedTrip, type SharedTripSnapshot } from '@/lib/trip-share';

const BG = '#0A0A0A';
const CARD = '#1A1A1A';
const TEXT = '#FAFAFA';
const MUTED = '#9CA3AF';
const GREEN = '#006B3F';

function point(value: { latitude: number; longitude: number } | null | undefined): [number, number] | null {
  if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return null;
  return [value.latitude, value.longitude];
}

export default function SharedTripScreen() {
  const router = useRouter();
  const { shareId: rawShareId } = useLocalSearchParams<{ shareId?: string }>();
  const shareId = typeof rawShareId === 'string' ? rawShareId : '';
  const [snapshot, setSnapshot] = useState<SharedTripSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'active' | 'ended' | 'error'>('loading');

  const refresh = useCallback(async () => {
    if (!shareId || shareId.length > 128) { setState('ended'); return; }
    try {
      const next = await getRecipientSharedTrip(shareId);
      if (!next) { setSnapshot(null); setState('ended'); return; }
      setSnapshot(next);
      setState('active');
    } catch {
      setState((previous) => previous === 'active' ? 'active' : 'error');
    }
  }, [shareId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (state === 'loading') {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}><ActivityIndicator color={GREEN} /><Text style={{ color: MUTED, marginTop: 12 }}>Opening shared trip securely…</Text></View>;
  }
  if (state === 'ended' || !snapshot) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: BG }}><MaterialIcons name="lock" size={42} color={MUTED} /><Text style={{ color: TEXT, fontSize: 20, fontWeight: '800', marginTop: 16 }}>Trip sharing has ended</Text><Text style={{ color: MUTED, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>This trip is no longer shared with you. HY3N has cleared the live trip information.</Text><TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12, backgroundColor: CARD }}><Text style={{ color: TEXT, fontWeight: '700' }}>Close</Text></TouchableOpacity></View>;
  }

  const driverLocation = point(snapshot.driver.location);
  const pickup = point(snapshot.pickup);
  const destination = point(snapshot.destination);
  const routePoints = Array.isArray(snapshot.route.points) ? snapshot.route.points : [];
  return <View style={{ flex: 1, backgroundColor: BG }}>
    <NativeGoogleMap
      colorScheme="dark"
      center={driverLocation || pickup || destination}
      destination={destination}
      driverLocation={driverLocation}
      driverLocationUpdatedAt={snapshot.driver.location?.updatedAt || null}
      driverRouteUpdatedAt={snapshot.route.updatedAt}
      driverBearing={snapshot.driver.location?.heading || 0}
      driverTracking
      driverTrackingTarget={destination}
      driverRoutePoints={routePoints}
      routeOverview={false}
      tripStatus={snapshot.status}
    />
    <View style={{ position: 'absolute', top: 54, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close shared trip" style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: CARD }}><MaterialIcons name="close" size={24} color={TEXT} /></TouchableOpacity>
      <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: CARD }}><Text style={{ color: GREEN, fontWeight: '800', fontSize: 11, letterSpacing: 0.7 }}>PRIVATE HY3N TRIP</Text><Text style={{ color: TEXT, fontWeight: '800', fontSize: 16, marginTop: 2 }}>{snapshot.driver.name} is on the way</Text></View>
    </View>
    <View style={{ margin: 16, marginBottom: 28, padding: 18, backgroundColor: CARD, borderRadius: 20 }}>
      <Text style={{ color: TEXT, fontWeight: '800', fontSize: 16 }}>{snapshot.status.replace(/_/g, ' ')}</Text>
      <Text style={{ color: MUTED, marginTop: 6 }}>{snapshot.pickup?.label || 'Pickup'} → {snapshot.destination?.label || 'Destination'}</Text>
      {(snapshot.driver.vehicle || snapshot.driver.plate) && <Text style={{ color: MUTED, marginTop: 6 }}>{[snapshot.driver.vehicle, snapshot.driver.plate].filter(Boolean).join(' · ')}</Text>}
      {!driverLocation && <Text style={{ color: MUTED, marginTop: 8 }}>Waiting for a fresh Driver location.</Text>}
    </View>
  </View>;
}
