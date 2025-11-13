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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Supabase URL and Anon Key must be provided in environment variables.");
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);