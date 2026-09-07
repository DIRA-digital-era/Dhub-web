// src/hooks/useAppDownloadFlag.ts
// Reads the `app_download_enabled` feature flag from Supabase.
// Returns true (show download buttons) by default while loading,
// so the banner/prompt never flashes away on initial render.

import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export function useAppDownloadFlag(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(true); // default to true (show) while loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'app_download_enabled')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.warn('[useAppDownloadFlag] Error fetching flag:', error.message);
          // On error, default to showing the download links
          setEnabled(true);
        } else if (data) {
          setEnabled(!!data.enabled);
        } else {
          // Flag row not found — default to showing download links
          setEnabled(true);
        }
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  return { enabled, loading };
}
