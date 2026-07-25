// src/components/AuthListener.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from "@supabase/supabase-js";
import * as Linking from 'expo-linking';
import React, { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useDispatch } from "react-redux";
import {
  clearUser,
  setError,
  setHydrated,
  setRequiresPasswordUpdate,
  setSyncing,
  setUser,
  User
} from "../store/authSlice";
import type { AppDispatch } from "../store/store";
import { clearLocalSession, createLocalSession } from '../utils/localSession';
import { authLogger } from "../utils/logger";
import { createSessionFromUrl, isProcessingRedirect, syncProfileData } from '../utils/login';
import { supabase } from '../utils/supabaseClient';

const AuthListener: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    const STEP = 'GATEKEEPER';

    const performLogout = async (message: string) => {
      authLogger.warn(STEP, `FORCED LOGOUT: ${message}`);
      await supabase.auth.signOut();
      await clearLocalSession();
      await AsyncStorage.multiRemove(['pending_profile', 'supabase.auth.token']);
      dispatch(clearUser());
      dispatch(setError(message));
      dispatch(setHydrated());
    };

    const handleUserSession = async (session: Session | null) => {
      if (!isMounted) return;

      if (!session) {
        // FIX: Prevent AppState/init() from wiping the session during OAuth deep link processing.
        // Expo fires AppState "active" and Linking simultaneously when WebBrowser closes.
        // If we clearUser() here, the race condition kills the OAuth flow.
        if (isProcessingRedirect) {
          authLogger.log(STEP, 'Deep link in progress. Skipping clearUser.');
          return; 
        }
        authLogger.log(STEP, 'No active session. Redirecting to Auth Stack.');
        dispatch(clearUser());
        dispatch(setHydrated());
        return;
      }

      // --- OPTIMISTIC ENTRY ---
      // If we have a local session, let the user in IMMEDIATELY.
      // We will verify and sync in the background.
      authLogger.log(STEP, `Session found for ${session.user.id}. Releasing Gatekeeper optimistically...`);
      
      const optimisticUser: User = {
        id: session.user.id,
        fullName: session.user.user_metadata?.full_name || 'User',
        email: session.user.email || '',
        role: (session.user.user_metadata?.role || 'student') as any,
        phone: session.user.phone || '',
        token: session.access_token,
        refreshToken: session.refresh_token || '',
        supabaseTokens: {
          access_token: session.access_token,
          refresh_token: session.refresh_token || ''
        }
      };

      dispatch(setUser(optimisticUser));
      dispatch(setHydrated()); // Hides splash screen
      
      // Now run the heavy lifting in the background
      performBackgroundSync(session);
    };

    const performBackgroundSync = async (session: Session) => {
      authLogger.log(STEP, 'Starting background verification pipeline...');
      dispatch(setSyncing(true));

      try {
        // 1. Backend Verification (Anti-Ghost)
        const verifyUser = async () => {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) throw new Error('SESSION_EXPIRED');
          return user;
        };

        // Aggressive 5s timeout for background check
        const user = await Promise.race([
          verifyUser(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('VERIFICATION_TIMEOUT')), 5000))
        ]) as any;

        // 2. Synchronization Handover
        const pendingJson = await AsyncStorage.getItem('pending_profile');
        if (pendingJson) {
          authLogger.log(STEP, 'Pending profile found. Triggering Master Sync...');
          const profileData = JSON.parse(pendingJson);
          await syncProfileData(user.id, profileData);
          await AsyncStorage.removeItem('pending_profile');
        }

        // 3. Database Integrity & Fetch
        const fetchDbUser = async () => {
          const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
          if (error) throw error;
          return data;
        };

        const dbUser = await Promise.race([
          fetchDbUser(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB_FETCH_TIMEOUT')), 5000))
        ]) as any;

        if (!dbUser && user) {
           authLogger.warn(STEP, 'Public record missing. Attempting emergency sync...');
           await syncProfileData(user.id, {
             fullName: user.user_metadata?.full_name || 'User',
             role: user.user_metadata?.role || 'student',
             whatsappNumber: user.user_metadata?.whatsapp || '',
             mobileMoney: user.user_metadata?.momo || ''
           });
        }

        // 4. Redux State Refinement (Silent Update)
        const finalUser: User = {
          id: user.id,
          fullName: dbUser?.full_name || user.user_metadata?.full_name || 'User',
          email: dbUser?.email || user.email || '',
          role: (dbUser?.role || user.user_metadata?.role || 'student') as any,
          phone: dbUser?.phone || user.phone || '',
          token: session.access_token,
          refreshToken: session.refresh_token || '',
          supabaseTokens: {
            access_token: session.access_token,
            refresh_token: session.refresh_token || ''
          }
        };

        await createLocalSession(finalUser, finalUser.supabaseTokens);
        dispatch(setUser(finalUser));
        authLogger.success(STEP, '🏁 Background sync complete. State refined.');

      } catch (err: any) {
        authLogger.warn(STEP, `Background sync failed/delayed: ${err.message}`);
        if (err.message === 'SESSION_EXPIRED') {
          await performLogout('Your session has expired. Please log in again.');
        }
        // Other errors (timeouts) are ignored as we are already in fallback/optimistic mode
      } finally {
        dispatch(setSyncing(false));
      }
    };

    // --- INITIALIZATION ---
    const init = async () => {
      authLogger.log(STEP, 'Initializing Gatekeeper...');
      const { data: { session } } = await supabase.auth.getSession();
      await handleUserSession(session);
    };
    init();

    // --- EVENT LISTENERS ---

    // 1. Supabase Auth State
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      authLogger.log(STEP, `Supabase Event: ${event}`);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await handleUserSession(session);
      } else if (event === 'SIGNED_OUT') {
        await clearLocalSession();
        dispatch(clearUser());
        dispatch(setHydrated());
      } else if (event === 'PASSWORD_RECOVERY') {
        dispatch(setRequiresPasswordUpdate(true));
      }
    });

    // 2. App State (Re-verify on resume)
    const appStateSubscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        authLogger.log(STEP, 'App resumed. Re-verifying session...');
        init();
      }
      appState.current = nextAppState;
    });

    // 3. Deep Linking (OAuth / Email Links)
    const handleUrl = async (url: string | null) => {
      if (!url || !isMounted) return;
      
      // Look for auth data or error data
      if (url.includes('auth/callback') || url.includes('#access_token') || url.includes('error=')) {
        authLogger.log(STEP, 'Auth Deep Link detected. Processing URL...');
        try {
          await createSessionFromUrl(url);
        } catch (err: any) {
          authLogger.error(STEP, `Deep link processing failed: ${err.message}`);
          dispatch(setError(err.message || 'Login link failed.'));
        } finally {
          dispatch(setHydrated());
        }
      }
    };

    const linkSubscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      appStateSubscription.remove();
      linkSubscription.remove();
    };
  }, [dispatch]);

  return null;
};

export default AuthListener;