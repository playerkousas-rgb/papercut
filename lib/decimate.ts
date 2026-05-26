// 減面：用 meshoptimizer WASM
import type { Mesh } from "./types";
import { v3 } from "./math";

export async function decimate(mesh: Mesh, targetFaces: number): Promise<Mesh> {
  if (mesh.faces.length <= targetFaces) return mesh;

  const { MeshoptSimplifier } = await import("meshoptimizer");
  await MeshoptSimplifier.ready;

  // 攤平 vertex 陣列到 Float32Array
  const positions = new Float32Array(mesh.vertices.length * 3);
  for (let i = 0; i < mesh.vertices.length; i++) {
    positions[i * 3] = mesh.vertices[i].x;
    positions[i * 3 + 1] = mesh.vertices[i].y;
    positions[i * 3 + 2] = mesh.vertices[i].z;
  }

  // 索引陣列
  const indices = new Uint32Array(mesh.faces.length * 3);
  for (let i = 0; i < mesh.faces.length; i++) {
    indices[i * 3] = mesh.faces[i][0];
    indices[i * 3 + 1] = mesh.faces[i][1];
    indices[i * 3 + 2] = mesh.faces[i][2];
  }

  const targetIndexCount = targetFaces * 3;
  const targetError = 0.05;
  const [simplifiedIndices /*, error */] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3,
    targetIndexCount,
    targetError,
    ["LockBorder"],
  );

  // 重新 compact
  const [remap, vertexCount] = MeshoptSimplifier.compactMesh(simplifiedIndices);
  const newVertices = new Array(vertexCount).fill(null).map(() => v3(0, 0, 0));
  for (let i = 0; i < mesh.vertices.length; i++) {
    const dst = remap[i];
    if (dst < vertexCount) {
      newVertices[dst] = mesh.vertices[i];
    }
  }
  const newFaces: [number, number, number][] = [];
  for (let i = 0; i < simplifiedIndices.length; i += 3) {
    const a = simplifiedIndices[i], b = simplifiedIndices[i + 1], c = simplifiedIndices[i + 2];
    if (a !== b && b !== c && a !== c) {
      newFaces.push([a, b, c]);
    }
  }
  return { vertices: newVertices, faces: newFaces };
}
