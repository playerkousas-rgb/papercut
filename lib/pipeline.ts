// 完整管線：上傳 → 解析 → 減面 → 展開 → 排版 → PDF
import { parseModel } from "./parsers";
import { decimate } from "./decimate";
import { unfoldMesh } from "./unfold";
import { buildIslands, buildEdgePairs } from "./islands";
import { binPack, fitScale, A4 } from "./binpack";
import { buildPDF } from "./pdfBuilder";
import { DIFFICULTY_CONFIG, type Difficulty, type PapercraftResult, type Mesh } from "./types";

export interface PipelineProgress {
  stage: "parse" | "decimate" | "unfold" | "layout" | "pdf" | "done";
  progress: number;
  message: string;
}

export interface PipelineOptions {
  title: string;
  difficulty: Difficulty;
  thumbnailDataUrl?: string;
  onProgress?: (p: PipelineProgress) => void;
}

export interface PipelineResult {
  mesh: Mesh;            // 處理後的 mesh
  papercraft: PapercraftResult;
  pdf: Uint8Array;
  pdfBlob: Blob;
}

export async function runPipeline(
  filename: string,
  buffer: ArrayBuffer,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  const cfg = DIFFICULTY_CONFIG[opts.difficulty];
  const report = (stage: PipelineProgress["stage"], progress: number, message: string) =>
    opts.onProgress?.({ stage, progress, message });

  // 1. 解析
  report("parse", 0.05, "解析 3D 模型中...");
  let mesh = await parseModel(filename, buffer);
  const originalFaces = mesh.faces.length;
  if (originalFaces === 0) throw new Error("模型沒有任何面");

  // 2. 減面
  report("decimate", 0.2, `減面中 (${originalFaces} → ${cfg.targetFaces})...`);
  if (mesh.faces.length > cfg.targetFaces) {
    mesh = await decimate(mesh, cfg.targetFaces);
  }
  const decimatedFaces = mesh.faces.length;

  // 3. 展開
  report("unfold", 0.45, "計算展開圖中...");
  const { triangles, cutEdges } = unfoldMesh(mesh);
  const islands = buildIslands(triangles);
  const edgePairs = buildEdgePairs(mesh, triangles, cutEdges);

  const papercraft: PapercraftResult = {
    islands, edgePairs,
    stats: {
      originalFaces,
      decimatedFaces,
      mergedFaces: decimatedFaces,
      islandCount: islands.length,
      edgeCutCount: edgePairs.length,
    },
  };

  // 4. 排版
  report("layout", 0.7, "計算 A4 排版...");
  const scale = fitScale(islands, A4);
  const { pages } = binPack(islands, scale, A4);

  // 5. PDF
  report("pdf", 0.85, `生成 PDF (共 ${pages.length + 3} 頁)...`);
  const pdf = await buildPDF({
    title: opts.title,
    difficulty: cfg.label,
    difficultyEmoji: cfg.emoji,
    estimatedTime: cfg.description,
    result: papercraft,
    pages,
    scale,
    thumbnailDataUrl: opts.thumbnailDataUrl,
  });

  report("done", 1.0, "完成！");
  return {
    mesh,
    papercraft,
    pdf,
    pdfBlob: new Blob([pdf as BlobPart], { type: "application/pdf" }),
  };
}
