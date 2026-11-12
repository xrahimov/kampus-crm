import Image from "next/image";

/**
 * Screenshots are captures from the demo data, one set per language: most are
 * a 1280×800 page, some a single card or a phone screen. Each is shown at its
 * own size, never stretched, and a tall one is held to a readable height.
 */
export const SCREENSHOT_WIDTH = 1280;
export const SCREENSHOT_HEIGHT = 800;

export function screenshotSrc(locale: string, name: string): string {
  return `/help/${locale}/${name}.jpg`;
}

export function HelpScreenshot({
  locale,
  name,
  caption,
}: {
  locale: string;
  name: string;
  caption: string;
}) {
  return (
    <figure className="my-4 overflow-hidden rounded-lg border bg-card shadow-sm">
      <Image
        src={screenshotSrc(locale, name)}
        alt={caption}
        width={SCREENSHOT_WIDTH}
        height={SCREENSHOT_HEIGHT}
        unoptimized
        className="mx-auto block h-auto max-h-[40rem] w-auto max-w-full"
      />
      <figcaption className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
