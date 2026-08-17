import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  FlatList,
  Share,
  Linking,
  Image,
} from "react-native";
import LeafletMap from "@/components/LeafletMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { firestoreDB, COLLECTIONS } from "@/lib/firebase";
import { dispatchService, getSurgeMultiplier, generateRidePin, calculateETA, VEHICLE_COLOURS, type RideRequest as DispatchRide } from "@/lib/dispatch";
import * as ExpoLocation from "expo-location";
import * as Haptics from "expo-haptics";
import {
  RIDE_CATEGORIES,
  POPULAR_DESTINATIONS,
  PAYMENT_METHODS,
  PROMO_CODES,
  calculateFare,
  calculateDiscount,
  FREE_WAITING_MINUTES,
} from "@/constants/rides";
import {
  notifyDriverFound,
  notifyDriverArriving,
  notifyTripStarted,
  notifyTripCompleted,
} from "@/lib/notifications";
import { getApiBaseUrl } from "@/constants/oauth";
import { RideChatModal } from "@/components/ride-chat-modal";
import { useVoiceCall } from "@/hooks/use-voice-call";
import { InCallScreen, IncomingCallModal } from "@/components/in-call-screen";
import { PostRideModal } from "@/components/post-ride-modal";
import { calculateDynamicFare, calculateDistance, RideMetrics } from "@/lib/dynamic-pricing";
import { getDistanceToPickup, getDistanceToDestination, estimateETA, formatDistance, isDriverNearPickup, calculateBearing } from "@/lib/driver-tracking";
import { upsertRide, updateRide, removeRide, countActiveRides } from "@/lib/rider-ride-state";
import { buildEmergencyAssistMessage, DEFAULT_RIDE_OPTIONS, getCancellationPolicy, getSafetySignal, RIDE_OPTION_DEFINITIONS, selectedRideOptionLabels, type RiderRideOptions, type SafetySignal } from "@/lib/rider-parity";
import { trpc } from "@/lib/trpc";
import { buildReceiptEmailPayload, receiptRequestKey, type ReceiptEmailStatus } from "@/lib/receipt-email";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// Brand colors
const GOLD = "#D4AF37";
const GREEN = "#006B3F";
const RED = "#CE1126";
const BG = "#0A0A0A";
const SURFACE = "#111111";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const MUTED = "#9CA3AF";

interface Location {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface SavedPlace {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface ActiveRide {
  id: string;
  category: string;
  categoryId: string;
  destination: Location;
  pickup: string;
  pickupLocation: Location;
  distance: number;
  duration: number;
  fare: number;
  payment: string;
  paymentId: string;
  status: "searching" | "matched" | "driver_arriving" | "driver_arrived" | "in_progress" | "completed" | "cancelled";
  scheduled?: string | null;
  driverName?: string;
  driverRating?: number;
  driverVehicle?: string;
  driverPlate?: string;
  driverColour?: string;
  driverColourHex?: string;
  driverPhoto?: string;
  driverLocation?: { lat: number; lng: number };
  driverBearing?: number;
  driverTotalTrips?: number;
  driverPhone?: string;
  ridePin?: string;
  surgeMultiplier?: number;
  eta?: number;
  etaSeconds?: number;  // live countdown in seconds
  waitingFee?: number;
  tipAmount?: number;
  finalFare?: number;
  firestoreId?: string;  // real Firestore document ID
  cancelReason?: string;
  rideOptions?: RiderRideOptions;
  safetySignal?: SafetySignal;
  routeDeviationKm?: number;
  driverStoppedAt?: number;
  matchedAt?: string;  // ISO timestamp when driver was matched — used for 2-min free cancel window
  actualDistanceKm?: number;
  currentFare?: number;
  trackingStartedAt?: number;
  lastRiderLocation?: { lat: number; lng: number };
}

const DEFAULT_LOCATION: [number, number] = [5.6037, -0.187]; // Accra, Ghana

const STATUS_LABELS: Record<string, string> = {
  searching: "Searching for driver...",
  matched: "Driver Assigned",
  driver_arriving: "Driver Arriving",
  in_progress: "On Trip",
  completed: "Trip Complete!",
  cancelled: "Ride Cancelled",
};

// Surge multiplier computed once per session
const SURGE = getSurgeMultiplier();

// Peak hours for surge pricing (Ghana time)
const PEAK_HOURS = [
  { start: 7, end: 9, label: "Morning Rush" },    // 7-9 AM
  { start: 12, end: 13, label: "Lunch Time" },     // 12-1 PM
  { start: 17, end: 20, label: "Evening Rush" },   // 5-8 PM
];

// Calculate current surge period and time until surge ends
function getSurgePeriodInfo() {
  const now = new Date();
  const currentHour = now.getHours();
  
  for (const period of PEAK_HOURS) {
    if (currentHour >= period.start && currentHour < period.end) {
      // We're in a surge period
      const endTime = new Date();
      endTime.setHours(period.end, 0, 0, 0);
      const minutesUntilEnd = Math.ceil((endTime.getTime() - now.getTime()) / 60000);
      return {
        isActive: true,
        label: period.label,
        minutesRemaining: minutesUntilEnd,
        endTime: endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      };
    }
  }
  
  // Find next surge period
  let nextPeriod = PEAK_HOURS.find(p => p.start > currentHour);
  if (!nextPeriod) nextPeriod = PEAK_HOURS[0]; // Next day morning
  
  const nextStart = new Date();
  if (nextPeriod.start <= currentHour) {
    nextStart.setDate(nextStart.getDate() + 1); // Tomorrow
  }
  nextStart.setHours(nextPeriod.start, 0, 0, 0);
  const minutesUntilNext = Math.ceil((nextStart.getTime() - now.getTime()) / 60000);
  
  return {
    isActive: false,
    label: nextPeriod.label,
    minutesUntilNext,
    startTime: nextStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

export default function HomeScreen() {
  const { user, riderProfile, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top > 0 ? insets.top : (Constants.statusBarHeight ?? 44);
  const [userLocation, setUserLocation] = useState<[number, number]>(DEFAULT_LOCATION);
  const [pickupAddress, setPickupAddress] = useState<string>("Getting your location...");

  // Request GPS and center map on user's real position
  useEffect(() => {
    (async () => {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
          setUserLocation([loc.coords.latitude, loc.coords.longitude]);
          // Reverse geocode to get readable address
          try {
            const geo = await ExpoLocation.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            if (geo && geo.length > 0) {
              const g = geo[0];
              const parts = [g.name, g.street, g.district, g.city].filter(Boolean);
              setPickupAddress(parts.slice(0, 2).join(', ') || 'Current Location');
            } else {
              setPickupAddress('Current Location');
            }
          } catch {
            setPickupAddress('Current Location');
          }
        } else {
          setPickupAddress('Current Location');
        }
      } catch (err) {
        // Fall back to default Accra location if GPS fails
        console.log('GPS unavailable, using default location');
        setPickupAddress('Accra, Ghana');
      }
    })();
  }, []);
  // ─── Nearby Drivers ─────────────────────────────────────────────────────────
  const [nearbyDrivers, setNearbyDrivers] = useState<{ id: string; current_lat?: number; current_lng?: number }[]>([]);

  // Poll Firestore every 10 seconds for online, available drivers with a known location
  useEffect(() => {
    const fetchNearby = async () => {
      try {
        const drivers = await firestoreDB.list(COLLECTIONS.DRIVER_PROFILES, { is_online: true, is_available: true });
        const withLocation = drivers.filter((d: any) => d.current_lat != null && d.current_lng != null);
        setNearbyDrivers(withLocation);
      } catch {
        // Silently ignore — map will just show no nearby dots
      }
    };
    fetchNearby();
    const interval = setInterval(fetchNearby, 10000);
    return () => clearInterval(interval);
  }, []);

  const [destination, setDestination] = useState<Location | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(RIDE_CATEGORIES[0]);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_METHODS[0]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([
    { name: "Home", address: "Set location" },
    { name: "Work", address: "Set location" },
  ]);
  const [activeRides, setActiveRides] = useState<ActiveRide[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const activeRide = activeRides.find((ride) => ride.id === selectedRideId) ?? activeRides[0] ?? null;
  const [bookingLoading, setBookingLoading] = useState(false);

  const addActiveRide = useCallback((ride: ActiveRide) => {
    setActiveRides((prev) => upsertRide(prev, ride));
    setSelectedRideId(ride.id);
  }, []);

  const updateActiveRide = useCallback((
    rideIdOrUpdater: string | ((ride: ActiveRide) => ActiveRide),
    targetedUpdater?: (ride: ActiveRide) => ActiveRide,
  ) => {
    setActiveRides((prev) => typeof rideIdOrUpdater === 'string'
      ? updateRide(prev, rideIdOrUpdater, targetedUpdater ?? ((ride) => ride))
      : prev.map(rideIdOrUpdater));
  }, []);

  const removeActiveRide = useCallback((rideId?: string) => {
    if (!rideId) return;
    setActiveRides((prev) => removeRide(prev, rideId));
    setSelectedRideId((current) => current === rideId ? null : current);
  }, []);

  useEffect(() => {
    if (activeRides.length === 0) {
      setSelectedRideId(null);
      return;
    }
    if (!selectedRideId || !activeRides.some((ride) => ride.id === selectedRideId)) {
      setSelectedRideId(activeRides[0].id);
    }
  }, [activeRides, selectedRideId]);

  // Keep the active ride count available to the tab layout for a persistent badge.
  useEffect(() => {
    if (!user?.uid) return;
    const count = countActiveRides(activeRides);
    AsyncStorage.setItem(`activeRideCount:${user.uid}`, String(count)).catch(() => {});
  }, [activeRides, user?.uid]);
  
  // Dynamic pricing & driver tracking
  const [rideMetrics, setRideMetrics] = useState<RideMetrics | null>(null);
  const [currentDynamicFare, setCurrentDynamicFare] = useState<number>(0);
  const [distanceToPickup, setDistanceToPickup] = useState<number>(0);
  const [distanceToDestination, setDistanceToDestination] = useState<number>(0);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number>(0);
  const [totalDistanceTraveled, setTotalDistanceTraveled] = useState<number>(0);
  const [searchHistory, setSearchHistory] = useState<Location[]>([]);

  // Schedule
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Tip (pre-ride)
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState<string>("");

  // Promo Code
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoExpanded, setPromoExpanded] = useState(false);
  const [promoError, setPromoError] = useState("");

  // Rating / Tip (post-ride)
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [selectedRatingTags, setSelectedRatingTags] = useState<string[]>([]);
  // Pending rating: if rider closed app before rating, prompt on next open
  const [pendingRatingRideId, setPendingRatingRideId] = useState<string | null>(null);
  const [pendingRatingDriverName, setPendingRatingDriverName] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [rideRated, setRideRated] = useState(false);
  const [tipAdded, setTipAdded] = useState(false);
  const [showPostRideModal, setShowPostRideModal] = useState(false);
  const [completedRideData, setCompletedRideData] = useState<any>(null);
  const [receiptEmailStatus, setReceiptEmailStatus] = useState<ReceiptEmailStatus>("idle");
  const receiptEmailMutation = trpc.trips.sendReceipt.useMutation();
  const receiptRequestRef = useRef<string | null>(null);

  // Multi-stop
  const [stops, setStops] = useState<(Location | null)[]>([]);
  // Trip Receipt
  const [showReceipt, setShowReceipt] = useState(false);
  // Cancel with reason
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Book for Someone
  const [bookForSomeone, setBookForSomeone] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");

  // Payment forms
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [momoNumber, setMomoNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ride options (AC, pet, luggage)
  const [rideOptions, setRideOptions] = useState<RiderRideOptions>({ ...DEFAULT_RIDE_OPTIONS });
  const [showRideOptions, setShowRideOptions] = useState(false);

  const updateRideOption = (key: keyof RiderRideOptions) => {
    setRideOptions((previous) => {
      const next = { ...previous, [key]: !previous[key] };
      AsyncStorage.setItem(`rideOptions:${user?.uid ?? "guest"}`, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  // In-ride chat
  const [showChat, setShowChat] = useState(false);
  // Waiting timer (rider side) — shows how long driver has been waiting at pickup
  const [riderWaitSeconds, setRiderWaitSeconds] = useState(0);
  const riderWaitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const riderArrivedAtRef = useRef<number | null>(null);
  const [showScheduledToast, setShowScheduledToast] = useState(false);
  const scheduledToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showNearbyAlert, setShowNearbyAlert] = useState(false);
  const nearbyAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearbyAlertRideRef = useRef<string | null>(null);

  // ─── Voice Call ───────────────────────────────────────────────────────────────
  const driverName = activeRide?.driverName || 'Driver';
  const driverPhone = (activeRide as any)?.driverPhone;
  const driverId = (activeRide as any)?.driverId || (activeRide as any)?.driver_id;
  const riderCall = useVoiceCall({
    rideId: activeRide?.firestoreId,
    myId: user?.uid,
    myName: user?.displayName || 'Rider',
    myRole: 'rider',
    otherName: driverName,
  });

  const handleCallDriver = () => {
    if (!activeRide) return;
    if (driverId) {
      riderCall.startCall(driverId);
    } else if (driverPhone) {
      Linking.openURL(`tel:${driverPhone}`);
    } else {
      Alert.alert('Call Driver', 'Driver contact not available yet.');
    }
  };
  const [chatMessages, setChatMessages] = useState<{ id: string; text: string; fromRider: boolean; time: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const QUICK_MESSAGES = [
    "I'm at the gate",
    "Almost there, 1 min",
    "Please wait for me",
    "I'm wearing a red shirt",
    "Can you call me?",
    "I'm outside now",
  ];
  const isWalletPayment = (ride: ActiveRide) => ride.paymentId === "wallet" || ride.payment?.toLowerCase() === "wallet";

  useEffect(() => {
    AsyncStorage.getItem("savedPlaces").then((v) => { if (v) setSavedPlaces(JSON.parse(v)); });
    AsyncStorage.getItem("searchHistory").then((v) => { if (v) setSearchHistory(JSON.parse(v)); });
    // Rebook pre-fill: if activity screen stored a destination, auto-open booking
    AsyncStorage.getItem("rebookDestination").then((v) => {
      if (v) {
        const loc: Location = JSON.parse(v);
        setDestination(loc);
        AsyncStorage.removeItem("rebookDestination");
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(`rideOptions:${user?.uid ?? "guest"}`).then((value) => {
      if (!value) return;
      try {
        setRideOptions({ ...DEFAULT_RIDE_OPTIONS, ...JSON.parse(value) });
      } catch {
        setRideOptions({ ...DEFAULT_RIDE_OPTIONS });
      }
    });
  }, [user?.uid]);

  // Pending rating check: on app load, look for completed rides in last 24h with no rating
  useEffect(() => {
    if (!user?.uid) return;
    const checkPendingRating = async () => {
      try {
        const rides = await firestoreDB.list(COLLECTIONS.RIDES, { rider_id: user.uid, status: 'completed' });
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const unrated = rides.filter((r: any) => {
          const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
          return ts > cutoff && !r.rider_rating;
        });
        if (unrated.length > 0) {
          const ride = unrated[0] as any;
          setPendingRatingRideId(ride.id);
          setPendingRatingDriverName(ride.driver_name || ride.driverName || 'Your Driver');
          setRatingValue(5);
          setRatingComment("");
          setSelectedRatingTags([]);
          setShowRatingModal(true);
        }
      } catch {
        // Silently ignore — don't block app load
      }
    };
    // Delay slightly so app finishes loading before showing modal
    const t = setTimeout(checkPendingRating, 2000);
    return () => clearTimeout(t);
  }, [user?.uid]);

  // Subscribe independently to every active ride so one booking never replaces another.
  const activeRideKeys = activeRides.map((ride) => ride.firestoreId || ride.id).join('|');
  useEffect(() => {
    const subscriptions = activeRides
      .filter((ride) => Boolean(ride.firestoreId))
      .map((trackedRide) => dispatchService.listenToRide(trackedRide.firestoreId!, (ride: DispatchRide) => {
        updateActiveRide((prev) => {
          if (prev.id !== trackedRide.id) return prev;
          const driver = ride.driver;
          const nextDriverLocation = driver
            ? { lat: driver.location.lat, lng: driver.location.lng }
            : prev.driverLocation;
          const driverBearing = nextDriverLocation && prev.driverLocation
            ? calculateBearing(prev.driverLocation.lat, prev.driverLocation.lng, nextDriverLocation.lat, nextDriverLocation.lng)
            : prev.driverBearing;
          const etaMin = driver
            ? calculateETA(nextDriverLocation!, { lat: prev.destination.lat, lng: prev.destination.lng })
            : prev.eta;
          const enteredTrip = ride.status === 'in_progress' && prev.status !== 'in_progress';
          const routeDeviationKm = Number((ride as any).route_deviation_km ?? prev.routeDeviationKm ?? 0);
          const driverStoppedAt = nextDriverLocation && prev.driverLocation && calculateDistance(prev.driverLocation.lat, prev.driverLocation.lng, nextDriverLocation.lat, nextDriverLocation.lng) < 0.01
            ? (prev.driverStoppedAt ?? Date.now())
            : undefined;
          const stoppedSeconds = driverStoppedAt ? Math.max(0, Math.floor((Date.now() - driverStoppedAt) / 1000)) : 0;
          const safetySignal = getSafetySignal({ status: ride.status, distanceFromRouteKm: routeDeviationKm, stoppedSeconds });

          if (ride.status !== prev.status) {
            if (ride.status === 'matched' && driver) notifyDriverFound(driver.name, etaMin ?? 5);
            if (ride.status === 'driver_arriving' && driver) notifyDriverArriving(driver.name);
            if (ride.status === 'in_progress') notifyTripStarted(prev.destination.name);
            if (ride.status === 'completed') notifyTripCompleted(prev.currentFare ?? prev.fare);
          }

          if (trackedRide.id === selectedRideId && nextDriverLocation) {
            setDriverLocation(nextDriverLocation);
            const distToPickup = calculateDistance(
              nextDriverLocation.lat,
              nextDriverLocation.lng,
              prev.pickupLocation.lat,
              prev.pickupLocation.lng,
            );
            const distToDestination = calculateDistance(
              prev.pickupLocation.lat,
              prev.pickupLocation.lng,
              prev.destination.lat,
              prev.destination.lng,
            );
            setDistanceToPickup(distToPickup);
            setDistanceToDestination(distToDestination);
            setEtaMinutes(etaMin ?? 0);
          }

          return {
            ...prev,
            status: ride.status as ActiveRide['status'],
            driverName: driver?.name ?? prev.driverName,
            driverRating: driver?.rating ?? prev.driverRating,
            driverVehicle: driver ? `${driver.vehicle_make} ${driver.vehicle_model}` : prev.driverVehicle,
            driverPlate: driver?.plate ?? prev.driverPlate,
            driverColour: driver?.vehicle_colour ?? prev.driverColour,
            driverColourHex: driver?.vehicle_colour_hex ?? prev.driverColourHex,
            driverTotalTrips: driver?.total_trips ?? prev.driverTotalTrips,
            driverPhone: driver?.phone ?? prev.driverPhone,
            driverLocation: nextDriverLocation,
            driverBearing,
            safetySignal,
            routeDeviationKm,
            driverStoppedAt,
            eta: etaMin ?? prev.eta,
            etaSeconds: (ride as any).eta_seconds ?? ((etaMin ?? 0) * 60),
            waitingFee: (ride as any).waiting_fee ?? prev.waitingFee,
            matchedAt: prev.matchedAt ?? ((ride.status === 'driver_arriving' || ride.status === 'matched') ? new Date().toISOString() : prev.matchedAt),
            trackingStartedAt: enteredTrip ? Date.now() : prev.trackingStartedAt,
            actualDistanceKm: prev.actualDistanceKm ?? 0,
            currentFare: ride.status === 'completed' ? (prev.currentFare ?? prev.fare) : prev.currentFare,
            finalFare: ride.status === 'completed' ? (prev.currentFare ?? prev.fare) : prev.finalFare,
          };
        });
      }));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [activeRideKeys, selectedRideId, updateActiveRide]);

  // Update fare from the rider's actual GPS movement while any ride is in progress.
  const inProgressRideKeys = activeRides.filter((ride) => ride.status === 'in_progress').map((ride) => ride.id).join('|');
  useEffect(() => {
    if (!inProgressRideKeys) return;
    let subscription: ExpoLocation.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        subscription = await ExpoLocation.watchPositionAsync(
          { accuracy: ExpoLocation.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          (location) => {
            const point = { lat: location.coords.latitude, lng: location.coords.longitude };
            setUserLocation([point.lat, point.lng]);
            updateActiveRide((prev) => {
              if (prev.status !== 'in_progress') return prev;
              const last = prev.lastRiderLocation;
              const incremental = last ? calculateDistance(last.lat, last.lng, point.lat, point.lng) : 0;
              const actualDistanceKm = (prev.actualDistanceKm ?? 0) + incremental;
              const trackingStartedAt = prev.trackingStartedAt ?? Date.now();
              const elapsedMinutes = Math.max(0, (Date.now() - trackingStartedAt) / 60000);
              const breakdown = calculateDynamicFare(prev.categoryId, {
                startTime: trackingStartedAt,
                actualDistanceKm,
                elapsedMinutes,
                waitingMinutes: 0,
                surgeMultiplier: prev.surgeMultiplier ?? 1,
              });
              if (prev.id === selectedRideId) {
                setRideMetrics({ startTime: trackingStartedAt, actualDistanceKm, elapsedMinutes, waitingMinutes: 0, surgeMultiplier: prev.surgeMultiplier ?? 1 });
                setCurrentDynamicFare(breakdown.total);
                setTotalDistanceTraveled(actualDistanceKm);
              }
              return { ...prev, lastRiderLocation: point, actualDistanceKm, trackingStartedAt, currentFare: breakdown.total };
            });
          },
        );
      } catch {
        // Location can be unavailable in web preview or if permission is declined.
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [inProgressRideKeys, selectedRideId, updateActiveRide]);

  // ETA countdown timer — ticks every second when driver is assigned
  useEffect(() => {
    if (!activeRide || !['matched', 'driver_arriving'].includes(activeRide.status)) return;
    const interval = setInterval(() => {
      updateActiveRide(prev => {
        if (!prev || !prev.etaSeconds || prev.etaSeconds <= 0) return prev;
        return { ...prev, etaSeconds: prev.etaSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRide?.status]);

  // Rider-side waiting timer: starts when driver status is driver_arrived
  useEffect(() => {
    if (activeRide?.status === 'driver_arrived') {
      if (!riderArrivedAtRef.current) riderArrivedAtRef.current = Date.now();
      riderWaitTimerRef.current = setInterval(() => {
        setRiderWaitSeconds(Math.floor((Date.now() - (riderArrivedAtRef.current || Date.now())) / 1000));
      }, 1000);
    } else {
      if (riderWaitTimerRef.current) { clearInterval(riderWaitTimerRef.current); riderWaitTimerRef.current = null; }
      riderArrivedAtRef.current = null;
      setRiderWaitSeconds(0);
    }
    return () => { if (riderWaitTimerRef.current) { clearInterval(riderWaitTimerRef.current); riderWaitTimerRef.current = null; } };
  }, [activeRide?.status]);

  const riderFreeWaitSecs = FREE_WAITING_MINUTES * 60;
  const riderBillableWaitMins = Math.max(0, (riderWaitSeconds - riderFreeWaitSecs) / 60);
  const riderWaitingFeePerMin = RIDE_CATEGORIES.find(c => c.id === activeRide?.category)?.waitingFeePerMin ?? 0.55;
  const riderCurrentWaitingFee = parseFloat((riderBillableWaitMins * riderWaitingFeePerMin).toFixed(2));

  useEffect(() => {
    const rideKey = activeRide?.firestoreId || activeRide?.id || null;
    const shouldAlert =
      activeRide?.status === "driver_arriving" &&
      typeof activeRide.etaSeconds === "number" &&
      activeRide.etaSeconds > 0 &&
      activeRide.etaSeconds <= 120 &&
      !!rideKey &&
      nearbyAlertRideRef.current !== rideKey;

    if (shouldAlert) {
      nearbyAlertRideRef.current = rideKey;
      setShowNearbyAlert(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Driver nearby",
        `${activeRide.driverName || "Your driver"} is about ${Math.max(1, Math.ceil((activeRide.etaSeconds || 60) / 60))} minute${Math.max(1, Math.ceil((activeRide.etaSeconds || 60) / 60)) === 1 ? "" : "s"} away. Please head to your pickup point.`
      );
      if (nearbyAlertTimerRef.current) clearTimeout(nearbyAlertTimerRef.current);
      nearbyAlertTimerRef.current = setTimeout(() => setShowNearbyAlert(false), 5000);
    }

    if (!activeRide) {
      nearbyAlertRideRef.current = null;
      setShowNearbyAlert(false);
    } else if (!["driver_arriving", "driver_arrived"].includes(activeRide.status)) {
      setShowNearbyAlert(false);
    }

    return () => {
      if (nearbyAlertTimerRef.current) {
        clearTimeout(nearbyAlertTimerRef.current);
        nearbyAlertTimerRef.current = null;
      }
    };
  }, [activeRide?.firestoreId, activeRide?.id, activeRide?.status, activeRide?.etaSeconds, activeRide?.driverName]);

  useEffect(() => {
    return () => {
      if (scheduledToastTimerRef.current) {
        clearTimeout(scheduledToastTimerRef.current);
        scheduledToastTimerRef.current = null;
      }
      if (nearbyAlertTimerRef.current) {
        clearTimeout(nearbyAlertTimerRef.current);
        nearbyAlertTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    if (activeRide?.status !== "searching") return;

    searchTimeoutRef.current = setTimeout(() => {
      Alert.alert(
        "No Driver Found",
        nearbyDrivers.length === 0
          ? "No drivers are currently online in your area. Please try again shortly."
          : "Drivers are online, but all are currently busy. Please try again in a few minutes."
      );
      removeActiveRide(activeRide?.id);
    }, 6 * 60 * 1000);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [activeRide?.status, nearbyDrivers.length]);

  const distance = destination
    ? Math.sqrt(
        Math.pow((destination.lat - userLocation[0]) * 111, 2) +
          Math.pow((destination.lng - userLocation[1]) * 111 * Math.cos((userLocation[0] * Math.PI) / 180), 2)
      )
    : 0;
  const duration = Math.round(distance * 3.5 + 5);
  const baseFare = destination ? calculateFare(selectedCategory.id, distance, duration) : 0;
  const discount = appliedPromo ? calculateDiscount(appliedPromo, baseFare) : 0;
  const finalFare = baseFare - discount;
  const preTipAmount = selectedTipPercent ? (finalFare * selectedTipPercent) / 100 : (customTip ? parseFloat(customTip) : 0);
  const selectedOptionLabels = selectedRideOptionLabels(rideOptions);

  const [placeSuggestions, setPlaceSuggestions] = useState<Location[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch live Google Places suggestions when user types
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchQuery || searchQuery.trim().length < 2) {
      setPlaceSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const base = getApiBaseUrl();
        const url = `${base}/api/places/autocomplete?input=${encodeURIComponent(searchQuery)}`;
        const res = await fetch(url);
        const data = await res.json() as { predictions: any[] };
        const mapped: Location[] = (data.predictions || []).map((p: any) => ({
          name: p.structured_formatting?.main_text || p.description,
          address: p.structured_formatting?.secondary_text || p.description,
          lat: 0,
          lng: 0,
          placeId: p.place_id,
        }));
        setPlaceSuggestions(mapped);
      } catch {
        setPlaceSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 350);
  }, [searchQuery]);

  const filteredDestinations = searchQuery
    ? placeSuggestions.length > 0
      ? placeSuggestions
      : POPULAR_DESTINATIONS.filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.address.toLowerCase().includes(searchQuery.toLowerCase())
        )
    : POPULAR_DESTINATIONS;

  const handleSelectDestination = async (loc: Location) => {
    setDestination(loc);
    setSearchOpen(false);
    setSearchQuery("");
    const updated = [loc, ...searchHistory.filter((h) => h.name !== loc.name)].slice(0, 5);
    setSearchHistory(updated);
    await AsyncStorage.setItem("searchHistory", JSON.stringify(updated));
  };

  const handleBook = async () => {
    if (!destination) return;

    if (selectedPayment.id === "mobile_money") {
      const normalized = momoNumber.replace(/\D/g, "");
      const isGhanaMomo = /^0\d{9}$/.test(normalized) || /^233\d{9}$/.test(normalized);
      if (!isGhanaMomo) {
        setShowMomoModal(true);
        return;
      }
    }

    if (selectedPayment.id === "card") {
      const cardDigits = cardNumber.replace(/\s/g, "");
      const validCardLength = cardDigits.length === 15 || cardDigits.length === 16;
      if (!cardName.trim() || !validCardLength || !cardExpiry.trim() || cardCvv.trim().length < 3) {
        setShowCardModal(true);
        return;
      }
    }

    setBookingLoading(true);
    const pin = generateRidePin();
    const surgedFare = Math.round(finalFare * SURGE * 100) / 100;
    try {
      if (selectedPayment.id === "wallet" && user?.uid) {
        const wallet = await firestoreDB.get(COLLECTIONS.WALLET, user.uid);
        const balance = Number(wallet?.balance ?? 0);
        if (balance < surgedFare) {
          Alert.alert("Insufficient Wallet Balance", `You need GH₵${(surgedFare - balance).toFixed(2)} more to book this ride.`);
          setBookingLoading(false);
          return;
        }
        await firestoreDB.create(COLLECTIONS.PAYMENTS, {
          rider_id: user.uid,
          amount: surgedFare,
          method: "wallet",
          status: "authorized",
          type: "ride_hold",
          created_at: new Date().toISOString(),
        });
      }

      // Create real Firestore ride request
      let firestoreId: string | undefined;
      if (user) {
        try {
          firestoreId = await dispatchService.createRide({
            riderId: user.uid,
            riderName: bookForSomeone ? recipientName : (riderProfile?.full_name || user.displayName || 'Rider'),
            riderPhone: bookForSomeone ? recipientPhone : (riderProfile?.phone || user.phoneNumber || ''),
            riderEmail: riderProfile?.email || user.email || '',
            category: selectedCategory.id,
            pickup: { lat: userLocation[0], lng: userLocation[1], name: recipientAddress || 'Current Location', address: recipientAddress || 'Current Location' },
            destination: { lat: destination.lat, lng: destination.lng, name: destination.name, address: destination.address || destination.name },
            stops: stops.filter(Boolean).map(s => ({ lat: s!.lat, lng: s!.lng, name: s!.name, address: s!.address || s!.name })),
            payment: selectedPayment.id,
            fare: surgedFare,
            baseFare: finalFare,
            surgeMultiplier: SURGE,
            distance,
            duration,
            promoCode: appliedPromo ?? undefined,
            discount: appliedPromo ? Math.round((finalFare - surgedFare) * 100) / 100 : undefined,
            rideOptions,
          });
        } catch (err) {
          console.error('Firestore ride creation failed, continuing with local state:', err);
        }
      }
              addActiveRide({
          id: firestoreId ?? `ride_${Date.now()}`,
          firestoreId,
          category: selectedCategory.name,
          categoryId: selectedCategory.id,
          destination,
          pickup: recipientAddress || pickupAddress || 'Current Location',
          pickupLocation: { lat: userLocation[0], lng: userLocation[1], name: recipientAddress || pickupAddress || 'Current Location', address: recipientAddress || pickupAddress || 'Current Location' },
          distance,
          duration,
          fare: surgedFare,
          payment: selectedPayment.name,
          paymentId: selectedPayment.id,
          status: 'searching',
          scheduled: isScheduled ? scheduledFor : null,
          ridePin: pin,
          rideOptions,
          surgeMultiplier: SURGE,
        });
        if (isScheduled) {
          setShowScheduledToast(true);
          if (scheduledToastTimerRef.current) clearTimeout(scheduledToastTimerRef.current);
          scheduledToastTimerRef.current = setTimeout(() => setShowScheduledToast(false), 3200);
        }

    } finally {
      setBookingLoading(false);
      setRideRated(false);
      setTipAdded(false);
      setTipAmount(null);
    }
  };

  const CANCEL_REASONS = [
    "Driver is taking too long",
    "I found another ride",
    "Wrong pickup location",
    "Changed my plans",
    "Price is too high",
    "Other",
  ];
  const resetBookingState = () => {
    setDestination(null);
    setStops([]);
    setAppliedPromo(null);
    setIsScheduled(false);
    setScheduledFor(null);
  };
  const handleCancelRide = () => {
    if (activeRide?.status === "in_progress") {
      Alert.alert("Cannot Cancel", "You cannot cancel a ride that is already in progress.");
      return;
    }
    setCancelReason("");
    setShowCancelModal(true);
  };
  const confirmCancelRide = async () => {
    if (activeRide?.firestoreId) {
      try {
        const policy = getCancellationPolicy(activeRide.status, activeRide.matchedAt);
        await dispatchService.cancelRide(
          activeRide.firestoreId,
          cancelReason || 'Cancelled by rider',
          policy.fee,
        );
        if (!policy.isFree) {
          Alert.alert('Cancellation Fee Applied', `A GH₵${policy.fee.toFixed(2)} cancellation fee has been charged.`, [{ text: 'OK' }]);
        }
      } catch (e) { /* silent */ }
    }
    setShowCancelModal(false);
    removeActiveRide(activeRide?.id);
    resetBookingState();
    setCancelReason("");
  };

  const handleCancelBooking = () => {
    setSelectedCategory(RIDE_CATEGORIES[0]);
    resetBookingState();
  };

  const handleQuickPlace = (place: SavedPlace) => {
    if (!place.lat || !place.lng) { setSearchOpen(true); return; }
    handleSelectDestination({ name: place.name, address: place.address, lat: place.lat, lng: place.lng });
  };

  const handleAddStop = () => {
    if (stops.length >= 3) {
      Alert.alert("Limit reached", "You can add up to 3 stops.");
      return;
    }
    const options = POPULAR_DESTINATIONS.slice(0, 6).map((p) => ({
      text: p.name,
      onPress: () => setStops((prev) => [...prev, p]),
    }));
    Alert.alert("Add a stop", "Select a stop from popular places", [
      ...options,
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    setStops((prev) => {
      const next = [...prev];
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!PROMO_CODES[code]) {
      setPromoError("Invalid promo code");
      return;
    }
    setAppliedPromo(code);
    setPromoExpanded(false);
    setPromoError("");
  };

  const handleScheduleConfirm = () => {
    if (!scheduleDate || !scheduleTime) {
      Alert.alert("Required", "Please enter both date and time");
      return;
    }
    const scheduledDate = new Date(`${scheduleDate} ${scheduleTime}`);
    if (Number.isNaN(scheduledDate.getTime())) {
      Alert.alert("Invalid Date/Time", "Please enter a valid date and time.");
      return;
    }
    const now = Date.now();
    const minTime = now + 30 * 60 * 1000;
    const maxTime = now + 7 * 24 * 60 * 60 * 1000;
    if (scheduledDate.getTime() < minTime) {
      Alert.alert("Too Soon", "Scheduled rides must be at least 30 minutes from now.");
      return;
    }
    if (scheduledDate.getTime() > maxTime) {
      Alert.alert("Too Far Ahead", "HY3N scheduled rides can currently be booked up to 7 days ahead.");
      return;
    }
    setScheduledFor(
      scheduledDate.toLocaleString("en-GB", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    );
    setIsScheduled(true);
    setShowScheduleModal(false);
  };

  const handleShareTrip = async () => {
    if (!activeRide) return;
    const etaMinutes = activeRide.eta || (activeRide.etaSeconds ? Math.max(1, Math.ceil(activeRide.etaSeconds / 60)) : null);
    const msg = `I'm in a HY3N ride! 🚗\nPickup: ${activeRide.pickup}\nDestination: ${activeRide.destination.name}${etaMinutes ? `\nETA: ${etaMinutes} min` : ''}\nDriver: ${activeRide.driverName || 'Searching...'}\n\nTrack me via HY3N.`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const webWhatsappUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;

    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
        return;
      }
      await Linking.openURL(webWhatsappUrl);
      return;
    } catch (e) {}

    try {
      await Share.share({ message: msg, title: "My HY3N Trip" });
    } catch (e) {}
  };

  const handleEmergencyAssist = () => {
    if (!activeRide) return;
    const message = buildEmergencyAssistMessage({
      rideId: activeRide.id,
      pickup: activeRide.pickup,
      destination: activeRide.destination.name,
      driverName: activeRide.driverName,
      driverPlate: activeRide.driverPlate,
      driverVehicle: activeRide.driverVehicle,
      latitude: activeRide.driverLocation?.lat,
      longitude: activeRide.driverLocation?.lng,
    });
    Alert.alert("Emergency Assist", "Choose how to get help. Your trip summary can be shared with a trusted person.", [
      {
        text: "Share trip details",
        onPress: async () => {
          try { await Share.share({ message, title: "HY3N Emergency Assist" }); } catch {}
        },
      },
      {
        text: "Call emergency services",
        style: "destructive",
        onPress: async () => {
          try {
            if (await Linking.canOpenURL("tel:112")) await Linking.openURL("tel:112");
          } catch {
            Alert.alert("Unable to call", "Please call 112 or your local emergency number directly.");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  useEffect(() => {
    const ride = activeRide;
    const riderEmail = user?.email?.trim();
    if (!ride || ride.status !== "completed" || !riderEmail) return;
    const tripId = ride.firestoreId || ride.id;
    const requestKey = receiptRequestKey(tripId);
    if (receiptRequestRef.current === requestKey) return;
    receiptRequestRef.current = requestKey;

    const requestReceipt = async () => {
      const alreadyRequested = await AsyncStorage.getItem(requestKey);
      if (alreadyRequested === "sent") {
        setReceiptEmailStatus("sent");
        return;
      }
      setReceiptEmailStatus("sending");
      try {
        const result = await receiptEmailMutation.mutateAsync(buildReceiptEmailPayload({
          riderEmail,
          riderName: (riderProfile as any)?.full_name || user?.displayName || "HY3N Rider",
          driverName: ride.driverName || "Driver",
          driverVehicle: ride.driverVehicle || "HY3N vehicle",
          driverPlate: ride.driverPlate || "Not available",
          pickup: pickupAddress,
          destination: ride.destination.name,
          fare: (ride.currentFare ?? ride.fare) + (tipAmount || 0),
          paymentMethod: ride.payment || "Selected method",
          tripId,
          completedAt: new Date().toISOString(),
          distance: ride.actualDistanceKm ?? ride.distance,
          duration: ride.duration,
          category: ride.category,
        }));
        const status: ReceiptEmailStatus = result.success ? "sent" : "failed";
        setReceiptEmailStatus(status);
        if (result.success) await AsyncStorage.setItem(requestKey, "sent");
      } catch {
        setReceiptEmailStatus("failed");
      }
    };
    requestReceipt();
  }, [activeRide?.id, activeRide?.status, user?.email]);

  const handleFinishRide = async () => {
    // Settle wallet payment: deduct fare from rider, credit driver
    if (activeRide?.status === 'completed' && isWalletPayment(activeRide) && user) {
      try {
        const fare = (activeRide.currentFare ?? activeRide.fare) + (activeRide.waitingFee || 0);
        const driverId = (activeRide as any).driverId || (activeRide as any).driver_id || '';
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/trpc/wallet.settleRide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            rideId: activeRide.id,
            riderId: user.uid,
            driverId,
            driverName: activeRide.driverName || 'Driver',
            riderName: (riderProfile as any)?.full_name || user.displayName || 'Rider',
            fare,
            pickup: typeof activeRide.pickup === 'string' ? activeRide.pickup : 'Pickup',
            destination: activeRide.destination?.name || 'Destination',
          }),
        });
      } catch (err: any) {
        console.warn('[Wallet] Settle ride error:', err?.message);
      }
    }
    // Increment total_rides on the rider's profile when they finish a completed trip
    if (activeRide?.status === 'completed' && user) {
      const newTotal = (riderProfile?.total_rides ?? 0) + 1;
      updateProfile({ total_rides: newTotal }).catch(() => {});
    }
    removeActiveRide(activeRide?.id);
    resetBookingState();
  };

  const renderActiveRide = () => {
    if (!activeRide) return null;
    const isCompleted = activeRide.status === "completed";
    const isSearching = activeRide.status === "searching";
    const hasDriver = ["matched", "driver_arriving", "driver_arrived", "in_progress"].includes(activeRide.status);

    const liveFare = activeRide.currentFare ?? activeRide.fare;
    return (
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
        {activeRides.length > 1 && (
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: TEXT, fontSize: 14, fontWeight: '800' }}>Your active rides ({countActiveRides(activeRides)})</Text>
              <TouchableOpacity onPress={() => { resetBookingState(); setSearchOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="add-circle-outline" size={17} color={GOLD} />
                <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700' }}>Book another</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {activeRides.map((ride) => (
                <TouchableOpacity key={ride.id} onPress={() => setSelectedRideId(ride.id)} style={{ backgroundColor: ride.id === activeRide.id ? `${GOLD}22` : CARD, borderColor: ride.id === activeRide.id ? GOLD : BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 118 }}>
                  <Text style={{ color: ride.id === activeRide.id ? GOLD : TEXT, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{ride.category}</Text>
                  <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{ride.destination.name}</Text>
                  <Text style={{ color: ride.currentFare ? GOLD : MUTED, fontSize: 10, marginTop: 3 }}>GH₵{(ride.currentFare ?? ride.fare).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {activeRides.length === 1 && (
          <TouchableOpacity onPress={() => { resetBookingState(); setSearchOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: `${GOLD}14`, borderColor: `${GOLD}44`, borderWidth: 1, borderRadius: 11, paddingVertical: 10, marginBottom: 12 }}>
            <MaterialIcons name="add" size={17} color={GOLD} />
            <Text style={{ color: GOLD, fontSize: 13, fontWeight: '700' }}>Book another ride</Text>
          </TouchableOpacity>
        )}
        {isSearching && (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="large" color={GOLD} style={{ marginBottom: 16 }} />
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 6 }}>Searching for driver...</Text>
            <Text style={{ color: MUTED, fontSize: 13 }}>This usually takes 1–5 minutes</Text>
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, marginTop: 16, width: "100%", borderWidth: 0.5, borderColor: BORDER }}>
              <Row label="Destination" value={activeRide.destination.name} />
              <Row label="Distance" value={`${activeRide.distance.toFixed(1)} km · ~${activeRide.duration} min`} />
              <Row label="Fare" value={`GH₵${activeRide.fare.toFixed(2)}`} valueColor={GOLD} />
              <Row label="Payment" value={activeRide.payment} />
            </View>
            <TouchableOpacity
              onPress={handleCancelRide}
              style={{ marginTop: 16, borderWidth: 1, borderColor: `${RED}66`, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 }}
            >
              <Text style={{ color: RED, fontWeight: "600", fontSize: 14 }}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        )}

        {hasDriver && (
          <View>
            {/* ETA Banner */}
            <View style={{ backgroundColor: `${GREEN}1A`, borderWidth: 1, borderColor: `${GREEN}4D`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" }}>
                    <MaterialIcons name="navigation" size={22} color="#fff" />
                  </View>
                  <View>
                    <Text style={{ color: GREEN, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {activeRide.status === "driver_arriving" ? "Driver Arriving" : activeRide.status === "matched" ? "Driver Assigned" : "On Trip"}
                    </Text>
                    <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16 }}>{activeRide.driverName || "Your Driver"}</Text>
                  </View>
                </View>
                {activeRide.eta && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 28 }}>{activeRide.eta}</Text>
                    <Text style={{ color: MUTED, fontSize: 11 }}>min</Text>
                  </View>
                )}
              </View>
            </View>

            {showNearbyAlert && (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: `${GOLD}1A`, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: `${GOLD}55` }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${GOLD}26`, alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="notifications-active" size={18} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13, marginBottom: 2 }}>Driver is almost here</Text>
                  <Text style={{ color: TEXT, fontSize: 12, lineHeight: 18 }}>
                    {`${activeRide.driverName || "Your driver"} is within ${Math.max(1, Math.ceil(((activeRide.etaSeconds || 60)) / 60))} minute${Math.max(1, Math.ceil(((activeRide.etaSeconds || 60)) / 60)) === 1 ? "" : "s"}. Please be ready at your pickup point.`}
                  </Text>
                </View>
              </View>
            )}

            {/* Driver Card — full profile */}
            <View style={{ backgroundColor: CARD, borderRadius: 16, marginBottom: 10, borderWidth: 0.5, borderColor: BORDER, overflow: "hidden" }}>
              {/* Top: avatar + name + plate */}
              <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 14 }}>
                {/* Avatar */}
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${GREEN}33`, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: GREEN }}>
                  <MaterialIcons name="person" size={36} color={GREEN} />
                </View>
                {/* Name + rating + vehicle */}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: "800", fontSize: 17, marginBottom: 2 }}>{activeRide.driverName || "Your Driver"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 }}>
                    {[1,2,3,4,5].map(i => (
                      <MaterialIcons key={i} name="star" size={13} color={i <= Math.round(activeRide.driverRating ?? 5) ? GOLD : BORDER} />
                    ))}
                    <Text style={{ color: MUTED, fontSize: 12, marginLeft: 2 }}>{activeRide.driverRating?.toFixed(1)}</Text>
                    {activeRide.driverTotalTrips && (
                      <Text style={{ color: MUTED, fontSize: 11, marginLeft: 4 }}>· {activeRide.driverTotalTrips} trips</Text>
                    )}
                  </View>
                  {/* Vehicle + colour swatch */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: MUTED, fontSize: 12 }}>{activeRide.driverVehicle}</Text>
                    {activeRide.driverColour && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: activeRide.driverColourHex || '#888', borderWidth: 1, borderColor: BORDER }} />
                        <Text style={{ color: MUTED, fontSize: 11 }}>{activeRide.driverColour}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {/* Plate badge */}
                <View style={{ alignItems: "center", gap: 4 }}>
                  <View style={{ backgroundColor: `${GOLD}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${GOLD}55` }}>
                    <Text style={{ color: GOLD, fontWeight: "800", fontSize: 13, letterSpacing: 1 }}>{activeRide.driverPlate}</Text>
                  </View>
                  {activeRide.etaSeconds !== undefined && activeRide.etaSeconds > 0 && (
                    <Text style={{ color: GREEN, fontSize: 11, fontWeight: "600" }}>
                      {Math.floor(activeRide.etaSeconds / 60)}:{String(activeRide.etaSeconds % 60).padStart(2, '0')}
                    </Text>
                  )}
                </View>
              </View>
              {/* Ride PIN row */}
              {activeRide.ridePin && (
                <TouchableOpacity
                  onPress={async () => {
                    try { await Share.share({ message: `My HY3N pickup code is ${activeRide.ridePin}. Please confirm it before the ride starts.`, title: "HY3N Pickup Code" }); } catch {}
                  }}
                  accessibilityLabel="Share ride pickup code"
                  accessibilityHint="Shares the pickup code with the driver or a trusted person"
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: `#0A0A0A`, borderTopWidth: 0.5, borderTopColor: BORDER }}
                >
                  <MaterialIcons name="lock" size={14} color={GOLD} />
                  <Text style={{ color: MUTED, fontSize: 12 }}>Pickup code:</Text>
                  <Text style={{ color: GOLD, fontWeight: "800", fontSize: 16, letterSpacing: 4 }}>{activeRide.ridePin}</Text>
                  <Text style={{ color: MUTED, fontSize: 11 }}>Tap to share</Text>
                </TouchableOpacity>
              )}
              {activeRide.rideOptions && selectedRideOptionLabels(activeRide.rideOptions).length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: `${GREEN}12`, borderTopWidth: 0.5, borderTopColor: `${GREEN}44` }}>
                  <MaterialIcons name="tune" size={15} color={GREEN} />
                  <Text style={{ color: GREEN, fontSize: 11, flex: 1 }} numberOfLines={2}>
                    Preferences: {selectedRideOptionLabels(activeRide.rideOptions).join(" · ")}
                  </Text>
                </View>
              )}
              {/* Surge badge if applicable */}
              {activeRide.surgeMultiplier && activeRide.surgeMultiplier > 1 && (() => {
                const surgeInfo = getSurgePeriodInfo();
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#F59E0B18", borderTopWidth: 0.5, borderTopColor: "#F59E0B40" }}>
                    <MaterialIcons name="bolt" size={14} color="#F59E0B" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "600" }}>Fare includes high-demand pricing</Text>
                      {surgeInfo.isActive && (
                        <Text style={{ color: "#F59E0B", fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                          {surgeInfo.label} • Ends at {surgeInfo.endTime}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })()}
              {/* Divider */}
              <View style={{ height: 0.5, backgroundColor: BORDER, marginHorizontal: 14 }} />
              {/* Bottom: call + message buttons */}
              <View style={{ flexDirection: "row", padding: 12, gap: 10 }}>
                <TouchableOpacity
                  onPress={handleCallDriver}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: GREEN }}
                >
                  <MaterialIcons name="phone" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowChat(true)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: `${GOLD}22`, borderWidth: 1, borderColor: `${GOLD}55` }}
                >
                  <MaterialIcons name="chat" size={18} color={GOLD} />
                  <Text style={{ color: GOLD, fontWeight: "700", fontSize: 14 }}>Message</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Waiting Timer — shown when driver is at pickup */}
            {activeRide.status === 'driver_arrived' && (
              <View style={{ backgroundColor: riderWaitSeconds >= riderFreeWaitSecs ? '#1A0A00' : '#0A1A0A', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: riderWaitSeconds >= riderFreeWaitSecs ? GOLD : GREEN, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <MaterialIcons name="access-time" size={16} color={riderWaitSeconds >= riderFreeWaitSecs ? GOLD : GREEN} />
                  <Text style={{ color: riderWaitSeconds >= riderFreeWaitSecs ? GOLD : GREEN, fontSize: 13, fontWeight: '600' }}>
                    {riderWaitSeconds < riderFreeWaitSecs
                      ? `Driver waiting — ${Math.floor((riderFreeWaitSecs - riderWaitSeconds) / 60)}m ${(riderFreeWaitSecs - riderWaitSeconds) % 60}s free remaining`
                      : `Waiting fee: GH\u20b5${riderCurrentWaitingFee.toFixed(2)} (${Math.floor((riderWaitSeconds - riderFreeWaitSecs) / 60)}m ${(riderWaitSeconds - riderFreeWaitSecs) % 60}s)`
                    }
                  </Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 11 }}>
                  {`Your driver has been waiting ${Math.floor(riderWaitSeconds / 60)}m ${riderWaitSeconds % 60}s · 3 min free`}
                </Text>
              </View>
            )}

            {activeRide.status === 'in_progress' && (
              <View style={{ backgroundColor: `${GOLD}12`, borderColor: `${GOLD}44`, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: GOLD, fontSize: 13, fontWeight: '800' }}>Live trip fare</Text>
                  <Text style={{ color: GOLD, fontSize: 18, fontWeight: '900' }}>GH₵{liveFare.toFixed(2)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: MUTED, fontSize: 11 }}>Actual distance</Text>
                  <Text style={{ color: TEXT, fontSize: 11, fontWeight: '700' }}>{(activeRide.actualDistanceKm ?? 0).toFixed(2)} km</Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 10, marginTop: 5 }}>Updates from GPS movement; the booking estimate is not charged as travelled distance.</Text>
              </View>
            )}

            {activeRide.safetySignal === "route_deviation" && (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: `${RED}18`, borderColor: `${RED}66`, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <MaterialIcons name="route" size={20} color={RED} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: RED, fontWeight: "800", fontSize: 13 }}>Route check</Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Your driver appears to be away from the planned route. Use Emergency Assist or contact support if you feel unsafe.</Text>
                </View>
              </View>
            )}
            {activeRide.safetySignal === "long_stop" && (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: `${GOLD}18`, borderColor: `${GOLD}66`, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <MaterialIcons name="pause-circle-outline" size={20} color={GOLD} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: GOLD, fontWeight: "800", fontSize: 13 }}>Trip check</Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>The vehicle has been stationary for several minutes. Check in with your driver or use Emergency Assist.</Text>
                </View>
              </View>
            )}

            {/* Trip Route */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, backgroundColor: `${CARD}`, borderRadius: 14, marginBottom: 10, borderWidth: 0.5, borderColor: BORDER, borderLeftWidth: 3, borderLeftColor: GOLD }}>
              <View style={{ alignItems: "center", gap: 4, marginTop: 2 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN }} />
                <View style={{ width: 1, height: 28, backgroundColor: BORDER }} />
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD }} />
              </View>
              <View style={{ flex: 1, gap: 10 }}>
                <View>
                  <Text style={{ color: MUTED, fontSize: 10 }}>Pickup</Text>
                  <Text style={{ color: TEXT, fontSize: 13, fontWeight: "500" }}>{activeRide.pickup}</Text>
                </View>
                <View>
                  <Text style={{ color: MUTED, fontSize: 10 }}>Destination</Text>
                  <Text style={{ color: TEXT, fontSize: 13, fontWeight: "500" }}>{activeRide.destination.name}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 16 }}>GH₵{liveFare.toFixed(2)}</Text>
                <Text style={{ color: MUTED, fontSize: 10, marginTop: 3 }}>Estimate updates</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, marginTop: 2, borderTopWidth: 0.5, borderTopColor: BORDER }}>
              <MaterialIcons name="lock" size={13} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 11 }}>Payment: {activeRide.payment || "Selected method"} · locked for this ride</Text>
            </View>

            {/* Share Trip + SOS row */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={handleShareTrip}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: BORDER }}
              >
                <MaterialIcons name="share" size={16} color={MUTED} />
                <Text style={{ color: MUTED, fontSize: 13, fontWeight: "500" }}>Share Trip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEmergencyAssist}
                accessibilityLabel="Emergency assist"
                accessibilityHint="Shares trip details or calls emergency services"
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: `${RED}1A`, borderRadius: 12, borderWidth: 1, borderColor: `${RED}55` }}
              >
                <MaterialIcons name="emergency" size={18} color={RED} />
                <Text style={{ color: RED, fontSize: 13, fontWeight: "700" }}>Emergency</Text>
              </TouchableOpacity>
            </View>

            {/* In-ride chat button */}
            <TouchableOpacity
              onPress={() => setShowChat(true)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, backgroundColor: `${GOLD}0D`, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: `${GOLD}33` }}
            >
              <MaterialIcons name="chat-bubble-outline" size={16} color={GOLD} />
              <Text style={{ color: GOLD, fontSize: 13, fontWeight: "600" }}>Message Driver</Text>
            </TouchableOpacity>

            {activeRide.status !== "in_progress" && (
              <TouchableOpacity
                onPress={handleCancelRide}
                style={{ alignItems: "center", paddingVertical: 12 }}
              >
                <Text style={{ color: RED, fontSize: 14, fontWeight: "500" }}>Cancel Ride</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isCompleted && (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <MaterialIcons name="check-circle" size={40} color={GREEN} />
            </View>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 20, marginBottom: 4 }}>Trip Complete!</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>Thank you for riding with HY3N</Text>

            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, width: "100%", marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
              <Row label="Base Fare" value={`GH₵${liveFare.toFixed(2)}`} />
              {activeRide.waitingFee && activeRide.waitingFee > 0 && (
                <Row label="Waiting Fee" value={`+GH₵${activeRide.waitingFee.toFixed(2)}`} valueColor={RED} />
              )}
              {tipAmount && tipAmount > 0 && (
                <Row label="Tip" value={`+GH₵${tipAmount.toFixed(2)}`} valueColor={GREEN} />
              )}
              <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                <Row
                  label="Total"
                  value={`GH₵${(liveFare + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2)}`}
                  valueColor={GOLD}
                  bold
                />
              </View>
            </View>

            {!tipAdded && (
              <TouchableOpacity
                onPress={() => setShowTipModal(true)}
                style={{ width: "100%", borderWidth: 1, borderColor: `${GREEN}66`, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginBottom: 10, flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                <MaterialIcons name="attach-money" size={18} color={GREEN} />
                <Text style={{ color: GREEN, fontWeight: "600", fontSize: 14 }}>Add Tip</Text>
              </TouchableOpacity>
            )}
            {tipAdded && (
              <View style={{ width: "100%", backgroundColor: `${GREEN}1A`, borderRadius: 12, padding: 12, marginBottom: 10, alignItems: "center", borderWidth: 1, borderColor: `${GREEN}33` }}>
                <Text style={{ color: GREEN, fontWeight: "600", fontSize: 13 }}>Tip Added: GH₵{tipAmount?.toFixed(2)}</Text>
                <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Thank you for your generosity!</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => {
                setCompletedRideData({
                  rideId: activeRide.firestoreId || activeRide.id,
                  driverName: activeRide.driverName || 'Driver',
                  driverRating: activeRide.driverRating || 4.8,
                  fare: liveFare,
                  tip: tipAmount || 0,
                  distance: activeRide.distance,
                  duration: activeRide.duration,
                  pickupAddress: pickupAddress,
                  destinationAddress: activeRide.destination.name,
                });
                setShowPostRideModal(true);
              }}
              style={{ width: "100%", backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10, flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              <MaterialIcons name="star" size={18} color="#000" />
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 15 }}>Rate & Share Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleFinishRide}
              style={{ width: "100%", alignItems: "center", paddingVertical: 12 }}
            >
              <Text style={{ color: MUTED, fontSize: 13 }}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderBookingSheet = () => (
    <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {/* Destination header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
        <TouchableOpacity
          onPress={handleCancelBooking}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: CARD, alignItems: "center", justifyContent: "center", marginRight: 10 }}
        >
          <MaterialIcons name="arrow-back" size={18} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>To</Text>
          <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 15 }} numberOfLines={1}>{destination?.name}</Text>
          <Text style={{ color: MUTED, fontSize: 11 }}>{distance.toFixed(1)} km · ~{duration} min</Text>
        </View>
      </View>

      {/* Stops / Waypoints */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>
            Stops ({stops.length}/3)
          </Text>
          <TouchableOpacity onPress={handleAddStop} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="add-circle-outline" size={16} color={GOLD} />
            <Text style={{ color: GOLD, fontSize: 12, fontWeight: "600" }}>Add stop</Text>
          </TouchableOpacity>
        </View>
        {stops.map((stop, idx) => (
          <View key={`${stop?.name}-${idx}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: CARD, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: BORDER, marginBottom: 6 }}>
            <MaterialIcons name="place" size={16} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{stop?.name}</Text>
              <Text style={{ color: MUTED, fontSize: 11 }} numberOfLines={1}>{stop?.address}</Text>
            </View>
            <TouchableOpacity
              disabled={idx === 0}
              onPress={() => moveStop(idx, -1)}
              accessibilityLabel={idx === 0 ? "First stop cannot move up" : "Move stop up"}
              accessibilityHint={idx === 0 ? "This is already the first stop" : "Moves this stop earlier in the route"}
            >
              <MaterialIcons name="arrow-upward" size={16} color={idx === 0 ? BORDER : MUTED} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={idx === stops.length - 1}
              onPress={() => moveStop(idx, 1)}
              accessibilityLabel={idx === stops.length - 1 ? "Last stop cannot move down" : "Move stop down"}
              accessibilityHint={idx === stops.length - 1 ? "This is already the last stop" : "Moves this stop later in the route"}
            >
              <MaterialIcons name="arrow-downward" size={16} color={idx === stops.length - 1 ? BORDER : MUTED} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStops((prev) => prev.filter((_, i) => i !== idx))}>
              <MaterialIcons name="close" size={16} color={RED} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Surge banner — Uber/Bolt style: plain language, no multiplier */}
      {SURGE > 1 && (() => {
        const surgeInfo = getSurgePeriodInfo();
        return (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#F59E0B18", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#F59E0B40" }}>
            <MaterialIcons name="bolt" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={{ color: "#F59E0B", fontWeight: "700", fontSize: 13 }}>High Demand</Text>
                {surgeInfo.isActive && (
                  <View style={{ backgroundColor: "#F59E0B33", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ color: "#F59E0B", fontSize: 10, fontWeight: "600" }}>
                      {surgeInfo.label}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ color: "#F59E0B", fontSize: 12, lineHeight: 17, opacity: 0.85, marginBottom: 6 }}>More people are requesting rides than there are available drivers.</Text>
              {surgeInfo.isActive && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialIcons name="schedule" size={14} color="#F59E0B" />
                  <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "600" }}>
                    High demand until {surgeInfo.endTime}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })()}
      {/* Ride Categories */}
      <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Choose Ride</Text>
      {RIDE_CATEGORIES.map((cat) => {
        const fare = calculateFare(cat.id, distance, duration);
        const isSelected = selectedCategory.id === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategory(cat)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 14,
              marginBottom: 8,
              backgroundColor: isSelected ? `${GOLD}1A` : CARD,
              borderWidth: 1.5,
              borderColor: isSelected ? GOLD : BORDER,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: isSelected ? `${GOLD}33` : "#222", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name={cat.icon as any} size={20} color={isSelected ? GOLD : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 13 }}>{cat.name}</Text>
              <Text style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>{cat.description}</Text>
              {cat.seats > 0 && <Text style={{ color: MUTED, fontSize: 10 }}>{cat.seats} seats</Text>}
            </View>
            <Text style={{ color: isSelected ? GOLD : TEXT, fontWeight: "bold", fontSize: 15 }}>GH₵{fare.toFixed(2)}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Payment Method */}
      <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8, marginTop: 4 }}>Payment Method</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {PAYMENT_METHODS.map((pm) => {
          const isSelected = selectedPayment.id === pm.id;
          return (
            <TouchableOpacity
              key={pm.id}
              onPress={() => setSelectedPayment(pm)}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 4,
                borderRadius: 12,
                backgroundColor: isSelected ? `${GOLD}1A` : CARD,
                borderWidth: 1,
                borderColor: isSelected ? GOLD : BORDER,
                gap: 4,
              }}
            >
              <MaterialIcons name={pm.icon as any} size={18} color={isSelected ? GOLD : MUTED} />
              <Text style={{ color: isSelected ? GOLD : MUTED, fontSize: 11, fontWeight: "500" }}>{pm.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Trip Type */}
      <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600", marginBottom: 8 }}>Trip Type</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => { setIsScheduled(false); setScheduledFor(null); }}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: !isScheduled ? `${GOLD}1A` : CARD, borderWidth: 1, borderColor: !isScheduled ? GOLD : BORDER }}
        >
          <MaterialIcons name="flash-on" size={16} color={!isScheduled ? GOLD : MUTED} />
          <Text style={{ color: !isScheduled ? GOLD : MUTED, fontSize: 13, fontWeight: "600" }}>Now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowScheduleModal(true)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: isScheduled ? `${GOLD}1A` : CARD, borderWidth: 1, borderColor: isScheduled ? GOLD : BORDER }}
        >
          <MaterialIcons name="event" size={16} color={isScheduled ? GOLD : MUTED} />
          <Text style={{ color: isScheduled ? GOLD : MUTED, fontSize: 13, fontWeight: "600" }}>
            {isScheduled && scheduledFor ? scheduledFor : "Schedule"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Book for Someone */}
      <TouchableOpacity
        onPress={() => setBookForSomeone(!bookForSomeone)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: bookForSomeone ? `${GOLD}1A` : CARD,
          borderWidth: 1,
          borderColor: bookForSomeone ? GOLD : BORDER,
          marginBottom: bookForSomeone ? 12 : 10,
        }}
      >
        <MaterialIcons name="person-add" size={18} color={bookForSomeone ? GOLD : MUTED} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: bookForSomeone ? GOLD : MUTED, fontSize: 13, fontWeight: "600" }}>Book for Someone</Text>
          <Text style={{ color: MUTED, fontSize: 11 }}>Book a ride for another person</Text>
        </View>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: bookForSomeone ? GOLD : BORDER, alignItems: "center", justifyContent: "center" }}>
          {bookForSomeone && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD }} />}
        </View>
      </TouchableOpacity>

      {bookForSomeone && (
        <View style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: BORDER, gap: 10 }}>
          <TextInput
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Recipient's name"
            placeholderTextColor={MUTED}
            style={{ backgroundColor: BG, borderRadius: 8, padding: 10, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER }}
          />
          <TextInput
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            placeholder="Phone number (e.g., 0501234567)"
            placeholderTextColor={MUTED}
            keyboardType="phone-pad"
            style={{ backgroundColor: BG, borderRadius: 8, padding: 10, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER }}
          />
          <TextInput
            value={recipientAddress}
            onChangeText={setRecipientAddress}
            placeholder="Pickup address (optional)"
            placeholderTextColor={MUTED}
            multiline
            numberOfLines={2}
            style={{ backgroundColor: BG, borderRadius: 8, padding: 10, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER }}
          />
        </View>
      )}

      {/* Ride Preferences */}
      <TouchableOpacity
        onPress={() => setShowRideOptions(true)}
        accessibilityLabel="Ride preferences"
        accessibilityHint="Choose vehicle preferences for this booking"
        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: selectedOptionLabels.length > 0 ? `${GREEN}1A` : CARD, borderWidth: 1, borderColor: selectedOptionLabels.length > 0 ? GREEN : BORDER, marginBottom: 12 }}
      >
        <MaterialIcons name="tune" size={18} color={selectedOptionLabels.length > 0 ? GREEN : MUTED} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: selectedOptionLabels.length > 0 ? GREEN : MUTED, fontSize: 13, fontWeight: "600" }}>Ride preferences</Text>
          <Text style={{ color: MUTED, fontSize: 11 }} numberOfLines={1}>
            {selectedOptionLabels.length > 0 ? selectedOptionLabels.join(" · ") : "AC, pet, luggage, or accessibility"}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={MUTED} />
      </TouchableOpacity>

      {/* Tip Selector */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: MUTED, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Add a tip</Text>
          {preTipAmount > 0 && <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 13 }}>GH₵{preTipAmount.toFixed(2)}</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[10, 15, 20].map((percent) => (
            <TouchableOpacity
              key={percent}
              onPress={() => { setSelectedTipPercent(percent); setCustomTip(""); }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: selectedTipPercent === percent ? GOLD : CARD,
                borderWidth: 1,
                borderColor: selectedTipPercent === percent ? GOLD : BORDER,
                alignItems: "center",
              }}
            >
              <Text style={{ color: selectedTipPercent === percent ? "#000" : TEXT, fontWeight: "600", fontSize: 13 }}>{percent}%</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            value={customTip}
            onChangeText={(t) => { setCustomTip(t); setSelectedTipPercent(null); }}
            placeholder="Custom amount"
            placeholderTextColor="#4A4A4A"
            keyboardType="decimal-pad"
            style={{ flex: 1, backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: BORDER }}
          />
          <TouchableOpacity
            onPress={() => { setSelectedTipPercent(null); setCustomTip(""); }}
            style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialIcons name="close" size={18} color={MUTED} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Promo Code */}
      {appliedPromo ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${GREEN}1A`, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: `${GREEN}4D` }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MaterialIcons name="local-offer" size={16} color={GREEN} />
            <Text style={{ color: GREEN, fontSize: 13, fontWeight: "600" }}>{appliedPromo} applied</Text>
            <Text style={{ color: GOLD, fontSize: 13, fontWeight: "bold" }}>-GH₵{discount.toFixed(2)}</Text>
          </View>
          <TouchableOpacity onPress={() => { setAppliedPromo(null); setPromoInput(""); }}>
            <MaterialIcons name="close" size={16} color={MUTED} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ marginBottom: 10 }}>
          <TouchableOpacity
            onPress={() => setPromoExpanded(!promoExpanded)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}
          >
            <MaterialIcons name="local-offer" size={16} color={MUTED} />
            <Text style={{ color: MUTED, fontSize: 13, fontWeight: "500", flex: 1 }}>Add promo code</Text>
            <MaterialIcons name={promoExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={18} color={MUTED} />
          </TouchableOpacity>
          {promoExpanded && (
            <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
              <TextInput
                value={promoInput}
                onChangeText={(t) => { setPromoInput(t); setPromoError(""); }}
                placeholder="Enter code"
                placeholderTextColor="#4A4A4A"
                autoCapitalize="characters"
                style={{ flex: 1, backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: TEXT, fontSize: 13, borderWidth: 1, borderColor: promoError ? RED : BORDER }}
                returnKeyType="done"
                onSubmitEditing={handleApplyPromo}
              />
              <TouchableOpacity
                onPress={handleApplyPromo}
                style={{ backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#000", fontWeight: "bold", fontSize: 13 }}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}
          {promoError ? <Text style={{ color: RED, fontSize: 11, marginTop: 4, marginLeft: 4 }}>{promoError}</Text> : null}
        </View>
      )}


      {/* Fare Summary */}
      <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: BORDER }}>
        {/* Surge indicator — plain language, no multiplier */}
        {SURGE > 1 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F59E0B18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 }}>
            <MaterialIcons name="bolt" size={14} color="#F59E0B" />
            <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "600" }}>Prices are higher due to demand</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View>
            <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 4 }}>
              Estimated Fare
            </Text>
            {discount > 0 && (
              <Text style={{ color: MUTED, fontSize: 11, textDecorationLine: "line-through" }}>GH₵{baseFare.toFixed(2)}</Text>
            )}
          </View>
          <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 24 }}>
            GH₵{Math.max(0, finalFare * 0.92).toFixed(2)}–{(finalFare * 1.12).toFixed(2)}
          </Text>
        </View>
        {/* Fare breakdown with booking fee */}
        <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ color: MUTED, fontSize: 11 }}>Base fare + distance</Text>
            <Text style={{ color: TEXT, fontSize: 11, fontWeight: "600" }}>GH₵{(finalFare * 0.85).toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ color: MUTED, fontSize: 11 }}>Booking fee</Text>
            <Text style={{ color: TEXT, fontSize: 11, fontWeight: "600" }}>GH₵2.50</Text>
          </View>
          {preTipAmount > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
              <Text style={{ color: MUTED, fontSize: 11 }}>Tip</Text>
              <Text style={{ color: GOLD, fontSize: 11, fontWeight: "600" }}>GH₵{preTipAmount.toFixed(2)}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>Estimated range based on live traffic, pickup timing, and waiting time</Text>
      </View>

      {/* Book Button */}
      <TouchableOpacity
        onPress={handleBook}
        disabled={bookingLoading || (isScheduled && !scheduledFor)}
        style={{
          backgroundColor: GREEN,
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          marginBottom: 8,
          opacity: (isScheduled && !scheduledFor) ? 0.5 : 1,
        }}
      >
        {bookingLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialIcons name={isScheduled ? "event" : "navigation"} size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
              {isScheduled ? "Schedule Trip" : `Request HY3N · GH₵${finalFare.toFixed(2)}`}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderDefaultSheet = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      {/* Pickup row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, paddingHorizontal: 4 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN, borderWidth: 2, borderColor: '#00FF88' }} />
        <Text style={{ color: MUTED, fontSize: 12, flex: 1 }} numberOfLines={1}>{pickupAddress}</Text>
        <TouchableOpacity onPress={() => Alert.alert("Pickup", "Drag the map pin to change your pickup location")}>
          <MaterialIcons name="edit-location" size={18} color={GOLD} />
        </TouchableOpacity>
      </View>
      {/* Divider line */}
      <View style={{ width: 1, height: 10, backgroundColor: BORDER, marginLeft: 8, marginBottom: 4 }} />
      {/* Nearby cars indicator */}
      {nearbyDrivers.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingHorizontal: 2 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
          <Text style={{ color: GREEN, fontSize: 13, fontWeight: '600' }}>
            {nearbyDrivers.length} car{nearbyDrivers.length !== 1 ? 's' : ''} nearby
          </Text>
          <Text style={{ color: MUTED, fontSize: 12 }}>· HY3N is available in your area</Text>
        </View>
      )}
      {/* Destination search */}
      <TouchableOpacity
        onPress={() => setSearchOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: BORDER }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="search" size={22} color="#000" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 16 }}>Wo kɔ he?</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Where are you going?</Text>
        </View>
        <MaterialIcons name="location-on" size={20} color={MUTED} />
      </TouchableOpacity>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {savedPlaces.map((place, i) => {
            const iconName: any = place.name.toLowerCase() === "home" ? "home" : place.name.toLowerCase() === "work" ? "work" : "star";
            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleQuickPlace(place)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, minWidth: 110 }}
              >
                <MaterialIcons name={iconName} size={16} color={GOLD} />
                <View>
                  <Text style={{ color: TEXT, fontWeight: "600", fontSize: 13 }}>{place.name}</Text>
                  <Text style={{ color: MUTED, fontSize: 10 }} numberOfLines={1}>{place.address}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setSearchOpen(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: `${CARD}80`, borderRadius: 12, borderWidth: 1, borderColor: BORDER }}
          >
            <MaterialIcons name="add" size={16} color={MUTED} />
            <Text style={{ color: MUTED, fontSize: 13, fontWeight: "500" }}>Add</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Promotions Banner */}
      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: TEXT, fontWeight: "700", fontSize: 14 }}>Promotions</Text>
          <Text style={{ color: GOLD, fontSize: 12 }}>Tap to apply</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              { code: "FIRSTRIDE", label: "First Ride Free", desc: "100% off your first ride", color: GREEN },
              { code: "HY3N10", label: "10% Off", desc: "10% off any ride", color: GOLD },
              { code: "WEEKEND", label: "Weekend Deal", desc: "GH₵5 off weekends", color: "#7C3AED" },
              { code: "FREERIDE", label: "Free Ride", desc: "One free ride on us", color: "#0EA5E9" },
              { code: "WELCOME", label: "Welcome Bonus", desc: "GH₵10 credit", color: "#F59E0B" },
            ].map((promo) => (
              <TouchableOpacity
                key={promo.code}
                onPress={() => {
                  setPromoInput(promo.code);
                  setPromoExpanded(true);
                  setDestination({ name: destination?.name || "", address: destination?.address || "", lat: destination?.lat || 5.6037, lng: destination?.lng || -0.187 });
                }}
                style={{ width: 160, backgroundColor: `${promo.color}18`, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${promo.color}44` }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <MaterialIcons name="local-offer" size={16} color={promo.color} />
                  <View style={{ backgroundColor: `${promo.color}22`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: promo.color, fontSize: 10, fontWeight: "700" }}>{promo.code}</Text>
                  </View>
                </View>
                <Text style={{ color: TEXT, fontWeight: "700", fontSize: 13 }}>{promo.label}</Text>
                <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{promo.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );

  const sheetHeight = activeRide
    ? (activeRide.status === "completed" ? SCREEN_HEIGHT * 0.75 : SCREEN_HEIGHT * 0.65)
    : destination
    ? SCREEN_HEIGHT * 0.72
    : SCREEN_HEIGHT * 0.38;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Real map using Leaflet + OpenStreetMap dark tiles — works on Expo Go, web, and production */}
      <LeafletMap
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        center={userLocation}
        zoom={14}
        userLocation={userLocation}
        destination={destination ? [destination.lat, destination.lng] : null}
        driverLocation={
          activeRide?.driverLocation
            ? [activeRide.driverLocation.lat, activeRide.driverLocation.lng]
            : null
        }
        driverBearing={activeRide?.driverBearing ?? null}
        safetySignal={activeRide?.safetySignal ?? "clear"}
        nearbyDrivers={nearbyDrivers}
      />

      {/* Header */}
      <View style={{ position: "absolute", top: safeTop + 4, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
        <View style={{ flexDirection: "column" }}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={{ width: 80, height: 40, resizeMode: 'contain' }}
          />
          <Text style={{ color: GOLD, fontSize: 20, fontWeight: '800', letterSpacing: 0.3, marginTop: 3, textShadowColor: 'rgba(212,175,55,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }}>
            Akwaaba{riderProfile?.full_name ? `, ${riderProfile.full_name.split(' ')[0]}` : ''}! 👋
          </Text>
          <Text style={{ color: 'rgba(212,175,55,0.75)', fontSize: 13, fontWeight: '500', fontStyle: 'italic', marginTop: 1 }}>
            Wo ho te sɛn?
          </Text>
        </View>
        <TouchableOpacity
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(17,17,17,0.9)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER }}
          onPress={() => Alert.alert("Notifications", "No new notifications")}
        >
          <MaterialIcons name="notifications" size={20} color={TEXT} />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: SURFACE,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: insets.bottom + 16,
        maxHeight: sheetHeight,
        borderTopWidth: 1,
        borderTopColor: BORDER,
        zIndex: 10,
      }}>
        {/* Drag handle */}
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER }} />
        </View>
        {activeRide ? renderActiveRide() : destination ? renderBookingSheet() : renderDefaultSheet()}
      </View>

      {/* Search Modal */}
      <Modal visible={searchOpen} animationType="slide" presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity
              onPress={() => { setSearchOpen(false); setSearchQuery(""); }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialIcons name="arrow-back" size={20} color={TEXT} />
            </TouchableOpacity>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Where are you going?"
              placeholderTextColor={MUTED}
              autoFocus
              style={{ flex: 1, color: TEXT, fontSize: 16, paddingVertical: 8 }}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <MaterialIcons name="close" size={20} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>

          {suggestionsLoading && searchQuery.length >= 2 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
              <ActivityIndicator size="small" color={GOLD} />
              <Text style={{ color: MUTED, fontSize: 13 }}>Searching...</Text>
            </View>
          )}

          <FlatList
            data={searchQuery ? filteredDestinations : [...(searchHistory.length > 0 ? searchHistory : []), ...POPULAR_DESTINATIONS.slice(0, 8)]}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            ListHeaderComponent={
              <>
                {searchHistory.length > 0 && !searchQuery && (
                  <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>Recent</Text>
                  </View>
                )}
                {searchQuery && placeSuggestions.length > 0 && (
                  <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>Suggestions</Text>
                  </View>
                )}
                {!searchQuery && (
                  <View style={{ paddingHorizontal: 16, paddingTop: searchHistory.length > 0 ? 4 : 16, paddingBottom: 8 }}>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>Popular</Text>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelectDestination(item)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: BORDER }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="location-on" size={18} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: "600", fontSize: 14 }}>{item.name}</Text>
                  <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{item.address}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={MUTED} />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Ride Preferences Modal */}
      <Modal visible={showRideOptions} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Ride preferences</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>We’ll request these preferences when the matching supply supports them.</Text>
            {RIDE_OPTION_DEFINITIONS.map((option) => {
              const enabled = rideOptions[option.key];
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => updateRideOption(option.key)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: enabled }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: BORDER }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: enabled ? `${GREEN}33` : CARD }}>
                    <MaterialIcons name={option.icon as any} size={20} color={enabled ? GREEN : MUTED} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontWeight: "600", fontSize: 14 }}>{option.label}</Text>
                    <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{option.description}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: enabled ? GREEN : BORDER, alignItems: "center", justifyContent: "center" }}>
                    {enabled && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: GREEN }} />}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => setShowRideOptions(false)} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 18 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule Modal */}
      <Modal visible={showScheduleModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Schedule Trip</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>Book from 30 minutes to 7 days ahead</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginBottom: 6 }}>Date (e.g. Jun 20, 2026)</Text>
            <TextInput
              value={scheduleDate}
              onChangeText={setScheduleDate}
              placeholder="Jun 20, 2026"
              placeholderTextColor="#4A4A4A"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 12 }}
            />
            <Text style={{ color: MUTED, fontSize: 12, marginBottom: 6 }}>Time (e.g. 8:00 AM)</Text>
            <TextInput
              value={scheduleTime}
              onChangeText={setScheduleTime}
              placeholder="8:00 AM"
              placeholderTextColor="#4A4A4A"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 20 }}
            />
            <TouchableOpacity
              onPress={handleScheduleConfirm}
              style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Confirm Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowScheduleModal(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: MUTED, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MoMo Payment Modal */}
      <Modal visible={showMomoModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>MoMo Payment</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>Enter your Mobile Money number</Text>
            <TextInput
              value={momoNumber}
              onChangeText={setMomoNumber}
              placeholder="0XX XXX XXXX"
              placeholderTextColor="#4A4A4A"
              keyboardType="phone-pad"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 16 }}
            />
            <TouchableOpacity onPress={() => setShowMomoModal(false)} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Use this number</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMomoModal(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: MUTED, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Card Payment Modal */}
      <Modal visible={showCardModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Card Payment</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>Enter your card details</Text>
            <TextInput
              value={cardName}
              onChangeText={setCardName}
              placeholder="Name on card"
              placeholderTextColor="#4A4A4A"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 10 }}
            />
            <TextInput
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="Card number"
              placeholderTextColor="#4A4A4A"
              keyboardType="number-pad"
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 10 }}
            />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <TextInput
                value={cardExpiry}
                onChangeText={setCardExpiry}
                placeholder="MM/YY"
                placeholderTextColor="#4A4A4A"
                style={{ flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER }}
              />
              <TextInput
                value={cardCvv}
                onChangeText={setCardCvv}
                placeholder="CVV"
                placeholderTextColor="#4A4A4A"
                keyboardType="number-pad"
                secureTextEntry
                style={{ flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER }}
              />
            </View>
            <TouchableOpacity onPress={() => setShowCardModal(false)} style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Use this card</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCardModal(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: MUTED, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 24, paddingBottom: 36 }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18 }}>Rate Your Driver</Text>
              <TouchableOpacity onPress={() => { setShowRatingModal(false); setPendingRatingRideId(null); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="close" size={18} color={MUTED} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>
              How was your experience with {pendingRatingDriverName || activeRide?.driverName || "your driver"}?
            </Text>
            {/* Stars */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRatingValue(star)}>
                  <MaterialIcons name={star <= ratingValue ? "star" : "star-border"} size={44} color={GOLD} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: MUTED, fontSize: 13, textAlign: "center", marginBottom: 20 }}>
              {["Poor", "Fair", "Good", "Great", "Excellent"][ratingValue - 1]}
            </Text>
            {/* Quick tags */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 2 }}>
                {["Great Driver", "Smooth Ride", "On Time", "Clean Car", "Professional", "Safe Driving"].map((tag) => {
                  const active = selectedRatingTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => setSelectedRatingTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? `${GOLD}22` : CARD, borderWidth: 1, borderColor: active ? GOLD : BORDER }}
                    >
                      <Text style={{ color: active ? GOLD : TEXT, fontSize: 13, fontWeight: active ? "600" : "400" }}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            {/* Comment field */}
            <TextInput
              value={ratingComment}
              onChangeText={setRatingComment}
              placeholder="Add a comment (optional)"
              placeholderTextColor={MUTED}
              multiline
              numberOfLines={3}
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, color: TEXT, fontSize: 14, borderWidth: 0.5, borderColor: BORDER, marginBottom: 20, minHeight: 72, textAlignVertical: "top" }}
            />
            {/* Submit */}
            <TouchableOpacity
              onPress={async () => {
                const rideId = pendingRatingRideId || activeRide?.firestoreId;
                const fullComment = [ratingComment.trim(), ...selectedRatingTags].filter(Boolean).join(" · ");
                setRideRated(true);
                setShowRatingModal(false);
                setPendingRatingRideId(null);
                setPendingRatingDriverName(null);
                setRatingComment("");
                setSelectedRatingTags([]);
                if (rideId) {
                  try {
                    await dispatchService.rateDriver(rideId, ratingValue, fullComment);
                  } catch (e) {
                    console.warn('[Rating] Failed to save rating:', e);
                  }
                }
                Alert.alert("Thank you!", `You rated ${pendingRatingDriverName || activeRide?.driverName || "your driver"} ${ratingValue} star${ratingValue !== 1 ? 's' : ''}`);
              }}
              style={{ backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}
            >
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 15 }}>Submit Rating</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowRatingModal(false); setPendingRatingRideId(null); }} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: MUTED, fontSize: 14 }}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tip Modal */}
      <Modal visible={showTipModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: SURFACE, borderRadius: 24, padding: 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, textAlign: "center", marginBottom: 4 }}>Add a Tip</Text>
            <Text style={{ color: MUTED, fontSize: 13, textAlign: "center", marginBottom: 20 }}>Show appreciation for great service</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {[2, 5, 10, 20].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  onPress={() => setTipAmount(amt)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: tipAmount === amt ? `${GREEN}1A` : CARD, borderWidth: 1, borderColor: tipAmount === amt ? GREEN : BORDER }}
                >
                  <Text style={{ color: tipAmount === amt ? GREEN : TEXT, fontWeight: "bold", fontSize: 15 }}>GH₵{amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => {
                if (!tipAmount) return;
                setTipAdded(true);
                setShowTipModal(false);
              }}
              style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: tipAmount ? 1 : 0.5 }}
              disabled={!tipAmount}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Add GH₵{tipAmount || 0} Tip</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTipModal(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: MUTED, fontSize: 14 }}>No Thanks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Trip Receipt Modal */}
      <Modal visible={showReceipt} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
            <TouchableOpacity onPress={() => setShowReceipt(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: CARD, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18 }}>Trip Receipt</Text>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${GREEN}1A`, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <MaterialIcons name="check-circle" size={32} color={GREEN} />
              </View>
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22 }}>GH₵{activeRide ? ((activeRide.currentFare ?? activeRide.fare) + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2) : "0.00"}</Text>
              <Text style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Total Charged</Text>
            </View>
            {/* Trip Info */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
              <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 13, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Trip Details</Text>
              <Row label="Date" value={new Date().toLocaleDateString('en-GH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} />
              <Row label="Pickup" value="Current Location" />
              <Row label="Destination" value={activeRide?.destination.name || "—"} />
              <Row label="Distance" value={`${activeRide ? activeRide.distance.toFixed(1) : 0} km`} />
              <Row label="Duration" value={`${activeRide?.duration || 0} min`} />
              <Row label="Category" value={activeRide?.category || "—"} />
              <Row label="Payment" value={activeRide?.payment || "—"} />
            </View>
            {/* Fare Breakdown */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: BORDER }}>
              <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 13, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Fare Breakdown</Text>
              <Row label="Base Fare" value={`GH₵${activeRide?.fare.toFixed(2) || "0.00"}`} />
              {activeRide?.waitingFee && activeRide.waitingFee > 0 && (
                <Row label="Waiting Fee" value={`+GH₵${activeRide.waitingFee.toFixed(2)}`} valueColor={RED} />
              )}
              {tipAmount && tipAmount > 0 && (
                <Row label="Tip" value={`+GH₵${tipAmount.toFixed(2)}`} valueColor={GREEN} />
              )}
              <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                <Row label="Total" value={`GH₵${activeRide ? ((activeRide.currentFare ?? activeRide.fare) + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2) : "0.00"}`} valueColor={GOLD} bold />
              </View>
            </View>
            {/* Driver Info */}
            {activeRide?.driverName && (
              <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 0.5, borderColor: BORDER }}>
                <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 13, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Driver</Text>
                <Row label="Name" value={activeRide.driverName} />
                {activeRide.driverRating && <Row label="Rating" value={`⭐ ${activeRide.driverRating}`} />}
                {activeRide.driverVehicle && <Row label="Vehicle" value={activeRide.driverVehicle} />}
                {activeRide.driverPlate && <Row label="Plate" value={activeRide.driverPlate} />}
              </View>
            )}
            <TouchableOpacity
              onPress={async () => {
                const receiptText = `HY3N Trip Receipt\nDate: ${new Date().toLocaleDateString('en-GH')}\nDestination: ${activeRide?.destination.name}\nFare: GH₵${(activeRide?.currentFare ?? activeRide?.fare ?? 0).toFixed(2)}\nTotal: GH₵${activeRide ? ((activeRide.currentFare ?? activeRide.fare) + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2) : '0.00'}\nDriver: ${activeRide?.driverName || 'N/A'}\n\nThank you for riding with HY3N!`;
                try { await Share.share({ message: receiptText, title: 'HY3N Trip Receipt' }); } catch {}
              }}
              style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 }}
            >
              <MaterialIcons name="share" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Share Receipt</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      {/* In-Ride Chat Modal — Firestore-backed, real-time with driver */}
      {activeRide && (
        <RideChatModal
          isOpen={showChat}
          onClose={() => setShowChat(false)}
          rideId={activeRide.firestoreId || ''}
          currentUserId={user?.uid || ''}
          currentUserRole="rider"
          currentUserName={riderProfile?.full_name || user?.displayName || 'Rider'}
        />
      )}

      {/* Voice Call — full-screen overlay when in call */}
      <InCallScreen
        call={riderCall}
        otherName={driverName}
        otherRole="driver"
        otherPhone={driverPhone}
      />

      {/* Incoming call modal — shown when driver calls rider */}
      <IncomingCallModal
        call={riderCall}
        otherName={driverName}
        otherRole="driver"
      />

      {/* Cancel with Reason Modal */}
      <Modal visible={showCancelModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}>
          <View style={{ backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ color: TEXT, fontWeight: "800", fontSize: 18, marginBottom: 4 }}>Cancel Ride</Text>
            {(() => {
              const policy = activeRide
                ? getCancellationPolicy(activeRide.status, activeRide.matchedAt)
                : { isFree: true, fee: 0, message: "Cancel without a fee." };
              return policy.isFree ? (
                <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>{policy.message} Select a reason for cancelling:</Text>
              ) : (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                  <Text style={{ color: RED, fontSize: 13, fontWeight: '600' }}>⚠️ GH₵{policy.fee.toFixed(2)} cancellation fee may apply</Text>
                  <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{policy.message}</Text>
                </View>
              );
            })()}
            {CANCEL_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => setCancelReason(reason)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: BORDER }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: cancelReason === reason ? RED : BORDER, alignItems: "center", justifyContent: "center" }}>
                  {cancelReason === reason && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: RED }} />}
                </View>
                <Text style={{ color: TEXT, fontSize: 14 }}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: "center" }}
              >
                <Text style={{ color: TEXT, fontWeight: "600" }}>Keep Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmCancelRide}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: RED, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Cancel Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showScheduledToast && (
        <View pointerEvents="none" style={{ position: "absolute", top: safeTop + 12, left: 16, right: 16, zIndex: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${GOLD}66`, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${GOLD}1F`, alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="event-available" size={20} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontWeight: "700", fontSize: 14 }}>Scheduled trip confirmed</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
                {scheduledFor ? `Pickup set for ${scheduledFor}. We'll remind you before the ride starts.` : "Your pickup time has been saved."}
              </Text>
            </View>
          </View>
        </View>
      )}

      {completedRideData && (
        <PostRideModal
          isVisible={showPostRideModal}
          rideId={completedRideData.rideId}
          driverName={completedRideData.driverName}
          driverRating={completedRideData.driverRating}
          fare={completedRideData.fare}
          tip={completedRideData.tip}
          distance={completedRideData.distance}
          duration={completedRideData.duration}
          pickupAddress={completedRideData.pickupAddress}
          destinationAddress={completedRideData.destinationAddress}
          riderEmail={user?.email || ""}
          riderName={(riderProfile as any)?.full_name || user?.displayName || "HY3N Rider"}
          driverVehicle={activeRide?.driverVehicle || "HY3N vehicle"}
          driverPlate={activeRide?.driverPlate || "Not available"}
          paymentMethod={activeRide?.payment || "Selected method"}
          category={activeRide?.category || "Ride"}
          completedAt={new Date().toISOString()}
          receiptEmailStatus={receiptEmailStatus}
          onReceiptEmailStatusChange={setReceiptEmailStatus}
          onClose={() => {
            setShowPostRideModal(false);
            setRideRated(true);
          }}
          onRatingSubmitted={() => {
            setRideRated(true);
          }}
        />
      )}

    </View>
  );
}
// Helper component for key-value rows
function Row({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
      <Text style={{ color: MUTED, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: valueColor || TEXT, fontSize: 12, fontWeight: bold ? "bold" : "600", flex: 1, textAlign: "right" }} numberOfLines={1}>{value}</Text>
    </View>
  );
}
