export type RiderFrameScheduler = (callback: () => void) => void;

const scheduleDefaultFrame: RiderFrameScheduler = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

/**
 * Lets the tab shell unmount native map screens before Firebase revokes the
 * Rider session. Two render frames prevent the old Home tab from briefly
 * remounting while a sign-out redirect is being applied.
 */
export function waitForRiderNativeUnmount(
  scheduleFrame: RiderFrameScheduler = scheduleDefaultFrame,
): Promise<void> {
  return new Promise((resolve) => {
    scheduleFrame(() => scheduleFrame(resolve));
  });
}
