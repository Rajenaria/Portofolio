import { supabaseClient } from "./supabase.js";
import { OWNER_USER_ID } from "./config.js";

export async function signIn(email, password) {
  return await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
}

export async function signOut() {
  return await supabaseClient.auth.signOut();
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