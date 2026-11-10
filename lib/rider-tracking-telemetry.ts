export type RiderTrackingTelemetrySample = {
  sampleId: string;
  clientSentAtMs: number;
  serverReceivedAtMs: number;
  riderReceivedAtMs: number;
  driverToBackendMs: number;
  backendToRiderMs: number;
  endToEndMs: number;
};

const MAX_REASONABLE_LATENCY_MS = 10 * 60 * 1000;

function finiteTimestamp(value: unknown) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

/**
 * Computes approximate transport latency from the three clocks carried by a
 * location sample. Mobile clocks are normally network-synchronised, but any
 * large clock skew is rejected rather than reported as a misleading metric.
 */
export function measureRiderTrackingTelemetry(
  telemetry: Record<string, unknown> | null | undefined,
  riderReceivedAtMs = Date.now(),
): RiderTrackingTelemetrySample | null {
  if (!telemetry || typeof telemetry !== 'object') return null;
  const sampleId = String(telemetry.sample_id || '').trim();
  const clientSentAtMs = finiteTimestamp(telemetry.client_sent_at_ms);
  const serverReceivedAtMs = finiteTimestamp(telemetry.server_received_at_ms);
  const riderReceived = finiteTimestamp(riderReceivedAtMs);
  if (!sampleId || clientSentAtMs === null || serverReceivedAtMs === null || riderReceived === null) return null;

  const driverToBackendMs = serverReceivedAtMs - clientSentAtMs;
  const backendToRiderMs = riderReceived - serverReceivedAtMs;
  const endToEndMs = riderReceived - clientSentAtMs;
  if ([driverToBackendMs, backendToRiderMs, endToEndMs].some((value) => (
    value < 0 || value > MAX_REASONABLE_LATENCY_MS
  ))) return null;

  return {
    sampleId,
    clientSentAtMs,
    serverReceivedAtMs,
    riderReceivedAtMs: riderReceived,
    driverToBackendMs,
    backendToRiderMs,
    endToEndMs,
  };
}

export function logRiderTrackingTelemetry(sample: RiderTrackingTelemetrySample) {
  // Deliberately log only a random sample ID and timing values. No UID,
  // coordinates, phone number, ride ID, or vehicle information is included.
  console.info('[HY3N][tracking-latency]', {
    sampleId: sample.sampleId,
    driverToBackendMs: sample.driverToBackendMs,
    backendToRiderMs: sample.backendToRiderMs,
    endToEndMs: sample.endToEndMs,
  });
}
