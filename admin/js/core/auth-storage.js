/*
  "Remember me" session persistence.

  WHAT THIS IS NOT
  ----------------
  It is not a trusted-device flag and it does not skip MFA. There is no
  client-side claim that grants anything: every write is still gated by
  app_private.is_owner_admin_aal2() inside the RLS policies, so a browser
  that says "remember me" and a browser that does not have exactly the same
  privileges. A new device always goes through password + MFA.

  All this decides is WHERE supabase-js keeps the session it already earned:

      Remember ON   ->  localStorage    survives closing the browser
      Remember OFF  ->  sessionStorage  dies with the tab/session

  Nothing else is stored. No password, no TOTP secret, no verification code —
  only the session material supabase-js manages, under its own key.

  WHY AN ADAPTER RATHER THAN TWO CLIENTS
  --------------------------------------
  supabase-js accepts a custom `storage`. Routing one client through this
  object keeps a single auth instance, so MFA verification, token refresh and
  sign-out all act on the same session — two clients would drift apart and
  the AAL2 upgrade could land in the store the app is not reading.

  MIGRATION SAFETY
  ----------------
  Before this existed, sessions lived in localStorage. The default mode is
  therefore "local", so an owner who is already signed in stays signed in
  when this ships. Nobody is logged out by the upgrade.
*/

const MODE_KEY = "portfolio-admin.persist";

export const PERSIST_LOCAL = "local";
export const PERSIST_SESSION = "session";

function safeStore(getter) {
  try {
    const store = getter();
    // Private modes expose the object but throw on write; probe once.
    const probe = "__portfolio_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch (error) {
    return null;
  }
}

const local = safeStore(() => window.localStorage);
const session = safeStore(() => window.sessionStorage);

/*
  Defaults to "local" so an existing signed-in owner is not signed out the
  first time this code runs. Any explicit choice at the login screen
  overwrites it.
*/
export function getPersistenceMode() {
  try {
    const saved = local && local.getItem(MODE_KEY);
    return saved === PERSIST_SESSION ? PERSIST_SESSION : PERSIST_LOCAL;
  } catch (error) {
    return PERSIST_LOCAL;
  }
}

function activeStore() {
  const mode = getPersistenceMode();
  const preferred = mode === PERSIST_SESSION ? session : local;
  return preferred || local || session || null;
}

function otherStore() {
  const mode = getPersistenceMode();
  const other = mode === PERSIST_SESSION ? local : session;
  return other || null;
}

/*
  Called from the login screen BEFORE signInWithPassword, so the very first
  token write already lands in the right place.

  Switching to session-only also purges any localStorage session left by a
  previous "remember me" sign-in. Without that purge the old copy would still
  be there when the browser reopens, which is exactly what unchecking the box
  is meant to prevent.
*/
export function setPersistenceMode(mode) {
  const next = mode === PERSIST_SESSION ? PERSIST_SESSION : PERSIST_LOCAL;

  try {
    if (local) {
      local.setItem(MODE_KEY, next);
    }
  } catch (error) {
    // Preference cannot be stored; the adapter still routes correctly for
    // this page load.
  }

  if (next === PERSIST_SESSION) {
    purge(local);
  } else {
    purge(session);
  }
}

/* Supabase keys look like "sb-<ref>-auth-token"; the mode key is ours. */
function isSessionKey(key) {
  return typeof key === "string" && key.startsWith("sb-");
}

function purge(store) {
  if (!store) {
    return;
  }

  try {
    const keys = [];

    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);

      if (isSessionKey(key)) {
        keys.push(key);
      }
    }

    keys.forEach(key => store.removeItem(key));
  } catch (error) {
    // Nothing to do: a store we cannot read is also one we cannot leak from.
  }
}

/* Clears the session from BOTH stores. Used on sign out, so "remember me"
   can never resurrect a session the owner deliberately ended. */
export function clearStoredSession() {
  purge(local);
  purge(session);
}

/*
  The object handed to supabase-js.

  getItem falls back to the other store on a miss so a session written before
  a mode change is still found rather than silently dropped mid-visit.
  setPersistenceMode() has already purged the store that must not survive, so
  this fallback cannot resurrect a session the owner opted out of.
*/
export const authStorage = {

  getItem(key) {
    try {
      const active = activeStore();
      const value = active ? active.getItem(key) : null;

      if (value !== null && value !== undefined) {
        return value;
      }

      const other = otherStore();
      return other ? other.getItem(key) : null;
    } catch (error) {
      return null;
    }
  },

  setItem(key, value) {
    try {
      const active = activeStore();

      if (active) {
        active.setItem(key, value);
      }

      /* One session, one home. Removing it from the other store stops a
         stale copy outliving the current choice. */
      const other = otherStore();

      if (other && isSessionKey(key)) {
        other.removeItem(key);
      }
    } catch (error) {
      // A failed write means the session is not persisted; the owner stays
      // signed in for this page load and signs in again later.
    }
  },

  removeItem(key) {
    try {
      if (local) {
        local.removeItem(key);
      }

      if (session) {
        session.removeItem(key);
      }
    } catch (error) {
      // Ignored deliberately.
    }
  }

};
