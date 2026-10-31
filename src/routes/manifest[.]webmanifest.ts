import { createFileRoute } from "@tanstack/react-router";

const MANIFEST = {
  name: "Looktag",
  short_name: "Looktag",
  start_url: "/",
  display: "standalone",
  background_color: "#F4F4F4",
  theme_color: "#F4F4F4",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
};

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(MANIFEST), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
