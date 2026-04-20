// src/utils/login.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../utils/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { createLocalSession, getLocalSession } from '../utils/localSession';

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

// ----------------------
// PHONE LOGIN
// ----------------------
export const loginWithPhone = async (
  phone?: string,
  password?: string
): Promise<{ user: SimpleUserProfile }> => {
  try {
    // ------------------ Use stored session if no credentials ------------------
    if ((!phone || !password)) {
      const storedSession = await getLocalSession();
      if (storedSession) {
        if (storedSession.supabaseTokens) {
          await supabase.auth.setSession(storedSession.supabaseTokens);
        }
        console.log('[loginWithPhone] Using stored local session');
        return { user: storedSession };
      }
      throw new Error('No credentials provided and no local session found');
    }

    console.log('[loginWithPhone] Logging in with phone:', phone);

    // ------------------ Backend login ------------------
    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ identifier: phone, password }),
    });
    const result = await res.json();
    // console.log('[loginWithPhone] Backend response:', JSON.stringify(result, null, 2));

    if (!result?.success || !result.user) throw new Error(result?.message || 'Phone login failed');

    const u = result.user;
    const session = result.session;

    const user: SimpleUserProfile = {
      id: u.id,
      fullName: u.fullName || u.full_name || '',
      email: u.email || '',
      phone: u.phone || phone,
      momo: u.momo || null,
      preferred_language: u.preferredLanguage || u.preferred_language || 'en',
      profile_pic: u.profilePic || u.profile_pic || null,
      role: u.role || 'student',
    };

    // ------------------ Set Supabase session ------------------
    if (session?.access_token && session?.refresh_token) {
      try {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        console.log('[loginWithPhone] Supabase session set');
      } catch (err) {
        console.warn('[loginWithPhone] Failed to set Supabase session:', err);
      }
    }

    // ------------------ Save local session ------------------
    await createLocalSession(user, session ? {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    } : undefined);
    console.log('[loginWithPhone] Local session saved');

    return { user };
  } catch (err: any) {
    console.error('[loginWithPhone] Error:', err.message || err);
    throw new Error(err.message || 'Phone login failed');
  }
};

// ----------------------
// EMAIL LOGIN
// ----------------------
export const loginWithEmail = async (
  email: string,
  password: string
): Promise<{ user: SimpleUserProfile }> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) throw new Error(error?.message || 'Email login failed');

    const session = data.session;
    const userData = data.user;

    const user: SimpleUserProfile = {
      id: userData.id,
      fullName: userData.user_metadata?.full_name || '',
      email: userData.email || email,
      phone: userData.phone || '',
      role: userData.user_metadata?.role || 'student',
      preferred_language: userData.user_metadata?.preferred_language || 'en',
      profile_pic: userData.user_metadata?.profile_pic || null,
    };

    // ------------------ Set Supabase session ------------------
    if (session?.access_token && session?.refresh_token) {
      try {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        console.log('[loginWithEmail] Supabase session set');
      } catch (err) {
        console.warn('[loginWithEmail] Failed to set Supabase session:', err);
      }
    }

    // ------------------ Save local session ------------------
    await createLocalSession(user, session ? {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    } : undefined);
    console.log('[loginWithEmail] Local session saved');

    return { user };
  } catch (err: any) {
    console.error('[loginWithEmail] Error:', err.message || err);
    throw new Error(err.message || 'Email login failed');
  }
};

// ----------------------
// GOOGLE LOGIN
// ----------------------

/**
 * Extracts tokens or code from the URL and initializes the Supabase session.
 */
export const createSessionFromUrl = async (url: string) => {
  const parsed = Linking.parse(url);
  let { code, access_token, refresh_token } = (parsed.queryParams || {}) as any;

  // FALLBACK: Manual parsing for hash fragments (#access_token=...) 
  // which common in some OAuth flows and Expo Go environments
  if (!code && !access_token && url.includes('#')) {
    const hash = url.split('#')[1];
    const parts = hash.split('&');
    parts.forEach(part => {
      const [key, value] = part.split('=');
      if (key === 'access_token') access_token = value;
      if (key === 'refresh_token') refresh_token = value;
      if (key === 'code') code = value;
    });
  }

  const getParam = (p: string | string[] | undefined | null) => {
    if (Array.isArray(p)) return p[0];
    return p || undefined;
  };

  const codeStr = getParam(code);
  const atStr = getParam(access_token);
  const rtStr = getParam(refresh_token);

  // console.log('[createSessionFromUrl] Parsed parameters:', { hasCode: !!codeStr, hasAccessToken: !!atStr });
  
  let session: Session | null = null;

  if (codeStr) {
    console.log('[createSessionFromUrl] Exchanging code for session...');
    const { data, error } = await supabase.auth.exchangeCodeForSession(codeStr);
    if (error) {
       console.error('[createSessionFromUrl] Exchange error:', error.message);
       throw error;
    }
    session = data.session;
    console.log('[createSessionFromUrl] Exchange success!');
  } else if (atStr && rtStr) {
    console.log('[createSessionFromUrl] Setting session from access token...');
    const { data, error } = await supabase.auth.setSession({
      access_token: atStr,
      refresh_token: rtStr,
    });
    if (error) {
       console.error('[createSessionFromUrl] setSession error:', error.message);
       throw error;
    }
    session = data.session;
    console.log('[createSessionFromUrl] setSession success!');
  } else {
    console.warn('[createSessionFromUrl] No code or tokens found in URL.');
  }

  if (session?.user) {
    // 1. Check for pending profile data from signup
    const pendingJson = await AsyncStorage.getItem('pending_profile');
    
    // 2. Check if user exists in the public.users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle(); 
    
    if (dbError) {
      console.error('[createSessionFromUrl] DB check error:', dbError.message);
    }

    // 🔴 POLICY ENFORCEMENT: 
    // If no DB record exists AND we are NOT in a SignUp flow (no pending profile), 
    // we must block access and tell them to sign up first.
    if (!dbUser && !pendingJson) {
      console.warn('[createSessionFromUrl] No account found and no pending signup. Blocking access.');
      await supabase.auth.signOut();
      throw new Error('ACCOUNT_NOT_FOUND');
    }

    if (pendingJson) {
      try {
        const profileData = JSON.parse(pendingJson);
        console.log('[createSessionFromUrl] Found pending profile, syncing...');
        await syncProfileData(session.user.id, profileData);
        await AsyncStorage.removeItem('pending_profile');
      } catch (e: any) {
        console.warn('[createSessionFromUrl] Failed to sync pending profile:', e.message || e);
        // If it was a duplicate phone error, pass it up to the UI
        if (e.message === 'PHONE_ALREADY_EXISTS') throw e;
      }
    }
  }

  return session;
};

/**
 * Interface for the profile data collected during signup.
 */
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

/**
 * Syncs the extra profile data (role, whatsapp, etc.) to the Supabase users table.
 */
export const syncProfileData = async (userId: string, profile: RegistrationProfile) => {
  console.log('[syncProfileData] Syncing user profile...');
  
  // 1. Update Supabase Auth metadata (used for quick UI access like user.role)
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

  if (metaError) console.warn('[syncProfileData] User metadata update error:', metaError.message);

  // 2. Conflict Check for Phone/Email before creating public record
  if (profile.whatsappNumber) {
    const phoneToSync = '+237' + profile.whatsappNumber;
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phoneToSync)
      .maybeSingle();
      
    if (existingUser && existingUser.id !== userId) {
      throw new Error('PHONE_ALREADY_EXISTS');
    }
  }

  // 3. Upsert into public.users table (Removed 'role' column to match schema)
  const { error: dbError } = await supabase
    .from('users')
    .upsert({
      id: userId,
      full_name: profile.fullName,
      email: profile.email || '',
      phone: profile.whatsappNumber ? ('+237' + profile.whatsappNumber) : null,
      momo: profile.mobileMoney || '',
      preferred_language: profile.language || 'en',
      profile_pic: profile.profile_pic || null
    }, { onConflict: 'id' });

  if (dbError) {
    console.error('[syncProfileData] DB users upsert error:', dbError.message);
    throw new Error('Failed to create user record.');
  }

  // 4. Assign Role in public.user_roles table
  try {
    const { data: roleData, error: roleFetchError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', profile.role.toLowerCase())
      .single();

    if (roleFetchError) {
      console.warn('[syncProfileData] Error fetching role ID:', roleFetchError.message);
    } else if (roleData) {
      await supabase
        .from('user_roles')
        .upsert({
          user_id: userId,
          role_id: roleData.id
        }, { onConflict: 'user_id, role_id' });
    }
  } catch (err) {
    console.warn('[syncProfileData] Failed to handle user_roles sync:', err);
  }

  // 5. Create Specific Profile (student/landlord)
  try {
    if (profile.role === 'student') {
      await supabase
        .from('student_profiles')
        .upsert({
          user_id: userId,
          contact_number: profile.whatsappNumber,
        }, { onConflict: 'user_id' });
    } else if (profile.role === 'landlord') {
      await supabase
        .from('landlord_profiles')
        .upsert({
          user_id: userId,
          address: profile.address || '',
          age: profile.age ? parseInt(profile.age) : null,
        }, { onConflict: 'user_id' });
    }
  } catch (err) {
    console.warn('[syncProfileData] Failed to create specific profile:', err);
  }
};

export const loginWithGoogle = async () => {
  try {
    const redirectTo = Linking.createURL('auth/callback');
    console.log('[loginWithGoogle] Redirect URL:', redirectTo);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;

    // Use WebBrowser to handle the OAuth flow in a secure modal
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      console.log('[loginWithGoogle] Browser success, tokens received.');
      const session = await createSessionFromUrl(result.url);
      if (session) {
        console.log('[loginWithGoogle] Google sign-in completed successfully!');
      } else {
        console.warn('[loginWithGoogle] No session created, check URL parsing.');
      }
    } else {
      console.log('[loginWithGoogle] Browser result:', result.type);
    }
  } catch (err: any) {
    console.error('[loginWithGoogle] Error:', err.message || err);
    throw new Error(err.message || 'Google login failed');
  }
};

// ----------------------
// LOGOUT
// ----------------------
export const logout = async () => {
  try {
    try { await supabase.auth.signOut(); } catch {}
    await createLocalSession(null as any);
    await AsyncStorage.removeItem('localSession');
    console.log('[logout] Supabase and local session cleared');
  } catch (err) {
    console.error('[logout] Error:', err);
  }
};
