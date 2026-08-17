import React, { useRef, forwardRef, useImperativeHandle } from "react";
import { View, Platform } from "react-native";
import { WebView } from "react-native-webview";

interface NearbyDriver {
  id: string;
  current_lat?: number;
  current_lng?: number;
}

interface LeafletMapProps {
  style?: object;
  center?: [number, number]; // [lat, lng]
  zoom?: number;
  userLocation?: [number, number];
  destination?: [number, number] | null;
  driverLocation?: [number, number] | null;
  driverBearing?: number | null;
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

  // Serialize nearby drivers for injection into the WebView HTML
  const nearbyDriversJson = JSON.stringify(
    nearbyDrivers.filter(d => d.current_lat != null && d.current_lng != null)
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
  </style>
</head>
<body>
  <div id="map"></div>
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
    // Driver marker (car icon)
    var driverIcon = L.divIcon({
      html: '<div style="width:30px;height:30px;border-radius:50%;background:#CE1126;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(206,17,38,.55);transition:transform .9s linear;transform:rotate(${bearing}deg);"><div style="color:#fff;font-size:16px;line-height:1;transform:translateY(-1px);">➤</div></div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      className: '',
    });
    var driverMarker = L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map);
    ` : `
    // Nearby available driver dots (only shown when no active driver is assigned)
    var nearbyIcon = L.divIcon({
      html: '<div style="width:22px;height:22px;border-radius:50%;background:#006B3F;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,107,63,0.5);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      className: '',
    });
    var nearbyDrivers = ${nearbyDriversJson};
    nearbyDrivers.forEach(function(d) {
      L.marker([d.current_lat, d.current_lng], { icon: nearbyIcon }).addTo(map);
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
