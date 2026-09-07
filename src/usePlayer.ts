import { useSyncExternalStore } from 'react';
import { player } from './player';

export function usePlayer() {
  return useSyncExternalStore(
    (fn) => player.subscribe(fn),
    () => player.snapshot,
    () => player.snapshot,
  );
}
