/**
 * Recovery for "Importing a module script failed" after a deploy.
 *
 * A page opened before a deploy (often an installed app resumed from memory) still asks for the old hashed
 * chunks. The deploy removed them, and the SPA fallback answers with index.html, so the browser refuses it as a
 * module. Reloading fetches the new index.html and its new chunks. A short guard stops a reload loop when the
 * failure has another cause, such as being offline.
 */
const KEY = 'eprx-chunk-reload-at';
const GUARD_MS = 20_000;
let started = false;

const PATTERNS = [
  /Importing a module script failed/i, // Safari
  /Failed to fetch dynamically imported module/i, // Chrome
  /error loading dynamically imported module/i, // Firefox
  /Unable to preload CSS/i, // Vite
  /is not a valid JavaScript MIME type/i,
];

export function isChunkLoadError(error) {
  const message = typeof error === 'string' ? error : error?.message || '';
  return PATTERNS.some((p) => p.test(message));
}

function lastReload() {
  try {
    return Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Reloads the page unless we just did. Returns true when a reload was started. */
export function reloadOnce() {
  if (started) return true;
  if (Date.now() - lastReload() < GUARD_MS) return false;
  started = true;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once; the guard just won't survive it.
  }
  window.location.reload();
  return true;
}

/** A user-initiated retry: clears the guard first so the next failure can auto-reload again. */
export function forceReload() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.location.reload();
}

/** Vite fires this when a dynamic import or its preload fails. Call once before React renders. */
export function initChunkReload() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) event.preventDefault();
  });
}
