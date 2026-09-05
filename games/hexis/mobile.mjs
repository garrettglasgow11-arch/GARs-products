/* mobile.mjs — build the Android/phone edition.
 *
 * `hexis.html` is already one file, but it is not self-contained: it pulls
 * three.js from a CDN. On a phone that is the difference between a game that
 * works on the underground and one that shows a black screen. This inlines
 * the library and adds the handful of things a browser game needs before an
 * Android browser will leave it alone:
 *
 *   · overscroll and pull-to-refresh off. Android Chrome reloads the page on
 *     a downward swipe, and "swipe down" is a movement input.
 *   · touch-action: none, so the browser stops trying to pan and zoom the
 *     canvas out from under the controls.
 *   · a wake lock, because a game with no key presses looks idle to Android
 *     and the screen goes off mid-fight.
 *   · a web app manifest, so Add to Home Screen gives a fullscreen launcher
 *     with an icon instead of a browser tab with an address bar.
 *
 * The game's own touch controls, rotate prompt and fullscreen/orientation
 * request already exist — this does not duplicate them.
 *
 *   node mobile.mjs            -> hexis-mobile.html
 *   node mobile.mjs --check    -> report the size, write nothing
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'hexis.html');
const THREE = join(HERE, 'vendor', 'three.min.js');
const OUT = join(HERE, 'hexis-mobile.html');
const checkOnly = process.argv.includes('--check');

let html = readFileSync(SRC, 'utf8');
const three = readFileSync(THREE, 'utf8');

/* --- 1. inline three.js ------------------------------------------------- */
const CDN = /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/[^"]+"><\/script>/;
if (!CDN.test(html)) {
  console.error('mobile: could not find the three.js CDN tag in hexis.html');
  process.exit(1);
}
// A closing tag anywhere in the payload would end the script element early.
// three.min.js has none, but a future version might, so never assume it.
const safeThree = three.replace(/<\/script/gi, '<\\/script');
html = html.replace(CDN,
  '<script>/* three.js r128 — MIT, (c) 2010-2021 three.js authors. Inlined so\n' +
  '   this file needs nothing from the network. */\n' + safeThree + '\n</script>');

/* --- 2. the phone shell -------------------------------------------------- */
const ICON =
  'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">' +
    '<rect width="512" height="512" fill="#05070C"/>' +
    '<path d="M256 96 400 176v160L256 416 112 336V176Z" fill="none" stroke="#5FE3FF" stroke-width="22"/>' +
    '<path d="M256 176v160M186 216v80M326 216v80" stroke="#5FE3FF" stroke-width="18"/></svg>');

const MANIFEST = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify({
  name: 'HEXIS — Stormbreak',
  short_name: 'HEXIS',
  start_url: '.',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#05070C',
  theme_color: '#05070C',
  icons: [{ src: ICON, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }]
}));

const SHELL = `
<meta name="theme-color" content="#05070C">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="HEXIS">
<link rel="manifest" href="${MANIFEST}">
<link rel="apple-touch-icon" href="${ICON}">
<link rel="icon" href="${ICON}">
<style>
/* Android Chrome reloads the page on a downward swipe, and swipe-down is a
   movement input. It also rubber-bands the whole document when a drag runs
   off the edge of the stick. Both go here rather than in the game's CSS,
   because on desktop they cost you a scrollbar you might want. */
html, body {
  overscroll-behavior: none;
  touch-action: none;
  -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  position: fixed; inset: 0; overflow: hidden;
}
canvas { touch-action: none; }
</style>
<script>
/* A game takes no key presses, so Android decides it is idle and turns the
   screen off mid-fight. The lock has to be re-taken every time the tab comes
   back, because the OS drops it on any visibility change. */
(function () {
  var lock = null;
  function take() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) {
      lock = l;
      l.addEventListener('release', function () { lock = null; });
    }).catch(function () { /* denied, or the device does not do this */ });
  }
  document.addEventListener('visibilitychange', function () { if (!lock) take(); });
  addEventListener('pointerdown', function once() {
    removeEventListener('pointerdown', once); take();
  }, { once: true });
  // Two fingers on a canvas is a pinch-zoom to Android unless it is told not.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  // A double tap zooms. In a game a double tap is a dodge.
  var last = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - last < 320) e.preventDefault();
    last = now;
  }, { passive: false });
})();
</script>
`;
html = html.replace('</head>', SHELL + '</head>');

/* --- 3. stamp it --------------------------------------------------------- */
html = html.replace(/<div class="build">([^<]*)<\/div>/, '<div class="build">$1 · mobile</div>');

const kb = (html.length / 1024).toFixed(0);
if (checkOnly) {
  console.log('mobile --check: would write ' + kb + ' KB (three.js inlined: ' +
    (three.length / 1024).toFixed(0) + ' KB)');
  process.exit(0);
}
writeFileSync(OUT, html);
console.log('mobile: hexis-mobile.html  (' + kb + ' KB, fully self-contained)');
