// A4 分頁排版（Maximal Rectangles 簡化版）
import type { Island } from "./types";

export interface PageLayout {
  pageNumber: number;
  placements: { island: Island; offsetX: number; offsetY: number }[];
}

export interface BinPackConfig {
  pageWidth: number;   // mm
  pageHeight: number;  // mm
  margin: number;      // mm
  gap: number;         // mm
  labelHeight: number; // 為標籤預留空間
}

export const A4: BinPackConfig = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 12,
  gap: 6,
  labelHeight: 8,
};

interface FreeRect { x: number; y: number; w: number; h: number }

export function binPack(
  islands: Island[],
  scale: number,
  cfg: BinPackConfig = A4,
): { pages: PageLayout[]; scale: number } {
  const usableW = cfg.pageWidth - 2 * cfg.margin;
  const usableH = cfg.pageHeight - 2 * cfg.margin;
  const pages: PageLayout[] = [];

  // 由大到小（同時考慮 label 高度）
  const items = islands.map((isl) => ({
    island: isl,
    w: isl.width * scale,
    h: isl.height * scale + cfg.labelHeight,
  })).sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  function newPage(): { freeRects: FreeRect[]; placements: PageLayout["placements"] } {
    return {
      freeRects: [{ x: 0, y: 0, w: usableW, h: usableH }],
      placements: [],
    };
  }
  let currentPage = newPage();

  function place(it: { island: Island; w: number; h: number }): boolean {
    // 找最小浪費的 rect
    let best: { rect: FreeRect; idx: number; rotated: boolean; score: number } | null = null;
    for (let i = 0; i < currentPage.freeRects.length; i++) {
      const r = currentPage.freeRects[i];
      if (it.w <= r.w && it.h <= r.h) {
        const score = Math.min(r.w - it.w, r.h - it.h);
        if (!best || score < best.score) best = { rect: r, idx: i, rotated: false, score };
      }
    }
    if (!best) return false;
    const r = best.rect;
    currentPage.placements.push({
      island: it.island,
      offsetX: r.x,
      offsetY: r.y,
    });
    // 拆分剩餘空間
    const newRects: FreeRect[] = [];
    if (r.w - it.w > cfg.gap) {
      newRects.push({ x: r.x + it.w + cfg.gap, y: r.y, w: r.w - it.w - cfg.gap, h: r.h });
    }
    if (r.h - it.h > cfg.gap) {
      newRects.push({ x: r.x, y: r.y + it.h + cfg.gap, w: it.w, h: r.h - it.h - cfg.gap });
    }
    currentPage.freeRects.splice(best.idx, 1, ...newRects);
    // 簡單修剪：移除被新 rect 完全覆蓋的
    currentPage.freeRects = currentPage.freeRects.filter((rect, i, arr) =>
      !arr.some((other, j) => i !== j &&
        other.x <= rect.x && other.y <= rect.y &&
        other.x + other.w >= rect.x + rect.w &&
        other.y + other.h >= rect.y + rect.h)
    );
    return true;
  }

  for (const it of items) {
    // 如果單一 island 大於一頁，按比例縮放（不在這層做，由上層 scale 調）
    if (it.w > usableW || it.h > usableH) {
      console.warn(`Island ${it.island.groupLabel} 太大，需縮小 scale`);
    }
    if (!place(it)) {
      pages.push({
        pageNumber: pages.length + 1,
        placements: currentPage.placements,
      });
      currentPage = newPage();
      place(it);
    }
  }
  if (currentPage.placements.length > 0) {
    pages.push({
      pageNumber: pages.length + 1,
      placements: currentPage.placements,
    });
  }
  return { pages, scale };
}

// 自動算 scale：讓最大的 island 剛好 fit 一頁
export function fitScale(islands: Island[], cfg: BinPackConfig = A4): number {
  const usableW = cfg.pageWidth - 2 * cfg.margin;
  const usableH = cfg.pageHeight - 2 * cfg.margin - cfg.labelHeight;
  let maxScale = Infinity;
  for (const isl of islands) {
    if (isl.width > 0) maxScale = Math.min(maxScale, usableW / isl.width);
    if (isl.height > 0) maxScale = Math.min(maxScale, usableH / isl.height);
  }
  // 別放太大，留一點呼吸空間
  return Math.min(maxScale * 0.95, 10); // 最多 10mm = 1 個 mesh 單位
}
