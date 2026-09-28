/** Replaces the server round trip of router.refresh(): pages and layouts re-run their loaders. */
import { useSyncExternalStore } from "react";

let tick = 0;
const listeners = new Set<() => void>();

export function demoRefresh() {
  tick++;
  for (const l of listeners) l();
}

export function useDemoTick() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => tick,
    () => 0,
  );
}
