/**
 * Launch splash controller. The splash itself is plain HTML in index.html so it paints before any JavaScript.
 *
 * Every PageLoader on screen "holds" the splash (lazy route chunks, the session check). Once React has mounted and
 * nothing holds it for a moment, the splash fades out. A short settle delay bridges the gap between one loader
 * unmounting and the next mounting, so the splash doesn't flicker off and the in-app loader flicker on.
 */
const MIN_VISIBLE_MS = 400; // from page start, so fast loads don't flash the splash
const SETTLE_MS = 80;

let holds = 0;
let timer = null;
let done = false;

function el() {
  return typeof document === 'undefined' ? null : document.getElementById('splash');
}

export function isSplashVisible() {
  return !done && !!el();
}

function hide() {
  const node = el();
  done = true;
  if (!node) return;
  node.classList.add('splash-done');
  node.setAttribute('aria-hidden', 'true');
  setTimeout(() => node.remove(), 400);
}

function scheduleCheck() {
  if (done) return;
  clearTimeout(timer);
  const elapsed = typeof performance !== 'undefined' ? performance.now() : MIN_VISIBLE_MS;
  const wait = Math.max(SETTLE_MS, MIN_VISIBLE_MS - elapsed);
  timer = setTimeout(() => {
    if (holds === 0) hide();
  }, wait);
}

/** Call while something is loading; returns a release function. */
export function holdSplash() {
  if (done) return () => {};
  holds += 1;
  clearTimeout(timer);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) scheduleCheck();
  };
}

/** Call once after the first React render. */
export function startSplashWatch() {
  if (!el()) {
    done = true;
    return;
  }
  scheduleCheck();
}
