import Image from "next/image";

/** Screenshots are 1280×800 captures from the demo data, one set per language. */
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
        className="block h-auto w-full"
      />
      <figcaption className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
