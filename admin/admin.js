import {
  signIn,
  signOut,
  getVerifiedUser,
  getAAL,
  listFactors,
  enrollTotp,
  verifyFactor,
  isOwner,
  supabaseClient,
} from "./js/core/auth.js";


const screens = {
  loading:
    document.getElementById("loading-screen"),

  login:
    document.getElementById("login-screen"),

  enroll:
    document.getElementById("mfa-enroll-screen"),

  challenge:
    document.getElementById("mfa-challenge-screen"),

  admin:
    document.getElementById("admin-screen")
};

let enrollmentFactorId = null;

function showScreen(name) {
  Object.values(screens).forEach(
    screen => screen.hidden = true
  );

  screens[name].hidden = false;
}
async function routeSession() {

  showScreen("loading");

  const user =
    await getVerifiedUser();

  if (!user) {
    showScreen("login");
    return;
  }

  if (!isOwner(user)) {
    await signOut();
    showScreen("login");
    return;
  }

  const {
    data: aal,
    error
  } = await getAAL();

  if (error) {
    console.error(error);
    showScreen("login");
    return;
  }

  if (
    aal.currentLevel === "aal2" &&
    aal.nextLevel === "aal2"
  ) {
    showScreen("admin");
    return;
  }

  if (
    aal.currentLevel === "aal1" &&
    aal.nextLevel === "aal2"
  ) {
    showScreen("challenge");
    return;
  }

  if (
    aal.currentLevel === "aal1" &&
    aal.nextLevel === "aal1"
  ) {
    await startEnrollment();
    return;
  }

  await signOut();
  showScreen("login");
}
async function startEnrollment() {

  const {
    data,
    error
  } = await enrollTotp();

  if (error) {
    console.error(error);
    showScreen("login");
    return;
  }

  enrollmentFactorId = data.id;

  document.getElementById(
    "mfa-qr"
  ).src = data.totp.qr_code;

  document.getElementById(
    "mfa-secret"
  ).textContent = data.totp.secret;

  showScreen("enroll");
}
document
  .getElementById("mfa-enable-button")
  .addEventListener(
    "click",
    async () => {

      const code =
        document
          .getElementById(
            "mfa-enroll-code"
          )
          .value
          .trim();

      const result =
        await verifyFactor(
          enrollmentFactorId,
          code
        );

      if (result.error) {

        document
          .getElementById(
            "mfa-enroll-error"
          )
          .textContent =
            "Invalid verification code.";

        return;
      }

      await routeSession();
    }
  );
  async function verifyExistingMFA(code) {

  const factors =
    await listFactors();

  if (factors.error) {
    return {
      error: factors.error
    };
  }

  const factor =
    factors.data.totp?.[0];

  if (!factor) {
    return {
      error:
        new Error(
          "No TOTP factor found."
        )
    };
  }

  return await verifyFactor(
    factor.id,
    code
  );
}
document
  .getElementById("mfa-submit-button")
  .addEventListener(
    "click",
    async () => {

      const code =
        document
          .getElementById("mfa-code")
          .value
          .trim();

      const result =
        await verifyExistingMFA(code);

      if (result.error) {

        document
          .getElementById("mfa-error")
          .textContent =
            "Invalid authentication code.";

        return;
      }

      await routeSession();
    }
  );
  document
  .getElementById("login-form")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const email =
        document
          .getElementById("email")
          .value
          .trim();

      const password =
        document
          .getElementById("password")
          .value;

      const {
        error
      } = await signIn(
        email,
        password
      );

      if (error) {

        document
          .getElementById(
            "login-error"
          )
          .textContent =
            "Invalid email or password.";

        return;
      }

      await routeSession();
    }
  );
  document
  .getElementById("logout-button")
  .addEventListener(
    "click",
    async () => {

      await signOut();

      showScreen("login");
    }
  );
  supabaseClient.auth.onAuthStateChange(
  (event) => {

    if (event === "SIGNED_OUT") {
      showScreen("login");
      return;
    }

    if (event === "TOKEN_REFRESHED") {
      setTimeout(() => {
        routeSession();
      }, 0);
    }
  }
);
  await routeSession();