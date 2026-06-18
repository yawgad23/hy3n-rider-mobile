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
  distance: number;
  duration: number;
  fare: number;
  payment: string;
  paymentId: string;
  status: "searching" | "matched" | "driver_arriving" | "driver_arrived" | "in_progress" | "completed" | "cancelled";
  scheduled?: string | null;
  splitData?: { totalPeople: number; perPersonFare: number } | null;
  driverName?: string;
  driverRating?: number;
  driverVehicle?: string;
  driverPlate?: string;
  driverColour?: string;
  driverColourHex?: string;
  driverPhoto?: string;
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
  rideOptions?: { ac: boolean; pet_friendly: boolean; extra_luggage: boolean; wheelchair_accessible: boolean };
  matchedAt?: string;  // ISO timestamp when driver was matched — used for 2-min free cancel window
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
  const [nearbyDrivers, setNearbyDrivers] = useState<Array<{ id: string; current_lat?: number; current_lng?: number }>>([]);

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
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<Location[]>([]);

  // Schedule
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Split Fare
  const [splitData, setSplitData] = useState<{ totalPeople: number; perPersonFare: number } | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitCount, setSplitCount] = useState("2");

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

  // Multi-stop
  const [stops, setStops] = useState<Array<Location | null>>([]);
  // Trip Receipt
  const [showReceipt, setShowReceipt] = useState(false);
  // Cancel with reason
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Ride options (AC, pet, luggage)
  const [rideOptions, setRideOptions] = useState({ ac: false, pet_friendly: false, extra_luggage: false, wheelchair_accessible: false });
  const [showRideOptions, setShowRideOptions] = useState(false);
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
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; text: string; fromRider: boolean; time: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const QUICK_MESSAGES = [
    "I'm at the gate",
    "Almost there, 1 min",
    "Please wait for me",
    "I'm wearing a red shirt",
    "Can you call me?",
    "I'm outside now",
  ];

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

  // Real Firestore ride listener — subscribes to live ride updates when a Firestore ride ID is set
  const firestoreUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!activeRide?.firestoreId) return;
    // Unsubscribe from any previous listener
    if (firestoreUnsubRef.current) firestoreUnsubRef.current();
    const unsub = dispatchService.listenToRide(activeRide.firestoreId, (ride: DispatchRide) => {
      setActiveRide(prev => {
        if (!prev) return null;
        const driver = ride.driver;
        const etaMin = driver
          ? calculateETA({ lat: driver.location.lat, lng: driver.location.lng }, { lat: prev.destination.lat, lng: prev.destination.lng })
          : prev.eta;
        // Fire notifications on status transitions
        if (ride.status !== prev.status) {
          if (ride.status === 'matched' && driver) notifyDriverFound(driver.name, etaMin ?? 5);
          if (ride.status === 'driver_arriving' && driver) notifyDriverArriving(driver.name);
          if (ride.status === 'in_progress') notifyTripStarted(prev.destination.name);
          if (ride.status === 'completed') notifyTripCompleted(prev.fare);
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
          eta: etaMin ?? prev.eta,
          // Prefer live eta_seconds written by driver GPS; fall back to calculated
          etaSeconds: (ride as any).eta_seconds ?? ((etaMin ?? 0) * 60),
          waitingFee: (ride as any).waiting_fee ?? prev.waitingFee,
          // Record when driver was first matched so we can enforce 2-min free cancel window
          matchedAt: prev.matchedAt ?? ((ride.status === 'driver_arriving' || ride.status === 'matched') && !prev.matchedAt ? new Date().toISOString() : prev.matchedAt),
          finalFare: ride.status === 'completed' ? prev.fare : prev.finalFare,
        };
      });
    });
    firestoreUnsubRef.current = unsub;
    return () => unsub();
  }, [activeRide?.firestoreId]);

  // ETA countdown timer — ticks every second when driver is assigned
  useEffect(() => {
    if (!activeRide || !['matched', 'driver_arriving'].includes(activeRide.status)) return;
    const interval = setInterval(() => {
      setActiveRide(prev => {
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
  const perPersonFare = splitData ? finalFare / splitData.totalPeople : finalFare;

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
    setBookingLoading(true);
    const pin = generateRidePin();
    const surgedFare = Math.round(perPersonFare * SURGE * 100) / 100;
    try {
      // Create real Firestore ride request
      let firestoreId: string | undefined;
      if (user) {
        try {
          firestoreId = await dispatchService.createRide({
            riderId: user.uid,
            riderName: riderProfile?.full_name || user.displayName || 'Rider',
            riderPhone: riderProfile?.phone || user.phoneNumber || '',
            riderEmail: riderProfile?.email || user.email || '',
            category: selectedCategory.id,
            pickup: { lat: userLocation[0], lng: userLocation[1], name: 'Current Location', address: 'Current Location' },
            destination: { lat: destination.lat, lng: destination.lng, name: destination.name, address: destination.address || destination.name },
            stops: stops.filter(Boolean).map(s => ({ lat: s!.lat, lng: s!.lng, name: s!.name, address: s!.address || s!.name })),
            payment: selectedPayment.id,
            fare: surgedFare,
            baseFare: perPersonFare,
            surgeMultiplier: SURGE,
            distance,
            duration,
            promoCode: appliedPromo ?? undefined,
            discount: appliedPromo ? Math.round((perPersonFare - surgedFare) * 100) / 100 : undefined,
          });
        } catch (err) {
          console.error('Firestore ride creation failed, continuing with local state:', err);
        }
      }
              setActiveRide({
          id: firestoreId ?? `ride_${Date.now()}`,
          firestoreId,
          category: selectedCategory.name,
          categoryId: selectedCategory.id,
          destination,
          pickup: 'Current Location',
          distance,
          duration,
          fare: surgedFare,
          payment: selectedPayment.name,
          paymentId: selectedPayment.id,
          status: 'searching',
          scheduled: isScheduled ? scheduledFor : null,
          splitData,
          ridePin: pin,
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
  const handleCancelRide = () => {
    if (activeRide?.status === "in_progress") {
      Alert.alert("Cannot Cancel", "You cannot cancel a ride that is already in progress.");
      return;
    }
    setCancelReason("");
    setShowCancelModal(true);
  };
  const FREE_CANCEL_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
  const CANCEL_FEE = 2; // GH₵2
  const confirmCancelRide = async () => {
    if (activeRide?.firestoreId) {
      try {
        // Check if outside the 2-min free cancellation window
        const hasDriver = activeRide.matchedAt && ['driver_arriving', 'matched'].includes(activeRide.status);
        const elapsedMs = hasDriver ? Date.now() - new Date(activeRide.matchedAt!).getTime() : 0;
        const applyFee = hasDriver && elapsedMs > FREE_CANCEL_WINDOW_MS;
        await dispatchService.cancelRide(
          activeRide.firestoreId,
          cancelReason || 'Cancelled by rider',
          applyFee ? CANCEL_FEE : 0
        );
        if (applyFee) {
          Alert.alert(
            'Cancellation Fee Applied',
            `A GH₵${CANCEL_FEE}.00 cancellation fee has been charged because you cancelled more than 2 minutes after your driver was matched.`,
            [{ text: 'OK' }]
          );
        }
      } catch (e) { /* silent */ }
    }
    setShowCancelModal(false);
    setActiveRide(null);
    setDestination(null);
    setSplitData(null);
    setAppliedPromo(null);
    setIsScheduled(false);
    setScheduledFor(null);
    setCancelReason("");
  };

  const handleCancelBooking = () => {
    setDestination(null);
    setSelectedCategory(RIDE_CATEGORIES[0]);
    setAppliedPromo(null);
    setSplitData(null);
    setIsScheduled(false);
    setScheduledFor(null);
  };

  const handleQuickPlace = (place: SavedPlace) => {
    if (!place.lat || !place.lng) { setSearchOpen(true); return; }
    handleSelectDestination({ name: place.name, address: place.address, lat: place.lat, lng: place.lng });
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

  const handleSplitConfirm = () => {
    const count = parseInt(splitCount);
    if (isNaN(count) || count < 2 || count > 6) {
      Alert.alert("Invalid", "Please enter a number between 2 and 6");
      return;
    }
    setSplitData({ totalPeople: count, perPersonFare: parseFloat((finalFare / count).toFixed(2)) });
    setShowSplitModal(false);
  };

  const handleScheduleConfirm = () => {
    if (!scheduleDate || !scheduleTime) {
      Alert.alert("Required", "Please enter both date and time");
      return;
    }
    setScheduledFor(`${scheduleDate} at ${scheduleTime}`);
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

  const handleFinishRide = async () => {
    // Settle wallet payment: deduct fare from rider, credit driver
    if (activeRide?.status === 'completed' && activeRide.payment === 'wallet' && user) {
      try {
        const fare = activeRide.fare + (activeRide.waitingFee || 0);
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
    setActiveRide(null);
    setDestination(null);
    setSplitData(null);
    setAppliedPromo(null);
    setIsScheduled(false);
    setScheduledFor(null);
  };

  const renderActiveRide = () => {
    if (!activeRide) return null;
    const isCompleted = activeRide.status === "completed";
    const isSearching = activeRide.status === "searching";
    const hasDriver = ["matched", "driver_arriving", "driver_arrived", "in_progress"].includes(activeRide.status);

    return (
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
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
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: `#0A0A0A`, borderTopWidth: 0.5, borderTopColor: BORDER }}>
                  <MaterialIcons name="lock" size={14} color={GOLD} />
                  <Text style={{ color: MUTED, fontSize: 12 }}>Ride PIN:</Text>
                  <Text style={{ color: GOLD, fontWeight: "800", fontSize: 16, letterSpacing: 4 }}>{activeRide.ridePin}</Text>
                  <Text style={{ color: MUTED, fontSize: 11 }}>— share with driver</Text>
                </View>
              )}
              {/* Surge badge if applicable */}
              {activeRide.surgeMultiplier && activeRide.surgeMultiplier > 1 && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, backgroundColor: "#F59E0B18", borderTopWidth: 0.5, borderTopColor: "#F59E0B40" }}>
                  <MaterialIcons name="bolt" size={14} color="#F59E0B" />
                  <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "600" }}>Fare includes high-demand pricing</Text>
                </View>
              )}
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
                <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 16 }}>GH₵{activeRide.fare.toFixed(2)}</Text>
                {activeRide.splitData && (
                  <Text style={{ color: GREEN, fontSize: 10 }}>÷{activeRide.splitData.totalPeople}</Text>
                )}
              </View>
            </View>

            {activeRide.splitData && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: `${GOLD}1A`, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: `${GOLD}33` }}>
                <MaterialIcons name="group" size={16} color={GOLD} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: GOLD, fontSize: 12, fontWeight: "600" }}>
                    Split with {activeRide.splitData.totalPeople - 1} friend{activeRide.splitData.totalPeople > 2 ? "s" : ""}
                  </Text>
                  <Text style={{ color: MUTED, fontSize: 11 }}>Your share: GH₵{activeRide.splitData.perPersonFare.toFixed(2)}</Text>
                </View>
              </View>
            )}

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
                onPress={() => Alert.alert(
                  '🚨 Emergency SOS',
                  'This will immediately notify HY3N Safety team and your emergency contacts with your current location.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Send SOS', style: 'destructive', onPress: () => Alert.alert('SOS Sent', 'HY3N Safety team and your emergency contacts have been notified.') },
                  ]
                )}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: `${RED}1A`, borderRadius: 12, borderWidth: 1, borderColor: `${RED}55` }}
              >
                <MaterialIcons name="emergency" size={18} color={RED} />
                <Text style={{ color: RED, fontSize: 13, fontWeight: "700" }}>SOS</Text>
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
              <Row label="Base Fare" value={`GH₵${activeRide.fare.toFixed(2)}`} />
              {activeRide.waitingFee && activeRide.waitingFee > 0 && (
                <Row label="Waiting Fee" value={`+GH₵${activeRide.waitingFee.toFixed(2)}`} valueColor={RED} />
              )}
              {tipAmount && tipAmount > 0 && (
                <Row label="Tip" value={`+GH₵${tipAmount.toFixed(2)}`} valueColor={GREEN} />
              )}
              <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                <Row
                  label="Total"
                  value={`GH₵${(activeRide.fare + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2)}`}
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

            {!rideRated && (
              <TouchableOpacity
                onPress={() => setShowRatingModal(true)}
                style={{ width: "100%", backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10, flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                <MaterialIcons name="star" size={18} color="#000" />
                <Text style={{ color: "#000", fontWeight: "bold", fontSize: 15 }}>Rate Your Driver</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setShowReceipt(true)}
              style={{ width: "100%", borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginBottom: 10, flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              <MaterialIcons name="receipt" size={18} color={MUTED} />
              <Text style={{ color: MUTED, fontWeight: "600", fontSize: 14 }}>View Receipt</Text>
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

      {/* Surge banner — Uber/Bolt style: plain language, no multiplier */}
      {SURGE > 1 && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#F59E0B18", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#F59E0B40" }}>
          <MaterialIcons name="bolt" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#F59E0B", fontWeight: "700", fontSize: 13, marginBottom: 2 }}>Prices are higher than normal</Text>
            <Text style={{ color: "#F59E0B", fontSize: 12, lineHeight: 17, opacity: 0.85 }}>More people are requesting rides than there are available drivers. Fares will return to normal when demand drops.</Text>
          </View>
        </View>
      )}
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

      {/* Split Fare */}
      <TouchableOpacity
        onPress={() => setShowSplitModal(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: splitData ? `${GOLD}1A` : CARD,
          borderWidth: 1,
          borderColor: splitData ? GOLD : BORDER,
          marginBottom: 10,
        }}
      >
        <MaterialIcons name="group" size={18} color={splitData ? GOLD : MUTED} />
        <View style={{ flex: 1 }}>
          {splitData ? (
            <>
              <Text style={{ color: GOLD, fontSize: 13, fontWeight: "600" }}>Split with {splitData.totalPeople - 1} friend{splitData.totalPeople > 2 ? "s" : ""}</Text>
              <Text style={{ color: MUTED, fontSize: 11 }}>GH₵{splitData.perPersonFare.toFixed(2)} each</Text>
            </>
          ) : (
            <Text style={{ color: MUTED, fontSize: 13, fontWeight: "500" }}>Split fare with friends</Text>
          )}
        </View>
        {splitData && (
          <TouchableOpacity onPress={(e) => { setSplitData(null); }}>
            <MaterialIcons name="close" size={16} color={MUTED} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 4 }}>
              {splitData ? "Your Share" : "Estimated Fare"}
            </Text>
            {splitData && <Text style={{ color: MUTED, fontSize: 11 }}>Total Trip: GH₵{finalFare.toFixed(2)}</Text>}
            {discount > 0 && (
              <Text style={{ color: MUTED, fontSize: 11, textDecorationLine: "line-through" }}>GH₵{baseFare.toFixed(2)}</Text>
            )}
          </View>
          <Text style={{ color: GOLD, fontWeight: "bold", fontSize: 24 }}>
            GH₵{Math.max(0, perPersonFare * 0.92).toFixed(2)}–{(perPersonFare * 1.12).toFixed(2)}
          </Text>
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
              {isScheduled ? "Schedule Trip" : `Request HY3N · GH₵${perPersonFare.toFixed(2)}`}
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
          activeRide && (activeRide.status === "matched" || activeRide.status === "driver_arriving")
            ? [userLocation[0] + 0.008, userLocation[1] - 0.005]
            : null
        }
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

      {/* Schedule Modal */}
      <Modal visible={showScheduleModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Schedule Trip</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>Must be at least 30 minutes from now</Text>
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

      {/* Split Fare Modal */}
      <Modal visible={showSplitModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Split Fare</Text>
            <Text style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>Share the cost with friends (2–6 people)</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>Number of people (including you)</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {[2, 3, 4, 5, 6].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setSplitCount(String(n))}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: splitCount === String(n) ? `${GOLD}1A` : CARD, borderWidth: 1, borderColor: splitCount === String(n) ? GOLD : BORDER }}
                >
                  <Text style={{ color: splitCount === String(n) ? GOLD : TEXT, fontWeight: "bold", fontSize: 16 }}>{n}</Text>
                  <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>GH₵{(finalFare / n).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={handleSplitConfirm}
              style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Confirm Split</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSplitModal(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
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
              <Text style={{ color: TEXT, fontWeight: "bold", fontSize: 22 }}>GH₵{activeRide ? (activeRide.fare + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2) : "0.00"}</Text>
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
                <Row label="Total" value={`GH₵${activeRide ? (activeRide.fare + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2) : "0.00"}`} valueColor={GOLD} bold />
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
                const receiptText = `HY3N Trip Receipt\nDate: ${new Date().toLocaleDateString('en-GH')}\nDestination: ${activeRide?.destination.name}\nFare: GH₵${activeRide?.fare.toFixed(2)}\nTotal: GH₵${activeRide ? (activeRide.fare + (activeRide.waitingFee || 0) + (tipAmount || 0)).toFixed(2) : '0.00'}\nDriver: ${activeRide?.driverName || 'N/A'}\n\nThank you for riding with HY3N!`;
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
            {/* Show cancellation fee warning if outside 2-min free window */}
            {activeRide?.matchedAt && ['driver_arriving', 'matched'].includes(activeRide.status) && Date.now() - new Date(activeRide.matchedAt).getTime() > FREE_CANCEL_WINDOW_MS ? (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: RED, fontSize: 13, fontWeight: '600' }}>⚠️ A GH₵2.00 cancellation fee will apply</Text>
                <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Your driver has been waiting more than 2 minutes. Cancellations after the free window incur a GH₵2 fee.</Text>
              </View>
            ) : (
              <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>Please select a reason for cancelling:</Text>
            )}
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
                {scheduledFor ? `Pickup set for ${scheduledFor}. We’ll remind you before the ride starts.` : "Your pickup time has been saved."}
              </Text>
            </View>
          </View>
        </View>
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
