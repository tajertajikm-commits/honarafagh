"use client";

/**
 * Renders the app's (async) server pages and layouts in the browser.
 *
 * In production these components run on the server per request. In the
 * static demo the same functions run here: we call the page/layout with
 * `params`/`searchParams`, await it, resolve any nested async components,
 * and hand the resulting element tree to React. redirect()/notFound() thrown
 * by the page are honoured; router.refresh() re-runs the loader.
 */
import { createContext, createElement, isValidElement, Fragment, Suspense, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { demoReady } from "./boot";
import { currentNav, useDemoTick } from "./refresh";
import { DYNAMIC_PARAM, toDemoPath } from "./routes";

type AnyComponent = (props: Record<string, unknown>) => unknown;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const isAsync = (fn: unknown) => typeof fn === "function" && fn instanceof AsyncFunction;

function containsElements(v: unknown): boolean {
  if (isValidElement(v)) return true;
  if (Array.isArray(v)) return v.some(containsElements);
  return false;
}

/** Awaits async components anywhere in the tree (children and element-valued props). */
async function resolveTree(node: unknown): Promise<ReactNode> {
  if (node instanceof Promise) return resolveTree(await node);
  if (Array.isArray(node)) return Promise.all(node.map(resolveTree)) as Promise<ReactNode>;
  if (!isValidElement(node)) return node as ReactNode;
  const el = node as ReactElement<Record<string, unknown>>;
  if (isAsync(el.type)) return resolveTree(await (el.type as AnyComponent)(el.props));
  let changed = false;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props ?? {})) {
    if (containsElements(v)) {
      props[k] = await resolveTree(v);
      changed = true;
    } else props[k] = v;
  }
  if (!changed) return el;
  const { children, ...rest } = props;
  return createElement(el.type, { ...rest, key: el.key ?? undefined }, ...(Array.isArray(children) ? children : children === undefined ? [] : [children]));
}

function digestOf(err: unknown): string | null {
  return err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" ? (err as { digest: string }).digest : null;
}

type State = { kind: "loading" } | { kind: "ready"; node: ReactNode } | { kind: "notFound" } | { kind: "error"; message: string };

function useLoader(run: () => Promise<unknown>, key: string) {
  const router = useRouter();
  const tick = useDemoTick();
  const [state, setState] = useState<State>({ kind: "loading" });
  // The navigation count when this page (route key) was shown: once the app navigates on, this page's redirects are stale.
  const [navMark, setNavMark] = useState(() => ({ key, nav: currentNav() }));
  if (navMark.key !== key) setNavMark({ key, nav: currentNav() });
  const navAtShow = navMark.key === key ? navMark.nav : currentNav();
  useEffect(() => {
    let cancelled = false;
    const startedAt = window.location.href;
    (async () => {
      try {
        await demoReady();
        const node = await resolveTree(await run());
        if (!cancelled) setState({ kind: "ready", node });
      } catch (err) {
        if (cancelled) return;
        const digest = digestOf(err);
        if (digest?.startsWith("NEXT_REDIRECT")) {
          // A render that started before the user navigated away must not redirect them back.
          if (window.location.href !== startedAt || currentNav() !== navAtShow) return;
          const [, type, url] = digest.split(";");
          const href = toDemoPath(url!);
          if (type === "push") router.push(href);
          else router.replace(href);
          return;
        }
        if (digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") {
          if (digest.endsWith(";403")) router.replace("/panel/forbidden");
          else setState({ kind: "notFound" });
          return;
        }
        console.error("[demo] page failed", err);
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key + tick describe every input
  }, [key, tick]);
  return state;
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10" aria-busy="true" aria-label="در حال بارگذاری">
      <div className="h-7 w-48 rounded-md bg-surface-3" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-surface-3" />
        <div className="h-24 rounded-xl bg-surface-3" />
        <div className="h-24 rounded-xl bg-surface-3" />
      </div>
      <div className="mt-6 h-64 rounded-xl bg-surface-3" />
    </div>
  );
}

function Problem({ title, message }: { title: string; message?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-[20px] font-bold">{title}</p>
      {message && <p className="mt-2 break-words text-[13px] text-muted" dir="auto">{message}</p>}
    </div>
  );
}

function render(state: State, keepPrevious: ReactNode | null) {
  if (state.kind === "ready") return state.node;
  if (state.kind === "notFound") return <Problem title="صفحه پیدا نشد" message="این مورد وجود ندارد یا به آن دسترسی ندارید." />;
  if (state.kind === "error") return <Problem title="خطا در نمایش صفحه" message={state.message} />;
  return keepPrevious ?? <Skeleton />;
}

// ── Pages ───────────────────────────────────────────────────────────────────

function PageInner({ page, param }: { page: AnyComponent; param?: string }) {
  const sp = useSearchParams();
  const key = sp.toString();
  const state = useLoader(async () => {
    const search: Record<string, string | string[]> = {};
    for (const [k, v] of sp.entries()) {
      if (k === DYNAMIC_PARAM) continue;
      const prev = search[k];
      search[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
    const params: Record<string, string> = param ? { [param]: sp.get(DYNAMIC_PARAM) ?? "" } : {};
    return page({ params: Promise.resolve(params), searchParams: Promise.resolve(search) });
  }, key);
  const [last, setLast] = useState<ReactNode | null>(null);
  const [lastKey, setLastKey] = useState(key);
  if (state.kind === "ready" && state.node !== last) setLast(state.node);
  if (key !== lastKey) {
    // Different page/query: don't show the old content under the new URL.
    setLastKey(key);
    setLast(null);
  }
  return <Fragment>{render(state, last)}</Fragment>;
}

export function DemoPage({ page, param }: { page: AnyComponent; param?: string }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <PageInner page={page} param={param} />
    </Suspense>
  );
}

// ── Layouts ─────────────────────────────────────────────────────────────────

const SlotContext = createContext<ReactNode>(null);
function Slot() {
  return <Fragment>{useContext(SlotContext)}</Fragment>;
}

function LayoutInner({ layout, children }: { layout: AnyComponent; children: ReactNode }) {
  const pathname = usePathname();
  const state = useLoader(async () => layout({ children: <Slot /> }), `layout:${pathname}`);
  const [last, setLast] = useState<ReactNode | null>(null);
  if (state.kind === "ready" && state.node !== last) setLast(state.node);
  return <SlotContext.Provider value={children}>{render(state, last)}</SlotContext.Provider>;
}

export function DemoLayout({ layout, children }: { layout: AnyComponent; children: ReactNode }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <LayoutInner layout={layout}>{children}</LayoutInner>
    </Suspense>
  );
}
