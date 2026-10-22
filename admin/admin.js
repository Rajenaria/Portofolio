import {
  signIn,
  signOut,
  getVerifiedUser,
  getAAL,
  listFactors,
  enrollTotp,
  verifyFactor,
  isOwner
} from "./js/core/auth.js";

import {
  supabaseClient
} from "./js/core/supabase.js";

import {
  initShell
} from "./js/core/shell.js";

import {
  createRouter
} from "./js/core/router.js";

import {
  dashboardRoute
} from "./js/modules/dashboard.js";

import {
  projectsRoute
} from "./js/modules/projects/index.js";

import {
  experienceRoute
} from "./js/modules/experience/index.js";

import {
  certificatesRoute
} from "./js/modules/certificates/index.js";

import {
  technologiesRoute
} from "./js/modules/technologies.js";

import {
  profileRoute
} from "./js/modules/profile/index.js";

import {
  t,
  applyStaticTranslations,
  createLanguageSwitch,
  onLanguageChange
} from "./js/core/i18n.js";


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

const authLayout =
  document.getElementById("auth-layout");

let enrollmentFactorId = null;

/*
  Authenticated Admin application (shell + router).

  It is mounted only when showScreen("admin") runs, which routeSession() reaches
  exclusively after getVerifiedUser() + isOwner() + aal2 have all passed.
  Leaving the admin screen (logout, session loss, MFA step) unmounts it and
  clears the rendered content, so no privileged view survives a state change.
*/
let adminShell = null;
let adminRouter = null;

function mountAdminApp() {
  if (adminRouter) {
    return;
  }

  adminShell = initShell();

  adminRouter = createRouter({
    container: adminShell.contentEl,
    defaultRoute: "dashboard",
    routes: [
      dashboardRoute,
      profileRoute,
      experienceRoute,
      certificatesRoute,
      projectsRoute,
      technologiesRoute
    ],
    onRouteChange: route => adminShell.setActiveRoute(route)
  });

  adminRouter.start();
}

function unmountAdminApp() {
  if (adminRouter) {
    adminRouter.stop();
    adminRouter = null;
  }

  if (adminShell) {
    adminShell.destroy();
    adminShell = null;
  }
}

function showScreen(name) {
  Object.values(screens).forEach(
    screen => screen.hidden = true
  );

  screens[name].hidden = false;

  // The auth layout and the admin shell are mutually exclusive.
  authLayout.hidden = name === "admin";

  if (name === "admin") {
    mountAdminApp();
    return;
  }

  unmountAdminApp();
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
            t("mfa.invalidCode");

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
            t("mfa.invalidCode");

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

      const submit = document.getElementById("login-submit");
      const errorNode = document.getElementById("login-error");

      const email =
        document.getElementById("email").value.trim();

      const password =
        document.getElementById("password").value;

      /*
        Only decides where the session is kept afterwards. MFA still runs,
        and the owner + aal2 policies are untouched either way.
      */
      const remember =
        document.getElementById("remember-me").checked;

      errorNode.textContent = "";
      submit.disabled = true;
      submit.textContent = t("auth.signingIn");

      const { error } = await signIn(email, password, remember);

      submit.disabled = false;
      submit.textContent = t("auth.signIn");

      if (error) {
        errorNode.textContent = t("auth.invalidCredentials");
        return;
      }

      await routeSession();
    }
  );

  /* Password visibility. The control reports its own state, so a screen
     reader hears "show"/"hide" rather than an unlabelled icon. */
  (function () {

    const toggle = document.getElementById("password-toggle");
    const field = document.getElementById("password");

    toggle.addEventListener("click", () => {
      const shown = field.type === "text";

      field.type = shown ? "password" : "text";
      toggle.setAttribute("aria-pressed", shown ? "false" : "true");
      toggle.dataset.i18nAriaLabel = shown ? "auth.showPassword" : "auth.hidePassword";
      toggle.setAttribute("aria-label", t(toggle.dataset.i18nAriaLabel));
      field.focus();
    });

  }());

  /* Language can be changed before signing in, and again inside the Admin. */
  document
    .getElementById("login-language")
    .appendChild(createLanguageSwitch());

  document
    .getElementById("mfa-signout")
    .addEventListener("click", async () => {
      await signOut();
      showScreen("login");
    });

  applyStaticTranslations();

  /*
    A language change re-renders the current route so every string the
    modules produced is regenerated. Nothing is translated in place.
  */
  onLanguageChange(() => {
    applyStaticTranslations();

    if (adminShell) {
      adminShell.applyLanguage();
    }

    if (adminRouter) {
      adminRouter.reload();
    }
  });

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