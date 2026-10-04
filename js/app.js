// UI wiring and app state.

import { Player } from './player.js';
import { withStart, withEnd, nudge, clampLoop, formatTime, nextLoopName } from './loop.js';
import * as store from './store.js';
import { createWakeLock } from './wakelock.js';
import { createNowPlaying } from './nowplaying.js';
import { VERSION } from './version.js';

const SKIP = 5;
// After moving an edge, playback jumps to where the change can be heard:
// the new start, or this many seconds before the new end.
const AUDITION = 2;
const SAVE_DELAY = 300;
const HINT_KEY = 'mediaplayer.installHintDismissed';

const $ = (id) => document.getElementById(id);

const el = {
  trackBtn: $('trackBtn'),
  trackName: $('trackName'),
  notice: $('notice'),
  installHint: $('installHint'),
  installHintClose: $('installHintClose'),
  empty: $('empty'),
  player: $('player'),
  timeNow: $('timeNow'),
  timeTotal: $('timeTotal'),
  gapOverlay: $('gapOverlay'),
  gapCount: $('gapCount'),
  scrub: $('scrub'),
  scrubLoop: $('scrubLoop'),
  seek: $('seek'),
  restartBtn: $('restartBtn'),
  backBtn: $('backBtn'),
  playBtn: $('playBtn'),
  fwdBtn: $('fwdBtn'),
  loopBtn: $('loopBtn'),
  loopChips: $('loopChips'),
  loopHint: $('loopHint'),
  startTime: $('startTime'),
  endTime: $('endTime'),
  setStartBtn: $('setStartBtn'),
  setEndBtn: $('setEndBtn'),
  renameBtn: $('renameBtn'),
  deleteLoopBtn: $('deleteLoopBtn'),
  speed: $('speed'),
  speedValue: $('speedValue'),
  speedDown: $('speedDown'),
  speedUp: $('speedUp'),
  gap: $('gap'),
  gapValue: $('gapValue'),
  gapDown: $('gapDown'),
  gapUp: $('gapUp'),
  status: $('status'),
  version: $('version'),
  fileInput: $('fileInput'),
  audio: $('audio'),
  tracksDialog: $('tracksDialog'),
  trackList: $('trackList'),
  trackListEmpty: $('trackListEmpty'),
  tracksClose: $('tracksClose'),
  tracksLoad: $('tracksLoad'),
  textDialog: $('textDialog'),
  textTitle: $('textTitle'),
  textInput: $('textInput'),
  textCancel: $('textCancel'),
  confirmDialog: $('confirmDialog'),
  confirmTitle: $('confirmTitle'),
  confirmText: $('confirmText'),
  confirmCancel: $('confirmCancel'),
};

const state = {
  tracks: [],
  track: null,
  // False when the current track could not be written to storage and is only
  // held in memory for this session.
  saved: true,
  persisted: false,
  wake: 'off',
  scrubbing: false,
};

const player = new Player(el.audio, {
  onState: renderTransport,
  onTime: renderTime,
  onDuration,
  onGap: (seconds) => {
    const text = String(Math.ceil(seconds));
    el.gapCount.textContent = text;
    el.gapOverlay.classList.toggle('two-digit', text.length > 1);
  },
  onError: setNotice,
});

const wake = createWakeLock((next) => {
  state.wake = next;
  renderStatus();
});
state.wake = wake.state;

const nowPlaying = createNowPlaying({
  play: () => player.play(),
  pause: () => player.pause(),
  restart,
  seek: (t) => player.seek(t),
});

// ---------------------------------------------------------------- helpers

const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const activeLoop = () => state.track?.loops.find((l) => l.id === state.track.activeLoopId) ?? null;

const stripExtension = (name) => name.replace(/\.[a-z0-9]{1,5}$/i, '') || name;

function guessType(name) {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg' }[ext] ?? 'audio/mpeg';
}

const formatSize = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

function setNotice(text) {
  el.notice.textContent = text || '';
  el.notice.hidden = !text;
}

// ---------------------------------------------------------------- storage

let saveTimer = 0;

function saveSoon() {
  if (!state.track || !state.saved) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY);
}

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!state.track || !state.saved) return;
  store.putTrack(state.track).catch(() => {
    setNotice('Could not save your changes on this device.');
  });
}

async function importFile(file) {
  if (!file) return;
  setNotice('');
  let bytes;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    setNotice('That file could not be read.');
    return;
  }
  const id = await store.trackId(bytes, file);
  let track = state.tracks.find((t) => t.id === id);
  let saved = true;
  if (!track) {
    const now = Date.now();
    track = {
      id,
      name: stripExtension(file.name),
      type: file.type || guessType(file.name),
      size: bytes.byteLength,
      duration: 0,
      addedAt: now,
      lastOpenedAt: now,
      speed: 1,
      gap: 0,
      loopOn: true,
      activeLoopId: null,
      loops: [],
    };
    try {
      await store.addTrack(track, bytes);
      state.tracks.unshift(track);
      state.persisted = await store.requestPersistence();
    } catch (err) {
      saved = false;
      setNotice(
        err?.name === 'QuotaExceededError'
          ? 'Not enough storage to keep this track. It will play now but will not be saved.'
          : 'This track could not be saved on the device. It will play now but will not be remembered.',
      );
    }
  }
  openTrack(track, bytes, saved);
}

async function openStored(track) {
  let bytes;
  try {
    bytes = await store.getFile(track.id);
  } catch {
    bytes = null;
  }
  if (!bytes) {
    setNotice(`The audio for "${track.name}" is no longer stored on this device. Load the file again.`);
    return;
  }
  setNotice('');
  openTrack(track, bytes, true);
}

function openTrack(track, bytes, saved) {
  flushSave();
  state.track = track;
  state.saved = saved;
  track.lastOpenedAt = Date.now();
  player.setRate(track.speed);
  player.setGap(track.gap);
  player.load(new Blob([bytes], { type: track.type || 'audio/mpeg' }), track.duration);
  applyLoop();
  const loop = activeLoop();
  if (loop) player.seek(loop.start);
  if (saved) store.setLastTrackId(track.id);
  saveSoon();
  renderAll();
}

function closeTrack() {
  clearTimeout(saveTimer);
  state.track = null;
  player.unload();
  store.setLastTrackId(null);
  renderAll();
}

async function removeTrack(track) {
  const ok = await confirmDelete(
    `Delete "${track.name}"?`,
    'The track and its loops are removed from this device. The original file in Files is not touched.',
  );
  if (!ok) return;
  try {
    await store.deleteTrack(track.id);
  } catch {
    setNotice('That track could not be deleted.');
    return;
  }
  state.tracks = state.tracks.filter((t) => t.id !== track.id);
  if (state.track?.id === track.id) {
    closeTrack();
    if (state.tracks[0]) await openStored(state.tracks[0]);
  }
  renderTrackList();
}

function onDuration(duration) {
  const track = state.track;
  if (track && duration > 0 && Math.abs(track.duration - duration) > 0.01) {
    track.duration = duration;
    saveSoon();
  }
  renderDuration();
  renderLoops();
}

// ---------------------------------------------------------------- loops

// Push the active loop (or none, when looping is switched off) to the player.
function applyLoop() {
  const loop = activeLoop();
  player.setLoop(loop && state.track.loopOn ? loop : null);
}

function loopChanged() {
  applyLoop();
  saveSoon();
  renderLoops();
  renderTransport();
}

function createLoop(start, end) {
  const track = state.track;
  const loop = clampLoop({ id: uid(), name: nextLoopName(track.loops), start, end }, player.duration);
  track.loops.push(loop);
  track.activeLoopId = loop.id;
  return loop;
}

function setEdgeHere(edge) {
  const track = state.track;
  const duration = player.duration;
  if (!track || !duration) return;
  const t = player.currentTime;
  const loop = activeLoop();
  if (!loop) {
    createLoop(edge === 'start' ? t : 0, edge === 'start' ? duration : t);
  } else {
    Object.assign(loop, edge === 'start' ? withStart(loop, t, duration) : withEnd(loop, t, duration));
  }
  track.loopOn = true;
  loopChanged();
  // Marking the end closes the loop: go straight back to the top.
  if (edge === 'end') player.seek(activeLoop().start);
}

function nudgeEdge(edge, delta) {
  const loop = activeLoop();
  const duration = player.duration;
  if (!loop || !duration) return;
  Object.assign(loop, nudge(loop, edge, delta, duration));
  loopChanged();
  player.seek(edge === 'start' ? loop.start : Math.max(loop.start, loop.end - AUDITION));
}

function selectLoop(id) {
  const track = state.track;
  track.activeLoopId = id;
  track.loopOn = true;
  loopChanged();
  player.seek(activeLoop().start);
}

function newLoop() {
  const duration = player.duration;
  if (!state.track || !duration) return;
  createLoop(player.currentTime, duration);
  state.track.loopOn = true;
  loopChanged();
}

function toggleLoop() {
  const track = state.track;
  if (!track || !activeLoop()) return;
  track.loopOn = !track.loopOn;
  loopChanged();
}

async function renameLoop() {
  const loop = activeLoop();
  if (!loop) return;
  const name = await askText('Rename loop', loop.name);
  if (!name) return;
  loop.name = name;
  loopChanged();
}

async function deleteLoop() {
  const track = state.track;
  const loop = activeLoop();
  if (!loop) return;
  const ok = await confirmDelete(`Delete "${loop.name}"?`, 'The track itself stays.');
  if (!ok) return;
  track.loops = track.loops.filter((l) => l.id !== loop.id);
  track.activeLoopId = null;
  loopChanged();
}

function restart() {
  const loop = activeLoop();
  player.seek(loop ? loop.start : 0);
  player.play();
}

function setSpeed(percent) {
  const track = state.track;
  if (!track) return;
  const value = Math.min(100, Math.max(50, Math.round(percent / 5) * 5));
  track.speed = value / 100;
  player.setRate(track.speed);
  saveSoon();
  renderSettings();
}

function setGap(seconds) {
  const track = state.track;
  if (!track) return;
  track.gap = Math.min(30, Math.max(0, Math.round(seconds)));
  player.setGap(track.gap);
  saveSoon();
  renderSettings();
}

// ---------------------------------------------------------------- rendering

function renderAll() {
  const track = state.track;
  el.empty.hidden = Boolean(track);
  el.player.hidden = !track;
  el.trackName.textContent = track ? track.name : 'No track loaded';
  renderDuration();
  renderTime(player.currentTime);
  renderTransport();
  renderLoops();
  renderSettings();
  renderStatus();
}

function renderDuration() {
  const duration = player.duration;
  el.seek.max = String(duration || 1);
  el.timeTotal.textContent = formatTime(duration);
}

let lastTimeText = '';

function renderTime(t) {
  const text = formatTime(t, true);
  if (text !== lastTimeText) {
    lastTimeText = text;
    el.timeNow.textContent = text;
  }
  const duration = player.duration;
  el.scrub.style.setProperty('--p', duration ? String(Math.min(1, t / duration)) : '0');
  if (!state.scrubbing) el.seek.value = String(t);
}

function renderTransport() {
  const s = player.state;
  const playing = s === 'playing' || s === 'gap';
  el.playBtn.classList.toggle('is-playing', playing);
  el.playBtn.classList.toggle('is-gap', s === 'gap');
  el.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  el.gapOverlay.hidden = s !== 'gap';
  const loop = activeLoop();
  el.loopBtn.disabled = !loop;
  el.loopBtn.setAttribute('aria-pressed', String(Boolean(loop && state.track.loopOn)));
  if (playing) wake.enable();
  else wake.disable();
  const track = state.track;
  nowPlaying.update(
    track ? { title: track.name, subtitle: loop && track.loopOn ? loop.name : 'loops.dance', state: s } : null,
  );
  renderStatus();
}

function renderLoops() {
  const track = state.track;
  if (!track) return;
  const duration = player.duration;
  const loop = activeLoop();

  el.loopChips.replaceChildren(
    ...track.loops.map((l) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('aria-pressed', String(l.id === track.activeLoopId));
      const name = document.createElement('span');
      name.className = 'chip-name';
      name.textContent = l.name;
      const range = document.createElement('span');
      range.className = 'chip-range';
      range.textContent = `${formatTime(l.start)} – ${formatTime(l.end)}`;
      chip.append(name, range);
      chip.addEventListener('click', () => selectLoop(l.id));
      return chip;
    }),
    newLoopChip(duration),
  );

  el.loopHint.hidden = Boolean(loop);
  el.loopHint.textContent = track.loops.length
    ? 'No loop selected. Pick one above, or mark a new one below.'
    : 'Play the track, tap "Set start here" where the section begins and "Set end here" where it ends.';

  el.startTime.textContent = loop ? formatTime(loop.start, true) : '–';
  el.endTime.textContent = loop ? formatTime(loop.end, true) : '–';
  el.setStartBtn.disabled = el.setEndBtn.disabled = !duration;
  for (const button of el.player.querySelectorAll('[data-edge]')) button.disabled = !loop;
  el.renameBtn.disabled = el.deleteLoopBtn.disabled = !loop;

  el.scrubLoop.hidden = !loop || !duration;
  el.scrubLoop.classList.toggle('off', !track.loopOn);
  if (loop && duration) {
    el.scrub.style.setProperty('--a', String(loop.start / duration));
    el.scrub.style.setProperty('--b', String(Math.min(1, loop.end / duration)));
  }
}

function newLoopChip(duration) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip chip-new';
  chip.textContent = '+ New loop';
  chip.disabled = !duration;
  chip.addEventListener('click', newLoop);
  return chip;
}

function renderSettings() {
  const track = state.track;
  if (!track) return;
  const percent = Math.round(track.speed * 100);
  el.speed.value = String(percent);
  el.speedValue.textContent = `${percent}%`;
  el.gap.value = String(track.gap);
  el.gapValue.textContent = track.gap ? `${track.gap} s` : 'Off';
}

function renderStatus() {
  const parts = [];
  if (state.wake === 'on') parts.push('Screen stays on');
  else if (state.wake === 'unsupported') parts.push('This browser cannot keep the screen on');
  else if (state.wake === 'denied') parts.push('Could not keep the screen on (Low Power Mode?)');
  if (state.track && !state.saved) parts.push('Track not saved');
  else if (state.tracks.length && !state.persisted) parts.push('Browser may clear saved tracks');
  el.status.textContent = parts.join(' · ');
  el.version.textContent = `v${VERSION}`;
}

function renderTrackList() {
  el.trackListEmpty.hidden = state.tracks.length > 0;
  el.trackList.replaceChildren(
    ...state.tracks.map((track) => {
      const row = document.createElement('li');
      row.className = 'track-row';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'track-open';
      if (track.id === state.track?.id) open.setAttribute('aria-current', 'true');
      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = track.name;
      const meta = document.createElement('span');
      meta.className = 'track-meta';
      const loops = track.loops.length;
      meta.textContent = [
        track.duration ? formatTime(track.duration) : null,
        formatSize(track.size),
        `${loops} ${loops === 1 ? 'loop' : 'loops'}`,
      ]
        .filter(Boolean)
        .join(' · ');
      open.append(name, meta);
      open.addEventListener('click', async () => {
        el.tracksDialog.close();
        if (track.id !== state.track?.id) await openStored(track);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn track-delete';
      del.setAttribute('aria-label', `Delete ${track.name}`);
      del.innerHTML =
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/></svg>';
      del.addEventListener('click', () => removeTrack(track));

      row.append(open, del);
      return row;
    }),
  );
}

// ---------------------------------------------------------------- dialogs

function askText(title, value) {
  return new Promise((resolve) => {
    const dialog = el.textDialog;
    el.textTitle.textContent = title;
    el.textInput.value = value;
    dialog.returnValue = '';
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue === 'ok' ? el.textInput.value.trim() || null : null),
      { once: true },
    );
    dialog.showModal();
    el.textInput.select();
  });
}

function confirmDelete(title, text) {
  return new Promise((resolve) => {
    const dialog = el.confirmDialog;
    el.confirmTitle.textContent = title;
    el.confirmText.textContent = text;
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}

// ---------------------------------------------------------------- events

function bind() {
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files?.[0];
    // Reset so picking the same file again still fires `change`.
    el.fileInput.value = '';
    importFile(file);
  });

  el.trackBtn.addEventListener('click', () => {
    renderTrackList();
    el.tracksDialog.showModal();
  });
  el.tracksClose.addEventListener('click', () => el.tracksDialog.close());
  // Close first: a modal dialog makes the rest of the page inert, and the file
  // input lives outside it. Still inside the tap, so the picker may open.
  el.tracksLoad.addEventListener('click', () => {
    el.tracksDialog.close();
    el.fileInput.click();
  });
  el.textCancel.addEventListener('click', () => el.textDialog.close('cancel'));
  el.confirmCancel.addEventListener('click', () => el.confirmDialog.close('cancel'));

  el.playBtn.addEventListener('click', () => player.toggle());
  el.restartBtn.addEventListener('click', restart);
  el.backBtn.addEventListener('click', () => player.skip(-SKIP));
  el.fwdBtn.addEventListener('click', () => player.skip(SKIP));
  el.loopBtn.addEventListener('click', toggleLoop);
  // Tapping the countdown cancels the repeat, the same as pressing pause.
  el.gapOverlay.addEventListener('click', () => player.pause());

  el.seek.addEventListener('input', () => {
    state.scrubbing = true;
    player.seek(Number(el.seek.value));
  });
  for (const type of ['change', 'pointerup', 'pointercancel', 'touchend', 'blur']) {
    el.seek.addEventListener(type, () => {
      state.scrubbing = false;
    });
  }

  el.setStartBtn.addEventListener('click', () => setEdgeHere('start'));
  el.setEndBtn.addEventListener('click', () => setEdgeHere('end'));
  for (const button of el.player.querySelectorAll('[data-edge]')) {
    button.addEventListener('click', () => nudgeEdge(button.dataset.edge, Number(button.dataset.delta)));
  }
  el.renameBtn.addEventListener('click', renameLoop);
  el.deleteLoopBtn.addEventListener('click', deleteLoop);

  el.speed.addEventListener('input', () => setSpeed(Number(el.speed.value)));
  el.speedDown.addEventListener('click', () => setSpeed(Math.round(state.track.speed * 100) - 5));
  el.speedUp.addEventListener('click', () => setSpeed(Math.round(state.track.speed * 100) + 5));
  el.gap.addEventListener('input', () => setGap(Number(el.gap.value)));
  el.gapDown.addEventListener('click', () => setGap(state.track.gap - 1));
  el.gapUp.addEventListener('click', () => setGap(state.track.gap + 1));

  el.installHintClose.addEventListener('click', () => {
    el.installHint.hidden = true;
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Not stored: the hint simply shows again next time.
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);
}

function showInstallHint() {
  // `navigator.standalone` only exists on iOS: false in a Safari tab, true
  // when launched from the Home Screen.
  if (navigator.standalone !== false) return;
  try {
    if (localStorage.getItem(HINT_KEY)) return;
  } catch {
    // Fall through and show it.
  }
  el.installHint.hidden = false;
}

async function init() {
  bind();
  renderAll();
  showInstallHint();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  try {
    state.tracks = await store.listTracks();
  } catch {
    setNotice('This browser will not save tracks (private browsing?). You can still load and play a file.');
  }
  state.persisted = await store.isPersisted();

  const lastId = store.getLastTrackId();
  const track = state.tracks.find((t) => t.id === lastId) ?? state.tracks[0];
  if (track) await openStored(track);
  renderAll();
}

init();
