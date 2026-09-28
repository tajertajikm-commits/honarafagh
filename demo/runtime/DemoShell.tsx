"use client";

/**
 * Static demo shell: boots the in-browser database, routes API calls to it,
 * and renders the "DEMO MODE" control panel (switch roles / customers, see
 * demo OTP codes, reset). Exists only in the static demo build.
 */
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { FlaskConical, KeyRound, LogOut, RotateCcw, Store, UserRound, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { loadCustomerActor, loadStaffActor, resolveSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { customers, employeeRoles, employees, roles, users } from "@/server/db/schema";
import { recentFakeOtps } from "@/server/integrations/sms/fake";
import { DEMO_STAFF_PASSWORD } from "@/server/seed/reference";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatPhone, toFaDigits } from "@/lib/persian";
import { type BootStage, demoReady, onBootStage, resetDemo } from "./boot";
import { BASE_PATH, readCookie } from "./cookies";
import { installInterceptors } from "./interceptors";
import { demoRefresh } from "./refresh";

type Staff = { phone: string; name: string; title: string | null; roles: string };
type Cust = { phone: string; name: string; company: string | null };

const STAGE_TEXT: Record<BootStage, string> = {
  idle: "در حال بارگذاری…",
  download: "دریافت داده‌های نمونه چاپخانه (فقط بار اول)…",
  prepare: "آماده‌سازی پایگاه داده نمایشی در مرورگر…",
  open: "بازکردن داده‌های ذخیره‌شده دمو…",
  ready: "",
  released: "",
  error: "",
};

export function DemoShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [stage, setStage] = useState<BootStage>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  useEffect(() => {
    installInterceptors((href) => router.push(href));
    const off = onBootStage((s, d) => {
      setStage(s);
      setDetail(d);
    });
    void demoReady().catch(() => {});
    return () => {
      off();
    };
  }, [router]);

  return (
    <>
      {children}
      {stage !== "ready" && <BootOverlay stage={stage} detail={detail} />}
      {stage === "ready" && <DemoPanel />}
    </>
  );
}

function BootOverlay({ stage, detail }: { stage: BootStage; detail?: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-canvas/95 px-6 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning"><FlaskConical className="size-7" /></div>
        <p className="mt-4 text-[12px] font-bold tracking-wide text-warning" dir="ltr">DEMO MODE</p>
        {stage === "released" ? (
          <>
            <p className="mt-2 text-[17px] font-bold">دمو در تب دیگری باز شد</p>
            <p className="mt-2 text-[13.5px] leading-7 text-muted">داده‌های دمو در مرورگر نگهداری می‌شوند و در هر لحظه فقط یک تب می‌تواند آن‌ها را تغییر دهد.</p>
            <button className="mt-5 h-11 rounded-lg bg-ink px-5 text-[14px] font-bold text-surface" onClick={() => window.location.reload()}>ادامه در این تب</button>
          </>
        ) : stage === "error" ? (
          <>
            <p className="mt-2 text-[17px] font-bold">راه‌اندازی دمو ممکن نشد</p>
            <p className="mt-2 break-words text-[12.5px] text-muted" dir="auto">{detail}</p>
            <p className="mt-2 text-[12.5px] leading-6 text-muted">مرورگر باید IndexedDB و WebAssembly را پشتیبانی کند (Chrome، Edge، Firefox یا Safari به‌روز؛ حالت خصوصی برخی مرورگرها پشتیبانی نمی‌کند).</p>
            <button className="mt-5 h-11 rounded-lg bg-ink px-5 text-[14px] font-bold text-surface" onClick={() => void resetDemo()}>بازنشانی و تلاش دوباره</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-[16px] font-bold">{STAGE_TEXT[stage]}</p>
            <div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-surface-3"><div className="brand-spectrum-rtl h-full w-1/2 animate-pulse rounded-full" /></div>
            <p className="mt-4 text-[12px] leading-6 text-muted">همه‌چیز در مرورگر شما اجرا می‌شود؛ سرور و پایگاه داده‌ای لازم نیست.</p>
          </>
        )}
      </div>
    </div>
  );
}

function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [otps, setOtps] = useState<{ phone: string; code: string; at: number }[]>([]);
  const [who, setWho] = useState<{ staff: string | null; customer: string | null }>({ staff: null, customer: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const db = getDb();
      const s = await db
        .select({ phone: users.phone, name: users.fullName, title: employees.title, roles: sql<string>`string_agg(${roles.name}, '، ' ORDER BY ${roles.name})` })
        .from(employees)
        .innerJoin(users, eq(users.id, employees.userId))
        .leftJoin(employeeRoles, eq(employeeRoles.employeeId, employees.id))
        .leftJoin(roles, eq(roles.id, employeeRoles.roleId))
        .where(eq(employees.isActive, true))
        .groupBy(users.phone, users.fullName, employees.title, employees.personnelCode)
        .orderBy(asc(employees.personnelCode));
      const c = await db.select({ phone: customers.phone, name: customers.fullName, company: customers.companyName }).from(customers).where(isNotNull(customers.userId)).orderBy(asc(customers.createdAt)).limit(12);
      if (!alive) return;
      setStaff(s);
      setCusts(c);
      setOtps(recentFakeOtps());
      // Same session lookup the API uses.
      const st = readCookie("ha_staff");
      const cu = readCookie("ha_session");
      const ss = st ? await resolveSession(db, st, "STAFF") : null;
      const cs = cu ? await resolveSession(db, cu, "CUSTOMER") : null;
      const sa = ss ? await loadStaffActor(db, ss.userId) : null;
      const ca = cs ? await loadCustomerActor(db, cs.userId) : null;
      if (!alive) return;
      setWho({ staff: sa ? sa.name || "کارمند" : null, customer: ca ? ca.name || "مشتری بدون نام" : null });
    })();
    const t = setInterval(() => setOtps(recentFakeOtps()), 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open]);

  const go = (path: string) => {
    // Full reload after switching identity, so no page state of the previous user survives.
    window.location.assign(new URL(`${BASE_PATH}${path}`, window.location.origin));
  };

  const loginStaff = async (phone: string) => {
    setBusy(phone);
    setMsg(null);
    try {
      await api("staff/auth/login", { body: { phone, password: DEMO_STAFF_PASSWORD } });
      go("/panel/");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "ورود ممکن نشد.");
      setBusy(null);
    }
  };

  const loginCustomer = async (phone: string) => {
    setBusy(phone);
    setMsg(null);
    try {
      // The real OTP flow: request a code from the (fake) SMS provider, then verify it.
      const r = await api<{ devCode?: string }>("auth/otp/request", { body: { phone } });
      const code = r.devCode ?? recentFakeOtps().find((o) => o.phone === phone)?.code;
      if (!code) throw new Error("کد تأیید در دسترس نیست.");
      await api("auth/otp/verify", { body: { phone, code } });
      go("/account/");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "ورود ممکن نشد.");
      setBusy(null);
    }
  };

  const logoutAll = async () => {
    await api("auth/logout", { body: {} }).catch(() => {});
    await api("staff/auth/logout", { body: {} }).catch(() => {});
    demoRefresh();
    go("/");
  };

  return (
    <div className="no-print">
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[90] flex h-10 items-center gap-2 rounded-full border border-warning/40 bg-warning-soft px-4 text-[12.5px] font-bold text-warning shadow-float hover:brightness-105"
        aria-label="پنل حالت نمایشی"
      >
        <FlaskConical className="size-4" /> <span dir="ltr">DEMO MODE</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[95] flex items-end justify-start bg-overlay/40 p-3 sm:p-4" onClick={() => setOpen(false)}>
          <div className="scrollbar-thin max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface shadow-float" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="پنل حالت نمایشی">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
              <div>
                <p className="text-[11px] font-bold text-warning" dir="ltr">DEMO MODE</p>
                <p className="text-[15px] font-bold">پنل آزمایشی</p>
              </div>
              <button className="grid size-8 place-items-center rounded-md hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="بستن"><X className="size-4" /></button>
            </div>
            <div className="space-y-5 px-5 py-4 text-[13px]">
              <p className="leading-6 text-muted">این نسخه نمایشی کاملاً در مرورگر اجرا می‌شود. داده‌ها فقط در همین مرورگر ذخیره می‌شوند؛ پیامک، درگاه بانکی و حسابداری واقعی متصل نیستند.</p>
              <div className="flex flex-wrap gap-2">
                <button className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 font-bold hover:bg-surface-2" onClick={() => go("/")}><Store className="size-4" /> فروشگاه</button>
                <button className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 font-bold hover:bg-surface-2" onClick={() => go("/account/")}><UserRound className="size-4" /> حساب مشتری</button>
                <button className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 font-bold hover:bg-surface-2" onClick={() => go("/panel/")}><Users className="size-4" /> پنل داخلی</button>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]">
                <dt className="text-muted">مشتری فعلی</dt>
                <dd className="font-bold">{who.customer ?? "—"}</dd>
                <dt className="text-muted">کارمند فعلی</dt>
                <dd className="font-bold">{who.staff ?? "—"}</dd>
              </dl>
              <p className="text-[12px] leading-6 text-muted">پرداخت: پس از «ثبت و پرداخت» درگاه آزمایشی باز می‌شود و می‌توانید پرداخت موفق، ناموفق (رد بانک) یا انصراف را شبیه‌سازی کنید؛ نتیجه روی همان سفارش ثبت می‌شود.</p>
              {msg && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger">{msg}</p>}

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 font-bold"><KeyRound className="size-4" /> آخرین کدهای تأیید (OTP) نمایشی</h3>
                {otps.length === 0 ? <p className="text-muted">هنوز کدی درخواست نشده است. در صفحه ورود، شماره موبایل دلخواه را وارد کنید.</p> : (
                  <ul className="space-y-1">
                    {otps.slice(0, 4).map((o) => (
                      <li key={o.phone} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5"><bdi dir="ltr">{formatPhone(o.phone)}</bdi><b className="tabular text-[15px]" dir="ltr">{o.code}</b></li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11.5px] text-muted">هر درخواست کد تازه می‌سازد؛ اعتبار ۲ دقیقه، حداکثر ۵ تلاش، ارسال مجدد پس از ۱ دقیقه.</p>
              </section>

              <section>
                <h3 className="mb-2 font-bold">ورود با نقش کارکنان</h3>
                <ul className="grid gap-1.5">
                  {staff.map((s) => (
                    <li key={s.phone}>
                      <button disabled={!!busy} onClick={() => void loginStaff(s.phone)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-start hover:border-line-strong hover:bg-surface-2", busy === s.phone && "opacity-60")}>
                        <span><b>{s.roles || s.title}</b><span className="block text-[11.5px] text-muted">{s.name}</span></span>
                        <bdi dir="ltr" className="text-[11.5px] text-muted">{formatPhone(s.phone)}</bdi>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11.5px] text-muted">رمز همه کارکنان نمایشی: <bdi dir="ltr">{DEMO_STAFF_PASSWORD}</bdi></p>
              </section>

              <section>
                <h3 className="mb-2 font-bold">ورود به‌عنوان مشتری نمونه</h3>
                <ul className="grid gap-1.5">
                  {custs.map((c) => (
                    <li key={c.phone}>
                      <button disabled={!!busy} onClick={() => void loginCustomer(c.phone)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-start hover:border-line-strong hover:bg-surface-2", busy === c.phone && "opacity-60")}>
                        <span><b>{c.name}</b>{c.company && <span className="block text-[11.5px] text-muted">{c.company}</span>}</span>
                        <bdi dir="ltr" className="text-[11.5px] text-muted">{formatPhone(c.phone)}</bdi>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11.5px] text-muted">مشتری جدید: در صفحه «ورود» هر شماره موبایل دیگری وارد کنید ({toFaDigits("۰۹۱۲")}…).</p>
              </section>

              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <button className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 font-bold hover:bg-surface-2" onClick={() => void logoutAll()}><LogOut className="size-4" /> خروج از همه حساب‌ها</button>
                <button
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 font-bold text-white hover:brightness-110"
                  onClick={() => {
                    if (window.confirm("همه داده‌های این دمو (سفارش‌ها، مشتریان جدید، تغییرات) پاک و داده‌های نمونه اولیه بازگردانده شود؟")) void resetDemo();
                  }}
                >
                  <RotateCcw className="size-4" /> بازنشانی دمو
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
