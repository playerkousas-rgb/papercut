// 共用型別
export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }

export interface Mesh {
  vertices: Vec3[];        // 頂點座標
  faces: [number, number, number][]; // 三角形 (頂點索引)
  uvs?: Vec2[];            // UV 座標 (可選)
  colors?: [number, number, number][]; // 每個面的顏色 (可選)
  textureUrl?: string;     // 貼圖 dataURL (可選)
}

export interface UnfoldedTriangle {
  faceIndex: number;       // 原始 mesh 的 face index
  p0: Vec2;                // 攤平後三個頂點
  p1: Vec2;
  p2: Vec2;
  islandId: number;        // 屬於哪一個「島」
  foldType: [number, number, number]; // 每條邊：+1 山摺、-1 谷摺、0 剪線
}

export interface Island {
  id: number;
  groupLabel: string;      // e.g. "A1", "A2", "B1"
  triangles: UnfoldedTriangle[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  width: number;
  height: number;
}

export interface EdgePair {
  faceA: number; edgeA: number;
  faceB: number; edgeB: number;
  number: number;          // 配對編號 (1, 2, 3...)
}

export interface PapercraftResult {
  islands: Island[];
  edgePairs: EdgePair[];
  stats: {
    originalFaces: number;
    decimatedFaces: number;
    mergedFaces: number;
    islandCount: number;
    edgeCutCount: number;
  };
}

export type Difficulty = "kids" | "youth" | "advanced";

export const DIFFICULTY_CONFIG: Record<Difficulty, {
  label: string;
  description: string;
  targetFaces: number;
  coplanarThreshold: number; // 角度 (弧度)，越大合併越激進
  emoji: string;
}> = {
  kids: {
    label: "小朋友",
    description: "約 30 分鐘 · 8-15 個零件",
    targetFaces: 40,
    coplanarThreshold: 0.35,  // 約 20°
    emoji: "⭐",
  },
  youth: {
    label: "青少年",
    description: "約 1 小時 · 15-25 個零件",
    targetFaces: 100,
    coplanarThreshold: 0.2,   // 約 11°
    emoji: "⭐⭐",
  },
  advanced: {
    label: "進階",
    description: "約 2-3 小時 · 30+ 個零件",
    targetFaces: 250,
    coplanarThreshold: 0.1,   // 約 5.7°
    emoji: "⭐⭐⭐",
  },
};
