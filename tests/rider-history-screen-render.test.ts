import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockHistory = vi.fn();
const mockRider = { uid: 'rider-render-test' };

vi.mock('react-native', () => {
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  const FlatList = ({ data = [], renderItem, ListEmptyComponent, ...props }: any) => React.createElement(
    'FlatList',
    props,
    data.length
      ? data.map((item: unknown, index: number) => React.createElement(
        React.Fragment,
        { key: String((item as any)?.id ?? index) },
        renderItem({ item, index }),
      ))
      : ListEmptyComponent,
  );

  return {
    ActivityIndicator: host('ActivityIndicator'),
    FlatList,
    RefreshControl: host('RefreshControl'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    View: host('View'),
  };
});

vi.mock('@expo/vector-icons/MaterialIcons', () => ({ default: ({ name, ...props }: any) => React.createElement('MaterialIcon', { ...props, name }) }));
vi.mock('@/components/screen-container', () => ({ ScreenContainer: ({ children, ...props }: any) => React.createElement('ScreenContainer', props, children) }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: mockRider }) }));
vi.mock('@/lib/rider-history-api', () => ({ getRiderHistory: mockHistory }));
vi.mock('@/hooks/use-colors', () => ({
  useColors: () => ({
    background: '#0A0A0A', surface: '#111111', card: '#1A1A1A', border: '#2A2A2A', foreground: '#FAFAFA', muted: '#9CA3AF',
  }),
}));

type Renderer = {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (node: React.ReactElement) => { root: { findAll: (predicate: (node: any) => boolean) => any[] }; unmount: () => void };
};

async function renderHistoryWith(result: unknown[] | Error) {
  const renderer = require('react-test-renderer') as Renderer;
  const HistoryScreen = (await import('@/app/(tabs)/history')).default;
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  if (result instanceof Error) mockHistory.mockRejectedValueOnce(result);
  else mockHistory.mockResolvedValueOnce(result);

  let view: ReturnType<Renderer['create']> | undefined;
  await renderer.act(async () => {
    view = renderer.create(React.createElement(HistoryScreen));
  });
  await renderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { renderer, view: view! };
}

afterEach(() => {
  mockHistory.mockReset();
});

describe('isolated Rider History tab', () => {
  it('makes the visible History tab use the isolated screen, while legacy Activity deep links use it too', () => {
    const history = readFileSync(resolve(process.cwd(), 'app/(tabs)/history.tsx'), 'utf8');
    const activity = readFileSync(resolve(process.cwd(), 'app/(tabs)/activity.tsx'), 'utf8');

    expect(history).toContain('class HistoryRouteBoundary');
    expect(history).toContain('getRiderHistory(50)');
    expect(history).not.toContain('expo-print');
    expect(history).not.toContain('expo-sharing');
    expect(history).not.toContain("from '@/lib/firebase'");
    expect(activity).toContain("export { default } from './history'");
  });

  it('renders a legacy history row and opens safe in-route details without a native modal', async () => {
    const { renderer, view } = await renderHistoryWith([{
      id: 'history-legacy',
      status: 'completed',
      pickup: { address: 'Pickup legacy address' },
      destination: { name: 'Destination legacy name' },
      final_fare: '16.00',
      distance_km: '2.4',
      duration_minutes: '11',
      payment_method: 'cash',
      created_at: { seconds: 1_790_992_000 },
    }]);

    const cards = view.root.findAll((node) => node.type === 'TouchableOpacity' && node.props.style?.borderLeftWidth === 3);
    expect(cards).toHaveLength(1);

    await renderer.act(async () => {
      cards[0].props.onPress();
    });

    expect(view.root.findAll((node) => node.props.testID === 'history-trip-details-overlay').length).toBeGreaterThan(0);
    expect(view.root.findAll((node) => node.type === 'Modal' && node.props.visible === true)).toHaveLength(0);
    expect(view.root.findAll((node) => node.type === 'Text' && String(node.props.children).includes('Total paid') && String(node.props.children).includes('16.00'))).toHaveLength(1);
    await renderer.act(async () => view.unmount());
  });

  it('shows a History-specific retry state when the protected API is unavailable instead of throwing into global recovery', async () => {
    const { renderer, view } = await renderHistoryWith(new Error('network unavailable'));

    expect(view.root.findAll((node) => node.type === 'Text' && node.props.children === 'History is temporarily unavailable')).toHaveLength(1);
    expect(view.root.findAll((node) => node.type === 'Text' && node.props.children === 'Let’s reopen your ride safely')).toHaveLength(0);
    await renderer.act(async () => view.unmount());
  });
});
