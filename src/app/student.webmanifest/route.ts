import type { MetadataRoute } from "next";

/**
 * The student app's own web-app manifest (A-173): "My Kampus" on a phone's home
 * screen opens the student's sign-in and home, with the inverted mark so it sits
 * apart from the staff app's icon. Served next to /manifest.webmanifest.
 */
export const STUDENT_MANIFEST: MetadataRoute.Manifest = {
  name: "My Kampus",
  short_name: "My Kampus",
  description: "Lessons, homework and payments for students and parents",
  id: "/student",
  start_url: "/student",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f7f9fc",
  theme_color: "#17234b",
  lang: "uz",
  icons: [
    { src: "/icons/student-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/student-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icons/student-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export function GET(): Response {
  return new Response(JSON.stringify(STUDENT_MANIFEST), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
