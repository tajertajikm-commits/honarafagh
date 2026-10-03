/**
 * Static demo `next/navigation`: the real module, with a router whose
 * refresh() re-runs the in-browser loaders and whose push/replace/prefetch
 * understand the demo's placeholder routes.
 */
import { useMemo } from "react";
import * as nav from "next/dist/client/components/navigation";
import { bumpNav, demoRefresh } from "../refresh";
import { toDemoPath } from "../routes";

export const {
  usePathname,
  useSearchParams,
  useParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
  useServerInsertedHTML,
  redirect,
  permanentRedirect,
  notFound,
  forbidden,
  unauthorized,
  RedirectType,
  ReadonlyURLSearchParams,
  unstable_rethrow,
} = nav as typeof nav & Record<string, never>;

export function useRouter() {
  const r = nav.useRouter();
  return useMemo(
    () => ({
      ...r,
      push: (href: string, opts?: Parameters<typeof r.push>[1]) => (bumpNav(), r.push(toDemoPath(href), opts)),
      replace: (href: string, opts?: Parameters<typeof r.replace>[1]) => (bumpNav(), r.replace(toDemoPath(href), opts)),
      prefetch: (href: string, opts?: Parameters<typeof r.prefetch>[1]) => r.prefetch(toDemoPath(href), opts),
      refresh: () => demoRefresh(),
    }),
    [r],
  );
}
