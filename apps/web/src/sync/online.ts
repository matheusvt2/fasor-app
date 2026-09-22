/**
 * Keeps an online flag in step with the `online` and `offline` events themselves.
 *
 * The engine answers its `online` listener by starting a cycle, and the cycle's first
 * step asks `isOnline()`. When that flag is React state it still reads false at that
 * moment: the session's re-render comes after every listener of the event has run. So
 * the flag the engine reads is written here, by a listener registered before the
 * engine's own, and listeners of one event run in registration order (retro U3).
 *
 * Returns the function that removes both listeners.
 */
export function followOnlineEvents(
  flag: { current: boolean },
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onOnline = () => {
    flag.current = true;
  };
  const onOffline = () => {
    flag.current = false;
  };
  target.addEventListener('online', onOnline);
  target.addEventListener('offline', onOffline);
  return () => {
    target.removeEventListener('online', onOnline);
    target.removeEventListener('offline', onOffline);
  };
}
