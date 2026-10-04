# loops.dance

The repository is called `mediaplayer`; the app and its address are `loops.dance`.

A browser media player for looping one section of a track during practice. Runs
on a phone as a Home Screen web app; primary target is iPhone Safari.

Scope, design, milestones and open decisions are in [plan.md](plan.md). Read it
before changing anything, and keep it current: tick off milestones, record
decisions and the reason for them.

**Current state:** the MVP is deployed at <https://loops.dance> and has been used
for a full practice session on an iPhone. Parts of the on-device checklist in
plan.md are still unticked.

## Rules

- **No build step, no dependencies, no CDN.** Plain HTML, CSS and ES modules that
  run as checked in. The app has to work offline, and a third-party request is
  both a failure point and a privacy leak.
- **Nothing leaves the device.** The user's audio and loops are never uploaded,
  logged or sent anywhere. No analytics, no backend.
- **Relative URLs only**: links, imports, manifest, service worker scope. The site
  is served from `/` on `loops.dance`, and from a subpath whenever it is run from
  the `github.io` project address or a fork. A leading `/` breaks the subpath
  case. The one exception is the share-card tags in `index.html` (`og:url`,
  `og:image`, canonical): link-preview crawlers need absolute URLs.
- **`main` is production.** Pages serves the repo root from `main`, so a push is a
  deploy and every file at the root is publicly reachable.
- **Audio bytes go in IndexedDB as an `ArrayBuffer`.** `localStorage` is for tiny
  prefs only.
- **Changing the IndexedDB schema means a version bump and a migration.** The
  user's saved loops live there and are not backed up anywhere.
- **Bump `VERSION` in `js/version.js` on every deploy.** It is shown in the
  footer and is the only way to tell which build a phone is running.
- **A new shell file goes in the `SHELL` list in `sw.js`**, or a first install
  will not have it offline. The cache name itself does not need bumping: the
  worker is network-first and refreshes each file as it is fetched.
- **`icons/icon.svg` is the source for the PNG icons.** Re-render them from it in
  a real browser engine; ImageMagick's built-in SVG renderer drops the arc.
  `apple-touch-icon.png`, `apple-touch-icon-precomposed.png` and `favicon.ico`
  at the repo root are copies: iOS and browsers ask for those exact paths at the
  root of a domain, whatever the page links to. Regenerate them together.
- **`icons/og.svg` is the source for `og.png`**, the 1200x630 share card. Render
  it in a browser on a Mac (the text uses the system font). Keep what matters in
  the middle 630 px: some link previews crop to a square. Text changes go in
  both the SVG and the `og:` tags.

## iOS behaviour that shapes the code

- `audio.volume` is read-only; do not build a volume control. `muted` works.
- `play()` needs a user gesture the first time; later scripted calls on the same
  element are fine while the page is visible.
- The wake lock is released whenever the page is hidden. Re-acquire on
  `visibilitychange`.
- `requestAnimationFrame` stops when the page is hidden; `timeupdate` keeps coming
  at roughly 4 Hz.
- The Home Screen app and the Safari tab have separate storage.
- Media Session: registering `seekbackward`/`seekforward` handlers replaces the
  previous/next buttons on the lock screen, so `js/nowplaying.js` registers
  neither and uses "previous" for from-the-top. Which app opens when the
  lock-screen player is tapped is up to iOS, not the page.
- Service worker, Wake Lock and `crypto.subtle` need a secure context: HTTPS or
  `localhost`. They are absent on `http://<lan-ip>`.

## Running and testing

```sh
python3 -m http.server 8000     # http://localhost:8000
node --test                     # unit tests for js/loop.js
```

Chrome does not load media in a tab that has never been visible, so a
background or automation tab shows a track with no duration that never plays.
Bring the tab to the front, or drive headless Chrome instead.

Test on the phone through the Pages URL,
<https://loops.dance>, not through the laptop's LAN
address (see the secure-context point above).

Desktop Safari and Chrome are not a substitute for the phone: wake lock, file
picking, storage and background behaviour all differ. A change to any of those is
not verified until it has run on an iPhone; say so when it has not.
