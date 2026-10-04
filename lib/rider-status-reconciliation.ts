/**
 * Firestore provides live trip updates. This is only the authenticated fallback
 * when an iOS snapshot is paused, so it must stay bounded and must not restart
 * because a normal state update re-rendered the map.
 */
export const RIDER_STATUS_RECONCILIATION_INTERVAL_MS = 4_000;
