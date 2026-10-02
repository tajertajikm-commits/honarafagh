import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `NEXT_OUTPUT=standalone` builds the self-contained server package (scripts/build-server-package.mjs).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  // `NEXT_PUBLIC_BASE_PATH=/printing-demo` serves the app under a sub-path of the domain.
  ...(basePath ? { basePath, images: { loader: "custom" as const, loaderFile: "./src/lib/image-loader.ts" } } : {}),
  typedRoutes: false,
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
