import { supabaseClient } from "./supabase.js";
import { OWNER_USER_ID } from "./config.js";
import {
  setPersistenceMode,
  clearStoredSession,
  PERSIST_LOCAL,
  PERSIST_SESSION
} from "./auth-storage.js";

/*
  `remember` only decides where the session is kept afterwards. It is
  applied BEFORE the request so the first token write already lands in the
  chosen store, and it grants no privilege of its own: MFA and the
  owner+aal2 policies are unchanged either way.
*/
export async function signIn(email, password, remember) {
  setPersistenceMode(remember ? PERSIST_LOCAL : PERSIST_SESSION);

  return await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
}

export async function signOut() {
  const result = await supabaseClient.auth.signOut();

  /* Belt and braces: clear both stores so a "remember me" copy can never
     outlive a deliberate sign out. */
  clearStoredSession();

  return result;
}

export async function getVerifiedUser() {
  const {
    data: { user },
    error
  } = await supabaseClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getAAL() {
  return await supabaseClient.auth.mfa
    .getAuthenticatorAssuranceLevel();
}

export async function listFactors() {
  return await supabaseClient.auth.mfa.listFactors();
}

export async function enrollTotp() {
  return await supabaseClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Portfolio Admin"
  });
}

export async function verifyFactor(
  factorId,
  code
) {
  const challenge =
    await supabaseClient.auth.mfa.challenge({
      factorId
    });

  if (challenge.error) {
    return {
      data: null,
      error: challenge.error
    };
  }

  return await supabaseClient.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code
  });
}

export function isOwner(user) {
  return Boolean(
    user &&
    user.id === OWNER_USER_ID
  );
}