import type { SubArea } from '@/types/game';

type Pt = { x: number; y: number };

const r = (n: number) => Math.round(n * 100) / 100;

function buildSegment(p1: Pt, p2: Pt, waypoints: Pt[] = []): string {
  let seg = `M ${r(p1.x)} ${r(p1.y)}`;
  if (waypoints.length === 0) {
    const dx = p2.x - p1.x;
    seg += ` C ${r(p1.x + dx * 0.45)} ${r(p1.y)} ${r(p1.x + dx * 0.55)} ${r(p2.y)} ${r(p2.x)} ${r(p2.y)}`;
  } else {
    const pts: Pt[] = [p1, ...waypoints, p2];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[Math.max(0, j - 1)];
      const b = pts[j];
      const c = pts[j + 1];
      const e = pts[Math.min(pts.length - 1, j + 2)];
      seg += ` C ${r(b.x + (c.x - a.x) / 6)} ${r(b.y + (c.y - a.y) / 6)} ${r(c.x - (e.x - b.x) / 6)} ${r(c.y - (e.y - b.y) / 6)} ${r(c.x)} ${r(c.y)}`;
    }
  }
  return seg;
}

// Builds an SVG path "d" (viewBox 0 0 100 100) through sub-area pins.
// If sub-areas define `previousSubAreaIds` (array of parent IDs), those links take preference.
// Otherwise, adjacent sub-areas in `order` are linked sequentially.
export function buildMapPath(subAreas: SubArea[]): string {
  if (subAreas.length < 2) return '';
  const pt = (s: { x?: number; y?: number }): Pt => ({ x: s.x ?? 50, y: s.y ?? 50 });

  const sorted = [...subAreas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const subAreaMap = new Map<string, SubArea>();
  sorted.forEach((sa) => {
    if (sa.id) subAreaMap.set(sa.id, sa);
  });

  const segments: string[] = [];
  const linkedEdges = new Set<string>();

  sorted.forEach((curr, index) => {
    const currWaypoints = (curr.waypoints ?? []).map(pt);
    const hasExplicitLinks = Array.isArray(curr.previousSubAreaIds) && curr.previousSubAreaIds.length > 0;

    if (hasExplicitLinks) {
      curr.previousSubAreaIds!.forEach((prevId) => {
        if (!prevId || prevId === curr.id) return;
        const prev = subAreaMap.get(prevId);
        if (!prev) return;
        const edgeKey = `${prev.id}->${curr.id}`;
        if (linkedEdges.has(edgeKey)) return;
        linkedEdges.add(edgeKey);
        segments.push(buildSegment(pt(prev), pt(curr), currWaypoints));
      });
    } else if (index > 0) {
      // Fallback: connect from previous in sorted order
      const prev = sorted[index - 1];
      const edgeKey = `${prev.id}->${curr.id}`;
      if (!linkedEdges.has(edgeKey)) {
        linkedEdges.add(edgeKey);
        segments.push(buildSegment(pt(prev), pt(curr), currWaypoints));
      }
    }
  });

  return segments.join(' ');
}

