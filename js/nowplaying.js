// Now Playing: what the lock screen and Control Center show for the app, and
// what their buttons do. Uses the Media Session API where the browser has it.

const ARTWORK = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
];

// `actions` is { play, pause, restart, seek(seconds) }.
export function createNowPlaying(actions) {
  const session = navigator.mediaSession;
  if (!session || typeof MediaMetadata === 'undefined') return { update() {} };

  const on = (name, handler) => {
    try {
      session.setActionHandler(name, handler);
    } catch {
      // This browser does not know the action; the others still work.
    }
  };
  on('play', actions.play);
  on('pause', actions.pause);
  // "Previous" is the from-the-top button. Deliberately no seekbackward or
  // seekforward handlers: on iOS they replace the previous/next buttons.
  on('previoustrack', actions.restart);
  on('seekto', (details) => actions.seek(details.seekTime));

  let shown = '';

  return {
    // `info` is { title, subtitle, state }, or null when no track is loaded.
    update(info) {
      const key = info ? `${info.title}\n${info.subtitle}` : '';
      if (key !== shown) {
        shown = key;
        session.metadata = info
          ? new MediaMetadata({ title: info.title, artist: info.subtitle, album: 'loops.dance', artwork: ARTWORK })
          : null;
      }
      // The pause before a repeat counts as playing: it resumes by itself.
      session.playbackState = !info ? 'none' : info.state === 'paused' ? 'paused' : 'playing';
    },
  };
}
