import { describe, expect, it } from 'vitest';
import { waitForRiderNativeUnmount } from '../lib/rider-signout-transition';

describe('Rider sign-out transition', () => {
  it('waits for two render frames before Firebase auth is revoked', async () => {
    const frames: Array<() => void> = [];
    let settled = false;
    const barrier = waitForRiderNativeUnmount((callback) => frames.push(callback))
      .then(() => { settled = true; });

    expect(frames).toHaveLength(1);
    frames.shift()?.();
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    expect(settled).toBe(false);

    frames.shift()?.();
    await barrier;
    expect(settled).toBe(true);
  });
});
