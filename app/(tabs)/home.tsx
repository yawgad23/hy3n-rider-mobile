import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as ExpoLocation from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRiderAuth } from '@/lib/rider-auth-context';
import { firestoreDB, COLLECTIONS } from '@/lib/firebase';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Dimensions, Alert, ActivityIndicator, Animated, Image, Platform,
  Modal, TextInput, KeyboardAvoidingView, StatusBar, useColorScheme,
  FlatList, SectionList
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { Colors } from '@/constants/theme';
import { format, parseISO } from 'date-fns';

const GOLD = '#D4AF37';
const GREEN = '#22C55E';
const RED = '#EF4444';
const BLUE = '#3B82F6';
const ORANGE = '#F59E0B';

const { width, height } = Dimensions.get('window');

export default function RiderHomeScreen() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const isDark = systemScheme === 'dark';
  const themeColors = Colors[isDark ? 'dark' : 'light'];
  
  const { user, riderProfile } = useRiderAuth();
  const mapRef = useRef<MapView>(null);
  
  // Location & Navigation State
  const [location, setLocation] = useState<[number, number]>([5.6037, -0.1870]);
  const [destination, setDestination] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  
  // UI State
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookingSheetOpen, setBookingSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  
  // Booking State
  const [selectedCategory, setSelectedCategory] = useState('economy');
  const [fareEstimate, setFareEstimate] = useState<number | null>(null);
  const [surgeMultiplier, setSurgeMultiplier] = useState(1.0);
  const [selectedPayment, setSelectedPayment] = useState('mobile_money');
  const [stops, setStops] = useState<any[]>([]);
  const [splitFareContacts, setSplitFareContacts] = useState<any[]>([]);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  
  // Trip State
  const [tripStartTime, setTripStartTime] = useState<string | null>(null);
  const [rideRoute, setRideRoute] = useState<any[]>([]);
  const [driverRating, setDriverRating] = useState(0);
  const [tripFeedback, setTripFeedback] = useState('');
  const [showRating, setShowRating] = useState(false);
  
  // Connectivity
  const [isOnline, setIsOnline] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);

  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Geolocation Setup
  useEffect(() => {
    let subscription: any;
    (async () => {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required to book rides.');
        return;
      }
      const loc = await ExpoLocation.getCurrentPositionAsync({});
      setLocation([loc.coords.latitude, loc.coords.longitude]);
      
      subscription = await ExpoLocation.watchPositionAsync(
        { accuracy: ExpoLocation.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (newLoc) => setLocation([newLoc.coords.latitude, newLoc.coords.longitude])
      );
    })();
    return () => subscription?.remove();
  }, []);

  // Initialize User & Load Saved Places
  useEffect(() => {
    const init = async () => {
      try {
        if (!user?.id) {
          setLoading(false);
          return;
        }

        // Load rider profile & saved places
        const profiles = await firestoreDB.query(COLLECTIONS.RIDER_PROFILES, [
          { field: 'user_id', operator: '==', value: user.id }
        ]);

        if (profiles.length > 0) {
          const profile = profiles[0];
          setSavedPlaces(profile.saved_locations || []);
          setRecentSearches(profile.recent_searches || []);
        }

        setLoading(false);
      } catch (err) {
        console.error('Init error:', err);
        setLoading(false);
      }
    };
    init();
  }, [user?.id]);

  // Fetch nearby drivers
  useEffect(() => {
    if (!user || activeRide) return;
    
    const fetchNearby = async () => {
      try {
        const drivers = await firestoreDB.query(COLLECTIONS.DRIVER_PROFILES, [
          { field: 'is_online', operator: '==', value: true },
          { field: 'latitude', operator: '>=', value: location[0] - 0.1 },
          { field: 'latitude', operator: '<=', value: location[0] + 0.1 }
        ]);
        setNearbyDrivers(drivers.slice(0, 10));
      } catch (err) {
        console.error('Failed to fetch nearby drivers:', err);
      }
    };

    fetchNearby();
    const interval = setInterval(fetchNearby, 10000);
    return () => clearInterval(interval);
  }, [user, activeRide, location]);

  // Subscribe to active ride updates
  useEffect(() => {
    if (!activeRide?.id) return;

    const unsubscribe = firestoreDB.subscribe(COLLECTIONS.RIDES, (snapshot) => {
      snapshot.forEach((change) => {
        const ride = change.doc.data();
        if (ride.id === activeRide.id) {
          setActiveRide(ride);

          // Handle status changes
          if (ride.status === 'matched' && activeRide.status !== 'matched') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Driver Assigned!',
                body: `Your driver ${ride.driver_name} is on the way.`,
              },
              trigger: null,
            });
          }

          if (ride.status === 'driver_arriving' && activeRide.status !== 'driver_arriving') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Driver Arriving!',
                body: `Your driver will arrive soon.`,
              },
              trigger: null,
            });
          }

          if (ride.status === 'in_progress' && activeRide.status !== 'in_progress') {
            setTripStartTime(new Date().toISOString());
          }

          if (ride.status === 'completed' && activeRide.status !== 'completed') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Trip Complete!',
                body: 'You\'ve arrived at your destination.',
              },
              trigger: null,
            });
            setShowRating(true);
          }
        }
      });
    });

    return () => unsubscribe?.();
  }, [activeRide?.id]);

  // Estimate fare
  const estimateFare = useCallback(async () => {
    if (!destination) return;
    try {
      const distance = calculateDistance(
        location[0], location[1],
        destination.lat, destination.lng
      );
      
      const categoryRates: Record<string, number> = {
        economy: 2.50,
        comfort: 3.50,
        premium: 5.00,
      };
      
      const baseRate = categoryRates[selectedCategory] || 2.50;
      const estimate = Math.round((distance * baseRate) * 100) / 100;
      setFareEstimate(estimate * surgeMultiplier);
    } catch (err) {
      console.error('Fare estimation error:', err);
    }
  }, [destination, location, selectedCategory, surgeMultiplier]);

  useEffect(() => {
    estimateFare();
  }, [destination, selectedCategory, surgeMultiplier, estimateFare]);

  // Calculate distance (simple Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Search destinations
  const handleSearch = (text: string) => {
    setQuery(text);
    if (text.length > 2) {
      // Mock search - replace with actual Google Places API
      const mockResults = [
        { name: 'Airport', address: 'Kotoka International Airport', lat: 5.6051, lng: -0.1665 },
        { name: 'Makola Market', address: 'Accra CBD', lat: 5.5500, lng: -0.1900 },
        { name: 'Marina Mall', address: 'Osu, Accra', lat: 5.5800, lng: -0.1600 },
      ].filter(r => r.name.toLowerCase().includes(text.toLowerCase()));
      setSearchResults(mockResults);
    } else {
      setSearchResults([]);
    }
  };

  // Select destination
  const handleSelectDestination = (dest: any) => {
    setDestination(dest);
    setSearchOpen(false);
    addToRecentSearches(dest);
    setBookingSheetOpen(true);
  };

  // Add to recent searches
  const addToRecentSearches = async (dest: any) => {
    if (!user?.id) return;
    try {
      const updated = [dest, ...recentSearches.filter(r => r.name !== dest.name)].slice(0, 10);
      setRecentSearches(updated);
      
      const profile = await firestoreDB.query(COLLECTIONS.RIDER_PROFILES, [
        { field: 'user_id', operator: '==', value: user.id }
      ]);
      
      if (profile.length > 0) {
        await firestoreDB.update(COLLECTIONS.RIDER_PROFILES, profile[0].id, {
          recent_searches: updated
        });
      }
    } catch (err) {
      console.error('Error updating recent searches:', err);
    }
  };

  // Book ride
  const handleBookRide = async () => {
    if (!user?.id || !destination || !fareEstimate) {
      Alert.alert('Error', 'Please complete all booking details');
      return;
    }

    try {
      const isScheduled = scheduledFor && scheduledFor > new Date();
      
      const rideData = {
        rider_id: user.id,
        rider_name: user.full_name || 'Rider',
        pickup_lat: location[0],
        pickup_lng: location[1],
        pickup_address: 'Current Location',
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        destination_address: destination.name,
        category: selectedCategory,
        fare_estimate: fareEstimate,
        surge_multiplier: surgeMultiplier,
        payment_method: selectedPayment,
        stops: stops,
        split_fare_contacts: splitFareContacts,
        status: isScheduled ? 'scheduled' : 'requested',
        ride_type: isScheduled ? 'scheduled' : 'on_demand',
        scheduled_for: isScheduled ? scheduledFor.toISOString() : null,
        created_at: new Date().toISOString(),
      };

      const ride = await firestoreDB.add(COLLECTIONS.RIDES, rideData);
      
      setActiveRide({ ...rideData, id: ride.id });
      setDestination(null);
      setBookingSheetOpen(false);
      
      // Show notification based on ride type
      if (isScheduled) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Trip Scheduled!',
            body: `Your ${selectedCategory} ride is scheduled for ${format(scheduledFor, 'h:mm a')}.`,
          },
          trigger: null,
        });
      } else {
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Looking for a driver...',
            body: `Searching for nearby ${selectedCategory} drivers.`,
          },
          trigger: null,
        });
      }
    } catch (err) {
      console.error('Booking error:', err);
      Alert.alert('Booking Failed', 'Unable to book your ride. Please try again.');
    }
  };

  // Submit rating
  const handleSubmitRating = async () => {
    if (!activeRide?.id) return;
    try {
      await firestoreDB.update(COLLECTIONS.RIDES, activeRide.id, {
        rider_rating: driverRating,
        rider_feedback: tripFeedback
      });

      setShowRating(false);
      setActiveRide(null);
      setDriverRating(0);
      setTripFeedback('');
    } catch (err) {
      Alert.alert('Error', 'Failed to submit rating');
    }
  };

  // Cancel ride
  const handleCancelRide = async () => {
    if (!activeRide?.id) return;
    Alert.alert('Cancel Ride?', 'Are you sure you want to cancel this ride?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          try {
            await firestoreDB.update(COLLECTIONS.RIDES, activeRide.id, {
              status: 'cancelled_by_rider'
            });
            setActiveRide(null);
          } catch (err) {
            Alert.alert('Error', 'Failed to cancel ride');
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centerContainer}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={[styles.welcomeTitle, { color: themeColors.text }]}>Welcome to HY3N</Text>
          <Text style={[styles.welcomeSub, { color: themeColors.muted }]}>Your ride, your way</Text>
          <TouchableOpacity 
            style={[styles.signInBtn, { backgroundColor: GOLD }]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.signInText}>Sign In to Book</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const homePlace = savedPlaces.find(p => p.name?.toLowerCase() === 'home');
  const workPlace = savedPlaces.find(p => p.name?.toLowerCase() === 'work');

  const dynamicStyles = {
    card: {
      backgroundColor: isDark ? 'rgba(17, 17, 17, 0.9)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: themeColors.border
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />

      {/* Full Screen Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: location[0],
          longitude: location[1],
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
      >
        {/* Nearby Drivers */}
        {nearbyDrivers.map((driver, idx) => (
          <Marker
            key={idx}
            coordinate={{ latitude: driver.latitude, longitude: driver.longitude }}
            title={driver.full_name}
            description={`${driver.vehicle_model} • ${driver.rating}★`}
          >
            <View style={styles.driverMarker}>
              <MaterialIcons name="directions-car" size={16} color={BLUE} />
            </View>
          </Marker>
        ))}

        {/* Route Polyline */}
        {activeRide && driverPos && rideRoute.length > 0 && (
          <Polyline
            coordinates={rideRoute}
            strokeColor={BLUE}
            strokeWidth={3}
          />
        )}
      </MapView>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={[styles.headerBadge, dynamicStyles.card]}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? GREEN : themeColors.muted }]} />
          <Text style={[styles.headerText, { color: themeColors.text }]}>HY3N</Text>
        </View>
        <TouchableOpacity style={[styles.bellBtn, dynamicStyles.card]}>
          <MaterialIcons name="notifications-none" size={22} color={themeColors.text} />
          {nearbyDrivers.length > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{nearbyDrivers.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Nearby Drivers Indicator */}
      {!activeRide && nearbyDrivers.length > 0 && (
        <View style={[styles.nearbyBanner, dynamicStyles.card]}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <View style={[styles.pulseDot, { backgroundColor: GREEN }]} />
          </Animated.View>
          <Text style={[styles.nearbyText, { color: themeColors.text }]}>
            {nearbyDrivers.length} cars nearby
          </Text>
        </View>
      )}

      {/* Bottom Sheet - Where To? / Booking */}
      {!activeRide && (
        <View style={[styles.bottomSheet, dynamicStyles.card, { paddingBottom: insets.bottom + 20 }]}>
          {!destination ? (
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {/* Search Bar */}
              <TouchableOpacity
                style={[styles.searchBar, { borderColor: themeColors.border }]}
                onPress={() => setSearchOpen(true)}
              >
                <MaterialIcons name="search" size={20} color={themeColors.muted} />
                <Text style={[styles.searchPlaceholder, { color: themeColors.muted }]}>
                  Where to?
                </Text>
              </TouchableOpacity>

              {/* Saved Places */}
              <View style={styles.savedPlacesContainer}>
                {homePlace && (
                  <TouchableOpacity
                    style={[styles.placeBtn, dynamicStyles.card]}
                    onPress={() => handleSelectDestination(homePlace)}
                  >
                    <MaterialIcons name="home" size={20} color={GOLD} />
                    <View style={styles.placeBtnText}>
                      <Text style={[styles.placeName, { color: themeColors.text }]}>Home</Text>
                      <Text style={[styles.placeAddr, { color: themeColors.muted }]} numberOfLines={1}>
                        {homePlace.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {workPlace && (
                  <TouchableOpacity
                    style={[styles.placeBtn, dynamicStyles.card]}
                    onPress={() => handleSelectDestination(workPlace)}
                  >
                    <MaterialIcons name="work" size={20} color={GOLD} />
                    <View style={styles.placeBtnText}>
                      <Text style={[styles.placeName, { color: themeColors.text }]}>Work</Text>
                      <Text style={[styles.placeAddr, { color: themeColors.muted }]} numberOfLines={1}>
                        {workPlace.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {recentSearches.slice(0, 2).map((place, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.placeBtn, dynamicStyles.card]}
                    onPress={() => handleSelectDestination(place)}
                  >
                    <MaterialIcons name="history" size={20} color={themeColors.muted} />
                    <View style={styles.placeBtnText}>
                      <Text style={[styles.placeName, { color: themeColors.text }]}>{place.name}</Text>
                      <Text style={[styles.placeAddr, { color: themeColors.muted }]} numberOfLines={1}>
                        {place.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : (
            // Booking Sheet
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {/* Destination Summary */}
              <View style={[styles.destSummary, dynamicStyles.card]}>
                <MaterialIcons name="location-on" size={20} color={GOLD} />
                <View style={styles.destSummaryText}>
                  <Text style={[styles.destTitle, { color: themeColors.muted }]}>To:</Text>
                  <Text style={[styles.destName, { color: themeColors.text }]}>{destination.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setDestination(null)}>
                  <MaterialIcons name="edit" size={20} color={themeColors.muted} />
                </TouchableOpacity>
              </View>

              {/* Category Selection */}
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Choose Ride Type</Text>
              <View style={styles.categoryGrid}>
                {['economy', 'comfort', 'premium'].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryBtn,
                      dynamicStyles.card,
                      selectedCategory === cat && styles.categoryBtnActive
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <MaterialIcons
                      name={cat === 'economy' ? 'directions-car' : 'directions-car'}
                      size={24}
                      color={selectedCategory === cat ? GOLD : themeColors.muted}
                    />
                    <Text style={[
                      styles.categoryName,
                      { color: selectedCategory === cat ? GOLD : themeColors.text }
                    ]}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Fare & Surge */}
              {fareEstimate && (
                <View style={[styles.fareCard, dynamicStyles.card]}>
                  <Text style={[styles.fareLabel, { color: themeColors.muted }]}>Estimated Fare</Text>
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareAmount, { color: GOLD }]}>GH₵{fareEstimate.toFixed(2)}</Text>
                    {surgeMultiplier > 1 && (
                      <Text style={[styles.surgeText, { color: RED }]}>
                        {surgeMultiplier}x Surge
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Payment Method */}
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Payment</Text>
              <View style={styles.paymentGrid}>
                {['mobile_money', 'cash', 'card', 'wallet'].map(method => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.paymentBtn,
                      dynamicStyles.card,
                      selectedPayment === method && { borderColor: GOLD, borderWidth: 2 }
                    ]}
                    onPress={() => setSelectedPayment(method)}
                  >
                    <MaterialIcons
                      name={
                        method === 'mobile_money' ? 'smartphone' :
                        method === 'cash' ? 'attach-money' :
                        method === 'card' ? 'credit-card' :
                        'wallet'
                      }
                      size={20}
                      color={selectedPayment === method ? GOLD : themeColors.muted}
                    />
                    <Text style={[
                      styles.paymentLabel,
                      { color: selectedPayment === method ? GOLD : themeColors.text }
                    ]}>
                      {method === 'mobile_money' ? 'MoMo' : method.charAt(0).toUpperCase() + method.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Schedule Option */}
              <TouchableOpacity
                style={[styles.scheduleBtn, dynamicStyles.card]}
                onPress={() => setShowCalendar(true)}
              >
                <MaterialIcons name="schedule" size={20} color={GOLD} />
                <Text style={[styles.scheduleBtnText, { color: themeColors.text }]}>
                  {scheduledFor ? format(scheduledFor, 'MMM d, h:mm a') : 'Schedule for later'}
                </Text>
              </TouchableOpacity>

              {/* Book Button */}
              <TouchableOpacity
                style={[styles.bookBtn, { backgroundColor: GOLD }]}
                onPress={handleBookRide}
              >
                <Text style={styles.bookBtnText}>Book {selectedCategory}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: themeColors.border, borderWidth: 1 }]}
                onPress={() => setDestination(null)}
              >
                <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      )}

      {/* Active Trip Card */}
      {activeRide && (
        <View style={[styles.tripCard, dynamicStyles.card, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.tripHeader}>
            <Text style={[styles.tripStatus, { color: GOLD }]}>
              {activeRide.status === 'requested' ? 'Finding Driver...' :
               activeRide.status === 'matched' ? 'Driver Assigned' :
               activeRide.status === 'driver_arriving' ? 'Driver Arriving' :
               activeRide.status === 'in_progress' ? 'In Progress' : 'Completed'}
            </Text>
            <TouchableOpacity onPress={handleCancelRide}>
              <MaterialIcons name="close" size={24} color={RED} />
            </TouchableOpacity>
          </View>

          {activeRide.status !== 'requested' && activeRide.driver_name && (
            <View style={styles.driverInfo}>
              <View>
                <Text style={[styles.driverName, { color: themeColors.text }]}>
                  {activeRide.driver_name}
                </Text>
                <Text style={[styles.driverDetails, { color: themeColors.muted }]}>
                  {activeRide.driver_vehicle} • {activeRide.driver_rating}★
                </Text>
              </View>
              <MaterialIcons name="star" size={20} color={GOLD} />
            </View>
          )}

          {eta && (
            <View style={[styles.etaBox, dynamicStyles.card]}>
              <MaterialIcons name="schedule" size={18} color={BLUE} />
              <Text style={[styles.etaText, { color: themeColors.text }]}>
                ETA: {eta} min
              </Text>
            </View>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: BLUE, flex: 1 }]}>
              <MaterialIcons name="chat" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: GREEN, flex: 1, marginLeft: 8 }]}>
              <MaterialIcons name="call" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search Modal */}
      <Modal visible={searchOpen} animationType="slide" transparent>
        <View style={[styles.searchModal, { backgroundColor: themeColors.background }]}>
          <View style={[styles.searchContainer, { paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => setSearchOpen(false)}>
              <MaterialIcons name="arrow-back" size={24} color={themeColors.text} />
            </TouchableOpacity>
            <TextInput
              style={[styles.searchInput, { color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Where to?"
              placeholderTextColor={themeColors.muted}
              value={query}
              onChangeText={handleSearch}
              autoFocus
            />
          </View>

          <FlatList
            data={searchResults.length > 0 ? searchResults : recentSearches}
            keyExtractor={(item, idx) => `${item.name}-${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.searchResult, dynamicStyles.card]}
                onPress={() => handleSelectDestination(item)}
              >
                <MaterialIcons name="location-on" size={20} color={GOLD} />
                <View style={styles.searchResultText}>
                  <Text style={[styles.resultName, { color: themeColors.text }]}>{item.name}</Text>
                  <Text style={[styles.resultAddr, { color: themeColors.muted }]}>{item.address}</Text>
                </View>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
          />
        </View>
      </Modal>

      {/* Rating Modal */}
      <Modal visible={showRating} animationType="slide" presentationStyle="pageSheet" transparent>
        <View style={styles.ratingOverlay}>
          <View style={[styles.ratingModal, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
            <Text style={[styles.ratingTitle, { color: themeColors.text }]}>Rate Your Trip</Text>
            
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setDriverRating(star)}>
                  <MaterialIcons
                    name={star <= driverRating ? 'star' : 'star-outline'}
                    size={40}
                    color={star <= driverRating ? GOLD : themeColors.muted}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.feedbackInput, { color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Add feedback (optional)"
              placeholderTextColor={themeColors.muted}
              multiline
              numberOfLines={4}
              value={tripFeedback}
              onChangeText={setTripFeedback}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={[styles.ratingBtn, { backgroundColor: themeColors.border, flex: 1 }]}
                onPress={() => setShowRating(false)}
              >
                <Text style={[styles.ratingBtnText, { color: themeColors.text }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingBtn, { backgroundColor: GOLD, flex: 1 }]}
                onPress={handleSubmitRating}
              >
                <Text style={styles.ratingBtnText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 80, height: 80, marginBottom: 20 },
  welcomeTitle: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  welcomeSub: { fontSize: 14, marginBottom: 24 },
  signInBtn: { width: '100%', maxWidth: 300, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  signInText: { color: '#000', fontSize: 16, fontWeight: '800' },

  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  headerText: { fontSize: 14, fontWeight: '900' },
  bellBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, position: 'relative' },
  notifBadge: { position: 'absolute', top: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  nearbyBanner: { position: 'absolute', top: 100, left: 16, right: 16, zIndex: 15, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  nearbyText: { fontSize: 13, fontWeight: '700' },

  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: height * 0.6, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderWidth: 1, borderBottomWidth: 0 },

  searchBar: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  searchPlaceholder: { fontSize: 16, fontWeight: '600' },

  savedPlacesContainer: { gap: 8 },
  placeBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  placeBtnText: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '700' },
  placeAddr: { fontSize: 12, marginTop: 2 },

  destSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  destSummaryText: { flex: 1 },
  destTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  destName: { fontSize: 14, fontWeight: '800', marginTop: 2 },

  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10, marginTop: 4 },
  categoryGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  categoryBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1 },
  categoryBtnActive: { borderColor: GOLD, borderWidth: 2 },
  categoryName: { fontSize: 12, fontWeight: '700', marginTop: 6 },

  fareCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  fareLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  fareAmount: { fontSize: 22, fontWeight: '900' },
  surgeText: { fontSize: 12, fontWeight: '700' },

  paymentGrid: { flexDirection: 'row', gap: 8, marginBottom: 16, justifyContent: 'space-between' },
  paymentBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
  paymentLabel: { fontSize: 11, fontWeight: '700' },

  scheduleBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  scheduleBtnText: { fontSize: 14, fontWeight: '700' },

  bookBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  bookBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },

  cancelBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '800' },

  tripCard: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderWidth: 1, borderBottomWidth: 0, gap: 12 },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripStatus: { fontSize: 14, fontWeight: '800' },

  driverInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: 'rgba(212,175,55,0.1)' },
  driverName: { fontSize: 16, fontWeight: '800' },
  driverDetails: { fontSize: 12, marginTop: 2 },

  driverMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },

  etaBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  etaText: { fontSize: 13, fontWeight: '700' },

  actionButtons: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  searchModal: { flex: 1, paddingBottom: 20 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },

  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 16, marginVertical: 4, borderRadius: 12, borderWidth: 1 },
  searchResultText: { flex: 1 },
  resultName: { fontSize: 14, fontWeight: '700' },
  resultAddr: { fontSize: 12, marginTop: 2 },

  ratingOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  ratingModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  ratingTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  starsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  feedbackInput: { height: 100, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 20, textAlignVertical: 'top' },
  ratingBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 },
  ratingBtnText: { fontSize: 15, fontWeight: '800', color: '#000' }
});
