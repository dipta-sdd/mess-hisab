import type { MetadataRoute } from "next";

// Installable only: no service worker, so balances are never served stale from an offline cache.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mess Hisab — মেসের হিসাব",
    short_name: "Mess Hisab",
    description: "Shared-house accounts · মেসের সবার হিসাব এক জায়গায়",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
