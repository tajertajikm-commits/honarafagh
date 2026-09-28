/**
 * Routes the app's network calls to the in-browser API without touching the
 * app code: fetch(), XMLHttpRequest (file uploads with progress) and plain
 * <a href="/api/v1/…"> links (file downloads, payment gateway callbacks).
 * Also keeps root-absolute <a href="/…"> links inside the demo's sub-folder.
 */
import { BASE_PATH } from "./cookies";
import { demoApi, isApiUrl } from "./dispatch";
import { toDemoPath } from "./routes";

let installed = false;

export function installInterceptors(navigate: (href: string) => void) {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url, window.location.href);
    if (!isApiUrl(url)) return realFetch(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = init?.body ?? (input instanceof Request && method !== "GET" ? await input.clone().text() : null);
    return demoApi({ url, method, headers: init?.headers ?? (input instanceof Request ? input.headers : undefined), body });
  };

  const RealXHR = window.XMLHttpRequest;
  class DemoXHR extends RealXHR {
    private demo: { method: string; url: URL } | null = null;
    private demoState = { status: 0, responseText: "", readyState: 0 };
    private demoHeaders = new Headers();
    override setRequestHeader(name: string, value: string) {
      if (this.demo) this.demoHeaders.set(name, value);
      else super.setRequestHeader(name, value);
    }
    override open(method: string, url: string | URL, ...rest: unknown[]) {
      const u = new URL(url.toString(), window.location.href);
      if (isApiUrl(u)) {
        this.demo = { method, url: u };
        return;
      }
      (super.open as (...a: unknown[]) => void)(method, url, ...rest);
    }
    override send(body?: Document | XMLHttpRequestBodyInit | null) {
      if (!this.demo) return super.send(body);
      const { method, url } = this.demo;
      const size = body instanceof FormData ? [...body.values()].reduce((n, v) => n + (v instanceof Blob ? v.size : String(v).length), 0) : 1;
      this.upload.onprogress?.call(this, new ProgressEvent("progress", { lengthComputable: true, loaded: size, total: size }));
      demoApi({ url, method, headers: this.demoHeaders, body: body as BodyInit })
        .then(async (res) => {
          this.demoState = { status: res.status, responseText: await res.text(), readyState: 4 };
          this.onreadystatechange?.(new Event("readystatechange"));
          this.onload?.(new ProgressEvent("load"));
        })
        .catch(() => this.onerror?.(new ProgressEvent("error")));
    }
    override get status() {
      return this.demo ? this.demoState.status : super.status;
    }
    override get responseText() {
      return this.demo ? this.demoState.responseText : super.responseText;
    }
    override get response() {
      return this.demo ? this.demoState.responseText : super.response;
    }
    override get readyState() {
      return this.demo ? this.demoState.readyState : super.readyState;
    }
  }
  window.XMLHttpRequest = DemoXHR as typeof XMLHttpRequest;

  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") && !a.href.includes("/api/v1/")) return;
      const url = new URL(a.getAttribute("href")!, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (isApiUrl(url)) {
        e.preventDefault();
        e.stopPropagation();
        void openApiLink(url, a.target === "_blank", navigate);
        return;
      }
      // Plain anchors with root-absolute paths ("/panel/…") must stay inside the demo folder.
      const raw = a.getAttribute("href")!;
      if (raw.startsWith("/") && BASE_PATH && !raw.startsWith(`${BASE_PATH}/`) && raw !== BASE_PATH) {
        e.preventDefault();
        navigate(toDemoPath(raw));
      }
    },
    true,
  );
}

/** GET an /api/v1 URL as a navigation: follow redirects, show or download files. */
export async function openApiLink(url: URL, newTab: boolean, navigate: (href: string) => void) {
  const win = newTab ? window.open("about:blank", "_blank") : null;
  const res = await demoApi({ url, method: "GET" });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    win?.close();
    const target = new URL(location, window.location.href);
    if (target.origin !== window.location.origin) return;
    const inside = BASE_PATH ? target.pathname === BASE_PATH || target.pathname.startsWith(`${BASE_PATH}/`) : true;
    if (inside) navigate(toDemoPath((target.pathname.slice(BASE_PATH.length) || "/") + target.search + target.hash));
    else window.location.href = target.toString();
    return;
  }
  if (!res.ok) {
    win?.close();
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    alert(j?.error?.message ?? "فایل در دسترس نیست.");
    return;
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const disposition = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ?? /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "file");
  if (disposition.startsWith("attachment")) {
    win?.close();
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = name;
    link.click();
  } else if (win) win.location.href = objectUrl;
  else window.open(objectUrl, "_blank");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
