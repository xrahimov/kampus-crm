import type { MetadataRoute } from "next";

/**
 * Web-app manifest (A-113): lets a phone keep Kampus on its home screen and
 * open it full-screen like an app. Colours are the lapis sidebar and the
 * porcelain background from globals.css.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kampus",
    short_name: "Kampus",
    description: "Learning center CRM",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f9fc",
    theme_color: "#17234b",
    lang: "uz",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
