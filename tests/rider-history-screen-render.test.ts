import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
const mockRider = { uid: 'rider-render-test' };

vi.mock('react-native', () => {
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  const FlatList = ({ data = [], renderItem, ...props }: any) => React.createElement(
    'FlatList',
    props,
    data.map((item: unknown, index: number) => React.createElement(
      React.Fragment,
      { key: String((item as any)?.id ?? index) },
      renderItem({ item, index }),
    )),
  );
  const Modal = ({ visible, children, ...props }: any) => visible
    ? React.createElement('Modal', { ...props, visible }, children)
    : null;

  return {
    ActivityIndicator: host('ActivityIndicator'),
    Alert: { alert: vi.fn() },
    FlatList,
    Linking: { canOpenURL: vi.fn(async () => true), openURL: vi.fn(async () => undefined) },
    Modal,
    RefreshControl: host('RefreshControl'),
    ScrollView: host('ScrollView'),
    Share: { share: vi.fn(async () => undefined) },
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    View: host('View'),
  };
});

vi.mock('expo-print', () => ({ printToFileAsync: vi.fn(async () => ({ uri: 'file://invoice.pdf' })) }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: vi.fn(async () => undefined) }));
vi.mock('@expo/vector-icons/MaterialIcons', () => ({ default: ({ name, ...props }: any) => React.createElement('MaterialIcon', { ...props, name }) }));
vi.mock('@/components/screen-container', () => ({ ScreenContainer: ({ children, ...props }: any) => React.createElement('ScreenContainer', props, children) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: mockRider }) }));
vi.mock('@/lib/firebase', () => ({
  COLLECTIONS: { RIDE_REPORTS: 'ride_reports', SUPPORT_TICKETS: 'support_tickets' },
  firestoreDB: { list: mockList, create: vi.fn(async () => ({ id: 'created' })) },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { setItem: vi.fn(async () => undefined) } }));
vi.mock('@/hooks/use-colors', () => ({
  useColors: () => ({
    background: '#0A0A0A', surface: '#111111', card: '#1A1A1A', border: '#2A2A2A', foreground: '#FAFAFA', muted: '#9CA3AF',
  }),
}));

type Renderer = {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (node: React.ReactElement) => { root: { findAll: (predicate: (node: any) => boolean) => any[] }; unmount: () => void };
};

async function renderHistoryWith(record: Record<string, unknown>) {
  // react-test-renderer is only used in this regression harness; production does not ship it.
  const renderer = require('react-test-renderer') as Renderer;
  const ActivityScreen = (await import('@/app/(tabs)/activity')).default;
  // Metro uses the automatic JSX runtime. Vitest transpiles this app file with
  // the classic runtime, so expose the same React binding only in this harness.
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mockList.mockResolvedValueOnce([record]);

  let view: ReturnType<Renderer['create']> | undefined;
  await renderer.act(async () => {
    view = renderer.create(React.createElement(ActivityScreen));
  });
  await renderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { renderer, view: view! };
}

afterEach(() => {
  mockList.mockReset();
});

describe('Rider History screen rendering', () => {
  it('does not initialize optional PDF or sharing native modules while History opens', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/(tabs)/activity.tsx'), 'utf8');

    expect(source).not.toContain('import * as Print from "expo-print"');
    expect(source).not.toContain('import * as Sharing from "expo-sharing"');
    expect(source).toContain('const Print = await import("expo-print")');
    expect(source).toContain('const Sharing = await import("expo-sharing")');
  });

  it('renders a legacy Firestore record and opens its detail sheet without throwing', async () => {
    const { renderer, view } = await renderHistoryWith({
      id: 'history-legacy',
      status: 'completed',
      pickup: { address: 'Pickup legacy address' },
      destination: { name: 'Destination legacy name' },
      final_fare: '16.00',
      distance_km: '2.4',
      duration_minutes: '11',
      payment_method: 'cash',
      created_at: { seconds: 1_790_992_000 },
      driver_name: 'Driver',
      driver_vehicle: null,
      driver_plate: null,
    });

    const cards = view.root.findAll((node) => node.type === 'TouchableOpacity' && node.props.style?.borderLeftWidth === 3);
    expect(cards).toHaveLength(1);

    await renderer.act(async () => {
      cards[0].props.onPress();
    });

    const detailModal = view.root.findAll((node) => node.type === 'Modal' && node.props.visible === true);
    expect(detailModal).toHaveLength(1);
    expect(view.root.findAll((node) => node.type === 'Text' && node.props.children === 'Trip Details')).toHaveLength(1);
    await renderer.act(async () => {
      view.unmount();
    });
  });

  it('renders a current completed-trip record that includes all lifecycle fields', async () => {
    const { renderer, view } = await renderHistoryWith({
      id: 'history-current',
      status: 'completed',
      created_date: '2026-10-03T14:00:00.000Z',
      completed_at: '2026-10-03T14:25:00.000Z',
      pickup_address: 'Pickup address',
      destination_address: 'Destination address',
      final_fare: 19,
      quoted_fare: 19,
      actual_distance_km: 1.8,
      distance_km: 1.8,
      duration: 9,
      tip_amount: 0,
      waiting_fee: 0,
      payment_method: 'cash',
      driver_name: 'Driver',
      driver_vehicle: 'Vehicle',
      driver_plate: 'Plate',
      driver_rating: 5,
      rider_rating: 5,
    });

    const cards = view.root.findAll((node) => node.type === 'TouchableOpacity' && node.props.style?.borderLeftWidth === 3);
    await renderer.act(async () => {
      cards[0].props.onPress();
    });

    expect(view.root.findAll((node) => node.type === 'Modal' && node.props.visible === true)).toHaveLength(1);
    expect(view.root.findAll((node) => node.type === 'Text' && node.props.children === 'Total Paid')).toHaveLength(1);
    await renderer.act(async () => {
      view.unmount();
    });
  });
});
