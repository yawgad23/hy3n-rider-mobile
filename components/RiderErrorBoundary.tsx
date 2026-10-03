import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type RiderErrorBoundaryProps = {
  children: ReactNode;
};

type RiderErrorBoundaryState = {
  error: Error | null;
  retryKey: number;
};

/**
 * Stops an unexpected render exception from terminating the native Rider app.
 * The original error remains in the device console for diagnostics, while the
 * Rider receives a clear recovery action instead of an iOS crash screen.
 */
export class RiderErrorBoundary extends Component<RiderErrorBoundaryProps, RiderErrorBoundaryState> {
  state: RiderErrorBoundaryState = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<RiderErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HY3N] Rider render recovery boundary caught an error', error, info.componentStack);
  }

  private retry = () => {
    this.setState((previous) => ({ error: null, retryKey: previous.retryKey + 1 }));
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View key={this.state.retryKey} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#0A0A0A' }}>
        <Text style={{ color: '#D4AF37', fontSize: 24, fontWeight: '800', marginBottom: 12 }}>HY3N</Text>
        <Text style={{ color: '#FAFAFA', fontSize: 21, fontWeight: '800', textAlign: 'center' }}>Let’s reopen your ride safely</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12, marginBottom: 24 }}>
          Your trip data remains safely on the server. Tap below to reload this screen.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Reload HY3N Rider"
          onPress={this.retry}
          style={{ minWidth: 220, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center', backgroundColor: '#006B3F' }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Reload HY3N</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
