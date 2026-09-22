import React, { useRef, forwardRef, useImperativeHandle } from "react";
import { View, Platform } from "react-native";
import { WebView } from "react-native-webview";

interface NearbyDriver {
  id: string;
  current_lat?: number;
  current_lng?: number;
  etaMinutes?: number;
}

interface LeafletMapProps {
  style?: object;
  center?: [number, number]; // [lat, lng]
  zoom?: number;
  userLocation?: [number, number];
  destination?: [number, number] | null;
  driverLocation?: [number, number] | null;
  driverBearing?: number | null;
  driverColourHex?: string | null;
  driverVehicle?: string | null;
  driverTracking?: boolean;
  driverTrackingTarget?: [number, number] | null;
  safetySignal?: "clear" | "route_deviation" | "long_stop";
  nearbyDrivers?: NearbyDriver[];
}

export interface LeafletMapRef {
  panTo: (lat: number, lng: number) => void;
  fitBounds: (points: [number, number][]) => void;
}

const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    style,
    center = [5.6037, -0.187],
    zoom = 14,
    userLocation,
    destination = null,
    driverLocation = null,
    driverBearing = null,
    driverColourHex = null,
    driverVehicle = null,
    driverTracking = false,
    driverTrackingTarget = null,
    safetySignal = "clear",
    nearbyDrivers = [],
  },
  ref
) {
  const webViewRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    panTo(lat: number, lng: number) {
      webViewRef.current?.injectJavaScript(`map.panTo([${lat}, ${lng}]); true;`);
    },
    fitBounds(points: [number, number][]) {
      const pts = JSON.stringify(points);
      webViewRef.current?.injectJavaScript(`map.fitBounds(${pts}, {padding: [60, 60]}); true;`);
    },
  }));

  const userLat = userLocation ? userLocation[0] : center[0];
  const userLng = userLocation ? userLocation[1] : center[1];
  const destLat = destination ? destination[0] : null;
  const destLng = destination ? destination[1] : null;
  const driverLat = driverLocation ? driverLocation[0] : null;
  const driverLng = driverLocation ? driverLocation[1] : null;
  const bearing = typeof driverBearing === "number" ? driverBearing : 0;
  const vehicleColour = /^#[0-9a-fA-F]{6}$/.test(driverColourHex || "") ? driverColourHex : "#CE1126";
  const vehicleLabel = (driverVehicle || "Driver vehicle").replace(/[<>&"']/g, "");
  const trackingTarget = driverTrackingTarget || (destination || userLocation || center);
  const safetyBanner = safetySignal === "route_deviation"
    ? '<div class="safety-banner danger">Route check: your driver appears to be off the planned route.</div>'
    : safetySignal === "long_stop"
    ? '<div class="safety-banner warning">Trip check: your driver has been stationary for several minutes.</div>'
    : '';
  const nearbyDriversJson = JSON.stringify(
    nearbyDrivers
      .filter((driver) => driver.current_lat != null && driver.current_lng != null)
      .slice(0, 8)
      .map((driver) => ({
        id: driver.id,
        lat: driver.current_lat,
        lng: driver.current_lng,
        eta: Math.max(1, Math.round(driver.etaMinutes || 1)),
      }))
  );

  // Dark tile layer — CartoDB Dark Matter (no API key needed)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #0D1117; }
    .leaflet-control-zoom { display: none; }
    .leaflet-control-attribution { display: none; }
    .safety-banner { position: absolute; top: 14px; left: 14px; right: 14px; z-index: 1000; padding: 10px 12px; border-radius: 12px; color: #fff; font: 600 12px -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
    .safety-banner.danger { background: rgba(206,17,38,.94); }
    .safety-banner.warning { background: rgba(212,175,55,.96); color: #111; }
  </style>
</head>
<body>
  <div id="map"></div>
  ${safetyBanner}
  <script>
    var map = L.map('map', {
      center: [${userLat}, ${userLng}],
      zoom: ${zoom},
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer — CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // User location marker (green dot)
    var userIcon = L.divIcon({
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#006B3F;border:3px solid #fff;box-shadow:0 0 8px rgba(0,107,63,0.8);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    });
    var userMarker = L.marker([${userLat}, ${userLng}], { icon: userIcon }).addTo(map);

    ${destLat !== null ? `
    // Destination marker (gold pin)
    var destIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;border-radius:50%;background:#D4AF37;border:3px solid #fff;box-shadow:0 0 8px rgba(212,175,55,0.8);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      className: '',
    });
    var destMarker = L.marker([${destLat}, ${destLng}], { icon: destIcon }).addTo(map);

    // Route line
    var routeLine = L.polyline([[${userLat}, ${userLng}], [${destLat}, ${destLng}]], {
      color: '#D4AF37',
      weight: 3,
      opacity: 0.8,
      dashArray: '8, 6',
    }).addTo(map);

    // Fit bounds to show both markers
    map.fitBounds([[${userLat}, ${userLng}], [${destLat}, ${destLng}]], {
      padding: [60, 60],
    });
    ` : ""}

    ${driverLat !== null ? `
    // Assigned driver marker: a vehicle-shaped marker using the driver's actual colour.
    var driverIcon = L.divIcon({
      html: '<div title="${vehicleLabel}" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.55));transform:rotate(${bearing}deg);transition:transform .9s linear;"><div style="position:relative;width:30px;height:20px;border-radius:9px 9px 6px 6px;background:${vehicleColour};border:2px solid #fff;"><div style="position:absolute;left:5px;right:5px;top:3px;height:7px;border-radius:4px 4px 2px 2px;background:rgba(255,255,255,.82);border:1px solid rgba(0,0,0,.25);"></div><div style="position:absolute;left:-4px;bottom:1px;width:7px;height:7px;border-radius:50%;background:#111;border:1px solid #fff;box-shadow:27px 0 0 #111,27px 0 0 1px #fff;"></div></div></div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      className: '',
    });
    var driverMarker = L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map);
    ${driverTracking ? `
    // Tracking line shows the driver's live approach to the rider/destination.
    var trackingTarget = [${trackingTarget[0]}, ${trackingTarget[1]}];
    var trackingLine = L.polyline([[${driverLat}, ${driverLng}], trackingTarget], {
      color: '${vehicleColour}', weight: 4, opacity: 0.72, dashArray: '10, 8',
    }).addTo(map);
    map.fitBounds([[${userLat}, ${userLng}], [${driverLat}, ${driverLng}], trackingTarget], { padding: [70, 70] });
    ` : ""}
    ` : `
    // Show a small number of available cars with their estimated pickup time.
    var nearbyDrivers = ${nearbyDriversJson};
    nearbyDrivers.forEach(function(d) {
      var icon = L.divIcon({
        html: '<div style="display:flex;align-items:center;gap:4px;background:#006B3F;border:2px solid #fff;border-radius:14px;padding:3px 6px 3px 4px;color:#fff;font:700 10px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 7px rgba(0,0,0,.45);white-space:nowrap;"><span style="width:11px;height:11px;border-radius:50%;background:#D4AF37;border:1px solid #fff;display:block;"></span><span>~' + d.eta + ' min</span></div>',
        iconSize: [58, 24],
        iconAnchor: [29, 12],
        className: '',
      });
      L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
    });
    `}
  </script>
</body>
</html>`;

  if (Platform.OS === "web") {
    // On web, render an iframe with the same HTML
    return (
      <View style={[{ flex: 1, overflow: "hidden" }, style]}>
        <iframe
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none" }}
          title="map"
        />
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={{ flex: 1, backgroundColor: "#0D1117" }}
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
      />
    </View>
  );
});

export default LeafletMap;
