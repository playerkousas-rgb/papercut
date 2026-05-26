// 3D 模型解析器：OBJ / STL / GLB / GLTF
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
  // sanity check
  const expectedSize = 84 + n * 50;
  if (n > 50_000_000 || expectedSize > data.byteLength + 1000) {
    throw new Error(`STL 檔頭聲稱有 ${n} 個三角形，但檔案大小不匹配（可能格式錯誤）`);
  }
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  let off = 84;
  for (let i = 0; i < n; i++) {
    if (off + 50 > data.byteLength) break;
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
    off += 2;
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

export function parseSTL(data: ArrayBuffer): Mesh {
  // 自動偵測 ASCII vs Binary
  // 判斷方法：binary STL 檔頭是 80 byte，然後 4 byte uint32 是三角形數
  // 如果這個數字與檔案大小匹配 (84 + n*50)，就是 binary
  if (data.byteLength >= 84) {
    const dv = new DataView(data);
    const n = dv.getUint32(80, true);
    const expectedSize = 84 + n * 50;
    if (Math.abs(expectedSize - data.byteLength) < 100) {
      return parseSTLBinary(data);
    }
  }
  // 否則當 ASCII
  const text = new TextDecoder().decode(data);
  return parseSTLAscii(text);
}

// 合併重複頂點（STL/某些 OBJ 會有大量重複頂點，必須合併才能建立鄰接關係）
export function weldVertices(mesh: Mesh, epsilon = 1e-4): Mesh {
  const map = new Map<string, number>();
  const newVerts: Vec3[] = [];
  const indexMap = new Array<number>(mesh.vertices.length);

  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const key = `${Math.round(v.x / epsilon)}_${Math.round(v.y / epsilon)}_${Math.round(v.z / epsilon)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = newVerts.length;
      newVerts.push(v);
      map.set(key, idx);
    }
    indexMap[i] = idx;
  }

  const newFaces: [number, number, number][] = [];
  for (const f of mesh.faces) {
    const a = indexMap[f[0]], b = indexMap[f[1]], c = indexMap[f[2]];
    // 跳過退化三角形
    if (a !== b && b !== c && a !== c) {
      newFaces.push([a, b, c]);
    }
  }

  return { vertices: newVerts, faces: newFaces };
}

// 統一入口
export async function parseModel(filename: string, buf: ArrayBuffer): Promise<Mesh> {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  let mesh: Mesh;
  if (ext === "obj") {
    mesh = parseOBJ(new TextDecoder().decode(buf));
  } else if (ext === "stl") {
    mesh = parseSTL(buf);
  } else if (ext === "glb" || ext === "gltf") {
    mesh = await parseGLB(buf);
  } else {
    throw new Error(`不支援的格式：.${ext}（目前支援 .obj .stl .glb .gltf）`);
  }
  // STL 必定要 weld（每個三角形是獨立 3 個頂點），OBJ/GLB 通常已 weld
  return weldVertices(mesh);
}

async function parseGLB(buf: ArrayBuffer): Promise<Mesh> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buf, "", (gltf) => {
      const vertices: Vec3[] = [];
      const faces: [number, number, number][] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((obj: any) => {
        if (obj.isMesh && obj.geometry) {
          const geo = obj.geometry.clone();
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
    }, (err) => reject(err instanceof Error ? err : new Error("GLB 解析失敗")));
  });
}
