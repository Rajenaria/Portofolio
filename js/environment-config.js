/* Deployment input, not a secret store. The source checkout is unconfigured.
   scripts/prepare-environment.js emits this file for one reviewed artifact.
   Fixture tools may install their explicit synthetic input before this file. */
(function (root) {
  if (!Object.hasOwn(root, 'PORTFOLIO_DEPLOYMENT')) {
    Object.defineProperty(root, 'PORTFOLIO_DEPLOYMENT', { value: null });
  }
})(globalThis);
