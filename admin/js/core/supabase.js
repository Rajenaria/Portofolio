import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

import { authStorage } from "./auth-storage.js";

const { createClient } = window.supabase;

export const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      /*
        Session storage is routed through the "remember me" adapter:
        localStorage when the owner asked to stay signed in on this device,
        sessionStorage when they did not. One client, so MFA verification
        and token refresh always act on the same session.
      */
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);