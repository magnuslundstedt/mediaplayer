// Wraps one <audio> element: loading, seeking, the loop wrap, speed, and the
// pause before each repeat.
//
// States: 'empty' | 'paused' | 'playing' | 'gap'
// 'gap' is the silence before a repeat: the element is paused, a timer is
// running, and playback resumes from the loop start by itself.

import { crossed } from './loop.js';

export class Player {
  constructor(audio, handlers = {}) {
    this.audio = audio;
    this.on = handlers;
    this.state = 'empty';
    this.loaded = false;
    this.loop = null;
    this.gap = 0;
    this.rate = 1;
    this.url = null;
    this.knownDuration = 0;
    this.lastTime = 0;
    this.pendingSeek = null;
    this.inGap = false;
    this.gapUntil = 0;
    this.gapTimer = 0;
    this.raf = 0;

    audio.preservesPitch = true;
    audio.webkitPreservesPitch = true;

    audio.addEventListener('loadedmetadata', () => {
      this._applyRate();
      this._applyPendingSeek();
      this.on.onDuration?.(this.duration);
    });
    audio.addEventListener('durationchange', () => this.on.onDuration?.(this.duration));
    // iOS can ignore a seek made before any data has arrived; try once more.
    audio.addEventListener('canplay', () => this._applyPendingSeek());
    for (const type of ['play', 'playing', 'pause', 'waiting', 'emptied']) {
      audio.addEventListener(type, () => this._sync());
    }
    // Covers seeks we did not make ourselves (lock-screen scrubber, headset),
    // so a jump over the loop end is not mistaken for playing across it.
    audio.addEventListener('seeking', () => {
      this.lastTime = audio.currentTime;
    });
    // requestAnimationFrame stops while the page is hidden; timeupdate keeps
    // coming (about 4 times a second), so looping carries on, less precisely.
    audio.addEventListener('timeupdate', () => this._tick());
    audio.addEventListener('ended', () => {
      if (this.loop) this._wrap();
      else this._sync();
    });
    audio.addEventListener('error', () => {
      if (!this.loaded) return;
      const code = audio.error?.code;
      this.on.onError?.(
        code === 4 ? 'This browser cannot play that file format.' : 'The track could not be played.',
      );
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._tick();
    });
  }

  get duration() {
    const d = this.audio.duration;
    return Number.isFinite(d) && d > 0 ? d : this.knownDuration;
  }

  get currentTime() {
    return this.pendingSeek ?? this.audio.currentTime;
  }

  load(blob, knownDuration = 0) {
    this.unload();
    this.url = URL.createObjectURL(blob);
    this.knownDuration = knownDuration;
    this.loaded = true;
    this.audio.src = this.url;
    this._applyRate();
    this.audio.load();
    this._sync();
  }

  unload() {
    this._cancelGap();
    this.loaded = false;
    this.loop = null;
    this.lastTime = 0;
    this.pendingSeek = null;
    this.knownDuration = 0;
    if (this.url) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    this._sync();
  }

  play() {
    if (!this.loaded) return;
    this._cancelGap();
    this._play();
  }

  pause() {
    if (this.inGap) {
      this._cancelGap();
      this._sync();
      return;
    }
    this.audio.pause();
  }

  toggle() {
    if (this.state === 'playing' || this.state === 'gap') this.pause();
    else this.play();
  }

  seek(t) {
    if (!this.loaded) return;
    const d = this.duration;
    t = Math.max(0, d ? Math.min(t, d) : t);
    this.lastTime = t;
    // Before metadata has loaded this sets the position playback will start
    // from; pendingSeek re-checks it once the element is ready.
    this.pendingSeek = this.audio.readyState >= 1 ? null : t;
    this.audio.currentTime = t;
    this.on.onTime?.(t);
  }

  skip(delta) {
    this.seek(this.currentTime + delta);
  }

  // `loop` is { start, end } in seconds, or null to play straight through.
  setLoop(loop) {
    this.loop = loop ? { start: loop.start, end: loop.end } : null;
    if (!this.loop && this.inGap) this._endGap();
  }

  setRate(rate) {
    this.rate = rate;
    this._applyRate();
  }

  setGap(seconds) {
    this.gap = seconds;
    if (seconds <= 0 && this.inGap) this._endGap();
  }

  _applyRate() {
    // load() resets playbackRate to defaultPlaybackRate, so set both.
    this.audio.defaultPlaybackRate = this.rate;
    this.audio.playbackRate = this.rate;
  }

  _applyPendingSeek() {
    if (this.pendingSeek === null) return;
    const t = this.pendingSeek;
    this.pendingSeek = null;
    this.lastTime = t;
    if (Math.abs(this.audio.currentTime - t) > 0.05) this.audio.currentTime = t;
  }

  async _play() {
    try {
      await this.audio.play();
    } catch (err) {
      // AbortError: a pause() arrived before playback started. Not a failure.
      if (err?.name !== 'AbortError') {
        this.on.onError?.(
          err?.name === 'NotAllowedError'
            ? 'Tap play to start. The browser blocked playback that was not started by a tap.'
            : 'The track could not be played.',
        );
      }
    }
    this._sync();
  }

  _jump(t) {
    this.lastTime = t;
    this.audio.currentTime = t;
  }

  _tick() {
    if (!this.loaded) return;
    if (this.inGap) {
      const left = this.gapUntil - performance.now();
      if (left <= 0) this._endGap();
      else this.on.onGap?.(left / 1000);
      return;
    }
    if (this.pendingSeek !== null) return;
    const now = this.audio.currentTime;
    if (this.loop && !this.audio.paused && crossed(this.lastTime, now, this.loop.end)) {
      this._wrap();
      return;
    }
    this.lastTime = now;
    this.on.onTime?.(now);
  }

  _wrap() {
    if (!this.loop) return;
    if (this.gap > 0) {
      this._startGap();
      return;
    }
    // Reaching the end of the track stops the element; a wrap from mid-track
    // leaves it playing.
    const stopped = this.audio.paused || this.audio.ended;
    this._jump(this.loop.start);
    this.on.onTime?.(this.loop.start);
    if (stopped) this._play();
  }

  _startGap() {
    clearTimeout(this.gapTimer);
    this.inGap = true;
    this.gapUntil = performance.now() + this.gap * 1000;
    this.audio.pause();
    // Seek now, so the audio is ready the moment the gap ends.
    this._jump(this.loop.start);
    this.gapTimer = setTimeout(() => this._endGap(), this.gap * 1000);
    this._sync();
    this.on.onTime?.(this.loop.start);
    this.on.onGap?.(this.gap);
  }

  _endGap() {
    if (!this.inGap) return;
    this._cancelGap();
    this._play();
  }

  _cancelGap() {
    clearTimeout(this.gapTimer);
    this.gapTimer = 0;
    this.inGap = false;
  }

  _sync() {
    const stopped = this.audio.paused || this.audio.ended;
    const next = !this.loaded ? 'empty' : this.inGap ? 'gap' : stopped ? 'paused' : 'playing';
    const active = next === 'playing' || next === 'gap';
    if (active && !this.raf) {
      const frame = () => {
        this.raf = requestAnimationFrame(frame);
        this._tick();
      };
      this.raf = requestAnimationFrame(frame);
    } else if (!active && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (next !== this.state) {
      this.state = next;
      this.on.onState?.(next);
    }
  }
}
