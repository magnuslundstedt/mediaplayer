# Plan

A browser media player for practising one section of a track on repeat. Built for
dance rehearsal, used on a phone.

**Status:** scoped, not built. The live site is a placeholder.
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
   0.1 s or 1 s, loop on/off, loop region drawn on the scrubber.
4. **Named loops.** Several per track ("chorus", "ending"); tap to switch, rename,
   delete.
5. **Speed.** 50–100 % in 5 % steps, pitch preserved.
6. **Pause before repeat.** 0–10 s of silence at the end of the loop with a
   visible countdown, to get back to the starting position.
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
sw.js            service worker (at the root so its scope covers the site)
manifest.webmanifest
icons/           apple-touch-icon 180, 192, 512, maskable 512
test/            node --test, no dependencies
```

### Data

```
IndexedDB "mediaplayer", version 1
  tracks   keyPath "id"
           { id, name, type, size, duration, addedAt, lastOpenedAt,
             speed, gap, activeLoopId,
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
- Wrap with no pause: set `currentTime` to the loop start and keep playing.
- Wrap with a pause: `pause()`, count down, seek to the start, `play()`. The wake
  lock stays held through the gap.
- `ended` counts as a wrap, so a loop can run to the end of the track.
- Minimum loop length 0.5 s; start and end are clamped to the track and to each
  other.

### Offline

- `sw.js` precaches the app shell under a versioned cache name.
- Network-first with a short timeout, falling back to the cache. The shell is a
  few small files, so the round trip is cheap, and a stale cached build is the
  failure mode that hurts most while iterating on the day of use.
- The build version is shown in the UI, so it is obvious which build the phone is
  running.
- `navigator.storage.persist()` is requested and the result shown.

## Milestones

### M0: scaffold (done)

- [x] plan.md, AGENTS.md, README.md, MIT license
- [x] Public repo, GitHub Pages serving a placeholder

### M1: MVP

Ordered so the riskiest part (audio on the actual phone) is proven first and the
service worker, which makes iteration harder, comes last.

- [ ] App shell; load a file and play it from memory. Check on the phone.
- [ ] Loop engine: set A/B, nudge, wrap; speed; pause before repeat. Unit tests
      for `loop.js`.
- [ ] Persistence: tracks, loops, restore last session.
- [ ] Wake lock.
- [ ] Manifest, icons, service worker. Add to Home Screen.
- [ ] Run the on-device checklist below.

### On-device checklist (iPhone, Home Screen app)

- [ ] An mp3 picked from Files plays.
- [ ] A and B set while listening; the section repeats; nudging moves the ends.
- [ ] Two named loops saved; switching jumps to the right section.
- [ ] App closed from the app switcher and reopened: track and loops are back
      without picking the file again.
- [ ] 70 % speed: slower, same pitch.
- [ ] 4 s pause before repeat: countdown shows, the loop restarts by itself.
- [ ] Screen stays on beyond the Auto-Lock time while playing.
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

## Open decisions

Defaults used unless decided otherwise.

- **App name.** Working name `mediaplayer`. The Home Screen label needs something
  of about 12 characters or fewer.
- **Speed and pause are remembered per track**, not per loop.
- **Speed tops out at 100 %.** Going above (say 110 %) is a one-line change.
- **Looping with the phone locked** is best effort, not a requirement.

## After the MVP

### M2: practice refinements

- Lock-screen and headphone controls through the Media Session API.
- Lead-in: start a few seconds before the loop start to catch the entry.
- Count-in click during the pause before repeat.
- Speed and pause saved per loop.
- Export and import of loops as JSON.

### M3: waveform view (WebGPU)

Place and drag loop points on a drawn waveform instead of by ear alone.

- Decode once with `decodeAudioData`, reduce to min/max peaks at several zoom
  levels, store the peaks in IndexedDB and drop the decoded buffer (about 21 MB
  per minute of stereo audio, so it should not stay in memory).
- Render with a WGSL fragment shader: peaks in a texture, loop region, playhead
  and zoom as uniforms. Pinch to zoom, drag the loop handles.
- WebGPU is in Safari from iOS 26. Canvas 2D is the fallback wherever
  `navigator.gpu` is missing, drawing the same peaks.

### M4: custom domain and hosting

- Point a domain at Pages, or move to other static hosting.
- **Browser storage is per origin: moving from `magnuslundstedt.github.io` to a
  custom domain leaves every saved track and loop behind.** Ship export/import
  (M2) first, or accept reloading the tracks and re-marking the loops once.
- The Home Screen app has to be re-added from the new address.
