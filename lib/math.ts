import type { Vec2, Vec3 } from "./types";

// 3D 向量運算
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const v3Sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const v3Add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const v3Scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const v3Dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const v3Cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const v3Len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const v3Norm = (a: Vec3): Vec3 => {
  const l = v3Len(a);
  return l > 1e-12 ? v3Scale(a, 1 / l) : v3(0, 0, 0);
};
export const v3Dist = (a: Vec3, b: Vec3): number => v3Len(v3Sub(a, b));

// 2D 向量運算
export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const v2Sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const v2Add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const v2Scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const v2Len = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const v2Dist = (a: Vec2, b: Vec2): number => v2Len(v2Sub(a, b));

// 面法向量
export function faceNormal(verts: Vec3[], face: [number, number, number]): Vec3 {
  const a = verts[face[0]];
  const b = verts[face[1]];
  const c = verts[face[2]];
  return v3Norm(v3Cross(v3Sub(b, a), v3Sub(c, a)));
}

// 三角形第 3 頂點在 2D 平面的位置
// 給定 2D 邊 (p0, p1)，邊長 ds，第三頂點到 p0 距離 d0、到 p1 距離 d1
// 返回兩個可能的位置（在邊的兩側）
export function tri3rdPoint(
  p0: Vec2, p1: Vec2, ds: number, d0: number, d1: number
): [Vec2, Vec2] {
  if (ds < 1e-9) return [v2(p0.x, p0.y + d0), v2(p0.x, p0.y - d0)];
  let x = (ds * ds + d0 * d0 - d1 * d1) / (2 * ds);
  x = Math.max(-d0, Math.min(d0, x));
  const y = Math.sqrt(Math.max(0, d0 * d0 - x * x));
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const s = 1 / ds;
  const rx = dx * s, ry = dy * s;
  const px = -ry, py = rx;
  return [
    v2(p0.x + rx * x + px * y, p0.y + ry * x + py * y),
    v2(p0.x + rx * x - px * y, p0.y + ry * x - py * y),
  ];
}

// 兩三角形重疊偵測（粗略：bbox + SAT）
export function trianglesOverlap(
  a: [Vec2, Vec2, Vec2], b: [Vec2, Vec2, Vec2]
): boolean {
  // 快速 AABB 預檢
  const ax = [a[0].x, a[1].x, a[2].x];
  const ay = [a[0].y, a[1].y, a[2].y];
  const bx = [b[0].x, b[1].x, b[2].x];
  const by = [b[0].y, b[1].y, b[2].y];
  if (Math.max(...ax) < Math.min(...bx) - 1e-6) return false;
  if (Math.min(...ax) > Math.max(...bx) + 1e-6) return false;
  if (Math.max(...ay) < Math.min(...by) - 1e-6) return false;
  if (Math.min(...ay) > Math.max(...by) + 1e-6) return false;
  // SAT
  for (const tri of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const nx = -(tri[j].y - tri[i].y);
      const ny = tri[j].x - tri[i].x;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const p of a) { const v = p.x * nx + p.y * ny; amin = Math.min(amin, v); amax = Math.max(amax, v); }
      for (const p of b) { const v = p.x * nx + p.y * ny; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
      if (amax < bmin - 1e-6 || bmax < amin - 1e-6) return false;
    }
  }
  return true;
}
