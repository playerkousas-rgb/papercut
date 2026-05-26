// 3D 模型解析器：OBJ / STL
// (GLB/GLTF/FBX 後續加，用 three-stdlib)
import type { Mesh, Vec3 } from "./types";
import { v3 } from "./math";

export function parseOBJ(text: string): Mesh {
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (!p[0]) continue;
    if (p[0] === "v") {
      vertices.push(v3(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])));
    } else if (p[0] === "f") {
      const idxs: number[] = [];
      let ok = true;
      for (let i = 1; i < p.length; i++) {
        const token = p[i].split("/")[0];
        let n = parseInt(token, 10);
        if (isNaN(n)) { ok = false; break; }
        if (n < 0) n = vertices.length + n + 1;
        idxs.push(n - 1);
      }
      if (!ok || idxs.length < 3) continue;
      // Triangulate (fan)
      for (let k = 1; k < idxs.length - 1; k++) {
        faces.push([idxs[0], idxs[k], idxs[k + 1]]);
      }
    }
  }
  return { vertices, faces };
}

export function parseSTLBinary(data: ArrayBuffer): Mesh {
  const dv = new DataView(data);
  const n = dv.getUint32(80, true);
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  let off = 84;
  for (let i = 0; i < n; i++) {
    off += 12; // skip normal
    const idx = vertices.length;
    for (let j = 0; j < 3; j++) {
      vertices.push(v3(
        dv.getFloat32(off, true),
        dv.getFloat32(off + 4, true),
        dv.getFloat32(off + 8, true),
      ));
      off += 12;
    }
    off += 2; // attribute byte count
    faces.push([idx, idx + 1, idx + 2]);
  }
  return { vertices, faces };
}

export function parseSTLAscii(text: string): Mesh {
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  const lines = text.split(/\r?\n/);
  let cur: Vec3[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("vertex")) {
      const p = t.split(/\s+/);
      cur.push(v3(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])));
    } else if (t.startsWith("endfacet")) {
      if (cur.length === 3) {
        const idx = vertices.length;
        vertices.push(cur[0], cur[1], cur[2]);
        faces.push([idx, idx + 1, idx + 2]);
      }
      cur = [];
    }
  }
  return { vertices, faces };
}

// STL 自動偵測 ASCII / Binary
export function parseSTL(data: ArrayBuffer, asText?: string): Mesh {
  const header = asText ?? new TextDecoder().decode(new Uint8Array(data, 0, Math.min(80, data.byteLength)));
  if (header.trim().toLowerCase().startsWith("solid") && data.byteLength < 1_000_000) {
    // 可能是 ASCII，但要排除「solid」開頭的 binary STL（很少見）
    try {
      const text = new TextDecoder().decode(new Uint8Array(data));
      if (text.includes("vertex") && text.includes("endfacet")) {
        return parseSTLAscii(text);
      }
    } catch { /* fall through */ }
  }
  return parseSTLBinary(data);
}

// 統一入口：傳檔名 + ArrayBuffer，回傳 Mesh
export async function parseModel(filename: string, buf: ArrayBuffer): Promise<Mesh> {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "obj") {
    return parseOBJ(new TextDecoder().decode(buf));
  }
  if (ext === "stl") {
    return parseSTL(buf);
  }
  if (ext === "glb" || ext === "gltf") {
    return await parseGLB(buf, ext);
  }
  throw new Error(`不支援的格式：.${ext}（目前支援 .obj .stl .glb .gltf）`);
}

// GLB / GLTF 用 three.js 的 loader（dynamic import 避免 SSR 問題）
async function parseGLB(buf: ArrayBuffer, ext: string): Promise<Mesh> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buf, "", (gltf) => {
      const vertices: Vec3[] = [];
      const faces: [number, number, number][] = [];
      gltf.scene.traverse((obj: any) => {
        if (obj.isMesh && obj.geometry) {
          const geo = obj.geometry.clone();
          obj.updateWorldMatrix(true, false);
          geo.applyMatrix4(obj.matrixWorld);
          const pos = geo.attributes.position;
          const idx = geo.index;
          const baseIdx = vertices.length;
          for (let i = 0; i < pos.count; i++) {
            vertices.push(v3(pos.getX(i), pos.getY(i), pos.getZ(i)));
          }
          if (idx) {
            for (let i = 0; i < idx.count; i += 3) {
              faces.push([
                baseIdx + idx.getX(i),
                baseIdx + idx.getX(i + 1),
                baseIdx + idx.getX(i + 2),
              ]);
            }
          } else {
            for (let i = 0; i < pos.count; i += 3) {
              faces.push([baseIdx + i, baseIdx + i + 1, baseIdx + i + 2]);
            }
          }
        }
      });
      if (faces.length === 0) reject(new Error("GLB 內無 mesh"));
      else resolve({ vertices, faces });
    }, (err) => reject(err));
  });
}
