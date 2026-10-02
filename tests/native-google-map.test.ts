import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const component = readFileSync(path.join(process.cwd(), 'components/NativeGoogleMap.tsx'), 'utf8');
const screen = readFileSync(path.join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');

describe('Rider native Google Maps migration', () => {
  it('uses Google Maps with an animated branded driver marker, not a WebView', () => {
    expect(component).toContain('provider={PROVIDER_GOOGLE}');
    expect(component).toContain('Marker.Animated');
    expect(component).toContain('animatedDriverCoordinate.timing');
    expect(component).not.toContain('react-native-webview');
  });

  it('renders the active Rider screen with the native renderer', () => {
    expect(screen).toContain('NativeGoogleMap');
    expect(screen).not.toContain('import LeafletMap from');
  });
});
