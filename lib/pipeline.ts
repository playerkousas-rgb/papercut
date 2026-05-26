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
  mesh: Mesh;
  papercraft: PapercraftResult;
  pdf: Uint8Array;
  pdfBlob: Blob;
}

// 安全上限：超過這個面數會強制先猛減面再 unfold
const MAX_PRE_UNFOLD_FACES = 500;

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
  await sleep(10); // yield to UI
  let mesh = await parseModel(filename, buffer);
  const originalFaces = mesh.faces.length;
  if (originalFaces === 0) throw new Error("模型沒有任何面");

  // 2. 減面：嚴格控制在 targetFaces 以內，避免 unfold 卡住
  const targetFaces = Math.min(cfg.targetFaces, MAX_PRE_UNFOLD_FACES);
  if (mesh.faces.length > targetFaces) {
    report("decimate", 0.15, `減面中 (${originalFaces.toLocaleString()} → ${targetFaces})...`);
    await sleep(10);
    try {
      mesh = await decimate(mesh, targetFaces);
    } catch (e) {
      console.error("[Pipeline] Decimate failed:", e);
      throw new Error(`減面失敗：${e instanceof Error ? e.message : String(e)}`);
    }
    // 再次檢查：如果 meshoptimizer 因鎖邊界減不到目標，要警告
    if (mesh.faces.length > targetFaces * 1.5) {
      console.warn(`[Pipeline] Decimate stuck at ${mesh.faces.length} faces (target ${targetFaces})`);
    }
  }
  const decimatedFaces = mesh.faces.length;
  if (decimatedFaces === 0) throw new Error("減面後沒有任何面");

  // 3. 展開
  report("unfold", 0.45, `計算展開圖 (${decimatedFaces} 面)...`);
  await sleep(10);
  let triangles, cutEdges;
  try {
    const result = unfoldMesh(mesh);
    triangles = result.triangles;
    cutEdges = result.cutEdges;
  } catch (e) {
    console.error("[Pipeline] Unfold failed:", e);
    throw new Error(`展開失敗：${e instanceof Error ? e.message : String(e)}`);
  }
  if (triangles.length === 0) throw new Error("展開後沒有任何面，模型可能有問題");

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
  await sleep(10);
  const scale = fitScale(islands, A4);
  const { pages } = binPack(islands, scale, A4);

  // 5. PDF
  report("pdf", 0.85, `生成 PDF (共 ${pages.length + 3} 頁)...`);
  await sleep(10);
  let pdf: Uint8Array;
  try {
    pdf = await buildPDF({
      title: opts.title,
      difficulty: cfg.label,
      difficultyEmoji: cfg.emoji,
      estimatedTime: cfg.description,
      result: papercraft,
      pages,
      scale,
      thumbnailDataUrl: opts.thumbnailDataUrl,
    });
  } catch (e) {
    console.error("[Pipeline] PDF gen failed:", e);
    throw new Error(`PDF 生成失敗：${e instanceof Error ? e.message : String(e)}`);
  }

  report("done", 1.0, "完成！");
  return {
    mesh,
    papercraft,
    pdf,
    pdfBlob: new Blob([pdf as BlobPart], { type: "application/pdf" }),
  };
}

// 讓出 event loop（避免 UI 卡死）
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
