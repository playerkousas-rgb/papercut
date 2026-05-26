// Spanning-tree 展開 + 重疊偵測 + 分島
import type { Mesh, UnfoldedTriangle, Vec2 } from "./types";
import { v2, v2Sub, v2Dist, tri3rdPoint, faceNormal, v3Sub, v3Dot, v3Len, trianglesOverlap } from "./math";
import { buildAdjacency } from "./adjacency";

export interface UnfoldResult {
  triangles: UnfoldedTriangle[];   // 每三角的攤平結果
  cutEdges: Set<string>;           // 哪些邊是「剪線」(編碼 "faceIdx_edgeIdx")
}

const cutKey = (f: number, e: number) => `${f}_${e}`;

// 從 face fi 出發做 BFS 展開，直到衝突就停下、開新島
export function unfoldMesh(mesh: Mesh): UnfoldResult {
  const { adj } = buildAdjacency(mesh);
  const n = mesh.faces.length;
  const visited = new Array<boolean>(n).fill(false);
  const triangles: UnfoldedTriangle[] = [];
  const cutEdges = new Set<string>();
  let islandId = 0;

  // 找未訪問的 seed
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;

    // 開始新島
    const islandTris: UnfoldedTriangle[] = [];
    const queue: { fi: number; pf: number; pe: number; ce: number }[] = [
      { fi: seed, pf: -1, pe: -1, ce: -1 },
    ];
    visited[seed] = true;

    // faceIndex -> {p0, p1, p2}
    const placed = new Map<number, { p0: Vec2; p1: Vec2; p2: Vec2 }>();

    while (queue.length > 0) {
      const { fi, pf, pe, ce } = queue.shift()!;
      const f = mesh.faces[fi];
      const v0 = mesh.vertices[f[0]];
      const v1 = mesh.vertices[f[1]];
      const v2v = mesh.vertices[f[2]];
      const d01 = v3Len(v3Sub(v1, v0));
      const d12 = v3Len(v3Sub(v2v, v1));
      const d20 = v3Len(v3Sub(v0, v2v));

      let p0: Vec2, p1: Vec2, p2: Vec2;

      if (pf < 0) {
        // 第一個面：自由放置
        p0 = v2(0, 0);
        p1 = v2(d01, 0);
        const [a, b] = tri3rdPoint(p0, p1, d01, d20, d12);
        p2 = a.y > 0 ? a : b;
      } else {
        // 沿著父親的邊接上
        const parent = placed.get(pf)!;
        let pa: Vec2, pb: Vec2;
        if (pe === 0) { pa = parent.p0; pb = parent.p1; }
        else if (pe === 1) { pa = parent.p1; pb = parent.p2; }
        else { pa = parent.p2; pb = parent.p0; }

        // 父面共邊頂點 順序 vs 子面共邊頂點 順序：可能反向
        const pf_face = mesh.faces[pf];
        const pA = pf_face[pe], pB = pf_face[(pe + 1) % 3];
        const cA = f[ce], cB = f[(ce + 1) % 3];

        // 比較座標決定 q0,q1 順序（共邊頂點在 3D 應該完全重合）
        const pAp = mesh.vertices[pA], pBp = mesh.vertices[pB];
        const cAp = mesh.vertices[cA], cBp = mesh.vertices[cB];
        let q0: Vec2, q1: Vec2;
        if (v3Len(v3Sub(cAp, pAp)) < 1e-3 && v3Len(v3Sub(cBp, pBp)) < 1e-3) {
          // 同向 → 共邊在外側展開，要翻轉
          q0 = pb; q1 = pa;
        } else {
          q0 = pa; q1 = pb;
        }

        // 找第三頂點
        let tv: number;
        if (ce === 0) tv = f[2];
        else if (ce === 1) tv = f[0];
        else tv = f[1];
        const tvp = mesh.vertices[tv];
        const d0 = v3Len(v3Sub(tvp, mesh.vertices[cA]));
        const d1 = v3Len(v3Sub(tvp, mesh.vertices[cB]));
        const ds = v2Dist(q0, q1);
        const [optA, optB] = tri3rdPoint(q0, q1, ds, d0, d1);

        // 選距離父面重心遠的那個（攤開方向）
        const pc = v2(
          (parent.p0.x + parent.p1.x + parent.p2.x) / 3,
          (parent.p0.y + parent.p1.y + parent.p2.y) / 3,
        );
        const p3 = v2Dist(optA, pc) > v2Dist(optB, pc) ? optA : optB;

        // 設定 p0/p1/p2 對應 face 頂點順序
        if (ce === 0) { p0 = q0; p1 = q1; p2 = p3; }
        else if (ce === 1) { p1 = q0; p2 = q1; p0 = p3; }
        else { p2 = q0; p0 = q1; p1 = p3; }
      }

      // 重疊偵測：與已放置的同島三角形檢查
      let overlap = false;
      for (const t of islandTris) {
        if (trianglesOverlap([p0, p1, p2], [t.p0, t.p1, t.p2])) {
          // 排除「共邊」鄰居（一定共享一條邊不算重疊）
          if (pf >= 0 && t.faceIndex === pf) continue;
          overlap = true;
          break;
        }
      }
      if (overlap) {
        // 不能放置此面 → 切割這條邊
        if (pf >= 0 && pe >= 0) {
          cutEdges.add(cutKey(pf, pe));
          cutEdges.add(cutKey(fi, ce));
        }
        visited[fi] = false; // 釋放，讓它成為下一個 seed
        continue;
      }

      placed.set(fi, { p0, p1, p2 });

      // 山摺/谷摺判斷
      const foldType: [number, number, number] = [0, 0, 0];
      if (pf >= 0) {
        const pn = faceNormal(mesh.vertices, mesh.faces[pf]);
        const cn = faceNormal(mesh.vertices, mesh.faces[fi]);
        const dot = Math.max(-1, Math.min(1, v3Dot(pn, cn)));
        const angle = Math.acos(dot);
        foldType[ce] = angle < Math.PI / 2 ? 1 : -1;
      }

      const tri: UnfoldedTriangle = {
        faceIndex: fi,
        p0, p1, p2,
        islandId,
        foldType,
      };
      islandTris.push(tri);
      triangles.push(tri);

      // 加入鄰居
      const neighbors = adj.get(fi);
      if (neighbors) {
        neighbors.forEach((nf, ne) => {
          if (visited[nf]) return;
          visited[nf] = true;
          // 找到子面的對應邊
          const cFace = mesh.faces[nf];
          const myEdgeKey = (() => {
            const a = mesh.faces[fi][ne], b = mesh.faces[fi][(ne + 1) % 3];
            const av = mesh.vertices[a], bv = mesh.vertices[b];
            for (let ee = 0; ee < 3; ee++) {
              const ca = cFace[ee], cb = cFace[(ee + 1) % 3];
              const cav = mesh.vertices[ca], cbv = mesh.vertices[cb];
              if ((v3Len(v3Sub(cav, av)) < 1e-3 && v3Len(v3Sub(cbv, bv)) < 1e-3) ||
                  (v3Len(v3Sub(cav, bv)) < 1e-3 && v3Len(v3Sub(cbv, av)) < 1e-3)) {
                return ee;
              }
            }
            return -1;
          })();
          if (myEdgeKey >= 0) {
            queue.push({ fi: nf, pf: fi, pe: ne, ce: myEdgeKey });
          } else {
            visited[nf] = false;
          }
        });
      }
    }

    if (islandTris.length > 0) islandId++;
  }

  return { triangles, cutEdges };
}
