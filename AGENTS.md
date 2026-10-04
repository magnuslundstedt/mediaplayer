# mediaplayer

A browser media player for looping one section of a track during practice. Runs
on a phone as a Home Screen web app; primary target is iPhone Safari.

Scope, design, milestones and open decisions are in [plan.md](plan.md). Read it
before changing anything, and keep it current: tick off milestones, record
decisions and the reason for them.

**Current state:** scaffold only. `index.html` is a placeholder; none of the
player exists yet.

## Rules

- **No build step, no dependencies, no CDN.** Plain HTML, CSS and ES modules that
  run as checked in. The app has to work offline, and a third-party request is
  both a failure point and a privacy leak.
- **Nothing leaves the device.** The user's audio and loops are never uploaded,
  logged or sent anywhere. No analytics, no backend.
- **Relative URLs only**: links, imports, manifest, service worker scope. The site
  is served under `/mediaplayer/` on GitHub Pages today and from `/` on a custom
  domain later. A leading `/` breaks one of the two.
- **`main` is production.** Pages serves the repo root from `main`, so a push is a
  deploy and every file at the root is publicly reachable.
- **Audio bytes go in IndexedDB as an `ArrayBuffer`.** `localStorage` is for tiny
  prefs only.
- **Changing the IndexedDB schema means a version bump and a migration.** The
  user's saved loops live there and are not backed up anywhere.
- **Bump the service worker cache version whenever a shell file changes** (once
  `sw.js` exists), and keep the visible build version in step.

## iOS behaviour that shapes the code

- `audio.volume` is read-only; do not build a volume control. `muted` works.
- `play()` needs a user gesture the first time; later scripted calls on the same
  element are fine while the page is visible.
- The wake lock is released whenever the page is hidden. Re-acquire on
  `visibilitychange`.
- `requestAnimationFrame` stops when the page is hidden; `timeupdate` keeps coming
  at roughly 4 Hz.
- The Home Screen app and the Safari tab have separate storage.
- Service worker, Wake Lock and `crypto.subtle` need a secure context: HTTPS or
  `localhost`. They are absent on `http://<lan-ip>`.

## Running and testing

```sh
python3 -m http.server 8000     # http://localhost:8000
node --test                     # unit tests, once test/ exists
```

Test on the phone through the Pages URL,
<https://magnuslundstedt.github.io/mediaplayer/>, not through the laptop's LAN
address (see the secure-context point above).

Desktop Safari and Chrome are not a substitute for the phone: wake lock, file
picking, storage and background behaviour all differ. A change to any of those is
not verified until it has run on an iPhone; say so when it has not.
