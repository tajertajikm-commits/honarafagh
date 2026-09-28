/**
 * Next.js config for the STATIC DEMO build only (copied in by demo/build.mjs).
 * Production uses the repository's next.config.ts.
 */
import path from "node:path";
import type { NextConfig } from "next";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const r = (p: string) => path.resolve(__dirname, p);

const config: NextConfig = {
  output: "export",
  basePath: base || undefined,
  trailingSlash: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  images: { loader: "custom", loaderFile: "./demo/runtime/image-loader.ts" },
  webpack(cfg, { isServer, webpack }) {
    cfg.resolve ??= {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string>),
      "@demo": r("demo/runtime"),
      // Server infrastructure → in-browser equivalents
      "@/server/config/env": r("demo/runtime/env.ts"),
      "@/server/db/client": r("demo/runtime/db-client.ts"),
      "@/server/integrations/storage": r("demo/runtime/storage.ts"),
      "server-only$": r("demo/runtime/shims/empty.ts"),
      "next/headers$": r("demo/runtime/shims/next-headers.ts"),
      "next/navigation$": r("demo/runtime/shims/next-navigation.ts"),
      "next/link$": r("demo/runtime/shims/next-link.tsx"),
      "next/server$": r("demo/runtime/shims/next-server.ts"),
    };
    if (!isServer) {
      Object.assign(cfg.resolve.alias as Record<string, string>, {
        "node:crypto": r("demo/runtime/shims/crypto.ts"),
        "crypto$": r("demo/runtime/shims/crypto.ts"),
        "node:util": r("demo/runtime/shims/misc.ts"),
        "node:buffer": "buffer",
      });
      cfg.resolve.fallback = {
        ...(cfg.resolve.fallback as Record<string, false>),
        fs: false,
        "fs/promises": false,
        path: false,
        stream: false,
        module: false,
        url: false,
        os: false,
        child_process: false,
        worker_threads: false,
        perf_hooks: false,
        "node:fs": false,
        "node:fs/promises": false,
        "node:path": false,
        "node:stream": false,
        "node:url": false,
        "node:module": false,
        "node:os": false,
      };
      cfg.plugins.push(new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }));
    }
    return cfg;
  },
};

export default config;
