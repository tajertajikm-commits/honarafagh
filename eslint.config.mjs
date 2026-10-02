import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "storage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "demo/.build/**", "demo-dist/**", ".build-server/**", ".data/**"] },
  // The server package entry files are plain CommonJS (cPanel/Passenger startup files).
  { files: ["deploy/server/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
];

export default config;
