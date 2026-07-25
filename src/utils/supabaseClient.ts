// src/lib/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';
import { storage } from './storage';


const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

console.log("[Supabase] Initializing client...", { 
  hasUrl: !!supabaseUrl, 
  hasKey: !!supabaseKey 
});

if (!supabaseUrl || !supabaseKey) {
  console.error("[Supabase] CRITICAL: Missing environment variables!");
  // In release, we don't want a silent failure that crashes later
  // We throw a clear error here that our App-level catch can see
  throw new Error(
    'Missing Supabase environment variables. Check eas.json or app.config.js.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: storage, // ✅ Platform-specific storage
  },
});
