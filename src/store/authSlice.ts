// src/store/authSlice.ts
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { clearLocalSession, createLocalSession, getLocalSession } from '../utils/localSession';
import { supabase } from '../utils/supabaseClient';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'student' | 'landlord' | 'admin';
  phone?: string;
  token: string | null;
  refreshToken: string | null;
  supabaseTokens?: { access_token: string; refresh_token: string };
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isLoading: false,
  isHydrated: false,
  error: null,
};

// -------------------------
// EMAIL SIGN IN
// -------------------------
export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.user || !data?.session) throw new Error('Login failed');

      const user: User = {
        id: data.user.id,
        fullName: data.user.user_metadata?.full_name || data.user.email || 'User',
        email: data.user.email || '',
        role: (data.user.user_metadata?.role || 'student') as 'student' | 'landlord' | 'admin',
        phone: data.user.phone || data.user.user_metadata?.phone || '',
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        supabaseTokens: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
      };

      await createLocalSession(user, user.supabaseTokens);
      return { user, token: user.token, refreshToken: user.refreshToken };
    } catch (err: any) {
      console.error('[signIn] Failed:', err.message || err);
      return rejectWithValue(err.message || 'Login failed');
    }
  }
);

// -------------------------
// PHONE SIGN IN
// -------------------------
export const phoneSignIn = createAsyncThunk(
  'auth/phoneSignIn',
  async ({ phone, password }: { phone: string; password: string }, { rejectWithValue }) => {
    try {
      const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: phone, password }),
      });
      const result = await response.json();

      if (!result.success || !result.user) throw new Error(result.message || 'Phone login failed');

      const supTokens = result.session
        ? { access_token: result.session.access_token, refresh_token: result.session.refresh_token }
        : undefined;

      const user: User = {
        id: result.user.id,
        fullName: result.user.fullName || result.user.full_name || '',
        email: result.user.email || '',
        role: (result.user.role || 'student') as 'student' | 'landlord' | 'admin',
        phone: result.user.phone || phone,
        token: supTokens?.access_token || null,
        refreshToken: supTokens?.refresh_token || null,
        supabaseTokens: supTokens,
      };

      // Save local session
      await createLocalSession(user, supTokens);

      // Sync Supabase session if available
      if (supTokens) await supabase.auth.setSession(supTokens);

      return { user, token: user.token, refreshToken: user.refreshToken };
    } catch (err: any) {
      console.error('[phoneSignIn] Failed:', err.message || err);
      return rejectWithValue(err.message || 'Phone login failed');
    }
  }
);

// -------------------------
// SIGN OUT
// -------------------------
export const signOut = createAsyncThunk('auth/signOut', async (_, { rejectWithValue }) => {
  try {
    await supabase.auth.signOut();
    await clearLocalSession();
    return null;
  } catch (err: any) {
    console.error('[signOut] Failed:', err.message || err);
    return rejectWithValue(err.message || 'Logout failed');
  }
});

// -------------------------
// SLICE
// -------------------------
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.isHydrated = true;
      state.error = null;
      console.log('🟣 [authSlice] setUser called:', {
        id: action.payload.id,
        hasToken: !!action.payload.token,
      });
    },
    setHydrated(state) {
      state.isHydrated = true;
    },
    clearUser(state) {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.error = null;
      state.isHydrated = true;
    },
    clearError(state) {
      state.error = null;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Email sign in
      .addCase(signIn.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(signIn.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.isHydrated = true;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isHydrated = true;
      })

      // Phone sign in
      .addCase(phoneSignIn.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(phoneSignIn.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.isHydrated = true;
      })
      .addCase(phoneSignIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isHydrated = true;
      })

      // Sign out
      .addCase(signOut.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.isHydrated = true;
        state.error = null;
      });
  },
});

export const { setUser, setHydrated, clearUser, clearError, setError } = authSlice.actions;
export default authSlice.reducer;