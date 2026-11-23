import { createElement } from "react";

/** The web build's side of `youtube.native.tsx`: a browser embeds YouTube's player directly. */
export function YouTubePlayer({ id, title }: { id: string; title: string }) {
  return createElement("iframe", {
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`,
    title,
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    allowFullScreen: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    "data-testid": "material-youtube",
    style: { border: 0, flex: 1, width: "100%", minHeight: 0, backgroundColor: "#000" },
  });
}
