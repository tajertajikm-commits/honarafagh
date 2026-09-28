import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { themeInitScript } from "@/components/brand/theme";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const abar = localFont({
  src: [
    { path: "./fonts/AbarLow-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/AbarLow-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/AbarLow-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-abar",
  display: "swap",
  // The family has no 400: browsers resolve 400 → 500 and 600 → 700 automatically.
  adjustFontFallback: false,
  fallback: ["Segoe UI", "Tahoma", "Noto Sans Arabic", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "هنر آفاق — چاپ آنلاین", template: "%s | هنر آفاق" },
  description: "سفارش آنلاین چاپ افست و دیجیتال: کارت ویزیت، تراکت، دفترچه، کاتالوگ و استیکر با قیمت‌گذاری لحظه‌ای و پیگیری مرحله‌به‌مرحله.",
  applicationName: "هنر آفاق",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={abar.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
