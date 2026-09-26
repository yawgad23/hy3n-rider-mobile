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
  PanResponder,
} from "react-native";
import LeafletMap from "@/components/LeafletMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { useThemeContext } from "@/lib/theme-provider";
import { useColors } from "@/hooks/use-colors";
import { auth, firestoreDB, COLLECTIONS } from "@/lib/firebase";
import { dispatchService, calculateETA, type RideRequest as DispatchRide } from "@/lib/dispatch";
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
import { RideChatModal, useUnreadChatCount } from "@/components/ride-chat-modal";
import { useVoiceCall } from "@/hooks/use-voice-call";
import { InCallScreen, IncomingCallModal } from "@/components/in-call-screen";
import { PostRideModal } from "@/components/post-ride-modal";
import { calculateDynamicFare, calculateDistance, RideMetrics } from "@/lib/dynamic-pricing";
import { getDistanceToPickup, getDistanceToDestination, estimateETA, formatDistance, isDriverNearPickup, calculateBearing } from "@/lib/driver-tracking";
import { upsertRide, updateRide, removeRide, countActiveRides } from "@/lib/rider-ride-state";
import { recoverActiveRides } from "@/lib/rider-active-ride-recovery";
import { isExpiredRiderSearch } from "@/lib/rider-search-expiry";
import { expireStaleRiderSearch } from "@/lib/rider-search-expiry-api";
import { buildEmergencyAssistMessage, getCancellationPolicy, getSafetySignal, type RiderRideOptions, type SafetySignal } from "@/lib/rider-parity";
import { trpc } from "@/lib/trpc";
import { type ReceiptEmailStatus } from "@/lib/receipt-email";
import { getFinalRideFare, getQuotedRideFare, roundGhsFare } from "@/lib/fare";
import { createLiveTripShareLink, revokeLiveTripShareLink } from "@/lib/trip-share";
import { payWithHubtelCard } from "@/lib/card-checkout";
import { endRiderLiveActivity, syncRiderLiveActivity } from "@/lib/ride-live-activity";
import { nearbyVehicleFromProfile, type NearbyVehicle, vehicleServesRideCategory } from "@/lib/nearby-driver-presence";

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
  placeId?: string;
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
  driverServiceType?: string;
  driverPlate?: string;
  driverColour?: string;
  driverColourHex?: string;
  driverPhoto?: string;
  driverLocation?: { lat: number; lng: number };
  driverBearing?: number;
  driverLocationUpdatedAt?: string;
  driverTotalTrips?: number;
  driverPhone?: string;
  driverMomoNumber?: string;
  driverMomoNetwork?: string;
  driverId?: string;
  ridePin?: string;
  surgeMultiplier?: number;
  eta?: number;
  etaSeconds?: number;  // live countdown in seconds
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  routePhase?: "pickup" | "destination";
  waitingFee?: number;
  tipAmount?: number;
  quotedFare?: number;
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
  sharingActive?: boolean;
  shareExpiresAt?: string;
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

function formatMomoNumber(value?: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  const localNumber = digits.startsWith('233') ? `0${digits.slice(3)}` : digits;
  return /^0\d{9}$/.test(localNumber)
    ? `${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`
    : String(value || '');
}

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function driverPhotoUri(value: unknown): string | undefined {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const candidates = [
    source.photo_url,
    source.photoUrl,
    source.avatar_url,
    source.avatarUrl,
    source.driver_photo,
    source.driverPhoto,
  ];
  return candidates
    .map((candidate) => String(candidate ?? '').trim())
    .find((candidate) => /^https?:\/\//i.test(candidate));
}

export default function RiderHomeScreen() {
  const { colorScheme } = useThemeContext();
  const colors = useColors();
  const BG = colors.background;
  const SURFACE = colors.surface;
  const CARD = colors.card;
  const BORDER = colors.border;
  const TEXT = colors.foreground;
  const MUTED = colors.muted;
  const isDarkMode = colorScheme !== "light";
  const greetingColor = isDarkMode ? GOLD : "#005C36";
  const greetingSubtitleColor = isDarkMode ? "rgba(212,175,55,0.82)" : "#234E3D";
  const { user, riderProfile, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top > 0 ? insets.top : (Constants.statusBarHeight ?? 44);
  const [userLocation, setUserLocation] = useState<[number, number]>(DEFAULT_LOCATION);
  const [pickupAddress, setPickupAddress] = useState<string>("Getting your location...");
  const [surge, setSurge] = useState({ multiplier: 1, active: false, reason: null as string | null });

  // Time of day never creates a surcharge. Only the administrator-controlled
  // backend setting can enable a temporary, clearly labelled multiplier.
  useEffect(() => {
    let disposed = false;
    const loadSurge = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/trpc/surge.get`);
        const payload = await response.json();
        const data = payload?.result?.data?.json ?? payload?.result?.data;
        const multiplier = Number(data?.multiplier);
        if (!disposed && Number.isFinite(multiplier) && multiplier >= 1) {
          setSurge({ multiplier, active: data?.active === true && multiplier > 1, reason: data?.reason || null });
        }
      } catch {
        // Safe default: no surcharge when the configuration cannot be loaded.
        if (!disposed) setSurge({ multiplier: 1, active: false, reason: null });
      }
    };
    loadSurge();
    const interval = setInterval(loadSurge, 60_000);
    return () => { disposed = true; clearInterval(interval); };
  }, []);

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
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyVehicle[]>([]);
  const [onlineDriverProfiles, setOnlineDriverProfiles] = useState<Record<string, any>[]>([]);

  // Subscribe to Driver profiles while the rider is choosing a ride. Presence
  // is filtered locally because older installed Driver builds wrote
  // availability_status="online" without the newer is_online boolean; a
  // filtered Firestore query would silently omit those live vehicles.
  useEffect(() => {
    return firestoreDB.subscribe(COLLECTIONS.DRIVER_PROFILES, {}, (profiles) => {
      setOnlineDriverProfiles(profiles);
    });
  }, []);

  // Firestore only notifies on document changes. Run the same filter every
  // 30 seconds so a device that loses GPS or is force-closed disappears even
  // when the old profile document is not updated to offline.
  useEffect(() => {
    const refreshNearbyDrivers = () => {
      const unique = new Map<string, NearbyVehicle>();
      onlineDriverProfiles.forEach((profile: any) => {
        const vehicle = nearbyVehicleFromProfile(profile);
        if (vehicle) unique.set(vehicle.id, vehicle);
      });
      setNearbyDrivers([...unique.values()]);
    };
    refreshNearbyDrivers();
    const expiryTimer = setInterval(refreshNearbyDrivers, 30_000);
    return () => clearInterval(expiryTimer);
  }, [onlineDriverProfiles]);

  const [destination, setDestination] = useState<Location | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationSearchMode, setLocationSearchMode] = useState<"pickup" | "destination" | "stop">("destination");
  const [bookingSheetCollapsed, setBookingSheetCollapsed] = useState(false);
  const [activeRideSheetCollapsed, setActiveRideSheetCollapsed] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(RIDE_CATEGORIES[0]);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_METHODS[0]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([
    { name: "Home", address: "Set location" },
    { name: "Work", address: "Set location" },
  ]);
  const [activeRides, setActiveRides] = useState<ActiveRide[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const activeRide = activeRides.find((ride) => ride.id === selectedRideId) ?? activeRides[0] ?? null;
  const [shareActionBusy, setShareActionBusy] = useState(false);
  const unreadChatCount = useUnreadChatCount(activeRide?.firestoreId || activeRide?.id || null, user?.uid || '', 'rider');
  const [bookingLoading, setBookingLoading] = useState(false);
  const nearbyVehiclesForSelectedCategory = nearbyDrivers
    .filter((vehicle) => vehicleServesRideCategory(vehicle, selectedCategory.id))
    .map((vehicle) => ({
      ...vehicle,
      etaMinutes: calculateETA({ lat: vehicle.lat, lng: vehicle.lng }, { lat: userLocation[0], lng: userLocation[1] }),
    }))
    .sort((a, b) => (a.etaMinutes || 99) - (b.etaMinutes || 99));
  const closestVehicleEta = nearbyVehiclesForSelectedCategory[0]?.etaMinutes ?? null;

  // Keep the map open while a request is searching. The expanded trip card is
  // is one tap away, but it should never cover the map when the rider needs
  // to follow the driver or see nearby vehicles.
  useEffect(() => {
    setActiveRideSheetCollapsed(Boolean(activeRide && activeRide.status !== "completed"));
  }, [activeRide?.id, activeRide?.status]);

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

  const handleLiveRouteMetrics = useCallback((metrics: { distanceKm: number; durationMinutes: number; phase: "pickup" | "destination" }) => {
    updateActiveRide((ride) => {
      const expectedPhase = ride.status === 'in_progress' ? 'destination' : 'pickup';
      if (metrics.phase !== expectedPhase) return ride;
      const nextEta = Math.max(1, Math.ceil(metrics.durationMinutes));
      return {
        ...ride,
        routeDistanceKm: Math.max(0, metrics.distanceKm),
        routeDurationMinutes: nextEta,
        routePhase: metrics.phase,
        eta: metrics.phase === 'pickup' ? nextEta : ride.eta,
        etaSeconds: metrics.phase === 'pickup' ? nextEta * 60 : ride.etaSeconds,
      };
    });
  }, [updateActiveRide]);

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

  // The activity starts while the Rider has HY3N open, then ActivityKit/FCM
  // keeps its Lock Screen and Dynamic Island state current after backgrounding.
  // Only a Driver's protected server location meter can change the remote view.
  useEffect(() => {
    if (!user || !activeRide) return;
    const liveRide = {
      id: activeRide.id,
      status: activeRide.status,
      pickup: activeRide.pickup,
      destination: activeRide.destination,
      driverName: activeRide.driverName,
      driverVehicle: activeRide.driverVehicle,
      eta: activeRide.eta,
      etaSeconds: activeRide.etaSeconds,
      routeDurationMinutes: activeRide.routeDurationMinutes,
    };
    if (['completed', 'cancelled'].includes(activeRide.status)) {
      endRiderLiveActivity(user, liveRide).catch((error) => {
        console.warn('[HY3N] Could not end Rider Live Activity:', error);
      });
      return;
    }
    if (['matched', 'driver_arriving', 'driver_arrived', 'in_progress'].includes(activeRide.status)) {
      syncRiderLiveActivity(user, liveRide).catch((error) => {
        console.warn('[HY3N] Could not update Rider Live Activity:', error);
      });
    }
  }, [
    user,
    activeRide?.id,
    activeRide?.status,
    activeRide?.pickup,
    activeRide?.destination?.name,
    activeRide?.driverName,
    activeRide?.driverVehicle,
    activeRide?.eta,
    activeRide?.etaSeconds,
    activeRide?.routeDurationMinutes,
  ]);

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
  const [locationFreshnessTick, setLocationFreshnessTick] = useState(0);

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

  // Card details are never collected in HY3N: selecting Card launches
  // Hubtel's hosted, PCI-managed checkout. MoMo is settled directly with the
  // Driver after the trip, so HY3N does not collect a mobile number or prompt.
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Rehydrate every non-final ride from Firestore after a close, force-close,
  // or app relaunch. The ongoing trip belongs to the signed-in rider on the
  // server, so it must never depend only on the prior screen's memory.
  useEffect(() => {
    if (!user?.uid) {
      setActiveRides([]);
      setSelectedRideId(null);
      return;
    }

    let cancelled = false;
    const restoreActiveRides = async () => {
      try {
        const rides = await firestoreDB.list(COLLECTIONS.RIDES, { rider_id: user.uid });
        const expiredSearches = (rides as Record<string, any>[]).filter(isExpiredRiderSearch);
        // The card is hidden immediately by recovery below, while the trusted
        // API records the terminal status so expired requests disappear from
        // Drivers' offer queues too.
        void Promise.allSettled(expiredSearches.map((ride) => expireStaleRiderSearch(String(ride.id || ''))));
        const recovered = recoverActiveRides(rides as Record<string, any>[]) as ActiveRide[];
        if (cancelled || recovered.length === 0) return;
        setActiveRides((current) => recovered.reduce((next, ride) => upsertRide(next, ride), current));
        setSelectedRideId((current) => current && recovered.some((ride) => ride.id === current) ? current : recovered[0].id);
      } catch (error) {
        // The normal booking screen remains usable if the network is briefly
        // unavailable; the next relaunch or active subscription will retry.
        console.warn('[Rider] Active ride restore failed:', error);
      }
    };

    restoreActiveRides();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Subscribe independently to every active ride so one booking never replaces another.
  const activeRideKeys = activeRides.map((ride) => ride.firestoreId || ride.id).join('|');
  useEffect(() => {
    const subscriptions = activeRides
      .filter((ride) => Boolean(ride.firestoreId))
      .map((trackedRide) => dispatchService.listenToRide(trackedRide.firestoreId!, (ride: DispatchRide) => {
        updateActiveRide((prev) => {
          if (prev.id !== trackedRide.id) return prev;
          const rawRide = ride as any;
          const driver = ride.driver || (
            rawRide.driver_name || rawRide.driver_vehicle || rawRide.driver_vehicle_make || rawRide.driver_plate
              ? {
                  id: rawRide.driver_id,
                  name: rawRide.driver_name || rawRide.driverName,
                  rating: rawRide.driver_rating,
                  total_trips: rawRide.driver_total_trips,
                  vehicle_make: rawRide.driver_vehicle_make || String(rawRide.driver_vehicle || '').split(' ')[0],
                  vehicle_model: rawRide.driver_vehicle_model || String(rawRide.driver_vehicle || '').split(' ').slice(1).join(' '),
                  vehicle_colour: rawRide.driver_colour,
                  vehicle_colour_hex: rawRide.driver_colour_hex,
                  plate: rawRide.driver_plate,
                  phone: rawRide.driver_phone,
                  photo_url: rawRide.driver_photo || rawRide.driver_photo_url || rawRide.driverPhoto,
                  location: rawRide.driver_location || { lat: 0, lng: 0 },
                }
              : null
          );
          const hasDriverLocation = Boolean(
            driver?.location
            && Number.isFinite(Number(driver.location.lat))
            && Number.isFinite(Number(driver.location.lng))
            && (Number(driver.location.lat) !== 0 || Number(driver.location.lng) !== 0),
          );
          const nextDriverLocation = hasDriverLocation
            ? { lat: Number(driver!.location.lat), lng: Number(driver!.location.lng) }
            : prev.driverLocation;
          const driverBearing = nextDriverLocation && prev.driverLocation
            ? calculateBearing(prev.driverLocation.lat, prev.driverLocation.lng, nextDriverLocation.lat, nextDriverLocation.lng)
            : prev.driverBearing;
          const etaTarget = ride.status === 'in_progress'
            ? { lat: prev.destination.lat, lng: prev.destination.lng }
            : { lat: prev.pickupLocation.lat, lng: prev.pickupLocation.lng };
          const etaMin = driver && nextDriverLocation
            ? calculateETA(nextDriverLocation, etaTarget)
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
            driverId: driver?.id ?? (ride as any).driver_id ?? prev.driverId,
            driverRating: driver?.rating ?? prev.driverRating,
            driverVehicle: driver ? `${driver.vehicle_make} ${driver.vehicle_model}` : prev.driverVehicle,
            driverServiceType: (driver as any)?.service_type ?? (driver as any)?.serviceType ?? prev.driverServiceType,
            driverPlate: driver?.plate ?? prev.driverPlate,
            driverColour: driver?.vehicle_colour ?? prev.driverColour,
            driverColourHex: driver?.vehicle_colour_hex ?? prev.driverColourHex,
            driverTotalTrips: driver?.total_trips ?? prev.driverTotalTrips,
            driverPhone: driver?.phone ?? prev.driverPhone,
            driverPhoto: driverPhotoUri(driver) ?? driverPhotoUri(rawRide) ?? prev.driverPhoto,
            driverMomoNumber: (ride as any).payment_method === 'mobile_money' || ride.payment === 'mobile_money'
              ? ((driver as any)?.momo_number ?? (ride as any).driver_momo_number ?? prev.driverMomoNumber)
              : undefined,
            driverMomoNetwork: (ride as any).payment_method === 'mobile_money' || ride.payment === 'mobile_money'
              ? ((driver as any)?.momo_network ?? (ride as any).driver_momo_network ?? prev.driverMomoNetwork)
              : undefined,
            driverLocation: nextDriverLocation,
            driverBearing,
            driverLocationUpdatedAt: String((driver as any)?.location?.recorded_at || (driver as any)?.last_location_update || (ride as any).driver_location_updated_at || prev.driverLocationUpdatedAt || ''),
            safetySignal,
            routeDeviationKm,
            driverStoppedAt,
            eta: etaMin ?? prev.eta,
            etaSeconds: (ride as any).eta_seconds ?? ((etaMin ?? 0) * 60),
            routePhase: ride.status === 'in_progress' ? 'destination' : 'pickup',
            quotedFare: getQuotedRideFare(ride),
            waitingFee: (ride as any).waiting_fee ?? prev.waitingFee,
            matchedAt: prev.matchedAt ?? ((ride.status === 'driver_arriving' || ride.status === 'matched') ? new Date().toISOString() : prev.matchedAt),
            trackingStartedAt: enteredTrip ? Date.now() : prev.trackingStartedAt,
            actualDistanceKm: toFiniteNumber((ride as any).actual_distance_km ?? (ride as any).trip_meter?.distance_km) ?? prev.actualDistanceKm ?? 0,
            // Completion must use the server-stored quote-backed amount, not a
            // local GPS/time estimate retained from the ride screen.
            currentFare: ride.status === 'completed' ? getFinalRideFare(ride) : prev.currentFare,
            finalFare: ride.status === 'completed' ? getFinalRideFare(ride) : prev.finalFare,
            sharingActive: Boolean((ride as any).sharing_active),
            shareExpiresAt: String((ride as any).share_expires_at || '') || undefined,
          };
        });
      }));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [activeRideKeys, selectedRideId, updateActiveRide]);

  // A message becomes delivered once this Rider app receives it, even if the
  // chat sheet is closed. Opening the sheet additionally marks it as read.
  useEffect(() => {
    if (!user?.uid) return;
    const subscriptions = activeRides
      .filter((ride) => Boolean(ride.firestoreId))
      .map((ride) => firestoreDB.subscribe('ride_messages', { ride_id: ride.firestoreId }, (messages: any[]) => {
        messages
          .filter((message) => message.sender_id !== user.uid && message.sender_role === 'driver' && !message.delivered_to_rider)
          .forEach((message) => {
            firestoreDB.update('ride_messages', message.id, { delivered_to_rider: true }).catch(() => {});
          });
      }));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe?.());
  }, [activeRideKeys, user?.uid]);

  // Driver presence is updated by the standalone backend on the driver's
  // profile document. Subscribe to that document as well as the ride itself,
  // so the rider sees movement from acceptance through the live trip.
  useEffect(() => {
    const ride = activeRides.find((item) => item.id === selectedRideId) || activeRides[0];
    const driverId = ride?.driverId;
    if (!driverId || !ride || !['matched', 'driver_arriving', 'driver_arrived', 'in_progress'].includes(ride.status)) return;

    return firestoreDB.subscribeDoc(COLLECTIONS.DRIVER_PROFILES, driverId, (profile: any) => {
      const current = profile?.current_location || profile?.location;
      const lat = Number(current?.latitude ?? current?.lat);
      const lng = Number(current?.longitude ?? current?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const point = { lat, lng };
      updateActiveRide((prev) => {
        if (prev.id !== ride.id) return prev;
        const bearing = Number.isFinite(Number(current?.heading))
          ? Number(current.heading)
          : prev.driverLocation
            ? calculateBearing(prev.driverLocation.lat, prev.driverLocation.lng, lat, lng)
            : prev.driverBearing;
        return {
          ...prev,
          driverLocation: point,
          driverBearing: bearing,
          driverLocationUpdatedAt: String(current?.recorded_at || current?.updated_at || profile?.last_location_update || profile?.last_seen_at || profile?.last_seen || prev.driverLocationUpdatedAt || ''),
        };
      });
      if (ride.id === selectedRideId) setDriverLocation(point);
    });
  }, [activeRides[0]?.id, activeRides[0]?.driverId, activeRides[0]?.status, selectedRideId, updateActiveRide]);

  // Keep the on-screen freshness indicator honest even when a Driver has
  // stopped moving and no new location snapshot is received.
  useEffect(() => {
    if (!activeRide?.driverLocation) return;
    const interval = setInterval(() => setLocationFreshnessTick((tick) => tick + 1), 15_000);
    return () => clearInterval(interval);
  }, [activeRide?.id, Boolean(activeRide?.driverLocation)]);

  // Record rider-side location for safety and trip details while any ride is in
  // progress. Fare is locked when the Rider books and is never recalculated by
  // a mobile client.
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
              const trackingStartedAt = prev.trackingStartedAt ?? Date.now();
              const elapsedMinutes = Math.max(0, (Date.now() - trackingStartedAt) / 60000);
              if (prev.id === selectedRideId) {
                setRideMetrics({ startTime: trackingStartedAt, actualDistanceKm: prev.actualDistanceKm ?? 0, elapsedMinutes, waitingMinutes: 0, surgeMultiplier: prev.surgeMultiplier ?? 1 });
                setCurrentDynamicFare(getQuotedRideFare(prev));
                setTotalDistanceTraveled(prev.actualDistanceKm ?? 0);
              }
              // Rider GPS improves the map/safety experience, but only the
              // Driver's protected server meter can update billable distance.
              return { ...prev, lastRiderLocation: point, trackingStartedAt };
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
  const baseFare = destination ? roundGhsFare(calculateFare(selectedCategory.id, distance, duration)) : 0;
  const discount = appliedPromo ? calculateDiscount(appliedPromo, baseFare) : 0;
  const finalFare = roundGhsFare(Math.max(0, baseFare - discount));
  // This is the only amount offered to the Rider and sent to the backend. It
  // includes any administrator-approved surge before the Rider confirms.
  const bookingFare = destination ? roundGhsFare(finalFare * surge.multiplier) : 0;
  const preTipAmount = selectedTipPercent ? (finalFare * selectedTipPercent) / 100 : (customTip ? parseFloat(customTip) : 0);

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
    ? locationSearchMode === "stop"
      ? placeSuggestions
      : placeSuggestions.length > 0
        ? placeSuggestions
        : POPULAR_DESTINATIONS.filter(
            (p) =>
              p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              p.address.toLowerCase().includes(searchQuery.toLowerCase())
          )
    : POPULAR_DESTINATIONS;

  const openLocationSearch = (mode: "pickup" | "destination" | "stop") => {
    setLocationSearchMode(mode);
    setSearchQuery("");
    setSearchOpen(true);
  };

  const resolvePlaceLocation = async (loc: Location): Promise<Location> => {
    if (!loc.placeId) return loc;
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/places/details?place_id=${encodeURIComponent(loc.placeId)}`);
      const payload = await response.json() as { result?: any };
      const result = payload?.result;
      const latitude = Number(result?.geometry?.location?.lat);
      const longitude = Number(result?.geometry?.location?.lng);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
          name: result?.name || loc.name,
          address: result?.formatted_address || loc.address || loc.name,
          lat: latitude,
          lng: longitude,
        };
      }
    } catch {
      // A typed popular place remains a usable fallback. Google details are
      // only needed for autocomplete items, whose coordinates start blank.
    }
    return loc;
  };

  const handleSelectLocation = async (loc: Location, selectedMode = locationSearchMode) => {
    const resolved = await resolvePlaceLocation(loc);
    if (!Number.isFinite(resolved.lat) || !Number.isFinite(resolved.lng) || (resolved.lat === 0 && resolved.lng === 0)) {
      Alert.alert("Location unavailable", "We could not get coordinates for that place. Please choose another result.");
      return;
    }

    if (selectedMode === "pickup") {
      setUserLocation([resolved.lat, resolved.lng]);
      setPickupAddress(resolved.address || resolved.name || "Selected pickup");
      setSearchOpen(false);
      setSearchQuery("");
      return;
    }

    if (selectedMode === "stop") {
      setStops((previousStops) => {
        if (previousStops.length >= 3) return previousStops;
        const duplicate = previousStops.some((stop) => stop && stop.lat === resolved.lat && stop.lng === resolved.lng);
        return duplicate ? previousStops : [...previousStops, resolved];
      });
      setSearchOpen(false);
      setSearchQuery("");
      return;
    }

    setDestination(resolved);
    setBookingSheetCollapsed(false);
    setSearchOpen(false);
    setSearchQuery("");
    const updated = [resolved, ...searchHistory.filter((h) => h.name !== resolved.name)].slice(0, 5);
    setSearchHistory(updated);
    await AsyncStorage.setItem("searchHistory", JSON.stringify(updated));
  };

  const handleSelectDestination = (loc: Location) => {
    setLocationSearchMode("destination");
    return handleSelectLocation(loc, "destination");
  };

  const handleBook = async (paymentOverride = selectedPayment) => {
    const paymentMethod = paymentOverride;
    if (!destination) {
      openLocationSearch("destination");
      return;
    }

    if (!user) {
      Alert.alert("Sign in required", "Please sign in before requesting a HY3N ride.");
      return;
    }

    const passengerName = bookForSomeone ? recipientName.trim() : (riderProfile?.full_name || user.displayName || 'Rider');
    const passengerPhone = bookForSomeone ? recipientPhone.replace(/\s/g, '') : (riderProfile?.phone || user.phoneNumber || '');
    if (bookForSomeone) {
      const normalizedPassengerPhone = passengerPhone.replace(/\D/g, '');
      const isGhanaPhone = /^0\d{9}$/.test(normalizedPassengerPhone) || /^233\d{9}$/.test(normalizedPassengerPhone);
      if (passengerName.length < 2 || !isGhanaPhone) {
        Alert.alert('Passenger details needed', 'Enter the passenger’s full name and a valid Ghana phone number before requesting the ride.');
        return;
      }
    }

    if (paymentMethod.id === "card") {
      setBookingLoading(true);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Your session has expired. Please sign in again.");

        const payment = await payWithHubtelCard({
          idToken,
          amount: bookingFare,
          purpose: 'ride_quote',
          description: `Ride credit to ${destination.name}`,
        });

        if (payment.status === 'failed') {
          Alert.alert('Card payment not completed', payment.message || 'Your card was not charged. Please try again or choose another payment method.');
          return;
        }
        if (payment.status === 'processing') {
          Alert.alert('Card payment pending', payment.message || 'Hubtel is still confirming your card payment. Do not pay again; check your Wallet shortly.');
          return;
        }

        // The confirmed card amount is held in the HY3N wallet and is then
        // settled against the same locked quote after trip completion. Keeping
        // the internal payment ID as `wallet` makes that debit idempotent;
        // the rider-facing label still says Card via Hubtel.
        const walletPayment = { id: 'wallet', name: 'Card via Hubtel', icon: 'credit-card' as const };
        await handleBook(walletPayment);
      } catch (error: any) {
        Alert.alert('Card checkout unavailable', error?.message || 'We could not start the secure Hubtel card checkout. Please try again.');
      } finally {
        setBookingLoading(false);
      }
      return;
    }

    setBookingLoading(true);
    const surgedFare = bookingFare;
    try {
      if (paymentMethod.id === "wallet") {
        const wallet = await firestoreDB.get(COLLECTIONS.WALLET, user.uid);
        const balance = Number(wallet?.balance ?? 0);
        if (balance < surgedFare) {
          Alert.alert("Insufficient Wallet Balance", `You need GH₵${(surgedFare - balance).toFixed(2)} more to book this ride.`);
          setBookingLoading(false);
          return;
        }
        // The rider client may read a wallet but cannot create payments under
        // the Firestore security rules. The backend settles the wallet safely
        // after a completed ride through wallet.settleRide.
      }

      // Ride writes and driver selection happen on Railway. This uses the
      // signed-in Firebase ID token, avoids client Firestore-rule failures,
      // and writes the assigned `matched` record that the Driver app hears.
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Your session has expired. Please sign in again.");
      // The actual pickup coordinates must always come from the map/location editor.
      // A manual note for someone else is sent separately, so it cannot move the
      // Driver to an address that does not have matching map coordinates.
      const selectedPickupAddress = pickupAddress || 'Current Location';
      const requestBody = {
        riderId: user.uid,
        riderName: passengerName,
        riderPhone: passengerPhone,
        riderEmail: riderProfile?.email || user.email || '',
        bookingForOther: bookForSomeone,
        bookedByName: riderProfile?.full_name || user.displayName || 'Rider',
        bookedByPhone: riderProfile?.phone || user.phoneNumber || '',
        passengerName,
        passengerPhone,
        passengerPickupNote: bookForSomeone ? recipientAddress.trim() || undefined : undefined,
        category: selectedCategory.id,
        pickup: { lat: userLocation[0], lng: userLocation[1], name: selectedPickupAddress, address: selectedPickupAddress },
        destination: { lat: destination.lat, lng: destination.lng, name: destination.name, address: destination.address || destination.name },
        stops: stops.filter(Boolean).map(s => ({ lat: s!.lat, lng: s!.lng, name: s!.name, address: s!.address || s!.name })),
        payment: paymentMethod.id,
        paymentLabel: paymentMethod.name,
        fare: surgedFare,
        baseFare: finalFare,
        surgeMultiplier: surge.multiplier,
        distance,
        duration,
        promoCode: appliedPromo ?? undefined,
        discount: appliedPromo ? Math.round((finalFare - surgedFare) * 100) / 100 : undefined,
      };
      const response = await fetch(`${getApiBaseUrl()}/api/rides/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
        ride?: Record<string, any>;
      } | null;
      if (!response.ok || !result?.success || !result.ride?.id) {
        throw new Error(result?.message || "We could not send your request to drivers.");
      }
      const createdRide = result.ride;
      const matchedDriver = createdRide.driver as Record<string, any> | null;
      const rideStatus: ActiveRide['status'] = createdRide.status === 'matched' ? 'matched' : 'searching';
      const firestoreId = String(createdRide.id);
      const matchedDriverLat = Number(matchedDriver?.location?.lat ?? matchedDriver?.location?.latitude);
      const matchedDriverLng = Number(matchedDriver?.location?.lng ?? matchedDriver?.location?.longitude);
      const matchedDriverLocation = Number.isFinite(matchedDriverLat) && Number.isFinite(matchedDriverLng)
        ? { lat: matchedDriverLat, lng: matchedDriverLng }
        : undefined;
      const matchedDriverEta = matchedDriverLocation
        ? calculateETA(matchedDriverLocation, { lat: userLocation[0], lng: userLocation[1] })
        : undefined;
      addActiveRide({
          id: firestoreId,
          firestoreId,
          category: selectedCategory.name,
          categoryId: selectedCategory.id,
          destination,
          pickup: selectedPickupAddress,
          pickupLocation: { lat: userLocation[0], lng: userLocation[1], name: selectedPickupAddress, address: selectedPickupAddress },
          distance,
          duration,
          fare: getQuotedRideFare(createdRide),
          quotedFare: getQuotedRideFare(createdRide),
          payment: paymentMethod.name,
          paymentId: paymentMethod.id,
          status: rideStatus,
          scheduled: isScheduled ? scheduledFor : null,
          ridePin: String(createdRide.pickup_code || createdRide.ride_pin || ''),
          surgeMultiplier: surge.multiplier,
          driverId: matchedDriver?.id || createdRide.driver_id || undefined,
          driverName: matchedDriver?.name || undefined,
          driverRating: Number.isFinite(Number(matchedDriver?.rating)) ? Number(matchedDriver?.rating) : undefined,
          driverVehicle: matchedDriver ? `${matchedDriver.vehicle_make || ''} ${matchedDriver.vehicle_model || ''}`.trim() : undefined,
          driverServiceType: matchedDriver?.service_type || matchedDriver?.serviceType || selectedCategory.id,
          driverPlate: matchedDriver?.plate || undefined,
          driverColour: matchedDriver?.vehicle_colour || undefined,
          driverColourHex: matchedDriver?.vehicle_colour_hex || undefined,
          driverPhone: matchedDriver?.phone || undefined,
          driverPhoto: driverPhotoUri(matchedDriver),
          driverLocation: matchedDriverLocation,
          eta: matchedDriverEta,
          etaSeconds: matchedDriverEta ? matchedDriverEta * 60 : undefined,
          matchedAt: createdRide.matched_at || undefined,
        });
        if (isScheduled) {
          setShowScheduledToast(true);
          if (scheduledToastTimerRef.current) clearTimeout(scheduledToastTimerRef.current);
          scheduledToastTimerRef.current = setTimeout(() => setShowScheduledToast(false), 3200);
        }
    } catch (error: any) {
      console.error('[Rider] Ride request failed:', error);
      Alert.alert(
        "Request not sent",
        error?.message || "We could not send your ride request to drivers. Check your connection and try again.",
      );
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
    setBookForSomeone(false);
    setRecipientName("");
    setRecipientPhone("");
    setRecipientAddress("");
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
    setBookingSheetCollapsed(false);
    resetBookingState();
  };

  const handleQuickPlace = (place: SavedPlace) => {
    if (!place.lat || !place.lng) { openLocationSearch("destination"); return; }
    handleSelectDestination({ name: place.name, address: place.address, lat: place.lat, lng: place.lng });
  };

  const handleAddStop = () => {
    if (stops.length >= 3) {
      Alert.alert("Limit reached", "You can add up to 3 stops.");
      return;
    }
    openLocationSearch("stop");
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
    try {
      setShareActionBusy(true);
      const shareRideId = activeRide.firestoreId || activeRide.id;
      const { trackingUrl, expiresAt } = await createLiveTripShareLink(shareRideId);
      updateActiveRide(activeRide.id, (ride) => ({ ...ride, sharingActive: true, shareExpiresAt: expiresAt }));
      const expiry = expiresAt ? new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'the end of this trip';
      const msg = `I'm sharing my live HY3N trip with you.\n\nPickup: ${activeRide.pickup}\nDestination: ${activeRide.destination.name}${etaMinutes ? `\nETA: ${etaMinutes} min` : ''}\nDriver: ${activeRide.driverName || 'HY3N driver'}\n\nTrack the trip live: ${trackingUrl}\n\nThis secure link expires at ${expiry} or as soon as the trip ends.`;
      await Share.share({ message: msg, title: 'Track my HY3N trip' });
    } catch (error: any) {
      Alert.alert('Unable to share live trip', error?.message || 'Please try again in a moment.');
    } finally {
      setShareActionBusy(false);
    }
  };

  const handleStopSharingTrip = async () => {
    if (!activeRide) return;
    try {
      setShareActionBusy(true);
      await revokeLiveTripShareLink(activeRide.firestoreId || activeRide.id);
      updateActiveRide(activeRide.id, (ride) => ({ ...ride, sharingActive: false, shareExpiresAt: undefined }));
      Alert.alert('Trip sharing stopped', 'Anyone using the previous live tracking link can no longer view this trip.');
    } catch (error: any) {
      Alert.alert('Unable to stop trip sharing', error?.message || 'Please try again in a moment.');
    } finally {
      setShareActionBusy(false);
    }
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

  const handleFinishRide = async () => {
    // Settle wallet payment: deduct fare from rider, credit driver
    if (activeRide?.status === 'completed' && isWalletPayment(activeRide) && user) {
      try {
        const fare = getFinalRideFare(activeRide);
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
    const pairingDriverName = activeRide.driverName || "Your driver";
    const pairingVehicle = activeRide.driverVehicle || "HY3N vehicle";
    const pairingVehicleIdentity = [activeRide.driverColour, pairingVehicle].filter(Boolean).join(" ");
    const pairingEtaMinutes = activeRide.status !== 'in_progress' && activeRide.routePhase === 'pickup' && activeRide.routeDurationMinutes
      ? activeRide.routeDurationMinutes
      : activeRide.eta ?? (
      activeRide.etaSeconds && activeRide.etaSeconds > 0
        ? Math.max(1, Math.ceil(activeRide.etaSeconds / 60))
        : null
    );
    const straightLinePickupDistanceKm = activeRide.driverLocation
      ? calculateDistance(
          activeRide.driverLocation.lat,
          activeRide.driverLocation.lng,
          activeRide.pickupLocation.lat,
          activeRide.pickupLocation.lng,
        )
      : null;
    const livePickupDistanceKm = activeRide.routePhase === 'pickup' && Number.isFinite(activeRide.routeDistanceKm)
      ? activeRide.routeDistanceKm
      : straightLinePickupDistanceKm;
    const liveTripDistanceKm = activeRide.routePhase === 'destination' && Number.isFinite(activeRide.routeDistanceKm)
      ? activeRide.routeDistanceKm
      : activeRide.actualDistanceKm;
    const dropoffEtaMinutes = activeRide.status === 'in_progress'
      ? Math.max(1, Math.ceil(activeRide.routeDurationMinutes ?? activeRide.duration ?? 1))
      : null;
    const dropoffTimeLabel = dropoffEtaMinutes === null
      ? null
      : new Intl.DateTimeFormat('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Accra' })
        .format(new Date(Date.now() + dropoffEtaMinutes * 60_000));
    const pairingStatus = activeRide.status === "driver_arrived"
      ? `${pairingDriverName} is at your pickup`
      : activeRide.status === "in_progress"
        ? "Your trip is in progress"
        : activeRide.status === "matched"
          ? `${pairingDriverName} has been matched`
          : `${pairingDriverName} is arriving`;

    const liveFare = isCompleted ? getFinalRideFare(activeRide) : getQuotedRideFare(activeRide);
    const isTripShareActive = Boolean(
      activeRide.sharingActive
      && activeRide.shareExpiresAt
      && new Date(activeRide.shareExpiresAt).getTime() > Date.now(),
    );
    const driverLocationTimestamp = activeRide.driverLocationUpdatedAt
      ? new Date(activeRide.driverLocationUpdatedAt).getTime()
      : Number.NaN;
    const driverLocationAgeSeconds = Number.isFinite(driverLocationTimestamp)
      ? Math.max(0, Math.floor((Date.now() - driverLocationTimestamp) / 1000))
      : null;
    // Reference the timer state so the age refreshes while the Driver is still.
    void locationFreshnessTick;
    const locationFreshnessLabel = driverLocationAgeSeconds === null
      ? 'Last known location'
      : driverLocationAgeSeconds <= 45
        ? 'Live location'
        : driverLocationAgeSeconds <= 180
          ? `Updated ${Math.max(1, Math.floor(driverLocationAgeSeconds / 60))} min ago`
          : 'Location may be out of date';
    const locationFreshnessColor = driverLocationAgeSeconds === null || driverLocationAgeSeconds <= 45
      ? GREEN
      : driverLocationAgeSeconds <= 180
        ? GOLD
        : RED;

    // Keep the map useful while a ride is active. The expanded details remain
    // one tap away, but the default minimized state shows only live status.
    if (activeRideSheetCollapsed && !isCompleted) {
      const statusLabel = isSearching
        ? "Searching for a driver"
        : activeRide.status === "in_progress"
          ? `Dropoff at ${dropoffTimeLabel || '—'}`
          : activeRide.status === "driver_arrived"
            ? "Your driver has arrived"
            : `Pickup in ${pairingEtaMinutes ?? '—'} min`;
      return (
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <TouchableOpacity
            onPress={() => setActiveRideSheetCollapsed(false)}
            accessibilityRole="button"
            accessibilityLabel="Open active ride details"
            style={{ alignItems: "center", paddingBottom: 8 }}
          >
            <View style={{ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: TEXT, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 }}>{statusLabel}</Text>
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: "600", marginTop: 3 }} numberOfLines={1}>
                  {activeRide.status === "in_progress"
                    ? `${liveTripDistanceKm && liveTripDistanceKm > 0 ? `${formatDistance(liveTripDistanceKm)} remaining · ` : ''}Heading to ${activeRide.destination.name}`
                    : activeRide.status === "driver_arrived"
                      ? `Meet ${pairingDriverName} at your pickup point`
                      : isSearching
                        ? "Finding the nearest available driver"
                        : livePickupDistanceKm !== null && livePickupDistanceKm !== undefined
                          ? `${livePickupDistanceKm.toFixed(livePickupDistanceKm < 1 ? 1 : 0)} km by road to your pickup`
                          : `Meet at ${activeRide.pickup}`}
                </Text>
              </View>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: isSearching ? `${GOLD}22` : `${GREEN}20`, alignItems: "center", justifyContent: "center" }}>
                {isSearching ? <ActivityIndicator size="small" color={GOLD} /> : <MaterialIcons name={activeRide.status === 'in_progress' ? 'navigation' : 'directions-car'} size={22} color={GREEN} />}
              </View>
            </View>
          </TouchableOpacity>

          {activeRide.status === "driver_arrived" && activeRide.ridePin && (
            <TouchableOpacity
              onPress={async () => {
                try { await Share.share({ message: `My HY3N start code is ${activeRide.ridePin}. Please confirm it before the ride starts.`, title: "HY3N Start Code" }); } catch {}
              }}
              accessibilityLabel="Share ride start code"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${GOLD}16`, borderWidth: 1, borderColor: `${GOLD}66`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: hasDriver ? 10 : 0 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <MaterialIcons name="lock" size={17} color={GOLD} />
                <View>
                  <Text style={{ color: GOLD, fontSize: 12, fontWeight: "900" }}>Start code</Text>
                  <Text style={{ color: MUTED, fontSize: 10, marginTop: 1 }}>Show this to your Driver</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: GOLD, fontWeight: "900", fontSize: 22, letterSpacing: 5 }}>{activeRide.ridePin}</Text>
                <MaterialIcons name="share" size={16} color={GOLD} />
              </View>
            </TouchableOpacity>
          )}

          {hasDriver && (
            <View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12 }}>
              {activeRide.driverPhoto ? (
                <View accessibilityLabel={`Driver photo for ${pairingDriverName}`} style={{ width: 76, height: 76, borderRadius: 20, marginRight: 12, padding: 2, backgroundColor: `${GREEN}22`, borderWidth: 2, borderColor: `${GREEN}AA` }}>
                  <Image source={{ uri: activeRide.driverPhoto }} resizeMode="cover" style={{ width: "100%", height: "100%", borderRadius: 16 }} />
                </View>
              ) : (
                <View accessibilityLabel="Driver photo unavailable" style={{ width: 76, height: 76, borderRadius: 20, marginRight: 12, backgroundColor: `${GREEN}20`, borderWidth: 2, borderColor: `${GREEN}66`, alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="person" size={38} color={GREEN} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: GREEN, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" }}>Verify your Driver</Text>
                <Text style={{ color: TEXT, fontSize: 16, fontWeight: "900", marginTop: 2 }} numberOfLines={1}>{pairingDriverName}</Text>
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>{pairingVehicleIdentity} · {activeRide.driverPlate || 'Plate pending'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: locationFreshnessColor }} />
                  <Text style={{ color: locationFreshnessColor, fontSize: 10, fontWeight: '800' }}>{locationFreshnessLabel}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleCallDriver} accessibilityLabel="Call driver" style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: `${GREEN}20`, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                <MaterialIcons name="phone" size={20} color={GREEN} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowChat(true)} accessibilityLabel="Message driver" style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: `${GOLD}20`, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                <MaterialIcons name="chat" size={19} color={GOLD} />
                {unreadChatCount > 0 && <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#111', fontSize: 9, fontWeight: '900' }}>{unreadChatCount}</Text></View>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }
    return (
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
        {activeRides.length > 1 && (
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: TEXT, fontSize: 14, fontWeight: '800' }}>Your active rides ({countActiveRides(activeRides)})</Text>
              <TouchableOpacity onPress={() => { resetBookingState(); openLocationSearch("destination"); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="add-circle-outline" size={17} color={GOLD} />
                <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700' }}>Book another</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {activeRides.map((ride) => (
                <TouchableOpacity key={ride.id} onPress={() => setSelectedRideId(ride.id)} style={{ backgroundColor: ride.id === activeRide.id ? `${GOLD}22` : CARD, borderColor: ride.id === activeRide.id ? GOLD : BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 118 }}>
                  <Text style={{ color: ride.id === activeRide.id ? GOLD : TEXT, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{ride.category}</Text>
                  <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{ride.destination.name}</Text>
                  <Text style={{ color: GOLD, fontSize: 10, marginTop: 3 }}>GH₵{getFinalRideFare(ride).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {activeRides.length === 1 && (
          <TouchableOpacity onPress={() => { resetBookingState(); openLocationSearch("destination"); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: `${GOLD}14`, borderColor: `${GOLD}44`, borderWidth: 1, borderRadius: 11, paddingVertical: 10, marginBottom: 12 }}>
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
            {/* Compact Uber/Bolt-style pairing card */}
            <View style={{ backgroundColor: CARD, borderWidth: 1, borderColor: `${GREEN}66`, borderRadius: 20, marginBottom: 12, overflow: "hidden" }}>
              <View style={{ backgroundColor: `${GREEN}16`, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: GREEN, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>
                    {activeRide.status === "driver_arrived" ? "Driver arrived" : activeRide.status === "in_progress" ? "On your trip" : "Your driver"}
                  </Text>
                  <Text style={{ color: TEXT, fontSize: 16, fontWeight: "800", marginTop: 3 }} numberOfLines={1}>{pairingStatus}</Text>
                </View>
                {pairingEtaMinutes !== null && activeRide.status !== "driver_arrived" && (
                  <View style={{ minWidth: 52, alignItems: "center" }}>
                    <Text style={{ color: GOLD, fontSize: 25, fontWeight: "900", lineHeight: 28 }}>{pairingEtaMinutes}</Text>
                    <Text style={{ color: MUTED, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>min away</Text>
                  </View>
                )}
              </View>

              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: activeRide.driverColourHex || `${GOLD}24`, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${GOLD}88` }}>
                    <MaterialIcons name="directions-car" size={33} color={activeRide.driverColourHex?.toLowerCase() === "#f5f5f5" ? "#111" : "#fff"} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: TEXT, fontSize: 18, fontWeight: "900" }} numberOfLines={1}>{pairingVehicleIdentity}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                      <MaterialIcons name="star" size={15} color={GOLD} />
                      <Text style={{ color: TEXT, fontSize: 12, fontWeight: "800" }}>{Number(activeRide.driverRating ?? 5).toFixed(1)}</Text>
                      {activeRide.driverTotalTrips ? <Text style={{ color: MUTED, fontSize: 12 }}>· {activeRide.driverTotalTrips} trips</Text> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ color: MUTED, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Plate</Text>
                    <View style={{ backgroundColor: `${GOLD}22`, borderColor: `${GOLD}77`, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
                      <Text style={{ color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }}>{activeRide.driverPlate || "—"}</Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: BORDER }}>
                  {activeRide.driverPhoto ? (
                    <View accessibilityLabel={`Driver photo for ${pairingDriverName}`} style={{ width: 82, height: 82, borderRadius: 22, padding: 2, backgroundColor: `${GREEN}22`, borderWidth: 2, borderColor: `${GREEN}AA` }}>
                      <Image source={{ uri: activeRide.driverPhoto }} resizeMode="cover" style={{ width: "100%", height: "100%", borderRadius: 18 }} />
                    </View>
                  ) : (
                    <View accessibilityLabel="Driver photo unavailable" style={{ width: 82, height: 82, borderRadius: 22, backgroundColor: `${GREEN}28`, borderWidth: 2, borderColor: `${GREEN}66`, alignItems: "center", justifyContent: "center" }}>
                      <MaterialIcons name="person" size={42} color={GREEN} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: GREEN, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" }}>Verify your Driver</Text>
                    <Text style={{ color: TEXT, fontSize: 17, fontWeight: "900", marginTop: 2 }} numberOfLines={1}>{pairingDriverName}</Text>
                    <Text style={{ color: MUTED, fontSize: 11, fontWeight: "600", marginTop: 2 }} numberOfLines={1}>
                      {activeRide.driverPhoto ? 'Match photo, vehicle and plate before pickup' : 'Driver profile photo is not available'}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: locationFreshnessColor }} />
                      <Text style={{ color: locationFreshnessColor, fontSize: 11, fontWeight: "700" }}>{locationFreshnessLabel}</Text>
                    </View>
                  </View>
                  <Text style={{ color: MUTED, fontSize: 11 }}>ETA is live</Text>
                </View>

                <View style={{ backgroundColor: `${GOLD}10`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <MaterialIcons name="local-taxi" size={16} color={GOLD} />
                    <Text style={{ color: TEXT, fontSize: 12, fontWeight: "800", marginLeft: 8, flex: 1 }} numberOfLines={1}>{activeRide.category}</Text>
                    <Text style={{ color: GOLD, fontSize: 13, fontWeight: "900" }}>GH₵{liveFare.toFixed(2)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <MaterialIcons name="place" size={16} color={MUTED} />
                    <Text style={{ color: MUTED, fontSize: 12, marginLeft: 8, flex: 1 }} numberOfLines={1}>To {activeRide.destination.name}</Text>
                  </View>
                </View>

                {activeRide.paymentId === 'mobile_money' && activeRide.driverMomoNumber && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: `${GOLD}10`, borderWidth: 1, borderColor: `${GOLD}44` }}>
                    <MaterialIcons name="phone-android" size={17} color={GOLD} />
                    <Text style={{ color: MUTED, fontSize: 12, fontWeight: '700', marginLeft: 8, flex: 1 }}>MoMo</Text>
                    <Text style={{ color: GOLD, fontSize: 15, fontWeight: '900', letterSpacing: 0.5 }}>{formatMomoNumber(activeRide.driverMomoNumber)}</Text>
                  </View>
                )}

                {activeRide.ridePin && (
                  <TouchableOpacity
                    onPress={async () => {
                      try { await Share.share({ message: `My HY3N pickup code is ${activeRide.ridePin}. Please confirm it before the ride starts.`, title: "HY3N Pickup Code" }); } catch {}
                    }}
                    accessibilityLabel="Share ride pickup code"
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: SURFACE, borderRadius: 12 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <MaterialIcons name="lock" size={15} color={GOLD} />
                      <Text style={{ color: MUTED, fontSize: 12 }}>Start code</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: GOLD, fontWeight: "900", fontSize: 16, letterSpacing: 4 }}>{activeRide.ridePin}</Text>
                      <MaterialIcons name="share" size={15} color={MUTED} />
                    </View>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={handleCallDriver}
                    style={{ flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, backgroundColor: GREEN }}
                  >
                    <MaterialIcons name="phone" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowChat(true)}
                    style={{ flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, backgroundColor: unreadChatCount > 0 ? `${GOLD}38` : `${GOLD}18`, borderWidth: 1, borderColor: unreadChatCount > 0 ? GOLD : `${GOLD}66` }}
                  >
                    <MaterialIcons name="chat" size={18} color={GOLD} />
                    <Text style={{ color: GOLD, fontWeight: "800", fontSize: 14 }}>{unreadChatCount > 0 ? `Message (${unreadChatCount})` : "Message"}</Text>
                  </TouchableOpacity>
                </View>
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

            {/* Waiting Timer — shown when driver is at pickup */}
            {activeRide.status === 'driver_arrived' && (
              <View style={{ backgroundColor: riderWaitSeconds >= riderFreeWaitSecs ? `${GOLD}18` : `${GREEN}18`, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: riderWaitSeconds >= riderFreeWaitSecs ? `${GOLD}88` : `${GREEN}88` }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: riderWaitSeconds >= riderFreeWaitSecs ? `${GOLD}2C` : `${GREEN}2C`, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="access-time" size={18} color={riderWaitSeconds >= riderFreeWaitSecs ? GOLD : GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: riderWaitSeconds >= riderFreeWaitSecs ? GOLD : GREEN, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {riderWaitSeconds < riderFreeWaitSecs ? 'Driver is waiting · complimentary time' : 'Paid waiting time'}
                    </Text>
                    <Text style={{ color: TEXT, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                      {riderWaitSeconds < riderFreeWaitSecs
                        ? `${Math.floor((riderFreeWaitSecs - riderWaitSeconds) / 60)}:${String((riderFreeWaitSecs - riderWaitSeconds) % 60).padStart(2, '0')} free time remaining`
                        : `GH₵${riderCurrentWaitingFee.toFixed(2)} added so far`}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 10 }}>
                  {riderWaitSeconds < riderFreeWaitSecs
                    ? `Paid wait time begins after ${FREE_WAITING_MINUTES} minutes at GH₵${riderWaitingFeePerMin.toFixed(2)} per minute.`
                    : `Your driver arrived ${Math.floor(riderWaitSeconds / 60)}m ${String(riderWaitSeconds % 60).padStart(2, '0')}s ago. The charge stops when the trip starts.`}
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
                  <Text style={{ color: MUTED, fontSize: 11 }}>Metered distance</Text>
                  <Text style={{ color: TEXT, fontSize: 11, fontWeight: '700' }}>{(liveTripDistanceKm ?? 0).toFixed(2)} km</Text>
                </View>
                <Text style={{ color: MUTED, fontSize: 10, marginTop: 5 }}>Updates from the Driver GPS meter; your booking estimate is never charged as travelled distance.</Text>
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
                onPress={isTripShareActive ? handleStopSharingTrip : handleShareTrip}
                disabled={shareActionBusy}
                accessibilityLabel={isTripShareActive ? "Stop sharing live trip" : "Share live trip"}
                accessibilityHint={isTripShareActive ? "Revokes the current secure trip tracking link" : "Creates a secure link for a trusted contact to follow this trip"}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, backgroundColor: isTripShareActive ? `${GREEN}1A` : CARD, borderRadius: 12, borderWidth: 0.5, borderColor: isTripShareActive ? `${GREEN}77` : BORDER, opacity: shareActionBusy ? 0.65 : 1 }}
              >
                {shareActionBusy ? <ActivityIndicator size="small" color={isTripShareActive ? GREEN : MUTED} /> : <MaterialIcons name={isTripShareActive ? "stop-circle" : "share"} size={16} color={isTripShareActive ? GREEN : MUTED} />}
                <Text style={{ color: isTripShareActive ? GREEN : MUTED, fontSize: 13, fontWeight: "600" }}>{isTripShareActive ? 'Stop Sharing' : 'Share Trip'}</Text>
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
              <Text style={{ color: GOLD, fontSize: 13, fontWeight: "600" }}>
                {unreadChatCount > 0 ? `Message Driver · ${unreadChatCount} new` : 'Message Driver'}
              </Text>
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
              <Row label={activeRide.waitingFee && activeRide.waitingFee > 0 ? "Final fare (includes wait)" : "Final fare"} value={`GH₵${liveFare.toFixed(2)}`} />
              {activeRide.waitingFee && activeRide.waitingFee > 0 && (
                <Row label="Waiting Fee" value={`Included · GH₵${activeRide.waitingFee.toFixed(2)}`} valueColor={MUTED} />
              )}
              {tipAmount && tipAmount > 0 && (
                <Row label="Tip" value={`+GH₵${tipAmount.toFixed(2)}`} valueColor={GREEN} />
              )}
              <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                <Row
                  label="Total"
                  value={`GH₵${(liveFare + (tipAmount || 0)).toFixed(2)}`}
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

  const renderCompactSearchingRide = () => {
    if (!activeRide) return null;
    return (
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 6 }}>
        <TouchableOpacity
          onPress={() => setActiveRideSheetCollapsed(false)}
          accessibilityRole="button"
          accessibilityLabel="Expand ride request details"
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 2, paddingBottom: 9 }}
        >
          <ActivityIndicator size="small" color={GOLD} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontSize: 14, fontWeight: "800" }}>Searching for a driver</Text>
            <Text style={{ color: MUTED, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
              {activeRide.destination.name} · {activeRide.distance.toFixed(1)} km · ~{activeRide.duration} min
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: GOLD, fontSize: 15, fontWeight: "900" }}>GH₵{activeRide.fare.toFixed(2)}</Text>
            <Text style={{ color: MUTED, fontSize: 10, marginTop: 1 }}>Tap to expand</Text>
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <TouchableOpacity
            onPress={() => setActiveRideSheetCollapsed(false)}
            style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", paddingVertical: 10 }}
          >
            <Text style={{ color: TEXT, fontSize: 12, fontWeight: "700" }}>View request</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCancelRide}
            style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: `${RED}66`, alignItems: "center", justifyContent: "center", paddingVertical: 10 }}
          >
            <Text style={{ color: RED, fontSize: 12, fontWeight: "700" }}>Cancel request</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRequestAction = () => (
    <TouchableOpacity
      onPress={() => { void handleBook(); }}
      disabled={bookingLoading || (isScheduled && !scheduledFor)}
      accessibilityRole="button"
      accessibilityLabel={isScheduled ? "Schedule trip" : `Request HY3N for ${bookingFare.toFixed(2)} Ghana cedis`}
      style={{
        backgroundColor: GREEN,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        opacity: (isScheduled && !scheduledFor) ? 0.5 : 1,
      }}
    >
      {bookingLoading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <MaterialIcons name={isScheduled ? "event" : "navigation"} size={20} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
            {isScheduled ? "Schedule Trip" : `Request HY3N · GH₵${bookingFare.toFixed(2)}`}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );

  const renderBookingSheet = () => (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      {/* Web-parity booking header and editable route card */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingHorizontal: 2 }}>
        <Text style={{ color: TEXT, fontWeight: "800", fontSize: 22 }}>Choose your ride</Text>
        <TouchableOpacity
          onPress={handleCancelBooking}
          accessibilityRole="button"
          accessibilityLabel="Close ride selection"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialIcons name="close" size={26} color={MUTED} />
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: "row", gap: 12 }}>
        <View style={{ alignItems: "center", width: 20, paddingTop: 11 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: GREEN }} />
          <View style={{ width: 2, height: 36, backgroundColor: BORDER, marginVertical: 4 }} />
          <MaterialIcons name="location-on" size={21} color={GOLD} />
        </View>
        <View style={{ flex: 1, gap: 14 }}>
          <TouchableOpacity
            onPress={() => openLocationSearch("pickup")}
            accessibilityRole="button"
            accessibilityLabel="Change pickup location"
            style={{ flex: 1 }}
          >
            <Text style={{ color: MUTED, fontSize: 12, marginBottom: 3 }}>Pickup</Text>
            <Text style={{ color: TEXT, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{pickupAddress || "Current Location"}</Text>
            <Text style={{ color: GOLD, fontSize: 12, marginTop: 3 }}>Tap to change pickup</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => openLocationSearch("destination")}
              accessibilityRole="button"
              accessibilityLabel="Change destination"
              style={{ flex: 1 }}
            >
              <Text style={{ color: MUTED, fontSize: 12, marginBottom: 3 }}>Destination</Text>
              <Text style={{ color: TEXT, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{destination?.name || "Selected destination"}</Text>
              <Text style={{ color: GOLD, fontSize: 12, marginTop: 3 }}>Tap to change destination</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddStop}
              accessibilityRole="button"
              accessibilityLabel="Add a stop"
              accessibilityHint="Opens address search for an additional stop"
              style={{ minWidth: 70, minHeight: 54, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 12, backgroundColor: `${GOLD}16`, borderWidth: 1, borderColor: `${GOLD}55` }}
            >
              <MaterialIcons name="add-location-alt" size={19} color={GOLD} />
              <Text style={{ color: GOLD, fontSize: 11, fontWeight: "800", marginTop: 3 }}>Add stop</Text>
            </TouchableOpacity>
          </View>
          {stops.map((stop, idx) => (
            <View key={`${stop?.name}-${idx}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: `${GOLD}0D`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: `${GOLD}33` }}>
              <MaterialIcons name="more-horiz" size={17} color={GOLD} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: MUTED, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Stop {idx + 1}</Text>
                <Text style={{ color: TEXT, fontSize: 13, fontWeight: "700", marginTop: 1 }} numberOfLines={1}>{stop?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setStops((prev) => prev.filter((_, i) => i !== idx))} accessibilityLabel={`Remove stop ${idx + 1}`} style={{ padding: 4 }}>
                <MaterialIcons name="close" size={18} color={RED} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <View style={{ minWidth: 66, alignItems: "flex-end", justifyContent: "center" }}>
          <Text style={{ color: TEXT, fontSize: 16, fontWeight: "800" }}>{distance.toFixed(1)} km</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>~{duration} min trip</Text>
        </View>
      </View>

      {/* Ride options use a clear vertical list, like Bolt and Uber, so every
          category can be read and chosen rather than being clipped sideways. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>Ride options · {RIDE_CATEGORIES.length} available types</Text>
        {closestVehicleEta !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="directions-car" size={13} color={GREEN} />
            <Text style={{ color: GREEN, fontSize: 11, fontWeight: "800" }}>
              {nearbyVehiclesForSelectedCategory.length} nearby · {closestVehicleEta} min pickup
            </Text>
          </View>
        ) : (
          <Text style={{ color: MUTED, fontSize: 11, fontWeight: "600" }}>Searching nearby drivers</Text>
        )}
      </View>
      <View style={{ gap: 9, paddingBottom: 14 }}>
        {RIDE_CATEGORIES.map((cat) => {
          const fare = roundGhsFare(calculateFare(cat.id, distance, duration) * surge.multiplier);
          const isSelected = selectedCategory.id === cat.id;
          const matchingVehicles = nearbyDrivers
            .filter((vehicle) => vehicleServesRideCategory(vehicle, cat.id))
            .map((vehicle) => calculateETA({ lat: vehicle.lat, lng: vehicle.lng }, { lat: userLocation[0], lng: userLocation[1] }));
          const pickupEta = matchingVehicles.length ? Math.min(...matchingVehicles) : null;
          const driverLabel = `${matchingVehicles.length} ${cat.name} driver${matchingVehicles.length === 1 ? '' : 's'}`;
          const vehicleArtwork = cat.id === "okada"
            ? require("@/assets/images/ride-list-map-okada.png")
            : cat.id === "express_delivery"
              ? require("@/assets/images/ride-list-map-delivery.png")
              : require("@/assets/images/ride-list-map-car.png");
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setSelectedCategory(cat)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 82, padding: 13, borderRadius: 16, backgroundColor: isSelected ? `${GOLD}1A` : "transparent", borderWidth: isSelected ? 1.8 : 0, borderColor: GOLD }}
            >
              <View style={{ width: 74, height: 52, alignItems: "center", justifyContent: "center" }}>
                <Image source={vehicleArtwork} style={{ width: 74, height: 52 }} resizeMode="contain" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Text style={{ color: TEXT, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>{cat.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <MaterialIcons name="person" size={13} color={MUTED} />
                    <Text style={{ color: MUTED, fontSize: 11, fontWeight: "700" }}>{cat.seats || "Parcel"}</Text>
                  </View>
                </View>
                <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{cat.description}</Text>
                <Text style={{ color: pickupEta !== null ? GREEN : MUTED, fontSize: 11, fontWeight: "800", marginTop: 5 }}>
                  {pickupEta !== null ? `${driverLabel} nearby · ${pickupEta} min pickup` : `No ${cat.name} drivers nearby`}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 7 }}>
                <Text style={{ color: isSelected ? GOLD : TEXT, fontSize: 18, fontWeight: "900" }}>GH₵{fare.toFixed(2)}</Text>
                {isSelected ? <MaterialIcons name="check-circle" size={20} color={GOLD} /> : <MaterialIcons name="chevron-right" size={22} color={MUTED} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Web-parity passenger switch */}
      <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, marginBottom: 14, overflow: "hidden" }}>
        <TouchableOpacity
          onPress={() => setBookForSomeone(!bookForSomeone)}
          accessibilityRole="button"
          accessibilityState={{ expanded: bookForSomeone }}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 15 }}
        >
          <MaterialIcons name="person-outline" size={25} color={GOLD} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontSize: 16, fontWeight: "700" }}>Book for someone else</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>Booking for {bookForSomeone ? "another person" : "yourself"}</Text>
          </View>
          <MaterialIcons name={bookForSomeone ? "keyboard-arrow-up" : "chevron-right"} size={24} color={MUTED} />
        </TouchableOpacity>
        {bookForSomeone && (
          <View style={{ borderTopWidth: 1, borderTopColor: BORDER, padding: 12, gap: 10 }}>
            <TextInput
              value={recipientName}
              onChangeText={setRecipientName}
              placeholder="Passenger name"
              placeholderTextColor={MUTED}
              style={{ backgroundColor: BG, borderRadius: 10, padding: 11, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER }}
            />
            <TextInput
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              placeholder="Phone number (e.g., 0501234567)"
              placeholderTextColor={MUTED}
              keyboardType="phone-pad"
              style={{ backgroundColor: BG, borderRadius: 10, padding: 11, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER }}
            />
            <TextInput
              value={recipientAddress}
              onChangeText={setRecipientAddress}
              placeholder="Pickup note for the Driver (optional)"
              placeholderTextColor={MUTED}
              multiline
              numberOfLines={2}
              style={{ backgroundColor: BG, borderRadius: 10, padding: 11, color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORDER }}
            />
            <Text style={{ color: MUTED, fontSize: 11, lineHeight: 15 }}>To change the pickup pin, use “Tap to change pickup” above. This note is only shared with the Driver.</Text>
          </View>
        )}
      </View>

      {/* Surge banner — Uber/Bolt style: plain language, no multiplier */}
      {surge.active && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#F59E0B18", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#F59E0B40" }}>
          <MaterialIcons name="bolt" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#F59E0B", fontWeight: "700", fontSize: 13, marginBottom: 4 }}>High Demand</Text>
            <Text style={{ color: "#F59E0B", fontSize: 12, lineHeight: 17, opacity: 0.85 }}>{surge.reason || "Temporary high-demand pricing is active."}</Text>
          </View>
        </View>
      )}
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
      {selectedPayment.id === 'card' && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: -4, marginBottom: 12, padding: 10, borderRadius: 10, backgroundColor: `${GREEN}18`, borderWidth: 1, borderColor: `${GREEN}55` }}>
          <MaterialIcons name="lock" size={16} color={GREEN} />
          <Text style={{ flex: 1, color: MUTED, fontSize: 12, lineHeight: 17 }}>
            You will complete this payment securely on Hubtel. HY3N never sees or stores your card number, expiry, or CVV.
          </Text>
        </View>
      )}
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
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 4, backgroundColor: SURFACE }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 11 }}>
          <View>
            <Text style={{ color: MUTED, fontSize: 11, fontWeight: "800", letterSpacing: 0.9 }}>ESTIMATED FARE</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>{distance.toFixed(1)} km · ~{duration} min</Text>
          </View>
            <Text style={{ color: GOLD, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>GH₵{bookingFare.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { void handleBook(); }}
          disabled={bookingLoading || (isScheduled && !scheduledFor)}
          accessibilityRole="button"
          accessibilityLabel={isScheduled ? "Schedule trip" : "Request HY3N"}
          style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: (isScheduled && !scheduledFor) ? 0.5 : 1 }}
        >
          {bookingLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialIcons name={isScheduled ? "event" : "navigation"} size={21} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>{isScheduled ? "Schedule Trip" : "Request HY3N"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDefaultSheet = () => (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.28 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
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
      {/* Destination search */}
      <TouchableOpacity
        onPress={() => openLocationSearch("destination")}
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
            onPress={() => openLocationSearch("destination")}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: `${CARD}80`, borderRadius: 12, borderWidth: 1, borderColor: BORDER }}
          >
            <MaterialIcons name="add" size={16} color={MUTED} />
            <Text style={{ color: MUTED, fontSize: 13, fontWeight: "500" }}>Add</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

    </ScrollView>
    <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, backgroundColor: SURFACE }}>
      <TouchableOpacity
        onPress={() => openLocationSearch("destination")}
        accessibilityRole="button"
        accessibilityLabel="Choose a destination to request HY3N"
        style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
      >
        <MaterialIcons name="navigation" size={20} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Request HY3N</Text>
      </TouchableOpacity>
      <Text style={{ color: MUTED, fontSize: 11, textAlign: "center", marginTop: 6 }}>Choose your destination to continue</Text>
    </View>
    </View>
  );

  const bookingSheetPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Boolean((destination && !activeRide) || (activeRide && activeRide.status !== "completed")) && Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      if (activeRide && activeRide.status !== "completed") {
        if (gesture.dy > 12) setActiveRideSheetCollapsed(true);
        if (gesture.dy < -12) setActiveRideSheetCollapsed(false);
        return;
      }
      if (!destination || activeRide) return;
      if (gesture.dy > 12) setBookingSheetCollapsed(true);
      if (gesture.dy < -12) setBookingSheetCollapsed(false);
    },
    onPanResponderTerminationRequest: () => true,
  });

  const sheetHeight = activeRide
    ? (activeRide.status === "completed"
      ? SCREEN_HEIGHT * 0.75
      : activeRideSheetCollapsed
        ? (['matched', 'driver_arriving', 'driver_arrived', 'in_progress'].includes(activeRide.status) ? SCREEN_HEIGHT * 0.31 : SCREEN_HEIGHT * 0.18)
        : activeRide.status === "searching"
          ? SCREEN_HEIGHT * 0.42
          : SCREEN_HEIGHT * 0.58)
    : destination
    ? (bookingSheetCollapsed ? SCREEN_HEIGHT * 0.18 : SCREEN_HEIGHT * 0.54)
    : SCREEN_HEIGHT * 0.38;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Real map using Leaflet + OpenStreetMap dark tiles — works on Expo Go, web, and production */}
      <LeafletMap
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        colorScheme={colorScheme}
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
        driverColourHex={activeRide?.driverColourHex ?? null}
        driverVehicle={activeRide?.driverVehicle ?? null}
        driverServiceType={activeRide?.driverServiceType ?? activeRide?.categoryId ?? null}
        driverEtaMinutes={activeRide?.routePhase === 'pickup' ? (activeRide.routeDurationMinutes ?? activeRide.eta ?? null) : null}
        driverDistanceKm={activeRide?.routeDistanceKm ?? null}
        driverTracking={Boolean(activeRide && ['matched', 'driver_arriving', 'driver_arrived', 'in_progress'].includes(activeRide.status) && activeRide.driverLocation)}
        driverTrackingTarget={activeRide
          ? (activeRide.status === 'in_progress'
            ? [activeRide.destination.lat, activeRide.destination.lng] as [number, number]
            : [activeRide.pickupLocation.lat, activeRide.pickupLocation.lng] as [number, number])
            : null}
        tripStatus={activeRide?.status ?? null}
        safetySignal={activeRide?.safetySignal ?? "clear"}
        nearbyDrivers={(!activeRide || activeRide.status === "searching")
          ? nearbyVehiclesForSelectedCategory.slice(0, 8)
          : []}
        onRouteMetrics={handleLiveRouteMetrics}
      />

      {/* Header */}
      <View style={{ position: "absolute", top: safeTop + 4, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
        <View style={{ flexDirection: "column" }}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={{ width: 80, height: 40, resizeMode: 'contain' }}
          />
          <Text style={{ color: greetingColor, fontSize: 20, fontWeight: '800', letterSpacing: 0.3, marginTop: 3, textShadowColor: isDarkMode ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
            Akwaaba{riderProfile?.full_name ? `, ${riderProfile.full_name.split(' ')[0]}` : ''}! 👋
          </Text>
          <Text style={{ color: greetingSubtitleColor, fontSize: 13, fontWeight: '600', fontStyle: 'italic', marginTop: 1 }}>
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
        // A fixed height gives the booking ScrollView a real viewport. The
        // request action therefore stays visible below the scrolling options
        // instead of being pushed off-screen after a destination is selected.
        height: sheetHeight,
        overflow: "hidden",
        borderTopWidth: 1,
        borderTopColor: BORDER,
        zIndex: 10,
      }}>
        {/* Drag handle */}
        <TouchableOpacity
          {...bookingSheetPanResponder.panHandlers}
          onPress={() => {
            if (activeRide && activeRide.status !== "completed") setActiveRideSheetCollapsed((collapsed) => !collapsed);
            if (destination && !activeRide) setBookingSheetCollapsed((collapsed) => !collapsed);
          }}
          activeOpacity={0.75}
          style={{ alignItems: "center", paddingTop: 8, paddingBottom: 7 }}
          accessibilityRole="button"
          accessibilityLabel="Booking sheet"
          accessibilityHint="Tap, swipe down to minimize, or swipe up to expand booking options"
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER }} />
          {((destination && !activeRide) || (activeRide && activeRide.status !== "completed")) && (
            <Text style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>
              {activeRide
                ? (activeRideSheetCollapsed ? "Tap or swipe up for ride details" : "Tap or swipe down to keep the map open")
                : (bookingSheetCollapsed ? "Tap or swipe up to expand" : "Tap or swipe down to minimize")}
            </Text>
          )}
        </TouchableOpacity>
        {activeRide ? (
          renderActiveRide()
        ) : destination ? (
          bookingSheetCollapsed ? (
            <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 4 }}>
              <TouchableOpacity
                onPress={() => setBookingSheetCollapsed(false)}
                accessibilityRole="button"
                accessibilityLabel="Continue booking"
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${GOLD}26`, alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name="directions-car" size={18} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>{destination.name}</Text>
                  <Text style={{ color: MUTED, fontSize: 11 }}>Swipe up or tap to choose ride and payment</Text>
                </View>
                <MaterialIcons name="keyboard-arrow-up" size={24} color={GOLD} />
              </TouchableOpacity>
              <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 }}>
                {renderRequestAction()}
              </View>
            </View>
          ) : renderBookingSheet()
        ) : renderDefaultSheet()}
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
              placeholder={locationSearchMode === "pickup"
                ? "Choose pickup location"
                : locationSearchMode === "stop"
                  ? "Enter a stop address"
                  : "Where are you going?"}
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
            data={searchQuery
              ? filteredDestinations
              : locationSearchMode === "stop"
                ? []
                : [...(searchHistory.length > 0 ? searchHistory : []), ...POPULAR_DESTINATIONS.slice(0, 8)]}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            ListHeaderComponent={
              <>
                {locationSearchMode === "stop" && !searchQuery && (
                  <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
                    <Text style={{ color: TEXT, fontSize: 16, fontWeight: "700" }}>Add a stop</Text>
                    <Text style={{ color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 5 }}>Type the address, landmark, or place name for this stop, then choose the matching result.</Text>
                  </View>
                )}
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
                {!searchQuery && locationSearchMode !== "stop" && (
                  <View style={{ paddingHorizontal: 16, paddingTop: searchHistory.length > 0 ? 4 : 16, paddingBottom: 8 }}>
                    <Text style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>Popular</Text>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelectLocation(item)}
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
            ListEmptyComponent={
              locationSearchMode === "stop" && !searchQuery ? (
                <View style={{ paddingHorizontal: 16, paddingVertical: 28, alignItems: "center" }}>
                  <MaterialIcons name="edit-location-alt" size={28} color={GOLD} />
                  <Text style={{ color: MUTED, fontSize: 13, textAlign: "center", marginTop: 10 }}>No preset places are selected for you.</Text>
                </View>
              ) : searchQuery && !suggestionsLoading ? (
                <View style={{ paddingHorizontal: 24, paddingVertical: 28, alignItems: "center" }}>
                  <Text style={{ color: MUTED, fontSize: 13, textAlign: "center" }}>No matching address found. Try adding the area, city, or a nearby landmark.</Text>
                </View>
              ) : null
            }
          />
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
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22 }}>GH₵{activeRide ? (getFinalRideFare(activeRide) + (tipAmount || 0)).toFixed(2) : "0.00"}</Text>
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
              <Row label={activeRide?.waitingFee ? "Final fare (includes wait)" : "Final fare"} value={`GH₵${activeRide ? getFinalRideFare(activeRide).toFixed(2) : "0.00"}`} />
              {activeRide?.waitingFee && activeRide.waitingFee > 0 && (
                <Row label="Waiting Fee" value={`Included · GH₵${activeRide.waitingFee.toFixed(2)}`} valueColor={MUTED} />
              )}
              {tipAmount && tipAmount > 0 && (
                <Row label="Tip" value={`+GH₵${tipAmount.toFixed(2)}`} valueColor={GREEN} />
              )}
              <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                <Row label="Total" value={`GH₵${activeRide ? (getFinalRideFare(activeRide) + (tipAmount || 0)).toFixed(2) : "0.00"}`} valueColor={GOLD} bold />
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
                const receiptText = `HY3N Trip Receipt\nDate: ${new Date().toLocaleDateString('en-GH')}\nDestination: ${activeRide?.destination.name}\nFare: GH₵${activeRide ? getFinalRideFare(activeRide).toFixed(2) : '0.00'}\nTotal: GH₵${activeRide ? (getFinalRideFare(activeRide) + (tipAmount || 0)).toFixed(2) : '0.00'}\nDriver: ${activeRide?.driverName || 'N/A'}\n\nThank you for riding with HY3N!`;
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
          rideId={activeRide.firestoreId || activeRide.id}
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
                  <Text style={{ color: RED, fontSize: 13, fontWeight: '700' }}>Cancellation fee · GH₵{policy.fee.toFixed(2)}</Text>
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
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {activeRide && !getCancellationPolicy(activeRide.status, activeRide.matchedAt).isFree
                    ? `Cancel · GH₵${getCancellationPolicy(activeRide.status, activeRide.matchedAt).fee.toFixed(2)}`
                    : 'Cancel Ride'}
                </Text>
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
