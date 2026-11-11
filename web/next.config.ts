import type { NextConfig } from "next";

// A pure client-side app over the Laravel API: no server rendering anywhere. `next build` writes
// plain files to out/; the web server answers every path with out/index.html and the browser's
// router (src/spa) draws the page. scripts/build-sw.mjs then adds the offline service worker.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
