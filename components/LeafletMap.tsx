import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { MAP_MARKER_ASSETS } from "./map-marker-assets";

interface NearbyDriver {
  id: string;
  lat: number;
  lng: number;
  etaMinutes?: number;
  heading?: number;
  vehicleColourHex?: string;
  vehicleLabel?: string;
  serviceType?: string;
}

interface LeafletMapProps {
  style?: object;
  colorScheme?: "light" | "dark";
  center?: [number, number];
  zoom?: number;
  userLocation?: [number, number];
  destination?: [number, number] | null;
  driverLocation?: [number, number] | null;
  driverBearing?: number | null;
  driverColourHex?: string | null;
  driverVehicle?: string | null;
  driverServiceType?: string | null;
  driverEtaMinutes?: number | null;
  driverDistanceKm?: number | null;
  driverTracking?: boolean;
  driverTrackingTarget?: [number, number] | null;
  tripStatus?: string | null;
  safetySignal?: "clear" | "route_deviation" | "long_stop";
  nearbyDrivers?: NearbyDriver[];
  onRouteMetrics?: (metrics: { distanceKm: number; durationMinutes: number; phase: "pickup" | "destination" }) => void;
}

export interface LeafletMapRef {
  panTo: (lat: number, lng: number) => void;
  fitBounds: (points: [number, number][]) => void;
}

const FALLBACK_CENTER: [number, number] = [5.6037, -0.187];
const DEFAULT_ZOOM = 14;

function isCoordinate(value: [number, number] | null | undefined): value is [number, number] {
  return Boolean(
    value
      && Number.isFinite(value[0])
      && Number.isFinite(value[1])
      && Math.abs(value[0]) <= 90
      && Math.abs(value[1]) <= 180,
  );
}

function normaliseColour(value?: string | null, fallback = "#D4AF37") {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value! : fallback;
}

function markerKind(value?: string | null): "car" | "okada" | "delivery" {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("deliver")) return "delivery";
  if (normalized.includes("okada") || normalized.includes("moto")) return "okada";
  return "car";
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

type MapPayload = {
  theme: "light" | "dark";
  user: [number, number] | null;
  destination: [number, number] | null;
  driver: { point: [number, number]; colour: string; label: string; bearing: number | null; metric: string; kind: "car" | "okada" | "delivery" } | null;
  pickup: [number, number] | null;
  nearby: Array<{ id: string; point: [number, number]; colour: string; label: string; eta: number; bearing: number | null; kind: "car" | "okada" | "delivery" }>;
  route: { points: Array<[number, number]>; colour: string } | null;
};

function buildMapHtml(initialCenter: [number, number], initialPayload: MapPayload) {
  const center = safeJson(initialCenter);
  const payload = safeJson(initialPayload);
  const markerAssets = safeJson(MAP_MARKER_ASSETS);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #18232f; }
    body[data-theme="light"], body[data-theme="light"] #map { background: #f3f4f6; }
    body[data-theme="dark"] .leaflet-tile { filter: invert(92%) hue-rotate(180deg) brightness(.68) contrast(.78) saturate(.55); }
    .leaflet-control-attribution { font-size: 9px; opacity: .55; background: rgba(24,35,47,.72); color: #d8dee5; }
    .leaflet-control-attribution a { color: #d8dee5; }
    body[data-theme="light"] .leaflet-control-attribution { background: rgba(255,255,255,.82); color: #4b5563; }
    body[data-theme="light"] .leaflet-control-attribution a { color: #374151; }
    .leaflet-control-zoom { display: none; }
    .vehicle-icon { width: 52px; height: 52px; position: relative; transform-origin: center; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
    .vehicle-icon .vehicle-art { display: block; width: 52px; height: 52px; object-fit: contain; }
    .vehicle-icon .label { position: absolute; top: -17px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.82); color: white; padding: 3px 6px; border-radius: 6px; font: 600 10px -apple-system,BlinkMacSystemFont,sans-serif; white-space: nowrap; }
    .user-dot { width: 22px; height: 22px; border-radius: 50%; background: #006b3f; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
    .destination-pin, .pickup-pin { width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
    .destination-pin { background: #ce1126; } .pickup-pin { background: #006b3f; }
    .destination-pin::after, .pickup-pin::after { content: ''; position: absolute; width: 6px; height: 6px; border-radius: 50%; background: white; top: 5px; left: 5px; }
  </style>
</head>
<body>
<div id="map" aria-label="HY3N live map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
(function () {
  const initialCenter = ${center};
  const initialPayload = ${payload};
  const markerAssets = ${markerAssets};
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    fadeAnimation: false,
    zoomAnimation: false,
    markerZoomAnimation: false,
    inertia: false,
    trackResize: true,
  }).setView(initialCenter, ${DEFAULT_ZOOM});
  // Use a restrained basemap that follows the app's active appearance.
  let tileLayer = null;
  let activeTileTheme = null;
  const setTileTheme = (theme) => {
    const tileTheme = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = theme === 'light' ? 'light' : 'dark';
    if (tileLayer && activeTileTheme === tileTheme) return;
    if (tileLayer) map.removeLayer(tileLayer);
    // OpenStreetMap is keyless. Dark Mode is applied locally to the tile
    // pixels, avoiding providers that display an API-key-required watermark.
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 4,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    activeTileTheme = tileTheme;
  };
  setTileTheme(initialPayload.theme);
  const layers = { user: null, destination: null, driver: null, pickup: null, nearby: [], route: null };
  let userMovedMap = false;
  let lastUserPoint = initialPayload.user;
  map.on('dragstart zoomstart', () => { userMovedMap = true; });
  const point = (p) => [p[0], p[1]];
  const icon = (className, html, size, anchor) => L.divIcon({ className: '', html, iconSize: size, iconAnchor: anchor });
  const userIcon = () => icon('user', '<div class="user-dot"></div>', [22,22], [11,11]);
  const pinIcon = (kind) => icon(kind, '<div class="' + kind + '-pin"></div>', [22,22], [11,22]);
  const vehicleIcon = (item) => icon('vehicle', '<div class="vehicle-icon" style="transform:rotate(' + (Number(item.bearing || 0)) + 'deg)"><div class="label">' + String(item.label || 'HY3N') + '</div><img class="vehicle-art" src="' + (markerAssets[item.kind || 'car'] || markerAssets.car) + '" alt="HY3N vehicle" /></div>', [52,52], [26,26]);
  const remove = (key) => { if (layers[key]) { map.removeLayer(layers[key]); layers[key] = null; } };
  const clearNearby = () => { layers.nearby.forEach((layer) => map.removeLayer(layer)); layers.nearby = []; };
  const draw = (state, fit) => {
    setTileTheme(state.theme);
    map.invalidateSize(false);
    remove('user'); remove('destination'); remove('driver'); remove('pickup'); remove('route'); clearNearby();
    if (state.user) layers.user = L.marker(point(state.user), { icon: userIcon(), zIndexOffset: 100 }).addTo(map).bindPopup('Your pickup location');
    if (state.destination) layers.destination = L.marker(point(state.destination), { icon: pinIcon('destination'), zIndexOffset: 50 }).addTo(map).bindPopup('Destination');
    if (state.driver) layers.driver = L.marker(point(state.driver.point), { icon: vehicleIcon(state.driver), zIndexOffset: 300 }).addTo(map).bindPopup(state.driver.label + '<br>' + state.driver.metric);
    if (state.pickup) layers.pickup = L.marker(point(state.pickup), { icon: pinIcon('pickup'), zIndexOffset: 200 }).addTo(map).bindPopup('Pickup');
    (state.nearby || []).forEach((item) => {
      const marker = L.marker(point(item.point), { icon: vehicleIcon(item), zIndexOffset: 150 }).addTo(map).bindPopup(item.label + '<br>' + item.eta + ' min away');
      layers.nearby.push(marker);
    });
    if (state.route && state.route.points.length > 1) layers.route = L.polyline(state.route.points.map(point), { color: state.route.colour, weight: 5, opacity: .9 }).addTo(map);
    if (!userMovedMap && state.user && !state.driver && !state.destination) {
      const previous = lastUserPoint;
      const moved = !previous || Math.abs(previous[0] - state.user[0]) > 0.001 || Math.abs(previous[1] - state.user[1]) > 0.001;
      if (moved) map.setView(point(state.user), 15, { animate: false });
    }
    lastUserPoint = state.user || lastUserPoint;
    if (fit) {
      const points = [];
      if (state.user) points.push(point(state.user)); if (state.destination) points.push(point(state.destination)); if (state.driver) points.push(point(state.driver.point)); if (state.pickup) points.push(point(state.pickup));
      (state.nearby || []).forEach((item) => points.push(point(item.point)));
      if (points.length > 1) map.fitBounds(points, { paddingTopLeft: [32, 80], paddingBottomRight: [32, 300], maxZoom: 15 });
      else if (points.length === 1) map.setView(points[0], ${DEFAULT_ZOOM});
    }
  };
  draw(initialPayload, false);
  const refreshViewport = () => map.invalidateSize(true);
  setTimeout(refreshViewport, 100);
  setTimeout(refreshViewport, 350);
  setTimeout(refreshViewport, 800);
  setTimeout(() => { refreshViewport(); window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map-ready' })); }, 1200);
  document.addEventListener('message', (event) => {
    try { const message = JSON.parse(event.data); if (message.type === 'update') draw(message.payload, false); if (message.type === 'pan') { userMovedMap = true; map.setView(message.point, message.zoom || ${DEFAULT_ZOOM}, { animate: true }); } if (message.type === 'fit') { userMovedMap = true; map.fitBounds(message.points, { paddingTopLeft: [32,80], paddingBottomRight: [32,300], maxZoom: 15, animate: true }); } } catch (_) {}
  });
  window.addEventListener('message', (event) => { try { const message = JSON.parse(event.data); if (message.type === 'update') draw(message.payload, false); } catch (_) {} });
})();
</script>
</body>
</html>`;
}

const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    style,
    center = FALLBACK_CENTER,
    userLocation,
    colorScheme = "dark",
    destination = null,
    driverLocation = null,
    driverBearing = null,
    driverColourHex = null,
    driverVehicle = null,
    driverServiceType = null,
    driverEtaMinutes = null,
    driverDistanceKm = null,
    driverTracking = false,
    driverTrackingTarget = null,
    tripStatus = null,
    safetySignal: _safetySignal = "clear",
    nearbyDrivers = [],
  },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const initialCenter = isCoordinate(userLocation) ? userLocation : (isCoordinate(center) ? center : FALLBACK_CENTER);
  const nearby = useMemo(() => nearbyDrivers.filter((driver) => isCoordinate([driver.lat, driver.lng])).slice(0, 8), [nearbyDrivers]);
  const routeTarget = driverTracking && isCoordinate(driverLocation) && isCoordinate(driverTrackingTarget)
    ? driverTrackingTarget
    : !driverLocation && isCoordinate(userLocation) && isCoordinate(destination) ? destination : null;
  const routeStart = driverTracking && isCoordinate(driverLocation) ? driverLocation : isCoordinate(userLocation) ? userLocation : null;
  const routePoints = routeStart && routeTarget ? [routeStart, routeTarget] : [];
  const payload = useMemo<MapPayload>(() => ({
    theme: colorScheme,
    user: isCoordinate(userLocation) ? userLocation : null,
    destination: isCoordinate(destination) && (!driverTracking || tripStatus === "in_progress") ? destination : null,
    driver: isCoordinate(driverLocation) ? {
      point: driverLocation,
      colour: normaliseColour(driverColourHex, "#006B3F"),
      label: driverVehicle || (driverServiceType ? `${driverServiceType} Driver` : "HY3N Driver"),
      kind: markerKind(driverServiceType),
      bearing: Number.isFinite(Number(driverBearing)) ? Number(driverBearing) : null,
      metric: Number.isFinite(Number(driverDistanceKm)) && Number(driverDistanceKm) > 0 ? `${Number(driverDistanceKm).toFixed(1)} km away` : Number.isFinite(Number(driverEtaMinutes)) ? `${Math.max(1, Math.round(Number(driverEtaMinutes)))} min away` : "Driver location",
    } : null,
    pickup: driverTracking && isCoordinate(driverTrackingTarget) && tripStatus !== "in_progress" ? driverTrackingTarget : null,
    nearby: !driverTracking ? nearby.map((driver) => ({ id: driver.id, point: [driver.lat, driver.lng] as [number, number], colour: normaliseColour(driver.vehicleColourHex), label: driver.vehicleLabel || "HY3N vehicle", eta: Math.max(1, Math.round(driver.etaMinutes || 1)), bearing: Number.isFinite(Number(driver.heading)) ? Number(driver.heading) : null, kind: markerKind(driver.serviceType) })) : [],
    route: routePoints.length > 1 ? { points: routePoints, colour: driverTracking ? "#006B3F" : "#D4AF37" } : null,
  }), [colorScheme, destination, driverBearing, driverColourHex, driverDistanceKm, driverEtaMinutes, driverLocation, driverServiceType, driverTracking, driverTrackingTarget, driverVehicle, nearby, routePoints, tripStatus, userLocation]);
  const initialHtmlRef = useRef<string | null>(null);
  if (!initialHtmlRef.current) initialHtmlRef.current = buildMapHtml(initialCenter, payload);

  useEffect(() => {
    if (!webViewReady) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: "update", payload }));
  }, [payload, webViewReady]);

  useImperativeHandle(ref, () => ({
    panTo(latitude, longitude) {
      if (!isCoordinate([latitude, longitude])) return;
      webViewRef.current?.postMessage(JSON.stringify({ type: "pan", point: [latitude, longitude], zoom: DEFAULT_ZOOM }));
    },
    fitBounds(points) {
      const valid = points.filter(isCoordinate);
      if (valid.length === 0) return;
      webViewRef.current?.postMessage(JSON.stringify({ type: "fit", points: valid }));
    },
  }), []);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "map-ready") setWebViewReady(true);
    } catch {
      // Ignore messages from the tile page that are not JSON.
    }
  };

  return (
    <View style={[{ flex: 1, backgroundColor: "#18232F" }, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: initialHtmlRef.current || "" }}
        style={{ flex: 1, backgroundColor: "#18232F" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript("window.dispatchEvent(new Event('resize')); true;");
        }}
      />
    </View>
  );
});

export default LeafletMap;
