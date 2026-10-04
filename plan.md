# Plan

A browser media player for practising one section of a track on repeat. Built for
dance rehearsal, used on a phone.

**Status:** MVP deployed at `loops.dance` (v0.2.4). Used for a one-hour practice
session on an iPhone on 2026-10-04 and it worked well. Some on-device checklist
items have not been tried one by one.
Last updated 2026-10-04.

## Goal

Open the site on an iPhone, load an mp3 from Files, mark a section and have it
repeat, with the track and its loops still there the next time the app is opened.

The player plays the user's own files on the user's own device. It is not a way to
share or distribute music: no upload, no accounts, no backend.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Stack | Plain HTML, CSS and ES modules. No build step, no dependencies. | Fastest route to something usable today; nothing to install, nothing to break. |
| Hosting | GitHub Pages, served from `main` at the repo root. | A push is a deploy. A custom domain comes later. |
| Install | PWA added to the Home Screen, working offline. | Loads with no signal in the studio, and iOS does not purge a Home Screen app's storage after 7 idle days the way it does for a Safari tab. |
| Audio engine | A single `<audio>` element. | Pitch-preserving speed change is built in, memory use is low, and it is not muted by the ring/silent switch. The cost is that the loop wrap is not sample-accurate (see Risks). |
| Track storage | IndexedDB, bytes stored as an `ArrayBuffer`. | The `localStorage` API holds about 5 MB of strings, so it cannot hold an mp3. iOS Safari has no API for re-opening a file from Files later, so the app keeps its own copy. |
| Loop storage | IndexedDB, on the track record. | One place, one export, one fate if storage is ever cleared. |
| Small prefs | `localStorage` (last opened track only). | Read synchronously at launch. |
| Screen | Screen Wake Lock held while playing. | Keeps the phone from auto-locking mid-practice. |
| URLs | Relative everywhere, including the service worker scope and manifest. | The site lives under `/mediaplayer/` on Pages now and at `/` on a custom domain later. |

"Saved in local storage" in the original brief is read as "saved on the device".

## MVP scope

1. **Load a track.** File picker opening Files. mp3 is the target; anything else
   the browser can play (m4a, wav) works for free.
2. **Transport.** Play/pause, scrubber, elapsed and total time, skip back and
   forward 5 s.
3. **A/B loop.** Set start and set end at the current position, nudge either end by
   0.1 s or 1 s, loop on/off, loop region drawn on the scrubber. A "from the top"
   button plays from the loop start.
4. **Named loops.** Several per track ("chorus", "ending"); tap to switch, rename,
   delete.
5. **Speed.** 50–100 % in 5 % steps, pitch preserved.
6. **Pause before repeat.** 0–30 s of silence at the end of the loop, to get back
   to the starting position. The countdown fills the screen so it can be read
   from across the room; tapping it stops the repeat.
7. **Persistence.** Tracks and loops are kept on the device. The app reopens on
   the last track with its loops, speed and pause setting.
8. **Track list.** Pick between saved tracks; delete one to free space.
9. **Keep screen on** while playing, with the state shown.
10. **Offline.** Installable; launches and plays with no connection.

Layout is one portrait screen, usable one-handed with large touch targets: the
phone is on the floor or a shelf and gets tapped between runs.

### Not in the MVP

Tracked under [After the MVP](#after-the-mvp): waveform view, lock-screen
controls, export/import, lead-in, count-in click, custom domain.

### Non-goals

Sharing, accounts, any backend, streaming, playlists or queues, analytics, EQ and
effects. No in-app volume slider either: iOS ignores `audio.volume`, the hardware
buttons are the volume control.

## Design

### Files

```
index.html
css/app.css
js/app.js        UI wiring and state
js/player.js     <audio> wrapper: loop engine, speed, pause-before-repeat
js/loop.js       pure loop maths (clamp, nudge, format), unit-testable
js/store.js      IndexedDB: tracks and file bytes
js/wakelock.js   acquire, release, re-acquire on visibilitychange
js/version.js    build version shown in the footer
sw.js            service worker (at the root so its scope covers the site)
manifest.webmanifest
icons/           icon.svg (source), apple-touch-icon 180, icon 192 and 512
test/            node --test, no dependencies
package.json     marks the code as ES modules for node; no dependencies
```

### Data

```
IndexedDB "mediaplayer", version 1
  tracks   keyPath "id"
           { id, name, type, size, duration, addedAt, lastOpenedAt,
             speed, gap, loopOn, activeLoopId,
             loops: [{ id, name, start, end }] }
  files    key = track id, value = ArrayBuffer

localStorage
  mediaplayer.lastTrackId
```

`id` is the SHA-256 of the file bytes, so loading the same file again finds its
existing loops instead of creating a duplicate. Metadata and bytes sit in separate
stores so listing tracks never reads audio.

### Loop engine

- While the page is visible, a `requestAnimationFrame` loop compares
  `audio.currentTime` with the loop end; `timeupdate` is the coarse fallback when
  the page is hidden.
- The wrap fires when playback *crosses* the loop end, not whenever the playhead
  is past it. Scrubbing to before the loop gives a lead-in; scrubbing to after it
  plays on to the end of the track and then returns to the loop.
- Wrap with no pause: set `currentTime` to the loop start and keep playing.
- Wrap with a pause: `pause()`, seek to the start, count down, `play()`. The wake
  lock stays held through the gap.
- `ended` counts as a wrap, so a loop can run to the end of the track.
- Minimum loop length 0.5 s; start and end are clamped to the track and to each
  other.
- Loops save themselves: there is no save step. Marking a start creates
  "Loop N"; every edit is written to storage.
- Editing an edge jumps playback to where the change can be heard: the new
  start, or 2 s before the new end.

### Offline

- `sw.js` precaches the app shell on install.
- Network-first with a 2 s timeout, falling back to the cache. The shell is a
  few small files, so the round trip is cheap, and a stale cached build is the
  failure mode that hurts most while iterating on the day of use.
- Every successful fetch refreshes the cached copy, so the cache name does not
  need bumping per release: an online launch runs the latest build, an offline
  launch runs the last one seen.
- The build version (`js/version.js`) is shown in the footer, so it is obvious
  which build the phone is running.
- `navigator.storage.persist()` is requested and the result shown.

## Milestones

### M0: scaffold (done)

- [x] plan.md, AGENTS.md, README.md, MIT license
- [x] Public repo, GitHub Pages serving a placeholder

### M1: MVP (built, awaiting the phone)

- [x] App shell; load a file and play it.
- [x] Loop engine: set A/B, nudge, wrap; speed; pause before repeat. Unit tests
      for `loop.js`.
- [x] Persistence: tracks, loops, restore last session.
- [x] Wake lock.
- [x] Manifest, icons, service worker.
- [ ] Run the on-device checklist below.

Verified so far, in headless desktop Chrome at phone size with a VBR mp3: load,
play, scrub, mark and nudge a loop, repeated wraps (20–30 ms past the loop end;
about 90 ms on the hidden-page fallback), speed, pause before repeat, several
loops, rename, delete, restore after reload, launch and play offline. None of
that says anything about iOS; the checklist does.

### On-device checklist (iPhone, Home Screen app)

- [x] An mp3 picked from Files plays.
- [x] A and B set while listening; the section repeats; nudging moves the ends.
- [ ] Two named loops saved; switching jumps to the right section.
- [ ] App closed from the app switcher and reopened: track and loops are back
      without picking the file again.
- [ ] 70 % speed: slower, same pitch.
- [ ] 4 s pause before repeat: countdown shows, the loop restarts by itself.
- [x] Screen stays on beyond the Auto-Lock time while playing.
- [ ] Airplane mode: the app launches and plays.
- [ ] Plays with the ring/silent switch set to silent.

## Risks, and what to check on the phone

Expected platform behaviour, not yet confirmed on the target device. Assumes iOS
18.4 or later.

| Risk | Effect | Mitigation |
|---|---|---|
| Seeking in a VBR mp3 is approximate. | Loop start lands slightly off, differently on each wrap. | Test with the real show track early. If it drifts: re-encode to CBR or m4a, or move looping to Web Audio. |
| `<audio>` looping is not gapless. | A few tens of ms of slack at the wrap. | Acceptable for practice. Sample-accurate looping means decoding into Web Audio and losing free pitch-preserving speed. |
| Wake Lock in a Home Screen app needs iOS 18.4+. | Screen dims and locks on older iOS. | Show the lock state. Fallback is Settings → Auto-Lock → Never, or using the Safari tab. |
| Wake Lock is dropped when the page is hidden, and may be refused in Low Power Mode. | Screen locks after switching apps and back. | Re-acquire on `visibilitychange`; show the state. |
| Phone locked or app backgrounded. | Audio continues, but looping is best effort: `requestAnimationFrame` stops and a paused gap may not resume. | The wake lock avoids the situation. Not solved in the MVP. |
| Home Screen app storage is separate from Safari's. | A track loaded in the Safari tab is missing from the installed app. | Install first, then load the track from the Home Screen app. Said in the README. |
| Service worker serves a stale build. | A fix does not show up on the phone. | Network-first, visible build version. |
| File picker `accept` quirks on iOS. | mp3 files greyed out in Files. | `accept="audio/*,.mp3,.m4a,.wav"`; drop `accept` entirely if it still misbehaves. |
| Phone can only be tested over HTTPS. | Service worker, Wake Lock and `crypto.subtle` do not exist on `http://192.168.x.x`. | Test on the phone through the Pages URL; `localhost` is fine on the laptop. |

## Decided 2026-10-04

- **App name** stays `mediaplayer` for the MVP; revisit afterwards.
- **Speed and pause are remembered per track**, not per loop: they get adjusted
  on the fly while a loop plays.
- **Speed tops out at 100 %.**
- **Looping with the phone locked** is best effort. See how the wake lock holds
  up in practice before doing more.

## After the MVP

### M2: practice refinements

- Fit the whole player on one phone screen; today the speed and pause controls
  need a short scroll.
- A scrubber that responds to a tap anywhere on the bar, if the native range
  input on iOS turns out to follow only a drag of the thumb.
- ~~Lock-screen and headphone controls through the Media Session API.~~ Done in
  v0.2.4: the lock screen shows the track, the loop name and the app icon;
  play, pause, the scrubber and "previous" (from the top of the loop) work.
  Untested on a phone so far.
- **Known issue, reported 2026-10-04:** with the phone locked and the app
  playing in the background, tapping the lock-screen player opens a *different*
  Home Screen web app (an older, unrelated one). Which app that tap opens is
  decided by iOS; no tag or manifest field controls it, and no matching bug
  report was found. Check whether v0.2.4 changes it. If not, report it to Apple
  and note that deleting stale Home Screen web apps may be the only workaround.
- Lead-in: start a few seconds before the loop start to catch the entry.
- Count-in click during the pause before repeat.
- Speed and pause saved per loop.
- Export and import of loops as JSON.

### Speed change quality (researched 2026-10-04, not built)

Reported from the phone: at 90 % the audio sounds "clippy". The MVP uses the
`<audio>` element's built-in pitch-preserving stretch. Browsers give no control
over that algorithm, and Web Audio has no native time-stretch at all, so better
quality means bringing our own stretcher.

Candidates:

| Library | Licence | Notes |
|---|---|---|
| Signalsmith Stretch | MIT | Official Web Audio release: one 114 KB ES module with the WASM inlined, runs as an AudioWorklet. Works on live input (pitch shift) or on loaded buffers (rate, `loopStart`/`loopEnd`). **Preferred.** |
| Bungee | MPL-2.0, plus a commercial "Pro" web SDK | Good reputation; the best version is not the open one. |
| Rubber Band (WASM builds) | GPL | High quality, but GPL would apply to the whole app, and the worklet wrapper is unmaintained since 2022. |
| SoundTouchJS | MPL-2.0 | Time-domain (WSOLA), the same family the browsers already use; unlikely to sound better. |

Two ways to use Signalsmith Stretch, vendored into the repo (no CDN):

1. **Pitch-correct the element (small).** Keep `<audio>` as the transport. Below
   100 % set `preservesPitch = false`, so the browser only resamples (clean, but
   lower in pitch), then route the element through the stretch node in live mode
   with `semitones = -12 * log2(rate)` to put the pitch back. Loop engine,
   seeking, pause and storage stay as they are. Bypass the node at 100 %.
2. **Buffer engine (large).** Decode the file and let the stretch node play it:
   `rate` for speed, `loopStart`/`loopEnd` for sample-accurate loops. Replaces
   `player.js`, also fixes the wrap overshoot and VBR seek drift, and shares the
   decode with the waveform view. Costs about 21 MB of memory per minute of audio.

Either way the sound then goes through Web Audio, which on iOS changes things
that currently work and must be re-checked on the phone:

- Web Audio is muted by the ring/silent switch unless
  `navigator.audioSession.type = 'playback'` is set before the context is created
  (iOS 17+).
- Playback with the phone locked or the app in the background may stop.
- There are reports of choppy audio from a media element routed through Web
  Audio on iOS Safari; that would rule out option 1 and leave option 2.

Plan: build option 1 behind an opt-in "high quality" switch, default off, and
judge it by ear on the phone. Move to option 2 if it is choppy or if exact loops
become worth the rewrite.

### M3: waveform view (WebGPU)

Place and drag loop points on a drawn waveform instead of by ear alone.

- Decode once with `decodeAudioData`, reduce to min/max peaks at several zoom
  levels, store the peaks in IndexedDB and drop the decoded buffer (about 21 MB
  per minute of stereo audio, so it should not stay in memory).
- Render with a WGSL fragment shader: peaks in a texture, loop region, playhead
  and zoom as uniforms. Pinch to zoom, drag the loop handles.
- WebGPU is in Safari from iOS 26. Canvas 2D is the fallback wherever
  `navigator.gpu` is missing, drawing the same peaks.
- Rendering does not keep the screen awake by itself: a browser page has no
  equivalent of a native game's idle-timer switch other than the Wake Lock API
  the MVP already uses. If the wake lock proves unreliable on the phone, the
  known workaround is a tiny looping muted video, not a canvas.

### M4: custom domain (done 2026-10-04)

**Domain: `loops.dance`**, registered 2026-10-04 at Gandi. DNS is a Route 53
hosted zone in the side-project AWS account, managed by hand with the AWS CLI
(one zone, three record sets; no CDK stack).
The name fits the scope: a tool for setting loops in a piece of music for
practice, nothing wider. (`loop.dance` is blocked at the registry.
`fromthetop.dance` is also registered but deliberately not pointed at this
project; it is held for a possible separate practice tool.)

Hosting stays on GitHub Pages. What was done, in this order, because the moment
the custom domain is set on the repo the `github.io` address starts redirecting
to it:

1. DNS records in the Route 53 zone (TTL 300):
   - `A` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
     `185.199.111.153`
   - `AAAA` → `2606:50c0:8000::153`, `2606:50c0:8001::153`,
     `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `www` `CNAME` → `magnuslundstedt.github.io.`
2. Nameservers at Gandi replaced with the zone's four Route 53 nameservers. The
   `.dance` nameservers picked it up within minutes; resolvers that had cached
   the old answer can lag by up to three hours.
3. Custom domain set on Pages (`CNAME` file plus the Pages setting), certificate
   issued for `loops.dance` and `www.loops.dance`, HTTPS enforced. `www`, plain
   `http` and the old `github.io` address all redirect to `https://loops.dance`.
4. App named: page title `loops.dance`, Home Screen label "Loops".

Still to do on each phone: open `https://loops.dance`, add it to the Home
Screen, load the track there and re-mark the loops.

- **Browser storage is per origin: the tracks and loops saved under
  `magnuslundstedt.github.io` do not follow.** Note each loop's start and end
  in the old Home Screen app and re-mark them in the new one.

Later option, decided against for now (2026-10-04): S3 + CloudFront in the
side-project AWS account, the way the other projects are hosted (CDK stacks, a
GitHub OIDC deploy role, a manually dispatched deploy with invalidation). The
address stays `https://loops.dance`, so users and their saved loops would not
notice the move. Reasons to do it: deploys become a deliberate act instead of
every push to `main`, and control over response headers and caching.
