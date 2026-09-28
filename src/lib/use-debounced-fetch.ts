"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "./api-client";

/**
 * Debounced, cancellable fetch keyed by `key` (null = idle). The result is
 * stored together with the key it belongs to, so `loading` is derived rather
 * than set synchronously, and a slow response for an old key can never
 * overwrite a newer one. Previous data stays visible while a new key loads.
 */
export function useDebouncedFetch<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>, delay = 250, fallbackError = "ارتباط با سرور برقرار نشد.") {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });
  const latest = useRef(fetcher);
  useLayoutEffect(() => {
    latest.current = fetcher;
  });
  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      latest
        .current(ctrl.signal)
        .then((data) => setState({ key, data, error: null }))
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setState({ key, data: null, error: e instanceof ApiError ? e.message : fallbackError });
        });
    }, delay);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, delay, fallbackError]);
  if (key === null) return { data: null, error: null, loading: false };
  const fresh = state.key === key;
  return { data: state.data, error: fresh ? state.error : null, loading: !fresh };
}
