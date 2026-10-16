import React, { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ScreenContainer } from '@/components/screen-container';
import { useAuth } from '@/lib/auth-context';
import { getRiderHistory } from '@/lib/rider-history-api';
import {
  normalizeRiderHistoryRide,
  riderHistoryStatusLabel,
  type RiderHistoryRide,
  type RiderHistoryStatus,
} from '@/lib/rider-history';
import { useColors } from '@/hooks/use-colors';

const GOLD = '#D4AF37';
const GREEN = '#006B3F';
const RED = '#CE1126';

const STATUS_COLORS: Record<RiderHistoryStatus, string> = {
  completed: GREEN,
  cancelled: RED,
  upcoming: GOLD,
  other: '#9CA3AF',
};

type HistoryBoundaryState = {
  failed: boolean;
  retryKey: number;
};

/**
 * History is intentionally isolated from the rest of the Rider route tree.
 * An unexpected presentation error must show a History-specific retry state,
 * never take the whole Rider app to the generic trip recovery screen.
 */
class HistoryRouteBoundary extends Component<{ children: ReactNode }, HistoryBoundaryState> {
  state: HistoryBoundaryState = { failed: false, retryKey: 0 };

  static getDerivedStateFromError(): Partial<HistoryBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HY3N] Rider History route error', error, info.componentStack);
  }

  private retry = () => {
    this.setState((previous) => ({ failed: false, retryKey: previous.retryKey + 1 }));
  };

  render() {
    if (!this.state.failed) {
      return <View key={this.state.retryKey} style={{ flex: 1 }}>{this.props.children}</View>;
    }

    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#0A0A0A' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${RED}1A`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <MaterialIcons name="history" size={32} color={RED} />
        </View>
        <Text style={{ color: '#FAFAFA', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>History needs to reload</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 24 }}>
          Your rides remain safely stored. Tap below to reopen Past Rides.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Reload rider history"
          onPress={this.retry}
          style={{ minWidth: 220, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center', backgroundColor: GREEN }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Reload History</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

function historyDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Trip date not recorded';

  const elapsedHours = (Date.now() - date.getTime()) / 3_600_000;
  if (elapsedHours < 1) return 'Just now';
  if (elapsedHours < 24) return `${Math.max(1, Math.floor(elapsedHours))}h ago`;
  if (elapsedHours < 48) return 'Yesterday';
  return date.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

function HistoryContent() {
  const { user } = useAuth();
  const colors = useColors();
  const [rides, setRides] = useState<RiderHistoryRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRide, setSelectedRide] = useState<RiderHistoryRide | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user?.uid) {
      setRides([]);
      setErrorMessage('Please sign in again to view your ride history.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const serverRides = await getRiderHistory(50);
      setRides(serverRides.map(normalizeRiderHistoryRide));
    } catch {
      setRides([]);
      setErrorMessage('Your ride history is temporarily unavailable. Pull down to try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const pastRides = useMemo(() => rides.filter((ride) => ride.status !== 'upcoming'), [rides]);

  const refreshHistory = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  if (selectedRide) {
    const statusColor = STATUS_COLORS[selectedRide.status];
    const total = selectedRide.fare + (selectedRide.tip || 0);
    return (
      <ScreenContainer style={{ backgroundColor: colors.background }}>
        <View testID="history-trip-details-overlay" style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close trip details"
              onPress={() => setSelectedRide(null)}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800' }}>Trip Details</Text>
          </View>

          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ backgroundColor: `${statusColor}1A`, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${statusColor}55` }}>
              <Text style={{ color: statusColor, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' }}>{riderHistoryStatusLabel(selectedRide.status)}</Text>
              <Text style={{ color: colors.muted, marginTop: 5, fontSize: 13 }}>{historyDate(selectedRide.created_date)}</Text>
            </View>

            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 10 }}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>ROUTE</Text>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{selectedRide.pickup_address}</Text>
              <View style={{ width: 2, height: 16, backgroundColor: colors.border, marginLeft: 4 }} />
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{selectedRide.destination_address}</Text>
            </View>

            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 10 }}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>TRIP SUMMARY</Text>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>Distance · {selectedRide.distance.toFixed(1)} km</Text>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>Duration · {selectedRide.duration} min</Text>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>Payment · {selectedRide.payment}</Text>
              <View style={{ height: 0.5, backgroundColor: colors.border, marginVertical: 2 }} />
              <Text style={{ color: GOLD, fontSize: 17, fontWeight: '800' }}>Total paid · GH₵{total.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={{ backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: '800' }}>History</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 3 }}>Your past HY3N rides</Text>
      </View>

      <FlatList
        testID="rider-history-list"
        data={pastRides}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshHistory} tintColor={GOLD} />}
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status];
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`View trip to ${item.destination_address}`}
              onPress={() => setSelectedRide(normalizeRiderHistoryRide(item))}
              style={{ backgroundColor: colors.card, borderRadius: 15, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: statusColor }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}>{riderHistoryStatusLabel(item.status)}</Text>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: '800', marginTop: 5 }}>{item.destination_address}</Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{item.pickup_address}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: GOLD, fontSize: 16, fontWeight: '800' }}>GH₵{item.fare.toFixed(2)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{historyDate(item.created_date)}</Text>
                </View>
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>{item.category} · {item.distance.toFixed(1)} km · {item.duration} min</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 80 }}>
            {loading ? (
              <>
                <ActivityIndicator size="large" color={GOLD} />
                <Text style={{ color: colors.muted, marginTop: 16, fontSize: 14 }}>Loading your rides...</Text>
              </>
            ) : errorMessage ? (
              <>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${RED}18`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <MaterialIcons name="cloud-off" size={32} color={RED} />
                </View>
                <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>History is temporarily unavailable</Text>
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 }}>{errorMessage}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Retry ride history"
                  onPress={() => void loadHistory()}
                  style={{ marginTop: 18, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: GREEN }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <MaterialIcons name="history" size={32} color={colors.muted} />
                </View>
                <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800' }}>No past rides yet</Text>
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 7 }}>Your completed rides will appear here.</Text>
              </>
            )}
          </View>
        }
      />
    </ScreenContainer>
  );
}

export default function HistoryScreen() {
  return (
    <HistoryRouteBoundary>
      <HistoryContent />
    </HistoryRouteBoundary>
  );
}
