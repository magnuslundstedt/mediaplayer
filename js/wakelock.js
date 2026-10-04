// Screen Wake Lock: keeps the phone from auto-locking while a track plays.
//
// The browser releases the lock whenever the page is hidden, so it has to be
// asked for again each time the page comes back.
//
// States: 'unsupported' | 'off' | 'on' | 'denied'

export function createWakeLock(onChange) {
  const supported = 'wakeLock' in navigator;
  let state = supported ? 'off' : 'unsupported';
  let wanted = false;
  let sentinel = null;
  let pending = false;

  const set = (next) => {
    if (next === state) return;
    state = next;
    onChange(state);
  };

  async function acquire() {
    if (!supported || !wanted || sentinel || pending) return;
    if (document.visibilityState !== 'visible') return;
    pending = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!wanted) {
        s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel !== s) return;
        sentinel = null;
        set('off');
      });
      set('on');
    } catch {
      // Refused by the system, e.g. Low Power Mode.
      set('denied');
    } finally {
      pending = false;
    }
  }

  if (supported) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') acquire();
    });
  }

  return {
    get state() {
      return state;
    },
    enable() {
      wanted = true;
      acquire();
    },
    disable() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      if (s) s.release().catch(() => {});
      if (supported) set('off');
    },
  };
}
