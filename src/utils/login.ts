// src/utils/login.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { clearLocalSession, getLocalSession } from '../utils/localSession';
import { supabase } from '../utils/supabaseClient';
import { authLogger } from './logger';

export interface SimpleUserProfile {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  momo?: string;
  preferred_language?: string;
  profile_pic?: string | null;
  role: string;
}

export interface RegistrationProfile {
  fullName: string;
  email?: string;
  whatsappNumber: string;
  mobileMoney: string;
  age?: string;
  address?: string;
  role: string;
  language?: string;
  profile_pic?: string | null;
}

// Global lock to prevent double-processing redirects
export let isProcessingRedirect = false;

// ----------------------
// PHONE LOGIN
// ----------------------
export const loginWithPhone = async (
  phone?: string,
  password?: string
): Promise<void> => {
  const STEP = 'PHONE_LOGIN';
  const requestId = Math.random().toString(36).substring(2, 10);

  try {
    authLogger.log(STEP, `[${requestId}] Starting phone login`);
    console.log(`[${STEP}] [${requestId}] phone param:`, phone, 'password provided:', !!password);

    if (!phone || !password) {
      authLogger.warn(STEP, `[${requestId}] Missing credentials`);
      console.warn(`[${STEP}] [${requestId}] phone or password missing, attempting local session`);

      const storedSession = await getLocalSession();
      authLogger.log(STEP, `[${requestId}] Local session lookup result:`, storedSession ? 'found' : 'null');

      if (storedSession) {
        authLogger.success(STEP, `[${requestId}] Found local session, restoring Supabase session`);
        console.log(`[${STEP}] [${requestId}] storedSession keys:`, Object.keys(storedSession));

        if (storedSession.supabaseTokens) {
          authLogger.log(STEP, `[${requestId}] Calling supabase.auth.setSession with stored tokens`);
          const { error: setErr } = await supabase.auth.setSession(storedSession.supabaseTokens);
          if (setErr) {
            authLogger.error(STEP, `[${requestId}] setSession failed`, setErr);
            console.error(`[${STEP}] [${requestId}] setSession error:`, setErr);
          } else {
            authLogger.success(STEP, `[${requestId}] Session restored from local storage`);
          }
        } else {
          authLogger.warn(STEP, `[${requestId}] Stored session lacks supabaseTokens`);
        }
        return;
      }

      console.error(`[${STEP}] [${requestId}] No credentials and no local session, throwing error`);
      throw new Error('No credentials provided and no local session found');
    }

    const backendUrl =
      process.env.EXPO_PUBLIC_API_URL ;

    console.log(`[${STEP}] [${requestId}] Backend URL:`, backendUrl);
    authLogger.log(STEP, `[${requestId}] Backend URL`, {
      backendUrl,
      phone,
    });

    const requestBody = {
      identifier: phone,
      password,
    };

    console.log(`[${STEP}] [${requestId}] Preparing fetch to ${backendUrl}/api/auth/login`);
    authLogger.log(STEP, `[${requestId}] Request body`, { ...requestBody, password: '***' });

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(requestBody),
      });
      console.log(`[${STEP}] [${requestId}] Fetch completed in ${Date.now() - start}ms`);
      authLogger.success(STEP, `[${requestId}] Response received in ${Date.now() - start}ms`);
    } catch (fetchError: any) {
      console.error(`[${STEP}] [${requestId}] Network error during fetch:`, fetchError);
      authLogger.error(STEP, `[${requestId}] Network fetch failed`, {
        message: fetchError?.message,
        stack: fetchError?.stack,
      });
      throw new Error(`Network request failed: ${fetchError.message}`);
    }

    console.log(`[${STEP}] [${requestId}] Response status:`, res.status, 'ok:', res.ok);
    authLogger.log(STEP, `[${requestId}] Response status`, {
      status: res.status,
      ok: res.ok,
    });

    let rawText: string;
    try {
      rawText = await res.text();
      authLogger.log(STEP, `[${requestId}] Raw response`, {
        length: rawText.length,
      });
    } catch (textError: any) {
      console.error(`[${STEP}] [${requestId}] Failed to read response text:`, textError);
      authLogger.error(STEP, `[${requestId}] response.text() failed`, textError);
      throw new Error('Unable to read server response');
    }

    let result: any;
    try {
      result = JSON.parse(rawText);
      console.log(`[${STEP}] [${requestId}] Parsed JSON keys:`, Object.keys(result || {}));
      authLogger.log(STEP, `[${requestId}] Parsed response`, result);
    } catch (jsonError: any) {
      console.error(`[${STEP}] [${requestId}] JSON parse error. Raw:`, rawText.substring(0, 200), jsonError);
      authLogger.error(STEP, `[${requestId}] JSON parse failed`, {
        raw: rawText.substring(0, 200),
        error: jsonError,
      });
      throw new Error('Backend returned invalid JSON');
    }

    console.log(`[${STEP}] [${requestId}] result.success:`, result?.success);
    if (!result?.success) {
      console.error(`[${STEP}] [${requestId}] Backend rejected login. Message:`, result?.message);
      authLogger.error(STEP, `[${requestId}] Backend rejected login`, result);
      throw new Error(result?.message || 'Phone login failed');
    }

    if (!result?.session) {
      console.error(`[${STEP}] [${requestId}] No session object in successful response`);
      authLogger.error(STEP, `[${requestId}] No session returned`);
      throw new Error('No session received');
    }

    const session = result.session;
    console.log(`[${STEP}] [${requestId}] session keys:`, Object.keys(session));
    authLogger.log(STEP, `[${requestId}] Setting Supabase session with tokens`);

    try {
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) {
        console.error(`[${STEP}] [${requestId}] supabase.auth.setSession error:`, error);
        authLogger.error(STEP, `[${requestId}] Supabase setSession failed`, error);
        throw error;
      }
      console.log(`[${STEP}] [${requestId}] Supabase session set successfully`);
      authLogger.success(STEP, `[${requestId}] Supabase session established`);
    } catch (sessionError: any) {
      console.error(`[${STEP}] [${requestId}] Exception during setSession:`, sessionError);
      authLogger.error(STEP, `[${requestId}] setSession exception`, sessionError);
      throw sessionError;
    }
  } catch (err: any) {
    console.error(`[${STEP}] [${requestId}] Fatal login error:`, {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    authLogger.error(STEP, `[${requestId}] Fatal login error`, {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    throw err;
  }
};

// ----------------------
// EMAIL LOGIN
// ----------------------
export const loginWithEmail = async (
  email: string,
  password: string
): Promise<void> => {
  const STEP = 'EMAIL_LOGIN';
  const requestId = Math.random().toString(36).substring(2, 10);
  console.log(`[${STEP}] [${requestId}] Attempting email login for:`, email);

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(`[${STEP}] [${requestId}] supabase signInWithPassword error:`, error);
      throw error;
    }
    console.log(`[${STEP}] [${requestId}] Sign-in triggered successfully`);
  } catch (err: any) {
    console.error(`[${STEP}] [${requestId}] Error:`, err.message || err);
    throw new Error(err.message || 'Email login failed');
  }
};

// ----------------------
// EMAIL SIGNUP
// ----------------------
export const signUpWithEmail = async (
  email: string,
  password: string,
  profile: RegistrationProfile
): Promise<void> => {
  const STEP = 'SIGNUP_EMAIL';
  const requestId = Math.random().toString(36).substring(2, 10);
  authLogger.log(STEP, `[${requestId}] Attempting signup for ${email}`);
  console.log(`[${STEP}] [${requestId}] signUpWithEmail started`, { email, profile });

  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      data: {
        full_name: profile.fullName,
        role: profile.role,
        whatsapp: profile.whatsappNumber,
        momo: profile.mobileMoney,
        age: profile.age,
        address: profile.address,
        preferred_language: profile.language || 'en'
      }
    }
  });

  if (error) {
    console.error(`[${STEP}] [${requestId}] Auth error:`, error);
    authLogger.error(STEP, `[${requestId}] Auth error: ${error.message}`);
    throw error;
  }
  if (!data.user) {
    console.error(`[${STEP}] [${requestId}] No user returned from signUp`);
    throw new Error('Signup failed. No user returned.');
  }

  console.log(`[${STEP}] [${requestId}] Auth user created:`, data.user.id);
  authLogger.success(STEP, `[${requestId}] Auth user created: ${data.user.id}. Trigger will handle DB record.`);

  syncProfileData(data.user.id, profile).catch((err: any) => {
    console.warn(`[${STEP}] [${requestId}] Enrichment sync deferred (non-fatal):`, err.message);
    authLogger.warn(STEP, `[${requestId}] Enrichment sync deferred (non-fatal): ${err.message}`);
  });

  authLogger.success(STEP, `[${requestId}] Signup complete. Navigating to verification screen.`);
};

// ----------------------
// PHONE SIGNUP
// ----------------------
export const signUpWithPhone = async (
  phone: string,
  password: string,
  profile: RegistrationProfile
): Promise<void> => {
  const STEP = 'SIGNUP_PHONE';
  const requestId = Math.random().toString(36).substring(2, 10);
  console.log(`[${STEP}] [${requestId}] Starting phone signup`, { phone, profile });

  try {
    const phoneWithPrefix = '+237' + phone.replace(/\D/g, '');
    console.log(`[${STEP}] [${requestId}] Formatted phone:`, phoneWithPrefix);
    
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phoneWithPrefix)
      .maybeSingle();

    if (existingUser) {
      console.warn(`[${STEP}] [${requestId}] Phone already exists:`, existingUser.id);
      throw new Error('An account with this phone number already exists.');
    }

    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    console.log(`[${STEP}] [${requestId}] API URL:`, apiUrl);
    const res = await fetch(`${apiUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone: phoneWithPrefix, 
        password,
        fullName: profile.fullName,
        role: profile.role
      }),
    });
    const result = await res.json();
    console.log(`[${STEP}] [${requestId}] Signup API response success:`, result?.success);

    if (!result?.success || !result.session) {
      console.error(`[${STEP}] [${requestId}] Signup API failure`, result);
      throw new Error(result?.message || 'Phone signup failed');
    }

    const { error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (error) {
      console.error(`[${STEP}] [${requestId}] setSession error:`, error);
      throw error;
    }

    await syncProfileData(result.session.user.id, profile);
    console.log(`[${STEP}] [${requestId}] Signup completed`);
  } catch (err: any) {
    console.error(`[${STEP}] [${requestId}] Error:`, err.message || err);
    throw new Error(err.message || 'Phone signup failed');
  }
};

// ----------------------
// DEEP LINK / OAUTH HANDOVER
// ----------------------
export const createSessionFromUrl = async (url: string) => {
  const STEP = 'DEEP_LINK';
  const requestId = Math.random().toString(36).substring(2, 10);

  try {
    const parsed = new URL(url);
    let access_token = parsed.hash
      ? new URLSearchParams(parsed.hash.substring(1)).get('access_token')
      : null;
    let refresh_token = parsed.hash
      ? new URLSearchParams(parsed.hash.substring(1)).get('refresh_token')
      : null;
    let code = parsed.hash
      ? new URLSearchParams(parsed.hash.substring(1)).get('code')
      : null;
    let error = parsed.hash
      ? new URLSearchParams(parsed.hash.substring(1)).get('error')
      : null;
    let error_description = parsed.hash
      ? new URLSearchParams(parsed.hash.substring(1)).get('error_description')
      : null;

    if (!access_token && !refresh_token && !code) {
      access_token = parsed.searchParams.get('access_token');
      refresh_token = parsed.searchParams.get('refresh_token');
      code = parsed.searchParams.get('code');
      error = parsed.searchParams.get('error');
      error_description = parsed.searchParams.get('error_description');
    }

    if (error || error_description) {
      const msg = error_description || error || 'Authentication failed';
      console.error(`[${STEP}] Error:`, msg);
      throw new Error(msg);
    }

    if (code) {
      console.log(`[${STEP}] Exchanging code for session...`);
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      return data.session;
    }

    if (access_token && refresh_token) {
      console.log(`[${STEP}] Setting session from tokens...`);
      const { data, error: setError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (setError) throw setError;
      return data.session;
    }

    console.log(`[${STEP}] No auth tokens found in URL.`);
    return null;
  } catch (err: any) {
    console.error(`[${STEP}] Error:`, err.message);
    throw err;
  }
};

// ----------------------
// SYNC PROFILE DATA
// ----------------------
export const syncProfileData = async (userId: string, profile: any) => {
  const STEP = 'SYNC_PROFILE';
  const requestId = Math.random().toString(36).substring(2, 10);
  authLogger.log(STEP, `[${requestId}] 🔄 Starting Master Sync for user: ${userId}`);
  console.log(`[${STEP}] [${requestId}] Starting syncProfileData for user:`, userId, 'profile:', profile);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn(`[${STEP}] [${requestId}] No active session found. Sync deferred.`);
      authLogger.warn(STEP, `[${requestId}] No active session found. Sync deferred.`);
      return;
    }

    authLogger.log(STEP, `[${requestId}] Step 1/3: Syncing Auth Metadata...`);
    console.log(`[${STEP}] [${requestId}] Updating auth metadata with:`, {
      full_name: profile.fullName,
      role: profile.role,
      whatsapp: profile.whatsappNumber,
      momo: profile.mobileMoney,
      age: profile.age,
      address: profile.address,
      preferred_language: profile.language || 'en'
    });
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        full_name: profile.fullName,
        role: profile.role,
        whatsapp: profile.whatsappNumber,
        momo: profile.mobileMoney,
        age: profile.age,
        address: profile.address,
        preferred_language: profile.language || 'en'
      }
    });

    if (metaError) {
      console.error(`[${STEP}] [${requestId}] Metadata sync warning:`, metaError.message);
      authLogger.warn(STEP, `[${requestId}] Metadata sync warning: ${metaError.message}`);
      if (metaError.message.includes('sub claim') || metaError.message.includes('does not exist')) {
        authLogger.error(STEP, `[${requestId}] GHOST SESSION DETECTED - FORCING LOGOUT`);
        throw new Error('SESSION_EXPIRED');
      }
    } else {
      console.log(`[${STEP}] [${requestId}] Auth Metadata synced successfully.`);
      authLogger.success(STEP, `[${requestId}] Auth Metadata synced.`);
    }

    authLogger.log(STEP, `[${requestId}] Step 2/3: Upserting record into public.users...`);
    console.log(`[${STEP}] [${requestId}] Upserting public.users with:`, { id: userId, full_name: profile.fullName, phone: profile.whatsappNumber, momo: profile.mobileMoney });
    const upsertUser = async () => {
      const { error } = await supabase
        .from('users')
        .upsert({
          id: userId,
          full_name: profile.fullName,
          phone: profile.whatsappNumber || null,
          momo: profile.mobileMoney || null,
          preferred_language: profile.language || 'en',
          is_active: true,
        }, { onConflict: 'id' });
      if (error) throw error;
    };

    try {
      await Promise.race([
        upsertUser(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('USERS_TABLE_TIMEOUT')), 5000))
      ]);
      console.log(`[${STEP}] [${requestId}] Public user record upserted successfully.`);
      authLogger.success(STEP, `[${requestId}] Public user record synced.`);
    } catch (err: any) {
      console.error(`[${STEP}] [${requestId}] Public user upsert failed or timed out:`, err.message);
      authLogger.error(STEP, `[${requestId}] Public user upsert failed or timed out: ${err.message}`);
    }

    authLogger.log(STEP, `[${requestId}] Step 3/3: Syncing ${profile.role} specific data...`);
    console.log(`[${STEP}] [${requestId}] Syncing sub-profiles for role:`, profile.role);
    const syncSubProfile = async () => {
      const { data: roleData } = await supabase.from('roles').select('id').eq('name', profile.role.toLowerCase()).single();
      if (roleData) {
        await supabase.from('user_roles').upsert({ user_id: userId, role_id: roleData.id }, { onConflict: 'user_id, role_id' });
      }
      
      if (profile.role === 'student') {
        await supabase.from('student_profiles').upsert({ user_id: userId, contact_number: profile.whatsappNumber }, { onConflict: 'user_id' });
      } else if (profile.role === 'landlord') {
        await supabase.from('landlord_profiles').upsert({ user_id: userId, address: profile.address || '', age: profile.age ? parseInt(profile.age) : null }, { onConflict: 'user_id' });
      }
    };

    try {
      await Promise.race([
        syncSubProfile(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SUB_PROFILE_TIMEOUT')), 5000))
      ]);
      console.log(`[${STEP}] [${requestId}] Sub-profiles synced.`);
      authLogger.success(STEP, `[${requestId}] Secondary sub-profiles synced.`);
    } catch (err: any) {
      console.warn(`[${STEP}] [${requestId}] Secondary sync warning (non-fatal):`, err.message);
      authLogger.warn(STEP, `[${requestId}] Secondary sync warning (non-fatal): ${err.message}`);
    }

    console.log(`[${STEP}] [${requestId}] 🏁 MASTER SYNC FINISHED.`);
    authLogger.success(STEP, `[${requestId}] 🏁 MASTER SYNC FINISHED.`);
  } catch (err: any) {
    if (err.message === 'SESSION_EXPIRED') throw err;
    console.error(`[${STEP}] [${requestId}] Sync process hit a fatal error:`, err.message);
    authLogger.error(STEP, `[${requestId}] Sync process hit a fatal error: ${err.message}`);
    throw err;
  }
};

// ============================================================
// ✅ CORRECTED loginWithGoogle – using official Supabase OAuth flow
// ============================================================
export const loginWithGoogle = async () => {
  try {
    const redirectTo = makeRedirectUri({
      path: 'auth/callback',
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'consent select_account' },
        // PKCE is automatically used when flowType: 'pkce' is set in client
      },
    });

    if (error) {
      console.error('Supabase signInWithOAuth error:', error);
      throw error;
    }

    if (Platform.OS === 'web') {
      // Full-page redirect to Google
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No OAuth URL returned');
      }
    } else {
      // Native: open in browser
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        await createSessionFromUrl(result.url);
      } else {
        throw new Error('Sign-in was cancelled.');
      }
    }
  } catch (err) {
    console.error('Google login error:', err);
    throw err;
  }
};

// ----------------------
// LOGOUT
// ----------------------
export const logout = async () => {
  const STEP = 'LOGOUT';
  const requestId = Math.random().toString(36).substring(2, 10);
  try {
    console.log(`[${STEP}] [${requestId}] Initiating sign-out...`);
    await supabase.auth.signOut();
    await clearLocalSession();
    await AsyncStorage.removeItem('localSession');
    await AsyncStorage.removeItem('pending_profile');
    console.log(`[${STEP}] [${requestId}] Logout complete.`);
  } catch (err) {
    console.error(`[${STEP}] [${requestId}] Logout error:`, err);
  }
};

export default {
  loginWithPhone,
  loginWithEmail,
  signUpWithEmail,
  signUpWithPhone,
  createSessionFromUrl,
  syncProfileData,
  loginWithGoogle,
  logout,
};