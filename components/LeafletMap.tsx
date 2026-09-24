import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import { MAP_MARKER_ASSETS } from "@/components/map-marker-assets";

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
  driverTracking?: boolean;
  driverTrackingTarget?: [number, number] | null;
  tripStatus?: string | null;
  safetySignal?: "clear" | "route_deviation" | "long_stop";
  nearbyDrivers?: NearbyDriver[];
}

export interface LeafletMapRef {
  panTo: (lat: number, lng: number) => void;
  fitBounds: (points: [number, number][]) => void;
}

const FALLBACK_CENTER: [number, number] = [5.6037, -0.187];
const safeHex = (value?: string | null, fallback = "#F5F5F5") => /^#[0-9a-fA-F]{6}$/.test(value || "") ? value! : fallback;
const cleanText = (value?: string | null, fallback = "") => String(value || fallback).replace(/[<>&"']/g, "").slice(0, 70);

const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    style,
    colorScheme = "dark",
    center = FALLBACK_CENTER,
    zoom = 14,
    userLocation,
    destination = null,
    driverLocation = null,
    driverBearing = null,
    driverColourHex = null,
    driverVehicle = null,
    driverServiceType = null,
    driverTracking = false,
    driverTrackingTarget = null,
    tripStatus = null,
    safetySignal = "clear",
    nearbyDrivers = [],
  },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const isDark = colorScheme === "dark";
  const mapBackground = isDark ? "#414853" : "#f3f5f7";
  // Use one key-free provider in both appearances. Carto's legacy endpoint
  // can return an API-key-required tile image on installed iOS apps, even
  // though it works in a browser. The dark treatment is applied locally so
  // the map stays dark grey without a provider key or a provider switch.
  const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileFilter = isDark ? "brightness(.46) saturate(.32) contrast(1.08)" : "none";

  const mapState = useMemo(() => {
    const normalizedNearby = nearbyDrivers
      .filter((driver) => Number.isFinite(driver.lat) && Number.isFinite(driver.lng))
      .slice(0, 10)
      .map((driver) => ({
        id: cleanText(driver.id),
        lat: driver.lat,
        lng: driver.lng,
        eta: Math.max(1, Math.round(driver.etaMinutes || 1)),
        heading: Number.isFinite(driver.heading) ? Number(driver.heading) : 0,
        colour: safeHex(driver.vehicleColourHex, "#F5F5F5"),
        label: cleanText(driver.vehicleLabel, "HY3N vehicle"),
        serviceType: cleanText(driver.serviceType, "car").toLowerCase(),
      }));

    return {
      center: userLocation || center,
      zoom,
      user: userLocation ? { lat: userLocation[0], lng: userLocation[1] } : null,
      destination: destination ? { lat: destination[0], lng: destination[1] } : null,
      driver: driverLocation ? {
        lat: driverLocation[0],
        lng: driverLocation[1],
        heading: typeof driverBearing === "number" ? driverBearing : 0,
        colour: safeHex(driverColourHex, "#F5F5F5"),
        label: cleanText(driverVehicle, "Driver vehicle"),
        serviceType: cleanText(driverServiceType, "car").toLowerCase(),
      } : null,
      driverTracking,
      trackingTarget: driverTrackingTarget ? { lat: driverTrackingTarget[0], lng: driverTrackingTarget[1] } : null,
      // Before the Driver starts the trip, the only route target shown is the
      // booked pickup. Destination navigation starts only once the trip is in
      // progress, matching the Rider's real trip state.
      trackingPhase: driverTracking && driverLocation
        ? (tripStatus === "in_progress" ? "destination" : "pickup")
        : "none",
      safetySignal,
      nearby: normalizedNearby,
    };
  }, [center, destination, driverBearing, driverColourHex, driverLocation, driverServiceType, driverTracking, driverTrackingTarget, driverVehicle, nearbyDrivers, safetySignal, tripStatus, userLocation, zoom]);

  const serializedMapState = useMemo(
    () => JSON.stringify(mapState).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"),
    [mapState],
  );
  const serializedMarkerAssets = useMemo(
    () => JSON.stringify(MAP_MARKER_ASSETS).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"),
    [],
  );

  const pushMapState = useCallback(() => {
    if (Platform.OS === "web" || !mapReady) return;
    webViewRef.current?.injectJavaScript(`window.updateHy3nMap && window.updateHy3nMap(${serializedMapState}); true;`);
  }, [mapReady, serializedMapState]);

  useEffect(() => {
    pushMapState();
  }, [pushMapState]);

  useImperativeHandle(ref, () => ({
    panTo(lat: number, lng: number) {
      webViewRef.current?.injectJavaScript(`window.hy3nMap && window.hy3nMap.panTo([${lat}, ${lng}]); true;`);
    },
    fitBounds(points: [number, number][]) {
      const validPoints = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
      if (!validPoints.length) return;
      webViewRef.current?.injectJavaScript(`window.hy3nMap && window.hy3nMap.fitBounds(${JSON.stringify(validPoints)}, {padding: [60, 60], maxZoom: 15}); true;`);
    },
  }));

  const mapHtml = useMemo(() => `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; background: ${mapBackground}; }
    .leaflet-control-zoom, .leaflet-control-attribution { display: none; }
    .leaflet-tile-pane { filter: ${tileFilter}; }
    .hy3n-vehicle-marker { background: transparent; border: 0; }
    .hy3n-vehicle-wrap { width: 92px; height: 91px; position: relative; display: flex; justify-content: center; align-items: flex-start; pointer-events: none; filter: drop-shadow(0 3px 3px rgba(0,0,0,.32)); }
    .hy3n-vehicle { width: 58px; height: 72px; position: relative; transform-origin: 50% 48%; transition: transform .7s linear; }
    .hy3n-vehicle img { width: 58px; height: 72px; display: block; object-fit: contain; position: relative; z-index: 1; }
    .hy3n-colour-tint { position: absolute; inset: 0; z-index: 2; opacity: .38; mix-blend-mode: multiply; pointer-events: none; -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-size: contain; mask-repeat: no-repeat; mask-position: center; }
    .hy3n-colour-swatch { position: absolute; z-index: 3; top: 6px; right: 1px; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,.38); }
    .hy3n-eta { position: absolute; top: 65px; left: 50%; transform: translateX(-50%); min-width: 42px; padding: 3px 7px; border-radius: 9px; background: rgba(17, 24, 39, .94); border: 1px solid rgba(255,255,255,.78); color: #fff; white-space: nowrap; text-align: center; font: 800 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; letter-spacing: .05px; box-shadow: 0 2px 6px rgba(0,0,0,.28); }
    .hy3n-eta.assigned { background: #006B3F; }
    .hy3n-safety-banner { position: absolute; top: 14px; left: 14px; right: 14px; z-index: 1000; padding: 10px 12px; border-radius: 12px; color: #fff; font: 700 12px -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
    .hy3n-safety-banner.danger { background: rgba(206,17,38,.94); }
    .hy3n-safety-banner.warning { background: rgba(212,175,55,.96); color: #111; }
    .hy3n-nearby-chip { position: absolute; left: 50%; bottom: 17px; transform: translateX(-50%); z-index: 1000; padding: 8px 12px; border-radius: 16px; background: rgba(17,24,39,.90); border: 1px solid rgba(255,255,255,.3); color: #fff; white-space: nowrap; font: 700 12px -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 3px 12px rgba(0,0,0,.3); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function() {
      var map = L.map('map', { center: [5.6037, -0.187], zoom: 14, zoomControl: false, attributionControl: false });
      window.hy3nMap = map;
      L.tileLayer('${tileUrl}', { maxZoom: 19 }).addTo(map);

      var layers = { user: null, pickup: null, destination: null, route: null, driver: null, tracking: null, nearby: {}, banner: null, nearbyChip: null };
      var lastMode = '';
      var markerAssets = ${serializedMarkerAssets};

      function validHex(value) { return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#F5F5F5'; }
      function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, ''); }
      function kindFor(serviceType) {
        var value = String(serviceType || 'car').toLowerCase();
        if (value.indexOf('okada') >= 0 || value.indexOf('moto') >= 0 || value.indexOf('bike') >= 0 && value.indexOf('delivery') < 0) return 'okada';
        if (value.indexOf('delivery') >= 0 || value.indexOf('courier') >= 0 || value.indexOf('express') >= 0) return 'delivery';
        return 'car';
      }
      function vehicleIcon(item, assigned) {
        var kind = kindFor(item.serviceType);
        var eta = item.eta ? String(Math.max(1, Math.round(item.eta))) + ' min' : 'Live';
        var label = escapeHtml(item.label || 'HY3N vehicle');
        var heading = Number(item.heading || 0);
        var asset = markerAssets[kind] || markerAssets.car || '';
        var colour = validHex(item.colour);
        var iconHtml = '<div class="hy3n-vehicle-wrap" title="' + label + '"><div class="hy3n-vehicle" style="transform:rotate(' + heading + 'deg)"><img src="' + asset + '" alt=""/><div class="hy3n-colour-tint" style="background:' + colour + ';-webkit-mask-image:url(' + asset + ');mask-image:url(' + asset + ');"></div><div class="hy3n-colour-swatch" style="background:' + colour + '"></div></div><div class="hy3n-eta ' + (assigned ? 'assigned' : '') + '">' + eta + '</div></div>';
        return L.divIcon({ html: iconHtml, iconSize: [92, 91], iconAnchor: [46, 43], className: 'hy3n-vehicle-marker' });
      }
      function userIcon() { return L.divIcon({ html: '<div style="width:18px;height:18px;border-radius:50%;background:#006B3F;border:4px solid #fff;box-shadow:0 0 0 3px rgba(0,107,63,.24),0 2px 5px rgba(0,0,0,.32);"></div>', iconSize:[18,18], iconAnchor:[9,9], className:'' }); }
      function pickupIcon() { return L.divIcon({ html: '<div style="width:24px;height:24px;border-radius:50%;background:#006B3F;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,107,63,.22),0 2px 5px rgba(0,0,0,.32);"></div>', iconSize:[24,24], iconAnchor:[12,12], className:'' }); }
      function destinationIcon() { return L.divIcon({ html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#D4AF37;border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.32);transform:rotate(-45deg);"></div>', iconSize:[22,22], iconAnchor:[11,22], className:'' }); }
      function setMarker(name, position, icon) {
        if (!layers[name]) { layers[name] = L.marker([position.lat, position.lng], { icon: icon, keyboard: false }).addTo(map); return layers[name]; }
        animateMarker(layers[name], position.lat, position.lng);
        layers[name].setIcon(icon);
        return layers[name];
      }
      function removeLayer(name) { if (layers[name]) { map.removeLayer(layers[name]); layers[name] = null; } }
      function animateMarker(marker, lat, lng) {
        var from = marker.getLatLng();
        var to = L.latLng(lat, lng);
        if (!from || (Math.abs(from.lat - to.lat) < 0.000001 && Math.abs(from.lng - to.lng) < 0.000001)) { marker.setLatLng(to); return; }
        if (marker._hy3nAnimation) cancelAnimationFrame(marker._hy3nAnimation);
        var start = performance.now();
        var duration = Math.min(1300, Math.max(450, map.distance(from, to) * 0.11));
        function frame(now) {
          var progress = Math.min(1, (now - start) / duration);
          var smooth = progress * progress * (3 - 2 * progress);
          marker.setLatLng([from.lat + (to.lat - from.lat) * smooth, from.lng + (to.lng - from.lng) * smooth]);
          if (progress < 1) marker._hy3nAnimation = requestAnimationFrame(frame);
        }
        marker._hy3nAnimation = requestAnimationFrame(frame);
      }
      function updateBanner(signal) {
        if (layers.banner) { layers.banner.remove(); layers.banner = null; }
        if (signal !== 'route_deviation' && signal !== 'long_stop') return;
        var text = signal === 'route_deviation' ? 'Route check: your driver appears to be off the planned route.' : 'Trip check: your driver has been stationary for several minutes.';
        var element = L.DomUtil.create('div', 'hy3n-safety-banner ' + (signal === 'route_deviation' ? 'danger' : 'warning'));
        element.textContent = text;
        layers.banner = L.control({ position: 'topleft' });
        layers.banner.onAdd = function() { return element; };
        layers.banner.addTo(map);
      }
      function updateNearbyChip(count) {
        if (layers.nearbyChip) { layers.nearbyChip.remove(); layers.nearbyChip = null; }
        if (!count) return;
        var element = L.DomUtil.create('div', 'hy3n-nearby-chip');
        element.textContent = count === 1 ? '1 nearby vehicle' : count + ' nearby vehicles';
        layers.nearbyChip = L.control({ position: 'bottomleft' });
        layers.nearbyChip.onAdd = function() { return element; };
        layers.nearbyChip.addTo(map);
      }
      function updateNearby(items) {
        var next = {};
        items.forEach(function(item) {
          next[item.id] = true;
          var marker = layers.nearby[item.id];
          if (!marker) {
            layers.nearby[item.id] = L.marker([item.lat, item.lng], { icon: vehicleIcon(item, false), keyboard: false }).addTo(map);
          } else {
            animateMarker(marker, item.lat, item.lng);
            marker.setIcon(vehicleIcon(item, false));
          }
        });
        Object.keys(layers.nearby).forEach(function(id) { if (!next[id]) { map.removeLayer(layers.nearby[id]); delete layers.nearby[id]; } });
      }
      function clearNearby() { Object.keys(layers.nearby).forEach(function(id) { map.removeLayer(layers.nearby[id]); }); layers.nearby = {}; updateNearbyChip(0); }
      function fitForState(state, mode) {
        if (lastMode === mode) return;
        lastMode = mode;
        var points = [];
        if (state.user) points.push([state.user.lat, state.user.lng]);
        if (state.driver) {
          points.push([state.driver.lat, state.driver.lng]);
          if (state.driverTracking && state.trackingTarget) points.push([state.trackingTarget.lat, state.trackingTarget.lng]);
        }
        else if (state.destination) points.push([state.destination.lat, state.destination.lng]);
        else state.nearby.slice(0, 6).forEach(function(item) { points.push([item.lat, item.lng]); });
        if (points.length > 1) map.fitBounds(points, { padding: [58, 68], maxZoom: 15 });
        else if (points.length === 1) map.setView(points[0], Math.max(state.zoom || 14, 14));
      }
      window.updateHy3nMap = function(state) {
        if (!state) return;
        if (state.user) setMarker('user', state.user, userIcon()); else removeLayer('user');
        var showDestination = state.destination && (!state.driver || state.trackingPhase === 'destination');
        if (showDestination) {
          setMarker('destination', state.destination, destinationIcon());
          if (layers.route) map.removeLayer(layers.route);
          if (!state.driver && state.user) layers.route = L.polyline([[state.user.lat, state.user.lng], [state.destination.lat, state.destination.lng]], { color: '#D4AF37', weight: 3, opacity: .82, dashArray: '9, 7' }).addTo(map);
        } else { removeLayer('destination'); if (layers.route) { map.removeLayer(layers.route); layers.route = null; } }
        if (state.driver) {
          clearNearby();
          setMarker('driver', state.driver, vehicleIcon({ heading: state.driver.heading, colour: state.driver.colour, label: state.driver.label, serviceType: state.driver.serviceType, eta: null }, true));
          if (state.driverTracking && state.trackingTarget && state.trackingPhase === 'pickup') setMarker('pickup', state.trackingTarget, pickupIcon());
          else removeLayer('pickup');
          if (layers.tracking) { map.removeLayer(layers.tracking); layers.tracking = null; }
          if (state.driverTracking && state.trackingTarget) layers.tracking = L.polyline([[state.driver.lat, state.driver.lng], [state.trackingTarget.lat, state.trackingTarget.lng]], { color: '#006B3F', weight: 4, opacity: .8, dashArray: '10, 8' }).addTo(map);
        } else {
          removeLayer('driver');
          removeLayer('pickup');
          if (layers.tracking) { map.removeLayer(layers.tracking); layers.tracking = null; }
          updateNearby(state.nearby || []);
          updateNearbyChip((state.nearby || []).length);
        }
        updateBanner(state.safetySignal || 'clear');
        fitForState(state, state.driver ? 'assigned:' + state.trackingPhase : state.destination ? 'booking' : (state.nearby || []).length ? 'nearby' : 'idle');
      };
      window.updateHy3nMap(${serializedMapState});
    })();
  </script>
</body>
</html>`, [mapBackground, serializedMapState, serializedMarkerAssets, tileFilter, tileUrl]);

  if (Platform.OS === "web") {
    return (
      <View style={[{ flex: 1, overflow: "hidden" }, style]}>
        <iframe srcDoc={mapHtml} style={{ width: "100%", height: "100%", border: "none" }} title="HY3N map" />
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        key={colorScheme}
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={{ flex: 1, backgroundColor: mapBackground }}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowsInlineMediaPlayback
        startInLoadingState={false}
        cacheEnabled={false}
        onLoadEnd={() => setMapReady(true)}
      />
    </View>
  );
});

export default LeafletMap;
