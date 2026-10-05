export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

const overlapArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const clampInto = (pos: Point, size: Size, area: Rect): Point => ({
  x: Math.min(Math.max(pos.x, area.x), area.x + area.width - size.width),
  y: Math.min(Math.max(pos.y, area.y), area.y + area.height - size.height),
});

/**
 * Pick where the pill should sit, in physical pixels.
 * - A saved position that overlaps a monitor is clamped fully onto it.
 * - Otherwise (first launch, or its monitor was unplugged) it goes to the
 *   bottom-center of the primary work area.
 */
export const resolvePillPosition = (
  saved: Point | null,
  size: Size,
  workAreas: Rect[],
  primary: Rect | null,
  bottomMargin = 64,
): Point => {
  if (saved) {
    const rect = { ...saved, ...size };
    let best: Rect | null = null;
    let bestOverlap = 0;
    for (const area of workAreas) {
      const overlap = overlapArea(rect, area);
      if (overlap > bestOverlap) {
        best = area;
        bestOverlap = overlap;
      }
    }
    if (best) return clampInto(saved, size, best);
  }

  const area = primary ?? workAreas[0];
  if (!area) return saved ?? { x: 0, y: 0 };
  return clampInto(
    {
      x: area.x + Math.round((area.width - size.width) / 2),
      y: area.y + area.height - size.height - bottomMargin,
    },
    size,
    area,
  );
};
