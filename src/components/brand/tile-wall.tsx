import { cn } from "@/lib/utils";

/** Side of one tile, in CSS pixels: an eight-pointed star and the cross between four of them. */
const TILE = 96;
const R = TILE / 2;
/** Where the two squares of the star cross each other. */
const INNER = R * (Math.SQRT1_2 / Math.cos(Math.PI / 8));

const STAR = Array.from({ length: 16 }, (_, k) => {
  const radius = k % 2 === 0 ? R : INNER;
  const angle = (k * Math.PI) / 8;
  return `${(R + radius * Math.cos(angle)).toFixed(2)},${(R + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

function Layer({
  id,
  className,
  starClassName,
}: {
  id: string;
  className?: string;
  starClassName: string;
}) {
  return (
    <svg className={cn("absolute inset-0 size-full", className)}>
      <defs>
        <pattern
          id={id}
          width={TILE}
          height={TILE}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <polygon points={STAR} className={starClassName} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * A wall of Samarkand's star-and-cross tiles, drawn in the sidebar's own
 * lapis (A-192). `quiet` is the still version that sits at the foot of the
 * sidebar. The full version, behind the sign-in panel, is uncovered once when
 * the page opens; after that a band of daylight wanders over it and the tiles
 * under the pointer light up (PointerGlow sets --mx/--my on `data-glow`).
 * Decoration only: hidden from screen readers, still for people who asked
 * their device for less motion.
 */
export function TileWall({
  id,
  quiet = false,
  className,
}: {
  /** Unique on the page; the pattern is referenced by it. */
  id: string;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-glow={quiet ? undefined : ""}
      data-testid="tile-wall"
      className={cn("absolute inset-0 overflow-hidden", quiet && "pointer-events-none", className)}
    >
      <Layer
        id={`${id}-base`}
        className={quiet ? undefined : "wall-base"}
        starClassName="fill-white/[0.04] stroke-sidebar-active/25"
      />
      {!quiet && (
        <>
          <Layer
            id={`${id}-day`}
            className="wall-daylight"
            starClassName="fill-sidebar-active/15 stroke-sidebar-active/60"
          />
          <Layer
            id={`${id}-pointer`}
            className="wall-pointer"
            starClassName="fill-sidebar-active/25 stroke-sidebar-active"
          />
        </>
      )}
    </div>
  );
}
