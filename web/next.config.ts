import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// cacheComponents / partialPrefetching are off on purpose: the app is a client-driven SPA over the
// Laravel API, and the locale comes from a cookie (PROJECT.md decisions, "web").
const nextConfig: NextConfig = {
  // Self-contained server bundle for the VPS (run with `node .next/standalone/server.js`).
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
