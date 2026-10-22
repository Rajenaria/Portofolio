import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  OWNER_USER_ID,
  environmentStatus
} from "./config.js";

import { authStorage } from "./auth-storage.js";

const { createClient } = window.supabase;

// Do not instantiate Auth (including session refresh) for missing/mismatched input.
let checked = environmentStatus;
try {
  if (checked.ok) globalThis.PortfolioEnvironment.requireEnvironment({
    url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY, owner: OWNER_USER_ID
  });
} catch {
  checked = Object.freeze({ ok: false, message: globalThis.PortfolioEnvironment.message });
}
export const configurationStatus = checked;
export const supabaseClient = configurationStatus.ok ? createClient(
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
) : null;
