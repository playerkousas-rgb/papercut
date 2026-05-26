// 建立 mesh 鄰接關係（哪些面共邊）
import type { Mesh, Vec3 } from "./types";

const EPS = 1e-4;
function vkey(v: Vec3): string {
  return `${Math.round(v.x / EPS)}_${Math.round(v.y / EPS)}_${Math.round(v.z / EPS)}`;
}
export function edgeKey(verts: Vec3[], a: number, b: number): string {
  const ka = vkey(verts[a]);
  const kb = vkey(verts[b]);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export interface Adjacency {
  // faceIndex -> { edgeIndex(0/1/2) -> neighbor faceIndex }
  adj: Map<number, Map<number, number>>;
  // edgeKey -> [{faceIndex, edgeIndex}, ...]
  edgeMap: Map<string, { face: number; edge: number }[]>;
}

export function buildAdjacency(mesh: Mesh): Adjacency {
  const edgeMap = new Map<string, { face: number; edge: number }[]>();
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    for (let ei = 0; ei < 3; ei++) {
      const a = f[ei], b = f[(ei + 1) % 3];
      const k = edgeKey(mesh.vertices, a, b);
      if (!edgeMap.has(k)) edgeMap.set(k, []);
      edgeMap.get(k)!.push({ face: fi, edge: ei });
    }
  }
  const adj = new Map<number, Map<number, number>>();
  edgeMap.forEach((entries) => {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const A = entries[i], B = entries[j];
        if (!adj.has(A.face)) adj.set(A.face, new Map());
        if (!adj.has(B.face)) adj.set(B.face, new Map());
        adj.get(A.face)!.set(A.edge, B.face);
        adj.get(B.face)!.set(B.edge, A.face);
      }
    }
  });
  return { adj, edgeMap };
}
