// Route editors and form modals register their existing dirty/confirmation logic.
const guards = new Set();
let checking = false;

export function registerNavigationGuard(isDirty, confirmLeave) {
  const guard = { isDirty, confirmLeave };
  guards.add(guard);
  return () => guards.delete(guard);
}

export function hasUnsavedChanges() {
  return [...guards].some(guard => guard.isDirty());
}

export async function requestLeave() {
  if (checking) return false;
  checking = true;
  try {
    for (const guard of [...guards].reverse()) {
      if (guards.has(guard) && guard.isDirty() && !await guard.confirmLeave()) return false;
    }
    return true;
  } catch {
    return false;
  } finally { checking = false; }
}

window.addEventListener("beforeunload", event => {
  if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ""; }
});
