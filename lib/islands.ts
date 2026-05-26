// 將 unfold 結果整理成 Island 物件 + 群組編號
import type { Island, UnfoldedTriangle, EdgePair, Mesh } from "./types";
import { buildAdjacency, edgeKey } from "./adjacency";

export function buildIslands(triangles: UnfoldedTriangle[]): Island[] {
  const map = new Map<number, UnfoldedTriangle[]>();
  for (const t of triangles) {
    if (!map.has(t.islandId)) map.set(t.islandId, []);
    map.get(t.islandId)!.push(t);
  }
  const islands: Island[] = [];
  let id = 0;
  // 按島內三角形數量由大到小排序
  const sorted = Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [, tris] of sorted) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tris) {
      for (const p of [t.p0, t.p1, t.p2]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    islands.push({
      id,
      groupLabel: labelFor(id),
      triangles: tris,
      bbox: { minX, minY, maxX, maxY },
      width: maxX - minX,
      height: maxY - minY,
    });
    id++;
  }
  return islands;
}

// 編號：A1, A2, ..., A9, B1, B2, ...
function labelFor(idx: number): string {
  const letter = String.fromCharCode(65 + Math.floor(idx / 9));
  const num = (idx % 9) + 1;
  return `${letter}${num}`;
}

// 建立邊配對：對每條「剪線」找對應的另一面
export function buildEdgePairs(
  mesh: Mesh,
  triangles: UnfoldedTriangle[],
  cutEdges: Set<string>,
): EdgePair[] {
  const { adj } = buildAdjacency(mesh);
  const seen = new Set<string>();
  const pairs: EdgePair[] = [];
  let counter = 1;
  for (const t of triangles) {
    for (let ei = 0; ei < 3; ei++) {
      const cut = cutEdges.has(`${t.faceIndex}_${ei}`);
      if (!cut) continue;
      // 找對面
      const nb = adj.get(t.faceIndex)?.get(ei);
      if (nb === undefined) continue; // boundary
      // 找 nb 的對應邊
      let ej = -1;
      const nbEdges = adj.get(nb);
      if (nbEdges) {
        nbEdges.forEach((face, e) => {
          if (face === t.faceIndex) ej = e;
        });
      }
      if (ej < 0) continue;
      // 標準化 key（避免重複）
      const key = t.faceIndex < nb
        ? `${t.faceIndex}_${ei}_${nb}_${ej}`
        : `${nb}_${ej}_${t.faceIndex}_${ei}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        faceA: t.faceIndex, edgeA: ei,
        faceB: nb, edgeB: ej,
        number: counter++,
      });
    }
  }
  return pairs;
}
