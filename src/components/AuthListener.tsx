// src/components/AuthListener.tsx
import React, { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { AppState, AppStateStatus } from "react-native";
import { setUser, signOut, setHydrated, clearUser, User, setError } from "../store/authSlice";

import * as Linking from 'expo-linking';
import { createLocalSession, getLocalSession, clearLocalSession } from '../utils/localSession';
import { supabase } from '../utils/supabaseClient';
import { createSessionFromUrl } from '../utils/login';
import type { AppDispatch } from "../store/store";

const AuthListener: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;

    // 1. Manage AppState for Supabase auto-refresh timer
    // Supabase needs manual start/stop in React Native to prevent background timer issues
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[AuthListener] AppState: active -> startAutoRefresh()');
        supabase.auth.startAutoRefresh();
      } else if (
        appState.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        console.log('[AuthListener] AppState: background -> stopAutoRefresh()');
        supabase.auth.stopAutoRefresh();
      }
      appState.current = nextAppState;
    });

    // 2. Listen to Supabase as the SOLE authority for authenticating tokens
    // Supabase emits INITIAL_SESSION on first read from AsyncStorage (which is fast),
    // and emits TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT as needed.
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      console.log(`[AuthListener] 🔵 Supabase Event: ${event}`);

      try {
        if (event === 'SIGNED_OUT') {
          await clearLocalSession();
          dispatch(clearUser()); // Synchronous clear. DO NOT use the signOut thunk here to avoid infinite loops!
        } else if (event === 'INITIAL_SESSION' && !session) {
          // Hydration lock release: Supabase initialized but found no valid session.
          // IF we want offline capability for expired sessions, we can check local cache here.
          // BUT WE MUST NEVER CALL supabase.auth.setSession()
          const localUser = await getLocalSession();
          if (localUser) {
            console.log('[AuthListener] Offline/Expired fallback: loading user purely to Redux');
            dispatch(setUser(localUser)); // Drive UI offline, DO NOT push to Supabase
          } else {
            dispatch(setHydrated()); // Unlock UI to show Login screen
          }
        } else if (session?.user) {
          // Sync new Supabase state DOWN to Redux and local cache
          const localUser = await getLocalSession();
          
          let updatedUser: User;
          
          if (localUser) {
            // Update existing local cache with new tokens
            updatedUser = {
              ...localUser,
              token: session.access_token,
              refreshToken: session.refresh_token,
              supabaseTokens: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              },
            };
          } else {
            // Fallback generation logic if somehow no local user but Supabase has session
            updatedUser = {
              id: session.user.id,
              fullName: session.user.user_metadata?.full_name || session.user.email || 'User',
              email: session.user.email || '',
              role: (session.user.user_metadata?.role || 'student') as 'student' | 'landlord' | 'admin',
              phone: session.user.phone || session.user.user_metadata?.phone || '',
              token: session.access_token,
              refreshToken: session.refresh_token,
              supabaseTokens: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              },
            };
          }

          // Cache for offline UI
          await createLocalSession(updatedUser, updatedUser.supabaseTokens);

          console.log('[AuthListener] 🚀 Updating Redux state for user ID:', updatedUser.id);

          // Push to Redux to drive UI
          dispatch(setUser(updatedUser)); // setUser also sets isHydrated to true internally
        }
      } catch (err) {
        console.error('[AuthListener] Error syncing Supabase state:', err);
      }
    });

    // 3. Handle Deep Links (for browser-based OAuth redirects)
    const handleUrl = (url: string | null) => {
      if (!url) return;
      console.log('[AuthListener] Handling deep link URL...');
      createSessionFromUrl(url).catch(err => {
        console.warn('[AuthListener] Failed to create session from URL:', err);
        if (err.message === 'ACCOUNT_NOT_FOUND') {
          dispatch(setError('No profile found for this Google account. Please Sign Up first.'));
        } else {
          dispatch(setError('Could not complete login from the received link.'));
        }
      });
    };

    const linkSubscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    // Check for initial URL if app was launched from a link
    Linking.getInitialURL().then(url => {
      if (url) handleUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
      linkSubscription.remove();
      authListener.subscription.unsubscribe();
    };
  }, [dispatch]);

  return null;
};

export default AuthListener;