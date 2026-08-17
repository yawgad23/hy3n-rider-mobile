import React, { createContext, useContext, useEffect, useState } from 'react';
import { firebaseAuth, firestoreDB, COLLECTIONS } from './firebase';
import type { User } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface RiderProfile {
  id: string;
  user_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  profile_picture?: string;
  loyalty_points?: number;
  loyalty_tier?: string;
  rating?: number;
  total_rides?: number;
  referral_code?: string;
  wallet_balance?: number;
  saved_places?: Array<{ label: string; address: string; lat?: number; lng?: number }>;
  created_date?: string;
}

interface AuthContextType {
  user: User | null;
  riderProfile: RiderProfile | null;
  loading: boolean;
  guestMode: boolean;
  setGuestMode: (val: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, inviteCode?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<RiderProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestMode, setGuestMode] = useState(false);

  const loadProfile = async (firebaseUser: User) => {
    try {
      const profiles = await firestoreDB.list(
        COLLECTIONS.RIDER_PROFILES,
        { user_id: firebaseUser.uid }
      );
      if (profiles.length > 0) {
        setRiderProfile(profiles[0] as RiderProfile);
      } else {
        const newProfile = await firestoreDB.create(COLLECTIONS.RIDER_PROFILES, {
          user_id: firebaseUser.uid,
          full_name: firebaseUser.displayName || '',
          email: firebaseUser.email || '',
          phone: firebaseUser.phoneNumber || '',
          loyalty_points: 0,
          loyalty_tier: 'Bronze',
          rating: 5.0,
          total_rides: 0,
          referral_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        });
        setRiderProfile(newProfile as unknown as RiderProfile);
      }
    } catch (err) {
      console.error('Error loading rider profile:', err);
    }
  };

  useEffect(() => {
    const setupAuth = async () => {
      try {
        // Firebase persistence is already configured in firebase.ts
        // No need to set it again here
      } catch (err) {
        console.error('Error setting persistence:', err);
      }
    };
    
    setupAuth();
    
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (Platform.OS !== 'web') {
          await AsyncStorage.setItem('firebaseUser', JSON.stringify({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            phoneNumber: firebaseUser.phoneNumber,
          }));
        }
        await loadProfile(firebaseUser);
      } else {
        if (Platform.OS !== 'web') {
          await AsyncStorage.removeItem('firebaseUser');
        }
        setRiderProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);


  const signIn = async (email: string, password: string) => {
    const firebaseUser = await firebaseAuth.loginWithEmail(email, password);
    setGuestMode(false);
    await loadProfile(firebaseUser);
  };

  const signUp = async (email: string, password: string, fullName: string, inviteCode?: string) => {
    const firebaseUser = await firebaseAuth.register(email, password, fullName);
    setGuestMode(false);
    // Store invite code in profile if provided
    if (inviteCode) {
      await firestoreDB.create(COLLECTIONS.RIDER_PROFILES, {
        user_id: firebaseUser.uid,
        full_name: fullName,
        email: email,
        loyalty_points: 10, // GH₵10 bonus for using invite code
        loyalty_tier: 'Bronze',
        rating: 5.0,
        total_rides: 0,
        referral_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        invite_code_used: inviteCode,
        wallet_balance: 10, // GH₵10 bonus credited to wallet
      });
    }
    await loadProfile(firebaseUser);
  };

  const signOutUser = async () => {
    await firebaseAuth.logout();
    setUser(null);
    setRiderProfile(null);
    setGuestMode(false);
  };

  const deleteAccount = async () => {
    if (!user) return;
    try {
      // Delete rider profile from Firestore if it exists
      if (riderProfile?.id) {
        await firestoreDB.delete(COLLECTIONS.RIDER_PROFILES, riderProfile.id);
      }
    } catch (err) {
      console.error('Error deleting profile:', err);
    }
    // Delete Firebase Auth account
    await firebaseAuth.deleteAccount();
    setUser(null);
    setRiderProfile(null);
    setGuestMode(false);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const updateProfileData = async (data: Partial<RiderProfile>) => {
    if (!riderProfile?.id) return;
    const updated = await firestoreDB.update(COLLECTIONS.RIDER_PROFILES, riderProfile.id, data);
    setRiderProfile((prev) => prev ? { ...prev, ...updated } : prev);
  };

  const signInWithGoogle = async () => {
    console.log("Inside signInWithGoogle helper in AuthProvider");
    try {
      const firebaseUser = await firebaseAuth.loginWithGoogle();
      console.log("Firebase loginWithGoogle returned user:", firebaseUser?.uid);
      setGuestMode(false);
      await loadProfile(firebaseUser);
    } catch (e: any) {
      console.error("Error in signInWithGoogle helper:", e);
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      riderProfile,
      loading,
      guestMode,
      setGuestMode,
      signIn,
      signUp,
      signInWithGoogle,
      signOut: signOutUser,
      deleteAccount,
      refreshProfile,
      updateProfile: updateProfileData,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
