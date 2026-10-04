// Pure loop maths. No DOM, so it runs under `node --test`.

export const MIN_LOOP = 0.5;

const round = (t) => Math.round(t * 100) / 100;

// Keep a loop inside the track and at least MIN_LOOP long.
export function clampLoop(loop, duration) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  let start = Math.min(Math.max(0, loop.start), max);
  let end = Math.min(Math.max(0, loop.end), max);
  if (end - start < MIN_LOOP) {
    end = Math.min(max, start + MIN_LOOP);
    start = Math.max(0, end - MIN_LOOP);
  }
  return { ...loop, start: round(start), end: round(end) };
}

// Mark the start at t. Marking it at or past the end means a new section is
// being started, so the end is released to the end of the track.
export function withStart(loop, t, duration) {
  const end = t > loop.end - MIN_LOOP ? duration : loop.end;
  return clampLoop({ ...loop, start: t, end }, duration);
}

// Mark the end at t. Marking it at or before the start releases the start to
// the beginning of the track.
export function withEnd(loop, t, duration) {
  const start = t < loop.start + MIN_LOOP ? 0 : loop.start;
  return clampLoop({ ...loop, start, end: t }, duration);
}

// Move one edge by delta seconds. The other edge never moves.
export function nudge(loop, edge, delta, duration) {
  if (edge === 'start') {
    const start = Math.max(0, Math.min(loop.start + delta, loop.end - MIN_LOOP));
    return clampLoop({ ...loop, start }, duration);
  }
  const end = Math.max(loop.end + delta, loop.start + MIN_LOOP);
  return clampLoop({ ...loop, end }, duration);
}

// True when playback moved across the loop end since the last observation.
// A seek to somewhere past the end is not a crossing: the caller resets `prev`
// on every seek, so playback started beyond the loop is left alone.
export function crossed(prev, now, end) {
  return prev < end && now >= end;
}

export function formatTime(t, tenths = false) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const total = tenths ? Math.floor(t * 10 + 1e-6) / 10 : Math.floor(t + 1e-6);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${tenths ? s.toFixed(1).padStart(4, '0') : String(s).padStart(2, '0')}`;
}

export function nextLoopName(loops) {
  const used = loops
    .map((l) => /^Loop (\d+)$/.exec(l.name))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return `Loop ${Math.max(0, ...used) + 1}`;
}
