// ARCHITECTURE NOTE:
// This Supabase client is configured for client-side operations.
// As per our security architecture, direct database queries (e.g., supabase.from(...))
// are prohibited from the frontend. All database interactions must be routed through
// secure, server-side Supabase Edge Functions.
//
// You can, however, use this client for:
// - Authentication (supabase.auth)
// - Invoking Edge Functions (supabase.functions.invoke)
// - Interacting with Storage (supabase.storage)

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Supabase URL and Anon Key must be provided in environment variables.");
}

/**
 * Auth persistence is explicitly enabled.
 * Do not disable persistSession / autoRefreshToken — Edge Function invokes
 * depend on a recoverable user JWT (never the anon key as Authorization).
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export type { Database };
