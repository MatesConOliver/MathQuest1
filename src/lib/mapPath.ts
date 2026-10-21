import type { SubArea } from '@/types/game';

type Pt = { x: number; y: number };

const r = (n: number) => Math.round(n * 100) / 100;

// Builds an SVG path "d" (viewBox 0 0 100 100) through sub-area pins, in order.
// Segments without waypoints keep the original S-curve; segments with waypoints
// pass smoothly (Catmull-Rom) through every waypoint.
export function buildMapPath(sorted: SubArea[]): string {
  if (sorted.length < 2) return '';
  const pt = (s: { x?: number; y?: number }): Pt => ({ x: s.x ?? 50, y: s.y ?? 50 });

  let d = `M ${pt(sorted[0]).x} ${pt(sorted[0]).y}`;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = pt(sorted[i]);
    const p2 = pt(sorted[i + 1]);
    const wps = (sorted[i + 1].waypoints ?? []).map(pt);

    if (wps.length === 0) {
      const dx = p2.x - p1.x;
      d += ` C ${p1.x + dx * 0.45} ${p1.y} ${p1.x + dx * 0.55} ${p2.y} ${p2.x} ${p2.y}`;
      continue;
    }

    const pts: Pt[] = [p1, ...wps, p2];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[Math.max(0, j - 1)];
      const b = pts[j];
      const c = pts[j + 1];
      const e = pts[Math.min(pts.length - 1, j + 2)];
      d += ` C ${r(b.x + (c.x - a.x) / 6)} ${r(b.y + (c.y - a.y) / 6)} ${r(c.x - (e.x - b.x) / 6)} ${r(c.y - (e.y - b.y) / 6)} ${c.x} ${c.y}`;
    }
  }
  return d;
}
