// src/hooks/useAuth.ts
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { signOut as signOutThunk } from '../store/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);

  // Hydration is purely driven by AuthListener now (Hydration Lock)

  const signOut = async () => {
    try {
      await dispatch(signOutThunk()).unwrap();
      console.log('[useAuth] Sign out successful');
    } catch (err) {
      console.error('[useAuth] Sign out failed:', err);
      throw err;
    }
  };

  return {
    user: auth.user,
    token: auth.token,
    isLoading: auth.isLoading,
    error: auth.error,
    signOut, // <-- newly added
  };
};
